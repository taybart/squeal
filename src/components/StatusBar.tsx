import { Show } from "solid-js"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"

interface StatusBarProps {
  currentFile: () => string
  connected: () => boolean
  mode: () => string
  cursor: () => [number, number]
  error: () => string | null
  onToggleDebug: () => void
  onToggleResults: () => void
  onToggleExplorer: () => void
  onRunLine: () => void
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

  const getModeVariant = () => {
    const m = props.mode()
    if (m === "i" || m.startsWith("i")) return "default"
    if (m === "v" || m === "V" || m === "\x16") return "secondary"
    if (m === "c") return "destructive"
    return "outline"
  }

  return (
    <div class="bg-card text-card-foreground border-b flex items-center justify-between px-4 py-2">
      <div class="flex items-center gap-3">
        <span class="font-bold text-lg">Squeal</span>
        <span class="text-sm text-muted-foreground">{props.currentFile()}</span>
        <Show when={props.connected()}>
          <Badge variant={getModeVariant() as any}>
            {getModeDisplay()}
          </Badge>
        </Show>
        <Show when={props.error()}>
          <Badge variant="destructive">{props.error()}</Badge>
        </Show>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant={props.hasStatement() ? "default" : "ghost"}
          size="sm"
          onClick={props.onToggleResults}
        >
          Toggle SQL
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onToggleExplorer}
        >
          Explorer
        </Button>
        <Separator orientation="vertical" class="h-6 mx-2" />
        <Button
          variant="default"
          size="sm"
          onClick={props.onRunLine}
          title="Capture and execute SQL statement under cursor"
        >
          Run Line
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={props.onExecuteFile}
          title="Execute all SQL in file"
        >
          Execute File
        </Button>
        <Separator orientation="vertical" class="h-6 mx-2" />
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onToggleDebug}
        >
          Debug
        </Button>
        <Badge variant="outline" class="text-xs">
          Row: {props.cursor()[0]}, Col: {props.cursor()[1]}
        </Badge>
      </div>
    </div>
  )
}
