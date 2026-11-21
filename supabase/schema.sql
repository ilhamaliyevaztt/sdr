-- ---------------------------------------------------------------------------
--  1. Köməkçi: giriş kodu generatoru
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
--  1. Köməkçi: giriş kodu generatoru
-- ---------------------------------------------------------------------------
create or replace function public.gen_code(p_len integer default 8)
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select string_agg(
           substr(c.chars, 1 + floor(random() * length(c.chars))::int, 1),
           ''
         )
  from generate_series(1, greatest(4, coalesce(p_len, 8))) g
  cross join (select 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'::text as chars) c;
$$;

grant execute on function public.gen_code(integer) to authenticated;

-- ---------------------------------------------------------------------------
--  2. Cədvəllər
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists phone text;

create table if not exists public.businesses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  legal_name   text,
  phone        text,
  email        text,
  address      text,
  currency     text not null default 'AZN' check (length(currency) between 2 and 8),
  join_code    text default public.gen_code(8),
  pay_day      integer not null default 5 check (pay_day between 1 and 28),
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.businesses add column if not exists join_code text;
alter table public.businesses add column if not exists pay_day integer not null default 5;
alter table public.businesses add column if not exists is_archived boolean not null default false;
update public.businesses set join_code = public.gen_code(8) where join_code is null;

alter table public.businesses drop constraint if exists businesses_owner_unique;

create index if not exists businesses_owner_idx on public.businesses (owner_id);
create unique index if not exists businesses_join_code_uidx on public.businesses (upper(join_code));

create table if not exists public.business_members (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'employee' check (role in ('owner', 'employee')),
  status        text not null default 'active' check (status in ('active', 'blocked')),
  created_at    timestamptz not null default now()
);

create unique index if not exists business_members_unique_idx on public.business_members (business_id, user_id);
create index if not exists business_members_user_idx on public.business_members (user_id);

create table if not exists public.employees (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  full_name       text not null check (length(trim(full_name)) between 2 and 120),
  position        text,
  monthly_salary  numeric(12, 2) not null default 0 check (monthly_salary >= 0),
  email           text,
  phone           text,
  hire_date       date not null default current_date,
  is_active       boolean not null default true,
  notes           text,
  user_id         uuid references auth.users(id) on delete set null,
  access_code     text default public.gen_code(8),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.employees add column if not exists access_code text;
update public.employees set access_code = public.gen_code(8) where access_code is null;

create index if not exists employees_business_idx on public.employees (business_id);
create index if not exists employees_user_idx on public.employees (user_id);
create index if not exists employees_active_idx on public.employees (business_id, is_active);

drop index if exists public.employees_user_unique_idx;

create unique index if not exists employees_business_email_uidx
  on public.employees (business_id, lower(email))
  where email is not null and length(trim(email)) > 0;

create unique index if not exists employees_access_code_uidx
  on public.employees (upper(access_code))
  where access_code is not null;

create table if not exists public.salary_payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  kind         text not null check (kind in ('advance', 'salary', 'bonus', 'deduction')),
  amount       numeric(12, 2) not null check (amount > 0),
  paid_at      date not null default current_date,
  period       text check (period is null or period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  method       text check (method is null or method in ('cash', 'card', 'bank', 'other')),
  note         text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists payments_business_idx on public.salary_payments (business_id);
create index if not exists payments_employee_idx on public.salary_payments (employee_id, paid_at desc);
create index if not exists payments_created_idx on public.salary_payments (created_at desc);

create table if not exists public.work_logs (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  work_date    date not null default current_date,
  hours        numeric(5, 2) not null default 8 check (hours >= 0 and hours <= 24),
  overtime     numeric(5, 2) not null default 0 check (overtime >= 0 and overtime <= 24),
  note         text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists work_logs_business_idx on public.work_logs (business_id, work_date desc);

create table if not exists public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  kind         text not null default 'vacation' check (kind in ('vacation', 'sick', 'unpaid', 'other')),
  start_date   date not null default current_date,
  end_date     date not null default current_date,
  reason       text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists leave_requests_business_idx on public.leave_requests (business_id, created_at desc);
create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id, created_at desc);

create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 160),
  body         text,
  is_done      boolean not null default false,
  due_date     date,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notes_business_idx on public.notes (business_id, is_done, created_at desc);

create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  actor_id     uuid default auth.uid() references auth.users(id) on delete set null,
  actor_name   text,
  action       text not null,
  detail       text,
  created_at   timestamptz not null default now()
);

create index if not exists activity_log_business_idx on public.activity_log (business_id, created_at desc);

-- ---------------------------------------------------------------------------
--  3. Triggerlər
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_businesses_updated on public.businesses;
create trigger trg_businesses_updated before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists trg_employees_updated on public.employees;
create trigger trg_employees_updated before update on public.employees
  for each row execute function public.set_updated_at();

drop trigger if exists trg_notes_updated on public.notes;
create trigger trg_notes_updated before update on public.notes
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_child_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
begin
  select e.business_id into v_business from public.employees e where e.id = new.employee_id;
  if v_business is null then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = '23503';
  end if;
  new.business_id := v_business;
  return new;
end;
$$;

drop trigger if exists trg_payment_business on public.salary_payments;
create trigger trg_payment_business before insert or update on public.salary_payments
  for each row execute function public.sync_child_business();

drop trigger if exists trg_worklog_business on public.work_logs;
create trigger trg_worklog_business before insert or update on public.work_logs
  for each row execute function public.sync_child_business();

drop trigger if exists trg_leave_business on public.leave_requests;
create trigger trg_leave_business before insert or update on public.leave_requests
  for each row execute function public.sync_child_business();

create or replace function public.handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.business_members (business_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict (business_id, user_id) do update set role = 'owner', status = 'active';
  return new;
end;
$$;

drop trigger if exists trg_business_owner_member on public.businesses;
create trigger trg_business_owner_member after insert on public.businesses
  for each row execute function public.handle_new_business();

-- ---------------------------------------------------------------------------
--  4. RLS köməkçi funksiyaları
-- ---------------------------------------------------------------------------
create or replace function public.current_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id from public.businesses b where b.owner_id = auth.uid()
  union
  select m.business_id from public.business_members m
    where m.user_id = auth.uid() and m.status = 'active'
  union
  select e.business_id from public.employees e where e.user_id = auth.uid();
$$;

create or replace function public.can_manage_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid()
  );
$$;

create or replace function public.can_read_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_business_id in (select public.current_business_ids());
$$;

create or replace function public.is_self_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.user_id = auth.uid()
  );
