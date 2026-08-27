import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMsdf } from "./batch";
import { generateIconSdf } from "./icons";
import { generateFontAtlas } from "./fonts";

const SAMPLE_FONTS = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
];

async function canImport(name: string) {
  try {
    await import(name);
    return true;
  } catch {
    return false;
  }
}

const hasSharp = await canImport("sharp");
const hasBmfont = await canImport("msdf-bmfont-xml");
const fontPath = SAMPLE_FONTS.find((path) => existsSync(path));

test("generateMsdf records a broken font as an error and continues", async () => {
  const root = await mkdtemp(join(tmpdir(), "shooosh-msdf-bad-"));
  const bad = join(root, "broken.ttf");
  const notes = join(root, "notes.txt");
  await writeFile(bad, "not a font");
  await writeFile(notes, "hello");
  const results = await generateMsdf([root], { outDir: join(root, "out") });
  expect(results.some((r) => r.kind === "skip" && r.source === notes)).toBe(true);
  const fail = results.find((r) => r.kind === "error" && r.source === bad);
  expect(fail?.kind).toBe("error");
  expect(fail && fail.kind === "error" ? fail.reason.length : 0).toBeGreaterThan(0);
});

test("generateMsdf skips unknown extensions without calling generators", async () => {
  const root = await mkdtemp(join(tmpdir(), "shooosh-msdf-skip-"));
  const notes = join(root, "notes.txt");
  await writeFile(notes, "hello");
  const outDir = join(root, "out");
  const results = await generateMsdf(notes, { outDir });
  expect(results).toEqual([
    { kind: "skip", source: notes, reason: "unsupported extension" },
  ]);
  expect(existsSync(outDir)).toBe(false);
});

test.skipIf(!hasSharp)(
  "generateIconSdf writes a single-channel PNG + JSON",
  async () => {
    const sharp = (await import("sharp")).default;
    const root = await mkdtemp(join(tmpdir(), "shooosh-msdf-icon-"));
    const source = join(root, "mark.png");
    const pixels = Buffer.alloc(32 * 32 * 4);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) pixels[(y * 32 + x) * 4 + 3] = 255;
    }
    await sharp(pixels, { raw: { width: 32, height: 32, channels: 4 } })
      .png()
      .toFile(source);

    const outDir = join(root, "out");
    const result = await generateIconSdf(source, { outDir, spread: 4 });
    expect(existsSync(result.pngPath)).toBe(true);
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(result.meta).toEqual({
      type: "sdf",
      width: 32,
      height: 32,
      spread: 4,
    });
  },
);

test.skipIf(!fontPath || !hasBmfont)(
  "generateFontAtlas writes a bmfont JSON + atlas PNG",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "shooosh-msdf-font-"));
    const result = await generateFontAtlas(fontPath!, {
      outDir: root,
      fontSize: 32,
      charset: "AB",
      textureSize: [256, 256],
    });
    expect(result.fieldType).toBe("sdf");
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(result.textures.length).toBeGreaterThan(0);
    expect(existsSync(result.textures[0]!)).toBe(true);
    const json = JSON.parse(await Bun.file(result.jsonPath).text()) as {
      chars?: unknown[];
    };
    expect(Array.isArray(json.chars) || "pages" in json).toBe(true);
  },
);
