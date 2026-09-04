import { useEffect, useRef, useState } from "react";
import { QUESTIONS, type ExploreHelpers } from "../explore";
import { useStore } from "../store";

/**
 * The second door, and the exhibition screen behind it.
 *
 * One surface holding every outreach idea, rather than six buttons scattered through a console
 * that is already dense. That is deliberate: the risk with an outreach mode is not that it is
 * hard to build, it is that it fragments the product until nothing has a front door. The console
 * gains exactly one button; everything else lives here.
 *
 * **Explore** is a full-screen list of questions. Press one and it closes, having set the whole
 * scene up - the variable, the date, the way the water is drawn, the camera. Every answer is one
 * a user could have reached themselves; what Explore removes is having to know which control to
 * touch first.
 *
 * **Kiosk** is the same list with nobody standing at it. `?kiosk=1` hides both panels, scales the
 * type up, plays the questions on a loop and - the part that makes the claim true - **puts
 * itself back** after a minute of no input, so the last visitor's dragging does not greet the
 * next one. That is the "exhibitions" clause of PS 26067, which the build answered with nothing
 * at all before this.
 */
export function Explore({ helpers }: { helpers: ExploreHelpers }) {
  const store = useStore();
  const { explore, kiosk, set } = store;

  if (!store.manifest) return null;
  if (kiosk) return <Kiosk helpers={helpers} />;
  if (!explore) return null;

  const ask = (index: number) => {
    const question = QUESTIONS[index];
    if (!question) return;
    // Closed first, so the scene the answer sets up is what the reader sees appear.
    useStore.setState({ explore: false });
    question.run(helpers);
  };

  return (
    <div className="explore" role="dialog" aria-modal="true" aria-label="Explore">
      <div className="explore-inner">
        <header className="explore-head">
          <div>
            <p className="explore-kicker">Explore</p>
            <h1 className="explore-title">What would you like to ask the ocean?</h1>
          </div>
          <button className="ghost" onClick={() => set("explore", false)} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="explore-grid">
          {QUESTIONS.map((question, index) => (
            <button key={question.id} className="explore-card" onClick={() => ask(index)}>
              <span className="explore-question">{question.question}</span>
              <span className="explore-why">{question.why}</span>
              {/*
                * The caveat travels with the question, never behind it.
                *
                * "Where could a cyclone get stronger" is a map of conditions and not a forecast,
                * and the reader this door exists for is exactly the reader who will not make
                * that distinction unprompted. Simplified framing that drifts into being wrong is
                * worse than no framing at all.
                */}
              {question.caution && <span className="explore-caution">{question.caution}</span>}
            </button>
          ))}
        </div>

        <footer className="explore-foot">
          <button
            className="primary"
            onClick={() => useStore.setState({ explore: false, tourStep: 0 })}
          >
            Show me every control instead
          </button>
          <p className="explore-note">
            Nothing here is a separate mode. Every answer is the same platform, set up for you -
            close a panel and you are back in the full console.
          </p>
        </footer>
      </div>
    </div>
  );
}

/** How long each question is held on the exhibition screen. */
const KIOSK_SECONDS = 20;
/** How long after somebody stops touching it before it goes back to the start. */
const IDLE_SECONDS = 60;

/**
 * The exhibition screen.
 *
 * Three behaviours and nothing else: play the questions in order, forever; stop playing the
 * moment somebody touches anything; and go back to the first question a minute after they stop.
 * A visitor can drive it, and the screen repairs itself when they walk away.
 *
 * The caption is the question and its caveat, at exhibition size. Escape leaves - a mode with no
 * way out is a trap, and a stall's operator needs one that does not involve editing a URL.
 */
function Kiosk({ helpers }: { helpers: ExploreHelpers }) {
  const [at, setAt] = useState(0);
  const touchedAt = useRef<number | null>(null);
  // The helpers close over the scene, which is rebuilt on some renders; keeping the latest in a
  // ref means the timers below never need to be torn down and re-created to see a fresh one.
  const latest = useRef(helpers);
  latest.current = helpers;

  useEffect(() => {
    let index = 0;
    const show = (next: number) => {
      index = next % QUESTIONS.length;
      QUESTIONS[index]?.run(latest.current);
      setAt(index);
    };
    show(0);

    const timer = window.setInterval(() => {
      const idleSince = touchedAt.current;
      if (idleSince === null) {
        show(index + 1);
        return;
      }
      // Somebody is, or was, driving. Leave them alone until they have been gone a full minute,
      // then start again from the beginning rather than from wherever they left it.
      if (performance.now() - idleSince > IDLE_SECONDS * 1000) {
        touchedAt.current = null;
        show(0);
      }
    }, KIOSK_SECONDS * 1000);

    const touched = () => {
      touchedAt.current = performance.now();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") useStore.setState({ kiosk: false });
    };
    for (const event of ["pointerdown", "wheel", "keydown"] as const) {
      window.addEventListener(event, touched, { passive: true });
    }
    window.addEventListener("keydown", escape);

    return () => {
      window.clearInterval(timer);
      for (const event of ["pointerdown", "wheel", "keydown"] as const) {
        window.removeEventListener(event, touched);
      }
      window.removeEventListener("keydown", escape);
    };
  }, []);

  const question = QUESTIONS[at];
  if (!question) return null;

  return (
    <aside className="kiosk-caption" role="status" aria-live="polite">
      <p className="kiosk-kicker">Samudra 3D &middot; INCOIS ocean model and Argo floats</p>
      <h1 className="kiosk-question">{question.question}</h1>
      <p className="kiosk-why">{question.why}</p>
      {question.caution && <p className="kiosk-caution">{question.caution}</p>}
      {/* Which of the questions is on screen, so a visitor can see the loop is finite. */}
      <div className="kiosk-dots" aria-hidden="true">
        {QUESTIONS.map((one, index) => (
          <span key={one.id} className={index === at ? "on" : undefined} />
        ))}
      </div>
    </aside>
  );
}
