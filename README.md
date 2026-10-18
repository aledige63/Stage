# Stage

**Camera-move previsualization for AI video generation.**
Build cinematic camera movements around a neutral mannequin in a 3D scene, then export them as a
**guide video (MP4)** plus an **English text prompt** to drive the camera in models such as
**MiniMax H3**.

[Italiano](README.it.md) · [Try it online](#use-it-online) · [Install locally](#run-it-locally) · [How to use](#how-to-use)

---

## Why

Video models follow a reference video's camera motion far more reliably than a text description.
Stage lets you design that motion precisely — orbit, dolly, crane, zoom, easing, timing — and render
a clean guide clip in seconds. The gray mannequin and the floor grid give the model clear parallax
and scale cues without leaking into the result.

## Features

- **Real camera moves**: orbit, dolly / push-in, truck, pedestal, crane, pan, tilt, roll and
  optical zoom (12–200 mm, full-frame equivalent).
- **Two views**: the *camera view* (the final framing, 16:9 or 9:16) and a free *director view*
  showing the camera, its field of view, target and path.
- **Keyframe timeline**: 2–15 s, 24/25/30 fps, per-segment easing (Linear, Ease In, Ease Out,
  Ease In-Out, Hold), arc or linear paths, draggable keyframes, loop playback.
- **8 presets** built around the mannequin: orbit 90°/180°, push-in, pull-out, crane reveal,
  arc shot + push, lateral tracking, zoom in.
- **Handheld camera**: deterministic shake with intensity, frequency and variant — the preview and
  the export match frame by frame.
- **Scene blocking**: cubes, spheres, cylinders and panels you can move, rotate, scale and tint;
  the mannequin can be moved and turned.
- **Guide-video styles**: bold/light grid or checkerboard floor, light/medium/dark background,
  mannequin color.
- **Overlays** (preview only): rule of thirds, center cross, action/title safe areas.
- **Export**: H.264 MP4 at 720p or 1080p, rendered frame by frame (independent of your computer's
  speed), with an optional **silent AAC audio track** for samplers that require an audio input.
- **Prompt generator**: describes the opening/closing framing and every segment of the move in
  English, ready to paste into your video model.
- **Projects**: save/open `.stage.json` files (move them between PC and Mac) plus automatic saving
  in the browser.
- **Italian and English interface**.
- **Subject in the guide video**: mannequin, cylinder, block (position, size and facing only) or
  none (floor and reference columns only).

## Use it online

Open **https://aledige63.github.io/Stage/** in Chrome or Edge.
Nothing to install; your work is auto-saved in the browser.

> Video export uses the browser's WebCodecs API. Use an up-to-date **Chrome** or **Edge**
> (Windows or macOS). Safari and Firefox may lack H.264/AAC encoding.

## Run it locally

Requirements: [Node.js](https://nodejs.org) 20 or newer (LTS recommended) and Chrome or Edge.

1. Download the repository (**Code → Download ZIP**, then unzip) or clone it:
   ```bash
   git clone https://github.com/aledige63/Stage.git
   ```
2. Start Stage:
   - **Windows**: double-click `Avvia-Stage.bat`.
   - **macOS**: double-click `Avvia-Stage.command`. The first time, if macOS refuses to open it,
     right-click it → **Open**. If you downloaded the ZIP, make it executable once in Terminal:
     ```bash
     chmod +x Avvia-Stage.command
     ```
   - **Any system**, from a terminal:
     ```bash
     cd app
     npm install
     npm run dev
     ```
     then open http://localhost:5173.

The launchers install the dependencies on first run, start the local server and open Stage in
Chrome. To stop Stage, close the "Stage - server" window (Windows) or the Terminal window (macOS).

## How to use

### 1. Frame the shot
Click the **camera view** to give it keyboard focus, then hold the keys (or the buttons in the left
panel). Hold **Shift** to move faster with the keyboard, or for finer mouse moves.

| Move | Keys | Mouse (camera view) |
|------|------|---------------------|
| Orbit | ← → ↑ ↓ | left drag |
| Dolly / push | W / S | wheel |
| Truck | A / D | middle drag |
| Pedestal | R / F | middle drag |
| Crane | T / G | Ctrl + wheel |
| Pan | J / L | right drag |
| Tilt | I / K | right drag |
| Roll | U / O | — |
| Zoom | Z / X | Shift + wheel |

**Frame the mannequin** gives you a full shot, medium shot or close-up in one click.
In the **director view**, click an object to select it and move it with the gizmo.

### 2. Build the move
Move the playhead, position the camera and press **Enter** (or **◆ Keyframe**). Repeat for every pose.
Click a keyframe ◆ or a segment to choose its curve and path:
**Arc** circles around the subject (orbits), **Linear** goes straight (dolly, truck, crane).
Or start from a **Preset**.

| Shortcut | Action |
|----------|--------|
| Space | Play / pause |
| Enter | Save keyframe (or update the one at the playhead) |
| Home / End | Start / end |
| Page Up / Page Down | Previous / next keyframe |
| Delete | Delete the selected keyframe |

### 3. Export
Click **Export…**, choose 720p or 1080p and press **Export MP4**. Then **Copy prompt** and use the
video and the prompt together in your video model (for example as the camera/motion reference in
MiniMax H3).

## Project structure

```
app/                  the Stage application (Vite + TypeScript + React + Three.js)
  src/engine/         3D scene, camera operations, interpolation, handheld shake
  src/export/         MP4 encoding (WebCodecs + mp4-muxer), prompt generator, file saving
  src/ui/             panel, timeline, export dialog, project bar
  src/i18n.ts         Italian / English texts
prototipo-fase0/      the first single-page prototype used to validate the idea with H3
Avvia-Stage.bat       Windows launcher
Avvia-Stage.command   macOS launcher
PIANO.md              development plan and log (in Italian)
```

## Development

```bash
cd app
npm install
npm run dev      # development server on http://localhost:5173
npm run build    # type-check and production build in app/dist
```

Every push to `main` is built and published to GitHub Pages by
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Roadmap

Planned next (see [PIANO.md](PIANO.md) and [CHANGELOG.md](CHANGELOG.md)):

1. Undo/redo and automated tests.
2. A compact, structured "for LLM" prompt format, designed to be rewritten by a local LLM into a
   Ref2VA prompt.
3. A moving subject with its own keyframes, and a camera target locked to any point on the subject.
4. Spline (Bézier) handles on the camera path.
5. Still-image export, a toggleable shortcut legend, keyboard shortcuts for scene objects, a library
   of saved moves, a dolly-zoom preset.
6. Up to three subjects with names, colors and ready-made poses (only if tests show it helps).

## License

[MIT](LICENSE)
