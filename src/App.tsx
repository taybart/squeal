import { createSignal } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { useNvim } from "./hooks/useNvim"
import { useKeyBuffer } from "./hooks/useKeyBuffer"
import { useSql } from "./hooks/useSql"
import { Editor } from "./components/Editor"
import { StatusBar } from "./components/StatusBar"
import { SQLPanel } from "./components/SQLPanel"
import { DebugPanel } from "./components/DebugPanel"
import "./App.css"

function App() {
  const [error] = createSignal<string | null>(null)
  const [showDebug, setShowDebug] = createSignal(false)

  const {
    connected,
    content,
    mode,
    cursor,
    cmdline,
    currentFile,
    nvimError,
    visualSelection,
    sendKey
  } = useNvim()

  const { flushKeys, handleKeyDown, clearBuffer } = useKeyBuffer(sendKey)

  const {
    currentStatement,
    sqlResults,
    showResults,
    setShowResults
  } = useSql(connected)

  const handleEditorKeyDown = (e: KeyboardEvent) => {
    if (!connected()) return

    // Toggle debug panel with Ctrl+D
    if (e.ctrlKey && e.key === "d") {
      e.preventDefault()
      setShowDebug(!showDebug())
      return
    }

    handleKeyDown(e)
  }

  const handlePaste = async (e: ClipboardEvent) => {
    if (!connected()) return
    e.preventDefault()

    clearBuffer()
    await flushKeys()

    const text = e.clipboardData?.getData("text") || ""
    if (text) {
      const keys = text.replace(/\n/g, "<CR>")
      await sendKey(keys)
    }
  }

  const handleEditorClick = async (e: MouseEvent) => {
    if (!connected()) return

    const editor = e.currentTarget as HTMLElement
    const rect = editor.getBoundingClientRect()

    let scrollableContainer = editor
    while (scrollableContainer && scrollableContainer.scrollHeight <= scrollableContainer.clientHeight) {
      if (scrollableContainer.parentElement) {
        scrollableContainer = scrollableContainer.parentElement
      } else {
        break
      }
    }

    const clickY = e.clientY - rect.top
    const clickX = e.clientX - rect.left

    const computedStyle = window.getComputedStyle(editor)
    const lineHeight = parseInt(computedStyle.lineHeight) || 20
    const fontSize = parseInt(computedStyle.fontSize) || 14
    const charWidth = fontSize * 0.6

    const scrollTop = scrollableContainer.scrollTop
    const scrollLeft = scrollableContainer.scrollLeft

    const paddingTop = 16
    const totalY = clickY + scrollTop
    const lineNumber = Math.floor((totalY - paddingTop) / lineHeight)

    const paddingLeft = 16
    const totalX = clickX + scrollLeft
    const column = Math.floor((totalX - paddingLeft) / charWidth)

    const lines = content().split('\n')
    const clampedLine = Math.max(0, Math.min(lineNumber, lines.length - 1))
    const clampedCol = Math.max(0, Math.min(column, lines[clampedLine]?.length || 0))

    const nvimLine = clampedLine + 1

    await sendKey('<Esc>')
    await sendKey(`${nvimLine}G`)

    if (clampedCol > 0) {
      await sendKey(`${clampedCol}|`)
    } else {
      await sendKey('0')
    }
  }

  const handleCaptureSql = async () => {
    try {
      const stmt = await invoke<string>("capture_sql_statement")
      console.log("Captured SQL:", stmt)
      setShowResults(true)
    } catch (e) {
      console.error("Failed to capture SQL:", e)
    }
  }

  const handleExecuteFile = async () => {
    try {
      const stmts = await invoke<string[]>("get_all_sql_statements")
      console.log("Statements to execute:", stmts)
      setShowResults(true)
    } catch (e) {
      console.error("Failed to get statements:", e)
    }
  }

  const isCommandMode = () => {
    const m = mode()
    return m === "c" || m.startsWith("c")
  }

  return (
    <main class="h-full w-full flex flex-col">
      <StatusBar
        currentFile={currentFile}
        connected={connected}
        mode={mode}
        cursor={cursor}
        error={error}
        onToggleDebug={() => setShowDebug(!showDebug())}
        onToggleResults={() => setShowResults(!showResults())}
        onCaptureSql={handleCaptureSql}
        onExecuteFile={handleExecuteFile}
        hasStatement={() => !!currentStatement()}
      />

      <div class="flex flex-1 overflow-hidden">
        <div class={`${showDebug() ? 'flex-1' : 'w-full'} flex flex-col`}>
          <Editor
            content={content}
            mode={mode}
            cursor={cursor}
            visualSelection={visualSelection}
            connected={connected}
            onKeyDown={handleEditorKeyDown}
            onPaste={handlePaste}
            onClick={handleEditorClick}
          />
        </div>

        <DebugPanel visible={showDebug} connected={connected} />
      </div>

      {isCommandMode() && (
        <div class="bg-gray-900 border-t border-gray-700 p-2 font-mono text-sm text-gray-100">
          <span class="text-green-500">:</span>
          {cmdline()}
          <span class="animate-pulse">█</span>
        </div>
      )}

      <SQLPanel
        currentStatement={currentStatement}
        sqlResults={sqlResults}
        showResults={showResults}
        onClose={() => setShowResults(false)}
        onExecute={() => console.log("Execute:", currentStatement())}
      />

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
