import { createSignal, createEffect, For, Show } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

interface DebugPanelProps {
  visible: () => boolean
  connected: () => boolean
}

export function DebugPanel(props: DebugPanelProps) {
  const [debugLogs, setDebugLogs] = createSignal<string[]>([])
  const [nvimError, setNvimError] = createSignal<string | null>(null)
  const [errorHistory, setErrorHistory] = createSignal<string[]>([])

  // Listen for nvim errors in real-time
  createEffect(() => {
    if (!props.connected()) return

    const unlisten = listen("nvim-state-update", (event) => {
      const data = event.payload as any
      if (data.error && data.error !== "") {
        setNvimError(data.error)
        // Add to history
        setErrorHistory([...errorHistory().slice(-19), data.error])
      } else {
        setNvimError(null)
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

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

  const hasContent = () => nvimError() || errorHistory().length > 0 || debugLogs().length > 0

  return (
    <Show when={props.visible() && hasContent()}>
      <div class="w-full flex flex-col border-b last:border-b-0">
        {/* Current Error Section */}
        <Show when={nvimError()}>
          <div class="p-3">
            <div class="text-xs font-bold mb-2 flex items-center justify-between">
              <span>Current Nvim Error</span>
              <span class="text-[10px] text-muted-foreground">v:errmsg</span>
            </div>
            <div class="text-xs text-destructive bg-destructive/10 p-2 rounded break-words">
              {nvimError()}
            </div>
          </div>
        </Show>

        {/* Error History */}
        <Show when={errorHistory().length > 0}>
          <div class="p-3 border-t max-h-32 overflow-auto">
            <div class="text-xs font-bold mb-2">Error History</div>
            <For each={errorHistory().slice().reverse()}>
              {(error) => (
                <div class="text-[10px] text-muted-foreground mb-1 truncate" title={error}>
                  {error}
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Debug Logs */}
        <Show when={debugLogs().length > 0}>
          <div class="flex flex-col max-h-64">
            <div class="p-2 text-xs font-bold border-t">
              Nvim Debug Logs (stderr)
            </div>
            <div class="flex-1 overflow-auto p-2 font-mono text-xs min-h-0">
              <For each={debugLogs().slice(-100)}>
                {(log) => (
                  <div class="text-muted-foreground mb-1 break-words">{log}</div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
