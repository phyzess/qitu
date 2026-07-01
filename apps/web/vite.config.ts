import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const workerOrigin =
  process.env.QITU_WORKER_ORIGIN ?? `http://127.0.0.1:${process.env.QITU_WORKER_PORT ?? "8787"}`;
const webPort = Number(process.env.QITU_WEB_PORT ?? "5173");

export default defineConfig({
  plugins: [...tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: Number.isInteger(webPort) ? webPort : 5173,
    proxy: {
      "/health": workerOrigin,
      "/api": workerOrigin,
    },
  },
  build: {
    target: "es2024",
  },
});
