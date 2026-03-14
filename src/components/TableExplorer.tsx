import { For, Show, createSignal, createEffect } from "solid-js"
import type { ColumnInfo } from "~/hooks/useConnections"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card"

interface TableExplorerProps {
  visible: () => boolean
  selectedConnection: () => number | null
  listTables: (connectionId: number) => Promise<string[]>
  getTableSchema: (connectionId: number, tableName: string) => Promise<ColumnInfo[]>
  onClose: () => void
  onExecuteTable: (tableName: string) => void
}

export function TableExplorer(props: TableExplorerProps) {
  const [tables, setTables] = createSignal<string[]>([])
  const [selectedTable, setSelectedTable] = createSignal<string | null>(null)
  const [schema, setSchema] = createSignal<ColumnInfo[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [isLoadingSchema, setIsLoadingSchema] = createSignal(false)

  // Load tables when connection changes
  createEffect(() => {
    const connId = props.selectedConnection()
    if (connId && props.visible()) {
      loadTables(connId)
    } else {
      setTables([])
      setSelectedTable(null)
      setSchema([])
    }
  })

  const loadTables = async (connectionId: number) => {
    setIsLoading(true)
    const result = await props.listTables(connectionId)
    setTables(result)
    setIsLoading(false)
  }

  const handleSelectTable = async (tableName: string) => {
    setSelectedTable(tableName)
    const connId = props.selectedConnection()
    if (connId) {
      setIsLoadingSchema(true)
      const result = await props.getTableSchema(connId, tableName)
      setSchema(result)
      setIsLoadingSchema(false)
    }
  }

  const handleExecuteSelect = () => {
    const table = selectedTable()
    if (table) {
      props.onExecuteTable(table)
    }
  }

  return (
    <Show when={props.visible()}>
      <Card class="w-72 rounded-none border-0 h-auto max-h-96">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm">Database Explorer</CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            class="h-8 w-8"
            onClick={props.onClose}
          >
            <span class="text-lg">×</span>
          </Button>
        </CardHeader>

        <Show when={!props.selectedConnection()}>
          <CardContent>
            <div class="text-muted-foreground text-xs text-center py-4">
              Select a connection first to browse tables
            </div>
          </CardContent>
        </Show>

        <Show when={props.selectedConnection()}>
          <CardContent class="flex flex-1 overflow-hidden p-0">
            <div class="flex w-full">
              {/* Tables list */}
              <div class="w-1/2 border-r flex flex-col">
                <div class="p-2 text-xs text-muted-foreground border-b font-medium">
                  Tables
                </div>
                <div class="flex-1 overflow-auto p-1">
                  <Show when={isLoading()}>
                    <div class="text-muted-foreground text-xs text-center py-4">Loading...</div>
                  </Show>

                  <Show when={!isLoading() && tables().length === 0}>
                    <div class="text-muted-foreground text-xs text-center py-4">
                      No tables found
                    </div>
                  </Show>

                  <div class="space-y-0.5">
                    <For each={tables()}>
                      {(table) => (
                        <HoverCard>
                          <HoverCardTrigger>
                            <div
                              class={`p-2 rounded cursor-pointer text-xs truncate transition-colors ${
                                selectedTable() === table
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-accent"
                              }`}
                              onClick={() => handleSelectTable(table)}
                              title={table}
                            >
                              {table}
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent class="w-auto">
                            <div class="text-xs font-medium">{table}</div>
                            <div class="text-xs text-muted-foreground">Click to view schema</div>
                          </HoverCardContent>
                        </HoverCard>
                      )}
                    </For>
                  </div>
                </div>
              </div>

              {/* Schema panel */}
              <div class="w-1/2 flex flex-col">
                <div class="p-2 text-xs text-muted-foreground border-b font-medium flex justify-between items-center">
                  <span>Schema</span>
                  <Show when={selectedTable()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 text-xs px-2"
                      onClick={handleExecuteSelect}
                      title="Execute SELECT * FROM table"
                    >
                      ▶ Run
                    </Button>
                  </Show>
                </div>
                <div class="flex-1 overflow-auto p-1">
                  <Show when={isLoadingSchema()}>
                    <div class="text-muted-foreground text-xs text-center py-4">Loading...</div>
                  </Show>

                  <Show when={!isLoadingSchema() && !selectedTable()}>
                    <div class="text-muted-foreground text-xs text-center py-4">
                      Click a table to view schema
                    </div>
                  </Show>

                  <Show when={!isLoadingSchema() && selectedTable() && schema().length === 0}>
                    <div class="text-muted-foreground text-xs text-center py-4">
                      No schema info available
                    </div>
                  </Show>

                  <div class="space-y-1">
                    <For each={schema()}>
                      {(column) => (
                        <div class="p-2 border-b last:border-0">
                          <div class="flex items-center gap-1">
                            <Show when={column.is_primary_key}>
                              <Badge variant="default" class="text-[8px] h-4 px-1">PK</Badge>
                            </Show>
                            <span class={`text-xs font-medium ${column.is_primary_key ? 'text-primary' : ''}`}>
                              {column.name}
                            </span>
                          </div>
                          <div class="text-muted-foreground text-[10px] mt-0.5">
                            {column.data_type}
                            <Show when={!column.nullable}>
                              <Badge variant="outline" class="text-[8px] h-4 px-1 ml-1">NOT NULL</Badge>
                            </Show>
                            <Show when={column.default_value}>
                              <span class="text-muted-foreground text-[10px] ml-1">
                                DEFAULT {column.default_value}
                              </span>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Show>
      </Card>
    </Show>
  )
}
