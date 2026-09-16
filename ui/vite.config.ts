import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createUiDevWatchOptions } from "./src/lib/vite-watch";
import { createApiProxy } from "./src/lib/vite-api-proxy";
import { serviceWorkerBuildIdPlugin } from "./src/lib/vite-sw-build-id";

const apiProxy = createApiProxy();

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), serviceWorkerBuildIdPlugin()],
  build: {
    minify: "esbuild",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("mermaid") || id.includes("cytoscape") || id.includes("katex")) return "vendor-diagram";
          if (id.includes("lexical") || id.includes("MarkdownEditor") || id.includes("MarkdownBody")) return "vendor-editor";
          if (id.includes("lucide-react") || id.includes("@radix-ui") || id.includes("class-variance-authority")) return "vendor-ui";
          if (id.includes("react-router") || id.includes("react-dom")) return "vendor-react";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("zod") || id.includes("date-fns") || id.includes("clsx")) return "vendor-utils";
          return "vendor";
        },
      },
    },
  },
  esbuild:
    mode === "production"
      ? {
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/dist/Lexical.mjs"),
    },
  },
  server: {
    port: 5173,
    watch: createUiDevWatchOptions(process.cwd()),
    proxy: apiProxy,
  },
  preview: {
    port: 3101,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy,
  },
}));
