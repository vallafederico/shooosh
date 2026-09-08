import { defineConfig } from "astro/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  site: "https://shooosh.federic.ooo",
  devToolbar: { enabled: false },
  vite: {
    resolve: {
      alias: {
        "shooosh/utility": fileURLToPath(new URL("../package/utility/index.ts", import.meta.url)),
        "shooosh/dom": fileURLToPath(new URL("../package/dom/index.ts", import.meta.url)),
        shooosh: fileURLToPath(new URL("../package/index.ts", import.meta.url)),
      },
    },
  },
})
