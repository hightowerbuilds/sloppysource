# Project Functions

This directory contains the Project lifecycle edge functions:

- `project-create`
- `project-export-zip`
- `project-end-session`
- `project-github-activity`
- `project-cleanup`

## Required Secrets

Set these in Supabase project secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN` (app-owned GitHub token with repo permissions)
- `GITHUB_OWNER` (target owner/org for created repos)
- `GITHUB_TEMPLATE_OWNER`
- `GITHUB_TEMPLATE_REPO`
- `GITHUB_REPO_PREFIX` (optional, defaults to `sloppy-project`)
- `PROJECT_CLEANUP_SECRET` (used by `project-cleanup` endpoint)

## Suggested Deploy Order

1. Run DB migration in `supabase/migrations/20260304_project_repos.sql`.
2. Deploy project functions:
   - `supabase functions deploy project-create`
   - `supabase functions deploy project-export-zip`
   - `supabase functions deploy project-end-session`
   - `supabase functions deploy project-github-activity`
   - `supabase functions deploy project-cleanup`
3. Configure a scheduled job to call `project-cleanup` with header `x-cleanup-secret`.
