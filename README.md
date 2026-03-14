# lgtmate

Local, web-based GitHub pull request review tool.

## Stack

- Vite
- React
- TypeScript
- React Router

## Development

```bash
npm install
npm run dev
```

The Vite dev server exposes:

- `GET /api/health`
- `GET /api/github/status`

## Frontend-Only Demo

If the deployed demo does not include the Vite middleware server, bundle selected
analysis results into the frontend and point the client at them:

```bash
npm run demo:import-analysis -- mastodon mastodon 19059 codex
```

That copies the cached file from `~/.lgtmate/analyses/...` into
`src/demo/analyses/...`, where Vite can lazy-load it.

The demo build env is checked into `.env.demo`:

```env
VITE_ANALYSIS_SOURCE=bundled
VITE_GITHUB_API_BASE_URL=https://api.github.com
```

Build the public demo with:

```bash
npm run build:demo
```

That makes the app read bundled analysis JSON instead of calling `/api/analyzer`,
while still loading PR metadata and files from GitHub.
