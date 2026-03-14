import { createSignal, createEffect, onMount } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export function useNvim() {
  const [content, setContent] = createSignal<string>("")
  const [connected, setConnected] = createSignal(false)
  const [isInitializing, setIsInitializing] = createSignal(false)
  const [mode, setMode] = createSignal<string>("n")
  const [cursor, setCursor] = createSignal<[number, number]>([0, 0])
  const [visualSelection, setVisualSelection] = createSignal<[[number, number], [number, number]] | null>(null)
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
      console.error("Failed to send key:", err)
    }
  }

  onMount(() => {
    initNeovim()
  })

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

  createEffect(() => {
    if (!connected()) return

    const unlisten = listen("file-opened", (event) => {
      const filename = event.payload as string
      setCurrentFile(filename)
      invoke<string[]>("get_buffer_content").then(lines => {
        setContent(lines.join("\n"))
      })
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
    initNeovim,
    sendKey
  }
}
