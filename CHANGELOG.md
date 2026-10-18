# Changelog

All notable changes to Stage are listed here. Versions follow MAJOR.MINOR.PATCH.
Tutte le modifiche rilevanti di Stage sono elencate qui (in inglese; il diario di sviluppo in
italiano è in [PIANO.md](PIANO.md)).

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

[0.5.0]: https://github.com/aledige63/Stage/releases/tag/v0.5.0
