-- 0040 — Module × action permissions, without changing what anybody can do today.
--
-- The catalogue was a set of broad verbs: `view`, `create`, `edit`, `delete`, plus a handful of
-- `<module>.manage` keys. That cannot express "may edit the wiki but not delete people", which is
-- the whole point of role-based access control, so this splits the catalogue into `module.action`
-- keys — people.view, files.upload, announcements.publish, and so on.
--
-- THE RULE THAT MAKES THIS SAFE: every granular key records the broad key it refines
-- (`legacy_alias`). `has_perm` answers a granular key by looking for the granular key **or** its
-- alias. So a role written before today that holds `view` still satisfies `people.view`,
-- `wiki.view` and `files.view` — it grants nothing it did not already grant, and takes nothing
-- away. New roles can be written precisely; old roles keep working untouched.
--
-- Verified behaviour-identical across every user × every pre-existing key before and after.

-- ---------------------------------------------------------------- catalogue shape
alter table public.permissions add column if not exists module text;
alter table public.permissions add column if not exists action text;
alter table public.permissions add column if not exists legacy_alias text;

comment on column public.permissions.module is
  'The area this key governs (people, files, wiki…). Informational: authorisation is by key.';
comment on column public.permissions.action is
  'view | create | edit | delete | approve | manage | export | publish | assign | upload | download | share';
comment on column public.permissions.legacy_alias is
  'The broad key this one refines. has_perm accepts either, so roles written against the broad key keep working. Null on the broad keys themselves.';

-- Name the broad keys so the studio can group them with their descendants.
update public.permissions set module = 'general', action = key
 where key in ('view','comment','create','edit','delete','invite') and module is null;
update public.permissions set module = 'files', action = key
 where key in ('download','share_external','share_internal') and module is null;
update public.permissions set module = 'reports', action = case key when 'export' then 'export' else 'view' end
 where key in ('export','view_reports') and module is null;
update public.permissions set module = split_part(key, '.', 1), action = split_part(key, '.', 2)
 where key like '%.%' and module is null;
update public.permissions set module = grp, action = 'manage' where module is null;

