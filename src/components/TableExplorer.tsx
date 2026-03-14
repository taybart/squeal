import { For, Show, createSignal, createEffect } from "solid-js"
import type { ColumnInfo } from "../hooks/useConnections"

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
      <div class="bg-gray-800 border-l border-gray-700 flex flex-col w-72">
        <div class="p-3 bg-gray-900 text-white text-xs font-bold border-b border-gray-700 flex justify-between items-center">
          <span>Database Explorer</span>
          <button
            onClick={props.onClose}
            class="text-gray-400 hover:text-white text-lg leading-none"
            title="Close panel"
          >
            ×
          </button>
      </div>

      <Show when={!props.selectedConnection()}>
        <div class="p-4 text-gray-500 text-xs text-center">
          Select a connection first to browse tables
        </div>
      </Show>

      <Show when={props.selectedConnection()}>
        <div class="flex flex-1 overflow-hidden">
          {/* Tables list */}
          <div class="w-1/2 border-r border-gray-700 flex flex-col">
            <div class="p-2 bg-gray-800 text-xs text-gray-400 border-b border-gray-700">
              Tables
            </div>
            <div class="flex-1 overflow-auto p-1">
              <Show when={isLoading()}>
                <div class="text-gray-500 text-xs text-center py-4">Loading...</div>
              </Show>

              <Show when={!isLoading() && tables().length === 0}>
                <div class="text-gray-500 text-xs text-center py-4">
                  No tables found
                </div>
              </Show>

              <For each={tables()}>
                {(table) => (
                  <div
                    class={`p-2 cursor-pointer text-xs truncate ${
                      selectedTable() === table
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                    onClick={() => handleSelectTable(table)}
                    title={table}
                  >
                    {table}
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Schema panel */}
          <div class="w-1/2 flex flex-col">
            <div class="p-2 bg-gray-800 text-xs text-gray-400 border-b border-gray-700 flex justify-between">
              <span>Schema</span>
              <Show when={selectedTable()}>
                <button
                  onClick={handleExecuteSelect}
                  class="text-green-400 hover:text-green-300 text-[10px] font-bold"
                  title="Execute SELECT * FROM table"
                >
                  ▶ Run
                </button>
              </Show>
            </div>
            <div class="flex-1 overflow-auto p-1">
              <Show when={isLoadingSchema()}>
                <div class="text-gray-500 text-xs text-center py-4">Loading...</div>
              </Show>

              <Show when={!isLoadingSchema() && !selectedTable()}>
                <div class="text-gray-500 text-xs text-center py-4">
                  Click a table to view schema
                </div>
              </Show>

              <Show when={!isLoadingSchema() && selectedTable() && schema().length === 0}>
                <div class="text-gray-500 text-xs text-center py-4">
                  No schema info available
                </div>
              </Show>

              <For each={schema()}>
                {(column) => (
                  <div class="p-2 border-b border-gray-700 text-xs">
                    <div class="flex items-center gap-1">
                      <Show when={column.is_primary_key}>
                        <span class="text-yellow-500" title="Primary Key">🔑</span>
                      </Show>
                      <span class={`font-medium ${column.is_primary_key ? 'text-yellow-300' : 'text-gray-300'}`}>
                        {column.name}
                      </span>
                    </div>
                    <div class="text-gray-500 text-[10px] mt-0.5">
                      {column.data_type}
                      <Show when={!column.nullable}>
                        <span class="text-red-400"> • NOT NULL</span>
                      </Show>
                      <Show when={column.default_value}>
                        <span class="text-blue-400"> • DEFAULT {column.default_value}</span>
                      </Show>
                    </div>
                  </div>
                )}
                </For>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
