import { For, Show, createMemo } from "solid-js"
import { Prism } from "../utils/prism"

interface EditorProps {
  content: () => string
  mode: () => string
  cursor: () => [number, number]
  visualSelection: () => [[number, number], [number, number]] | null
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
}

export function Editor(props: EditorProps) {
  const lines = createMemo(() => {
    const text = props.content()
    return text.split("\n")
  })

  const lineData = createMemo(() => {
    const [row, ] = props.cursor()
    const m = props.mode()
    const isVisualMode = m === "v" || m === "V" || m === "\x16"
    const vis = props.visualSelection()
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

      return {
        line,
        lineIndex,
        isCursorLine,
        visStartCol,
        visEndCol,
        hasVisualSelection,
      }
    })
  })

  const renderLine = (data: LineData) => {
    const { line, isCursorLine, visStartCol, visEndCol, hasVisualSelection } = data
    const [, col] = props.cursor()
    const m = props.mode()
    const isInsertMode = m === "i" || m.startsWith("i")

    if (hasVisualSelection) {
      const beforeVis = line.slice(0, visStartCol)
      const visText = line.slice(visStartCol, visEndCol)
      const afterVis = line.slice(visEndCol)

      const beforeHighlighted = beforeVis ? Prism.highlight(beforeVis, Prism.languages.sql, 'sql') : ""
      const visHighlighted = visText ? Prism.highlight(visText, Prism.languages.sql, 'sql') : ""
      const afterHighlighted = afterVis ? Prism.highlight(afterVis, Prism.languages.sql, 'sql') : ""

      if (isCursorLine && !isInsertMode) {
        const relCursor = col - visStartCol
        if (relCursor >= 0 && relCursor < visText.length) {
          const visBefore = visText.slice(0, relCursor)
          const visAt = visText[relCursor]
          const visAfter = visText.slice(relCursor + 1)

          return (
            <div>
              <Show when={beforeHighlighted}>
                <span innerHTML={beforeHighlighted} />
              </Show>
              <Show when={visBefore}>
                <span class="bg-blue-600" innerHTML={Prism.highlight(visBefore, Prism.languages.sql, 'sql')} />
              </Show>
              <span class="bg-white text-gray-900" innerHTML={Prism.highlight(visAt || " ", Prism.languages.sql, 'sql')} />
              <Show when={visAfter}>
                <span class="bg-blue-600" innerHTML={Prism.highlight(visAfter, Prism.languages.sql, 'sql')} />
              </Show>
              <Show when={afterHighlighted}>
                <span innerHTML={afterHighlighted} />
              </Show>
            </div>
          )
        }
      }

      return (
        <div>
          <Show when={beforeHighlighted}>
            <span innerHTML={beforeHighlighted} />
          </Show>
          <Show when={visHighlighted}>
            <span class="bg-blue-600" innerHTML={visHighlighted} />
          </Show>
          <Show when={afterHighlighted}>
            <span innerHTML={afterHighlighted} />
          </Show>
        </div>
      )
    }

    const highlighted = line
      ? Prism.highlight(line, Prism.languages.sql, 'sql')
      : " "

    if (!isCursorLine) {
      return <div innerHTML={highlighted} />
    }

    const before = line.slice(0, col)
    const at = line[col] || " "
    const after = line.slice(col + 1)

    const beforeHighlighted = before ? Prism.highlight(before, Prism.languages.sql, 'sql') : ""
    const atHighlighted = Prism.highlight(at, Prism.languages.sql, 'sql') || " "
    const afterHighlighted = after ? Prism.highlight(after, Prism.languages.sql, 'sql') : ""

    if (isInsertMode) {
      return (
        <div>
          <span innerHTML={beforeHighlighted} />
          <span class="text-green-400">|</span>
          <span innerHTML={atHighlighted} />
          <span innerHTML={afterHighlighted} />
        </div>
      )
    } else {
      return (
        <div>
          <span innerHTML={beforeHighlighted} />
          <span class="bg-white text-gray-900" innerHTML={atHighlighted} />
          <span innerHTML={afterHighlighted} />
        </div>
      )
    }
  }

  return (
    <div
      class="flex-1 p-4 font-mono text-sm bg-gray-900 text-gray-100 overflow-auto whitespace-pre focus:outline-none cursor-text"
      onKeyDown={props.onKeyDown}
      onPaste={props.onPaste}
      onClick={props.onClick}
      tabIndex={0}
    >
      <For each={lineData()}>
        {(data) => renderLine(data)}
      </For>
    </div>
  )
}
