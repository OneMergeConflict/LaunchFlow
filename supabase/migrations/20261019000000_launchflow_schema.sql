-- ============================================================================
-- LAUNCHFLOW DATABASE INITIAL SCHEMA & SECURITY POLICIES
-- PostgreSQL Migration: 20261019000000_launchflow_schema.sql
-- ============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. PROFILES TABLE (Linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role_title text default 'Product Contributor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. WORKSPACES TABLE
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. WORKSPACE MEMBERS TABLE
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- 5. PROJECTS TABLE
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'completed', 'archived', 'paused')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. TASKS TABLE
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'review', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  category text default 'Engineering',
  assignee_name text,
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. ACTIVITY LOGS TABLE
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES FOR HIGH QUERY PERFORMANCE
-- ============================================================================
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_workspace_members_ws on public.workspace_members(workspace_id);
create index if not exists idx_projects_ws on public.projects(workspace_id);
create index if not exists idx_tasks_ws_status on public.tasks(workspace_id, status);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_activity_logs_ws_date on public.activity_logs(workspace_id, created_at desc);

-- ============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to verify workspace membership
create or replace function public.is_workspace_member(check_ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = check_ws_id
      and user_id = auth.uid()
  ) or exists (
    select 1 from public.workspaces
    where id = check_ws_id
      and owner_id = auth.uid()
  );
$$;

-- Automatic updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach updated_at triggers
drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists on_workspaces_updated on public.workspaces;
create trigger on_workspaces_updated
  before update on public.workspaces
  for each row execute function public.handle_updated_at();

drop trigger if exists on_projects_updated on public.projects;
create trigger on_projects_updated
  before update on public.projects
  for each row execute function public.handle_updated_at();

drop trigger if exists on_tasks_updated on public.tasks;
create trigger on_tasks_updated
  before update on public.tasks
  for each row execute function public.handle_updated_at();

-- Trigger to automatically create a profile entry when auth.users is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, profiles.full_name),
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all public tables
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_logs enable row level security;

-- PROFILES POLICIES
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- WORKSPACES POLICIES
create policy "Workspaces viewable by members or owners"
  on public.workspaces for select
  to authenticated
  using (owner_id = auth.uid() or public.is_workspace_member(id));

create policy "Authenticated users can create workspaces"
  on public.workspaces for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Workspace owners and admins can update workspaces"
  on public.workspaces for update
  to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.workspace_members
    where workspace_id = id and user_id = auth.uid() and role in ('owner', 'admin')
  ));

create policy "Only workspace owners can delete workspaces"
  on public.workspaces for delete
  to authenticated
  using (owner_id = auth.uid());

-- WORKSPACE MEMBERS POLICIES
create policy "Members viewable by workspace members"
  on public.workspace_members for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace owners/admins can add members, or users can add themselves as owner"
  on public.workspace_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces
      where id = workspace_id and owner_id = auth.uid()
    )
    or exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create policy "Workspace owners can manage member roles"
  on public.workspace_members for update
  to authenticated
  using (
    exists (
      select 1 from public.workspaces
      where id = workspace_id and owner_id = auth.uid()
    )
  );

create policy "Workspace owners can remove members or members can leave"
  on public.workspace_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces
      where id = workspace_id and owner_id = auth.uid()
    )
  );

-- PROJECTS POLICIES
create policy "Projects viewable by workspace members"
  on public.projects for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can create projects"
  on public.projects for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Workspace members can update projects"
  on public.projects for update
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace admins or owners can delete projects"
  on public.projects for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspaces
      where id = workspace_id and owner_id = auth.uid()
    )
    or exists (
      select 1 from public.workspace_members
      where workspace_id = projects.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- TASKS POLICIES
create policy "Tasks viewable by workspace members"
  on public.tasks for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can create tasks"
  on public.tasks for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Workspace members can update tasks"
  on public.tasks for update
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can delete tasks"
  on public.tasks for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- ACTIVITY LOGS POLICIES
create policy "Activity logs viewable by workspace members"
  on public.activity_logs for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can create activity logs"
  on public.activity_logs for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));
