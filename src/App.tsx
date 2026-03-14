import { createSignal, onMount, createEffect } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import Prism from "prismjs"
import "prismjs/components/prism-sql"
import "prismjs/themes/prism-tomorrow.css"
import "./App.css"

function App() {
  const [content, setContent] = createSignal<string>("")
  const [connected, setConnected] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [isInitializing, setIsInitializing] = createSignal(false)
  const [mode, setMode] = createSignal<string>("n")
  const [cursor, setCursor] = createSignal<[number, number]>([0, 0])
  const [visualSelection, setVisualSelection] = createSignal<[[number, number], [number, number]] | null>(null)
  const [cmdline, setCmdline] = createSignal<string>("")
  const [currentFile, setCurrentFile] = createSignal<string>("test.sql")
  const [debugLogs, setDebugLogs] = createSignal<string[]>([])
  const [showDebug, setShowDebug] = createSignal(false)
  const [nvimError, setNvimError] = createSignal<string>("")

  // Key buffering for mappings like jk
  const [keyBuffer, setKeyBuffer] = createSignal<string>("")
  let keyTimeout: number | null = null

  async function initNeovim() {
    if (isInitializing() || connected()) {
      return
    }

    setIsInitializing(true)
    try {
      await invoke("start_nvim", { filePath: "test.sql" })
      setConnected(true)

      // Get initial state
      const [lines, m, pos] = await Promise.all([
        invoke<string[]>("get_buffer_content"),
        invoke<string>("get_mode"),
        invoke<[number, number]>("get_cursor")
      ])

      setContent(lines.join("\n"))
      setMode(m)
      setCursor(pos)
    } catch (e) {
      setError(String(e))
    } finally {
      setIsInitializing(false)
    }
  }

  // Send keys to nvim and sync back
  const flushKeys = async () => {
    const keys = keyBuffer()
    if (!keys || !connected()) return

    setKeyBuffer("")

    try {
      await invoke("send_keys", { keys })

      // Get nvim's updated state
      const [lines, m, pos, cmd] = await Promise.all([
        invoke<string[]>("get_buffer_content"),
        invoke<string>("get_mode"),
        invoke<[number, number]>("get_cursor"),
        invoke<string>("get_cmdline")
      ])

      setContent(lines.join("\n"))
      setMode(m)
      setCursor(pos)
      setCmdline(cmd)
    } catch (err) {
    }
  }

  const sendKey = async (keys: string) => {
    if (!connected()) {
      return
    }

    try {
      await invoke("send_keys", { keys })

      // Get nvim's updated state
      const [lines, m, pos, cmd] = await Promise.all([
        invoke<string[]>("get_buffer_content"),
        invoke<string>("get_mode"),
        invoke<[number, number]>("get_cursor"),
        invoke<string>("get_cmdline")
      ])

      setContent(lines.join("\n"))
      setMode(m)
      setCursor(pos)
      setCmdline(cmd)
    } catch (err) {
    }
  }

  // Handle keyboard input with key buffering for mappings
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!connected()) return

    // Let browser handle shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // Let browser handle navigation
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
      return
    }

    // Toggle debug panel with Ctrl+D
    if (e.ctrlKey && e.key === "d") {
      e.preventDefault()
      setShowDebug(!showDebug())
      return
    }

    e.preventDefault()

    // Convert key to nvim key notation
    let keys = ""
    if (e.key === "Escape") keys = "<Esc>"
    else if (e.key === "Enter") keys = "<CR>"
    else if (e.key === "Backspace") keys = "<BS>"
    else if (e.key === "Delete") keys = "<Del>"
    else if (e.key === "Tab") keys = "<Tab>"
    else if (e.key.length === 1) keys = e.key

    // Special keys are sent immediately
    // Regular characters are buffered to allow mappings like jk to work
    if (!keys) {
      return
    } else if (keys.length > 1 || !/^[a-z]$/.test(keys)) {
      // Special key or non-lowercase - send immediately (flush any buffered first)
      if (keyTimeout) {
        window.clearTimeout(keyTimeout)
        keyTimeout = null
      }
      if (keyBuffer()) {
        flushKeys()
      }
      sendKey(keys)
    } else {
      // Lowercase letter - add to buffer
      if (keyTimeout) {
        window.clearTimeout(keyTimeout)
      }
      setKeyBuffer(keyBuffer() + keys)
      // Flush after 50ms delay (allows mappings like jk to be batched)
      keyTimeout = window.setTimeout(() => {
        flushKeys()
      }, 50)
    }
  }

  // Handle paste
  const handlePaste = async (e: ClipboardEvent) => {
    if (!connected()) return
    e.preventDefault()

    // Flush any buffered keys first
    if (keyTimeout) {
      window.clearTimeout(keyTimeout)
      keyTimeout = null
    }
    if (keyBuffer()) {
      await flushKeys()
    }

    const text = e.clipboardData?.getData("text") || ""

    // Send all pasted text as a single batch
    if (text) {
      // Replace newlines with <CR> and send all at once
      const keys = text.replace(/\n/g, "<CR>")
      await sendKey(keys)
    }
  }

  onMount(() => {
    initNeovim()
  })

  // Poll for updates from nvim
  createEffect(() => {
    if (!connected()) return

    const interval = setInterval(async () => {
      try {
        const [lines, m, pos, cmd, file, err, vis] = await Promise.all([
          invoke<string[]>("get_buffer_content"),
          invoke<string>("get_mode"),
          invoke<[number, number]>("get_cursor"),
          invoke<string>("get_cmdline"),
          invoke<string>("get_current_file"),
          invoke<string>("get_last_error"),
          invoke<[[number, number], [number, number]] | null>("get_visual_selection")
        ])

        const newContent = lines.join("\n")
        if (newContent !== content()) {
          setContent(newContent)
        }
        setMode(m)
        setCursor(pos)
        if (vis !== visualSelection()) {
          setVisualSelection(vis)
        }
        setCmdline(cmd)
        if (file && file !== "") {
          setCurrentFile(file)
        }
        if (err && err !== "") {
          setNvimError(err)
        } else {
          setNvimError("")
        }
      } catch (e) {
        // Ignore errors
      }
    }, 100)

    return () => clearInterval(interval)
  })

  // Listen for file-opened event from menu
  createEffect(() => {
    if (!connected()) return

    const unlisten = listen("file-opened", (event) => {
      const filename = event.payload as string
      setCurrentFile(filename)
      // Refresh buffer content for the new file
      invoke<string[]>("get_buffer_content").then(lines => {
        setContent(lines.join("\n"))
      })
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  // Poll for debug logs
  createEffect(() => {
    if (!connected() || !showDebug()) return

    const interval = setInterval(async () => {
      try {
        const logs = await invoke<string[]>("get_debug_logs")
        setDebugLogs(logs)
      } catch (e) {
        // Ignore
      }
    }, 1000)

    return () => clearInterval(interval)
  })

  const getModeDisplay = () => {
    const m = mode()
    if (m === "i" || m.startsWith("i")) return "-- INSERT --"
    if (m === "v" || m === "V" || m === "\x16") return "-- VISUAL --"
    if (m === "c") return "-- COMMAND --"
    if (m === "n") return "Normal"
    return m
  }

  // Render content with cursor, SQL highlighting, and visual selection
  const renderContent = () => {
    const text = content()
    const [row, col] = cursor()
    const m = mode()
    const isInsertMode = m === "i" || m.startsWith("i")
    const isVisualMode = m === "v" || m === "V" || m === "\x16"
    const vis = visualSelection()
    const lines = text.split("\n")

    return lines.map((line, lineIndex) => {
      const isCursorLine = lineIndex === row

      // Check if this line is part of visual selection
      let visStartCol = -1
      let visEndCol = -1
      if (vis && isVisualMode) {
        const [[startRow, startCol], [endRow, endCol]] = vis
        const actualStartRow = Math.min(startRow, endRow)
        const actualEndRow = Math.max(startRow, endRow)

        if (lineIndex >= actualStartRow && lineIndex <= actualEndRow) {
          // This line is in the selection
          if (m === "V") {
            // Linewise visual: select entire line
            visStartCol = 0
            visEndCol = line.length
          } else {
            // Charwise or blockwise
            if (startRow === endRow) {
              // Single line selection
              const actualStartCol = Math.min(startCol, endCol)
              const actualEndCol = Math.max(startCol, endCol)
              if (lineIndex === startRow) {
                visStartCol = actualStartCol
                visEndCol = actualEndCol
              }
            } else {
              // Multi-line selection
              if (lineIndex === startRow) {
                visStartCol = startCol
                visEndCol = line.length
              } else if (lineIndex === endRow) {
                visStartCol = 0
                visEndCol = endCol
              } else {
                // Middle line in multi-line selection
                visStartCol = 0
                visEndCol = line.length
              }
            }
          }
        }
      }

      // If this line has visual selection, split it into parts
      if (visStartCol >= 0 && visEndCol >= 0) {
        const beforeVis = line.slice(0, visStartCol)
        const visText = line.slice(visStartCol, visEndCol)
        const afterVis = line.slice(visEndCol)

        const beforeHighlighted = beforeVis ? Prism.highlight(beforeVis, Prism.languages.sql, 'sql') : ""
        const visHighlighted = visText ? Prism.highlight(visText, Prism.languages.sql, 'sql') : ""
        const afterHighlighted = afterVis ? Prism.highlight(afterVis, Prism.languages.sql, 'sql') : ""

        // Handle cursor within visual selection
        if (isCursorLine && !isInsertMode) {
          // Need to split the visual section at cursor
          const relCursor = col - visStartCol
          if (relCursor >= 0 && relCursor < visText.length) {
            const visBefore = visText.slice(0, relCursor)
            const visAt = visText[relCursor]
            const visAfter = visText.slice(relCursor + 1)

            return (
              <div>
                {beforeHighlighted && <span innerHTML={beforeHighlighted} />}
                {visBefore && <span class="bg-blue-600" innerHTML={Prism.highlight(visBefore, Prism.languages.sql, 'sql')} />}
                <span class="bg-white text-gray-900" innerHTML={Prism.highlight(visAt || " ", Prism.languages.sql, 'sql')} />
                {visAfter && <span class="bg-blue-600" innerHTML={Prism.highlight(visAfter, Prism.languages.sql, 'sql')} />}
                {afterHighlighted && <span innerHTML={afterHighlighted} />}
              </div>
            )
          }
        }

        return (
          <div>
            {beforeHighlighted && <span innerHTML={beforeHighlighted} />}
            {visHighlighted && <span class="bg-blue-600" innerHTML={visHighlighted} />}
            {afterHighlighted && <span innerHTML={afterHighlighted} />}
          </div>
        )
      }

      // Highlight the line with Prism
      const highlighted = line
        ? Prism.highlight(line, Prism.languages.sql, 'sql')
        : " "

      if (!isCursorLine) {
        // Non-cursor line: render highlighted HTML
        return <div innerHTML={highlighted} />
      }

      // Cursor line: need to handle cursor positioning
      // Split the raw line at cursor position
      const before = line.slice(0, col)
      const at = line[col] || " "
      const after = line.slice(col + 1)

      // Highlight each part separately
      const beforeHighlighted = before ? Prism.highlight(before, Prism.languages.sql, 'sql') : ""
      const atHighlighted = Prism.highlight(at, Prism.languages.sql, 'sql') || " "
      const afterHighlighted = after ? Prism.highlight(after, Prism.languages.sql, 'sql') : ""

      if (isInsertMode) {
        // Insert mode: show pipe cursor before the character
        return (
          <div>
            <span innerHTML={beforeHighlighted} />
            <span class="text-green-400">|</span>
            <span innerHTML={atHighlighted} />
            <span innerHTML={afterHighlighted} />
          </div>
        )
      } else {
        // Normal mode: show block cursor on character
        return (
          <div>
            <span innerHTML={beforeHighlighted} />
            <span class="bg-white text-gray-900" innerHTML={atHighlighted} />
            <span innerHTML={afterHighlighted} />
          </div>
        )
      }
    })
  }

  const isCommandMode = () => {
    const m = mode()
    return m === "c" || m.startsWith("c")
  }

  return (
    <main class="h-full w-full flex flex-col">
      <div class="bg-gray-800 text-white p-2 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-bold">Squeal</span>
          <span class="text-sm text-gray-400">{currentFile()}</span>
          {connected() && (
            <span class="text-xs bg-green-600 px-2 py-0.5 rounded">
              {getModeDisplay()}
            </span>
          )}
          {error() && (
            <span class="text-xs bg-red-600 px-2 py-0.5 rounded">{error()}</span>
          )}
        </div>
        <div class="flex items-center gap-4">
          <button
            onClick={() => setShowDebug(!showDebug())}
            class="text-xs text-gray-400 hover:text-white"
          >
            {showDebug() ? "Hide" : "Show"} Debug (Ctrl+D)
          </button>
          <div class="text-xs text-gray-400">
            Row: {cursor()[0]}, Col: {cursor()[1]}
          </div>
        </div>
      </div>

      <div class="flex flex-1 overflow-hidden">
        {/* Main display area with cursor */}
        <div
          class={`${showDebug() ? 'flex-1' : 'w-full'} p-4 font-mono text-sm bg-gray-900 text-gray-100 overflow-auto whitespace-pre focus:outline-none cursor-text`}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          tabIndex={0}
        >
          {renderContent()}
        </div>

        {/* Debug panel */}
        {showDebug() && (
          <div class="w-80 border-l border-gray-700 bg-gray-800 flex flex-col">
            <div class="p-2 bg-gray-900 text-white text-xs font-bold border-b border-gray-700">
              Neovim Debug Logs
            </div>
            <div class="flex-1 overflow-auto p-2 font-mono text-xs">
              {debugLogs().length === 0 ? (
                <span class="text-gray-500">No debug logs yet...</span>
              ) : (
                debugLogs().map((log) => (
                  <div class="text-gray-300 mb-1">{log}</div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Command line - shows when in command mode */}
      {isCommandMode() && (
        <div class="bg-gray-900 border-t border-gray-700 p-2 font-mono text-sm text-gray-100">
          <span class="text-green-500">:</span>
          {cmdline()}
          <span class="animate-pulse">█</span>
        </div>
      )}

      {/* Error message display */}
      {nvimError() && (
        <div class="bg-red-900 border-t border-red-700 p-2 font-mono text-sm text-red-100">
          <span class="font-bold">E:</span> {nvimError()}
        </div>
      )}

      <div class="bg-gray-800 text-gray-400 p-2 text-xs flex justify-between">
        <span>Type to send keys to Neovim. White block shows cursor position.</span>
        <span>Mode: {mode()}</span>
      </div>
    </main>
  )
}

export default App
