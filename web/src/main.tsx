import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { useStore } from "./store";

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");

// Deliberately not wrapped in StrictMode: its double-invoked effects would create and tear down
// a second WebGL context and a second set of 3D textures on every mount, which on integrated
// graphics is both slow and occasionally fatal.
// Exposed so the screenshot harness (and a demo operator) can drive the view directly.
(window as unknown as Record<string, unknown>).__store = useStore;

createRoot(container).render(<App />);
