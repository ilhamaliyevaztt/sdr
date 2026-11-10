-- ============================================================================
--  RahatHesab — GİRİŞ / QEYDİYYAT DÜZƏLİŞİ  (fix_auth.sql)
--  ---------------------------------------------------------------------------
--  BU FAYL NƏ EDİR?
--    1. Hər istifadəçi üçün profilin MÜTLƏQ yaradılmasını təmin edir
--       (ensure_my_profile) — trigger işləməsə belə qeydiyyat pozulmur.
--    2. İşçi kodunu yeniləyən təhlükəsiz RPC (regenerate_employee_code) —
--       kod toqquşması (23505) artıq mümkün deyil, avtomatik təkrar cəhd edir.
--    3. claim_employee_by_code funksiyasını daha aydın xəta kodları ilə
--       yenidən yaradır və icazələri düzgün verir.
--    4. Sxemin REAL vəziyyətini yoxlayan diaqnostika funksiyası
--       (rh_diagnostics) — hansı cədvəl/funksiya/icazə çatışmır, dərhal görünür.
--    5. Bütün cədvəllərdə RLS + GRANT-ları yenidən tətbiq edir (idempotent).
--
--  NECƏ İŞƏ SALINIR?
--    Supabase Dashboard → SQL Editor → New query → bu faylın HAMISINI
--    kopyalayın → Run.  Təkrar işə salmaq TƏHLÜKƏSİZDİR (idempotent).
--
--  ⚠️ VACİB: Bu fayl YALNIZ bazanı düzəldir.
--     "Çox sayda cəhd" xətasının kök səbəbi Auth ayarıdır:
--     Authentication → Sign In / Providers → Email → "Confirm email" SÖNDÜRÜLMƏLİDİR.
--     Əks halda hər qeydiyyat e-poçt göndərməyə çalışır və Supabase-in pulsuz
--     daxili SMTP-si saatda bir neçə məktubdan sonra 429 qaytarır.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
--  1. KÖMƏKÇİ: KOD GENERATORU (təkrar təyin — təhlükəsizdir)
-- ============================================================================
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

-- ============================================================================
--  2. PROFİLİN MÜTLƏQ YARADILMASI  ★ GİRİŞİN ƏSASI ★
--  ---------------------------------------------------------------------------
--  Əvvəl profil yalnız auth.users trigger-i ilə yaradılırdı. Trigger silinmiş,
--  söndürülmüş və ya xəta verdisə — istifadəçi daxil olur, amma profil yoxdur və
--  tətbiq "sınıq" vəziyyətə düşür.
--  Bu funksiya hər girişdən sonra çağırılır və profili zəmanətlə yaradır.
-- ============================================================================
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

  select lower(coalesce(u.email, '')) into v_email
  from auth.users u
  where u.id = v_uid;

  select coalesce(
           nullif(trim(coalesce(p_full_name, '')), ''),
           nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
           nullif(trim(coalesce(u.raw_user_meta_data ->> 'name', '')), ''),
           ''
         )
    into v_name
  from auth.users u
  where u.id = v_uid;

  insert into public.profiles (id, email, full_name)
  values (v_uid, nullif(v_email, ''), coalesce(v_name, ''))
  on conflict (id) do update
    set email     = coalesce(excluded.email, public.profiles.email),
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

comment on function public.ensure_my_profile(text) is
  'Cari istifadəçi üçün profili zəmanətlə yaradır/qaytarır. Girişdən sonra çağırılır.';

