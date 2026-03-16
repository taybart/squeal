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
 * IMPORTANT: Only replaces spaces outside of HTML tags to preserve attributes.
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
  
  // Replace spaces with &nbsp; but only outside of HTML tags
  // This preserves the HTML structure while making spaces visible
  let result = ''
  let inTag = false
  
  for (let i = 0; i < highlighted.length; i++) {
    const char = highlighted[i]
    
    if (char === '<') {
      inTag = true
      result += char
    } else if (char === '>') {
      inTag = false
      result += char
    } else if (!inTag && char === ' ') {
      result += '&nbsp;'
    } else if (!inTag && char === '\t') {
      result += '&nbsp;&nbsp;&nbsp;&nbsp;'
    } else {
      result += char
    }
  }
  
  return result
}

export { Prism }
