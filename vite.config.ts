import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS is opt-in. Default is HTTP so:
//  - preview / inspector tools can reach the dev server
//  - LAN browsers don't have to dismiss a self-signed cert warning
//  - localhost is exempt from the service-worker-requires-HTTPS rule
// To enable HTTPS (for PWA install testing on a phone), run:
//   HTTPS=1 npm run dev
const httpsEnabled = process.env.HTTPS === "1" || process.env.HTTPS === "true";

export default defineConfig({
  plugins: httpsEnabled ? [basicSsl()] : [],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    https: httpsEnabled,
  },
  preview: {
    host: true,
    port: 4173,
    https: httpsEnabled,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