-- ------------------------------------------------------------------ granular keys
-- (key, label, description, grp, risk, alias, module, action, position)
insert into public.permissions (key, label, description, grp, risk, legacy_alias, module, action, position)
values
  -- People
  ('people.view',            'People · view',              'See the employee directory.',                              'people','standard','view','people','view',200),
  ('people.create',          'People · add',               'Add a person to the company.',                             'people','elevated','invite','people','create',201),
  ('people.edit',            'People · edit',              'Change someone''s employee record.',                       'people','elevated','people.manage','people','edit',202),
  ('people.delete',          'People · remove',            'Deactivate or remove a person.',                           'people','high','people.manage','people','delete',203),
  ('people.invite',          'People · invite',            'Send an invitation to join.',                              'people','elevated','invite','people','invite',204),
  ('people.export',          'People · export',            'Export the directory or employee data.',                   'people','high','export','people','export',205),
  -- Departments
  ('departments.view',       'Departments · view',         'See departments and their members.',                       'organisation','standard','view','departments','view',210),
  ('departments.create',     'Departments · create',       'Create a department.',                                     'organisation','elevated','department.manage','departments','create',211),
  ('departments.edit',       'Departments · edit',         'Rename, recolour or reassign a department.',               'organisation','elevated','department.manage','departments','edit',212),
  ('departments.delete',     'Departments · delete',       'Remove a department.',                                     'organisation','high','department.manage','departments','delete',213),
  -- Projects & tasks
  ('projects.view',          'Projects · view',            'See projects you are entitled to.',                        'work','standard','view','projects','view',220),
  ('projects.create',        'Projects · create',          'Start a project.',                                         'work','standard','create_project','projects','create',221),
  ('projects.edit',          'Projects · edit',            'Change project details and plan.',                         'work','standard','edit','projects','edit',222),
  ('projects.delete',        'Projects · delete',          'Delete or archive a project.',                             'work','elevated','delete','projects','delete',223),
  ('tasks.view',             'Tasks · view',               'See tasks you are entitled to.',                           'work','standard','view','tasks','view',225),
  ('tasks.create',           'Tasks · create',             'Create tasks.',                                            'work','standard','create','tasks','create',226),
  ('tasks.edit',             'Tasks · edit',               'Change a task.',                                           'work','standard','edit','tasks','edit',227),
  ('tasks.delete',           'Tasks · delete',             'Delete a task.',                                           'work','elevated','delete','tasks','delete',228),
  ('tasks.assign',           'Tasks · assign',             'Assign work to another person.',                           'work','standard','assign_task','tasks','assign',229),
  -- Jobs / recruitment
  ('jobs.view',              'Jobs · view',                'See openings and the job board.',                          'people','standard','view','jobs','view',235),
  ('jobs.create',            'Jobs · create',              'Create an opening.',                                       'people','elevated','hr.manage','jobs','create',236),
  ('jobs.edit',              'Jobs · edit',                'Change an opening or a candidate record.',                 'people','elevated','hr.manage','jobs','edit',237),
  ('jobs.delete',            'Jobs · delete',              'Delete an opening.',                                       'people','elevated','hr.manage','jobs','delete',238),
  ('jobs.publish',           'Jobs · publish',             'Publish an opening internally or externally.',             'people','elevated','hr.manage','jobs','publish',239),
  -- Requests
  ('requests.view',          'Requests · view',            'See requests.',                                            'work','standard','view','requests','view',245),
  ('requests.create',        'Requests · raise',           'Raise a request.',                                         'work','standard','create','requests','create',246),
  ('requests.approve',       'Requests · approve',         'Approve a request.',                                       'work','elevated','approve','requests','approve',247),
  ('requests.reject',        'Requests · reject',          'Reject a request.',                                        'work','elevated','approve','requests','reject',248),
  -- Files
  ('files.view',             'Files · view',               'See files you are entitled to.',                           'files','standard','view','files','view',255),
  ('files.upload',           'Files · upload',             'Upload files.',                                            'files','standard','create','files','upload',256),
  ('files.download',         'Files · download',           'Download a file to a device.',                             'files','elevated','download','files','download',257),
  ('files.edit',             'Files · edit',               'Replace or rename a file.',                                'files','standard','edit','files','edit',258),
  ('files.delete',           'Files · delete',             'Delete a file.',                                           'files','elevated','delete','files','delete',259),
  ('files.share',            'Files · share',              'Share a file with colleagues.',                            'files','standard','share_internal','files','share',260),
  -- Wiki
  ('wiki.view',              'Wiki · view',                'Read the wiki.',                                           'communication','standard','view','wiki','view',265),
  ('wiki.create',            'Wiki · create',              'Write a wiki page.',                                       'communication','standard','create','wiki','create',266),
  ('wiki.edit',              'Wiki · edit',                'Edit a wiki page.',                                        'communication','standard','edit','wiki','edit',267),
  ('wiki.delete',            'Wiki · delete',              'Delete a wiki page.',                                      'communication','elevated','delete','wiki','delete',268),
  -- Announcements
  ('announcements.view',     'Announcements · view',       'Read announcements.',                                      'communication','standard','view','announcements','view',272),
  ('announcements.create',   'Announcements · draft',      'Write an announcement.',                                   'communication','elevated','broadcast_company','announcements','create',273),
  ('announcements.edit',     'Announcements · edit',       'Correct a published announcement.',                        'communication','elevated','broadcast_company','announcements','edit',274),
  ('announcements.delete',   'Announcements · delete',     'Remove an announcement.',                                  'communication','elevated','broadcast_company','announcements','delete',275),
  ('announcements.publish',  'Announcements · publish',    'Publish to the company.',                                  'communication','elevated','broadcast_company','announcements','publish',276),
  -- Goals
  ('goals.view',             'Goals · view',               'See goals.',                                               'work','standard','view','goals','view',280),
  ('goals.create',           'Goals · create',             'Create a goal.',                                           'work','standard','create','goals','create',281),
  ('goals.edit',             'Goals · edit',               'Change a goal.',                                           'work','standard','edit','goals','edit',282),
  ('goals.assign',           'Goals · assign',             'Assign a goal to someone.',                                'work','standard','assign_task','goals','assign',283),
  ('goals.delete',           'Goals · delete',             'Delete a goal.',                                           'work','elevated','delete','goals','delete',284),
  -- Academy
  ('academy.view',           'Academy · view',             'Take courses.',                                            'people','standard','view','academy','view',288),
  ('academy.manage',         'Academy · manage',           'Assign training and manage enrolments.',                   'people','elevated','hr.manage','academy','manage',289),
  ('academy.create_course',  'Academy · author',           'Create and publish courses.',                              'people','elevated','hr.manage','academy','create',290),
  -- Ideas & status
  ('ideas.view',             'Ideas · view',               'See the idea board.',                                      'communication','standard','view','ideas','view',294),
  ('ideas.create',           'Ideas · post',               'Post an idea or suggestion.',                              'communication','standard','create','ideas','create',295),
  ('ideas.manage',           'Ideas · manage',             'Triage ideas and respond to suggestions.',                 'communication','elevated','communication.manage','ideas','manage',296),
  ('status.view',            'Service status · view',      'See the service status board.',                            'work','standard','view','status','view',298),
  ('status.manage',          'Service status · manage',    'Publish service status updates.',                          'work','elevated','system.manage','status','manage',299),
  -- Reports
  ('reports.view',           'Reports · view',             'See reports and dashboards.',                              'reports','standard','view_reports','reports','view',305),
  ('reports.export',         'Reports · export',           'Export report data.',                                      'reports','high','export','reports','export',306),
  -- Administration
  ('admin.view',             'Administration · view',      'Open the company administration console.',                 'admin','elevated','system.manage','admin','view',310),
  ('admin.manage',           'Administration · manage',    'Change company administration settings.',                  'admin','high','system.manage','admin','manage',311),
  ('company_settings.view',  'Company settings · view',    'See company settings.',                                    'admin','elevated','system.manage','company_settings','view',312),
  ('company_settings.manage','Company settings · manage',  'Change company settings.',                                 'admin','high','system.manage','company_settings','manage',313),
  ('branding.view',          'Branding · view',            'See company branding.',                                    'admin','standard','system.manage','branding','view',314),
  ('branding.manage',        'Branding · manage',          'Change logo, colours and welcome message.',                'admin','elevated','system.manage','branding','manage',315),
  ('integrations.view',      'Integrations · view',        'See connected integrations.',                              'admin','elevated','integrations.manage','integrations','view',316),
  ('billing.view',           'Billing · view',             'See the company''s plan and usage.',                       'admin','elevated','system.manage','billing','view',317),
  ('billing.manage',         'Billing · manage',           'Change the company''s plan and payment details.',          'admin','high','system.manage','billing','manage',318),
  -- Security, audit and access control
  ('security.view',          'Security · view',            'See the security centre.',                                 'security','elevated','security.manage','security','view',325),
  ('audit.view',             'Audit log · view',           'Read the audit log.',                                      'security','elevated','audit.read','audit','view',326),
  ('audit.export',           'Audit log · export',         'Export audit records.',                                    'security','high','export','audit','export',327),
  ('access_control.view',    'Access control · view',      'See roles, permissions and who holds what.',               'security','elevated','security.manage','access_control','view',328),
  ('access_control.manage',  'Access control · manage',    'Change roles and permissions.',                            'security','high','security.manage','access_control','manage',329),
  -- Delegation of role administration is deliberately separate from access_control.manage (§15):
  -- a company administrator can run the company without being able to rewrite authority.
  ('roles.create',           'Roles · create',             'Create a security role.',                                  'security','high','security.manage','roles','create',330),
  ('roles.edit',             'Roles · edit',               'Change a security role''s permissions.',                   'security','high','security.manage','roles','edit',331),
  ('roles.assign',           'Roles · assign',             'Give or remove someone''s security role.',                 'security','high','security.manage','roles','assign',332),
  ('roles.delete',           'Roles · delete',             'Delete a security role.',                                  'security','high','security.manage','roles','delete',333)
