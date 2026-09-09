export interface AssetAttribution {
  name: string
  url: string
  note?: string
}
export function attributionHtml(html: string, attribution?: AssetAttribution) {
  if (!attribution) return html.replace("<!-- attribution -->", "")
  const url = new URL(attribution.url)
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Attribution URL must be HTTP(S)")
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
          character
        ]!,
    )
  return html.replace(
    "<!-- attribution -->",
    `<p class="asset-credit">Model by <a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(attribution.name)}</a>${attribution.note ? ` · ${escape(attribution.note)}` : ""}</p>`,
  )
}
