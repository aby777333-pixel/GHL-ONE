-- 0048 — Role templates: curated starting points for a company's own roles.
--
-- Until now the Roles tab could edit the seeded roles and nothing else. There was no way to create
-- one, so "a company defines its own roles" was not actually true — and it could not have worked
-- anyway, because creating a role raised until the audit-trigger bug was fixed in 0041. Nobody had
-- ever made one.
--
-- Templates are curated centrally and global, the same shape as `company_templates`. A company
-- COPIES one and owns the copy from that moment: nothing links the role back to the template,
-- because a starting point that keeps editing itself is not a starting point.
--
-- Authority is not this table's problem. `guard_system_role` already refuses, by name, any
-- permission the creator does not hold themselves, so a template containing more than the creator
-- can grant fails loudly with the specific key rather than quietly producing a weaker role.

create table if not exists public.role_templates (
  key         text primary key,
  name        text not null,
  description text not null,
  category    text not null default 'general',
  base_level  role_level not null default 'employee',
  permissions text[] not null default '{}',
  is_system   boolean not null default true,
  position    integer not null default 100,
  created_at  timestamptz not null default now()
);

comment on table public.role_templates is
  'Curated starting points for company roles. Copied into system_roles on use; the copy is the company''s own and is never linked back.';

alter table public.role_templates enable row level security;

drop policy if exists role_templates_read on public.role_templates;
create policy role_templates_read on public.role_templates for select using (auth.uid() is not null);

drop policy if exists role_templates_write on public.role_templates;
create policy role_templates_write on public.role_templates for all
  using (is_platform_owner()) with check (is_platform_owner());

-- The seed uses the granular module.action keys from 0040 throughout; that is what they are for.
insert into public.role_templates (key, name, description, category, base_level, permissions, position) values
  ('hr_administrator', 'HR Administrator',
   'Runs hiring, onboarding and employee records. Approves requests and assigns training.',
   'people', 'manager',
   array['people.view','people.create','people.edit','people.invite','people.export',
         'jobs.view','jobs.create','jobs.edit','jobs.publish',
         'academy.view','academy.manage','academy.create_course',
         'requests.view','requests.approve','reports.view','hr.manage','leave.approve'], 10),

  ('department_manager', 'Department Manager',
   'Runs one department''s work and people. Approves requests and assigns tasks, but does not touch company settings.',
   'people', 'manager',
   array['people.view','tasks.view','tasks.create','tasks.edit','tasks.assign',
         'projects.view','projects.create','projects.edit',
         'goals.view','goals.create','goals.edit','goals.assign',
         'requests.view','requests.approve','reports.view','manage_team','leave.approve'], 20),

  ('finance_manager', 'Finance Manager',
   'Approves spending, reads and exports financial reporting, and sees the company plan.',
   'operations', 'manager',
   array['view','comment','create','edit','requests.view','requests.approve',
         'reports.view','reports.export','billing.view'], 30),

  ('it_administrator', 'IT Administrator',
   'Keeps the workspace running: system settings, integrations and files. Not an access administrator.',
   'operations', 'manager',
   array['admin.view','system.manage','integrations.view','security.view',
         'files.view','files.upload','files.edit','files.delete','files.share',
         'tasks.view','tasks.create','tasks.edit'], 40),

  ('auditor', 'Auditor',
   'Reads everything that records what happened, and changes nothing. Deliberately has no write permission at all.',
   'oversight', 'employee',
   array['audit.view','audit.export','reports.view','reports.export',
         'access_control.view','security.view','people.view','departments.view'], 50),

  ('content_writer', 'Content Writer',
   'Writes and edits content and wiki pages. Cannot publish announcements or reach administration.',
   'craft', 'employee',
   array['wiki.view','wiki.create','wiki.edit','files.view','files.upload',
         'tasks.view','tasks.create','tasks.edit','projects.view',
         'ideas.view','ideas.create','announcements.view'], 60),

  ('content_publisher', 'Content Publisher',
   'A writer who may also publish to the company. Pairs with Content Writer rather than replacing it.',
   'craft', 'employee',
   array['announcements.create','announcements.edit','announcements.publish',
         'wiki.delete','broadcast_department'], 65),

  ('designer', 'Designer',
   'Design work, files and boards. Sees the projects they are on.',
   'craft', 'employee',
   array['tasks.view','tasks.create','tasks.edit','projects.view',
         'files.view','files.upload','files.edit','files.share','wiki.view','ideas.view','ideas.create'], 70),

  ('developer', 'Developer',
   'Builds and ships. Full reach over tasks and their own projects, plus the wiki.',
   'craft', 'employee',
   array['tasks.view','tasks.create','tasks.edit','tasks.delete','tasks.assign',
         'projects.view','projects.create','projects.edit',
         'files.view','files.upload','files.edit','files.share',
         'wiki.view','wiki.create','wiki.edit','status.view'], 80),

  ('sales_employee', 'Sales Employee',
   'Works the sales inbox: contacts, conversations and calls. Sends without needing approval.',
   'commercial', 'employee',
   array['connect.use','connect.send','connect.call',
         'tasks.view','tasks.create','tasks.edit','files.view','reports.view'], 90),

  ('customer_support', 'Customer Support',
   'Answers customers and raises what needs escalating. Sends replies but does not approve others''.',
   'commercial', 'employee',
   array['connect.use','connect.send','tasks.view','tasks.create','tasks.edit',
         'wiki.view','files.view','status.view'], 100),

  ('read_only', 'Read Only',
   'Sees the company without changing any of it. For observers, auditors-in-training and short-term visitors.',
   'oversight', 'employee',
   array['view','people.view','departments.view','tasks.view','projects.view','wiki.view','announcements.view'], 110)
on conflict (key) do nothing;

-- A template naming a key that is not in the catalogue would create a role granting nothing for
-- that key, silently. Refuse the row rather than discover it in production.
create or replace function public.guard_role_template()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare k text;
begin
  foreach k in array coalesce(new.permissions, '{}') loop
    if not exists (select 1 from permissions p where p.key = k) then
      raise exception 'Role template "%" names "%", which is not in the permission catalogue.', new.key, k;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_guard_role_template on public.role_templates;
create trigger trg_guard_role_template
  before insert or update on public.role_templates
  for each row execute function public.guard_role_template();

-- The trigger cannot catch a key that leaves the catalogue *after* a template is written, so
-- `test_access_control()` checks the same invariant on every run of the self test.
