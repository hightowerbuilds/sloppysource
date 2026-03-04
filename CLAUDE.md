# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

- **Package manager:** Bun (not npm/yarn)
- `bun install` — install dependencies
- `bun run dev` — start Vite dev server with HMR
- `bun run build` — TypeScript check + Vite production build
- `bun run lint` — ESLint
- `bun run preview` — preview production build

## Environment Variables

Requires a `.env` file with:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon public key

## Architecture

**Stack:** React 19 + TypeScript + Vite 7, Supabase (PostgreSQL + Auth), TanStack Router/Query/Hotkeys, pure CSS (no Tailwind/CSS-in-JS).

**Routing** (`src/router.tsx`): TanStack Router with lazy-loaded routes. Auth guard via `requireAuth()` in `beforeLoad` hooks redirects unauthenticated users to `/login`. Routes:
- `/login` → LoginPage
- `/` → HomePage (auth required)
- `/doc/$docId` → ViewerPage (auth required)

**Layout** (`src/components/RootLayout.tsx`): Persistent shell with nav bar, storage quota display (100 MB per user), upload button, and auth state management. Subscribes to Supabase `onAuthStateChange` and renders child routes via `<Outlet />`.

**Auth** (`src/pages/LoginPage.tsx`): Username-based auth that converts usernames to `{username}@sloppysource.local` emails for Supabase's email auth system.

**Data layer** (`src/lib/supabaseDb.ts`): All DB operations (CRUD for documents, storage quota checks) go through this module. Documents are `{ id, name, markdown, sizeBytes, createdAt, updatedAt }`. Upload enforces a 100 MB per-user storage limit with a pre-upsert check.

**Search** (`src/components/DocumentSearchModal.tsx` + `src/lib/searchWorker.ts`): In-document search runs in a Web Worker. Supports plain text, regex, whole-word, case-sensitive modes, and tag filtering (H1/H2/H3/code). Uses request IDs to handle stale responses, 200ms debounce, and truncates at 500 matched lines with 100-per-page pagination.

## Key Patterns

- **React Query** manages all server state — no Redux or global state library. Query keys: `["documents"]`, `["document", docId]`, `["storage-usage"]`. Mutations invalidate related queries on success.
- **Query stale times:** documents list 30s, single document 60s, storage 30s. Retries disabled globally.
- **Document IDs** are generated client-side from normalized filename + `Date.now()` + UUID.
- **File upload** uses a hidden `<input>` element; client-side validation enforces 5 MB max, `.md`/`.markdown` extension, non-empty content.
- **Markdown rendering** uses `react-markdown` with `remark-gfm` plugin.
