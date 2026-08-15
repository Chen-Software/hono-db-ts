import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script } from 'honox/server'

type Manifest = Record<string, { file: string }>

// Vite does NOT expand `import.meta.glob('/dist/.vite/manifest.json')` inside
// node_modules code (honox's Link/Script), so it becomes empty in the built SSR
// bundle and they fall back to raw dev paths. We instead read the manifest
// produced by the client phase of `ui:build` at RUNTIME and pass it explicitly,
// so the hashed `/static/...` asset URLs are emitted in production. In `ui:dev`
// (no build) the file is absent → `manifest` is undefined → PROD is false → the
// components use the raw `/style.css` & `/client.ts` URLs the dev server serves.
let manifest: Manifest | undefined
try {
  const raw = await Bun.file('dist/.vite/manifest.json').text()
  manifest = JSON.parse(raw) as Manifest
} catch {
  manifest = undefined
}

export default jsxRenderer(({ children }) => {
  return (
    <html lang="en" data-palette="gray">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
        <Link href="/app/style.css" rel="stylesheet" prod={true} manifest={manifest} />
        <Script src="/app/client.ts" async prod={true} manifest={manifest} />
        {/*
          Restore the persisted accent palette + color scheme BEFORE first
          paint — a tiny inline boot script so there is no flash between the
          SSR defaults and the user's saved choices. The interactive switcher
          (app/islands/theme-switcher.tsx) then just mutates data-palette /
          data-theme.

          Theme storage (`bbs.theme`) holds the *preference*: `light` | `dark`
          | `system`. The CSS only knows the *resolved* scheme via
          `data-theme=light|dark` (see app/theme/conditions.ts), so:
            - light/dark → set data-theme directly;
            - system (or unset) → resolve `prefers-color-scheme` and keep
              following it live via a matchMedia listener.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
})

const SCRIPT = `(function(){try{var p=localStorage.getItem("bbs.palette");if(p){document.documentElement.dataset.palette=p;}var m=window.matchMedia("(prefers-color-scheme: dark)");var apply=function(){try{var t=localStorage.getItem("bbs.theme");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:(m.matches?"dark":"light");}catch(e){}};apply();if(m.addEventListener){m.addEventListener("change",apply);}}catch(e){}})();`
