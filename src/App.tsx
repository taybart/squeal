import { createSignal, createEffect } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { useNvim } from "./hooks/useNvim"
import { useKeyBuffer } from "./hooks/useKeyBuffer"
import { useSql } from "./hooks/useSql"
import { useConnections } from "./hooks/useConnections"
import { Editor } from "./components/Editor"
import { StatusBar } from "./components/StatusBar"
import { SQLPanel } from "./components/SQLPanel"
import { DebugPanel } from "./components/DebugPanel"
import { ConnectionManager } from "./components/ConnectionManager"
import { TableExplorer } from "./components/TableExplorer"
import "./App.css"

function App() {
  const [error] = createSignal<string | null>(null)
  const [showDebug, setShowDebug] = createSignal(false)
  const [sqlQueryResult, setSqlQueryResult] = createSignal<any>(null)
  const [showConnections, setShowConnections] = createSignal(true)
  const [showExplorer, setShowExplorer] = createSignal(false)
  const [currentQueryTable, setCurrentQueryTable] = createSignal<string | null>(null)
  const [currentQueryPrimaryKey, setCurrentQueryPrimaryKey] = createSignal<string | null>(null)

  const {
    connected,
    content,
    mode,
    cursor,
    cmdline,
    currentFile,
    nvimError,
    visualSelection,
    sendKey
  } = useNvim()

  const { flushKeys, handleKeyDown, clearBuffer } = useKeyBuffer(sendKey)

  const {
    currentStatement,
    sqlResults,
    showResults,
    setShowResults,
    setCurrentStatement
  } = useSql(connected)

  const {
    selectedConnection,
    setSelectedConnection,
    connections,
    addConnection,
    deleteConnection,
    testConnection,
    executeSql,
    listTables,
    getTableSchema,
    updateRow,
    isLoading,
    error: connError,
  } = useConnections()

  // Load SQL query result when statement changes
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
    // First check if we have a connection selected
    const connId = selectedConnection()
    if (!connId) {
      // Show connections panel if no connection selected
      setShowConnections(true)
      return
    }
    
    try {
      // Capture the SQL statement
      const stmt = await invoke<string>("capture_sql_statement")
      if (!stmt || stmt === "nil") {
        console.error("No SQL statement found under cursor")
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
      console.log("Run Line result:", result)
    } catch (e) {
      console.error("Failed to run line:", e)
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
    try {
      const stmts = await invoke<string[]>("get_all_sql_statements")
      console.log("Statements to execute:", stmts)
      setShowResults(true)
    } catch (e) {
      console.error("Failed to get statements:", e)
    }
  }

  const handleEditorKeyDown = (e: KeyboardEvent) => {
    if (!connected()) return

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
      console.error("No SQL statement to execute")
      return
    }
    
    if (!connId) {
      console.error("No connection selected")
      return
    }
    
    try {
      const result = await executeSql(connId, stmt)
      setSqlQueryResult(result)
      console.log("Query result:", result)
    } catch (e) {
      console.error("Failed to execute SQL:", e)
    }
  }

  const isCommandMode = () => {
    const m = mode()
    return m === "c" || m.startsWith("c")
  }

  // Combine nvim error and connection error
  const displayError = () => nvimError() || connError()

  return (
    <main class="h-full w-full flex flex-col">
      <StatusBar
        currentFile={currentFile}
        connected={connected}
        mode={mode}
        cursor={cursor}
        error={error}
        onToggleDebug={() => setShowDebug(!showDebug())}
        onToggleResults={() => setShowResults(!showResults())}
        onToggleExplorer={() => setShowExplorer(!showExplorer())}
        onRunLine={handleRunLine}
        onExecuteFile={handleExecuteFile}
        hasStatement={() => !!currentStatement()}
      />

      <div class="flex flex-1 overflow-hidden">
        <div class={`${showDebug() ? 'flex-1' : 'w-full'} flex flex-col`}>
          <Editor
            content={content}
            mode={mode}
            cursor={cursor}
            visualSelection={visualSelection}
            connected={connected}
            onKeyDown={handleEditorKeyDown}
            onPaste={handlePaste}
            onClick={handleEditorClick}
          />
        </div>

        <DebugPanel visible={showDebug} connected={connected} />
        <ConnectionManager 
          visible={showConnections} 
          connections={connections}
          selectedConnection={selectedConnection}
          setSelectedConnection={setSelectedConnection}
          addConnection={addConnection}
          deleteConnection={deleteConnection}
          testConnection={testConnection}
          isLoading={isLoading}
          onSelect={() => setShowConnections(false)} 
        />
        <TableExplorer
          visible={showExplorer}
          selectedConnection={selectedConnection}
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
              console.error("Failed to execute table query:", e)
            })
          }}
        />
      </div>

      {isCommandMode() && (
        <div class="bg-gray-900 border-t border-gray-700 p-2 font-mono text-sm text-gray-100">
          <span class="text-green-500">:</span>
          {cmdline()}
          <span class="animate-pulse">█</span>
        </div>
      )}

      <SQLPanel
        currentStatement={currentStatement}
        sqlResults={sqlResults}
        sqlQueryResult={sqlQueryResult}
        showResults={showResults}
        hasSelectedConnection={() => !!selectedConnection()}
        onClose={() => setShowResults(false)}
        onExecute={handleExecuteSql}
        tableName={currentQueryTable}
        primaryKeyColumn={currentQueryPrimaryKey}
        connectionId={selectedConnection}
        executeSql={executeSql}
        updateRow={updateRow}
      />

      {displayError() && (
        <div class="bg-red-900 border-t border-red-700 p-2 font-mono text-sm text-red-100">
          <span class="font-bold">E:</span> {displayError()}
        </div>
      )}

      <div class="bg-gray-800 text-gray-400 p-2 text-xs flex justify-between">
        <span>Type to send keys to Neovim. White block shows cursor position.</span>
        <span>Mode: {mode()}</span>
      </div>
    </main>
  )
}

export default App
