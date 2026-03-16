import { createSignal, createEffect } from "solid-js"
import { listen } from "@tauri-apps/api/event"
import { debugLog } from "~/utils/debug"

export interface StatementBounds {
  start_row: number
  start_col: number
  end_row: number
  end_col: number
}

export function useSql(connected: () => boolean) {
  const [currentStatement, setCurrentStatement] = createSignal<string>("")
  const [currentStatementBounds, setCurrentStatementBounds] = createSignal<StatementBounds | null>(null)
  const [sqlResults, setSqlResults] = createSignal<string>("")
  const [showResults, setShowResults] = createSignal(false)

  createEffect(() => {
    if (!connected()) return

    const unlistenStatement = listen("sql-statement", (event) => {
      debugLog("SQL", "Received sql-statement event:", event.payload)
      const data = event.payload as { 
        text: string
        start_row: number
        start_col: number
        end_row: number
        end_col: number
      }
      setCurrentStatement(data.text)
      setCurrentStatementBounds({
        start_row: data.start_row,
        start_col: data.start_col,
        end_row: data.end_row,
        end_col: data.end_col
      })
      setShowResults(true)
    })

    const unlistenExecute = listen("sql-execute", (event) => {
      debugLog("SQL", "Received sql-execute event:", event.payload)
      const data = event.payload as { statements: string[], mode: string }
      setSqlResults(`Executing ${data.statements.length} statement(s) in ${data.mode} mode...`)
      setShowResults(true)
      debugLog("SQL", "Execute SQL:", data.statements)
    })

    return () => {
      unlistenStatement.then(fn => fn())
      unlistenExecute.then(fn => fn())
    }
  })

  return {
    currentStatement,
    setCurrentStatement,
    currentStatementBounds,
    setCurrentStatementBounds,
    sqlResults,
    showResults,
    setShowResults
  }
}
