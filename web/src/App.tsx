import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadAnomalies,
  loadCollocations,
  loadDrift,
  loadFloats,
  loadManifest,
  loadNativeGrid,
  loadResiduals,
  loadSurfaceField,
  loadVectorField,
  loadVolumeTexture,
  paletteTexture,
} from "./data/load";
import { positionAt, useCoverageWindow } from "./floatTime";
import { axisToDepth } from "./scene/geography";
import { OceanScene, type BiasMark } from "./scene/OceanScene";
import { useStore } from "./store";
import { integrateDrift, type LoadedCurrents } from "./drift";
import type { FieldResiduals, Manifest } from "./types";
import { Chrome, LoadingScreen } from "./ui/Chrome";
import { Controls } from "./ui/Controls";
import { DepthRuler } from "./ui/DepthRuler";
import { AnomalyPanel } from "./ui/AnomalyPanel";
import { GuidePanel } from "./ui/GuidePanel";
import { MapKey } from "./ui/MapKey";
import { ProfilePanel } from "./ui/ProfilePanel";
import { SectionPanel } from "./ui/SectionPanel";
import { Explore } from "./ui/Explore";
import { Timeline } from "./ui/Timeline";
import { Tour } from "./ui/Tour";

const DIVE_MILLISECONDS = 2600;

/**
 * Open the platform with a control already set, from the query string.
 *
 * This exists for the requirements page: it lists each clause of PS 26067 word for word and puts
 * a link beside it that opens *this* app showing the thing that answers it. A claim a reader can
 * click is a different kind of claim from a claim in a table, and the alternative was a
 * screenshot, which proves nothing about the running software.
 *
 * Everything is validated against the manifest rather than trusted. An unknown Field key or an
 * out-of-range Timestep is ignored, not applied - a bad link should open the app, not break it.
 *
 * Returns whether the caller should dive, because the dive is an animation the App owns.
 */
function applyDeepLink(manifest: Manifest): { dive: boolean } {
  const query = new URLSearchParams(window.location.search);
  const store = useStore.getState();

  // Through setHazardMode, not hazardPreset, so the panel arrives in the mode the scene is in.
  // Calling the preset alone left the Variable group offering the four general groups while the
  // Field on screen was a hazard one, with no way back that made sense.
  if (query.get("preset") === "hazard") store.setHazardMode(true);

  // `selectField` puts the panel into cyclone mode when the Field is a hazard one and takes it
  // back out when it is not, so a deep link needs nothing extra here.
  const field = query.get("field");
  if (field && manifest.fields.some((f) => f.key === field)) store.selectField(field);

  // `has` first, and it is not fussiness. `Number(null)` is 0, which is an integer inside the
  // range, so without this every link with no `step` at all silently jumped the app back to the
  // first analysis - and the app is meant to open on the most recent one. Caught by the probe,
  // which reported the fastest current as April's 1.58 m/s when the opening step is July's.
  if (query.has("step")) {
    const step = Number(query.get("step"));
    if (Number.isInteger(step) && step >= 0 && step < manifest.timesteps.length) {
      useStore.setState({ timestepIndex: step });
    }
  }

  if (query.get("iso") === "1") useStore.setState({ isoEnabled: true });
  // The bias map, with its group open. Opening the mode and leaving the panel shut would put
  // the ranked list - which is half of what the mode is - two clicks from the link that
  // promised it. A merge, because the panel's groups are independent.
  // A pin at a named place, so the requirements page can open the drift clause on something
  // rather than on an empty panel. Validated against the region, never trusted.
  const pin = query.get("pin");
  if (pin) {
    const [lon, lat] = pin.split(",").map(Number);
    const box = manifest.volume;
    if (
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      lon! >= box.west &&
      lon! <= box.east &&
      lat! >= box.south &&
      lat! <= box.north
    ) {
      useStore.setState((state) => ({
        driftPin: { lon: lon!, lat: lat! },
        openGroups: { ...state.openGroups, drift: true },
      }));
    }
  }

  // A section, as four numbers. The requirements page opens the clause on a real cut rather
  // than on an empty panel, and every one of them is checked against the region before it is
  // believed - the same rule the Field key and the Timestep index go through above.
  const line = query.get("section");
  if (line) {
    const [a, b, c, d] = line.split(",").map(Number);
    const box = manifest.volume;
    const inside = (lon?: number, lat?: number) =>
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      lon! >= box.west &&
      lon! <= box.east &&
      lat! >= box.south &&
      lat! <= box.north;
    if (inside(a, b) && inside(c, d)) {
      useStore.setState((state) => ({
        sectionFrom: { lon: a!, lat: b! },
        sectionTo: { lon: c!, lat: d! },
        openGroups: { ...state.openGroups, section: true },
      }));
    }
  }

  if (query.get("bias") === "1") {
    useStore.setState((state) => ({
      biasMode: true,
      openGroups: { ...state.openGroups, bias: true },
    }));
  }
  if (query.get("scale") === "log") useStore.setState({ scale: "log" });
  if (query.get("tour") === "1") useStore.setState({ tourStep: 0 });
  if (query.get("float")) useStore.setState({ selectedFloatId: query.get("float") });
  if (query.get("flow") === "arrows") useStore.setState({ currentStyle: "arrows" });
  if (query.get("explore") === "1") useStore.setState({ explore: true });
  // Kiosk implies the dive, because the exhibition loop is about the block of water and a screen
  // that opens on a globe and jumps into the water ten seconds later looks broken from across a
  // room. It also closes Explore: the two are the same content and only one can be on screen.
  if (query.get("kiosk") === "1") useStore.setState({ kiosk: true, explore: false });

  return { dive: query.get("dive") === "1" || query.get("kiosk") === "1" };
}

