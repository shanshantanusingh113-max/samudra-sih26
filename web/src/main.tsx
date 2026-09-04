import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import * as drift from "./drift";
import * as guide from "./guide";
import * as deeplink from "./deeplink";
import * as explore from "./explore";
import * as particles from "./particles";
import * as tour from "./ui/Tour";
import * as section from "./section";
import { applyTheme, storedTheme, useStore } from "./store";

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");

// Deliberately not wrapped in StrictMode: its double-invoked effects would create and tear down
// a second WebGL context and a second set of 3D textures on every mount, which on integrated
// graphics is both slow and occasionally fatal.
// Exposed so the screenshot harness (and a demo operator) can drive the view directly.
applyTheme(storedTheme());
(window as unknown as Record<string, unknown>).__store = useStore;
// The drift integrator, exposed for `probe-drift.mjs`. It is this project's one deliberate
// second implementation of a piece of science - `pipeline/samudra/drift.py` is the tested one -
// so the probe runs THIS code from the same start points as the baked trajectories and fails if
// they disagree. Exposing it is what makes the shipped module the thing measured, rather than a
// copy of it written into the probe.
(window as unknown as Record<string, unknown>).__drift = drift;
// Same arrangement for the vertical section: `probe-section.mjs` cuts the same line with
// this module and with `/api/section`, and fails if the two disagree.
(window as unknown as Record<string, unknown>).__section = section;
// The guide, exposed for `probe-guide.mjs`. CLAUDE.md's rule is that a control without an entry
// is worse than no control, and `GUIDE` is a plain record - a missing key shows nothing and says
// nothing about it. The probe reads the ids the panel actually renders and asks this for each.
(window as unknown as Record<string, unknown>).__guide = guide;
// The particle flow, exposed for `probe-particles.mjs`. The dots and the scored drift model
// share `midpointStep` and `sample` in `drift.ts`, and the probe runs a particle from a drift
// pin's own start point and fails if the two land in different places. A shared step rule that
// nothing checks is a shared step rule until somebody edits one of them.
(window as unknown as Record<string, unknown>).__particles = particles;
// The tour, exposed for `probe-tour.mjs`. Its claim is that it walks every control on the
// platform, and `tourCoverage()` answers that from the shipped steps rather than from a
// second list in the probe that would go stale the first time a control was added.
(window as unknown as Record<string, unknown>).__tour = tour;
// The outreach half, exposed for `probe-outreach.mjs`: the questions themselves, and the writer
// that turns the view on screen back into a link. The probe runs each question and checks the
// state it lands on against what its card promised, and round-trips a written link through
// the reader that has been in `App.tsx` since the requirements page was built.
(window as unknown as Record<string, unknown>).__explore = explore;
(window as unknown as Record<string, unknown>).__deeplink = deeplink;

createRoot(container).render(<App />);
