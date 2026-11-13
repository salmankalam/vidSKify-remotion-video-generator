# vidSkify

A local AI video generator. Describe a video in plain English (optionally with reference images and a website), get a structured plan, edit every field, and render a real MP4 with Remotion.

- **Next.js 16** — library, brief capture, editor, API routes
- **Remotion 4** — one parametrized composition, six layouts, landscape and portrait
- **APInex** — brief analysis (vision + strict JSON) and AI revisions, using only free-tier models
- **Disk storage** — projects are folders, no database, no native modules

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:3100**. Two processes start together:

| Process | Port | What it does |
| --- | --- | --- |
| Next.js | 3100 | UI, AI calls, project CRUD, asset streaming |
| Render worker | 4321 | Remotion bundling, TTS, `renderMedia`, progress |

The split is required: `@remotion/bundler` and `@remotion/renderer` cannot run inside a Next.js API route.

### Enable AI (APInex)

```bash
cp .env.example .env
# paste your key from https://apinex.bond into APINEX_API_KEY
```

Restart the dev server. Without a key the app still works end to end: the brief is turned into a draft by a deterministic heuristic and the render is real. That makes it cheap to try the pipeline before spending anything.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APINEX_API_KEY` | — | Enables brief analysis and AI edits |
| `APINEX_BASE_URL` | `https://api.apinex.bond/v1` | OpenAI-compatible gateway root |
| `APINEX_TEXT_MODEL` | `free/deepseek-v4.1-flash` | Must be a `free/…` model |
| `APINEX_TTS_MODEL` | — | Optional; see voiceover below |
| `RENDER_WORKER_URL` | `http://127.0.0.1:4321` | Where the UI reaches the worker |
| `RENDER_WORKER_PORT` | `4321` | Worker listen port |

**Only free models are used.** APInex ids prefixed with `free/` are the free-tier allowance; paid ids and subscription-only models are deliberately not referenced anywhere in the code. The gateway is OpenAI-compatible, so `lib/ai/client.ts` talks to `/chat/completions` with `response_format: json_schema`, falling back to `json_object` and then plain JSON if a model rejects structured output.

Free tier is limited to roughly 15 requests per minute. A brief is one request; an AI edit is one request.

### Voiceover

APInex does not expose `/audio/speech` on the free tier, so renders are **silent** by default: narration still drives burned-in captions and scene length (estimated at 2.6 words/second). If your gateway does serve a TTS model, set `APINEX_TTS_MODEL` and each scene is voiced on render, with the measured audio length setting the scene duration.

## The flow

1. **Library** (`/`) — previously generated videos with poster thumbnails.
2. **New video** (`/new`) — brief, up to four reference images, optional website URL, aspect ratio.
3. **Editor** (`/v/[id]`) — live Remotion Player with a storyboard rail, a Preview/Output stage toggle, design/scene/audio/AI inspectors, render progress, playback of the finished MP4 and download.

### What the AI produces

It never writes video code. It fills a typed `VideoSpec` (`lib/spec.ts`):

- `meta` — title, aspect (`16:9` / `9:16`), tone
- `brand` — five-colour palette, font pairing
- `audio` — voice, music asset, volume, transition SFX
- `captions` — burn-in toggle
- `scenes[]` — layout, heading, body, narration, emphasis word, image + treatment, transition, optional manual duration

Scene layouts: `hook`, `split`, `fullBleed`, `statement`, `list`, `cta`.

Everything is validated with zod and normalised defensively, so a loose model response can never break the renderer. AI edits return a complete new spec, stored as a revision — **Undo** restores the previous one.

## Timing: preview equals export

One pure module (`lib/timing.ts`) computes frames for both the browser Player and the renderer:

- Measured voiceover length (from the TTS WAV) plus a short breath sets scene length.
- Manual duration overrides win.
- `TransitionSeries` overlaps scenes, so total = Σ scene frames − Σ transition overlaps.
- Captions are chunked across the scene against the same duration.

A scene with no voiceover falls back to words ÷ 2.6 words per second, so previews stay usable before the first render.

## Storage layout

```
storage/projects/<id>/
  project.json     # spec, assets, revisions, render state (atomic writes)
  assets/          # uploads, voiceover WAVs, SFX
  out/             # video.mp4, poster.jpg
```

Specs store asset **ids**, not paths. The editor maps them to `/api/assets/...` and the worker maps them to its own HTTP server, so the same composition renders in both places and projects stay portable.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next + render worker |
| `npm run dev:next` | UI only |
| `npm run dev:worker` | worker only |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run compositions` | bundles Remotion and checks the composition at both ratios against the timing module |

## Troubleshooting

- **"The render worker is not running"** — start it with `npm run dev:worker`; check `http://127.0.0.1:4321/health`.
- **First render is slow** — the worker downloads Chrome Headless Shell once and bundles the template at startup. Watch the worker log.
- **Editing `remotion/*` in dev** — the bundle is cached per worker process; restart the worker after changing the template.
- **Voiceover missing** — the free APInex tier has no speech endpoint. Renders stay silent until `APINEX_TTS_MODEL` is set; scene pacing comes from the script.
- **Ports taken** — change `-p 3100` in `package.json` and set a matching `RENDER_WORKER_URL` if you move the worker.

## Deliberately out of scope (v1)

Auth, cloud/Lambda rendering, AI image generation, stock footage search, 1:1 output, timeline trimming, word-level transcript alignment.
