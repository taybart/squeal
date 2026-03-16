import { For, Show, createMemo } from "solid-js"
import { Prism, ensureVisibleWhitespace } from "../utils/prism"
import type { StatementBounds } from "../hooks/useNvim"

interface EditorProps {
  content: () => string
  mode: () => string
  cursor: () => [number, number]
  visualSelection: () => [[number, number], [number, number]] | null
  statementBounds: () => StatementBounds | null
  connected: () => boolean
  onKeyDown: (e: KeyboardEvent) => void
  onPaste: (e: ClipboardEvent) => void
  onClick: (e: MouseEvent) => void
}

interface LineData {
  line: string
  lineIndex: number
  isCursorLine: boolean
  visStartCol: number
  visEndCol: number
  hasVisualSelection: boolean
  stmtStartCol: number
  stmtEndCol: number
  hasStatement: boolean
}

export function Editor(props: EditorProps) {
  const highlightWithSpaces = (code: string): string => {
    if (!code) return ""
    const highlighted = Prism.highlight(code, Prism.languages.sql, 'sql')
    return ensureVisibleWhitespace(code, highlighted)
  }

  const lines = createMemo(() => {
    const text = props.content()
    return text.split("\n")
  })

  const lineData = createMemo(() => {
    const [row, ] = props.cursor()
    const m = props.mode()
    const isVisualMode = m === "v" || m === "V" || m === "\x16"
    const vis = props.visualSelection()
    const stmt = props.statementBounds()
    const allLines = lines()

    return allLines.map((line, lineIndex): LineData => {
      const isCursorLine = lineIndex === row

      let visStartCol = -1
      let visEndCol = -1
      let hasVisualSelection = false

      if (vis && isVisualMode) {
        const [[startRow, startCol], [endRow, endCol]] = vis
        const actualStartRow = Math.min(startRow, endRow)
        const actualEndRow = Math.max(startRow, endRow)

        if (lineIndex >= actualStartRow && lineIndex <= actualEndRow) {
          hasVisualSelection = true
          if (m === "V") {
            visStartCol = 0
            visEndCol = line.length
          } else {
            if (startRow === endRow) {
              const actualStartCol = Math.min(startCol, endCol)
              const actualEndCol = Math.max(startCol, endCol)
              if (lineIndex === startRow) {
                visStartCol = actualStartCol
                visEndCol = actualEndCol
              }
            } else {
              if (lineIndex === startRow) {
                visStartCol = startCol
                visEndCol = line.length
              } else if (lineIndex === endRow) {
                visStartCol = 0
                visEndCol = endCol
              } else {
                visStartCol = 0
                visEndCol = line.length
              }
            }
          }
        }
      }

      // Calculate statement bounds for highlighting
      let stmtStartCol = -1
      let stmtEndCol = -1
      let hasStatement = false

      if (stmt) {
        const { start_row, start_col, end_row, end_col } = stmt
        
        if (lineIndex >= start_row && lineIndex <= end_row) {
          hasStatement = true
          if (start_row === end_row) {
            // Single line statement
            if (lineIndex === start_row) {
              stmtStartCol = start_col
              stmtEndCol = end_col
            }
          } else {
            // Multi-line statement
            if (lineIndex === start_row) {
              stmtStartCol = start_col
              stmtEndCol = line.length
            } else if (lineIndex === end_row) {
              stmtStartCol = 0
              stmtEndCol = end_col
            } else {
              // Middle lines - highlight entire line
              stmtStartCol = 0
              stmtEndCol = line.length
            }
          }
        }
      }

      return {
        line,
        lineIndex,
        isCursorLine,
        visStartCol,
        visEndCol,
        hasVisualSelection,
        stmtStartCol,
        stmtEndCol,
        hasStatement,
      }
    })
  })

  const renderLine = (data: LineData) => {
    const { line, isCursorLine, visStartCol, visEndCol, hasVisualSelection, stmtStartCol, stmtEndCol, hasStatement } = data
    const [, col] = props.cursor()
    const m = props.mode()
    const isInsertMode = m === "i" || m.startsWith("i")

    if (hasVisualSelection) {
      const beforeVis = line.slice(0, visStartCol)
      const visText = line.slice(visStartCol, visEndCol)
      const afterVis = line.slice(visEndCol)

      const beforeHighlighted = highlightWithSpaces(beforeVis)
      const visHighlighted = highlightWithSpaces(visText)
      const afterHighlighted = highlightWithSpaces(afterVis)

      if (isCursorLine && !isInsertMode) {
        const relCursor = col - visStartCol
        if (relCursor >= 0 && relCursor < visText.length) {
          const visBefore = visText.slice(0, relCursor)
          const visAt = visText[relCursor]
          const visAfter = visText.slice(relCursor + 1)

          return (
            <div class="flex flex-wrap">
              <Show when={beforeHighlighted}>
                <code class="language-sql" innerHTML={beforeHighlighted} />
              </Show>
              <Show when={visBefore}>
                <code class="language-sql selection" innerHTML={highlightWithSpaces(visBefore)} />
              </Show>
              <code class="language-sql cursor" innerHTML={highlightWithSpaces(visAt || " ")} />
              <Show when={visAfter}>
                <code class="language-sql selection" innerHTML={highlightWithSpaces(visAfter)} />
              </Show>
              <Show when={afterHighlighted}>
                <code class="language-sql" innerHTML={afterHighlighted} />
              </Show>
            </div>
          )
        }
      }

      return (
        <div class="flex flex-wrap">
          <Show when={beforeHighlighted}>
            <code class="language-sql" innerHTML={beforeHighlighted} />
          </Show>
          <Show when={visHighlighted}>
            <code class="language-sql selection" innerHTML={visHighlighted} />
          </Show>
          <Show when={afterHighlighted}>
            <code class="language-sql" innerHTML={afterHighlighted} />
          </Show>
        </div>
      )
    }

    // Handle statement highlighting (when not in visual mode)
    if (hasStatement) {
      const beforeStmt = line.slice(0, stmtStartCol)
      const stmtText = line.slice(stmtStartCol, stmtEndCol)
      const afterStmt = line.slice(stmtEndCol)

      const beforeHighlighted = highlightWithSpaces(beforeStmt)
      const stmtHighlighted = highlightWithSpaces(stmtText)
      const afterHighlighted = highlightWithSpaces(afterStmt)

      // Handle cursor on statement-highlighted line
      if (isCursorLine && !isInsertMode) {
        // Check if cursor is within the statement
        if (col >= stmtStartCol && col < stmtEndCol) {
          const relCursor = col - stmtStartCol
          const stmtBefore = stmtText.slice(0, relCursor)
          const stmtAt = stmtText[relCursor] || " "
          const stmtAfter = stmtText.slice(relCursor + 1)

          return (
            <div class="flex flex-wrap">
              <Show when={beforeHighlighted}>
                <code class="language-sql" innerHTML={beforeHighlighted} />
              </Show>
              <code class="language-sql statement-highlight">
                <Show when={stmtBefore}>
                  <span innerHTML={highlightWithSpaces(stmtBefore)} />
                </Show>
                <span class="cursor" innerHTML={highlightWithSpaces(stmtAt)} />
                <Show when={stmtAfter}>
                  <span innerHTML={highlightWithSpaces(stmtAfter)} />
                </Show>
              </code>
              <Show when={afterHighlighted}>
                <code class="language-sql" innerHTML={afterHighlighted} />
              </Show>
            </div>
          )
        }
        // Cursor is before the statement
        if (col < stmtStartCol) {
          const beforeCursor = line.slice(0, col)
          const atCursor = line[col] || " "
          const afterCursor = line.slice(col + 1, stmtStartCol)
          const beforeCursorHighlighted = highlightWithSpaces(beforeCursor)
          const afterCursorHighlighted = highlightWithSpaces(afterCursor)
          const atHighlighted = highlightWithSpaces(atCursor)

          return (
            <div class="flex flex-wrap">
              <code class="language-sql">
                <Show when={beforeCursorHighlighted}>
                  <span innerHTML={beforeCursorHighlighted} />
                </Show>
                <span class="cursor" innerHTML={atHighlighted} />
                <Show when={afterCursorHighlighted}>
                  <span innerHTML={afterCursorHighlighted} />
                </Show>
              </code>
              <code class="language-sql statement-highlight" innerHTML={stmtHighlighted} />
              <Show when={afterHighlighted}>
                <code class="language-sql" innerHTML={afterHighlighted} />
              </Show>
            </div>
          )
        }
        // Cursor is after the statement
        if (col >= stmtEndCol) {
          const beforeCursor = line.slice(stmtEndCol, col)
          const atCursor = line[col] || " "
          const afterCursor = line.slice(col + 1)
          const beforeCursorHighlighted = highlightWithSpaces(beforeCursor)
          const afterCursorHighlighted = highlightWithSpaces(afterCursor)
          const atHighlighted = highlightWithSpaces(atCursor)

          return (
            <div class="flex flex-wrap">
              <Show when={beforeHighlighted}>
                <code class="language-sql" innerHTML={beforeHighlighted} />
              </Show>
              <code class="language-sql statement-highlight" innerHTML={stmtHighlighted} />
              <code class="language-sql">
                <Show when={beforeCursorHighlighted}>
                  <span innerHTML={beforeCursorHighlighted} />
                </Show>
                <span class="cursor" innerHTML={atHighlighted} />
                <Show when={afterCursorHighlighted}>
                  <span innerHTML={afterCursorHighlighted} />
                </Show>
              </code>
            </div>
          )
        }
      }

      // Insert mode cursor on statement line
      if (isCursorLine && isInsertMode) {
        const before = line.slice(0, col)
        const after = line.slice(col)
        const beforeHighlighted = highlightWithSpaces(before)
        const afterHighlighted = highlightWithSpaces(after)

        return (
          <div class="flex flex-wrap">
            <Show when={beforeHighlighted}>
              <code class="language-sql" innerHTML={beforeHighlighted} />
            </Show>
            <span class="text-primary">|</span>
            <Show when={afterHighlighted}>
              <code class="language-sql" innerHTML={afterHighlighted} />
            </Show>
          </div>
        )
      }

      return (
        <div class="flex flex-wrap">
          <Show when={beforeHighlighted}>
            <code class="language-sql" innerHTML={beforeHighlighted} />
          </Show>
          <Show when={stmtHighlighted}>
            <code class="language-sql statement-highlight" innerHTML={stmtHighlighted} />
          </Show>
          <Show when={afterHighlighted}>
            <code class="language-sql" innerHTML={afterHighlighted} />
          </Show>
        </div>
      )
    }

    const highlighted = line
      ? highlightWithSpaces(line)
      : "&nbsp;"

    if (!isCursorLine) {
      return <code class="language-sql block" innerHTML={highlighted} />
    }

    const before = line.slice(0, col)
    const at = line[col] || " "
    const after = line.slice(col + 1)

    const beforeHighlighted = highlightWithSpaces(before)
    const atHighlighted = highlightWithSpaces(at)
    const afterHighlighted = highlightWithSpaces(after)

    if (isInsertMode) {
      return (
        <div class="flex flex-wrap">
          <code class="language-sql" innerHTML={beforeHighlighted} />
          <span class="text-primary">|</span>
          <code class="language-sql" innerHTML={atHighlighted} />
          <code class="language-sql" innerHTML={afterHighlighted} />
        </div>
      )
    } else {
      return (
        <div class="flex flex-wrap">
          <code class="language-sql" innerHTML={beforeHighlighted} />
          <code class="language-sql cursor" innerHTML={atHighlighted} />
          <code class="language-sql" innerHTML={afterHighlighted} />
        </div>
      )
    }
  }

  return (
    <div
      class="editor-container flex-1 p-4 font-mono text-sm bg-background text-foreground overflow-auto whitespace-pre focus:outline-none cursor-text tabular-nums"
      onKeyDown={props.onKeyDown}
      onPaste={props.onPaste}
      onClick={props.onClick}
      onBlur={(e) => {
        // Only refocus if focus went to body/null (e.g., user pressed Tab)
        // Don't refocus if user clicked on another panel intentionally
        const target = e.currentTarget
        setTimeout(() => {
          const active = document.activeElement
          // Only refocus if: focus is on body/null AND the editor still exists in DOM
          if ((active === document.body || active === null) && target && document.contains(target)) {
            target.focus()
          }
        }, 0)
      }}
      tabIndex={0}
    >
      <For each={lineData()}>
        {(data) => (
          <div class="flex items-start">
            {/* Line number gutter */}
            <div 
              class={`select-none text-right pr-4 text-xs font-mono text-muted-foreground w-[4ch] shrink-0 ${
                data.isCursorLine ? 'text-foreground' : ''
              }`}
            >
              {data.lineIndex + 1}
            </div>
            {/* Line content */}
            <div class="flex-1 min-w-0">
              {renderLine(data)}
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
