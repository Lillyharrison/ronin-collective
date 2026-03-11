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
      "BPFGbcA2heLUjy7QOJ3wwDmys21LrEFt50f48JFcgERZSi6qNlH2QtjKUBJTD93D5I8BQfZrY7ZHhF_Un82MUew"
    ),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
