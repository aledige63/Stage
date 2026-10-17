import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { currentEngine } from '../engine/Engine';
import { evaluate } from '../engine/interpolation';
import { handheldShake } from '../engine/handheld';
import { store, type Aspect, type CameraState } from '../store';
import { t } from '../i18n';

export type Resolution = 720 | 1080;

export function exportSize(aspect: Aspect, res: Resolution): [number, number] {
  const long = res === 720 ? 1280 : 1920;
  return aspect === '16:9' ? [long, res] : [res, long];
}

export const videoSupported = () => 'VideoEncoder' in window;

async function pickEncoderConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig | null> {
  const bitrate = width * height > 1e6 ? 12e6 : 6e6;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42002a']) {
    const config: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
    const { supported } = await VideoEncoder.isConfigSupported(config);
    if (supported) return config;
  }
  return null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Traccia audio muta: alcuni campionatori (es. nodi che collegano audio e video)
// richiedono che il file abbia una traccia audio.
const AUDIO_RATE = 48000;
const AUDIO_CHANNELS = 2;

async function pickAudioConfig(): Promise<{ config: AudioEncoderConfig; codec: 'aac' | 'opus' } | null> {
  if (!('AudioEncoder' in window)) return null;
  const candidates: [string, 'aac' | 'opus'][] = [['mp4a.40.2', 'aac'], ['opus', 'opus']];
  for (const [codec, muxCodec] of candidates) {
    const config: AudioEncoderConfig = { codec, sampleRate: AUDIO_RATE, numberOfChannels: AUDIO_CHANNELS, bitrate: 128000 };
    const { supported } = await AudioEncoder.isConfigSupported(config);
    if (supported) return { config, codec: muxCodec };
  }
  return null;
}

/** Codifica `seconds` di silenzio e li consegna al muxer. */
async function encodeSilence(config: AudioEncoderConfig, seconds: number, onChunk: (c: EncodedAudioChunk, m?: EncodedAudioChunkMetadata) => void) {
  let error: Error | null = null;
  const encoder = new AudioEncoder({ output: onChunk, error: e => { error = e; } });
  encoder.configure(config);
  const totalFrames = Math.round(seconds * AUDIO_RATE);
  const block = 1024;
  const silence = new Float32Array(block * AUDIO_CHANNELS);
  try {
    for (let pos = 0; pos < totalFrames; pos += block) {
      const n = Math.min(block, totalFrames - pos);
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: AUDIO_RATE,
        numberOfFrames: n,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: Math.round((pos / AUDIO_RATE) * 1e6),
        data: n === block ? silence : new Float32Array(n * AUDIO_CHANNELS),
      });
      encoder.encode(data);
      data.close();
    }
    await encoder.flush();
    if (error) throw error;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

/**
 * Crea l'MP4 della timeline fotogramma per fotogramma: il risultato non dipende
 * dalla velocità del computer. Il primo fotogramma è il primo keyframe, l'ultimo la fine.
 */
export async function exportVideo(opts: {
  res: Resolution;
  /** aggiunge una traccia audio muta (AAC stereo 48 kHz) */
  silentAudio: boolean;
  onProgress: (p: number) => void;
  signal: AbortSignal;
}): Promise<Blob> {
  const engine = currentEngine;
  if (!engine) throw new Error(t('err.sceneNotReady'));
  const s = store.getState();
  const [width, height] = exportSize(s.aspect, opts.res);
  const fps = s.fps;
  const total = Math.max(2, Math.round(s.duration * fps));
  const cameraAt = (t: number): CameraState => (s.keyframes.length ? evaluate(s.keyframes, t) : s.camera);

  const config = await pickEncoderConfig(width, height, fps);
  if (!config) throw new Error(t('err.h264', { w: width, h: height }));

  const audio = opts.silentAudio ? await pickAudioConfig() : null;
  if (opts.silentAudio && !audio) throw new Error(t('err.noAudio'));

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: audio ? { codec: audio.codec, sampleRate: AUDIO_RATE, numberOfChannels: AUDIO_CHANNELS } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  // l'audio dura esattamente quanto il video
  if (audio) await encodeSilence(audio.config, total / fps, (chunk, meta) => muxer.addAudioChunk(chunk, meta));
  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { encodeError = e; },
  });
  encoder.configure(config);

  const frames = engine.createFrameRenderer(width, height);
  engine.suspended = true;
  try {
    const frameDur = 1e6 / fps;
    for (let i = 0; i < total; i++) {
      if (opts.signal.aborted) throw new DOMException('Export annullato', 'AbortError');
      if (encodeError) throw encodeError;
      const t = (i / (total - 1)) * s.duration;
      frames.render(cameraAt(t), handheldShake(s.handheld, t));
      const frame = new VideoFrame(frames.canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
      encoder.encode(frame, { keyFrame: i % fps === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await sleep(2);
      if (i % 3 === 0) {
        opts.onProgress((i + 1) / total);
        await sleep(0);
      }
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
    opts.onProgress(1);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    frames.dispose();
    engine.suspended = false;
  }
}
