import { createSignal, For, Show, createEffect, onMount } from "solid-js"
import { toast } from "somoto"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "~/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  TextField,
  TextFieldInput,
} from "~/components/ui/text-field"

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
  const [lastError, setLastError] = createSignal<string | null>(null)
  
  // Navigation state
  const [selectedRow, setSelectedRow] = createSignal<number>(0)
  const [selectedCol, setSelectedCol] = createSignal<number>(0)
  const [columns, setColumns] = createSignal<string[]>([])
  
  // Resizable panel state
  const [panelHeight, setPanelHeight] = createSignal<number>(300)
  const [isResizing, setIsResizing] = createSignal<boolean>(false)
  const [startY, setStartY] = createSignal<number>(0)
  const [startHeight, setStartHeight] = createSignal<number>(300)
  
  // Resizable column state
  const [columnWidths, setColumnWidths] = createSignal<Record<string, number>>({})
  const [resizingCol, setResizingCol] = createSignal<string | null>(null)
  const [resizeStartX, setResizeStartX] = createSignal<number>(0)
  const [resizeStartWidth, setResizeStartWidth] = createSignal<number>(0)

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

  const isEditable = () => {
    return props.tableName() && props.primaryKeyColumn()
  }

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
        // Start inline editing for the selected cell
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

  // Attach keydown listener
  onMount(() => {
    const listener = (e: KeyboardEvent) => handleKeyDown(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  })

  // Resize handlers
  const handleResizeStart = (e: MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    setStartY(e.clientY)
    setStartHeight(panelHeight())
  }

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing()) return
    const delta = startY() - e.clientY
    const newHeight = Math.max(150, Math.min(800, startHeight() + delta))
    setPanelHeight(newHeight)
  }

  const handleResizeEnd = () => {
    setIsResizing(false)
  }

  // Column resize handlers
  const handleColResizeStart = (col: string, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingCol(col)
    setResizeStartX(e.clientX)
    setResizeStartWidth(columnWidths()[col] || 120)
  }

  const handleColResizeMove = (e: MouseEvent) => {
    const col = resizingCol()
    if (!col) return
    
    const delta = e.clientX - resizeStartX()
    const newWidth = Math.max(50, resizeStartWidth() + delta)
    setColumnWidths(prev => ({ ...prev, [col]: newWidth }))
  }

  const handleColResizeEnd = () => {
    setResizingCol(null)
  }

  // Attach resize listeners
  onMount(() => {
    const moveListener = (e: MouseEvent) => {
      handleResizeMove(e)
      handleColResizeMove(e)
    }
    const upListener = () => {
      handleResizeEnd()
      handleColResizeEnd()
    }
    window.addEventListener('mousemove', moveListener)
    window.addEventListener('mouseup', upListener)
    return () => {
      window.removeEventListener('mousemove', moveListener)
      window.removeEventListener('mouseup', upListener)
    }
  })

  const handleCellDoubleClick = (rowIndex: number, columnName: string, currentValue: any) => {
    if (!isEditable()) return
    if (columnName === props.primaryKeyColumn()) return

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
      toast.error("Cannot save: missing connection or table info")
      return
    }

    const pkValue = row[pkColumn]
    if (pkValue === undefined) {
      toast.error("Cannot save: primary key value not found in row")
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
      newValue = null
    }

    if (JSON.stringify(newValue) === JSON.stringify(originalValue)) {
      setEditingCell(null)
      return
    }

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
        const stmt = props.currentStatement()
        if (stmt) {
          const refreshedResult = await props.executeSql(connId, stmt)
          window.dispatchEvent(new CustomEvent('sql-result-refreshed', { detail: refreshedResult }))
        }
        setEditingCell(null)
        setEditValue("")
        toast.success("Cell updated successfully")
      } else {
        toast.error(`Update affected ${result.rows_affected} rows (expected 1)`)
      }
    } catch (e) {
      toast.error(String(e))
    }
  }

  const renderQueryResult = () => {
    const result = props.sqlQueryResult()
    if (!result) return null

    if (Array.isArray(result)) {
      if (result.length === 0) {
        return <div class="text-muted-foreground text-xs">No rows returned</div>
      }

      const cols = Object.keys(result[0])
      const pkColumn = props.primaryKeyColumn()
      const editable = isEditable()
      const widths = columnWidths()

      return (
        <div class={`overflow-auto ${resizingCol() ? 'cursor-col-resize' : ''}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <For each={cols}>
                  {(col, colIndex) => (
                    <TableHead 
                      class={`relative ${props.isFocused() && selectedCol() === colIndex() ? 'bg-accent' : ''}`}
                      style={{ width: `${widths[col] || 120}px`, 'min-width': `${widths[col] || 120}px` }}
                    >
                      <div class="flex items-center justify-between pr-3">
                        <span class="truncate">{col}</span>
                        <Show when={col === pkColumn}>
                          <Badge variant="default" class="ml-1 shrink-0">PK</Badge>
                        </Show>
                      </div>
                      {/* Resize handle */}
                      <div
                        class="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/30 transition-colors flex items-center justify-center"
                        onMouseDown={(e) => handleColResizeStart(col, e)}
                        title="Drag to resize column"
                      >
                        <div class="w-0.5 h-4 bg-border hover:bg-primary/50" />
                      </div>
                    </TableHead>
                  )}
                </For>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={result}>
                {(row, rowIndex) => (
                  <TableRow class={props.isFocused() && selectedRow() === rowIndex() ? 'bg-accent' : ''}>
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
                          <TableCell 
                            class={`${canEdit() ? 'cursor-pointer' : ''} ${isEditing() ? 'p-0' : ''} ${
                              isSelected() && !isEditing() ? 'ring-2 ring-primary ring-inset' : ''
                            }`}
                            style={{ width: `${widths[col] || 120}px`, 'min-width': `${widths[col] || 120}px` }}
                            onDblClick={() => handleCellDoubleClick(rowIndex(), col, row[col])}
                            onClick={() => {
                              setSelectedRow(rowIndex())
                              setSelectedCol(colIndex())
                              props.onFocus()
                            }}
                          >
                            <Show when={isEditing()} fallback={
                              <>
                                {row[col] === null ? (
                                  <span class="text-muted-foreground italic">NULL</span>
                                ) : (
                                  String(row[col])
                                )}
                              </>
                            }>
                              <TextField class="w-full">
                                <TextFieldInput
                                  value={editValue()}
                                  onInput={(e) => setEditValue(e.currentTarget.value)}
                                  onKeyDown={(e: KeyboardEvent) => handleCellKeyDown(e, rowIndex(), row, col)}
                                  onBlur={() => {
                                    if (editValue() !== String(row[col] === null ? "" : row[col])) {
                                      saveCellEdit(rowIndex(), row, col)
                                    } else {
                                      setEditingCell(null)
                                    }
                                  }}
                                  class="w-full rounded-none border-0 border-primary ring-0 focus-visible:ring-0"
                                  autofocus
                                />
                              </TextField>
                            </Show>
                          </TableCell>
                        )
                      }}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
          
          <Show when={isEditable() && props.isFocused() && !editingCell()}>
            <div class="mt-2 text-xs text-muted-foreground">
              j/k: move up/down • h/l: move left/right • Enter: edit cell • Double-click: edit • Esc: back to editor
            </div>
          </Show>
          <Show when={isEditable() && props.isFocused() && editingCell()}>
            <div class="mt-2 text-xs text-primary font-medium">
              Press Enter to save, Escape to cancel
            </div>
          </Show>
          <Show when={isEditable() && !props.isFocused()}>
            <div class="mt-2 text-xs text-muted-foreground">
              Ctrl+J to focus results panel
            </div>
          </Show>
        </div>
      )
    } else if (result.rows_affected !== undefined) {
      return (
        <div class="text-green-500 text-sm">
          {result.rows_affected} row(s) affected
        </div>
      )
    }

    return <div class="text-muted-foreground text-xs">{JSON.stringify(result, null, 2)}</div>
  }

  return (
    <Show when={props.showResults()}>
      <Card 
        class={`relative rounded-none border-t border-x-0 border-b-0 flex flex-col ${
          props.isFocused() ? 'ring-2 ring-primary ring-inset' : ''
        } ${isResizing() ? 'select-none' : ''}`}
        style={{ height: `${panelHeight()}px` }}
      >
        {/* Resize handle */}
        <div
          class="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/20 transition-colors z-10 flex items-center justify-center"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <div class="w-12 h-1 rounded-full bg-border hover:bg-primary/50 transition-colors" />
        </div>

        <CardHeader class="flex flex-row items-center justify-between space-y-0 py-1 px-3 pt-3">
            <div class="flex items-center gap-1.5">
              <span class={`text-xs font-semibold ${props.isFocused() ? 'text-primary' : ''}`}>
                Results
              </span>
              <Show when={props.tableName()}>
                <Badge variant="outline" class="text-[10px] px-1.5 py-0 h-5">{props.tableName()}</Badge>
              </Show>
              <Show when={props.primaryKeyColumn()}>
                <Badge variant="default" class="text-[9px] px-1.5 py-0 h-4">PK</Badge>
              </Show>
              <Show when={editingCell()}>
                <Badge variant="secondary" class="text-[9px] animate-pulse px-1.5 py-0 h-4">edit</Badge>
              </Show>
            </div>
          <div class="flex items-center gap-1">
            <Show when={props.currentStatement()}>
              <Button 
                onClick={props.onExecute}
                disabled={!props.hasSelectedConnection() || !!editingCell()}
                size="sm"
                variant={props.hasSelectedConnection() ? "default" : "secondary"}
                class="h-6 text-xs px-2"
              >
                Run
              </Button>
            </Show>
            <Button 
              variant="ghost" 
              size="icon"
              class="h-6 w-6"
              onClick={props.onClose}
            >
              <span class="text-sm">×</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto pt-0 px-3 pb-2" onClick={props.onFocus}>
          <Show when={props.currentStatement()}>
            <div class="mb-2">
              <div class="text-[10px] text-muted-foreground mb-0.5">SQL:</div>
              <pre class="text-primary bg-muted p-1.5 rounded text-[10px] overflow-auto">{props.currentStatement()}</pre>
            </div>
          </Show>

          <Show when={props.sqlQueryResult()}>
            <div class="mb-2">
              {renderQueryResult()}
            </div>
          </Show>

          <Show when={lastError()}>
            <div class="mb-2">
              <div class="text-[10px] text-destructive mb-0.5">Error:</div>
              <div class="text-destructive text-[10px]">{lastError()}</div>
            </div>
          </Show>

          <Show when={props.sqlResults()}>
            <div>
              <div class="text-[10px] text-muted-foreground mb-0.5">Status:</div>
              <div class="text-primary text-[10px]">{props.sqlResults()}</div>
            </div>
          </Show>

          <Show when={!props.currentStatement() && !props.sqlResults() && !props.sqlQueryResult()}>
            <div class="text-muted-foreground text-[10px]">
              Press Leader+S to capture SQL • Leader+E to execute file
            </div>
          </Show>
        </CardContent>
      </Card>
    </Show>
  )
}
