create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  github_repo_full_name text,
  github_repo_id bigint,
  status text not null default 'active' check (status in ('active', 'archived', 'deleting', 'deleted', 'error')),
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz
);

create table if not exists public.project_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_key text not null,
  state text not null default 'active' check (state in ('active', 'ended')),
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  delete_scheduled_at timestamptz
);

create table if not exists public.project_audit_logs (
  id bigserial primary key,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  result text not null,
  details jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists projects_user_id_updated_at_idx
on public.projects (user_id, updated_at desc);

create index if not exists project_sessions_project_id_state_idx
on public.project_sessions (project_id, state);

create index if not exists project_audit_logs_project_id_created_at_idx
on public.project_audit_logs (project_id, created_at desc);

create unique index if not exists project_sessions_one_active_per_project_idx
on public.project_sessions (project_id)
where state = 'active';

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_sessions enable row level security;
alter table public.project_audit_logs enable row level security;

create policy "users can read own projects"
on public.projects
for select
using (auth.uid() = user_id);

create policy "users can create own projects"
on public.projects
for insert
with check (auth.uid() = user_id);

create policy "users can update own projects"
on public.projects
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own projects"
on public.projects
for delete
using (auth.uid() = user_id);

create policy "users can read own project sessions"
on public.project_sessions
for select
using (auth.uid() = user_id);

create policy "users can create own project sessions"
on public.project_sessions
for insert
with check (auth.uid() = user_id);

create policy "users can update own project sessions"
on public.project_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own project sessions"
on public.project_sessions
for delete
using (auth.uid() = user_id);

create policy "users can read own project audit logs"
on public.project_audit_logs
for select
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-exports',
  'project-exports',
  false,
  104857600,
  array['application/zip']
)
on conflict (id) do nothing;
