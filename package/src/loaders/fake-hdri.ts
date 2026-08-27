export type CreateFakeHdriOptions = {
  width?: number;
  height?: number;
  skyTop?: string;
  skyBottom?: string;
  groundTop?: string;
  groundBottom?: string;
  sunColor?: string;
};

/**
 * Creates a lightweight equirect-like gradient texture used as a fake HDRI.
 * Bright horizon + sun hotspot gives enough contrast for specular response.
 */
export function createFakeHdriCanvas(
  options: CreateFakeHdriOptions = {},
): HTMLCanvasElement {
  const width = Math.max(64, Math.floor(options.width ?? 1024));
  const height = Math.max(32, Math.floor(options.height ?? 512));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create 2D context for fake HDRI.");
  }

  const skyTop = options.skyTop ?? "#2c3f63";
  const skyBottom = options.skyBottom ?? "#10192b";
  const groundTop = options.groundTop ?? "#18131f";
  const groundBottom = options.groundBottom ?? "#050508";
  const sunColor = options.sunColor ?? "rgba(255, 228, 180, 0.85)";

  // Sky hemisphere.
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.55);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(1, skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, Math.ceil(height * 0.55));

  // Ground hemisphere.
  const ground = ctx.createLinearGradient(0, height * 0.45, 0, height);
  ground.addColorStop(0, groundTop);
  ground.addColorStop(1, groundBottom);
  ctx.fillStyle = ground;
  ctx.fillRect(0, Math.floor(height * 0.45), width, height);

  // Horizon blend gives thin bright rim opportunities without lifting full exposure.
  const horizon = ctx.createLinearGradient(0, height * 0.36, 0, height * 0.66);
  horizon.addColorStop(0, "rgba(255, 191, 134, 0.23)");
  horizon.addColorStop(0.45, "rgba(176, 214, 255, 0.17)");
  horizon.addColorStop(0.62, "rgba(255, 171, 114, 0.12)");
  horizon.addColorStop(1, "rgba(44, 58, 84, 0.0)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 0, width, height);

  // Main warm key hotspot.
  const sunX = width * 0.2;
  const sunY = height * 0.24;
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, width * 0.15);
  sun.addColorStop(0, sunColor);
  sun.addColorStop(0.24, "rgba(255, 231, 190, 0.28)");
  sun.addColorStop(1, "rgba(255, 210, 154, 0.0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  // Secondary cool lobe to add color variety in reflections.
  const coolX = width * 0.72;
  const coolY = height * 0.3;
  const cool = ctx.createRadialGradient(coolX, coolY, 0, coolX, coolY, width * 0.19);
  cool.addColorStop(0, "rgba(168, 214, 255, 0.26)");
  cool.addColorStop(0.32, "rgba(120, 173, 255, 0.17)");
  cool.addColorStop(1, "rgba(88, 120, 170, 0.0)");
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, width, height);

  // Narrow side strip to fake stronger rim highlights on grazing angles.
  const rim = ctx.createLinearGradient(width * 0.88, 0, width, 0);
  rim.addColorStop(0, "rgba(120, 160, 255, 0.0)");
  rim.addColorStop(0.5, "rgba(186, 212, 255, 0.16)");
  rim.addColorStop(1, "rgba(255, 245, 220, 0.33)");
  ctx.fillStyle = rim;
  ctx.fillRect(Math.floor(width * 0.86), 0, width, height);

  // Vignette keeps map overall darker while preserving bright lobes.
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    width * 0.2,
    width * 0.5,
    height * 0.5,
    width * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0.0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Darken top hemisphere by ~50% to keep the sky contribution subdued.
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, width, Math.ceil(height * 0.5));

  return canvas;
}
