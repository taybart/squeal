interface SQLPanelProps {
  currentStatement: () => string
  sqlResults: () => string
  showResults: () => boolean
  onClose: () => void
  onExecute: () => void
}

export function SQLPanel(props: SQLPanelProps) {
  if (!props.showResults()) return null

  return (
    <div class="bg-gray-800 border-t border-gray-700 flex flex-col" style={{ height: '200px' }}>
      <div class="p-2 bg-gray-900 text-white text-xs font-bold border-b border-gray-700 flex justify-between items-center">
        <span>SQL Statement / Results</span>
        <div class="flex items-center gap-2">
          {props.currentStatement() && (
            <button 
              onClick={props.onExecute}
              class="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
            >
              Execute
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
          <div class="mb-2">
            <div class="text-xs text-gray-400 mb-1">Current Statement (Leader+S):</div>
            <div class="text-green-300">{props.currentStatement()}</div>
          </div>
        )}
        {props.sqlResults() && (
          <div>
            <div class="text-xs text-gray-400 mb-1">Results:</div>
            <div class="text-blue-300">{props.sqlResults()}</div>
          </div>
        )}
        {!props.currentStatement() && !props.sqlResults() && (
          <div class="text-gray-500 text-xs">
            Press Leader+S to capture current SQL statement<br/>
            Press Leader+E to execute entire file
          </div>
        )}
      </div>
    </div>
  )
}
