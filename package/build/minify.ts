/** Conservative shader whitespace/comment minification: never rename symbols or merge tokens. */
export function minifyShader(source: string): string {
  // Preprocessor continuation ordering is subtle; preserve these sources verbatim.
  if (/\\\r?\n/.test(source)) return source
  let clean = "", index = 0
  while (index < source.length) {
    if (source.startsWith('//', index)) {
      while (index < source.length && source[index] !== '\n') index++
      clean += ' '
    } else if (source.startsWith('/*', index)) {
      index += 2
      let depth = 1
      while (index < source.length && depth) {
        if (source.startsWith('/*', index)) { depth++; index += 2 }
        else if (source.startsWith('*/', index)) { depth--; index += 2 }
        else { if (source[index] === '\n') clean += '\n'; index++ }
      }
      if (depth) throw new Error('Unterminated shader block comment')
      clean += ' '
    } else if (source[index] === '"' || source[index] === "'") {
      const quote = source[index++]!
      clean += quote
      while (index < source.length) {
        const char = source[index++]!; clean += char
        if (char === '\\' && index < source.length) clean += source[index++]!
        else if (char === quote) break
      }
    } else clean += source[index++]!
  }
  // Keep line boundaries: GLSL directives (including continuations) remain valid.
  // Only trim/collapse horizontal whitespace. Token separators always survive.
  return clean.split('\n').map(line => line.trim().replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\t\r ]+/g, token => /^[\t\r ]/.test(token) ? ' ' : token)).filter(Boolean).join('\n')
}
