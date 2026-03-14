import { createSignal, createEffect } from "solid-js"
import { invoke } from "@tauri-apps/api/core"

interface DebugPanelProps {
  visible: () => boolean
  connected: () => boolean
}

export function DebugPanel(props: DebugPanelProps) {
  const [debugLogs, setDebugLogs] = createSignal<string[]>([])

  createEffect(() => {
    if (!props.connected() || !props.visible()) return

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

  if (!props.visible()) return null

  return (
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
  )
}
