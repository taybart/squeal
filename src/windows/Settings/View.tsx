import { For, Show, createSignal, onMount, createEffect } from "solid-js"
import { toast } from "somoto"
import { emit, listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { useConnections } from "~/hooks/useConnections"
import { useTheme, Theme } from "~/hooks/useTheme"

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
  TextFieldTextArea,
} from "~/components/ui/text-field"
import { Badge } from "~/components/ui/badge"
import { Toaster } from "~/components/ui/sonner"

type SettingsTab = "connections" | "appearance"

export function SettingsWindow() {
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("connections")
  
  const {
    selectedConnection,
    setSelectedConnection,
    connections,
    isLoading,
    addConnection,
    deleteConnection,
    testConnection,
  } = useConnections()

  const { theme, setTheme, loadTheme } = useTheme()

  const [showAddDialog, setShowAddDialog] = createSignal(false)
  const [newName, setNewName] = createSignal("")
  const [newDbType, setNewDbType] = createSignal<"sqlite" | "postgres">("sqlite")
  const [newConnectionString, setNewConnectionString] = createSignal("")
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "success" | "error">("idle")
  
  // Custom theme CSS state
  const [customThemeCss, setCustomThemeCss] = createSignal("")
  const [customThemeJson, setCustomThemeJson] = createSignal("")
  const [hasCustomTheme, setHasCustomTheme] = createSignal(false)

  // Load theme on mount
  onMount(() => {
    loadTheme()
    loadCustomTheme() // Load saved theme data for textareas
    
    const unlisten = listen("focus-connections", () => {
      setActiveTab("connections")
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  // Listen for custom theme changes from other windows
  createEffect(() => {
    const unlisten = listen<{ light: Record<string, string>; dark: Record<string, string> }>("custom-theme-applied", (event) => {
      applyCustomTheme(event.payload)
      setHasCustomTheme(true)
      toast.success("Custom theme updated from another window")
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  createEffect(() => {
    const unlisten = listen("custom-theme-cleared", () => {
      const root = document.documentElement
      const allVars = Array.from(root.style)
      allVars.forEach(v => {
        if (v.startsWith('--')) {
          root.style.removeProperty(v)
        }
      })
      setHasCustomTheme(false)
      setCustomThemeCss("")
      setCustomThemeJson("")
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  const handleSelect = async (id: number) => {
    setSelectedConnection(id)
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

  const handlePickFile = async () => {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
        { name: "All Files", extensions: ["*"] }
      ]
    })
    if (file) {
      setNewConnectionString(`sqlite://${file}`)
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

  const handleThemeChange = async (newTheme: Theme) => {
    await setTheme(newTheme)
    toast.success(`Theme set to ${newTheme}`)
  }

  // Parse shadcn CSS variables - handles both :root and .dark blocks
  // Also converts .dark to [data-kb-theme="dark"] for kobalte compatibility
  const parseShadcnCss = (css: string): { light: Record<string, string>; dark: Record<string, string> } => {
    const light: Record<string, string> = {}
    const dark: Record<string, string> = {}
    
    // First, convert .dark to [data-kb-theme="dark"] for kobalte compatibility
    const normalizedCss = css.replace(/\.dark\s*\{/g, '[data-kb-theme="dark"] {')
    
    // Parse :root block (light mode)
    const rootMatch = normalizedCss.match(/:root\s*{([^}]*)}/)
    if (rootMatch) {
      const content = rootMatch[1]
      const varRegex = /--([^:]+):\s*([^;]+)/g
      let match
      
      while ((match = varRegex.exec(content)) !== null) {
        const [, name, value] = match
        light[`--${name.trim()}`] = value.trim()
      }
    }
    
    // Parse [data-kb-theme="dark"] block (dark mode) 
    const darkMatch = normalizedCss.match(/\[data-kb-theme="dark"\]\s*{([^}]*)}/)
    if (darkMatch) {
      const content = darkMatch[1]
      const varRegex = /--([^:]+):\s*([^;]+)/g
      let match
      
      while ((match = varRegex.exec(content)) !== null) {
        const [, name, value] = match
        dark[`--${name.trim()}`] = value.trim()
      }
    }
    
    return { light, dark }
  }

  // Apply custom CSS variables to document based on current mode
  const applyCustomTheme = (styles: { light: Record<string, string>; dark: Record<string, string> }) => {
    const root = document.documentElement
    const isDark = root.classList.contains('dark') || 
                   document.documentElement.getAttribute('data-kb-theme') === 'dark'
    
    // Remove old custom theme vars
    const allVars = Array.from(root.style)
    allVars.forEach(v => {
      if (v.startsWith('--')) {
        root.style.removeProperty(v)
      }
    })
    
    // Apply the appropriate theme based on current mode
    const themeToApply = isDark ? styles.dark : styles.light
    
    if (Object.keys(themeToApply).length > 0) {
      Object.entries(themeToApply).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
    } else if (isDark && Object.keys(styles.light).length > 0) {
      // Fallback: if no dark vars, use light vars (some themes only define root)
      Object.entries(styles.light).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
    }
  }

  // Save custom theme to database
  const saveCustomTheme = async () => {
    const css = customThemeCss()
    const json = customThemeJson()
    
    if (!css && !json) {
      toast.error("Please enter CSS or JSON theme data")
      return
    }
    
    try {
      let styles: { light: Record<string, string>; dark: Record<string, string> } = { light: {}, dark: {} }
      
      if (css) {
        styles = parseShadcnCss(css)
      } else if (json) {
        try {
          const parsed = JSON.parse(json)
          // Support both formats: flat object or {light, dark} structure
          if (parsed.light && parsed.dark) {
            styles = parsed
          } else {
            // Flat object - treat as light mode only
            styles = { light: parsed, dark: {} }
          }
        } catch (e) {
          toast.error("Invalid JSON format")
          return
        }
      }
      
      if (Object.keys(styles.light).length === 0 && Object.keys(styles.dark).length === 0) {
        toast.error("No valid CSS variables found")
        return
      }
      
      // Save to database first
      await invoke("save_custom_theme", {
        themeCss: css,
        themeJson: json
      })
      
      setHasCustomTheme(true)
      toast.success("Custom theme applied and saved")
      
      // Emit to all windows (including this one) - the event listener will handle the apply
      await emit("custom-theme-applied", styles)
    } catch (e) {
      toast.error(`Failed to save theme: ${e}`)
    }
  }

  // Clear custom theme
  const clearCustomTheme = async () => {
    const root = document.documentElement
    
    // Remove all custom CSS vars
    const allVars = Array.from(root.style)
    allVars.forEach(v => {
      if (v.startsWith('--')) {
        root.style.removeProperty(v)
      }
    })
    
    setCustomThemeCss("")
    setCustomThemeJson("")
    setHasCustomTheme(false)
    
    try {
      await invoke("clear_custom_theme")
      toast.success("Custom theme cleared")
      await emit("custom-theme-cleared")
    } catch (e) {
      console.error("Failed to clear theme:", e)
    }
  }

  // Load custom theme from database (for populating textareas)
  const loadCustomTheme = async () => {
    try {
      const result = await invoke<{ theme_css?: string; theme_json?: string }>("get_app_state")
      
      if (result.theme_css || result.theme_json) {
        setCustomThemeCss(result.theme_css || "")
        setCustomThemeJson(result.theme_json || "")
        setHasCustomTheme(true)
      }
    } catch (e) {
      console.error("Failed to load custom theme:", e)
    }
  }

  const getDbTypeLabel = (dbType: string) => {
    return dbType === "sqlite" ? "SQLite" : "PostgreSQL"
  }

  return (
    <main class="h-full w-full flex">
      <Toaster />
      
      {/* Left sidebar with tabs */}
      <div class="w-48 border-r bg-muted/30 flex flex-col">
        <div class="p-4 border-b">
          <h1 class="font-semibold text-lg">Settings</h1>
        </div>
        
        <nav class="flex-1 p-2 space-y-1">
          <button
            class={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab() === "connections"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
            onClick={() => setActiveTab("connections")}
          >
            <div class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/>
                <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/>
                <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/>
                <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/>
                <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/>
              </svg>
              Connections
            </div>
          </button>
          
          <button
            class={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab() === "appearance"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
            onClick={() => setActiveTab("appearance")}
          >
            <div class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2"/>
                <path d="M12 20v2"/>
                <path d="m4.93 4.93 1.41 1.41"/>
                <path d="m17.66 17.66 1.41 1.41"/>
                <path d="M2 12h2"/>
                <path d="M20 12h2"/>
                <path d="m6.34 17.66-1.41 1.41"/>
                <path d="m19.07 4.93-1.41 1.41"/>
              </svg>
              Appearance
            </div>
          </button>
        </nav>
      </div>
      
      {/* Main content area */}
      <div class="flex-1 p-4 overflow-auto">
        {/* Connections Tab */}
        <Show when={activeTab() === "connections"}>
          <Card class="h-full flex flex-col overflow-hidden">
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2 shrink-0">
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
                      <div class="flex gap-2">
                        <TextFieldInput
                          class="flex-1"
                          placeholder={newDbType() === "sqlite" ? "sqlite://./mydb.db" : "postgres://localhost/mydb"}
                          value={newConnectionString()}
                          onInput={(e) => setNewConnectionString(e.currentTarget.value)}
                        />
                        <Show when={newDbType() === "sqlite"}>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={handlePickFile}
                            title="Browse for SQLite database file"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M12 13l4-4"/><path d="M12 13l-4-4"/></svg>
                          </Button>
                        </Show>
                      </div>
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
        </Show>

        {/* Appearance Tab */}
        <Show when={activeTab() === "appearance"}>
          <Card class="h-full flex flex-col overflow-hidden">
            <CardHeader class="shrink-0">
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            
            <CardContent class="space-y-6 overflow-y-auto flex-1">
              {/* Theme Section */}
              <div class="space-y-3">
                <h3 class="text-sm font-medium">Theme</h3>
                <p class="text-xs text-muted-foreground">
                  Choose your preferred color scheme. System will match your operating system settings.
                </p>
                
                <div class="grid grid-cols-3 gap-3">
                  {/* Light Theme Option */}
                  <button
                    class={`p-4 rounded-lg border-2 transition-all text-left ${
                      theme() === "light"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => handleThemeChange("light")}
                  >
                    <div class="flex flex-col items-center gap-2">
                      <div class="w-12 h-12 rounded-md bg-white border shadow-sm flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500">
                          <circle cx="12" cy="12" r="4"/>
                          <path d="M12 2v2"/>
                          <path d="M12 20v2"/>
                          <path d="m4.93 4.93 1.41 1.41"/>
                          <path d="m17.66 17.66 1.41 1.41"/>
                          <path d="M2 12h2"/>
                          <path d="M20 12h2"/>
                          <path d="m6.34 17.66-1.41 1.41"/>
                          <path d="m19.07 4.93-1.41 1.41"/>
                        </svg>
                      </div>
                      <span class="text-sm font-medium">Light</span>
                    </div>
                  </button>

                  {/* Dark Theme Option */}
                  <button
                    class={`p-4 rounded-lg border-2 transition-all text-left ${
                      theme() === "dark"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => handleThemeChange("dark")}
                  >
                    <div class="flex flex-col items-center gap-2">
                      <div class="w-12 h-12 rounded-md bg-slate-900 border shadow-sm flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-300">
                          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                        </svg>
                      </div>
                      <span class="text-sm font-medium">Dark</span>
                    </div>
                  </button>

                  {/* System Theme Option */}
                  <button
                    class={`p-4 rounded-lg border-2 transition-all text-left ${
                      theme() === "system"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => handleThemeChange("system")}
                  >
                    <div class="flex flex-col items-center gap-2">
                      <div class="w-12 h-12 rounded-md bg-muted border shadow-sm flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
                          <rect width="20" height="14" x="2" y="3" rx="2"/>
                          <line x1="8" x2="16" y1="21" y2="21"/>
                          <line x1="12" x2="12" y1="17" y2="21"/>
                        </svg>
                      </div>
                      <span class="text-sm font-medium">System</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Current Theme Display */}
              <div class="p-3 rounded-md bg-muted text-sm flex items-center justify-between">
                <div>
                  <span class="text-muted-foreground">Current theme: </span>
                  <span class="font-medium capitalize">{theme()}</span>
                </div>
                <Show when={hasCustomTheme()}>
                  <Badge variant="outline" class="text-xs">Custom Colors Applied</Badge>
                </Show>
              </div>

              {/* Shadcn Theme Section */}
              <div class="space-y-3 pt-4 border-t">
                <h3 class="text-sm font-medium">Custom Theme (Shadcn)</h3>
                <p class="text-xs text-muted-foreground">
                  Paste CSS variables from shadcn theme or JSON format to customize colors.
                </p>
                
                <Show when={customThemeCss() || customThemeJson()}>
                  <div class="p-2 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <p class="text-xs text-green-700 dark:text-green-300">
                      Custom theme is active
                    </p>
                  </div>
                </Show>

                <TextField>
                  <TextFieldLabel>CSS Variables (paste :root block)</TextFieldLabel>
                  <TextFieldTextArea
                    placeholder=":root {\n  --background: 0 0% 100%;\n  --foreground: 240 10% 3.9%;\n  ...\n}"
                    value={customThemeCss()}
                    onInput={(e) => setCustomThemeCss(e.currentTarget.value)}
                    rows={6}
                  />
                </TextField>

                <div class="text-center text-xs text-muted-foreground">— OR —</div>

                <TextField>
                  <TextFieldLabel>JSON Format</TextFieldLabel>
                  <TextFieldTextArea
                    placeholder='{"--background": "0 0% 100%", "--foreground": "240 10% 3.9%"}'
                    value={customThemeJson()}
                    onInput={(e) => setCustomThemeJson(e.currentTarget.value)}
                    rows={4}
                  />
                </TextField>

                <div class="flex gap-2">
                  <Button 
                    onClick={saveCustomTheme}
                    class="flex-1"
                  >
                    Apply Theme
                  </Button>
                  <Show when={hasCustomTheme()}>
                    <Button 
                      variant="outline"
                      onClick={clearCustomTheme}
                    >
                      Clear
                    </Button>
                  </Show>
                </div>
              </div>
            </CardContent>
          </Card>
        </Show>
      </div>
    </main>
  )
}
