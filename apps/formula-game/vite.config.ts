import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import appsInToss from "@apps-in-toss/devtools/unplugin";
export default defineConfig({
  plugins: [appsInToss.vite(), react()],
  resolve: {
    alias: {
      "@barocss/math-editor": fileURLToPath(
        new URL("../../packages/math-editor/src", import.meta.url),
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  server: { host: "0.0.0.0", port: 5186, strictPort: true },
});
