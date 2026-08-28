---
id: 06
status: todo
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
- Add those URLs to `agents.md` / `llms.txt` once the production host is known (`shooosh.federic.ooo` is the intended site).
- Keep repo copies as the source of truth.

## Verify

- `pnpm --filter web build` includes the routes.
- curl the preview paths.

## Done

_Fill in when complete._
