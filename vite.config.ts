import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    // VAPID public key is intentionally public — required by browser push API
    "import.meta.env.VITE_VAPID_PUBLIC_KEY": JSON.stringify(
      "BBz95Jozfe6VXGKyN5b5eqQ9vVNTSYDl72BNAppEpfEWfyOLjUHvXAb4qqFezHQTU1xQ1WRO1Gwkd_dT5HBXSj4"
    ),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
