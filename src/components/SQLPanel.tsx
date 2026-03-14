import { For, Show } from "solid-js"

interface SQLPanelProps {
  currentStatement: () => string
  sqlResults: () => string
  sqlQueryResult: () => any
  showResults: () => boolean
  hasSelectedConnection: () => boolean
  onClose: () => void
  onExecute: () => void
}

export function SQLPanel(props: SQLPanelProps) {
  const renderQueryResult = () => {
    const result = props.sqlQueryResult()
    if (!result) return null

    // Check if it's an array of rows or an object with rows_affected
    if (Array.isArray(result)) {
      if (result.length === 0) {
        return <div class="text-gray-400 text-xs">No rows returned</div>
      }

      const columns = Object.keys(result[0])

      return (
        <div class="overflow-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-gray-700">
                <For each={columns}>
                  {(col) => (
                    <th class="text-left p-2 border border-gray-600 text-gray-300">{col}</th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={result}>
                {(row) => (
                  <tr class="hover:bg-gray-700">
                    <For each={columns}>
                      {(col) => (
                        <td class="p-2 border border-gray-600 text-gray-300">
                          {row[col] === null ? (
                            <span class="text-gray-500 italic">NULL</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
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
      <div class="bg-gray-800 border-t border-gray-700 flex flex-col" style={{ height: '300px' }}>
      <div class="p-2 bg-gray-900 text-white text-xs font-bold border-b border-gray-700 flex justify-between items-center">
        <span>SQL Statement / Results</span>
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
            <div class="text-xs text-gray-400 mb-1">Query Result:</div>
            {renderQueryResult()}
          </div>
        </Show>

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
