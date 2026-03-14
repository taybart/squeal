import { createSignal, For, Show, createEffect, onMount } from "solid-js"

interface SQLPanelProps {
  currentStatement: () => string
  sqlResults: () => string
  sqlQueryResult: () => any
  showResults: () => boolean
  hasSelectedConnection: () => boolean
  onClose: () => void
  onExecute: () => void
  tableName: () => string | null
  primaryKeyColumn: () => string | null
  connectionId: () => number | null
  executeSql: (connectionId: number, sql: string) => Promise<any>
  updateRow: (
    connectionId: number,
    tableName: string,
    columnName: string,
    newValue: any,
    primaryKeyColumn: string,
    primaryKeyValue: any
  ) => Promise<{ rows_affected: number }>
  isFocused: () => boolean
  onFocus: () => void
  onBlur: () => void
}

export function SQLPanel(props: SQLPanelProps) {
  const [editingCell, setEditingCell] = createSignal<{ rowIndex: number; columnName: string } | null>(null)
  const [editValue, setEditValue] = createSignal<string>("")
  const [isUpdating, setIsUpdating] = createSignal(false)
  const [lastError, setLastError] = createSignal<string | null>(null)
  
  // Navigation state
  const [selectedRow, setSelectedRow] = createSignal<number>(0)
  const [selectedCol, setSelectedCol] = createSignal<number>(0)
  const [columns, setColumns] = createSignal<string[]>([])

  // Clear error when query result changes and reset navigation
  createEffect(() => {
    const result = props.sqlQueryResult()
    setLastError(null)
    setEditingCell(null)
    setSelectedRow(0)
    setSelectedCol(0)
    
    if (Array.isArray(result) && result.length > 0) {
      setColumns(Object.keys(result[0]))
    } else {
      setColumns([])
    }
  })

  // Handle keyboard navigation when panel is focused
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.isFocused()) return
    if (editingCell()) return // Don't navigate while editing

    const result = props.sqlQueryResult()
    if (!Array.isArray(result) || result.length === 0) return

    const cols = columns()
    const maxRow = result.length - 1
    const maxCol = cols.length - 1

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault()
        setSelectedRow(r => Math.min(r + 1, maxRow))
        break
      case 'k':
      case 'ArrowUp':
        e.preventDefault()
        setSelectedRow(r => Math.max(r - 1, 0))
        break
      case 'h':
      case 'ArrowLeft':
        e.preventDefault()
        setSelectedCol(c => Math.max(c - 1, 0))
        break
      case 'l':
      case 'ArrowRight':
        e.preventDefault()
        setSelectedCol(c => Math.min(c + 1, maxCol))
        break
      case 'Enter':
        e.preventDefault()
        // Start editing the selected cell
        const row = result[selectedRow()]
        const col = cols[selectedCol()]
        if (row && col && isEditable() && col !== props.primaryKeyColumn()) {
          handleCellDoubleClick(selectedRow(), col, row[col])
        }
        break
      case 'Escape':
        e.preventDefault()
        props.onBlur() // Return focus to editor
        break
    }
  }

  // Attach/detach keydown listener based on focus
  onMount(() => {
    const listener = (e: KeyboardEvent) => handleKeyDown(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  })

  const isEditable = () => {
    // Can only edit if we have a table name and primary key column
    return props.tableName() && props.primaryKeyColumn()
  }

  const handleCellDoubleClick = (rowIndex: number, columnName: string, currentValue: any) => {
    if (!isEditable()) return
    if (columnName === props.primaryKeyColumn()) return // Don't allow editing PK

    setEditingCell({ rowIndex, columnName })
    setEditValue(currentValue === null ? "" : String(currentValue))
  }

  const handleCellKeyDown = async (e: KeyboardEvent, rowIndex: number, row: any, columnName: string) => {
    if (e.key === "Escape") {
      setEditingCell(null)
      setEditValue("")
    } else if (e.key === "Enter") {
      await saveCellEdit(rowIndex, row, columnName)
    }
  }

  const saveCellEdit = async (_rowIndex: number, row: any, columnName: string) => {
    const connId = props.connectionId()
    const tableName = props.tableName()
    const pkColumn = props.primaryKeyColumn()

    if (!connId || !tableName || !pkColumn) {
      setLastError("Cannot save: missing connection or table info")
      return
    }

    const pkValue = row[pkColumn]
    if (pkValue === undefined) {
      setLastError("Cannot save: primary key value not found in row")
      return
    }

    const originalValue = row[columnName]
    let newValue: any = editValue()

    // Convert value based on original type
    if (newValue === "" && originalValue === null) {
      newValue = null
    } else if (originalValue !== null && typeof originalValue === "number") {
      const num = Number(newValue)
      if (!isNaN(num)) {
        newValue = num
      }
    } else if (originalValue !== null && typeof originalValue === "boolean") {
      newValue = newValue.toLowerCase() === "true" || newValue === "1"
    } else if (newValue === "" && originalValue !== null) {
      // Empty string for non-null original - treat as null
      newValue = null
    }

    // Check if value actually changed
    if (JSON.stringify(newValue) === JSON.stringify(originalValue)) {
      setEditingCell(null)
      return
    }

    setIsUpdating(true)
    setLastError(null)

    try {
      const result = await props.updateRow(
        connId,
        tableName,
        columnName,
        newValue,
        pkColumn,
        pkValue
      )

      if (result.rows_affected === 1) {
        // Refresh the query results
        const stmt = props.currentStatement()
        if (stmt) {
          const refreshedResult = await props.executeSql(connId, stmt)
          // Update the parent component's result
          window.dispatchEvent(new CustomEvent('sql-result-refreshed', { detail: refreshedResult }))
        }
        setEditingCell(null)
        setEditValue("")
      } else {
        setLastError(`Update affected ${result.rows_affected} rows (expected 1)`)
      }
    } catch (e) {
      setLastError(String(e))
    } finally {
      setIsUpdating(false)
    }
  }

  const renderQueryResult = () => {
    const result = props.sqlQueryResult()
    if (!result) return null

    // Check if it's an array of rows or an object with rows_affected
    if (Array.isArray(result)) {
      if (result.length === 0) {
        return <div class="text-gray-400 text-xs">No rows returned</div>
      }

      const cols = Object.keys(result[0])
      const pkColumn = props.primaryKeyColumn()
      const editable = isEditable()

      return (
        <div class="overflow-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-gray-700">
                <For each={cols}>
                  {(col, colIndex) => (
                    <th class={`text-left p-2 border border-gray-600 text-gray-300 ${
                      props.isFocused() && selectedCol() === colIndex() ? 'bg-gray-600' : ''
                    }`}>
                      {col}
                      {col === pkColumn && <span class="text-yellow-500 ml-1">(PK)</span>}
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={result}>
                {(row, rowIndex) => (
                  <tr class={`hover:bg-gray-700 ${
                    props.isFocused() && selectedRow() === rowIndex() ? 'bg-blue-900' : ''
                  }`}>
                    <For each={cols}>
                      {(col, colIndex) => {
                        const isEditing = () => 
                          editingCell()?.rowIndex === rowIndex() && 
                          editingCell()?.columnName === col
                        
                        const canEdit = () => editable && col !== pkColumn
                        const isSelected = () => 
                          props.isFocused() && 
                          selectedRow() === rowIndex() && 
                          selectedCol() === colIndex()

                        return (
                          <td 
                            class={`p-2 border border-gray-600 text-gray-300 ${
                              canEdit() ? 'cursor-pointer hover:bg-gray-600' : ''
                            } ${isEditing() ? 'bg-blue-800' : ''} ${
                              isSelected() && !isEditing() ? 'ring-2 ring-blue-400 ring-inset' : ''
                            }`}
                            onDblClick={() => handleCellDoubleClick(rowIndex(), col, row[col])}
                            onClick={() => {
                              setSelectedRow(rowIndex())
                              setSelectedCol(colIndex())
                              props.onFocus()
                            }}
                            title={canEdit() ? "Double-click to edit, or press Enter when selected" : undefined}
                          >
                            <Show when={isEditing()} fallback={
                              <>
                                {row[col] === null ? (
                                  <span class="text-gray-500 italic">NULL</span>
                                ) : (
                                  String(row[col])
                                )}
                              </>
                            }>
                              <input
                                type="text"
                                value={editValue()}
                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                onKeyDown={(e) => handleCellKeyDown(e, rowIndex(), row, col)}
                                onBlur={() => {
                                  // Auto-save on blur if value changed
                                  if (editValue() !== String(row[col] === null ? "" : row[col])) {
                                    saveCellEdit(rowIndex(), row, col)
                                  } else {
                                    setEditingCell(null)
                                  }
                                }}
                                class="w-full bg-gray-800 text-white px-1 py-0.5 text-xs border border-blue-500 outline-none"
                                disabled={isUpdating()}
                                autofocus
                              />
                            </Show>
                          </td>
                        )
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          
          {editable && props.isFocused() && (
            <div class="mt-2 text-xs text-gray-400">
              j/k: move up/down • h/l: move left/right • Enter: edit • Esc: back to editor
            </div>
          )}
          {editable && !props.isFocused() && (
            <div class="mt-2 text-xs text-gray-400">
              Double-click cells to edit • Ctrl+J to focus results
            </div>
          )}
        </div>
      )
    } else if (result.rows_affected !== undefined) {
      return (
        <div class="text-green-300 text-sm">
          {result.rows_affected} row(s) affected
        </div>
      )
    }

    return <div class="text-gray-300 text-xs">{JSON.stringify(result, null, 2)}</div>
  }

  return (
    <Show when={props.showResults()}>
      <div 
        class={`bg-gray-800 border-t border-gray-700 flex flex-col ${
          props.isFocused() ? 'ring-2 ring-blue-500 ring-inset' : ''
        }`} 
        style={{ height: '300px' }}
        onClick={props.onFocus}
      >
      <div class="p-2 bg-gray-900 text-white text-xs font-bold border-b border-gray-700 flex justify-between items-center">
        <span class={props.isFocused() ? 'text-blue-400' : ''}>
          SQL Statement / Results {props.isFocused() && '(focused)'}
        </span>
        <div class="flex items-center gap-2">
          {props.currentStatement() && (
            <button 
              onClick={props.onExecute}
              disabled={!props.hasSelectedConnection()}
              class={`px-2 py-1 rounded text-xs ${
                props.hasSelectedConnection()
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
              title={props.hasSelectedConnection() ? "Execute on selected connection" : "Select a connection first"}
            >
              Execute on Connection
            </button>
          )}
          <button 
            onClick={props.onClose}
            class="text-gray-400 hover:text-white px-2"
          >
            ×
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto p-2 font-mono text-sm">
        {props.currentStatement() && (
          <div class="mb-4">
            <div class="text-xs text-gray-400 mb-1">Current Statement (Leader+S):</div>
            <pre class="text-green-300 bg-gray-900 p-2 rounded text-xs overflow-auto">{props.currentStatement()}</pre>
          </div>
        )}

        <Show when={props.sqlQueryResult()}>
          <div class="mb-4">
            <div class="text-xs text-gray-400 mb-1">
              Query Result:
              {props.tableName() && (
                <span class="text-blue-400 ml-2">Table: {props.tableName()}</span>
              )}
              {props.primaryKeyColumn() && (
                <span class="text-yellow-400 ml-2">PK: {props.primaryKeyColumn()}</span>
              )}
            </div>
            {renderQueryResult()}
          </div>
        </Show>

        {lastError() && (
          <div class="mb-4">
            <div class="text-xs text-red-400 mb-1">Error:</div>
            <div class="text-red-300 text-xs">{lastError()}</div>
          </div>
        )}

        {props.sqlResults() && (
          <div>
            <div class="text-xs text-gray-400 mb-1">Status:</div>
            <div class="text-blue-300">{props.sqlResults()}</div>
          </div>
        )}

        {!props.currentStatement() && !props.sqlResults() && !props.sqlQueryResult() && (
          <div class="text-gray-500 text-xs">
            Press Leader+S to capture current SQL statement<br/>
            Press Leader+E to execute entire file
          </div>
        )}
      </div>
      </div>
    </Show>
  )
}
