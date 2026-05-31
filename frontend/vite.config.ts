import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const previewAllowedHosts = (env.PREVIEW_ALLOWED_HOSTS || ".up.railway.app")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react()],
    preview: {
      allowedHosts: previewAllowedHosts,
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      hmr: {
        host: "127.0.0.1",
        clientPort: 5173,
      },
    },
  };
});
