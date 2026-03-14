import { For, Show, createSignal } from "solid-js"
import { toast } from "somoto"
import { emit } from "@tauri-apps/api/event"
import { useConnections } from "~/hooks/useConnections"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field"
import { Badge } from "~/components/ui/badge"
import { Toaster } from "~/components/ui/sonner"

export function SettingsWindow() {
  const {
    selectedConnection,
    setSelectedConnection,
    connections,
    isLoading,
    addConnection,
    deleteConnection,
    testConnection,
  } = useConnections()

  const [showAddDialog, setShowAddDialog] = createSignal(false)
  const [newName, setNewName] = createSignal("")
  const [newDbType, setNewDbType] = createSignal<"sqlite" | "postgres">("sqlite")
  const [newConnectionString, setNewConnectionString] = createSignal("")
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "success" | "error">("idle")

  const handleSelect = async (id: number) => {
    setSelectedConnection(id)
    // Emit event to main window about connection change
    await emit("connection-selected", { connectionId: id })
  }

  const handleAdd = async () => {
    const success = await addConnection(newName(), newDbType(), newConnectionString())
    if (success) {
      setShowAddDialog(false)
      setNewName("")
      setNewConnectionString("")
      setTestStatus("idle")
      toast.success("Connection added successfully")
    } else {
      toast.error("Failed to add connection")
    }
  }

  const handleTest = async () => {
    setTestStatus("testing")
    const success = await testConnection(newDbType(), newConnectionString())
    setTestStatus(success ? "success" : "error")
    if (success) {
      toast.success("Connection test successful!")
    } else {
      toast.error("Connection test failed")
    }
  }

  const handleDelete = async (id: number) => {
    const success = await deleteConnection(id)
    if (success) {
      toast.success("Connection deleted")
    } else {
      toast.error("Failed to delete connection")
    }
  }

  const getDbTypeLabel = (dbType: string) => {
    return dbType === "sqlite" ? "SQLite" : "PostgreSQL"
  }

  return (
    <main class="h-full w-full flex flex-col p-4">
      <Toaster />
      <Card class="flex-1 flex flex-col">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Connections</CardTitle>
          <Dialog open={showAddDialog()} onOpenChange={setShowAddDialog}>
            <DialogTrigger>
              <Button variant="ghost" size="icon" class="h-8 w-8">
                <span class="text-lg">+</span>
              </Button>
            </DialogTrigger>
            <DialogContent class="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Connection</DialogTitle>
                <DialogDescription>
                  Configure a new database connection
                </DialogDescription>
              </DialogHeader>
              <div class="grid gap-4 py-4">
                <TextField>
                  <TextFieldLabel>Name</TextFieldLabel>
                  <TextFieldInput
                    placeholder="My Database"
                    value={newName()}
                    onInput={(e) => setNewName(e.currentTarget.value)}
                  />
                </TextField>

                <TextField>
                  <TextFieldLabel>Database Type</TextFieldLabel>
                  <Select
                    options={["sqlite", "postgres"]}
                    value={newDbType()}
                    onChange={(value) => setNewDbType(value as "sqlite" | "postgres")}
                    itemComponent={(props) => (
                      <SelectItem item={props.item}>
                        {props.item.rawValue === "sqlite" ? "SQLite" : "PostgreSQL"}
                      </SelectItem>
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {newDbType() === "sqlite" ? "SQLite" : "PostgreSQL"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </TextField>

                <TextField>
                  <TextFieldLabel>
                    Connection String
                    <span class="text-muted-foreground text-xs ml-1">
                      {newDbType() === "sqlite" 
                        ? "(e.g., sqlite:///path/to/db.db)" 
                        : "(e.g., postgres://user:pass@localhost/db)"}
                    </span>
                  </TextFieldLabel>
                  <TextFieldInput
                    placeholder={newDbType() === "sqlite" ? "sqlite://./mydb.db" : "postgres://localhost/mydb"}
                    value={newConnectionString()}
                    onInput={(e) => setNewConnectionString(e.currentTarget.value)}
                  />
                </TextField>

                <Show when={testStatus() === "success"}>
                  <div class="text-green-500 text-xs">Connection test successful!</div>
                </Show>

                <Show when={testStatus() === "error"}>
                  <div class="text-destructive text-xs">Connection test failed. Check the connection string.</div>
                </Show>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddDialog(false)
                    setNewName("")
                    setNewConnectionString("")
                    setTestStatus("idle")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTest}
                  disabled={!newName() || !newConnectionString() || testStatus() === "testing"}
                >
                  {testStatus() === "testing" ? "Testing..." : "Test"}
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={!newName() || !newConnectionString()}
                >
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent class="flex-1 overflow-auto">
          <Show when={isLoading()}>
            <div class="text-muted-foreground text-xs text-center py-4">Loading...</div>
          </Show>

          <Show when={!isLoading() && connections().length === 0}>
            <div class="text-muted-foreground text-xs text-center py-4">
              No connections yet<br />
              Click + to add one
            </div>
          </Show>

          <div class="space-y-1">
            <For each={connections()}>
              {(conn) => (
                <div
                  class={`p-2 rounded cursor-pointer text-sm transition-colors flex items-center justify-between ${
                    selectedConnection() === conn.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => handleSelect(conn.id)}
                >
                  <div>
                    <div class="font-medium">{conn.name}</div>
                    <Badge variant="outline" class="text-[10px] mt-1">
                      {getDbTypeLabel(conn.db_type)}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation()
                      handleDelete(conn.id)
                    }}
                  >
                    <span class="text-xs">×</span>
                  </Button>
                </div>
              )}
            </For>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
