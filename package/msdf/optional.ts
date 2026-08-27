export async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    throw new Error(
      "shooosh/msdf icons need `sharp`. Install it in the project:\n  pnpm add -D sharp",
    );
  }
}

export async function loadBmfont() {
  try {
    return (await import("msdf-bmfont-xml")).default;
  } catch {
    throw new Error(
      "shooosh/msdf fonts need `msdf-bmfont-xml`. Install it in the project:\n  pnpm add -D msdf-bmfont-xml",
    );
  }
}
