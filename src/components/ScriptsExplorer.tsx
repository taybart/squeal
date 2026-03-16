import { For, Show, createSignal, createEffect } from "solid-js"
import type { Script } from "~/hooks/useScripts"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

interface ScriptsExplorerProps {
  visible: () => boolean
  scripts: () => Script[]
  isLoading: () => boolean
  selectedConnectionId: () => number | null
  connections: () => { id: number; name: string }[]
  onCreateScript: (connectionId?: number | null) => void
  onOpenScript: (script: Script) => void
  onDeleteScript: (scriptId: number) => void
  onClose: () => void
  onSync?: () => void
}

export function ScriptsExplorer(props: ScriptsExplorerProps) {
  const [expandedConnections, setExpandedConnections] = createSignal<Set<number | string>>(new Set())
  
  // Auto-expand all connections that have scripts
  createEffect(() => {
    if (props.visible()) {
      const newExpanded = new Set<number | string>()
      
      // Expand all connections that have scripts
      props.connections().forEach(conn => {
        const hasScripts = props.scripts().some(s => s.connection_id === conn.id)
        if (hasScripts) {
          newExpanded.add(conn.id)
        }
      })
      
      // Expand unassigned if it has scripts
      const hasUnassigned = props.scripts().some(s => s.connection_id === null)
      if (hasUnassigned) {
        newExpanded.add("unassigned")
      }
      
      // Always expand the selected connection
      const selectedId = props.selectedConnectionId()
      if (selectedId) {
        newExpanded.add(selectedId)
      }
      
      setExpandedConnections(newExpanded)
    }
  })
  
  if (!props.visible()) {
    return null
  }

  // Group scripts by connection
  const scriptsByConnection = () => {
    const groups = new Map<number | null, Script[]>()
    
    // Initialize empty arrays for all connections
    props.connections().forEach(conn => {
      groups.set(conn.id, [])
    })
    groups.set(null, [])
    
    // Fill with scripts
    props.scripts().forEach(script => {
      const connId = script.connection_id
      if (groups.has(connId)) {
        groups.get(connId)!.push(script)
      }
    })
    
    return groups
  }

  const toggleConnection = (connId: number | null | string) => {
    const key = connId === null ? "unassigned" : connId
    const newExpanded = new Set(expandedConnections())
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedConnections(newExpanded)
  }

  return (
    <Card class="w-full rounded-none border-0 h-auto max-h-96">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <div class="flex items-center gap-2">
          <CardTitle class="text-sm">Scripts</CardTitle>
          <Show when={props.selectedConnectionId()}>
            {(() => {
              const conn = props.connections().find(c => c.id === props.selectedConnectionId())
              return conn ? (
                <span class="text-[10px] text-muted-foreground">({conn.name})</span>
              ) : null
            })()}
          </Show>
        </div>
        <div class="flex gap-1">
          <Show when={props.onSync}>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onClick={() => props.onSync?.()}
              title="Refresh Scripts"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            </Button>
          </Show>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            onClick={() => {
              console.log("Create script button clicked")
              props.onCreateScript()
            }}
            title="New Script"
          >
            <span class="text-lg">+</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            onClick={props.onClose}
          >
            <span class="text-lg">×</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent class="flex-1 overflow-auto p-0">
        <Show when={props.isLoading()}>
          <div class="text-muted-foreground text-xs text-center py-4">Loading...</div>
        </Show>

        <Show when={!props.isLoading() && props.scripts().length === 0}>
          <div class="text-muted-foreground text-xs text-center py-4">
            No scripts yet<br />
            Click + to create one
          </div>
        </Show>

        <div class="space-y-1 p-2">
          {/* Show ALL connections that have scripts */}
          <For each={props.connections()}>
            {(conn) => {
              const connScripts = () => scriptsByConnection().get(conn.id) ?? []
              const isExpanded = () => expandedConnections().has(conn.id)
              const isSelected = () => props.selectedConnectionId() === conn.id

              return (
                <div>
                  <div
                    class={`flex items-center w-full px-2 py-1.5 text-xs font-medium rounded cursor-pointer ${
                      isSelected() 
                        ? "bg-primary text-primary-foreground" 
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <button
                      class="flex items-center flex-1 min-w-0"
                      onClick={() => toggleConnection(conn.id)}
                    >
                      <span class="mr-1">{isExpanded() ? "▼" : "▶"}</span>
                      <span class="truncate">{conn.name}</span>
                      {isSelected() && <span class="ml-1 text-[10px]">★</span>}
                      <span class="ml-1 text-[10px] opacity-70">({connScripts().length})</span>
                    </button>
                    <button
                      class="ml-1 p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 shrink-0"
                      onClick={() => props.onCreateScript(conn.id)}
                      title={`Create new script for ${conn.name}`}
                    >
                      <span class="text-xs">+</span>
                    </button>
                  </div>

                  <Show when={isExpanded()}>
                    <div class="ml-4 space-y-0.5">
                      <For each={connScripts()}>
                        {(script) => (
                          <div
                            class="flex items-center px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer group"
                            onClick={() => props.onOpenScript(script)}
                          >
                            <svg
                              class="w-3 h-3 mr-1.5 text-primary"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            <span class="truncate flex-1">{script.name}</span>
                            <button
                              class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive rounded text-muted-foreground hover:text-destructive-foreground"
                              onClick={(e) => {
                                e.stopPropagation()
                                props.onDeleteScript(script.id)
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </For>
                      
                      {/* Show "Create script" button when connection has no scripts */}
                      <Show when={connScripts().length === 0}>
                        <button
                          class="flex items-center px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer w-full"
                          onClick={() => props.onCreateScript(conn.id)}
                        >
                          <span class="mr-1.5">+</span>
                          <span>Create script</span>
                        </button>
                      </Show>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
          
          {/* Unassigned scripts - always show */}
          {(() => {
            const unassignedScripts = () => scriptsByConnection().get(null) ?? []
            const isExpanded = () => expandedConnections().has("unassigned")
            
            return (
              <div>
                <div
                  class="flex items-center w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
                >
                  <button
                    class="flex items-center flex-1 min-w-0"
                    onClick={() => toggleConnection("unassigned")}
                  >
                    <span class="mr-1">{isExpanded() ? "▼" : "▶"}</span>
                    <span class="truncate">Unassigned</span>
                    <span class="ml-1 text-[10px] opacity-70">({unassignedScripts().length})</span>
                  </button>
                  <button
                    class="ml-1 p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 shrink-0"
                    onClick={() => props.onCreateScript(null)}
                    title="Create new unassigned script (uses current connection)"
                  >
                    <span class="text-xs">+</span>
                  </button>
                </div>

                <Show when={isExpanded()}>
                  <div class="ml-4 space-y-0.5">
                    <For each={unassignedScripts()}>
                      {(script) => (
                        <div
                          class="flex items-center px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer group"
                          onClick={() => props.onOpenScript(script)}
                        >
                          <svg
                            class="w-3 h-3 mr-1.5 text-gray-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <span class="truncate flex-1">{script.name}</span>
                          <button
                            class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive rounded text-muted-foreground hover:text-destructive-foreground"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onDeleteScript(script.id)
                            }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                      </For>
                      
                      {/* Show "Create script" button when unassigned has no scripts */}
                      <Show when={unassignedScripts().length === 0}>
                        <button
                          class="flex items-center px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer w-full"
                          onClick={() => props.onCreateScript(null)}
                        >
                          <span class="mr-1.5">+</span>
                          <span>Create script (uses current connection)</span>
                        </button>
                      </Show>
                    </div>
                </Show>
              </div>
            )
          })()}
        </div>
      </CardContent>
    </Card>
  )
}