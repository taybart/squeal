import { createSignal, createEffect } from "solid-js"
import { listen } from "@tauri-apps/api/event"

export function useSql(connected: () => boolean) {
  const [currentStatement, setCurrentStatement] = createSignal<string>("")
  const [sqlResults, setSqlResults] = createSignal<string>("")
  const [showResults, setShowResults] = createSignal(false)

  createEffect(() => {
    if (!connected()) return

    const unlistenStatement = listen("sql-statement", (event) => {
      console.log("Received sql-statement event:", event.payload)
      const stmt = event.payload as string
      setCurrentStatement(stmt)
      setShowResults(true)
    })

    const unlistenExecute = listen("sql-execute", (event) => {
      console.log("Received sql-execute event:", event.payload)
      const data = event.payload as { statements: string[], mode: string }
      setSqlResults(`Executing ${data.statements.length} statement(s) in ${data.mode} mode...`)
      setShowResults(true)
      console.log("Execute SQL:", data.statements)
    })

    return () => {
      unlistenStatement.then(fn => fn())
      unlistenExecute.then(fn => fn())
    }
  })

  return {
    currentStatement,
    sqlResults,
    showResults,
    setShowResults
  }
}