/**
 * Signed bias per instrument, as a fraction of the Field's own range, **and where it was
 * measured**.
 *
 * The position travels with the number and is not optional. A residual was measured at one
 * cast on one date; the scene used to draw it wherever the float had drifted to by the Timestep
 * on screen, which is a number painted on the wrong water and is exactly what `positions_from`
 * exists to prevent on the pipeline side. Small today only by luck - 94% of the comparisons sit
 * on the last two steps - and one re-bake from mattering.
 *
 * A Map rather than a lookup through the array on every marker: 233 instruments times 60 frames
 * a second is 14,000 linear scans a second for a number that changes only when the Field does.
 */
function biasMap(residuals: FieldResiduals | null): Map<string, BiasMark> | null {
  if (!residuals) return null;
  const out = new Map<string, BiasMark>();
  for (const row of residuals.instruments) {
    if (row.scaledBias !== null) out.set(row.id, { bias: row.scaledBias, lon: row.lon, lat: row.lat });
  }
  return out;
}

/**
 * The Timesteps a drift integration from `index` over `days` actually needs.
 *
 * The analyses are ten days apart, so a ten-day trajectory spans two of them and a thirty-day
 * one spans four. Fetching all twelve would be 4.6 MB for a question that touches two files.
 */
function stepsForDrift(index: number, days: number, count: number): number[] {
  const span = Math.ceil(days / 10) + 1;
  const out: number[] = [];
  for (let i = index; i < Math.min(index + span, count); i++) out.push(i);
  // A trajectory started at the last analysis has nothing after it to interpolate towards, and
  // `velocityAt` holds the end rather than extrapolating - so one file is a legitimate answer.
  return out.length ? out : [Math.min(index, count - 1)];
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OceanScene | null>(null);
  const [ready, setReady] = useState(false);
  const deepLink = useRef<{ dive: boolean } | null>(null);
  const dived = useRef(false);
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
          // The Variable selector shows one Field Group at a time, so the opening tab has to be
          // the one holding the opening Field. Set here rather than left at the store's default,
          // because the first Field is whatever the manifest lists first.
          fieldGroupTab: first?.group ?? "state",
        });

        // Anything the query string asked for, applied once the manifest is in - it is what
        // validates the Field key and the Timestep index. The dive is handled by the effect
        // below, because it needs the scene to exist first.
        deepLink.current = applyDeepLink(manifest);

        // The bias map's numbers, also in the background but far ahead of the charts: 151 KB
        // against 10.5 MB. A bake made before this file existed simply has no bias map, and the
        // panel says so rather than the app refusing to start.
        loadResiduals()
          .then((residuals) => {
            if (!cancelled) useStore.setState({ residuals });
          })
          .catch(() => undefined);

        // The drift check: 560 KB of "where the currents said each float would go against where
        // it went". Same treatment - off the critical path, and its absence is a missing panel
        // rather than a broken app, because a bake that could not reach Copernicus has no
        // current field to have integrated.
        loadDrift()
          .then((bakedDrift) => {
            if (!cancelled) useStore.setState({ bakedDrift });
          })
          .catch(() => undefined);

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
    // A hazard Field has no Volume at all - it is a depth or a column total, and there is
    // nothing for a ray to march through. The scene hides the Volume for those rather than
    // leaving the last Field's texture on the GPU under this Field's name.
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

  // A `?dive=1` link lands the reader inside the water rather than on the globe. Once, and only
  // after the scene is up: the dive drives the camera, so there has to be a camera.
  useEffect(() => {
    if (!ready || dived.current || !deepLink.current?.dive) return;
    dived.current = true;
    dive(true);
  }, [ready]);

  // ---- Fields that are not Volumes ----------------------------------------
  //
  // The five hazard Fields ship as float32 on the Grid's own axes: 8 KB a file, so once one has
  // arrived it is simply kept. They are never byte-quantised, because a reader reads a depth in
  // metres straight off them and that is the project's first rule.
  useEffect(() => {
    const { manifest, fieldKey, timestepIndex, surfaces } = store;
    const path = manifest?.surfaceFiles?.[fieldKey]?.[timestepIndex];
    if (!manifest || !path) return;
    const key = `${fieldKey}|${timestepIndex}`;
    if (surfaces[key]) return;

    let cancelled = false;
    loadSurfaceField(path, manifest.volume.width, manifest.volume.height)
      .then((surface) => {
        if (!cancelled) {
          useStore.setState((state) => ({ surfaces: { ...state.surfaces, [key]: surface } }));
        }
      })
      .catch(() =>
        useStore.setState({ notice: `Could not load ${fieldKey} for this step.` }),
      );
    return () => {
      cancelled = true;
    };
  }, [ready, store.manifest, store.fieldKey, store.timestepIndex, store.surfaces]);

  // ---- current vectors -----------------------------------------------------
  //
  // 387 KB a Timestep, so they are fetched only when somebody selects the Field. This is the
  // Grid rather than a Volume: the length of every arrow is a measurement, which is the whole
  // difference between this and the rendered image it replaced. ADR 0013.
  useEffect(() => {
    const { manifest, fieldKey, timestepIndex, vectors } = store;
    const spec = manifest?.currents;
    if (!manifest || !spec || fieldKey !== spec.field) return;
    if (vectors[timestepIndex]) return;
    const path = spec.files[timestepIndex];
    if (!path) return;

    let cancelled = false;
    loadVectorField(path, spec.levels, spec.width, spec.height)
      .then((field) => {
        if (!cancelled) {
          useStore.setState((state) => ({
            vectors: { ...state.vectors, [timestepIndex]: field },
          }));
        }
      })
      .catch(() =>
        useStore.setState({ notice: "Could not load the currents for this step." }),
      );
    return () => {
      cancelled = true;
    };
  }, [ready, store.manifest, store.fieldKey, store.timestepIndex, store.vectors]);

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

  // ---- the current files a drift trajectory needs --------------------------
  //
  // The arrows fetch only the Timestep on screen. A trajectory crosses several, so it asks for
  // the ones it will actually read and nothing more - and it asks only while a pin is down.
  useEffect(() => {
    const { manifest, driftPin, driftDays, timestepIndex, vectors } = store;
    const spec = manifest?.currents;
    if (!ready || !manifest || !spec || !driftPin) return;
    for (const index of stepsForDrift(timestepIndex, driftDays, manifest.timesteps.length)) {
      if (vectors[index]) continue;
      const path = spec.files[index];
      if (!path) continue;
      loadVectorField(path, spec.levels, spec.width, spec.height)
        .then((field) => {
          useStore.setState((state) => ({ vectors: { ...state.vectors, [index]: field } }));
        })
        .catch(() => undefined);
    }
  }, [ready, store.manifest, store.driftPin, store.driftDays, store.timestepIndex, store.vectors]);

  // ---- the native Grid a vertical section is cut from ----------------------
  //
  // 194 KB per Field per Timestep, and only fetched while a line exists. It is the Grid rather
  // than the Volume because a section is a chart somebody reads metres and degrees off - the
  // first rule in CLAUDE.md - and it ships baked rather than through the API so the section
  // works on the static deployment and with the network unplugged.
  useEffect(() => {
    const { manifest, fieldKey, timestepIndex, sectionFrom, sectionTo, nativeGrids } = store;
    if (!ready || !manifest || !sectionFrom || !sectionTo) return;
    const path = manifest.gridFiles?.[fieldKey]?.[timestepIndex];
    if (!path) return;
    const key = `${fieldKey}|${timestepIndex}`;
    if (nativeGrids[key]) return;
    const { width, height, levelMetres } = manifest.volume;
    loadNativeGrid(path, (levelMetres ?? []).length, width, height)
      .then((grid) => {
        useStore.setState((state) => ({ nativeGrids: { ...state.nativeGrids, [key]: grid } }));
      })
      .catch(() => undefined);
  }, [
    ready,
    store.manifest,
    store.fieldKey,
    store.timestepIndex,
    store.sectionFrom,
    store.sectionTo,
    store.nativeGrids,
  ]);

  // ---- the drift trajectory itself -----------------------------------------
  //
  // Integrated here rather than stored, because it is a pure function of the pin, the depth, the
  // span and the files that have arrived - and keeping a derived trajectory in the store is how
  // it ends up one frame behind the control that changed it.
  const driftPath = (() => {
    const { manifest, driftPin, driftDays, timestepIndex, vectors, depthFrom } = store;
    if (!manifest || !driftPin) return null;
    // Every Timestep the integration will read, or nothing at all.
    //
    // Integrating with only some of them loaded does not fail - `velocityAt` holds the last
    // field it has rather than extrapolating - it produces a *different, shorter-informed*
    // trajectory that then changes under the reader as the rest of the files land. A readout
    // that says 74 km and settles at 91 km was wrong when it was read, which is worse than a
    // readout that says it is still loading.
    const indices = stepsForDrift(timestepIndex, driftDays, manifest.timesteps.length);
    if (!indices.every((i) => vectors[i])) return null;
    const currents: LoadedCurrents = {
      volume: manifest.volume,
      timesMs: indices.map((i) => new Date(manifest.timesteps[i] ?? 0).getTime()),
      fields: indices.map((i) => vectors[i]!),
    };
    const path = integrateDrift(
      currents,
      driftPin.lon,
      driftPin.lat,
      new Date(manifest.timesteps[timestepIndex] ?? 0).getTime(),
      axisToDepth(manifest.volume, depthFrom),
      driftDays * 24,
    );
    return path;
  })();

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
      field: store.field() ?? null,
      paletteColours: store.manifest?.palettes[store.field()?.palette ?? ""] ?? [],
      scale: store.scale,
      surface: store.surfaces[`${store.fieldKey}|${store.timestepIndex}`] ?? null,
      vectors: store.vectors[store.timestepIndex] ?? null,
      currentStyle: store.currentStyle,
      anomalies: store.features(),
      showAnomalies: store.showAnomalies,
      selectedAnomaly: store.selectedAnomaly,
      isolateAnomaly: store.isolateAnomaly,
      biasMode: store.biasMode,
      // Built here rather than in the scene, because the scene has no idea which Field is
      // collocated and should not learn: a Field with no comparison simply produces no map.
      biasByInstrument: biasMap(store.fieldResiduals()),
      biasSaturateAt: store.fieldResiduals()?.summary.p90ScaledAbs ?? undefined,
      driftPath: driftPath ? driftPath.steps.map((p) => [p.lon, p.lat] as [number, number]) : null,
      driftPin: store.driftPin,
      // The baked trajectory, not a live one: the numbers the panel quotes are the ones
      // `drift.py` produced and the tests cover, so the line has to be the same line.
      predictedTrack:
        store.showDriftCheck && store.selectedFloatId
          ? store.bakedDrift?.floats[store.selectedFloatId]?.path ?? null
          : null,
      sectionLine:
        store.sectionFrom && store.sectionTo
          ? [
              [store.sectionFrom.lon, store.sectionFrom.lat],
              [store.sectionTo.lon, store.sectionTo.lat],
            ]
          : null,
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

    // Dropping a drift pin takes the click outright. It is an explicitly armed mode - the panel
    // says "click the water" and the cursor is a crosshair - so a click that also selected the
    // float underneath would do two things nobody asked for one of.
    // Drawing a section takes the click the same way, and in two stages: the first sets the
    // start and the second the end. Two clicks rather than a drag, because a drag on this canvas
    // is how the camera is rotated and taking that away would cost more than it bought.
    const placing = useStore.getState().placingSection;
    if (placing > 0) {
      const at = scene.pickWater(event.clientX, event.clientY);
      if (at) {
        if (placing === 1) {
          useStore.setState({ sectionFrom: at, sectionTo: null, placingSection: 2 });
        } else {
          useStore.setState({ sectionTo: at, placingSection: 0, touched: "section" });
        }
      }
      return;
    }

    if (useStore.getState().placingDriftPin) {
      const at = scene.pickWater(event.clientX, event.clientY);
      if (at) useStore.setState({ driftPin: at, placingDriftPin: false, touched: "drift" });
      return;
    }

    const float = scene.pickFloat(event.clientX, event.clientY);
    if (float) {
      // `touched: null` so the comparison, not the guide, takes the right-hand panel. The two
      // share that space and the rule is "whichever question was asked last"; picking an
      // instrument is a question about that instrument.
      useStore.setState({
        selectedFloatId: float.id,
        selectedAnomaly: null,
        isolateAnomaly: false,
        touched: null,
      });
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
      useStore.setState({ selectedFloatId: chosen.id, selectedAnomaly: null, touched: null });
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
    const state = useStore.getState();
    event.currentTarget.style.cursor =
      state.placingDriftPin || state.placingSection > 0
        ? "crosshair"
        : hit
          ? "pointer"
          : "grab";

    // The speed under the cursor, which is the whole difference between a current Field and the
    // picture it replaced. Null everywhere it cannot honestly be answered, and the panel says
    // "move the cursor over the water" rather than showing a stale number.
    const current = scene.pickCurrent(event.clientX, event.clientY);
    if (current !== useStore.getState().hoverCurrent) useStore.setState({ hoverCurrent: current });
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
    // Kiosk is a class on the root rather than a prop threaded through nine components: what it
    // does is hide chrome and scale type, which is entirely a styling question, and every panel
    // stays mounted so leaving the mode with Escape puts the console straight back.
    <div className={`app${store.kiosk ? " kiosk" : ""}`}>
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
          <Controls
            drift={driftPath}
            onFocus={(lon, lat) => sceneRef.current?.focusOn(lon, lat)}
            /* A 5 degree box is not a Float. `focusOn`'s fixed radius is right for a point and
               collapses the frame to a diagonal for a body five degrees across, so the bias
               map's worst box pans rather than zooming. Same rule as the Anomaly panel. */
            onPan={(lon, lat) => sceneRef.current?.panTo(lon, lat)}
          />
          <GuidePanel />
          <AnomalyPanel onPan={(lon, lat) => sceneRef.current?.panTo(lon, lat)} />
          <ProfilePanel onFocus={(lon, lat) => sceneRef.current?.focusOn(lon, lat)} />
          <SectionPanel />
          <Timeline />
          <Tour onDive={dive} />
          <Explore
            helpers={{
              focusOn: (lon, lat) => sceneRef.current?.focusOn(lon, lat),
              panTo: (lon, lat) => sceneRef.current?.panTo(lon, lat),
            }}
          />
        </>
      )}
    </div>
  );
}
