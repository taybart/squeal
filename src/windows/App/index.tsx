/* @refresh reload */
import { render, Suspense } from "solid-js/web"
import App from "./View"
import { MetaProvider } from "@solidjs/meta"
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core"
import { ConfirmProvider } from "~/components/ui/confirm"

render(() => {
  const storageManager = createLocalStorageManager("squeal-theme")
  
  return (
    <MetaProvider>
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <ConfirmProvider>
          <Suspense>
            <App />
          </Suspense>
        </ConfirmProvider>
      </ColorModeProvider>
    </MetaProvider>
  )
}, document.getElementById("root") as HTMLElement);
