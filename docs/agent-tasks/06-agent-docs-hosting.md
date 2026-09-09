---
id: 06
status: done
title: Host agents.md and llms.txt on /web
---

# 06 — Agent docs hosting

Repo already has `agents.md` and `llms.txt`. This task publishes them like vgpu.sh.

## Goal

Hosted, fetchable machine docs:

- `https://<site>/agents.md`
- `https://<site>/llms.txt`

## Do

- Serve the repo files from the Astro `/web` (or copy at build).
- Optional: `/llms-full.txt` concatenating readme + agents + tasks + public API notes.
- Add those URLs to `agents.md` / `llms.txt` once the docs are deployed (`shooo.sh` is the intended site).
- Keep repo copies as the source of truth.

## Verify

- `pnpm --filter web build` includes the routes.
- curl the preview paths.

## Done

2026-09-09: Astro statically serves repository machine docs and model/rig guides.
Relative links resolve to the GitHub source. Build passed; production
`https://shooosh-web.vercel.app/agents.md` and `/llms.txt` respond successfully.
The custom `shooo.sh` domain remains a separate DNS/domain setup step.
