# Changelog

All notable changes to Stage are listed here. Versions follow MAJOR.MINOR.PATCH.
Tutte le modifiche rilevanti di Stage sono elencate qui (in inglese; il diario di sviluppo in
italiano è in [PIANO.md](PIANO.md)).

## [0.8.0] — 2026-11-19

### Added
- **Ref2VA prompt example** in the export dialog, collapsed below the original prompt: ready-made
  pieces for `subject_definitions`, `retention_analysis` and `detailed_description`, with editable
  placeholders (`<Subject 1>`, `<Video 1>`) and no repeated phrases.

## [0.7.0] — 2026-11-01

### Added
- **Scenes from Blender**: import GLB/glTF files as separate objects that can be moved, rotated,
  scaled or hidden, or moved together; neutral gray or Blender colors in the guide video; file embedded
  in the project; reimport keeps subject, camera and keyframes; `Stage_Subject` and `Stage_Camera`
  place the mannequin and the starting view. The prompt mentions the set blocks when they are visible.
- **Pan path** in the timeline, with extra full turns for rotations beyond 180°, and pan 90°/180°/360°
  presets starting from the current camera.
- **Roll** up to ±360° (barrel roll) and Alt + wheel to control it.

### Fixed
- **Pans between keyframes**: the camera drifted on arc paths and rotated unevenly on linear ones. Two
  keyframes at the same position now always rotate in place at an even rate.
- **Overlays** are now dark on the light background, where they were hard to see.

## [0.6.0] — 2026-10-31

### Added
- **Two side panels**: camera controls on the left; subject, scene objects and guide-video style on
  the right. Every section can be collapsed.
- **Camera height**: editable "height above ground" field, tilt angle readout ("looking down / up /
  level") and a dashed line with the measurement under the camera in the director view.
- **Subject height** (1.00–2.10 m, with child / woman / man / tall presets): the mannequin, cylinder and
  block scale with it; quick framings, presets and the prompt's shot sizes adapt.
- **Undo / redo** (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z, and ↶ ↷ buttons) for keyframes, objects, presets,
  subject, style and timeline settings.
- **Automated tests** (Vitest, `npm test`), run in the GitHub workflow before publishing.

### Changed
- Launchers renamed to `Start-Stage.bat` and `Start-Stage.command`.

## [0.5.1] — 2026-10-19

### Fixed
- **Windows launcher**: `Avvia-Stage.bat` closed immediately without starting the server. Parentheses
  in the bilingual messages broke the `if ( … )` blocks of the batch file; they are now escaped.

## [0.5.0] — 2026-10-18

First numbered release.

### Added
- **Subject in the guide video**: choose mannequin, cylinder, block (position, size and facing only)
  or none. With no subject the reference columns are always on for spatial cues, and the director
  view shows the mannequin as a transparent ghost. Available in the Style panel and in the Export
  dialog; the prompt adapts its first line.

### Fixed
- Removed the Three.js warning about `PCFSoftShadowMap` (deprecated since r186): shadows now use
  `PCFShadowMap`, with the same look.

### Included so far (features published before numbered releases)
- Camera view and director view; orbit, dolly / push, truck, pedestal, crane, pan, tilt, roll and
  optical zoom from keyboard, mouse and hold-to-move buttons; quick framings.
- Keyframe timeline (2–15 s, 24/25/30 fps) with per-segment easing (Linear, Ease In, Ease Out,
  Ease In-Out, Hold), arc or linear paths, draggable keyframes and 8 presets.
- Deterministic handheld shake; rule-of-thirds, center-cross and safe-area overlays.
- Frame-by-frame H.264 MP4 export at 720p/1080p with an optional silent AAC track; English prompt
  generator; `.stage.json` projects and browser autosave.
- Scene objects (cube, sphere, cylinder, panel); guide-video styles.
- Italian and English interface.
- Windows and macOS launchers; online version on GitHub Pages.

[0.6.0]: https://github.com/aledige63/Stage/releases/tag/v0.6.0
[0.5.1]: https://github.com/aledige63/Stage/releases/tag/v0.5.1
[0.5.0]: https://github.com/aledige63/Stage/releases/tag/v0.5.0
