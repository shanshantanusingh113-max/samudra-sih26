import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadAnomalies,
  loadCollocations,
  loadFloats,
  loadManifest,
  loadVolumeTexture,
  paletteTexture,
} from "./data/load";
import { useCoverageWindow } from "./floatTime";
import { OceanScene } from "./scene/OceanScene";
import { useStore } from "./store";
import { Chrome, LoadingScreen } from "./ui/Chrome";
import { Controls } from "./ui/Controls";
import { DepthRuler } from "./ui/DepthRuler";
import { AnomalyPanel } from "./ui/AnomalyPanel";
import { GuidePanel } from "./ui/GuidePanel";
import { MapKey } from "./ui/MapKey";
import { ProfilePanel } from "./ui/ProfilePanel";
import { Timeline } from "./ui/Timeline";

const DIVE_MILLISECONDS = 2600;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OceanScene | null>(null);
  const [ready, setReady] = useState(false);
  const store = useStore();

  // ---- load the baked data -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [manifest, floats, collocations, anomalies, coastlines] = await Promise.all([
          loadManifest(),
          loadFloats(),
          loadCollocations(),
          loadAnomalies(),
          fetch(`${import.meta.env.BASE_URL}data/coastlines.json`).then(
            (r) => r.json() as Promise<number[][][]>,
          ),
        ]);
        if (cancelled) return;
        // Before anything draws a Float: the marker rule and the coverage window are one number.
        if (manifest.coverage) useCoverageWindow(manifest.coverage.windowDays);
        const first = manifest.fields[0];
        useStore.setState({
          manifest,
          floats,
          collocations,
          anomalies,
          coastlines,
          timestepIndex: manifest.timesteps.length - 1,
          fieldKey: first?.key ?? "temperature",
        });
      } catch (error) {
        if (!cancelled) {
          useStore.setState({ loadError: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- build the scene once the data is in ---------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const { manifest, floats, coastlines } = store;
    if (!canvas || !manifest || sceneRef.current || coastlines.length === 0) return;

    const scene = new OceanScene(canvas);
    scene.build(manifest, floats, coastlines);
    scene.applyCamera(0);
    scene.start();
    sceneRef.current = scene;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) scene.resize(parent.clientWidth, parent.clientHeight);
    };
    resize();
    window.addEventListener("resize", resize);
    setReady(true);

    return () => {
      window.removeEventListener("resize", resize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [store.manifest, store.coastlines, store.floats]);

  // ---- swap the Volume whenever the Field or Timestep changes --------------
  useEffect(() => {
    const scene = sceneRef.current;
    const { manifest, fieldKey, timestepIndex } = store;
    if (!scene || !manifest) return;

    const path = manifest.volumeFiles[fieldKey]?.[timestepIndex];
    if (!path) return;

    let cancelled = false;
    const { width, height, depth } = manifest.volume;
    loadVolumeTexture(path, width, height, depth)
      .then((texture) => {
        if (cancelled) texture.dispose();
        else {
          scene.setVolumeTexture(texture);
          useStore.setState({ notice: null });
        }
      })
      // Deliberately not fatal. The Volume already on the GPU is still perfectly good, so one
      // failed fetch while scrubbing the timeline must not tear down a running session - only
      // the initial manifest load justifies the fatal screen.
      .catch(() =>
        useStore.setState({
          notice: `Could not load ${fieldKey} for this step - showing the previous one.`,
        }),
      );

    return () => {
      cancelled = true;
    };
  }, [ready, store.manifest, store.fieldKey, store.timestepIndex]);

  // ---- palette -------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    // The palette a Field is drawn with is the Field's own, named in its FieldSpec. There used
    // to be a chooser beside the variable selector; see samudra/palettes.py for why there is not.
    const colours = store.manifest?.palettes[store.field()?.palette ?? ""];
    if (!scene || !colours) return;
    // The scene takes ownership and releases the palette it replaces.
    scene.setPalette(paletteTexture(colours, store.theme));
  }, [ready, store.manifest, store.fieldKey, store.theme]);

  // A Feature is found within one Timestep, so the panel cannot survive the timeline moving:
  // index 3 of the next step is a different body of water in a different place.
  useEffect(() => {
    useStore.setState({ selectedAnomaly: null });
  }, [store.timestepIndex, store.fieldKey]);

  // ---- push view state into the scene every render -------------------------
  useEffect(() => {
    sceneRef.current?.update({
      morph: store.morph,
      timestepIndex: store.timestepIndex,
      timeMs: new Date(store.manifest?.timesteps[store.timestepIndex] ?? 0).getTime(),
      windowMin: store.windowMin,
      windowMax: store.windowMax,
      opacity: store.opacity,
      depthFrom: store.depthFrom,
      depthTo: store.depthTo,
      surfaceLevel: store.surfaceLevel,
      isoEnabled: store.isoEnabled,
      isoValue: store.isoValue,
      volumeEnabled: store.volumeEnabled,
      emphasis: store.emphasis,
      exaggeration: store.exaggeration,
      quality: store.quality,
      selectedFloatId: store.selectedFloatId,
      fieldKey: store.fieldKey,
      anomalies: store.features(),
      showAnomalies: store.showAnomalies,
      selectedAnomaly: store.selectedAnomaly,
      showFloats: store.showFloats,
      showTracks: store.showTracks,
      theme: store.theme,
    });
  });

  // ---- the Drill-down ------------------------------------------------------
  const dive = useCallback((into: boolean) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const from = useStore.getState().morph;
    const to = into ? 1 : 0;
    const started = performance.now();
    useStore.setState({ stage: "diving" });

    const step = () => {
      const t = Math.min((performance.now() - started) / DIVE_MILLISECONDS, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const morph = from + (to - from) * eased;
      useStore.setState({ morph });
      scene.applyCamera(morph);
      if (t < 1) requestAnimationFrame(step);
      else useStore.setState({ stage: into ? "volume" : "globe" });
    };
    requestAnimationFrame(step);
  }, []);

  // ---- Timestep animation --------------------------------------------------
  useEffect(() => {
    if (!store.playing || !store.manifest) return;
    const count = store.manifest.timesteps.length;
    const timer = window.setInterval(() => {
      useStore.setState((s) => ({ timestepIndex: (s.timestepIndex + 1) % count }));
    }, 900);
    return () => window.clearInterval(timer);
  }, [store.playing, store.manifest]);

  // ---- selecting a Float, or an Anomaly Feature ----------------------------
  //
  // Floats win a tie. A Feature is a body of water hundreds of kilometres across and its marker
  // is only a handle on it, whereas a Float is a specific instrument at a specific point, so
  // when the two overlap the precise thing is the one the user meant.
  const onCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const float = scene.pickFloat(event.clientX, event.clientY);
    if (float) {
      useStore.setState({ selectedFloatId: float.id, selectedAnomaly: null });
      return;
    }
    const feature = scene.pickAnomaly(event.clientX, event.clientY);
    useStore.setState({ selectedFloatId: null, selectedAnomaly: feature });
  }, []);

  const onCanvasMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const hit =
      scene.pickFloat(event.clientX, event.clientY) !== null ||
      scene.pickAnomaly(event.clientX, event.clientY) !== null;
    event.currentTarget.style.cursor = hit ? "pointer" : "grab";
  }, []);

  if (store.loadError) {
    return (
      <div className="fatal">
        <h1>Samudra 3D could not start</h1>
        <p>{store.loadError}</p>
        <p className="hint">
          The baked data may be missing. Run <code>python -m samudra.bake</code> in{" "}
          <code>pipeline/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="viewport">
        <canvas ref={canvasRef} onClick={onCanvasClick} onMouseMove={onCanvasMove} />
        {!store.manifest && <LoadingScreen />}
        {store.notice && (
          <div className="notice" role="status">
            {store.notice}
            <button onClick={() => useStore.setState({ notice: null })} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
      </div>

      {store.manifest && (
        <>
          <Chrome onDive={dive} />
          <DepthRuler scene={sceneRef.current} />
          <MapKey />
          <Controls />
          <GuidePanel />
          <AnomalyPanel />
          <ProfilePanel onFocus={(lon, lat) => sceneRef.current?.focusOn(lon, lat)} />
          <Timeline />
        </>
      )}
    </div>
  );
}
