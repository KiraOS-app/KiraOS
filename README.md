# KIRA OS

Live at **https://getkira.xyz**

Build AI agents in the browser. KIRA OS follows the elizaOS plugin architecture: write a character,
add plugins (actions, providers, evaluators, services, routes, events, models) and talk to your agent.

## Pages
- **`public/legal.html` — Terms & Privacy**, linked from the home footer.
- **`public/index.html` — Home**: particle background of Kira, "Talk to Kira" chat, agent templates, how it works.
- **`public/studio.html` — Studio, Plugins, Docs**
  - Studio: agents (character, bio, traits, style, model type), chat, knowledge docs, memory, tasks, outbox drafts,
    character settings, `character.json` import/export, project import/export.
  - Plugins: built-in store, bootstrap, claude-models, knowledge, memory, calculator, outbox, x, discord, telegram,
    plus custom plugins written as JSON manifests. Runtime tab with load order, services, models,
    composed state, routes console, event emitter and live event log.
  - Docs: 25-page guide, plus the full elizaOS documentation from `public/llms-full.txt` (sidebar "elizaOS docs"
    and the "Docs for LLMs" page). Update it with a newer copy from https://docs.elizaos.ai/llms-full.txt.

Agents and chats are stored in each visitor's browser (localStorage).

## Server
`POST /api/studio` (`api/studio.js`, `lib/studio.js`) makes one Claude call per request with your key; the page
runs the agent runtime and its tools itself.

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Required |
| `AI_MODEL` | `claude-haiku-5-5` | Model for the SMALL type and the home chat |
| `STUDIO_MODEL` | `AI_MODEL` | Model for the LARGE type |
| `STUDIO_MODEL_REASONING` | `STUDIO_MODEL` | Model for the REASONING type |
| `STUDIO_PER_MINUTE` / `STUDIO_PER_DAY` | 20 / 300 | Calls per visitor IP |
| `STUDIO_DISABLED` | – | `1` switches the AI off |
| `ALLOWED_ORIGINS` | `https://getkira.xyz,https://www.getkira.xyz` | Sites allowed to call the API (localhost and `kira-os*.vercel.app` always allowed) |
| `STUDIO_DAILY_CAP` | 3000 | Total calls per day for all visitors together, per server instance |

Every message costs API usage on your key (each tool step is one call, max 1,024 output tokens).

## Run
- **Vercel (Git import)**: import the repo, set `ANTHROPIC_API_KEY`, deploy. Vercel serves `public/` and runs `api/`.
- **Vercel (GitHub Actions)**: add repository secrets `VERCEL_TOKEN` and `ANTHROPIC_API_KEY`; every push to `main`
  deploys through `.github/workflows/vercel.yml` (or run it from the Actions tab).
- **Local**: `cp .env.example .env`, fill in the key, `npm start`, open http://localhost:3000

## Notes
- X, Discord and Telegram plugins only write drafts to the Outbox; nothing is posted.
- `public/llms-full.txt` is the elizaOS documentation, MIT License, © elizaOS contributors
  (see `public/llms-full.NOTICE.txt`).
- The wordmark uses Archivo Black (Google Fonts, SIL Open Font License).
