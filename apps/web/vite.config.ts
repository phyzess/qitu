import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [...tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/health": "http://127.0.0.1:8787",
      "/api": "http://127.0.0.1:8787",
    },
  },
  build: {
    target: "es2024",
  },
});
