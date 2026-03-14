interface StatusBarProps {
  currentFile: () => string
  connected: () => boolean
  mode: () => string
  cursor: () => [number, number]
  error: () => string | null
  onToggleDebug: () => void
  onToggleResults: () => void
  onCaptureSql: () => void
  onExecuteFile: () => void
  hasStatement: () => boolean
}

export function StatusBar(props: StatusBarProps) {
  const getModeDisplay = () => {
    const m = props.mode()
    if (m === "i" || m.startsWith("i")) return "-- INSERT --"
    if (m === "v" || m === "V" || m === "\x16") return "-- VISUAL --"
    if (m === "c") return "-- COMMAND --"
    if (m === "n") return "Normal"
    return m
  }

  return (
    <div class="bg-gray-800 text-white p-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="font-bold">Squeal</span>
        <span class="text-sm text-gray-400">{props.currentFile()}</span>
        {props.connected() && (
          <span class="text-xs bg-green-600 px-2 py-0.5 rounded">
            {getModeDisplay()}
          </span>
        )}
        {props.error() && (
          <span class="text-xs bg-red-600 px-2 py-0.5 rounded">{props.error()}</span>
        )}
      </div>
      <div class="flex items-center gap-4">
        <button
          onClick={props.onToggleResults}
          class={`text-xs hover:text-white ${props.hasStatement() ? 'text-blue-400' : 'text-gray-400'}`}
        >
          Toggle SQL
        </button>
        <button
          onClick={props.onCaptureSql}
          class="text-xs px-2 py-1 bg-blue-600 text-white hover:bg-blue-500 rounded"
          title="Get SQL statement under cursor"
        >
          Capture SQL
        </button>
        <button
          onClick={props.onExecuteFile}
          class="text-xs px-2 py-1 bg-green-600 text-white hover:bg-green-500 rounded"
          title="Execute all SQL in file"
        >
          Execute File
        </button>
        <button
          onClick={props.onToggleDebug}
          class="text-xs text-gray-400 hover:text-white"
        >
          Debug (Ctrl+D)
        </button>
        <div class="text-xs text-gray-400">
          Row: {props.cursor()[0]}, Col: {props.cursor()[1]}
        </div>
      </div>
    </div>
  )
}
