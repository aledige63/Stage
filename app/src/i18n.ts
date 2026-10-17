import { setState, store, useApp, type Lang, type SceneObject } from './store';

// Testi dell'interfaccia. L'italiano è la lingua di riferimento: ogni chiave
// deve esistere anche in inglese (il compilatore lo verifica).

const it = {
  'lang.label': 'Lingua',

  // viste
  'shot.title': 'Vista camera',
  'shot.hint': 'Sinistro: orbita · Destro: pan/tilt · Centrale: truck/pedestal · Rotella: dolly · Shift+rotella: zoom · Ctrl+rotella: crane · Clic qui per usare la tastiera',
  'dir.title': 'Vista regia',
  'dir.hint': 'Trascina: ruota la vista · Destro: sposta · Rotella: avvicina · Clic su un oggetto: seleziona',

  // formato e overlay
  'fmt.title': 'Formato',
  'overlay.thirds': 'Overlay terzi',
  'overlay.center': 'Croce centrale',
  'overlay.safe': 'Aree di sicurezza',
  'overlay.note': 'Gli overlay si vedono solo in anteprima, non nel video esportato.',
  'safe.action': 'Azione 93%',
  'safe.title': 'Titoli 90%',

  // camera
  'cam.title': 'Camera',
  'cam.focal': 'Focale',
  'cam.focalShort': 'Focale',
  'cam.distance': 'Distanza',
  'cam.height': 'Altezza',
  'cam.roll': 'Roll',
  'cam.speed': 'Velocità',
  'cam.frame': 'Inquadra il manichino',
  'frame.full': 'Figura intera',
  'frame.medium': 'Mezza figura',
  'frame.close': 'Primo piano',
  'cam.reset': 'Ripristina camera',
  'cam.note': 'Tieni premuto Shift per muoverti più veloce con la tastiera, o per movimenti fini col mouse.',
  'move.orbitAz': 'Orbit',
  'move.orbitEl': 'Orbit alto/basso',
  'move.dolly': 'Dolly / push',
  'move.truck': 'Truck',
  'move.pedestal': 'Pedestal',
  'move.crane': 'Crane',
  'move.pan': 'Pan',
  'move.tilt': 'Tilt',
  'move.roll': 'Roll',
  'move.zoom': 'Zoom',

  // camera a mano
  'hh.title': 'Camera a mano',
  'hh.enable': 'Attiva tremolio camera a mano',
  'hh.intensity': 'Intensità',
  'hh.frequency': 'Frequenza',
  'hh.slow': 'lenta',
  'hh.natural': 'naturale',
  'hh.nervous': 'nervosa',
  'hh.variant': 'Nuova variante del tremolio ({n})',
  'hh.note': 'Il tremolio segue la timeline: premi Spazio per vederlo. Anteprima ed export sono identici.',

  // scena e oggetti
  'scene.title': 'Scena',
  'scene.add': 'Aggiungi',
  'scene.selectHint': 'Seleziona un oggetto dalla lista o con un clic nella vista regia.',
  'kind.manichino': 'Manichino',
  'kind.cubo': 'Cubo',
  'kind.sfera': 'Sfera',
  'kind.cilindro': 'Cilindro',
  'kind.pannello': 'Pannello',
  'gizmo.translate': 'Sposta',
  'gizmo.rotate': 'Ruota',
  'gizmo.scale': 'Scala',
  'obj.position': 'Posizione (m)',
  'obj.rotation': 'Rotazione (°)',
  'obj.scale': 'Scala',
  'obj.tone': 'Tono di grigio',
  'obj.delete': 'Elimina oggetto',

  // stile
  'style.title': 'Stile video guida',
  'style.floor': 'Pavimento',
  'grid.marcata': 'Griglia marcata',
  'grid.leggera': 'Leggera',
  'grid.scacchiera': 'Scacchiera',
  'style.bg': 'Sfondo',
  'bg.chiaro': 'Chiaro',
  'bg.medio': 'Medio',
  'bg.scuro': 'Scuro',
  'style.mann': 'Manichino',
  'mann.grigio': 'Grigio',
  'mann.bianco': 'Bianco',
  'mann.arancio': 'Arancio',
  'style.refs': 'Colonne di riferimento sullo sfondo',

  // timeline
  'tl.start': 'Inizio (Home)',
  'tl.prevKey': 'Keyframe precedente (PagSu)',
  'tl.play': 'Play / pausa (Spazio)',
  'tl.nextKey': 'Keyframe successivo (PagGiù)',
  'tl.frame': 'fot.',
  'tl.keyTitle': 'Salva la camera attuale come keyframe (Invio)',
  'tl.dirty': 'Camera modificata: premi ◆ o Invio per salvarla',
  'tl.preset': 'Preset',
  'tl.choose': 'Scegli…',
  'tl.duration': 'Durata',
  'tl.loop': 'Loop',
  'tl.clear': 'Svuota',
  'tl.clearConfirm': 'Eliminare tutti i keyframe?',
  'tl.hintKeys': 'Clicca un keyframe ◆ o un tratto per modificarne curva e percorso. Trascina i keyframe per cambiarne il tempo.',
  'tl.hintEmpty': 'Posiziona la camera, porta la testina al tempo voluto e premi ◆ Keyframe (Invio). Servono almeno due keyframe, oppure scegli un preset.',
  'tl.lastKey': 'Ultimo keyframe: la curva si imposta sul keyframe di partenza di ogni tratto.',
  'tl.curve': 'Curva',
  'tl.path': 'Percorso',
  'tl.arc': 'Arco',
  'tl.arcTitle': 'Gira attorno al soggetto (orbite)',
  'tl.linear': 'Lineare',
  'tl.linearTitle': 'Linea retta (dolly, truck, crane)',
  'tl.update': 'Aggiorna con camera attuale',
  'tl.updateTitle': 'Sostituisce questo keyframe con la camera attuale',
  'tl.delete': 'Elimina',
  'tl.dragKey': 'Keyframe {t} s — trascina per spostarlo',
  'tl.segArc': 'arco',
  'tl.segLinear': 'lineare',
  'preset.orbita90': 'Orbita 90°',
  'preset.orbita180': 'Orbita 180°',
  'preset.push': 'Push-in',
  'preset.pull': 'Pull-out',
  'preset.crane': 'Crane reveal',
  'preset.arcpush': 'Arc shot + push',
  'preset.truck': 'Carrello laterale',
  'preset.zoom': 'Zoom in',

  // progetto
  'project.defaultName': 'Nuovo movimento',
  'pb.nameAria': 'Nome del progetto',
  'pb.new': 'Nuovo',
  'pb.newConfirm': 'Iniziare un nuovo progetto? Le modifiche non salvate in un file andranno perse.',
  'pb.open': 'Apri…',
  'pb.save': 'Salva…',
  'pb.saved': 'Progetto salvato',
  'pb.opened': 'Progetto aperto',
  'pb.openError': 'Impossibile aprire il progetto: {msg}',
  'pb.export': 'Esporta…',
  'file.project': 'Progetto Stage',
  'file.video': 'Video MP4',
  'file.text': 'Testo',
  'err.notProject': 'Il file non è un progetto Stage',
  'err.newerVersion': 'Il progetto è stato creato con una versione più recente di Stage',
  'err.noMannequin': 'Progetto incompleto: manca il manichino',
  'err.noKeyframes': 'Progetto incompleto: mancano i keyframe',
  'err.badObject': 'Oggetto non valido: {name}',
  'err.badKeyframe': 'Keyframe non valido',

  // export
  'ex.title': 'Esporta per MiniMax H3',
  'ex.close': 'Chiudi',
  'ex.video': 'Video guida MP4',
  'ex.frames': 'fotogrammi',
  'ex.audio': "Traccia audio muta (AAC stereo 48 kHz) — per i campionatori che richiedono l'ingresso audio",
  'ex.noKeys': "Nessun keyframe: il video sarà un'inquadratura fissa.",
  'ex.oneKey': "Un solo keyframe: il video sarà un'inquadratura fissa.",
  'ex.noVideo': 'Questo browser non supporta la creazione di video. Usa Chrome o Edge aggiornati.',
  'ex.cancel': 'Annulla',
  'ex.exportMp4': 'Esporta MP4',
  'ex.rendering': 'Rendering {w}×{h}…',
  'ex.saved': 'Video salvato: {name} ({mb} MB)',
  'ex.cancelled': 'Export annullato.',
  'ex.error': 'Errore: {msg}',
  'ex.prompt': 'Prompt testuale',
  'ex.promptNote': 'Generato dalla timeline. Puoi modificarlo prima di copiarlo. Il prompt è sempre in inglese.',
  'ex.copy': 'Copia prompt',
  'ex.saveTxt': 'Salva .txt',
  'ex.regen': 'Rigenera',
  'ex.regenTitle': 'Ricrea il testo dalla timeline (perde le modifiche)',
  'ex.copied': 'Prompt copiato negli appunti.',
  'ex.copyFail': 'Copia non riuscita: seleziona il testo e usa Ctrl+C.',
  'ex.promptSaved': 'Prompt salvato.',
  'err.sceneNotReady': 'Scena non pronta',
  'err.h264': 'Codifica H.264 {w}×{h} non supportata da questo browser',
  'err.noAudio': 'Questo browser non supporta la codifica audio: disattiva la traccia audio muta',
};

