create unique index if not exists project_sessions_user_session_key_active_idx
on public.project_sessions (user_id, session_key)
where state = 'active';
