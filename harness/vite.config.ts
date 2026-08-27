import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

export default defineConfig({
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      shooosh: fileURLToPath(new URL("../package/index.ts", import.meta.url)),
    },
  },
})
