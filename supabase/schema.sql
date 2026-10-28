-- ============================================================================
--  HESAB — Əməkhaqqı və İşçi İdarəetmə Platforması
--  Supabase (PostgreSQL) sxemi: cədvəllər, əlaqələr, məhdudiyyətlər, RLS
--  ---------------------------------------------------------------------------
--  İSTİFADƏ QAYDASI:
--    1. Supabase Dashboard → SQL Editor → New query
--    2. Bu faylın HAMISINI kopyalayın və "Run" edin.
--    3. Skript idempotentdir — təkrar işə salmaq təhlükəsizdir.
--
--  ROLLAR:
--    owner    — biznes sahibi. Yalnız öz biznesinin bütün məlumatlarını görür.
--    employee — işçi. Yalnız öz işçi kartını və öz ödəniş tarixçəsini görür.
--  ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Genişləndirmələr və sxem
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Cədvəl: profiles (istifadəçi profili — auth.users ilə 1:1)
-- ---------------------------------------------------------------------------
-- QEYD: RLS köməkçi funksiyaları (bölmə 6) cədvəllərdən SONRA yaradılır,
-- çünki PostgreSQL funksiya gövdəsini yaradılma anında yoxlayır.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Hər Supabase Auth istifadəçisi üçün profil (ad, e-poçt).';

-- ---------------------------------------------------------------------------
-- 3. Cədvəl: businesses (sahibkarın biznesi)
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  legal_name   text,
  phone        text,
  email        text,
  address      text,
  currency     text not null default 'AZN' check (length(currency) between 2 and 8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint businesses_owner_unique unique (owner_id)
);

comment on table public.businesses is 'Sahibkarın biznesi. Hər sahibkarın bir biznesi olur.';

create index if not exists businesses_owner_idx on public.businesses (owner_id);

-- ---------------------------------------------------------------------------
-- 4. Cədvəl: employees (işçilər)
-- ---------------------------------------------------------------------------
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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.employees is 'İşçi kartı. user_id dolu olduqda işçi öz kabinetinə giriş əldə edir.';

create index if not exists employees_business_idx on public.employees (business_id);
create index if not exists employees_user_idx on public.employees (user_id);
create index if not exists employees_active_idx on public.employees (business_id, is_active);

-- Eyni biznesdə eyni e-poçtla iki işçi kartı olmasın
create unique index if not exists employees_business_email_uidx
  on public.employees (business_id, lower(email))
  where email is not null and length(trim(email)) > 0;