-- ============================================================================
--  3. İŞÇİ KODU İLƏ QOŞULMA (yenidən, aydın xəta kodları ilə)
-- ============================================================================
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

  select * into v_emp
  from public.employees e
  where upper(coalesce(e.access_code, '')) = v_code
  limit 1;

  if v_emp.id is null then
    raise exception 'INVALID_CODE' using errcode = '22023';
  end if;

  -- Kod artıq başqa hesaba bağlanıbsa — yalnız o halda xəta
  if v_emp.user_id is not null and v_emp.user_id <> v_uid then
    raise exception 'CODE_ALREADY_USED' using errcode = '23505';
  end if;

  -- İşçi kartını bu istifadəçiyə bağla
  update public.employees
     set user_id = v_uid
   where id = v_emp.id;

  -- Üzvlük qeydi (təkrar qoşulmada yenilənir)
  insert into public.business_members (business_id, user_id, role, status)
  values (v_emp.business_id, v_uid, 'employee', 'active')
  on conflict (business_id, user_id) do update
    set status = 'active';

  select * into v_biz from public.businesses b where b.id = v_emp.business_id;

  return json_build_object(
    'employee_id',   v_emp.id,
    'business_id',   v_emp.business_id,
    'business_name', v_biz.name,
    'full_name',     v_emp.full_name
  );
end;
$$;

revoke all on function public.claim_employee_by_code(text) from public, anon;
grant execute on function public.claim_employee_by_code(text) to authenticated;

-- ============================================================================
--  4. İŞÇİ GİRİŞ KODUNU YENİLƏ  ★ TOQQUŞMA RİSKİ SIFIR ★
--  ---------------------------------------------------------------------------
--  Əvvəl JS-də kod yaradılıb birbaşa UPDATE edilirdi → unikal indeksə düşəndə
--  "23505 duplicate key" xətası verə bilərdi. İndi funksiya 20 dəfə cəhd edir.
-- ============================================================================
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
  select e.business_id into v_biz
  from public.employees e
  where e.id = p_employee_id;

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
      update public.employees
         set access_code = v_code
       where id = p_employee_id;
      return v_code;
    exception
      when unique_violation then
        if i >= 20 then
          raise exception 'CODE_GENERATION_FAILED' using errcode = '23505';
        end if;
      -- cəhd davam edir
    end;
  end loop;
end;
$$;

revoke all on function public.regenerate_employee_code(uuid) from public, anon;
grant execute on function public.regenerate_employee_code(uuid) to authenticated;