export type TKey = keyof typeof it;

const en: Record<TKey, string> = {
  'lang.label': 'Language',

  'shot.title': 'Camera view',
  'shot.hint': 'Left: orbit · Right: pan/tilt · Middle: truck/pedestal · Wheel: dolly · Shift+wheel: zoom · Ctrl+wheel: crane · Click here to use the keyboard',
  'dir.title': 'Director view',
  'dir.hint': 'Drag: rotate view · Right: pan · Wheel: zoom · Click an object: select',

  'fmt.title': 'Format',
  'overlay.thirds': 'Rule of thirds',
  'overlay.center': 'Center cross',
  'overlay.safe': 'Safe areas',
  'overlay.note': 'Overlays are shown only in the preview, never in the exported video.',
  'safe.action': 'Action 93%',
  'safe.title': 'Title 90%',

  'cam.title': 'Camera',
  'cam.focal': 'Focal length',
  'cam.focalShort': 'Focal',
  'cam.distance': 'Distance',
  'cam.height': 'Height',
  'cam.roll': 'Roll',
  'cam.speed': 'Speed',
  'cam.frame': 'Frame the mannequin',
  'frame.full': 'Full shot',
  'frame.medium': 'Medium shot',
  'frame.close': 'Close-up',
  'cam.reset': 'Reset camera',
  'cam.note': 'Hold Shift to move faster with the keyboard, or for fine mouse moves.',
  'move.orbitAz': 'Orbit',
  'move.orbitEl': 'Orbit up/down',
  'move.dolly': 'Dolly / push',
  'move.truck': 'Truck',
  'move.pedestal': 'Pedestal',
  'move.crane': 'Crane',
  'move.pan': 'Pan',
  'move.tilt': 'Tilt',
  'move.roll': 'Roll',
  'move.zoom': 'Zoom',

  'hh.title': 'Handheld camera',
  'hh.enable': 'Enable handheld shake',
  'hh.intensity': 'Intensity',
  'hh.frequency': 'Frequency',
  'hh.slow': 'slow',
  'hh.natural': 'natural',
  'hh.nervous': 'nervous',
  'hh.variant': 'New shake variant ({n})',
  'hh.note': 'The shake follows the timeline: press Space to see it. Preview and export are identical.',

  'scene.title': 'Scene',
  'scene.add': 'Add',
  'scene.selectHint': 'Select an object from the list or by clicking it in the director view.',
  'kind.manichino': 'Mannequin',
  'kind.cubo': 'Cube',
  'kind.sfera': 'Sphere',
  'kind.cilindro': 'Cylinder',
  'kind.pannello': 'Panel',
  'gizmo.translate': 'Move',
  'gizmo.rotate': 'Rotate',
  'gizmo.scale': 'Scale',
  'obj.position': 'Position (m)',
  'obj.rotation': 'Rotation (°)',
  'obj.scale': 'Scale',
  'obj.tone': 'Gray tone',
  'obj.delete': 'Delete object',

  'style.title': 'Guide video style',
  'style.floor': 'Floor',
  'grid.marcata': 'Bold grid',
  'grid.leggera': 'Light grid',
  'grid.scacchiera': 'Checkerboard',
  'style.bg': 'Background',
  'bg.chiaro': 'Light',
  'bg.medio': 'Medium',
  'bg.scuro': 'Dark',
  'style.mann': 'Mannequin',
  'mann.grigio': 'Gray',
  'mann.bianco': 'White',
  'mann.arancio': 'Orange',
  'style.refs': 'Reference columns in the background',

  'tl.start': 'Start (Home)',
  'tl.prevKey': 'Previous keyframe (PgUp)',
  'tl.play': 'Play / pause (Space)',
  'tl.nextKey': 'Next keyframe (PgDn)',
  'tl.frame': 'frame',
  'tl.keyTitle': 'Save the current camera as a keyframe (Enter)',
  'tl.dirty': 'Camera changed: press ◆ or Enter to save it',
  'tl.preset': 'Preset',
  'tl.choose': 'Choose…',
  'tl.duration': 'Duration',
  'tl.loop': 'Loop',
  'tl.clear': 'Clear',
  'tl.clearConfirm': 'Delete all keyframes?',
  'tl.hintKeys': 'Click a keyframe ◆ or a segment to edit its curve and path. Drag keyframes to change their time.',
  'tl.hintEmpty': 'Position the camera, move the playhead to the desired time and press ◆ Keyframe (Enter). You need at least two keyframes, or pick a preset.',
  'tl.lastKey': 'Last keyframe: the curve is set on the starting keyframe of each segment.',
  'tl.curve': 'Curve',
  'tl.path': 'Path',
  'tl.arc': 'Arc',
  'tl.arcTitle': 'Circles around the subject (orbits)',
  'tl.linear': 'Linear',
  'tl.linearTitle': 'Straight line (dolly, truck, crane)',
  'tl.update': 'Update with current camera',
  'tl.updateTitle': 'Replaces this keyframe with the current camera',
  'tl.delete': 'Delete',
  'tl.dragKey': 'Keyframe {t} s — drag to move it',
  'tl.segArc': 'arc',
  'tl.segLinear': 'linear',
  'preset.orbita90': 'Orbit 90°',
  'preset.orbita180': 'Orbit 180°',
  'preset.push': 'Push-in',
  'preset.pull': 'Pull-out',
  'preset.crane': 'Crane reveal',
  'preset.arcpush': 'Arc shot + push',
  'preset.truck': 'Lateral tracking',
  'preset.zoom': 'Zoom in',

  'project.defaultName': 'New shot',
  'pb.nameAria': 'Project name',
  'pb.new': 'New',
  'pb.newConfirm': 'Start a new project? Changes not saved to a file will be lost.',
  'pb.open': 'Open…',
  'pb.save': 'Save…',
  'pb.saved': 'Project saved',
  'pb.opened': 'Project opened',
  'pb.openError': 'Cannot open the project: {msg}',
  'pb.export': 'Export…',
  'file.project': 'Stage project',
  'file.video': 'MP4 video',
  'file.text': 'Text',
  'err.notProject': 'The file is not a Stage project',
  'err.newerVersion': 'The project was created with a newer version of Stage',
  'err.noMannequin': 'Incomplete project: the mannequin is missing',
  'err.noKeyframes': 'Incomplete project: keyframes are missing',
  'err.badObject': 'Invalid object: {name}',
  'err.badKeyframe': 'Invalid keyframe',

  'ex.title': 'Export for MiniMax H3',
  'ex.close': 'Close',
  'ex.video': 'MP4 guide video',
  'ex.frames': 'frames',
  'ex.audio': 'Silent audio track (AAC stereo 48 kHz) — for samplers that require an audio input',
  'ex.noKeys': 'No keyframes: the video will be a static shot.',
  'ex.oneKey': 'Only one keyframe: the video will be a static shot.',
  'ex.noVideo': 'This browser cannot create videos. Use an up-to-date Chrome or Edge.',
  'ex.cancel': 'Cancel',
  'ex.exportMp4': 'Export MP4',
  'ex.rendering': 'Rendering {w}×{h}…',
  'ex.saved': 'Video saved: {name} ({mb} MB)',
  'ex.cancelled': 'Export cancelled.',
  'ex.error': 'Error: {msg}',
  'ex.prompt': 'Text prompt',
  'ex.promptNote': 'Generated from the timeline. You can edit it before copying.',
  'ex.copy': 'Copy prompt',
  'ex.saveTxt': 'Save .txt',
  'ex.regen': 'Regenerate',
  'ex.regenTitle': 'Rebuild the text from the timeline (discards your edits)',
  'ex.copied': 'Prompt copied to the clipboard.',
  'ex.copyFail': 'Copy failed: select the text and press Ctrl+C.',
  'ex.promptSaved': 'Prompt saved.',
  'err.sceneNotReady': 'Scene not ready',
  'err.h264': 'H.264 encoding at {w}×{h} is not supported by this browser',
  'err.noAudio': 'This browser cannot encode audio: turn off the silent audio track',
};

const DICTS: Record<Lang, Record<TKey, string>> = { it, en };

export const LANGS: [Lang, string][] = [['it', 'Italiano'], ['en', 'English']];

/** Traduzione nella lingua corrente; {nome} viene sostituito con vars.nome. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s = DICTS[store.getState().lang][key] ?? it[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Come t(), ma fa ridisegnare il componente quando cambia la lingua. */
export function useT() {
  useApp(s => s.lang);
  return t;
}

export function setLang(lang: Lang) {
  // un progetto mai rinominato prende il nome predefinito della nuova lingua
  const s = store.getState();
  const renamed = s.projectName !== DICTS[s.lang]['project.defaultName'];
  setState({ lang, ...(renamed ? {} : { projectName: DICTS[lang]['project.defaultName'] }) });
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('stage:lang', lang);
  } catch {
    // preferenza non salvabile: vale solo per questa sessione
  }
}

/** Nome visualizzato di un oggetto, nella lingua corrente ("Cubo 2" → "Cube 2"). */
export function objectLabel(o: SceneObject): string {
  const base = t(`kind.${o.kind}` as TKey);
  if (o.kind === 'manichino') return base;
  const n = /(\d+)$/.exec(o.name)?.[1];
  return n ? `${base} ${n}` : base;
}
