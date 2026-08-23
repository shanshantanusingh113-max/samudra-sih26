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
      },
    },
  },
});
