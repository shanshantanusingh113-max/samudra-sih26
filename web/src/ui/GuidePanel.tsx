import { useEffect } from "react";
import { GUIDE, describeView } from "../guide";
import { axisToDepth } from "../scene/geography";
import { useStore } from "../store";

/**
 * The "what am I looking at" panel.
 *
 * Every control on the left is meaningless without this. A slider labelled "Feature emphasis"
 * tells a forecaster nothing; knowing that it makes still water transparent so the thermocline
 * shows through tells them everything, and turns a toy into an instrument.
 *
 * When a control is touched it explains that control. Otherwise it describes the current view.
 * The Collocation panel takes this space when a Float is selected, because at that point the
 * comparison *is* the answer to "what am I looking at".
 */
export function GuidePanel() {
  const store = useStore();
  const { manifest, touched, selectedFloatId, morph, set } = store;
  const spec = store.field();

  // A control explanation is a response to an action, so it should fade rather than stick.
  useEffect(() => {
    if (!touched) return;
    const timer = window.setTimeout(() => set("touched", null), 14000);
    return () => window.clearTimeout(timer);
  }, [touched, set]);

  if (!manifest || !spec || selectedFloatId || morph < 0.5) return null;

  const entry = touched ? GUIDE[touched] : undefined;
  const volume = manifest.volume;

  return (
    <aside className="panel panel-right guide">
      {entry ? (
        <>
          <div className="guide-head">
            <span className={`guide-kind ${entry.kind}`}>{KIND_LABEL[entry.kind]}</span>
            <button className="ghost" onClick={() => set("touched", null)} aria-label="Close">
              ✕
            </button>
          </div>
          <h2 className="guide-title">{entry.title}</h2>

          <dl className="guide-body">
            <dt>What it changes</dt>
            <dd>{entry.does}</dd>
            <dt>What that means</dt>
            <dd>{entry.means}</dd>
            <dt>What to look for</dt>
            <dd>{entry.look}</dd>
          </dl>

          {entry.tryThis && <p className="guide-try">{entry.tryThis}</p>}
        </>
      ) : (
        <>
          <div className="guide-head">
            <span className="guide-kind view">Current view</span>
          </div>
          <h2 className="guide-title">What you are looking at</h2>
          <p className="guide-lede">
            {describeView({
              fieldLabel: spec.label.replace("Sea Water ", ""),
              units: spec.units,
              date: formatDate(manifest.timesteps[store.timestepIndex]),
              fromDepth: axisToDepth(volume, store.depthFrom),
              toDepth: axisToDepth(volume, store.depthTo),
              exaggeration: store.exaggeration,
              isoEnabled: store.isoEnabled,
              isoValue: `${store.toValue(store.isoValue).toFixed(1)} ${spec.units}`,
              floatCount: store.floats.length,
            })}
          </p>
          <p className="guide-hint">
            Touch any control on the left and this panel explains what it does.
          </p>
        </>
      )}
    </aside>
  );
}

const KIND_LABEL: Record<string, string> = {
  science: "Changes the science",
  rendering: "Changes only how it is drawn",
  navigation: "Changes what is shown",
  view: "Current view",
};

function formatDate(stamp: string | undefined): string {
  if (!stamp) return "an unknown date";
  return new Date(stamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
