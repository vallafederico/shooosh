/** Local poster assets for the DOM example. No network, font, or image dependency. */
export function makeDomPoster(variant: number): string {
  const canvas = document.createElement("canvas")
  canvas.width = 1200
  canvas.height = 800
  const c = canvas.getContext("2d")!
  const palettes = [
    ["#e8e0ce", "#d75a37", "#343cba", "#222927"],
    ["#d5dce5", "#e0ed76", "#295b4a", "#294266"],
    ["#e7cec1", "#a42f38", "#f4ebcf", "#333128"],
  ]
  const [paper, a, b, ink] = palettes[variant % palettes.length]!
  c.fillStyle = paper!
  c.fillRect(0, 0, 1200, 800)
  c.fillStyle = a!
  c.beginPath()
  c.arc(410, 400, 280, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = b!
  c.fillRect(590, 120, 310, 560)
  c.fillStyle = paper!
  c.beginPath()
  c.arc(745, 400, 125, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = ink!
  c.lineWidth = 2
  for (let i = 0; i < 12; i++) {
    c.beginPath()
    c.moveTo(105 + i * 14, 140)
    c.lineTo(105 + i * 14, 660)
    c.stroke()
  }
  c.font = "18px monospace"
  c.fillStyle = ink!
  c.fillText(`SHOOOSH / STUDY 0${variant + 1}`, 55, 58)
  c.fillText("FORM — COLOUR — SPACE", 55, 753)
  c.fillText("1200 × 800", 1010, 753)
  return canvas.toDataURL("image/png")
}