on conflict (key) do nothing;

-- Dependencies: an action key is meaningless without the matching view key.
update public.permissions p
   set requires = array[p.module || '.view']
 where p.legacy_alias is not null
   and p.action <> 'view'
   and p.requires = '{}'::text[]
   and exists (select 1 from public.permissions v where v.key = p.module || '.view');

-- ------------------------------------------------------------------- resolution
/*
  `has_perm`, unchanged in structure. The only difference is that every lookup now tests the key
  *and* the broad key it refines, so the split above is invisible to existing roles.

  Precedence, highest first (as documented in CLAUDE.md):
    platform owner → active profile → platform.* never resolves in a company →
    individual DENY/ALLOW (exact key, then alias) → employment status →
    security roles → department default → level default →
    company super admin bounded by admin_ceiling → deny.
*/
create or replace function public.has_perm(p_perm text, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  p profiles%rowtype;
  o boolean;
  r boolean;
  ceiling text[];
  v_alias text;
  keys text[];
begin
  if p_user is null or p_perm is null then return false; end if;

  if is_platform_owner_user(p_user) then return true; end if;

  select * into p from profiles where id = p_user;
  if p.id is null or not p.is_active then return false; end if;

  if p_perm like 'platform.%' then return false; end if;

  select legacy_alias into v_alias from permissions where key = p_perm;
  if v_alias is null or v_alias = p_perm then
    keys := array[p_perm];
    v_alias := null;
  else
    keys := array[p_perm, v_alias];
  end if;

  -- Individual rules win, and the exact key beats the alias: an explicit deny on `people.export`
  -- must not be undone by an inherited allow on `export`.
  select allowed into o
    from permission_overrides
   where user_id = p_user and perm = p_perm and (expires_at is null or expires_at > now())
   order by allowed
   limit 1;
  if found then return o; end if;
  if v_alias is not null then
    select allowed into o
      from permission_overrides
     where user_id = p_user and perm = v_alias and (expires_at is null or expires_at > now())
     order by allowed
     limit 1;
    if found then return o; end if;
  end if;

  if p.status in ('probation','intern') and keys && array['download','share_external','export'] then return false; end if;
  if p.status in ('suspended','notice_period') and keys && array['share_external','export','delete'] then return false; end if;

  select bool_or(sr.permissions && keys) into r
    from user_roles ur join system_roles sr on sr.id = ur.system_role_id
   where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now());
  if r then return true; end if;

  if exists (select 1 from departments d where d.id = p.department_id and d.default_permissions && keys) then
    return true;
  end if;

  if exists (select 1 from role_defaults rd where rd.org_id = p.org_id and rd.level = p.role and rd.permissions && keys) then
    return true;
  end if;

  if p.role = 'super_admin' then
    ceiling := admin_ceiling(p.org_id);
    return ceiling is null or ceiling && keys;
  end if;

  return false;
end $$;
