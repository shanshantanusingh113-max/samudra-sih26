import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadAnomalies,
  loadCollocations,
  loadFloats,
  loadManifest,
  loadOverlayTexture,
  loadVolumeTexture,
  paletteTexture,
} from "./data/load";
import { positionAt, useCoverageWindow } from "./floatTime";
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
import { Tour } from "./ui/Tour";

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
        // Everything the first picture needs, and nothing else. `collocations.json` used to be
        // in here: 2.42 MB of the 3.29 MB first load, for a panel nobody has opened yet. It
        // follows below, off the critical path.
        const [manifest, floats, anomalies, coastlines] = await Promise.all([
          loadManifest(),
          loadFloats(),
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
          anomalies,
          coastlines,
          timestepIndex: manifest.timesteps.length - 1,
          fieldKey: first?.key ?? "temperature",
        });

        // The comparisons, in the background. A failure here is not fatal - the globe, the
        // volume, every Variable and the anomaly panel all work without it, and the Collocation
        // panel says so rather than the app refusing to start.
        loadCollocations()
          .then((collocations) => {
            if (!cancelled) useStore.setState({ collocations, collocationsReady: true });
          })
          .catch(() => {
            if (!cancelled) {
              useStore.setState({
                collocationsReady: true,
                notice: "The float comparisons could not be loaded. Everything else is fine.",
              });
            }
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

  // ---- the Copernicus current overlay --------------------------------------
  //
  // Fetched only when somebody turns it on, and per Timestep after that. Twelve images at
  // roughly 340 KB each have no business on the critical path for a layer that is off by
  // default, and the demo still makes no network call at demo time because they are committed.
  useEffect(() => {
    const scene = sceneRef.current;
    const spec = store.manifest?.currents;
    if (!scene || !spec) return;
    if (store.currentsOpacity <= 0) {
      scene.setCurrents(null);
      return;
    }
    const path = spec.files[store.timestepIndex];
    if (!path) return;

    let cancelled = false;
    loadOverlayTexture(path)
      .then((texture) => {
        if (cancelled) texture.dispose();
        else scene.setCurrents(texture);
      })
      .catch(() =>
        useStore.setState({
          notice: "Could not load the current overlay for this step.",
        }),
      );
    return () => {
      cancelled = true;
    };
  }, [ready, store.manifest, store.currentsOpacity, store.timestepIndex]);

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
    // Isolation goes with the selection. Leaving it on with nothing selected would clip the
    // water to a box the user can no longer see the reason for.
    useStore.setState({ selectedAnomaly: null, isolateAnomaly: false });
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
      isolateAnomaly: store.isolateAnomaly,
      showFloats: store.showFloats,
      showTracks: store.showTracks,
      currentsOpacity: store.currentsOpacity,
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
      useStore.setState({ selectedFloatId: float.id, selectedAnomaly: null, isolateAnomaly: false });
      return;
    }
    const feature = scene.pickAnomaly(event.clientX, event.clientY);
    useStore.setState({
      selectedFloatId: null,
      selectedAnomaly: feature,
      // A different body of water is a different box, so isolation does not carry over.
      isolateAnomaly: false,
    });
  }, []);

  /**
   * The 3D view, from the keyboard.
   *
   * The canvas carried `tabIndex -1`, so selecting a Float was mouse-only and the whole
   * comparison - the thing the platform exists for - was unreachable without a pointer. For a
   * tool meant to be deployed by a government department that is a procurement question, not a
   * nicety.
   *
   * Left and right walk the Floats reporting at this Timestep from west to east, which is the
   * order the map reads in. Enter opens the comparison, Escape closes it and hands focus back.
   * The selection is announced through a live region rather than being left to the canvas,
   * which a screen reader cannot describe.
   */
  const onCanvasKey = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const state = useStore.getState();
    const reporting = state.reportingFloats();
    if (reporting.length === 0) return;

    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      const current = reporting.findIndex((f) => f.id === state.selectedFloatId);
      // From nothing, the first press lands on the westernmost Float rather than the second.
      const next = current < 0 ? (step > 0 ? 0 : reporting.length - 1) : current + step;
      const chosen = reporting[((next % reporting.length) + reporting.length) % reporting.length];
      if (!chosen) return;
      useStore.setState({ selectedFloatId: chosen.id, selectedAnomaly: null });
      const at = positionAt(chosen, state.manifest ? new Date(state.manifest.timesteps[state.timestepIndex] ?? 0).getTime() : 0);
      if (at) sceneRef.current?.focusOn(at.lon, at.lat);
      return;
    }

    if (event.key === "Escape" && state.selectedFloatId) {
      event.preventDefault();
      useStore.setState({ selectedFloatId: null });
    }
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
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label={
            "Three-dimensional ocean view. Use the left and right arrow keys to move between" +
            " the Argo floats reporting on this date, and Escape to close a comparison."
          }
          onClick={onCanvasClick}
          onMouseMove={onCanvasMove}
          onKeyDown={onCanvasKey}
        />
        {/* What the canvas cannot say for itself. */}
        <p className="sr-only" role="status" aria-live="polite">
          {store.selectedFloatId
            ? `Argo float ${store.selectedFloatId} selected.`
            : `${store.reportingCount()} Argo floats reporting on this date.`}
        </p>
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
          <AnomalyPanel onPan={(lon, lat) => sceneRef.current?.panTo(lon, lat)} />
          <ProfilePanel onFocus={(lon, lat) => sceneRef.current?.focusOn(lon, lat)} />
          <Timeline />
          <Tour onDive={dive} />
        </>
      )}
    </div>
  );
}
