# lgtmate

> LGTM + mate, or legitimate

**lgtmate** is a local, web-based GitHub pull request review tool.

## Technical Overview

* TypeScript, React, React Router-based SPA application
* Bundler: Vite
* Styling: Tailwind CSS v4 with shadcn/ui
* Runs API server through Vite plugin
* API server proxies requests to GitHub APIs
    * GitHub API requests are made through `gh` CLI for no extra GitHub auth process

## Directory Notes

* `src/main.tsx` only bootstraps the router
* `src/routes/` contains route-level components and data-loading logic
* `src/components/pr/` contains pull request view UI components
* `src/lib/` contains shared client-side helpers and API types
* `server/` contains Vite dev-server middleware helpers and per-route handlers
