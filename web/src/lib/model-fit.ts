/** Fit a centered bounding sphere into a DOM box using createObject's placement. */
export function modelFitScale(radius: number, width: number, height: number,
  canvasWidth: number, canvasHeight: number, distance: number, fov: number, fill = 0.92) {
  if (Math.min(radius, width, height, canvasWidth, canvasHeight, distance) <= 0) return 0.001
  const edge = Math.min(width, height)
  const placementScale = edge / Math.max(canvasWidth, canvasHeight)
  const focalLength = 1 / Math.tan(fov * Math.PI / 360)
  const targetRadiusNdc = fill * edge / canvasHeight
  // Perspective silhouette of a sphere: f * R / sqrt(distance² - R²).
  const worldRadius = distance * targetRadiusNdc / Math.hypot(focalLength, targetRadiusNdc)
  return worldRadius / (radius * placementScale)
}
