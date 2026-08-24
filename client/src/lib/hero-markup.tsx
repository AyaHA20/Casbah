import type { ReactNode } from 'react'

/**
 * Renders the owner's heading markup.
 *
 *   *word*   -> green
 *   **word** -> rust
 *
 * Deliberately tiny: the shop owner edits this in a plain input, so the only
 * thing that can go wrong is an unmatched asterisk, which falls through as
 * literal text rather than breaking the page. Anything richer would need an
 * editor, and the hero is one line.
 *
 * Double asterisks are matched first — otherwise `**x**` would be read as an
 * empty single-asterisk span followed by stray characters.
 */
export function renderHeroHeading(input: string): ReactNode {
  const parts: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = re.exec(input)) !== null) {
    if (m.index > last) parts.push(input.slice(last, m.index))
    if (m[1] !== undefined) {
      parts.push(
        <span key={key++} className="text-rust">
          {m[1]}
        </span>,
      )
    } else if (m[2] !== undefined) {
      parts.push(
        <span key={key++} className="text-green">
          {m[2]}
        </span>,
      )
    }
    last = re.lastIndex
  }
  if (last < input.length) parts.push(input.slice(last))

  return parts.length > 0 ? parts : input
}
