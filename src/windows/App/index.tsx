/* @refresh reload */
import { render, Suspense } from "solid-js/web"
import App from "./View"
import { MetaProvider } from "@solidjs/meta"
import {
  ColorModeProvider,
  ColorModeScript,
  cookieStorageManagerSSR,
} from "@kobalte/core"


render(() => {
  const storageManager = cookieStorageManagerSSR(document.cookie)
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
