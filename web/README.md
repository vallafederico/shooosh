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
`/llms.txt`, `/agents.md`, `/docs/agent-dom-rendering.md`, the DOM/MSDF references and the model/rig guides are generated from repository
Markdown at build time, with relative repository links resolved to GitHub.

The car and homepage can assets are locally prepared, not checked into Git.
The homepage requires `web/public/can/` (mesh binaries and PBR maps); generate
it with `web/scripts/prepare-can.mjs` before building production. Before a deployment
that includes the car studio and imported rig, copy `harness/public/car-pbr/` and
`harness/public/rig/` into `web/public/` (see the example copy guides for generation).
Build and deploy locally with `vercel build --prod` and
`vercel deploy --prebuilt --prod` so the generated assets are included. The
built-in rig and procedural examples work without these optional asset folders.


Force renderer checks with `/?backend=webgl` (WebGL2) or `/?backend=webgpu`.
`webgl2` remains an accepted alias; no parameter uses automatic selection. The
same choices work on `/dom` and `/examples`. Homepage nav/HUD use Tailwind
`z-10`; their mirrored children inherit that stacking context for GPU draw order.

The homepage's single-pass bulge converts the mouse Y coordinate to bottom-origin
for WebGL2 and top-origin for WebGPU (`bulgePointerY`). This is specific to the
current post chain; recheck orientation when changing its pass layout. Do not flip
DOM/item texture UVs to compensate for post-effect pointer coordinates.

## Scrolling

Touch uses Lenis `syncTouch: true` with 1:1 travel (`touchMultiplier: 1`), a short
release tail (`syncTouchLerp: 0.15`, `touchInertiaExponent: 1.5`), and native pinch
zoom. These release values are tuning choices, not a reproduction of OS physics.
Do not add a transformed scrolling wrapper or a second easing step to GPU bounds.
`Scroll.useRenderClock(engine)` suspends the app RAF and advances Lenis before the
DOM layer reads layout in the GPU frame. Scroll updates keep the engine awake
through inertia. Release this clock on page teardown to restore the app RAF.
Only one page renderer owns the scroll clock at a time.

Mobile/coarse-pointer rendering is capped at DPR 2 to avoid DPR 6 fullscreen post
passes on DPR 3 devices; desktop retains supersampling. This trades some edge
sampling for frame time. Verify drag, release, direction changes and pinch zoom
on a physical phone with both forced backends. Desktop checks cannot establish
mobile smoothness, and this approach cannot eliminate stutter under main-thread
or GPU overload.
