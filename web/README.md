# Marketing site

Astro static site for **https://shooo.sh**. Run `pnpm dev:web` from the repository
root, or `pnpm --filter web build` to generate `web/dist/`.
The footer reads the library version from the root `package.json` at build time.

## Connect to Vercel

1. Import the `vallafederico/shooosh` GitHub repository into Vercel.
2. Set **Root Directory** to `web` and enable **Include source files outside of
   the Root Directory in the Build Step**. The site imports the local library and
   shader plugin from `../package`, as well as the root version metadata.
3. Use the **Astro** preset and **main** production branch. `web/vercel.json`
   sets the build command to `pnpm build` and output directory to `dist`.
   Use `pnpm install --frozen-lockfile` as the install command for the workspace.
4. Deploy, then add **shooo.sh** under the project's **Settings → Domains**.
   Apply the DNS records Vercel displays at your DNS provider and wait for domain
   verification and HTTPS provisioning. The Astro `site` setting alone does not
   attach the domain or change DNS.

No server adapter or environment variables are required. The site builds its
shader artifacts directly from package source; the library's Bun release build
is not required for this deployment.

See Vercel's [monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq)
and [custom domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## Examples and agent docs

`/examples` reuses the harness catalog, controls and mounts. The landing page does
not import the gallery. Deep-link with `?demo=rig-bones&backend=webgpu` or
`?demo=car-pbr&backend=webgl2`; both `/examples` and `/examples/` use root asset URLs.
`/llms.txt`, `/agents.md` and the model/rig guides are generated from repository
Markdown at build time, with relative repository links resolved to GitHub.

The car assets are locally prepared, not checked into Git. Before a deployment
that includes the car studio and imported rig, copy `harness/public/car-pbr/` and
`harness/public/rig/` into `web/public/` (see the example copy guides for generation).
Build and deploy locally with `vercel build --prod` and
`vercel deploy --prebuilt --prod` so the generated assets are included. The
built-in rig and procedural examples work without these optional asset folders.
