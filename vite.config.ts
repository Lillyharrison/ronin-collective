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
      "BI9YhdpluMTR1nlU-sQUE8CK1ibnhd1QMI6nSWwofcU2SxqxVEMXu2Fctf5g1HrdkhvI7D_S940BA3qHUYcmD-w"
    ),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
