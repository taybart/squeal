import { createSignal, createEffect, onMount } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export interface StatementBounds {
  text: string
  start_row: number
  start_col: number
  end_row: number
  end_col: number
}

interface NvimStateUpdate {
  content: string[]
  mode: string
  cursor: [number, number]
  cmdline: string
  current_file: string
  error: string
  visual_selection: [[number, number], [number, number]] | null
  statement_bounds: StatementBounds | null
}

export function useNvim() {
  const [content, setContent] = createSignal<string>("")
  const [connected, setConnected] = createSignal(false)
  const [isInitializing, setIsInitializing] = createSignal(false)
  const [mode, setMode] = createSignal<string>("n")
  const [cursor, setCursor] = createSignal<[number, number]>([0, 0])
  const [visualSelection, setVisualSelection] = createSignal<[[number, number], [number, number]] | null>(null)
  const [statementBounds, setStatementBounds] = createSignal<StatementBounds | null>(null)
  const [cmdline, setCmdline] = createSignal<string>("")
  const [currentFile, setCurrentFile] = createSignal<string>("test.sql")
  const [nvimError, setNvimError] = createSignal<string>("")

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
      console.error("Failed to init neovim:", e)
    } finally {
      setIsInitializing(false)
    }
  }

  const sendKey = async (keys: string) => {
    if (!connected()) {
      return
    }

    try {
      await invoke("send_keys", { keys })
      // Backend will push updates via events, no need to poll
    } catch (err) {
      console.error("Failed to send key:", err)
      setNvimError(String(err))
      // Clear error after 3 seconds
      setTimeout(() => setNvimError(""), 3000)
    }
  }

  onMount(() => {
    initNeovim()
  })

  // Listen for state updates from backend (pushed via Tauri events)
  createEffect(() => {
    if (!connected()) return

    console.log("Setting up nvim-state-update listener")

    const unlisten = listen("nvim-state-update", (event) => {
      console.log("Received nvim-state-update event:", event.payload)
      const data = event.payload as NvimStateUpdate
      
      setContent(data.content.join("\n"))
      setMode(data.mode)
      setCursor(data.cursor)
      setVisualSelection(data.visual_selection)
      setStatementBounds(data.statement_bounds)
      setCmdline(data.cmdline)
      
      if (data.current_file && data.current_file !== "") {
        setCurrentFile(data.current_file)
      }
      
      if (data.error && data.error !== "") {
        setNvimError(data.error)
      } else {
        setNvimError("")
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  // Also listen for file-opened events from menu
  createEffect(() => {
    if (!connected()) return

    const unlisten = listen("file-opened", (event) => {
      const filename = event.payload as string
      setCurrentFile(filename)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  return {
    connected,
    content,
    mode,
    cursor,
    cmdline,
    currentFile,
    nvimError,
    visualSelection,
    statementBounds,
    initNeovim,
    sendKey
  }
}
