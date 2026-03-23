import { Show, createSignal, createContext, useContext, type JSX } from "solid-js"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogCloseButton } from "~/components/ui/dialog"

type ConfirmOptions = {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
}

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue>()

export function ConfirmProvider(props: { children: JSX.Element }) {
  const [open, setOpen] = createSignal(false)
  const [options, setOptions] = createSignal<ConfirmOptions>({ title: "" })
  const [resolve, setResolve] = createSignal<(value: boolean) => void>(() => {})

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts)
    setOpen(true)
    return new Promise((res) => {
      setResolve(() => res)
    })
  }

  const handleConfirm = () => {
    resolve()(true)
    setOpen(false)
  }

  const handleCancel = () => {
    resolve()(false)
    setOpen(false)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {props.children}
      <Dialog open={open()} onOpenChange={(o) => !o && handleCancel()}>
        <DialogContent class="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{options().title}</DialogTitle>
            <Show when={options().description}>
              <DialogDescription>{options().description}</DialogDescription>
            </Show>
          </DialogHeader>
          <DialogFooter>
            <DialogCloseButton class="secondary" onClick={handleCancel}>
              {options().cancelText || "Cancel"}
            </DialogCloseButton>
            <button
              class="primary inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
              onClick={handleConfirm}
            >
              {options().confirmText || "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider")
  }
  return context
}
