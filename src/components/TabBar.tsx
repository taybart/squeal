import { For, Show, createMemo } from "solid-js"
import type { BufferTab } from "~/hooks/useScripts"
import type { DbConnection } from "~/hooks/useConnections"

interface TabBarProps {
  tabs: () => BufferTab[]
  activeTabId: () => number | null
  connections: () => DbConnection[]
  onSwitchTab: (tabId: number) => void
  onCloseTab: (tabId: number) => void
  onNewTab?: () => void
}

export function TabBar(props: TabBarProps) {
  // Create a lookup map for connection names
  const connectionMap = createMemo(() => {
    const map = new Map<number, string>()
    for (const conn of props.connections()) {
      map.set(conn.id, conn.name)
    }
    return map
  })

  // Get connection name with truncation for display
  const getConnectionDisplay = (connectionId: number | null): string => {
    if (!connectionId) return "DB"
    const name = connectionMap().get(connectionId)
    if (!name) return "DB"
    // Truncate long names, show first 8 chars max
    return name.length > 8 ? name.slice(0, 6) + ".." : name
  }

  return (
    <div class="flex items-center bg-background border-b border-border overflow-x-auto">
      <For each={props.tabs()}>
        {(tab) => (
          <div
            class={`flex items-center min-w-fit px-3 py-2 text-sm cursor-pointer border-r border-border transition-colors ${
              tab.is_active
                ? "bg-accent text-accent-foreground border-t-2 border-t-primary"
                : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
            onClick={() => props.onSwitchTab(tab.id)}
          >
            <span class="truncate max-w-[150px]">
              {tab.name}
            </span>
            <Show when={tab.is_modified}>
              <span class="ml-1 text-yellow-500">●</span>
            </Show>
            <Show when={tab.connection_id}>
              <span 
                class="ml-2 px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded"
                title={connectionMap().get(tab.connection_id!) || "DB"}
              >
                {getConnectionDisplay(tab.connection_id)}
              </span>
            </Show>
            <button
              class="ml-2 p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                props.onCloseTab(tab.id)
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        )}
      </For>
      
      {/* New Tab Button */}
      <Show when={props.onNewTab}>
        <button
          class="flex items-center justify-center h-full px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => props.onNewTab?.()}
          title="New Tab"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </button>
      </Show>
    </div>
  )
}