import { Show } from "solid-js"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import ThemeButton from "~/components/Themebutton"

interface StatusBarProps {
  currentFile: () => string
  connected: () => boolean
  mode: () => string
  cursor: () => [number, number]
  error: () => string | null
  activeConnectionName: () => string | null
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
      <ThemeButton />
      <div class="flex items-center gap-2">
        {/* Run Line - Icon Button */}
        <Button
          variant={props.hasStatement() ? "default" : "ghost"}
          size="icon"
          class="h-8 w-8"
          onClick={props.onRunLine}
          title="Run Line (⌘E)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </Button>

        {/* Execute File - Icon Button */}
        <Button
          variant="secondary"
          size="icon"
          class="h-8 w-8"
          onClick={props.onExecuteFile}
          title="Execute File (⌘⇧E)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
            <path d="M14 2v6h6" />
            <path d="M2 15h10" />
            <path d="m5 12-3 3 3 3" />
            <path d="M9 18h3" />
          </svg>
        </Button>

        <Show when={props.activeConnectionName()}>
          <Badge variant="default" class="text-xs bg-blue-600">
            {props.activeConnectionName()}
          </Badge>
        </Show>

        <Badge variant="outline" class="text-xs">
          Row: {props.cursor()[0]}, Col: {props.cursor()[1]}
        </Badge>
      </div>
    </div>
  )
}