import { createSignal } from "solid-js"

export function useKeyBuffer(sendKey: (keys: string) => Promise<void>) {
  const [keyBuffer, setKeyBuffer] = createSignal<string>("")
  let keyTimeout: number | null = null

  const getKeyBuffer = () => keyBuffer()

  const clearBuffer = () => {
    if (keyTimeout) {
      window.clearTimeout(keyTimeout)
      keyTimeout = null
    }
    setKeyBuffer("")
  }

  const flushKeys = async () => {
    const keys = keyBuffer()
    if (!keys) return

    setKeyBuffer("")
    await sendKey(keys)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Let browser handle shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // Let browser handle navigation
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
      return
    }

    e.preventDefault()

    let keys = ""
    if (e.key === "Escape") keys = "<Esc>"
    else if (e.key === "Enter") keys = "<CR>"
    else if (e.key === "Backspace") keys = "<BS>"
    else if (e.key === "Delete") keys = "<Del>"
    else if (e.key === "Tab") keys = "<Tab>"
    else if (e.key.length === 1) keys = e.key

    if (!keys) {
      return
    } else if (keys.length > 1 || !/^[a-z]$/.test(keys)) {
      // Special key or non-lowercase - send immediately
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
      keyTimeout = window.setTimeout(() => {
        flushKeys()
      }, 50)
    }
  }

  return {
    keyBuffer,
    flushKeys,
    handleKeyDown,
    getKeyBuffer,
    clearBuffer
  }
}
