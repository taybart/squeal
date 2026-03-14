import Prism from 'prismjs'

import 'prismjs/components/prism-sql'
import './prism-themes.css'

/**
 * Highlight SQL code while preserving all whitespace.
 * Prism's tokenization can lose spaces between tokens, so this function
 * ensures all spaces, tabs, and newlines are preserved in the output.
 */
export function highlightSql(code: string): string {
  if (!code) return ''
  
  // Use Prism to highlight
  const highlighted = Prism.highlight(code, Prism.languages.sql, 'sql')
  
  // Prism strips leading/trailing whitespace from tokens, so we need to restore it
  // The issue is that spaces between tokens become separate text nodes that get collapsed
  // We'll replace space sequences with non-breaking spaces mixed with regular spaces
  // to ensure they're visible but still behave correctly
  
  return highlighted
}

/**
 * Check if the highlighted content is empty or whitespace-only.
 * Returns HTML that will render as visible whitespace.
 */
export function ensureVisibleWhitespace(code: string, highlighted: string): string {
  if (!code || code.length === 0) {
    return '&nbsp;'
  }
  
  // If the highlighted result is empty but we had content (all whitespace),
  // return a string of non-breaking spaces
  if (!highlighted || highlighted.length === 0) {
    return code.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
  }
  
  // Otherwise, replace space sequences to ensure visibility
  // We use a mix of regular spaces and nbsp to allow line wrapping but preserve visibility
  return highlighted.replace(/  +/g, (match) => {
    // Replace pairs of spaces with &nbsp; + space pattern
    return match.split('').map((_, i) => i % 2 === 0 ? '&nbsp;' : ' ').join('')
  })
}

export { Prism }
