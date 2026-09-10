import { defineConfig } from "@apps-in-toss/web-framework/config";
export default defineConfig({
  // Replace with the exact appName registered in the Toss console before upload.
  appName: "formula-game",
  brand: { primaryColor: "#3182f6" },
  permissions: [],
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    theme: "light",
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
  },
  webBundleDir: "dist",
});
