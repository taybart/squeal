/* @refresh reload */
import { render, Suspense } from "solid-js/web"
import { MetaProvider } from "@solidjs/meta"
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core"
import { SettingsWindow } from "~/windows/Settings/View"
import "~/windows/App/App.css"

render(() => {
  // Use localStorage for kobalte's color mode (required by UI components)
  const storageManager = createLocalStorageManager("squeal-theme")
  
  return (
    <MetaProvider>
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <Suspense>
          <SettingsWindow />
        </Suspense>
      </ColorModeProvider>
    </MetaProvider>
  )
}, document.getElementById("root") as HTMLElement)
