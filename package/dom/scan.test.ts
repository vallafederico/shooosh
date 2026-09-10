import { describe, expect, test } from "bun:test"
import { queryScanTargets } from "./scan"

function node(tag: string, attrs: Record<string, string> = {}) {
  return { tagName: tag, attrs }
}

function root(nodes: Array<{ tagName: string; attrs: Record<string, string> }>) {
  return {
    querySelectorAll(selector: string) {
      return nodes.filter((el) => {
        if (selector.startsWith("img") && el.tagName !== "IMG") return false
        const attr = selector.includes("data-sh-media") ? "data-sh-media"
          : selector.includes("data-sh-bind") ? "data-sh-bind"
          : selector.includes("data-sh-box") ? "data-sh-box"
          : selector.includes("data-sh-text") ? "data-sh-text" : ""
        return attr ? attr in el.attrs : false
      })
    },
  }
}

describe("DOM page scan targets", () => {
  test("unmarked nodes are ignored", () => {
    const tree = root([
      node("IMG", { src: "a.png" }),
      node("DIV", {}),
      node("IMG", { "data-sh-media": "" }),
      node("DIV", { "data-sh-bind": "" }),
    ])
    const found = queryScanTargets(tree, {
      media: "img[data-sh-media]", bind: "[data-sh-bind]", box: false, text: false,
    })
    expect(found.media).toHaveLength(1)
    expect(found.bind).toHaveLength(1)
  })

  test("an image claimed as media is not also bound", () => {
    const img = node("IMG", { "data-sh-media": "", "data-sh-bind": "" })
    const found = queryScanTargets(root([img]), {
      media: "img[data-sh-media]", bind: "[data-sh-bind]", box: false, text: false,
    })
    expect(found.media).toHaveLength(1)
    expect(found.bind).toHaveLength(0)
  })

  test("false disables a kind", () => {
    const tree = root([
      node("IMG", { "data-sh-media": "" }),
      node("DIV", { "data-sh-bind": "" }),
    ])
    expect(queryScanTargets(tree, { media: false, bind: "[data-sh-bind]", box: false, text: false }).media).toHaveLength(0)
    expect(queryScanTargets(tree, { media: "img[data-sh-media]", bind: false, box: false, text: false }).bind).toHaveLength(0)
  })

  test("text is claimed before box on the same node", () => {
    const el = node("P", { "data-sh-text": "", "data-sh-box": "" })
    const found = queryScanTargets(root([el]), {
      media: false, bind: false, box: "[data-sh-box]", text: "[data-sh-text]",
    })
    expect(found.text).toHaveLength(1)
    expect(found.box).toHaveLength(0)
  })
})
