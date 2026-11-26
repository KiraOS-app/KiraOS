# KIRA OS

Build AI agents in the browser. KIRA OS follows the elizaOS plugin architecture: write a character,
add plugins (actions, providers, evaluators, services, routes, events, models) and talk to your agent.

## Pages
- **`public/index.html` — Home**: particle background of Kira, "Talk to Kira" chat, agent templates, how it works.
- **`public/studio.html` — Studio, Plugins, Docs**
  - Studio: agents (character, bio, traits, style, model type), chat, knowledge docs, memory, tasks, outbox drafts,
    character settings, `character.json` import/export, project import/export.
  - Plugins: built-in store, bootstrap, claude-models, knowledge, memory, calculator, outbox, x, discord, telegram,
    base-market, plus custom plugins written as JSON manifests. Runtime tab with load order, services, models,
    composed state, routes console, event emitter and live event log.
  - Docs: 25-page guide. The "elizaOS docs" sidebar section and the "Docs for LLMs" page fill themselves from
    `public/llms-full.txt` when that file is present (download it from https://docs.elizaos.ai/llms-full.txt).

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

Every message costs API usage on your key (each tool step is one call, max 1,024 output tokens).

## Run
- **Vercel**: import the repo, set `ANTHROPIC_API_KEY`, deploy. Vercel serves `public/` and runs `api/`.
- **Local**: `cp .env.example .env`, fill in the key, `npm start`, open http://localhost:3000

## Notes
- X, Discord and Telegram plugins only write drafts to the Outbox; nothing is posted.
- The `base-market` plugin calls `/api/base`, which this repo does not include; its actions return an error until
  you add that endpoint or switch the plugin off.
- The navbar wordmark uses Russo One (Google Fonts, SIL Open Font License).
