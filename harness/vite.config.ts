import { shoooshShaders } from "../package/build/index.ts"
import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

export default defineConfig(({ mode }) => ({
  plugins: [shoooshShaders()],
  build: ["shake", "perf", "backend"].includes(mode) ? {
    outDir: `dist/${mode}`,
    rollupOptions: { input: fileURLToPath(new URL(`./${mode}.html`, import.meta.url)) },
  } : undefined,
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      "shooosh/webgl2/dom": fileURLToPath(new URL("../dist/webgl2/dom/esm.js", import.meta.url)),
      "shooosh/webgpu/dom": fileURLToPath(new URL("../dist/webgpu/dom/esm.js", import.meta.url)),
      "shooosh/webgl2": fileURLToPath(new URL("../dist/webgl2/esm.js", import.meta.url)),
      "shooosh/webgpu": fileURLToPath(new URL("../dist/webgpu/esm.js", import.meta.url)),
      "shooosh/compiler": fileURLToPath(new URL("../package/compiler/index.ts", import.meta.url)),
      "shooosh/utils": fileURLToPath(new URL("../package/utils/index.ts", import.meta.url)),
      "shooosh/utility": fileURLToPath(new URL("../package/utility/index.ts", import.meta.url)),
      "shooosh/dom": fileURLToPath(new URL("../package/dom/index.ts", import.meta.url)),
      shooosh: fileURLToPath(new URL("../package/index.ts", import.meta.url)),
    },
  },
}))
