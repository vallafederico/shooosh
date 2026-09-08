import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

export default defineConfig(({ mode }) => ({
  build: ["shake", "perf"].includes(mode) ? {
    outDir: `dist/${mode}`,
    rollupOptions: { input: fileURLToPath(new URL(`./${mode}.html`, import.meta.url)) },
  } : undefined,
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      "shooosh/utility": fileURLToPath(new URL("../package/utility/index.ts", import.meta.url)),
      "shooosh/dom": fileURLToPath(new URL("../package/dom/index.ts", import.meta.url)),
      shooosh: fileURLToPath(new URL("../package/index.ts", import.meta.url)),
    },
  },
}))
