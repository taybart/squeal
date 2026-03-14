/* @refresh reload */
import { render, Suspense } from "solid-js/web"
import { MetaProvider } from "@solidjs/meta"
import {
  ColorModeProvider,
  ColorModeScript,
  cookieStorageManagerSSR,
} from "@kobalte/core"
import { SettingsWindow } from "~/windows/Settings/View"
import "~/windows/App/App.css"

render(() => {
  const storageManager = cookieStorageManagerSSR(document.cookie)
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
