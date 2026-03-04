# Repository Guidelines

## Project Structure & Module Organization
This project is a Bun-managed React + TypeScript + Vite app.

- `src/main.tsx`: app bootstrap (React Query, router, selected-doc provider).
- `src/router.tsx`: route tree and auth guards.
- `src/pages/`: route-level screens (`HomePage`, `ViewerPage`, `SearchPage`, `LoginPage`).
- `src/components/`: shared UI (`Navbar`, `DocPicker`, layout shell).
- `src/lib/`: Supabase client/data access, formatting helpers, context, search worker.
- `public/`: static assets.
- `dist/`: production build output (generated).
- `daily-summarys/`: session notes/history (non-runtime docs).

## Build, Test, and Development Commands
Use Bun unless a tool requires otherwise.

- `bun install`: install dependencies from `bun.lock`.
- `bun run dev`: start Vite dev server.
- `bun run build`: type-check and produce production bundle in `dist/`.
- `bun run lint`: run ESLint across the repo.
- `bun run preview`: preview the built app locally.
- `bunx tsc --noEmit`: optional strict type-check pass.

## Coding Style & Naming Conventions
- Language: TypeScript with React function components and hooks.
- Indentation: 2 spaces; keep imports grouped and explicit `.ts/.tsx` extensions as used.
- Naming: `PascalCase` for components/pages, `camelCase` for functions/variables, kebab-case CSS files colocated by feature.
- Prefer small modules in `src/lib/` for side-effect-free utilities.
- Linting: ESLint (`eslint.config.js`) is the baseline; fix warnings before opening PRs.

## Testing Guidelines
There is currently no dedicated test framework configured in `package.json`.

- Minimum gate: `bun run lint` and `bun run build` must pass.
- For behavior changes, include manual verification steps in PRs (route, action, expected result).
- If adding tests, colocate as `*.test.ts(x)` near the feature or under `src/__tests__/`.

## Commit & Pull Request Guidelines
Current history uses short, imperative commits (e.g., `readying bun lock`).

- Keep commit subjects concise, present tense, and scoped to one change.
- PRs should include: purpose, key files changed, verification commands run, and screenshots for UI changes.
- Link related issues/tasks when available and call out config/env changes explicitly.

## Security & Configuration Tips
- Required env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never commit secrets; keep credentials in `.env` and ensure `.gitignore` coverage.
