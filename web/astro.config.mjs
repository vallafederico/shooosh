import { defineConfig } from "astro/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  site: "https://shooosh.federic.ooo",
  devToolbar: { enabled: false },
  vite: {
    resolve: {
      alias: {
        shooosh: fileURLToPath(new URL("../package/index.ts", import.meta.url)),
      },
    },
  },
})
