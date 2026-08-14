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
          Restore the persisted accent palette BEFORE first paint — a tiny
          inline boot script so there is no flash between the SSR `gray`
          default and the user's saved choice. The interactive switcher
          (app/islands/theme-switcher.tsx) then just mutates data-palette.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
})

const SCRIPT = `(function(){try{var p=localStorage.getItem("bbs.palette");if(p){document.documentElement.dataset.palette=p;}}catch(e){}})();`
