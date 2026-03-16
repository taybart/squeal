/* @refresh reload */
import { render, Suspense } from "solid-js/web"
import App from "./View"
import { MetaProvider } from "@solidjs/meta"
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core"

render(() => {
  // Use localStorage for kobalte's color mode (required by UI components)
  const storageManager = createLocalStorageManager("squeal-theme")
  
  return (
    <MetaProvider>
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <Suspense>
          <App />
        </Suspense>
      </ColorModeProvider>
    </MetaProvider>
  )
}, document.getElementById("root") as HTMLElement);
