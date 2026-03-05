# CLAUDE.md

## Build & Dev Commands
- **Package manager:** Bun (not npm/yarn)

## Architecture
- pure CSS (no Tailwind/CSS-in-JS).

## Session Summaries
- Claude sessions must maintain a daily summary in `daily-summarys/claude/`.
- Use local date naming: `YYYY-MM-DD.md` (for example, `daily-summarys/claude/2026-03-04.md`).
- If today's file already exists, append/update it during the session instead of creating a duplicate.
- If today's file does not exist, create it first, then keep updating it as work progresses.
