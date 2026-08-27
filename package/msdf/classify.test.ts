import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectMsdfInputs } from "./batch";
import { classifyMsdfSource } from "./classify";
import { parseMsdfArgs, runMsdfCli } from "./cli";

test("classifyMsdfSource maps font and icon extensions", () => {
  expect(classifyMsdfSource("Inter.ttf")).toBe("font");
  expect(classifyMsdfSource("Face.OTF")).toBe("font");
  expect(classifyMsdfSource("logo.svg")).toBe("icon");
  expect(classifyMsdfSource("mark.PNG")).toBe("icon");
  expect(classifyMsdfSource("notes.md")).toBeNull();
  expect(classifyMsdfSource("photo.jpg")).toBeNull();
});

test("parseMsdfArgs reads flags and leftover paths", () => {
  const args = parseMsdfArgs([
    "fonts/",
    "icon.svg",
    "--out",
    "public/msdf",
    "--font-size",
    "256",
    "--range",
    "10",
    "--field",
    "msdf",
    "--icon-size",
    "512",
    "--spread",
    "32",
    "--layout",
    "flat",
    "--charset",
    "ABC",
  ]);
  expect(args.inputs).toEqual(["fonts/", "icon.svg"]);
  expect(args.outDir).toBe("public/msdf");
  expect(args.fontSize).toBe(256);
  expect(args.distanceRange).toBe(10);
  expect(args.fieldType).toBe("msdf");
  expect(args.iconSize).toBe(512);
  expect(args.spread).toBe(32);
  expect(args.layout).toBe("flat");
  expect(args.charset).toBe("ABC");
});

test("parseMsdfArgs rejects unknown flags and bad --field", () => {
  expect(() => parseMsdfArgs(["--wat"])).toThrow("unknown flag");
  expect(() => parseMsdfArgs(["--field", "png"])).toThrow("sdf or msdf");
  expect(() => parseMsdfArgs(["--out"])).toThrow("missing value");
});

test("collectMsdfInputs walks directories and skips node_modules", async () => {
  const root = await mkdtemp(join(tmpdir(), "shooosh-msdf-"));
  await mkdir(join(root, "fonts"), { recursive: true });
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(root, "fonts", "Inter.ttf"), "x");
  await writeFile(join(root, "logo.svg"), "<svg/>");
  await writeFile(join(root, "readme.md"), "nope");
  await writeFile(join(root, "node_modules", "pkg", "leak.ttf"), "nope");

  const files = await collectMsdfInputs([root]);
  expect(files.some((f) => f.endsWith("Inter.ttf"))).toBe(true);
  expect(files.some((f) => f.endsWith("logo.svg"))).toBe(true);
  expect(files.some((f) => f.endsWith("readme.md"))).toBe(true);
  expect(files.some((f) => f.includes("node_modules"))).toBe(false);
});

test("collectMsdfInputs throws on a missing path", async () => {
  await expect(collectMsdfInputs(["/no/such/shooosh-msdf-input"])).rejects.toThrow(
    "cannot read",
  );
});

test("runMsdfCli --help exits 0", async () => {
  expect(await runMsdfCli(["--help"])).toBe(0);
});

test("runMsdfCli without --out or inputs exits 1", async () => {
  expect(await runMsdfCli([])).toBe(1);
  expect(await runMsdfCli(["notes.txt"])).toBe(1);
});

test("runMsdfCli exits 1 when every input is skipped", async () => {
  const root = await mkdtemp(join(tmpdir(), "shooosh-msdf-cli-"));
  const notes = join(root, "notes.txt");
  await writeFile(notes, "hello");
  expect(await runMsdfCli([notes, "--out", join(root, "out")])).toBe(1);
});
