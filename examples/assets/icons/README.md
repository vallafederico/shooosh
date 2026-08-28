# Sample SVG icons

Bake with the Node/Bun toolchain (not the site bundle):

```shell
pnpm add -D sharp msdf-bmfont-xml
pnpm msdf -- examples/assets/icons --out public/msdf
```

Then `loadTexture("/msdf/icons/mark.png")` + `createItem` (see [`sdf-icons.ts`](../../sdf-icons.ts)).

The harness demo builds matching SDFs in the browser via [`make-sdf.ts`](../../make-sdf.ts) so no bake is required to try the look.
