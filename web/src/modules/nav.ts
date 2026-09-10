export default function nav(element: HTMLElement) {
  const status = document.createElement("span")
  status.className = "sr-only"
  status.setAttribute("role", "status")
  element.append(status)
  const copy = async (event: Event) => {
    const button = (event.target as Element)?.closest<HTMLButtonElement>("[data-copy-install]")
    if (!button) return
    const command = button.textContent?.trim() ?? ""
    try {
      await navigator.clipboard.writeText(command)
      status.textContent = `Copied ${command}`
    } catch {
      status.textContent = `Copy this command: ${command}`
    }
  }
  element.addEventListener("click", copy)
  return () => { element.removeEventListener("click", copy); status.remove() }
}