$$;

grant execute on function public.current_business_ids() to authenticated;
grant execute on function public.can_manage_business(uuid) to authenticated;
grant execute on function public.can_read_business(uuid) to authenticated;
grant execute on function public.is_self_employee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
--  5. Profil zəmanəti
-- ---------------------------------------------------------------------------
create or replace function public.ensure_my_profile(p_full_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
  v_row   public.profiles;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select lower(coalesce(u.email, '')),
         coalesce(
           nullif(trim(coalesce(p_full_name, '')), ''),
           nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
           nullif(trim(coalesce(u.raw_user_meta_data ->> 'name', '')), ''),
           ''
         )
    into v_email, v_name
  from auth.users u
  where u.id = v_uid;

  insert into public.profiles (id, email, full_name)
  values (v_uid, nullif(v_email, ''), coalesce(v_name, ''))
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        full_name = case
                      when coalesce(trim(public.profiles.full_name), '') = ''
                        then coalesce(excluded.full_name, '')
                      else public.profiles.full_name
                    end,
        updated_at = now();

  select * into v_row from public.profiles where id = v_uid;
  return v_row;
end;
$$;

revoke all on function public.ensure_my_profile(text) from public, anon;
grant execute on function public.ensure_my_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
--  6. İşçi qoşulması
-- ---------------------------------------------------------------------------
create or replace function public.claim_employee_by_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_emp  public.employees%rowtype;
  v_biz  public.businesses%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if v_code = '' or length(v_code) < 4 then
    raise exception 'INVALID_CODE' using errcode = '22023';
  end if;

  select * into v_emp from public.employees e where upper(e.access_code) = v_code limit 1;

  if v_emp.id is null then
    raise exception 'INVALID_CODE' using errcode = '22023';
  end if;

  if v_emp.user_id is not null and v_emp.user_id <> v_uid then
    raise exception 'CODE_ALREADY_USED' using errcode = '23505';
  end if;

  update public.employees set user_id = v_uid where id = v_emp.id;

  insert into public.business_members (business_id, user_id, role, status)
  values (v_emp.business_id, v_uid, 'employee', 'active')
  on conflict (business_id, user_id) do update set status = 'active';

  select * into v_biz from public.businesses b where b.id = v_emp.business_id;

  return json_build_object(
    'employee_id', v_emp.id,
    'business_id', v_emp.business_id,
    'business_name', v_biz.name,
    'full_name', v_emp.full_name
  );
end;
$$;

revoke all on function public.claim_employee_by_code(text) from public, anon;
grant execute on function public.claim_employee_by_code(text) to authenticated;

create or replace function public.claim_employee_account()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_employee uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select lower(coalesce(u.email, '')) into v_email from auth.users u where u.id = v_uid;
  if v_email is null or v_email = '' then
    return null;
  end if;

  select e.id into v_employee
  from public.employees e
  where lower(e.email) = v_email and e.user_id is null
  order by e.created_at asc
  limit 1;

  if v_employee is null then
    return null;
  end if;

  update public.employees set user_id = v_uid where id = v_employee;

  insert into public.business_members (business_id, user_id, role, status)
  select e.business_id, v_uid, 'employee', 'active'
  from public.employees e where e.id = v_employee
  on conflict (business_id, user_id) do update set status = 'active';

  return v_employee;
end;
$$;

revoke all on function public.claim_employee_account() from public, anon;
grant execute on function public.claim_employee_account() to authenticated;

create or replace function public.update_my_contact(p_phone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.employees
     set phone = nullif(trim(coalesce(p_phone, '')), '')
   where user_id = auth.uid();
end;
$$;

grant execute on function public.update_my_contact(text) to authenticated;

create or replace function public.rotate_join_code(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if not public.can_manage_business(p_business_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_code := public.gen_code(8);
  update public.businesses set join_code = v_code where id = p_business_id;
  return v_code;
end;
$$;

revoke all on function public.rotate_join_code(uuid) from public, anon;
grant execute on function public.rotate_join_code(uuid) to authenticated;

create or replace function public.regenerate_employee_code(p_employee_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_biz  uuid;
  i      int := 0;
begin
  select e.business_id into v_biz from public.employees e where e.id = p_employee_id;

  if v_biz is null then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = '23503';
  end if;

  if not public.can_manage_business(v_biz) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  loop
    i := i + 1;
    v_code := public.gen_code(8);
    begin
      update public.employees set access_code = v_code where id = p_employee_id;
      return v_code;
    exception
      when unique_violation then
        if i >= 20 then
          raise exception 'CODE_GENERATION_FAILED' using errcode = '23505';
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.regenerate_employee_code(uuid) from public, anon;
grant execute on function public.regenerate_employee_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
--  7. Görünüş: işçi üzrə hesablaşma
-- ---------------------------------------------------------------------------
drop view if exists public.v_employee_balances;

create view public.v_employee_balances
with (security_invoker = on) as
with months as (
  select
    e.id,
    greatest(
      1,
      (extract(year from current_date) - extract(year from coalesce(e.hire_date, current_date))) * 12
      + (extract(month from current_date) - extract(month from coalesce(e.hire_date, current_date)))
      + 1
    )::int as months_count
  from public.employees e
),
agg as (
  select
    p.employee_id,
    coalesce(sum(p.amount) filter (where p.kind = 'advance'), 0)   as total_advance,
    coalesce(sum(p.amount) filter (where p.kind = 'salary'), 0)    as total_salary_paid,
    coalesce(sum(p.amount) filter (where p.kind = 'bonus'), 0)     as total_bonus,
    coalesce(sum(p.amount) filter (where p.kind = 'deduction'), 0) as total_deduction,
    coalesce(sum(p.amount) filter (where p.kind in ('advance', 'salary', 'bonus')), 0) as total_paid,
    coalesce(sum(p.amount) filter (where p.kind in ('advance', 'salary', 'bonus')
                                   and date_trunc('month', p.paid_at) = date_trunc('month', current_date)), 0)
      as paid_this_month,
    max(p.paid_at) as last_paid_at
  from public.salary_payments p
  group by p.employee_id
)
select
  e.id,
  e.business_id,
  e.full_name,
  e.position,
  e.email,
  e.phone,
  e.hire_date,
  e.is_active,
  e.user_id,
  e.access_code,
  e.monthly_salary,
  m.months_count,
  round(e.monthly_salary * m.months_count, 2) as accrued_total,
  coalesce(a.total_advance, 0)                 as total_advance,
  coalesce(a.total_salary_paid, 0)             as total_salary_paid,
  coalesce(a.total_bonus, 0)                   as total_bonus,
  coalesce(a.total_deduction, 0)               as total_deduction,
  coalesce(a.total_paid, 0)                    as total_paid,
  coalesce(a.paid_this_month, 0)               as paid_this_month,
  a.last_paid_at,
  round(
    e.monthly_salary * m.months_count
    - coalesce(a.total_paid, 0)
    - coalesce(a.total_deduction, 0),
    2
  ) as balance
from public.employees e
join months m on m.id = e.id
left join agg a on a.employee_id = e.id;

-- ---------------------------------------------------------------------------
--  8. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.businesses       enable row level security;
alter table public.business_members enable row level security;
alter table public.employees        enable row level security;
alter table public.salary_payments  enable row level security;
alter table public.work_logs        enable row level security;
alter table public.leave_requests   enable row level security;
alter table public.notes            enable row level security;
alter table public.activity_log     enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists businesses_select_own on public.businesses;
drop policy if exists businesses_insert_own on public.businesses;
drop policy if exists businesses_update_own on public.businesses;
drop policy if exists businesses_delete_own on public.businesses;
drop policy if exists businesses_employee_read on public.businesses;

create policy businesses_select_own on public.businesses
  for select to authenticated
  using (owner_id = auth.uid() or public.can_read_business(id));

create policy businesses_insert_own on public.businesses
  for insert to authenticated with check (owner_id = auth.uid());

create policy businesses_update_own on public.businesses
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy businesses_delete_own on public.businesses
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists members_select_own on public.business_members;
drop policy if exists members_owner_all on public.business_members;

create policy members_select_own on public.business_members
  for select to authenticated
  using (user_id = auth.uid() or public.can_manage_business(business_id));

create policy members_owner_all on public.business_members
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

drop policy if exists employees_owner_all on public.employees;
drop policy if exists employees_self_select on public.employees;

create policy employees_owner_all on public.employees
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

create policy employees_self_select on public.employees
  for select to authenticated using (user_id = auth.uid());

drop policy if exists payments_owner_all on public.salary_payments;
drop policy if exists payments_self_select on public.salary_payments;

create policy payments_owner_all on public.salary_payments
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

create policy payments_self_select on public.salary_payments
  for select to authenticated using (public.is_self_employee(employee_id));

drop policy if exists worklogs_owner_all on public.work_logs;
drop policy if exists worklogs_self_select on public.work_logs;
drop policy if exists worklogs_self_insert on public.work_logs;
drop policy if exists worklogs_self_update on public.work_logs;
drop policy if exists worklogs_self_delete on public.work_logs;

create policy worklogs_owner_all on public.work_logs
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

create policy worklogs_self_select on public.work_logs
  for select to authenticated using (public.is_self_employee(employee_id));

create policy worklogs_self_insert on public.work_logs
  for insert to authenticated with check (public.is_self_employee(employee_id));

create policy worklogs_self_update on public.work_logs
  for update to authenticated
  using (public.is_self_employee(employee_id))
  with check (public.is_self_employee(employee_id));

create policy worklogs_self_delete on public.work_logs
  for delete to authenticated using (public.is_self_employee(employee_id));

drop policy if exists leaves_owner_all on public.leave_requests;
drop policy if exists leaves_self_select on public.leave_requests;
drop policy if exists leaves_self_insert on public.leave_requests;
drop policy if exists leaves_self_update on public.leave_requests;
drop policy if exists leaves_self_delete on public.leave_requests;

create policy leaves_owner_all on public.leave_requests
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

create policy leaves_self_select on public.leave_requests
  for select to authenticated using (public.is_self_employee(employee_id));

create policy leaves_self_insert on public.leave_requests
  for insert to authenticated
  with check (public.is_self_employee(employee_id) and status = 'pending');

create policy leaves_self_update on public.leave_requests
  for update to authenticated
  using (public.is_self_employee(employee_id) and status = 'pending')
  with check (public.is_self_employee(employee_id) and status in ('pending', 'rejected'));

create policy leaves_self_delete on public.leave_requests
  for delete to authenticated
  using (public.is_self_employee(employee_id) and status = 'pending');

drop policy if exists notes_owner_all on public.notes;
create policy notes_owner_all on public.notes
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

drop policy if exists activity_owner_all on public.activity_log;
create policy activity_owner_all on public.activity_log
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

-- ---------------------------------------------------------------------------
--  9. Hüquqlar
-- ---------------------------------------------------------------------------
revoke all on table public.profiles         from anon;
revoke all on table public.businesses       from anon;
revoke all on table public.business_members from anon;
revoke all on table public.employees        from anon;
revoke all on table public.salary_payments  from anon;
revoke all on table public.work_logs        from anon;
revoke all on table public.leave_requests   from anon;
revoke all on table public.notes            from anon;
revoke all on table public.activity_log     from anon;

grant select, insert, update         on table public.profiles         to authenticated;
grant select, insert, update, delete on table public.businesses       to authenticated;
grant select, insert, update, delete on table public.business_members to authenticated;
grant select, insert, update, delete on table public.employees        to authenticated;
grant select, insert, update, delete on table public.salary_payments  to authenticated;
grant select, insert, update, delete on table public.work_logs        to authenticated;
grant select, insert, update, delete on table public.leave_requests   to authenticated;
grant select, insert, update, delete on table public.notes            to authenticated;
grant select, insert, update, delete on table public.activity_log     to authenticated;

revoke all on table public.v_employee_balances from anon;
grant select on table public.v_employee_balances to authenticated;
