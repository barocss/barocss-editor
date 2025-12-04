import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true, outDir: 'dist' })],
  build: {
    lib: { entry: "src/index.ts", name: "BarocssDatastore", fileName: "index", formats: ["es"] },
    rollupOptions: { external: ["@barocss/schema", "@barocss/model"] }
  }
});
