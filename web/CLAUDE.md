# `web/` - React + TypeScript + Three.js. One WebGL scene for globe and volume.

See the root [`CLAUDE.md`](../CLAUDE.md) for the rules that govern this code, and
[`CONTEXT.md`](../CONTEXT.md) for the vocabulary.

| File | What it does |
| --- | --- |
| `index.html` | The landing page. Plain HTML and CSS plus a small scroll-reveal and theme script. |
| `provenance.html` | Data provenance. Every figure read live from the baked manifest; nothing hardcoded. |
| `app.html` | The application entry. Loads fonts, mounts `src/main.tsx`. |
| `vite.config.ts` | Multi-page build: `landing`, `app`, `provenance`. `base: "./"` so it works under a sub-path. |
| `src/App.tsx` | Orchestration: loads data, builds the scene, pushes view state, runs the dive and playback, handles clicks. |
| `src/store.ts` | Zustand store. Every control's value, plus `touched` (which control the guide explains). `selectField()` is the one place a Variable switch applies its Field's render hints. |
| `src/types.ts` | Shapes of the baked JSON. Keep in step with `bake.py`. |
| `src/guide.ts` | **Plain-language explanation of every control.** Edit here to change what the guide panel says. |
| `src/floatTime.ts` | `positionAt()` / `trackUpTo()` - where a float was at a given moment. The window it uses is the bake's, read from the manifest. |
| `src/palette.ts` | The display lift applied to cmocean palettes, **per theme**. Applied here so the colourbar and the water agree. |
| `src/data/load.ts` | Fetches the manifest, floats, collocations and volumes; builds GPU textures. |
| `src/scene/OceanScene.ts` | The largest file. Renderer, camera, all geometry, picking, the `ORDER` draw-order table, `debug()`. |
| `src/scene/volumeShader.ts` | The ray-marching GLSL. Transfer function, depth gate, isosurface, gradient emphasis. |
| `src/scene/earthShader.ts` | The globe-to-map morph, and the sea-surface field. |
| `src/scene/geography.ts` | Coordinate mapping and the depth-axis inversion. One place decides where things go. |
| `src/scene/morph.ts` | The morph in TypeScript, for picking. Must match `earthShader.ts`. |
| `src/ui/Controls.tsx` | Left panel. Every slider carries a `guide` key. There is no palette chooser; each Field carries its own - ADR 0010. |
| `src/ui/ProfilePanel.tsx` | The comparison: chart, verdict, statistics. |
| `src/ui/GuidePanel.tsx` | The right-hand explanation panel. Yields to the Collocation and Anomaly Feature panels. |
| `src/ui/AnomalyPanel.tsx` | What one Anomaly Feature is, in words. Every sentence driven by a number the bake measured. |
| `src/ui/Chrome.tsx` | Top bar, dive button, attribution. |
| `src/ui/Timeline.tsx` | Playback and the time slider. |
| `src/ui/DepthRuler.tsx` | Depth labels down the flank of the volume. |
| `src/ui/MapKey.tsx` | The key naming floats, tracks and coastlines. |
| `src/styles.css` | All styling, plus the motion system. Design tokens are at the top. |
