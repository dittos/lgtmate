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

## Launcher

Install the package link locally, then run the launcher from inside a GitHub clone:

```bash
npm link
lgtm 123
```

The launcher will:

- infer `owner/repo` from the `origin` remote
- register the current clone in `~/.lgtmate/settings.json`
- start the local Vite server if needed and cache its `pid` and `port` in `~/.lgtmate/server-instance.json`
- remember the default analyzer provider in `~/.lgtmate/settings.json`
- trigger PR analysis and open `/:owner/:repo/pull/:number`

Optional flags:

```bash
lgtm 123 --provider claude
lgtm 123 --port 5180
lgtm 123 --no-open
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
