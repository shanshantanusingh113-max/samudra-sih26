/**
 * The view on screen, written back into a URL.
 *
 * `applyDeepLink` in `App.tsx` has read eleven parameters since the requirements page was built,
 * and `probe-requirements.mjs` follows fourteen such links and checks each one arrived at the
 * control it promised. What was missing was the other direction: a reader looking at something
 * had no way to hand it to anyone.
 *
 * That gap is the whole of the "e-learning initiatives" clause in PS 26067. A teacher writes a
 * worksheet of six links - *open this one and tell me why the water off Somalia is cold in July*
 * - and that is e-learning without an e-learning platform. A forecaster pastes one into a
 * message. A judge sends one to a colleague.
 *
 * **Only what the reader changed goes in.** A URL carrying every default is unreadable and, worse,
 * it pins values the app should be free to improve: a link written today that hard-codes today's
 * opening depth would open tomorrow's app in yesterday's view. Everything here is compared
 * against the store's own initial state and omitted when it matches.
 *
 * Every parameter written here is one `applyDeepLink` reads. `probe-deeplink.mjs` round-trips
 * them: set a view, write the URL, open it in a fresh page, and compare. A writer that emits a
 * parameter the reader ignores is a link that silently loses half of what it promised.
 */

import { useStore } from "./store";

/** The state a fresh session opens in. Anything equal to this is left out of the link. */
interface Defaults {
  fieldKey: string;
  timestepIndex: number;
  scale: string;
  currentStyle: string;
  isoEnabled: boolean;
  biasMode: boolean;
}

/**
 * Read once, at module load, from the store's own initial state.
 *
 * Not a second list of literals. A default typed here would go stale the first time somebody
 * changed the opening Field, and the link would start carrying `field=temperature` on every
 * view - which is harmless until the opening Field changes and every old link is wrong.
 */
const DEFAULTS: Defaults = (() => {
  const state = useStore.getState();
  return {
    fieldKey: state.fieldKey,
    timestepIndex: state.timestepIndex,
    scale: state.scale,
    currentStyle: state.currentStyle,
    isoEnabled: state.isoEnabled,
    biasMode: state.biasMode,
  };
})();

/** Three decimals of a degree is about 111 m, which is finer than any control here can set. */
function place(value: number): string {
  return value.toFixed(3);
}

/**
 * The current view as an absolute URL.
 *
 * The opening Timestep is the exception to the "only what changed" rule: it is written whenever
 * the app is not on its default step, because `applyDeepLink` distinguishes an absent `step`
 * from `step=0` and a link to the first analysis has to survive.
 */
export function currentViewUrl(): string {
  const state = useStore.getState();
  const url = new URL(window.location.href);
  const query = new URLSearchParams();

  if (state.morph > 0.5) query.set("dive", "1");
  if (state.fieldKey !== DEFAULTS.fieldKey) query.set("field", state.fieldKey);
  if (state.timestepIndex !== DEFAULTS.timestepIndex) {
    query.set("step", String(state.timestepIndex));
  }
  if (state.hazardMode) query.set("preset", "hazard");
  if (state.scale !== DEFAULTS.scale) query.set("scale", state.scale);
  if (state.currentStyle !== DEFAULTS.currentStyle) query.set("flow", state.currentStyle);
  if (state.isoEnabled !== DEFAULTS.isoEnabled) query.set("iso", state.isoEnabled ? "1" : "0");
  if (state.biasMode !== DEFAULTS.biasMode) query.set("bias", state.biasMode ? "1" : "0");
  if (state.selectedFloatId) query.set("float", state.selectedFloatId);
  if (state.driftPin) {
    query.set("pin", `${place(state.driftPin.lon)},${place(state.driftPin.lat)}`);
  }
  if (state.sectionFrom && state.sectionTo) {
    query.set(
      "section",
      [
        place(state.sectionFrom.lon),
        place(state.sectionFrom.lat),
        place(state.sectionTo.lon),
        place(state.sectionTo.lat),
      ].join(","),
    );
  }

  url.search = query.toString();
  url.hash = "";
  return url.toString();
}

/**
 * Put the link on the clipboard, and say whether it worked.
 *
 * The clipboard API needs a secure context and a user gesture, and a page opened from a file:
 * URL has neither. Reporting the failure lets the caller show the link instead of silently
 * doing nothing, which is what a copy button that quietly fails looks like from the outside.
 */
export async function copyCurrentView(): Promise<{ url: string; copied: boolean }> {
  const url = currentViewUrl();
  try {
    await navigator.clipboard.writeText(url);
    return { url, copied: true };
  } catch {
    return { url, copied: false };
  }
}
