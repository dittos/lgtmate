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

Set `VITE_ANALYSIS_SOURCE=bundled` for the public demo build so the app reads
bundled analysis JSON instead of calling `/api/analyzer`.
