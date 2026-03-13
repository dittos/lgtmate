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
