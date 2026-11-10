-- ============================================================================
--  RahatHesab — BİZNES YARATMA + İŞÇİ ÖZÜNÜN QEYDLƏRİ  (fix_business.sql)
--  ---------------------------------------------------------------------------
--  HƏLL ETDİYİ XƏTALAR
--
--  1) «Bu əməliyyat üçün icazəniz yoxdur.» — biznes yaratmaq mümkün olmur.
--
--     SƏBƏB (dəqiq):
--       Tətbiq `.insert({...}).select().single()` işlədirdi. Bu halda PostgREST
--       `Prefer: return=representation` göndərir və PostgreSQL
--       `INSERT ... RETURNING` üçün cədvəlin SELECT siyasətini DƏ yoxlayır.
--
--       `businesses_select_own` siyasəti belə idi:
--           using (public.can_read_business(id))
--       və `can_read_business` → `current_business_ids()` funksiyasına gedir.
--       O funksiya **STABLE**-dır: sorğunun ƏVVƏLİNDƏKİ snapshot-u görür.
--       Yeni yaradılan biznes sətri həmin snapshot-da YOXDUR → şərt FALSE →
--       INSERT-in özü uğurlu olsa da RETURNING mərhələsi RLS-ə düşür və
--       istifadəçi 42501 «icazəniz yoxdur» alır.
--
--       Qeyd: uşaq cədvəllərində (employees, salary_payments, ...) bu xəta
--       baş vermir, çünki orada `can_manage_business(business_id)` yoxlanılır və
--       `business_id` artıq COMMIT olunmuş biznesdir — snapshot-da var.
--       Problem YALNIZ `businesses` cədvəlinin özünə yazanda yaranır.
--
--     HƏLL:
--       SELECT siyasətinə `owner_id = auth.uid()` şərti əlavə olunur.
--       Bu şərt sətrin ÖZ sütununa baxır — snapshot-a ehtiyac yoxdur.
--       Təhlükəsizlik zəifləmir: sahibkar onsuz da öz biznesini görür.
--
--  2) İşçi öz davamiyyət qeydini REDAKTƏ edə bilmirdi (42501).
--     `.upsert()` mövcud sətri UPDATE edir, `work_logs`-da işçi üçün UPDATE
--     siyasəti yox idi (yalnız SELECT + INSERT).
--
--  3) İşçi öz məzuniyyət istəyini silə / ləğv edə bilmirdi.
--     `leave_requests`-də işçi üçün DELETE/UPDATE siyasəti yox idi.
--     (Nəticə daha pisdir: silmə «uğurlu» görünür, amma 0 sətir silinir.)
--
--  NECƏ İŞƏ SALINIR?
--    Supabase Dashboard → SQL Editor → New query → bu faylın HAMISINI
--    kopyalayın → Run.  Təkrar işə salmaq TƏHLÜKƏSİZDİR (idempotent).
-- ============================================================================

-- ============================================================================
--  1. KÖMƏKÇİ FUNKSİYALAR (mövcud deyilsə yaradılır)
-- ============================================================================

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

revoke all on function public.current_business_ids() from public, anon;
revoke all on function public.can_manage_business(uuid) from public, anon;
revoke all on function public.can_read_business(uuid) from public, anon;
revoke all on function public.is_self_employee(uuid) from public, anon;

grant execute on function public.current_business_ids() to authenticated;
grant execute on function public.can_manage_business(uuid) to authenticated;
grant execute on function public.can_read_business(uuid) to authenticated;
grant execute on function public.is_self_employee(uuid) to authenticated;

-- ============================================================================
--  2. ★ ƏSAS DÜZƏLİŞ ★  `businesses` SELECT siyasəti
--  ---------------------------------------------------------------------------
--  `or owner_id = auth.uid()` əlavə edilir.
--  Nəticə: INSERT ... RETURNING (yəni `.insert().select()`) işləyir.
-- ============================================================================

alter table public.businesses enable row level security;

drop policy if exists businesses_select_own  on public.businesses;
drop policy if exists businesses_insert_own  on public.businesses;
drop policy if exists businesses_update_own  on public.businesses;
drop policy if exists businesses_delete_own  on public.businesses;
drop policy if exists businesses_employee_read on public.businesses;

