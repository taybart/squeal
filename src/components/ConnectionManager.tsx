import { For, Show, createSignal } from "solid-js"
import type { DbConnection } from "../hooks/useConnections"

interface ConnectionManagerProps {
  visible: () => boolean
  connections: () => DbConnection[]
  selectedConnection: () => number | null
  setSelectedConnection: (id: number) => void
  addConnection: (name: string, dbType: string, connectionString: string) => Promise<boolean>
  deleteConnection: (id: number) => Promise<boolean>
  testConnection: (dbType: string, connectionString: string) => Promise<boolean>
  isLoading: () => boolean
  onSelect: () => void
}

export function ConnectionManager(props: ConnectionManagerProps) {
  
  const [showAddDialog, setShowAddDialog] = createSignal(false)
  const [newName, setNewName] = createSignal("")
  const [newDbType, setNewDbType] = createSignal("sqlite")
  const [newConnectionString, setNewConnectionString] = createSignal("")
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "success" | "error">("idle")

  const handleAdd = async () => {
    const success = await props.addConnection(newName(), newDbType(), newConnectionString())
    if (success) {
      setShowAddDialog(false)
      setNewName("")
      setNewConnectionString("")
      setTestStatus("idle")
    }
  }

  const handleTest = async () => {
    setTestStatus("testing")
    const success = await props.testConnection(newDbType(), newConnectionString())
    setTestStatus(success ? "success" : "error")
  }

  const handleSelect = (id: number) => {
    props.setSelectedConnection(id)
    props.onSelect()
  }

  return (
    <Show when={props.visible()}>
      <div class="bg-gray-800 border-l border-gray-700 flex flex-col w-64">
      <div class="p-3 bg-gray-900 text-white text-xs font-bold border-b border-gray-700 flex justify-between items-center">
        <span>Connections</span>
        <div class="flex items-center gap-2">
          <button
            onClick={() => setShowAddDialog(true)}
            class="text-green-400 hover:text-green-300 text-lg leading-none"
            title="Add connection"
          >
            +
          </button>
          <button
            onClick={props.onSelect}
            class="text-gray-400 hover:text-white text-lg leading-none"
            title="Close panel"
          >
            ×
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-2">
        <Show when={props.isLoading()}>
          <div class="text-gray-500 text-xs text-center py-4">Loading...</div>
        </Show>

        <Show when={!props.isLoading() && props.connections().length === 0}>
          <div class="text-gray-500 text-xs text-center py-4">
            No connections yet
            <br />
            Click + to add one
          </div>
        </Show>

        <For each={props.connections()}>
          {(conn) => (
            <div
              class={`p-2 mb-1 rounded cursor-pointer text-xs ${
                props.selectedConnection() === conn.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
              onClick={() => handleSelect(conn.id)}
            >
              <div class="font-medium">{conn.name}</div>
              <div class="text-gray-400 text-[10px]">{conn.db_type}</div>
            </div>
          )}
        </For>
      </div>

      <Show when={props.selectedConnection()}>
        <div class="p-2 border-t border-gray-700">
          <button
            onClick={() => props.deleteConnection(props.selectedConnection()!)}
            class="w-full px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs text-white"
          >
            Delete Selected
          </button>
        </div>
      </Show>

      <Show when={showAddDialog()}>
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-gray-800 rounded-lg p-4 w-96 border border-gray-700">
            <h3 class="text-white text-sm font-bold mb-4">Add Connection</h3>

            <div class="space-y-3">
              <div>
                <label class="text-gray-400 text-xs block mb-1">Name</label>
                <input
                  type="text"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  class="w-full bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none"
                  placeholder="My Database"
                />
              </div>

              <div>
                <label class="text-gray-400 text-xs block mb-1">Database Type</label>
                <select
                  value={newDbType()}
                  onChange={(e) => setNewDbType(e.currentTarget.value)}
                  class="w-full bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none"
                >
                  <option value="sqlite">SQLite</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </div>

              <div>
                <label class="text-gray-400 text-xs block mb-1">
                  Connection String
                  <span class="text-gray-500 text-[10px] ml-1">
                    {newDbType() === "sqlite" ? "(e.g., sqlite:///path/to/db.db)" : "(e.g., postgres://user:pass@localhost/db)"}
                  </span>
                </label>
                <input
                  type="text"
                  value={newConnectionString()}
                  onInput={(e) => setNewConnectionString(e.currentTarget.value)}
                  class="w-full bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none"
                  placeholder={newDbType() === "sqlite" ? "sqlite://./mydb.db" : "postgres://localhost/mydb"}
                />
              </div>

              <Show when={testStatus() === "success"}>
                <div class="text-green-400 text-xs">Connection test successful!</div>
              </Show>

              <Show when={testStatus() === "error"}>
                <div class="text-red-400 text-xs">Connection test failed. Check the connection string.</div>
              </Show>
            </div>

            <div class="flex gap-2 mt-4">
              <button
                onClick={handleTest}
                disabled={!newName() || !newConnectionString() || testStatus() === "testing"}
                class="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 rounded text-xs text-white"
              >
                {testStatus() === "testing" ? "Testing..." : "Test"}
              </button>
              <button
                onClick={handleAdd}
                disabled={!newName() || !newConnectionString()}
                class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-xs text-white"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddDialog(false)
                  setNewName("")
                  setNewConnectionString("")
                  setTestStatus("idle")
                }}
                class="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        </Show>
      </div>
    </Show>
  )
}
