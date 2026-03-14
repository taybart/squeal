import { createSignal } from 'solid-js'

// Vim operators that need a motion after them
const OPERATOR_PREFIXES = ['g', 'd', 'c', 'y', 'z', 'm', '<', '>']

export function useKeyBuffer(sendKey: (keys: string) => Promise<void>) {
  const [keyBuffer, setKeyBuffer] = createSignal<string>('')
  let keyTimeout: number | null = null

  const getKeyBuffer = () => keyBuffer()

  const clearBuffer = () => {
    if (keyTimeout) {
      window.clearTimeout(keyTimeout)
      keyTimeout = null
    }
    setKeyBuffer('')
  }

  const flushKeys = async () => {
    const keys = keyBuffer()
    if (!keys) return

    console.log('[KeyBuffer] Flushing keys:', JSON.stringify(keys))
    setKeyBuffer('')
    const startTime = performance.now()
    try {
      await sendKey(keys)
      const duration = performance.now() - startTime
      console.log(
        '[KeyBuffer] Keys sent successfully in',
        duration.toFixed(2),
        'ms',
      )
    } catch (err) {
      const duration = performance.now() - startTime
      console.error(
        '[KeyBuffer] Failed to send keys after',
        duration.toFixed(2),
        'ms:',
        err,
      )
    }
  }

  const isOperatorSequence = (keys: string) => {
    // Check if buffer contains an operator prefix that needs a motion
    // e.g., 'g' (for gg, gc, etc.), 'd', 'c', 'y'
    if (keys.length === 1 && OPERATOR_PREFIXES.includes(keys)) {
      return true
    }
    // 'gc' is also an operator that needs a motion
    if (keys === 'gc' || keys === 'gC') {
      return true
    }
    return false
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Let browser handle shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // Let browser handle navigation
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].includes(e.key)
    ) {
      return
    }

    e.preventDefault()

    let keys = ''
    if (e.key === 'Escape') keys = '<Esc>'
    else if (e.key === 'Enter') keys = '<CR>'
    else if (e.key === 'Backspace') keys = '<BS>'
    else if (e.key === 'Delete') keys = '<Del>'
    else if (e.key === 'Tab') {
      keys = '<Tab>'
      e.stopPropagation()
    }
    else if (e.key === ' ') keys = '<Space>'
    else if (e.key.length === 1) keys = e.key

    if (!keys) {
      console.log('[KeyBuffer] Ignoring key:', e.key)
      return
    } else if (keys.length > 1 || !/^[a-z]$/.test(keys)) {
      // Special key or non-lowercase - send immediately
      console.log('[KeyBuffer] Sending immediate key:', JSON.stringify(keys))
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
      const newBuffer = keyBuffer() + keys
      console.log(
        '[KeyBuffer] Buffering key:',
        JSON.stringify(keys),
        'buffer now:',
        JSON.stringify(newBuffer),
      )

      if (keyTimeout) {
        window.clearTimeout(keyTimeout)
      }

      setKeyBuffer(newBuffer)

      // If this forms an operator prefix, wait longer for the motion
      // Otherwise use a shorter timeout
      const timeoutMs = isOperatorSequence(newBuffer) ? 150 : 10

      keyTimeout = window.setTimeout(() => {
        console.log(
          '[KeyBuffer] Timeout reached after',
          timeoutMs,
          'ms, flushing buffer',
        )
        flushKeys()
      }, timeoutMs)
    }
  }

  return {
    keyBuffer,
    flushKeys,
    handleKeyDown,
    getKeyBuffer,
    clearBuffer,
  }
}