-- OXU: öz biznesi (sətrin öz sütunu — snapshot problemi yoxdur)
--      və ya üzvü/işçisi olduğu biznes
create policy businesses_select_own on public.businesses
  for select to authenticated
  using (owner_id = auth.uid() or public.can_read_business(id));

-- YARAT: yalnız öz adına
create policy businesses_insert_own on public.businesses
  for insert to authenticated
  with check (owner_id = auth.uid());

-- REDAKTƏ: yalnız öz biznesi
create policy businesses_update_own on public.businesses
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- SİL: yalnız öz biznesi
create policy businesses_delete_own on public.businesses
  for delete to authenticated
  using (owner_id = auth.uid());

-- ============================================================================
--  3. İŞÇİ ÖZ DAVAMİYYƏT QEYDİNİ redaktə / silə bilsin
-- ============================================================================

alter table public.work_logs enable row level security;

drop policy if exists worklogs_owner_all    on public.work_logs;
drop policy if exists worklogs_self_select  on public.work_logs;
drop policy if exists worklogs_self_insert  on public.work_logs;
drop policy if exists worklogs_self_update  on public.work_logs;
drop policy if exists worklogs_self_delete  on public.work_logs;

create policy worklogs_owner_all on public.work_logs
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

create policy worklogs_self_select on public.work_logs
  for select to authenticated
  using (public.is_self_employee(employee_id));

create policy worklogs_self_insert on public.work_logs
  for insert to authenticated
  with check (public.is_self_employee(employee_id));

create policy worklogs_self_update on public.work_logs
  for update to authenticated
  using (public.is_self_employee(employee_id))
  with check (public.is_self_employee(employee_id));

create policy worklogs_self_delete on public.work_logs
  for delete to authenticated
  using (public.is_self_employee(employee_id));

-- ============================================================================
--  4. İŞÇİ ÖZ MƏZUNİYYƏT İSTƏYİNİ silə / ləğv edə bilsin
--     (yalnız «pending» halda — qərar verilmiş istəyə toxuna bilməz)
-- ============================================================================

alter table public.leave_requests enable row level security;

drop policy if exists leaves_owner_all    on public.leave_requests;
drop policy if exists leaves_self_select  on public.leave_requests;
drop policy if exists leaves_self_insert  on public.leave_requests;
drop policy if exists leaves_self_update  on public.leave_requests;
drop policy if exists leaves_self_delete  on public.leave_requests;

create policy leaves_owner_all on public.leave_requests
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

create policy leaves_self_select on public.leave_requests
  for select to authenticated
  using (public.is_self_employee(employee_id));

create policy leaves_self_insert on public.leave_requests
  for insert to authenticated
  with check (public.is_self_employee(employee_id) and status = 'pending');

-- İşçi yalnız «pending» istəyini ləğv edə bilər.
-- ⚠️ `with check` mütləq statusu məhdudlaşdırır — əks halda işçi öz istəyini
--    «approved» edə bilərdi (özünü təsdiqləmək).
create policy leaves_self_update on public.leave_requests
  for update to authenticated
  using (public.is_self_employee(employee_id) and status = 'pending')
  with check (public.is_self_employee(employee_id) and status in ('pending', 'rejected'));

create policy leaves_self_delete on public.leave_requests
  for delete to authenticated
  using (public.is_self_employee(employee_id) and status = 'pending');

-- ============================================================================
--  5. HÜQUQLAR (GRANTS) — RLS işləməsi üçün mütləqdir
-- ============================================================================

grant select, insert, update, delete on table public.businesses     to authenticated;
grant select, insert, update, delete on table public.work_logs      to authenticated;
grant select, insert, update, delete on table public.leave_requests to authenticated;

-- ============================================================================
--  6. YOXLAMA
-- ============================================================================
--  Gözlənilən: siyahıda 4 businesses + 5 work_logs + 5 leave_requests siyasəti
--  select policyname, cmd from pg_policies
--   where schemaname = 'public'
--     and tablename in ('businesses','work_logs','leave_requests')
--   order by tablename, policyname;
--
--  BİZNES YARATMA TESTİ (SQL Editor-də, istifadəçi kimi DEYİL — sadəcə siyasət):
--   select polname, pg_get_expr(polqual, polrelid) as using_expr
--     from pg_policy where polrelid = 'public.businesses'::regclass;
--
--  SXEM HAZIR ✔
-- ============================================================================