-- Bir auth istifadəçisi yalnız bir işçi kartına bağlana bilər
create unique index if not exists employees_user_unique_idx
  on public.employees (user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Cədvəl: salary_payments (avans, maaş, mükafat, tutulma tarixçəsi)
-- ---------------------------------------------------------------------------
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

comment on table public.salary_payments is
  'Bütün pul hərəkətləri: advance=avans, salary=maaş ödənişi, bonus=mükafat, deduction=tutulma.';

create index if not exists payments_business_idx on public.salary_payments (business_id);
create index if not exists payments_employee_idx on public.salary_payments (employee_id, paid_at desc);
create index if not exists payments_created_idx on public.salary_payments (created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Trigger funksiyaları
-- ---------------------------------------------------------------------------

-- 6.1 updated_at avtomatik yenilənməsi
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

-- 6.2 Yeni auth istifadəçisi → profil yaradılması
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

-- 6.3 Ödənişin business_id-si işçinin biznesi ilə uyğunlaşdırılır
create or replace function public.sync_payment_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
begin
  select e.business_id into v_business
  from public.employees e
  where e.id = new.employee_id;

  if v_business is null then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = '23503';
  end if;

  new.business_id := v_business;
  return new;
end;
$$;

drop trigger if exists trg_payment_business on public.salary_payments;
create trigger trg_payment_business before insert or update on public.salary_payments
  for each row execute function public.sync_payment_business();

-- ---------------------------------------------------------------------------
-- 7. İşçi hesabının bağlanması (işçi qeydiyyatdan keçdikdən sonra)
-- ---------------------------------------------------------------------------
create or replace function public.claim_employee_account()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_confirmed timestamptz;
  v_employee uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select lower(coalesce(u.email, '')), u.email_confirmed_at
    into v_email, v_confirmed
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_email = '' then
    return null;
  end if;

  -- E-poçt təsdiqlənməyibsə bağlama aparılmır (təhlükəsizlik)
  if v_confirmed is null then
    return null;
  end if;

  select e.id into v_employee
  from public.employees e
  where lower(e.email) = v_email
    and e.user_id is null
  order by e.created_at asc
  limit 1;

  if v_employee is null then
    return null;
  end if;

  update public.employees
     set user_id = v_uid
   where id = v_employee;

  return v_employee;
end;
$$;

revoke all on function public.claim_employee_account() from public, anon;
grant execute on function public.claim_employee_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Hesablanmış maaş və balans görünüşü
--    security_invoker → RLS qaydaları görünüşə də tətbiq olunur
-- ---------------------------------------------------------------------------
create or replace view public.v_employee_balances
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

comment on view public.v_employee_balances is
  'İşçi üzrə hesablanmış maaş, ödənişlər və qalıq borc. RLS valideyn cədvəllərdən tətbiq olunur.';

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.businesses      enable row level security;
alter table public.employees       enable row level security;
alter table public.salary_payments enable row level security;

-- QEYD: FORCE ROW LEVEL SECURITY istifadə edilmir. Səbəb: SECURITY DEFINER
-- köməkçi funksiyalar cədvəl sahibi (postgres) kimi işləyir və RLS-i keçməlidir.
-- Normal RLS rejimində anon/authenticated rolları üçün qaydalar tam qüvvədədir.

-- ---------------------------------------------------------------------------
-- 8.1 RLS köməkçi funksiyaları (cədvəllər yaradıldıqdan SONRA)
--     Hamısı SECURITY DEFINER + sabit search_path ilə yazılıb.
-- ---------------------------------------------------------------------------

-- Cari istifadəçinin sahibi olduğu biznesin ID-si
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id from public.businesses b where b.owner_id = auth.uid() limit 1;
$$;

-- Cari istifadəçinin bağlı olduğu işçi kartının ID-si
create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id from public.employees e where e.user_id = auth.uid() limit 1;
$$;

-- Verilən biznes cari istifadəçiyə aiddirmi?
create or replace function public.owns_business(p_business_id uuid)
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

-- Verilən işçi cari istifadəçinin özünə aiddirmi?
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

-- İşçinin bağlı olduğu biznesin ID-si (yalnız ad/valyuta oxumaq üçün)
create or replace function public.current_employee_business_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.business_id from public.employees e where e.user_id = auth.uid() limit 1;
$$;

-- 9.1 profiles -------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 9.2 businesses -----------------------------------------------------------
drop policy if exists businesses_select_own on public.businesses;
create policy businesses_select_own on public.businesses
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists businesses_insert_own on public.businesses;
create policy businesses_insert_own on public.businesses
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists businesses_update_own on public.businesses;
create policy businesses_update_own on public.businesses
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists businesses_delete_own on public.businesses;
create policy businesses_delete_own on public.businesses
  for delete to authenticated
  using (owner_id = auth.uid());

-- İşçi: yalnız özünün bağlı olduğu biznesin adını/valyutasını oxuya bilər
-- (şəxsi kabinetdə biznes adı göstərilməsi üçün zəruridir)
drop policy if exists businesses_employee_read on public.businesses;
create policy businesses_employee_read on public.businesses
  for select to authenticated
  using (id = public.current_employee_business_id());

-- 9.3 employees ------------------------------------------------------------
-- Sahibkar: öz biznesinin bütün işçiləri üzərində tam hüquq
drop policy if exists employees_owner_all on public.employees;
create policy employees_owner_all on public.employees
  for all to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- İşçi: yalnız öz işçi kartını görür
drop policy if exists employees_self_select on public.employees;
create policy employees_self_select on public.employees
  for select to authenticated
  using (user_id = auth.uid());

-- 9.4 salary_payments ------------------------------------------------------
-- Sahibkar: öz biznesinin bütün ödənişləri üzərində tam hüquq
drop policy if exists payments_owner_all on public.salary_payments;
create policy payments_owner_all on public.salary_payments
  for all to authenticated
  using (public.owns_business(business_id))
  with check (
    public.owns_business(business_id)
    and exists (
      select 1 from public.employees e
      where e.id = employee_id and e.business_id = salary_payments.business_id
    )
  );

-- İşçi: yalnız öz ödəniş tarixçəsini görür (yazmaq hüququ yoxdur)
drop policy if exists payments_self_select on public.salary_payments;
create policy payments_self_select on public.salary_payments
  for select to authenticated
  using (public.is_self_employee(employee_id));

-- ---------------------------------------------------------------------------
-- 10. Hüquqlar (grants)
-- ---------------------------------------------------------------------------
revoke all on table public.profiles        from anon;
revoke all on table public.businesses      from anon;
revoke all on table public.employees       from anon;
revoke all on table public.salary_payments from anon;

grant select, insert, update         on table public.profiles        to authenticated;
grant select, insert, update, delete on table public.businesses      to authenticated;
grant select, insert, update, delete on table public.employees       to authenticated;
grant select, insert, update, delete on table public.salary_payments to authenticated;

-- Görünüşə yalnız oxuma hüququ (RLS security_invoker ilə işləyir)
revoke all on table public.v_employee_balances from anon;
grant select on table public.v_employee_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Yoxlama sorğuları (istəyə bağlı — nəticələri görmək üçün)
-- ---------------------------------------------------------------------------
-- select * from pg_policies where schemaname = 'public' order by tablename, policyname;
-- select table_name, column_name, data_type from information_schema.columns
--   where table_schema = 'public' order by table_name, ordinal_position;

-- ============================================================================
--  SXEM HAZIR
--  Növbəti addım: Supabase → Authentication → Providers → Email aktiv olsun.
--  Tövsiyə: "Confirm email" aktiv saxlanılsın (işçi hesablarının
--  e-poçt sahibinə bağlanması bu təsdiqə əsaslanır).
-- ============================================================================
