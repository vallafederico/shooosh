import { expect, test } from "bun:test"
import { modelFitScale } from "./model-fit"

test("perspective sphere fits the DOM box across portrait, landscape and rectangular containers", () => {
  for (const [cw, ch] of [[390, 844], [1440, 900], [900, 1440]]) {
    for (const [w, h] of [[180, 180], [320, 180], [180, 320]]) {
      const radius = 1.1, distance = 2.8, fov = 32
      const scale = modelFitScale(radius, w, h, cw, ch, distance, fov)
      const worldRadius = radius * scale * Math.min(w, h) / Math.max(cw, ch)
      const projectedDiameter = ch / Math.tan(fov * Math.PI / 360) * worldRadius / Math.sqrt(distance ** 2 - worldRadius ** 2)
      expect(projectedDiameter).toBeCloseTo(Math.min(w, h) * 0.92, 6)
      expect(modelFitScale(radius, w * 2, h * 2, cw * 2, ch * 2, distance, fov)).toBeCloseTo(scale, 6)
    }
  }
})
