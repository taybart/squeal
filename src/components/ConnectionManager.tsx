import { For, Show, createSignal } from "solid-js"
import { toast } from "somoto"
import type { DbConnection } from "~/hooks/useConnections"

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
  const [newDbType, setNewDbType] = createSignal<"sqlite" | "postgres">("sqlite")
  const [newConnectionString, setNewConnectionString] = createSignal("")
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "success" | "error">("idle")

  const handleAdd = async () => {
    const success = await props.addConnection(newName(), newDbType(), newConnectionString())
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
    const success = await props.testConnection(newDbType(), newConnectionString())
    setTestStatus(success ? "success" : "error")
    if (success) {
      toast.success("Connection test successful!")
    } else {
      toast.error("Connection test failed")
    }
  }

  const handleSelect = (id: number) => {
    props.setSelectedConnection(id)
    props.onSelect()
  }

  const handleDelete = async (id: number) => {
    const success = await props.deleteConnection(id)
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
    <Show when={props.visible()}>
      <Card class="w-72 rounded-none border-0 h-auto max-h-80">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm">Connections</CardTitle>
          <div class="flex items-center gap-1">
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
            <Button 
              variant="ghost" 
              size="icon" 
              class="h-8 w-8"
              onClick={props.onSelect}
            >
              <span class="text-lg">×</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent class="flex-1 overflow-auto p-0">
          <Show when={props.isLoading()}>
            <div class="text-muted-foreground text-xs text-center py-4">Loading...</div>
          </Show>

          <Show when={!props.isLoading() && props.connections().length === 0}>
            <div class="text-muted-foreground text-xs text-center py-4">
              No connections yet<br />
              Click + to add one
            </div>
          </Show>

          <div class="space-y-1 px-4 pb-4">
            <For each={props.connections()}>
              {(conn) => (
                <div
                  class={`p-2 rounded cursor-pointer text-xs transition-colors ${
                    props.selectedConnection() === conn.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => handleSelect(conn.id)}
                >
                  <div class="font-medium">{conn.name}</div>
                  <Badge variant="outline" class="text-[10px] mt-1">
                    {getDbTypeLabel(conn.db_type)}
                  </Badge>
                </div>
              )}
            </For>
          </div>
        </CardContent>

        <Show when={props.selectedConnection()}>
          <div class="p-4 border-t">
            <Button
              variant="destructive"
              size="sm"
              class="w-full"
              onClick={() => handleDelete(props.selectedConnection()!)}
            >
              Delete Selected
            </Button>
          </div>
        </Show>
      </Card>
    </Show>
  )
}
