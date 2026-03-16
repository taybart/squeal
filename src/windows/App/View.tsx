import { createSignal, createEffect, onMount, Show } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useNvim } from "~/hooks/useNvim"
import { useKeyBuffer } from "~/hooks/useKeyBuffer"
import { useSql } from "~/hooks/useSql"
import { useConnections } from "~/hooks/useConnections"
import { useScripts } from "~/hooks/useScripts"
import { useTheme } from "~/hooks/useTheme"
import { Editor } from "~/components/Editor"
import { StatusBar } from "~/components/StatusBar"
import { SQLPanel } from "~/components/SQLPanel"
import { DebugPanel } from "~/components/DebugPanel"
import { TableExplorer } from "~/components/TableExplorer"
import { TabBar } from "~/components/TabBar"
import { ScriptsExplorer } from "~/components/ScriptsExplorer"
import { Toaster } from "~/components/ui/sonner"
import { debugLog, debugError, isDebugEnabled, setDebugEnabled } from "~/utils/debug"
import "~/windows/App/App.css"

function App() {
  const [error] = createSignal<string | null>(null)
  const [showDebug, setShowDebug] = createSignal(false)
  const [sqlQueryResult, setSqlQueryResult] = createSignal<any>(null)
  const [showExplorer, setShowExplorer] = createSignal(false)
  const [currentQueryTable, setCurrentQueryTable] = createSignal<string | null>(null)
  const [currentQueryPrimaryKey, setCurrentQueryPrimaryKey] = createSignal<string | null>(null)
  const [focusedPanel, setFocusedPanel] = createSignal<'editor' | 'results'>('editor')
  const [sidebarWidth, setSidebarWidth] = createSignal(288) // 72 * 4 = 288px (w-72 default)
  const [isResizingSidebar, setIsResizingSidebar] = createSignal(false)
  
  // Panel height states (in pixels) - stored in localStorage for persistence
  const getInitialHeight = (key: string, defaultValue: number) => {
    const saved = localStorage.getItem(key)
    return saved ? parseInt(saved, 10) : defaultValue
  }
  
  const [debugPanelHeight, setDebugPanelHeight] = createSignal(getInitialHeight('debugPanelHeight', 200))
  const [scriptsPanelHeight, setScriptsPanelHeight] = createSignal(getInitialHeight('scriptsPanelHeight', 300))
  const [resizingPanel, setResizingPanel] = createSignal<string | null>(null)
  const [resizingStartY, setResizingStartY] = createSignal(0)
  const [resizingStartHeight, setResizingStartHeight] = createSignal(0)

  const {
    connected,
    content,
    mode,
    cursor,
    cmdline,
    currentFile,
    nvimError,
    visualSelection,
    statementBounds,
    sendKey
  } = useNvim()

  // Function to open the settings window
  const openSettingsWindow = async () => {
    try {
      await invoke("open_settings_window")
    } catch (e) {
      debugError("Failed to open settings window:", e)
    }
  }

  const {
    currentStatement,
    sqlResults,
    showResults,
    setShowResults,
    setCurrentStatement
  } = useSql(connected)

  const {
    connections,
    selectedConnection,
    setSelectedConnection,
    executeSql,
    listTables,
    getTableSchema,
    updateRow,
    error: connError,
  } = useConnections()

  // Scripts and tabs management
  const {
    scripts,
    tabs,
    activeTabId,
    isLoading: scriptsLoading,
    loadScripts,
    createTab,
    switchTab,
    closeTab,
    createScriptFile,
    readScriptFile,
    deleteScriptFile,
    syncScriptsWithDb,
    updateTabConnection,
    getAppState,
    saveCurrentState,
  } = useScripts(connected)

  // Theme management
  const { loadTheme } = useTheme()

  // Debug: log scripts changes
  createEffect(() => {
    const scriptsData = scripts()
    debugLog("Scripts updated:", scriptsData.length, "scripts")
    if (scriptsData.length > 0) {
      debugLog("First script:", scriptsData[0])
    }
  })

  const [showScriptsPanel, setShowScriptsPanel] = createSignal(false)

  // Save panel visibility states when they change
  createEffect(() => {
    const debug = showDebug()
    const scripts = showScriptsPanel()
    const explorer = showExplorer()
    
    // Only save if we're connected (database is ready)
    if (connected()) {
      debugLog("Saving panel states:", { debug, scripts, explorer })
      saveCurrentState(debug, scripts, explorer)
    }
  })

  // Load scripts when connection changes and update active tab connection
  createEffect(() => {
    const connId = selectedConnection()
    loadScripts(connId ?? undefined)
    
    // Update active tab's connection
    const activeTab = activeTabId()
    if (activeTab && connId) {
      updateTabConnection(activeTab, connId)
    }
  })

  const { flushKeys, handleKeyDown, clearBuffer } = useKeyBuffer(sendKey)

  // Listen for events from the menu and settings window + sync scripts
  onMount(async () => {
    // Sync scripts from filesystem on mount
    debugLog("onMount: Starting sync...")
    syncScriptsWithDb()
    
    // Load theme from database
    await loadTheme()
    
    // Restore panel visibility from saved state
    try {
      const appState = await getAppState()
      if (appState) {
        debugLog("Restoring panel states:", {
          debug: appState.show_debug_panel,
          scripts: appState.show_scripts_panel,
          explorer: appState.show_explorer_panel
        })
        setShowDebug(appState.show_debug_panel)
        setShowScriptsPanel(appState.show_scripts_panel)
        setShowExplorer(appState.show_explorer_panel)
      }
    } catch (e) {
      debugError("Failed to restore panel states:", e)
    }
    
    // Listen for "menu-toggle-debug-logging" event from the menu
    const unlistenToggleDebugLogging = listen("menu-toggle-debug-logging", () => {
      const newState = !isDebugEnabled()
      setDebugEnabled(newState)
      debugLog("App", "Debug logging", newState ? "enabled" : "disabled")
      // Show a toast notification  
      alert(`Debug logging ${newState ? 'enabled' : 'disabled'}. Reload to apply changes.`)
    })
    
    // Listen for "menu-open-settings" event from the menu
    const unlistenOpenSettings = listen("menu-open-settings", () => {
      openSettingsWindow()
    })

    // Listen for "connection-selected" event from the settings window
    const unlistenConnectionSelected = listen<{ connectionId: number }>("connection-selected", (event) => {
      setSelectedConnection(event.payload.connectionId)
    })

    // Listen for file-opened event from menu to create a new tab and switch to it
    const unlistenFileOpened = listen<{ filename: string; path: string }>("file-opened", async (event) => {
      const { filename, path } = event.payload
      // Create a new tab for the opened file and switch to it
      const newTab = await createTab(filename, path)
      if (newTab) {
        const filePath = await switchTab(newTab.id)
        if (filePath) {
          await invoke("open_file_path", { filePath })
        }
      }
    })

    // Listen for View menu toggle events
    const unlistenToggleSql = listen("menu-toggle-sql", () => {
      setShowResults(!showResults())
    })
    const unlistenToggleExplorer = listen("menu-toggle-explorer", () => {
      setShowExplorer(!showExplorer())
    })
    const unlistenToggleScripts = listen("menu-toggle-scripts", () => {
      setShowScriptsPanel(!showScriptsPanel())
    })
    const unlistenToggleDebug = listen("menu-toggle-debug", () => {
      setShowDebug(!showDebug())
    })

    // Listen for SQL menu events
    const unlistenRunLine = listen("menu-run-line", () => {
      handleRunLine()
    })
    const unlistenExecuteFile = listen("menu-execute-file", () => {
      handleExecuteFile()
    })

    return () => {
      unlistenOpenSettings.then(fn => fn())
      unlistenConnectionSelected.then(fn => fn())
      unlistenFileOpened.then(fn => fn())
      unlistenToggleDebugLogging.then(fn => fn())
      unlistenToggleSql.then(fn => fn())
      unlistenToggleExplorer.then(fn => fn())
      unlistenToggleScripts.then(fn => fn())
      unlistenToggleDebug.then(fn => fn())
      unlistenRunLine.then(fn => fn())
      unlistenExecuteFile.then(fn => fn())
    }
  })
  createEffect(() => {
    setSqlQueryResult(null)
  })

  // Listen for SQL result refresh events from SQLPanel (when a cell is edited)
  createEffect(() => {
    const handleRefresh = (e: CustomEvent) => {
      setSqlQueryResult(e.detail)
    }
    window.addEventListener('sql-result-refreshed', handleRefresh as EventListener)

    return () => {
      window.removeEventListener('sql-result-refreshed', handleRefresh as EventListener)
    }
  })

  const handleRunLine = async () => {
    // Determine which connection to use:
    // 1. First, check if active tab has a connection_id
    // 2. Otherwise, use the selected connection
    const activeTab = tabs().find(t => t.is_active)
    let connId = activeTab?.connection_id
    
    if (!connId) {
      connId = selectedConnection()
    }
    
    if (!connId) {
      // Open settings window if no connection selected
      await openSettingsWindow()
      return
    }

    try {
      // Capture the SQL statement
      const stmt = await invoke<string>("capture_sql_statement")
      if (!stmt || stmt === "nil") {
        debugError("No SQL statement found under cursor")
        return
      }

      setCurrentStatement(stmt)
      setShowResults(true)

      // Try to extract table name from simple SELECT queries
      const tableName = extractTableName(stmt)
      setCurrentQueryTable(tableName)

      // If we have a table name, try to get the primary key
      if (tableName) {
        const schema = await getTableSchema(connId, tableName)
        const pkColumn = schema.find(col => col.is_primary_key)
        setCurrentQueryPrimaryKey(pkColumn?.name || null)
      } else {
        setCurrentQueryPrimaryKey(null)
      }

      // Execute it immediately
      const result = await executeSql(connId, stmt)
      setSqlQueryResult(result)
      debugLog("Run Line result:", result)
    } catch (e) {
      debugError("Failed to run line:", e)
    }
  }

  // Helper function to extract table name from simple SELECT statements
  const extractTableName = (sql: string): string | null => {
    // Match patterns like: SELECT ... FROM table_name, SELECT * FROM table_name, etc.
    const fromMatch = sql.match(/FROM\s+(\w+)/i)
    if (fromMatch) {
      // Check if it's a simple query (no JOIN, GROUP BY, etc.)
      const upperSql = sql.toUpperCase()
      if (!upperSql.includes(' JOIN ') && !upperSql.includes(' GROUP BY ') && !upperSql.includes(' UNION ')) {
        return fromMatch[1]
      }
    }
    return null
  }

  const handleExecuteFile = async () => {
    // Determine which connection to use (same logic as handleRunLine)
    const activeTab = tabs().find(t => t.is_active)
    let connId = activeTab?.connection_id
    
    if (!connId) {
      connId = selectedConnection()
    }
    
    if (!connId) {
      await openSettingsWindow()
      return
    }
    
    try {
      const stmts = await invoke<string[]>("get_all_sql_statements")
      debugLog("Statements to execute:", stmts)
      
      if (stmts.length === 0) {
        debugLog("No SQL statements found in file")
        return
      }
      
      setShowResults(true)
      
      // Execute all statements sequentially
      const results = []
      for (const stmt of stmts) {
        const result = await executeSql(connId!, stmt)
        results.push(result)
      }
      
      // Show the last result (or aggregate them)
      if (results.length > 0) {
        setSqlQueryResult(results[results.length - 1])
      }
      
      debugLog("Execute File results:", results)
    } catch (e) {
      debugError("Failed to execute file:", e)
    }
  }

  // Sidebar resize handlers
  const handleSidebarResizeStart = (e: MouseEvent) => {
    e.preventDefault()
    setIsResizingSidebar(true)
  }

  const handleSidebarResizeMove = (e: MouseEvent) => {
    if (isResizingSidebar()) {
      // Calculate new width from right edge
      const newWidth = Math.max(200, Math.min(500, window.innerWidth - e.clientX))
      setSidebarWidth(newWidth)
    }
    
    // Handle vertical panel resizing
    if (resizingPanel()) {
      const deltaY = e.clientY - resizingStartY()
      const newHeight = Math.max(100, Math.min(600, resizingStartHeight() + deltaY))
      
      switch (resizingPanel()) {
        case 'debug':
          setDebugPanelHeight(newHeight)
          localStorage.setItem('debugPanelHeight', newHeight.toString())
          break
        case 'scripts':
          setScriptsPanelHeight(newHeight)
          localStorage.setItem('scriptsPanelHeight', newHeight.toString())
          break
      }
    }
  }

  const handleSidebarResizeEnd = () => {
    setIsResizingSidebar(false)
    setResizingPanel(null)
  }
  
  // Panel resize handlers
  const handlePanelResizeStart = (panel: string, currentHeight: number) => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingPanel(panel)
    setResizingStartY(e.clientY)
    setResizingStartHeight(currentHeight)
  }

  // Attach resize listeners
  onMount(() => {
    const moveListener = (e: MouseEvent) => handleSidebarResizeMove(e)
    const upListener = () => handleSidebarResizeEnd()
    window.addEventListener('mousemove', moveListener)
    window.addEventListener('mouseup', upListener)
    return () => {
      window.removeEventListener('mousemove', moveListener)
      window.removeEventListener('mouseup', upListener)
    }
  })

  const handleEditorKeyDown = (e: KeyboardEvent) => {
    if (!connected()) return

    // Panel navigation: Ctrl+J to go to results panel
    if (e.ctrlKey && e.key === "j") {
      e.preventDefault()
      if (showResults()) {
        setFocusedPanel('results')
      }
      return
    }

    // Panel navigation: Ctrl+K to go to editor panel  
    if (e.ctrlKey && e.key === "k") {
      e.preventDefault()
      setFocusedPanel('editor')
      return
    }

    // If results panel is focused, don't send keys to nvim
    if (focusedPanel() === 'results') {
      return
    }

    // Toggle debug panel with Ctrl+D
    if (e.ctrlKey && e.key === "d") {
      e.preventDefault()
      setShowDebug(!showDebug())
      return
    }

    // Execute line under cursor with Ctrl+E
    if (e.ctrlKey && e.key === "e" && !e.shiftKey) {
      e.preventDefault()
      handleRunLine()
      return
    }

    // Execute entire file with Ctrl+Shift+E
    if (e.ctrlKey && e.shiftKey && e.key === "E") {
      e.preventDefault()
      handleExecuteFile()
      return
    }

    handleKeyDown(e)
  }

  const handlePaste = async (e: ClipboardEvent) => {
    if (!connected()) return
    e.preventDefault()

    clearBuffer()
    await flushKeys()

    const text = e.clipboardData?.getData("text") || ""
    if (text) {
      const keys = text.replace(/\n/g, "<CR>")
      await sendKey(keys)
    }
  }

  const handleEditorClick = async (e: MouseEvent) => {
    if (!connected()) return

    const editor = e.currentTarget as HTMLElement
    const rect = editor.getBoundingClientRect()

    let scrollableContainer = editor
    while (scrollableContainer && scrollableContainer.scrollHeight <= scrollableContainer.clientHeight) {
      if (scrollableContainer.parentElement) {
        scrollableContainer = scrollableContainer.parentElement
      } else {
        break
      }
    }

    const clickY = e.clientY - rect.top
    const clickX = e.clientX - rect.left

    const computedStyle = window.getComputedStyle(editor)
    const lineHeight = parseInt(computedStyle.lineHeight) || 20
    const fontSize = parseInt(computedStyle.fontSize) || 14
    const charWidth = fontSize * 0.6

    const scrollTop = scrollableContainer.scrollTop
    const scrollLeft = scrollableContainer.scrollLeft

    const paddingTop = 16
    const totalY = clickY + scrollTop
    const lineNumber = Math.floor((totalY - paddingTop) / lineHeight)

    const paddingLeft = 16
    const totalX = clickX + scrollLeft
    const column = Math.floor((totalX - paddingLeft) / charWidth)

    const lines = content().split('\n')
    const clampedLine = Math.max(0, Math.min(lineNumber, lines.length - 1))
    const clampedCol = Math.max(0, Math.min(column, lines[clampedLine]?.length || 0))

    const nvimLine = clampedLine + 1

    await sendKey('<Esc>')
    await sendKey(`${nvimLine}G`)

    if (clampedCol > 0) {
      await sendKey(`${clampedCol}|`)
    } else {
      await sendKey('0')
    }
  }

  const handleExecuteSql = async () => {
    const stmt = currentStatement()
    const connId = selectedConnection()

    if (!stmt) {
      debugError("No SQL statement to execute")
      return
    }

    if (!connId) {
      debugError("No connection selected")
      return
    }

    try {
      const result = await executeSql(connId, stmt)
      setSqlQueryResult(result)
      debugLog("Query result:", result)
    } catch (e) {
      debugError("Failed to execute SQL:", e)
    }
  }

  const isCommandMode = () => {
    const m = mode()
    return m === "c" || m.startsWith("c")
  }

  // Combine nvim error and connection error
  const displayError = () => nvimError() || connError()

  // Get the active connection name (from selected connection or active tab)
  const getActiveConnectionName = () => {
    const connId = selectedConnection()
    if (!connId) return null
    const conn = connections().find(c => c.id === connId)
    return conn?.name ?? null
  }

  return (
    <main class="h-full w-full flex flex-col">
      <Toaster />
      <StatusBar
        currentFile={currentFile}
        connected={connected}
        mode={mode}
        error={error}
        activeConnectionName={getActiveConnectionName}
        onRunLine={handleRunLine}
        onExecuteFile={handleExecuteFile}
        hasStatement={() => !!currentStatement()}
      />

      {/* Tab Bar */}
      <Show when={tabs().length > 0}>
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          connections={connections}
          onSwitchTab={async (tabId) => {
            const filePath = await switchTab(tabId)
            if (filePath) {
              // Open the file in nvim (not using file picker)
              await invoke("open_file_path", { filePath })
            }
          }}
          onCloseTab={async (tabId) => {
            const newFilePath = await closeTab(tabId)
            if (newFilePath) {
              // Open the new active tab's file
              await invoke("open_file_path", { filePath: newFilePath })
            }
          }}
          onNewTab={async () => {
            // Create a new untitled tab with unique name
            const baseDir = await invoke<string>("get_base_dir")
            const scriptsDir = `${baseDir}/scripts`
            
            // Find next available untitled number
            let counter = 1
            let fileName = `untitled_${counter}.sql`
            let fullPath = `${scriptsDir}/${fileName}`
            
            // Check if file exists and increment counter
            while (await invoke<boolean>("file_exists", { path: fullPath }).catch(() => false)) {
              counter++
              fileName = `untitled_${counter}.sql`
              fullPath = `${scriptsDir}/${fileName}`
            }
            
            // Create empty file
            await invoke("write_file", { 
              path: fullPath,
              content: "-- New SQL file\n" 
            }).catch(() => {})
            
            const newTab = await createTab(fileName, fullPath)
            if (newTab) {
              // Switch to the new tab
              const filePath = await switchTab(newTab.id)
              if (filePath) {
                await invoke("open_file_path", { filePath })
              }
            }
          }}
        />
      </Show>

      <div class="flex flex-1 overflow-hidden">
        {/* Main content area */}
        <div class="flex-1 flex flex-col min-w-0">
          <Editor
            content={content}
            mode={mode}
            cursor={cursor}
            visualSelection={visualSelection}
            statementBounds={statementBounds}
            connected={connected}
            onKeyDown={handleEditorKeyDown}
            onPaste={handlePaste}
            onClick={handleEditorClick}
          />
        </div>

        {/* Right sidebar - only show when panels are visible */}
        <Show when={showDebug() || showScriptsPanel() || showExplorer()}>
          <div 
            class={`flex flex-col border-l relative ${isResizingSidebar() || resizingPanel() ? 'select-none' : ''}`}
            style={{ width: `${sidebarWidth()}px`, 'min-width': '200px' }}
          >
            {/* Resize handle for sidebar width */}
            <div
              class="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/30 transition-colors z-10"
              onMouseDown={handleSidebarResizeStart}
              title="Drag to resize sidebar"
            />
            
            {/* Debug Panel - with resizable height */}
            <Show when={showDebug()}>
              <div 
                class="flex-shrink-0 flex flex-col overflow-hidden"
                style={{ height: `${debugPanelHeight()}px`, 'min-height': '100px' }}
              >
                <DebugPanel visible={showDebug} connected={connected} />
              </div>
              {/* Resize handle between Debug and Scripts */}
              <Show when={showScriptsPanel() || showExplorer()}>
                <div
                  class="h-1 bg-border hover:bg-primary/50 cursor-ns-resize flex-shrink-0 z-10"
                  onMouseDown={handlePanelResizeStart('debug', debugPanelHeight())}
                  title="Drag to resize panel"
                />
              </Show>
            </Show>
            
            {/* Scripts Explorer - with resizable height */}
            <Show when={showScriptsPanel()}>
              <div 
                class="flex-shrink-0 flex flex-col overflow-hidden"
                style={{ height: `${scriptsPanelHeight()}px`, 'min-height': '100px' }}
              >
                <ScriptsExplorer
                  visible={showScriptsPanel}
                  scripts={scripts}
                  isLoading={scriptsLoading}
                  selectedConnectionId={selectedConnection}
                  connections={() => connections().map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  onClose={() => setShowScriptsPanel(false)}
                  onSync={syncScriptsWithDb}
                  onCreateScript={async (connectionId?: number | null) => {
                    // If connectionId is undefined, use the currently selected connection
                    // If connectionId is null, create in Unassigned but use selected connection for execution
                    const connId = connectionId === undefined ? selectedConnection() : connectionId
                    const folderPath = connId ? connections().find((c: { id: number; name: string }) => c.id === connId)?.name ?? "Unassigned" : "Unassigned"
                    const scriptName = prompt("Enter script name:")
                    if (scriptName) {
                      // Create script file and open in new tab
                      const script = await createScriptFile(scriptName, connId, folderPath)
                      if (script) {
                        // Open in nvim directly (no file picker)
                        const baseDir = await invoke<string>("get_base_dir")
                        const fullPath = `${baseDir}/scripts/${script.folder_path}`
                        await invoke("open_file_path", { filePath: fullPath })
                        // Create a tab for it and switch to it
                        const newTab = await createTab(script.name, fullPath, connId)
                        if (newTab) {
                          const filePath = await switchTab(newTab.id)
                          if (filePath) {
                            await invoke("open_file_path", { filePath })
                          }
                        }
                      }
                    }
                  }}
                  onOpenScript={async (script) => {
                    // Read the file content first
                    const content = await readScriptFile(script.id)
                    if (content !== null) {
                      // Open in nvim directly (no file picker)
                      const baseDir = await invoke<string>("get_base_dir")
                      const fullPath = `${baseDir}/scripts/${script.folder_path}`
                      await invoke("open_file_path", { filePath: fullPath })
                      // Create a tab for this script and switch to it
                      const newTab = await createTab(script.name, fullPath, script.connection_id)
                      if (newTab) {
                        // Switch to the new tab - this will update UI and open file
                        const filePath = await switchTab(newTab.id)
                        if (filePath) {
                          await invoke("open_file_path", { filePath })
                        }
                      }
                    }
                  }}
                  onDeleteScript={async (scriptId: number) => {
                    if (confirm("Are you sure you want to delete this script?")) {
                      await deleteScriptFile(scriptId)
                    }
                  }}
                />
              </div>
              {/* Resize handle between Scripts and Explorer */}
              <Show when={showExplorer()}>
                <div
                  class="h-1 bg-border hover:bg-primary/50 cursor-ns-resize flex-shrink-0 z-10"
                  onMouseDown={handlePanelResizeStart('scripts', scriptsPanelHeight())}
                  title="Drag to resize panel"
                />
              </Show>
            </Show>
            
            {/* Table Explorer - takes remaining space */}
            <Show when={showExplorer()}>
              <div class="flex-1 flex flex-col overflow-hidden min-h-[100px]">
                <TableExplorer
                  visible={showExplorer}
                  selectedConnection={selectedConnection}
                  connectionName={getActiveConnectionName}
                  listTables={listTables}
                  getTableSchema={getTableSchema}
                  onClose={() => setShowExplorer(false)}
                  onExecuteTable={(tableName) => {
                    // Execute SELECT * FROM table immediately
                    const connId = selectedConnection()
                    if (!connId) return

                    const sql = `SELECT * FROM ${tableName} LIMIT 100`
                    setCurrentStatement(sql)
                    setShowResults(true)

                    executeSql(connId, sql).then(result => {
                      setSqlQueryResult(result)
                    }).catch(e => {
                      debugError("Failed to execute table query:", e)
                    })
                  }}
                  onGenerateInsert={async (tableName, columns) => {
                    // Generate INSERT statement for the table
                    const columnNames = columns.map(col => col.name).join(', ')
                    const valuePlaceholders = columns.map(() => '?').join(', ')
                    
                    // Build INSERT statement (without comments to keep it clean)
                    const insertStatement = `INSERT INTO ${tableName} (${columnNames})\nVALUES (${valuePlaceholders});`
                    
                    try {
                      // Insert directly into the nvim buffer at cursor position
                      await invoke("insert_text_at_cursor", { text: insertStatement })
                      debugLog(`Inserted INSERT statement for ${tableName}`)
                    } catch (err) {
                      debugError('Failed to insert text:', err)
                      // Fallback to clipboard
                      navigator.clipboard.writeText(insertStatement).catch(() => {})
                    }
                  }}
                />
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={isCommandMode()}>
        <div class="bg-gray-900 border-t border-gray-700 p-2 font-mono text-sm text-gray-100">
          <span class="text-green-500">:</span>
          {cmdline()}
          <span class="animate-pulse">█</span>
        </div>
      </Show>

      <SQLPanel
        currentStatement={currentStatement}
        sqlResults={sqlResults}
        sqlQueryResult={sqlQueryResult}
        showResults={showResults}
        hasSelectedConnection={() => !!selectedConnection()}
        onClose={() => {
          setShowResults(false)
          setFocusedPanel('editor')
        }}
        onExecute={handleExecuteSql}
        tableName={currentQueryTable}
        primaryKeyColumn={currentQueryPrimaryKey}
        connectionId={selectedConnection}
        executeSql={executeSql}
        updateRow={updateRow}
        isFocused={() => focusedPanel() === 'results'}
        onFocus={() => setFocusedPanel('results')}
        onBlur={() => setFocusedPanel('editor')}
      />

      <Show when={displayError()}>
        <div class="bg-red-900 border-t border-red-700 p-2 font-mono text-sm text-red-100">
          <span class="font-bold">E:</span> {displayError()}
        </div>
      </Show>

    </main>
  )
}

export default App
