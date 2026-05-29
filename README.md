# tamagotchi-website

The site for **Mr. Mini Tamagotchi** — build your own tiny desk pet.

A blueprint-blue landing page with a working SSD1306 face animation, plus a
Fumadocs docs site at `/docs` for the build guide. Built on Next.js 16 App
Router; landing is fully SSR with a single client island for the canvas.

```
                ┌─────────────────────────┐
                │   /            (SSR)    │  ← landing: hero + animated OLED
                │   /docs        (SSG)    │  ← fumadocs build guide
                └─────────────────────────┘
```

---

## Quick start

```sh
bun install
bun dev
```

Open <http://localhost:3000>.

| Script           | What it does                                 |
| ---------------- | -------------------------------------------- |
| `bun dev`        | Dev server with HMR (Turbopack)              |
| `bun run build`  | Production build (also runs `tsc`)           |
| `bun start`      | Serve the production build                   |
| `bun run lint`   | Lint (next + eslint)                         |

Use Bun for all install/run commands.

---

## What's inside

```
app/
├── layout.tsx                root <html> + Google Font links (Pixelify Sans, Geist Mono)
├── globals.css               truly global resets only — no colors, no fonts
├── page.tsx                  landing page (Server Component)
├── landing.css               landing styles, all scoped to .page
├── components/
│   ├── CircuitBoard.tsx      static SVG of the ESP32 + OLED assembly (server)
│   └── OledFace.tsx          'use client' — canvas + procedural face animation
├── docs/
│   ├── layout.tsx            wraps fumadocs in .fd-shell, hosts RootProvider
│   ├── docs.css              scoped tailwind + fumadocs preset + font overrides
│   └── [[...slug]]/page.tsx  catch-all docs page handler
└── layout.config.tsx         shared nav config for fumadocs layouts

content/
└── docs/                     MDX source files + meta.json sidebar order
    ├── index.mdx
    ├── hardware/soldering.mdx
    ├── firmware/flashing.mdx
    └── api/serial.mdx

lib/source.ts                 fumadocs source loader
source.config.ts              fumadocs MDX config (schemas, paths)
mdx-components.tsx            MDX component overrides
next.config.ts                wraps with fumadocs createMDX()
postcss.config.mjs            tailwind v4 pipeline (only used by docs)
```

---

## How it all fits together

### Landing page (`/`)

A single `<main className="page">` in `app/page.tsx`. The entire page is a
Server Component except for `<OledFace />`, which is the only `'use client'`
island. `OledFace` is fully self-contained — it owns its own expression
state and cycles through 12 expressions on click, no props required.

`CircuitBoard.tsx` is pure SVG and ships from the server with zero JS.
The OLED canvas hydrates in place above it.

The pixel face is a faithful port of `firmware/src/views/procedural_face.cpp`
— same 128×64 buffer, same primitives, same blink + gaze state machine, same
12 expressions (neutral, happy, sad, sleepy, excited, surprised, angry,
blink, love, horny, shy, dead). CSS scales the canvas up with
`image-rendering: pixelated` so each OLED pixel reads as a deliberate block.

### Docs site (`/docs`)

[Fumadocs](https://fumadocs.dev) reads MDX from `content/docs/`. To add
a page, drop an `.mdx` file with frontmatter and update the local
`meta.json` to position it in the sidebar:

```mdx
---
title: My new page
description: One sentence that shows up under the title.
---

Content here. Standard MDX — components, code blocks, callouts.
```

```json
// content/docs/my-section/meta.json
{ "title": "My Section", "pages": ["intro", "my-new-page"] }
```

Static params are generated at build time from the MDX tree, so every
docs URL prerenders to HTML.

### CSS isolation

Every route's styles are scoped to a wrapper class:

- Landing: `.page` (everything from tokens to backgrounds)
- Docs: `.fd-shell` (font overrides + the fumadocs background overlay)

`globals.css` does not set colors, fonts, or backgrounds — those live in
the route-specific stylesheets. This matters because Next App Router keeps
stylesheets loaded across client navigation; unscoped rules leak between
pages otherwise (an `h1 { font-size: 96px }` on the landing CSS will blow
up every heading in the docs).

The backgrounds use `position: fixed` pseudo-elements on their wrapper
class, so they mount and unmount with the route — no flashes, no leftover
blue when you ping-pong between `/` and `/docs`.

---

## Customizing

**Change brand colors** — edit the tokens at the top of `.page` in
`app/landing.css`. Everything down to the OLED glow reads from those vars.

**Change the headline / date / location** — `app/page.tsx`, the
`.eyebrow`, `<h1>`, and `.tags` block.

**Change the docs theme** — pick a different fumadocs preset in
`app/docs/docs.css` (e.g. `aspen.css`, `ocean.css`, `vitepress.css`).

**Change the OLED face** — `app/components/OledFace.tsx`. Each expression
has its own `case` block; the rendering primitives mirror the firmware's
Renderer API, so changes here can be ported back to the C++ firmware
verbatim.

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) — SSR + static export of docs
- **React 19** — Server Components by default
- **Fumadocs UI v16** + **Tailwind CSS v4** — docs site
- **Pixelify Sans** (Google Fonts) — landing & docs chrome
- **Geist Mono** (Google Fonts) — code, mono labels
- **TypeScript** (strict) — across the app

The landing page intentionally does **not** depend on Tailwind. Plain CSS
keeps the bundle small and the OLED-themed look easy to tune.

---

## Deploy

This is a vanilla Next.js app. Push to a repo and deploy on Vercel,
Cloudflare Pages, Netlify, or anywhere that runs Node 20+. No env vars
are required for the site itself.

The docs are statically generated at build time (`generateStaticParams`
in `app/docs/[[...slug]]/page.tsx`), so every doc URL becomes an HTML
file on disk — zero server cost.

---

## Related

The firmware that actually runs on the pet lives in a sibling repo —
ESP32-C3 SuperMini, Arduino core, built with `arduino-cli`. See the
[wiring](/docs/wiring) and [firmware](/docs/firmware) docs for the build
instructions, and [serial](/docs/serial) for the line-based protocol the
pet speaks over USB CDC.