-- ============================================================================
--  5. BİZNES KODUNU YENİLƏ (təkrar təyin, təhlükəsiz)
-- ============================================================================
create or replace function public.rotate_join_code(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  i      int := 0;
begin
  if not public.can_manage_business(p_business_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  loop
    i := i + 1;
    v_code := public.gen_code(8);
    begin
      update public.businesses set join_code = v_code where id = p_business_id;
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

revoke all on function public.rotate_join_code(uuid) from public, anon;
grant execute on function public.rotate_join_code(uuid) to authenticated;

-- ============================================================================
--  6. DİAQNOSTİKA  ★ PROBLEMİ DƏRHAL GÖSTƏR ★
--  ---------------------------------------------------------------------------
--  Supabase SQL Editor-də:  select public.rh_diagnostics();
--  Çatışmayan hər şey siyahı şəklində qayıdır.
-- ============================================================================
create or replace function public.rh_diagnostics()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tables   text[] := array['profiles','businesses','business_members','employees',
                             'salary_payments','work_logs','leave_requests','notes','activity_log'];
  v_funcs    text[] := array['ensure_my_profile','claim_employee_by_code',
                             'claim_employee_account','update_my_contact',
                             'rotate_join_code','regenerate_employee_code',
                             'can_manage_business','can_read_business','gen_code'];
  v_missing_t text[] := '{}';
  v_missing_f text[] := '{}';
  v_no_rls    text[] := '{}';
  v_no_grant  text[] := '{}';
  t text;
  f text;
begin
  foreach t in array v_tables loop
    if to_regclass('public.' || t) is null then
      v_missing_t := array_append(v_missing_t, t);
    else
      if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
        v_no_rls := array_append(v_no_rls, t);
      end if;
      if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
        v_no_grant := array_append(v_no_grant, t);
      end if;
    end if;
  end loop;

  foreach f in array v_funcs loop
    if to_regprocedure(
         case f
           when 'ensure_my_profile'       then 'public.ensure_my_profile(text)'
           when 'claim_employee_by_code'  then 'public.claim_employee_by_code(text)'
           when 'claim_employee_account'  then 'public.claim_employee_account()'
           when 'update_my_contact'       then 'public.update_my_contact(text)'
           when 'rotate_join_code'        then 'public.rotate_join_code(uuid)'
           when 'regenerate_employee_code' then 'public.regenerate_employee_code(uuid)'
           when 'can_manage_business'     then 'public.can_manage_business(uuid)'
           when 'can_read_business'       then 'public.can_read_business(uuid)'
           when 'gen_code'                then 'public.gen_code(integer)'
         end
       ) is null then
      v_missing_f := array_append(v_missing_f, f);
    end if;
  end loop;

  return json_build_object(
    'ok', (coalesce(array_length(v_missing_t, 1), 0) = 0
           and coalesce(array_length(v_missing_f, 1), 0) = 0
           and coalesce(array_length(v_no_rls, 1), 0) = 0
           and coalesce(array_length(v_no_grant, 1), 0) = 0),
    'missing_tables',  to_json(v_missing_t),
    'missing_functions', to_json(v_missing_f),
    'rls_disabled',    to_json(v_no_rls),
    'missing_grants',  to_json(v_no_grant),
    'hint', 'Boş massivlər = həmin bölmə qaydasındadır.'
  );
end;
$$;

revoke all on function public.rh_diagnostics() from public, anon;
grant execute on function public.rh_diagnostics() to authenticated;

-- ============================================================================
--  7. İCAZƏLƏRİN YENİDƏN TƏTBİQİ (idempotent)
--  ---------------------------------------------------------------------------
--  Cədvəllər RLS ilə qorunur; "anon" heç bir cədvəli oxuya bilməz.
--  "authenticated" yalnız RLS-dən keçən sətirləri görür.
-- ============================================================================
alter table public.profiles         enable row level security;
alter table public.businesses       enable row level security;
alter table public.business_members enable row level security;
alter table public.employees        enable row level security;
alter table public.salary_payments  enable row level security;
alter table public.work_logs        enable row level security;
alter table public.leave_requests   enable row level security;
alter table public.notes            enable row level security;
alter table public.activity_log     enable row level security;

revoke all on table public.profiles         from anon;
revoke all on table public.businesses       from anon;
revoke all on table public.business_members from anon;
revoke all on table public.employees        from anon;
revoke all on table public.salary_payments  from anon;
revoke all on table public.work_logs        from anon;
revoke all on table public.leave_requests   from anon;
revoke all on table public.notes            from anon;
revoke all on table public.activity_log     from anon;

grant select, insert, update, delete on table public.profiles         to authenticated;
grant select, insert, update, delete on table public.businesses       to authenticated;
grant select, insert, update, delete on table public.business_members to authenticated;
grant select, insert, update, delete on table public.employees        to authenticated;
grant select, insert, update, delete on table public.salary_payments  to authenticated;
grant select, insert, update, delete on table public.work_logs        to authenticated;
grant select, insert, update, delete on table public.leave_requests   to authenticated;
grant select, insert, update, delete on table public.notes            to authenticated;
grant select, insert, update, delete on table public.activity_log     to authenticated;

do $$
begin
  if to_regclass('public.v_employee_balances') is not null then
    execute 'revoke all on table public.v_employee_balances from anon';
    execute 'grant select on table public.v_employee_balances to authenticated';
  end if;
end $$;

-- ============================================================================
--  8. YOXLAMA
-- ============================================================================
-- select public.rh_diagnostics();
--
--  Gözlənilən nəticə:
--    {"ok": true, "missing_tables": [], "missing_functions": [],
--     "rls_disabled": [], "missing_grants": [], ...}
--
--  SXEM HAZIR ✔
--  Növbəti (MÜTLƏQ) addım — Auth ayarı:
--    Authentication → Sign In / Providers → Email → "Confirm email" SÖNDÜR.
--    Bu, "Çox sayda cəhd. Bir az sonra yenidən yoxlayın." xətasını tamamilə
--    aradan qaldırır və yüzlərlə istifadəçinin qeydiyyatına imkan verir.
-- ============================================================================
