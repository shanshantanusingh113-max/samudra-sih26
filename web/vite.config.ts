import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative, so the same build works at a domain root and under a GitHub Pages sub-path.
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        // The landing page is plain HTML and CSS with no JavaScript, so it paints instantly.
        // The application is a separate entry, and its ~200 KB bundle is only fetched by
        // someone who actually chose to open it.
        landing: "index.html",
        app: "app.html",
        // Provenance is also plain HTML, plus a small inline script that reads the baked
        // manifest so its figures cannot drift out of step with what the platform serves.
        provenance: "provenance.html",
        // The compliance page, on the same terms: every clause of PS 26067 word for word, the
        // measured figure read live from the manifest, and a link that opens the app with the
        // control that answers it already set.
        requirements: "requirements.html",
      },
    },
  },
});
