import { shoooshShaders } from "../package/build/index.ts"
import { defineConfig } from "astro/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  site: "https://shooo.sh",
  devToolbar: { enabled: false },
  vite: {
    plugins: [shoooshShaders()],
    resolve: {
      alias: {
        "shooosh/compiler": fileURLToPath(new URL("../package/compiler/index.ts", import.meta.url)),
        "shooosh/rig": fileURLToPath(new URL("../package/rig/index.ts", import.meta.url)),
        "shooosh/utils": fileURLToPath(new URL("../package/utils/index.ts", import.meta.url)),
        "shooosh/utility": fileURLToPath(new URL("../package/utility/index.ts", import.meta.url)),
        "shooosh/dom": fileURLToPath(new URL("../package/dom/index.ts", import.meta.url)),
        shooosh: fileURLToPath(new URL("../package/index.ts", import.meta.url)),
      },
    },
  },
})
