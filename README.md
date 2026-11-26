# KIRA OS

Live at **https://getkira.xyz**

Build AI agents in the browser. KIRA OS is built on a modular plugin architecture: write a character,
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
  - Docs: 25-page guide. The "Docs for LLMs" page shows `public/llms-full.txt` (KIRA OS documentation, MIT License,
    © KIRA OS contributors — see `public/llms-full.NOTICE.txt`).

Agents and chats are stored in the visitor's browser and, after signing in, in their account.
Each agent can have its own photo (resized to 128 px in the browser).


## Accounts (sign in with X, wallet or email)
- **Wallet**: EIP-191 `personal_sign` of a one-time message; checked on the server with a built-in secp256k1/keccak
  implementation (`lib/eth.js`), no gas, no transaction.
- **X**: OAuth 2.0 with PKCE. Create an app at developer.x.com, type *Web App*, callback URL
  `https://getkira.xyz/api/auth/x-callback`, scopes `users.read tweet.read`.
- **Email**: a 6-digit code sent through Resend (resend.com); codes expire after 10 minutes, 5 tries max.
- Sessions are signed HTTP-only cookies (30 days). Saved agents live in Upstash Redis under `kira:data:<user>`.
  When someone signs in, the account's saved agents replace the browser copy; a new account receives the browser copy.

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
| `SESSION_SECRET` | – | Required for accounts: a long random string |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | – | Required for accounts (or `KV_REST_API_URL` / `KV_REST_API_TOKEN` from Vercel's Upstash integration) |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | – | Turns on "Continue with X" |
| `RESEND_API_KEY` / `EMAIL_FROM` | – | Turns on "Continue with email" (`EMAIL_FROM` like `KIRA OS <login@getkira.xyz>`) |
| `SITE_URL` | request origin | e.g. `https://getkira.xyz`, used for the X callback and wallet message |
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
- The wordmark uses Archivo Black (Google Fonts, SIL Open Font License).
