/* ============================================================================
   RahatHesab — Supabase məlumat qatı (çoxbiznesli / çoxsahibkarlı)
   ----------------------------------------------------------------------------
   * Bütün əməliyyatlar real PostgreSQL bazası ilə işləyir, RLS qorunur.
   * Hər sahibkarın İSTƏNİLƏN SAYDA biznesi ola bilər.
   * İşçi 8 simvollu GİRİŞ KODU ilə öz kabinetinə qoşulur.
   * localStorage yalnız tema / aktiv biznes kimi UI seçimləri üçün istifadə olunur.
   ========================================================================== */

const env = window.__RAHATHESAB_ENV__ || window.__HESAB_ENV__ || {};

export const SUPABASE_URL = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');

/**
 * Publik açar seçimi:
 *   1. SUPABASE_PUBLISHABLE_KEY — yeni format (sb_publishable_...)
 *   2. SUPABASE_ANON_KEY        — köhnə format (eyJ... role:"anon")
 * Hər ikisi publikdir; `service_role` / `sb_secret_` HEÇ VAXT buraya düşməməlidir.
 */
function resolvePublicKey() {
  const candidates = [env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_ANON_KEY];
  for (const raw of candidates) {
    const key = String(raw || '').trim();
    if (!key) continue;
    if (key.startsWith('sb_secret_') || /"role"\s*:\s*"service_role"/.test(key)) {
      return { key: '', invalidSecret: true };
    }
    return { key, invalidSecret: false };
  }
  return { key: '', invalidSecret: false };
}

const resolvedKey = resolvePublicKey();

export const SUPABASE_PUBLIC_KEY = resolvedKey.key;
export const SUPABASE_ANON_KEY = SUPABASE_PUBLIC_KEY;

let client = null;

export function getClient() {
  if (client) return client;
  if (resolvedKey.invalidSecret) throw new Error('SECRET_KEY_IN_FRONTEND');
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) throw new Error('MISSING_CONFIG');
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('LIBRARY_MISSING');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'rahathhesab.auth'
    },
    global: { headers: { 'x-application-name': 'rahathhesab-static' } }
  });
  return client;
}

/* ----------------------------- XƏTA MƏTNİ ------------------------------- */

const ERROR_MAP = {
  MISSING_CONFIG:
    'Supabase konfiqurasiyası tapılmadı. SUPABASE_URL və publik açar təyin edilməlidir.',
  LIBRARY_MISSING: 'Supabase kitabxanası yüklənmədi. Səhifəni yeniləyin.',
  SECRET_KEY_IN_FRONTEND:
    'Konfiqurasiya xətası: gizli açar frontend-də istifadə oluna bilməz. Publik açarla əvəz edin.',
  PGRST301: 'Sessiya vaxtı bitdi. Yenidən daxil olun.',
  '23505': 'Bu məlumat artıq mövcuddur.',
  '23503': 'Əlaqəli qeyd tapılmadı.',
  '23514': 'Daxil edilən dəyər qaydalara uyğun deyil.',
  '42501': 'Bu əməliyyat üçün icazəniz yoxdur.',
  '42P01': 'Baza strukturu hazır deyil. SQL skriptini işə salın.',
  '42883': 'Baza funksiyası tapılmadı. schema.sql faylını yenidən işə salın.',
  INVALID_CODE: 'Kod yanlışdır. Kodu sahibkarınızdan yenidən yoxlayın.',
  CODE_ALREADY_USED: 'Bu kod artıq başqa hesaba bağlanıb.',
  CODE_GENERATION_FAILED: 'Kod yaradıla bilmədi. Yenidən cəhd edin.',
  EMPLOYEE_NOT_FOUND: 'İşçi tapılmadı. Səhifəni yeniləyin.',
  FORBIDDEN: 'Bu əməliyyat üçün icazəniz yoxdur.',
  NOT_AUTHENTICATED: 'Əvvəlcə hesabınıza daxil olun.'
};

/** E-poçt göndərmə limiti (Supabase daxili SMTP) — ən çox rast gəlinən xəta. */
export function isRateLimitError(error) {
  const code = String(error?.code || error?.error_code || error?.status || '');
  const msg = String(error?.message || error?.msg || '');
  return (
    /over_email_send_rate_limit|over_request_rate_limit|email_rate_limit/i.test(code) ||
    /email rate limit exceeded|rate limit|too many requests/i.test(msg) ||
    Number(error?.status) === 429
  );
}

/** E-poçt ünvanı Supabase tərəfindən rədd edildi (məs. example.com). */
export function isInvalidEmailDomainError(error) {
  const code = String(error?.code || error?.error_code || '');
  const msg = String(error?.message || error?.msg || '');
  return /email_address_invalid|email_address_not_authorized/i.test(code) || /is invalid|not authorized/i.test(msg);
}

/** Hesab artıq mövcuddur (Supabase e-poçt təsdiqi açıq olduqda belə qaytarır). */
export function isAlreadyRegisteredError(error) {
  const msg = String(error?.message || error?.msg || '');
  return /already registered|already been registered|user already exists/i.test(msg);
}

export function friendlyError(error) {
  if (!error) return 'Naməlum xəta baş verdi.';

  const code = String(error.code || error.status || '');
  const errorCode = String(error.error_code || '');
  const rawMsg = String(error.message || error.msg || '');

  if (ERROR_MAP[code]) return ERROR_MAP[code];
  if (ERROR_MAP[errorCode]) return ERROR_MAP[errorCode];
  if (ERROR_MAP[rawMsg]) return ERROR_MAP[rawMsg];

  // ── E-poçt göndərmə limiti ─────────────────────────────────────────────
  if (isRateLimitError(error)) {
    return (
      'E-poçt göndərmə limiti dolub. Hesabınız YARANMIŞ OLA BİLƏR — ' +
      'əvvəlcə «Daxil ol» cəhd edin, alınmasa 1 saat sonra yenidən yoxlayın. ' +
      'Daimi həll: Supabase → Authentication → Email → «Confirm email» söndürülsün.'
    );
  }

  if (isInvalidEmailDomainError(error)) {
    return 'Bu e-poçt ünvanı qəbul edilmir. Real poçt ünvanı yazın (məs. ad@gmail.com).';
  }
  if (isAlreadyRegisteredError(error)) {
    return 'Bu e-poçt ilə hesab artıq mövcuddur. «Daxil ol» bölməsindən girin.';
  }

  if (/invalid login credentials/i.test(rawMsg)) return 'E-poçt və ya şifrə yanlışdır.';
  if (/email not confirmed/i.test(rawMsg)) {
    return 'E-poçt ünvanı hələ təsdiqlənməyib. Poçtunuzu (və Spam qovluğunu) yoxlayın.';
  }
  if (/user already registered|already been registered/i.test(rawMsg)) {
    return 'Bu e-poçt ilə hesab artıq mövcuddur. «Daxil ol» bölməsindən girin.';
  }
  if (/password should be at least|weak password/i.test(rawMsg)) {
    return 'Şifrə ən azı 8 simvol olmalıdır.';
  }
  if (/new password should be different|same_password/i.test(rawMsg)) {
    return 'Yeni şifrə köhnə şifrədən fərqli olmalıdır.';
  }
  if (/signups not allowed|signup is disabled/i.test(rawMsg)) {
    return 'Qeydiyyat müvəqqəti bağlıdır. Zəhmət olmasa sonra yenidən cəhd edin.';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(rawMsg)) {
    return 'Şəbəkə xətası. İnternet bağlantısını yoxlayın.';
  }
  if (/duplicate key value/i.test(rawMsg)) return 'Bu məlumat artıq mövcuddur.';
  if (/row-level security/i.test(rawMsg)) return 'Bu əməliyyat üçün icazəniz yoxdur.';
  if (/does not exist/i.test(rawMsg) && /relation|view|function/i.test(rawMsg)) {
    return 'Baza strukturu hazır deyil. Supabase → SQL Editor → schema.sql və fix_auth.sql işə salın.';
  }
  if (/JWT|token/i.test(rawMsg)) return 'Sessiya vaxtı bitdi. Yenidən daxil olun.';
  return rawMsg || 'Xəta baş verdi.';
}

/* ----------------------------- SESSİYA ---------------------------------- */

export async function getSession() {
  const sb = getClient();
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export function onAuthChange(cb) {
  const sb = getClient();
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => {
    try {
      data.subscription.unsubscribe();
    } catch (_) {
      /* noop */
    }
  };
}

export async function signIn(email, password) {
  const sb = getClient();
  const { data, error } = await sb.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password
  });
  if (error) throw error;
  if (!data?.session) throw new Error('Sessiya yaradılmadı. Yenidən cəhd edin.');
  return data.session;
}

/**
 * Qeydiyyat.
 * ---------------------------------------------------------------------------
 * ⚠️ ƏSAS PROBLEM (həll olunur):
 *   Supabase-də "Confirm email" AÇIQ olduqda hər qeydiyyat e-poçt göndərməyə
 *   çalışır. Supabase-in daxili pulsuz SMTP-si saatda yalnız bir neçə məktub
 *   göndərir → 429 "email rate limit exceeded" → istifadəçi heç nə etmədən
 *   «Çox sayda cəhd. Bir az sonra yenidən yoxlayın.» xətası görür.
 *
 *   Buna görə:
 *     1. Hesab yaranıbsa (session varsa) — dərhal içəri buraxırıq.
 *     2. E-poçt limiti xətası olsa da, hesab YARANMIŞ ola bilər → avtomatik
 *        olaraq şifrə ilə girişi yoxlayırıq.
 *     3. Heç biri alınmasa — xətanı yuxarı ötürürük (friendlyError izah edir).
 */
export async function signUp(email, password, fullName) {
  const sb = getClient();
  const cleanEmail = String(email).trim().toLowerCase();
  const meta = { full_name: String(fullName || '').trim() };

  let data = null;
  let error = null;
  try {
    const res = await sb.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: meta,
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    data = res.data;
    error = res.error;
  } catch (err) {
    error = err;
  }

  if (data?.session) {
    return { session: data.session, user: data.user, needsConfirmation: false };
  }

  // Xəta olsa da (xüsusən e-poçt limiti) hesab yaranmış ola bilər → girişi yoxla
  if (error) {
    const retry = await trySilentSignIn(sb, cleanEmail, password);
    if (retry) return { session: retry, user: retry.user, needsConfirmation: false };
    throw error;
  }

  // Xəta yoxdur, amma sessiya da yoxdur → e-poçt təsdiqi gözlənilir
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    // Supabase e-poçt təsdiqi açıq olduqda MÖVCUD hesab üçün boş identities qaytarır.
    // Əvvəlcə şifrə ilə girişi yoxlayırıq — uğurlu olsa dərhal içəri buraxırıq.
    const retry = await trySilentSignIn(sb, cleanEmail, password);
    if (retry) return { session: retry, user: retry.user, needsConfirmation: false };
    // Əmin deyilik → xəta ATMIRIQ; istifadəçini girişə yönləndiririk
    return { session: null, user: data.user || null, needsConfirmation: true, maybeExisting: true };
  }

  return { session: null, user: data?.user || null, needsConfirmation: true };
}

/** Səssiz giriş cəhdi — uğursuz olarsa null qaytarır (xəta atmır). */
async function trySilentSignIn(sb, email, password) {
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data?.session) return null;
    return data.session;
  } catch (_) {
    return null;
  }
}

/** Təsdiq məktubunu yenidən göndərir. */
export async function resendConfirmation(email) {
  const sb = getClient();
  const { error } = await sb.auth.resend({
    type: 'signup',
    email: String(email).trim().toLowerCase(),
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
}

/**
 * Girişdən sonra profili zəmanətlə yaradır (fix_auth.sql → ensure_my_profile).
 * Funksiya yoxdursa və ya xəta versə — səssiz keçir, girişi bloklamır.
 */
export async function ensureProfile(fullName = null) {
  try {
    const sb = getClient();
    const { data, error } = await sb.rpc('ensure_my_profile', {
      p_full_name: fullName === null || fullName === undefined ? null : String(fullName)
    });
    if (error) return null;
    return data || null;
  } catch (_) {
    return null;
  }
}

export async function signOut() {
  const sb = getClient();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email) {
  const sb = getClient();
  const { error } = await sb.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) throw error;
}

export async function updateProfile({ fullName, phone }) {
  const sb = getClient();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Sessiya tapılmadı.');

  const patch = { id: uid };
  if (fullName !== undefined) patch.full_name = String(fullName || '').trim();
  if (phone !== undefined) patch.phone = clean(phone);

  const { error } = await sb.from('profiles').upsert(patch, { onConflict: 'id' });
  if (error) throw error;

  if (fullName !== undefined) {
    await sb.auth.updateUser({ data: { full_name: String(fullName || '').trim() } });
  }
}

export async function changePassword(newPassword) {
  const sb = getClient();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* ----------------------------- KONTEKST --------------------------------- */

/**
 * Cari istifadəçinin bütün bizneslərini və üzvlüklərini yükləyir.
 * Nəticə: { user, profile, ownedBusinesses, memberBusinesses, employees, role }
 */
export async function loadContext(session) {
  const sb = getClient();
  const user = session?.user;
  if (!user) throw new Error('Sessiya tapılmadı.');

  // 1. Profil — MÜTLƏQ mövcud olmalıdır (fix_auth.sql → ensure_my_profile)
  let profile = null;
  {
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    profile = data || null;
  }
  if (!profile) {
    // Trigger işləməyibsə — funksiya ilə yaradılır, sonra yenidən oxunur
    await ensureProfile(user.user_metadata?.full_name || null);
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    profile = data || null;
  }

  // 2. Ehtiyat: e-poçt uyğunluğu ilə işçi kartını bağla (səssiz)
  try {
    await sb.rpc('claim_employee_account');
  } catch (_) {
    /* funksiya yoxdursa və ya uyğun işçi yoxdursa keç */
  }

  // 3. Sahibi olduğu bizneslər (BİRDƏN ÇOX)
  // Köhnə sxemdə `is_archived` sütunu yoxdursa — filtrsiz təkrar sorğu.
  let ownedBusinesses = [];
  {
    const withArchive = await sb
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: true });

    if (withArchive.error && isMissingColumn(withArchive.error)) {
      const plain = await sb
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true });
      if (plain.error) throw plain.error;
      ownedBusinesses = plain.data || [];
    } else {
      if (withArchive.error) throw withArchive.error;
      ownedBusinesses = withArchive.data || [];
    }
  }

  // 4. İşçi olduğu bizneslər
  let myEmployees = [];
  {
    const { data, error } = await sb.from('employees').select('*').eq('user_id', user.id);
    if (error) throw error;
    myEmployees = data || [];
  }

  // 5. İşçi olduğu biznes məlumatları
  const memberBusinesses = [];
  if (myEmployees.length) {
    const ids = [...new Set(myEmployees.map((e) => e.business_id))];
    const { data, error } = await sb
      .from('businesses')
      .select('id,name,currency,phone,email,address,owner_id')
      .in('id', ids);
    if (error) throw error;
    for (const b of data || []) {
      const emp = myEmployees.find((e) => e.business_id === b.id);
      memberBusinesses.push({ ...b, employee: emp });
    }
  }

  const role = ownedBusinesses.length ? 'owner' : myEmployees.length ? 'employee' : 'none';

  return { user, profile, ownedBusinesses, memberBusinesses, myEmployees, role };
}

/* --------------------------- İŞÇİ KODU İLƏ QOŞULMA ---------------------- */

/** İşçi öz 8 simvollu kodu ilə biznesə qoşulur. */
export async function claimEmployeeByCode(code) {
  const sb = getClient();
  const { data, error } = await sb.rpc('claim_employee_by_code', {
    p_code: String(code || '').trim().toUpperCase()
  });
  if (error) throw error;
  return data;
}

/* ----------------------------- BİZNES ----------------------------------- */

/**
 * Yeni biznes yaradır.
 * ---------------------------------------------------------------------------
 * ⚠️ ƏVVƏLKİ XƏTA («Bu əməliyyat üçün icazəniz yoxdur»):
 *   Kod `.insert(...).select().single()` işlədirdi. Bu halda PostgREST
 *   `Prefer: return=representation` göndərir və PostgreSQL INSERT ... RETURNING
 *   üçün `businesses_select_own` SELECT siyasətini DƏ yoxlayır.
 *   Həmin siyasət `public.can_read_business(id)` → `current_business_ids()`
 *   funksiyasına güvənir. `current_business_ids()` **STABLE**-dır, yəni sorğunun
 *   əvvəlindəki snapshot-u görür — təzə yaradılan sətir orada YOXDUR.
 *   Nəticə: INSERT-in özü qaydasındadır, amma RETURNING mərhələsi RLS-ə düşür
 *   və istifadəçi 42501 «icazəniz yoxdur» görür.
 *
 *   HƏLL (baza dəyişikliyi tələb etmir):
 *     1. `id` əvvəlcədən yaradılır.
 *     2. INSERT `return=minimal` ilə edilir → RETURNING yoxdur → RLS keçilir.
 *     3. Sətir AYRICA sorğu ilə geri oxunur (yeni snapshot → görünür).
 *
 *   `supabase/fix_business.sql` faylı SELECT siyasətini də düzəldir
 *   (`owner_id = auth.uid()`), yəni baza yenilənəndən sonra RETURNING də işləyir.
 */
export async function createBusiness(payload) {
  const sb = getClient();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Sessiya tapılmadı.');

  const name = String(payload.name || '').trim();
  if (name.length < 2) throw new Error('Biznes adını daxil edin.');

  const row = {
    owner_id: uid,
    name,
    legal_name: clean(payload.legal_name),
    phone: clean(payload.phone),
    email: clean(payload.email),
    address: clean(payload.address),
    currency: payload.currency || 'AZN',
    pay_day: clampPayDay(payload.pay_day)
  };

  let lastError = null;

  // `join_code` unikal indeksi toqquşa bilər (ehtimal çox azdır) → bir neçə cəhd.
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newUuid();

    // 1) RETURNING-siz INSERT — RLS-in SELECT mərhələsi işə düşmür.
    const { error } = await sb.from('businesses').insert({ id, ...row });

    if (error) {
      lastError = error;
      // Yalnız unikal açar toqquşmasında təkrar cəhd et.
      if (/23505|duplicate key/i.test(String(error.code || error.message || ''))) continue;
      throw error;
    }

    // 2) Sətri ayrıca sorğu ilə geri oxu.
    const created = await readBackBusiness(sb, id);
    if (created) return created;

    // 3) Nadir hal: sətir hələ görünmür → qısa fasilə ilə yenidən yoxla.
    for (let i = 0; i < 3; i++) {
      await sleep(120);
      const retry = await readBackBusiness(sb, id);
      if (retry) return retry;
    }

    // INSERT uğurlu oldu, amma oxunmur → bazadakı SELECT siyasəti bağlıdır.
    // ⚠️ `code` TƏYİN EDİLMİR: əks halda friendlyError onu ümumi
    //    «icazəniz yoxdur» mətninə çevirir və əsl səbəb itir.
    throw new Error(
      'Biznes yaradıldı, amma oxuna bilmədi. Supabase → SQL Editor → ' +
        'supabase/fix_business.sql faylını işə salın.'
    );
  }

  throw lastError || new Error('Biznes yaradıla bilmədi. Yenidən cəhd edin.');
}

/** `businesses` sətrini id üzrə oxuyur (yoxdursa null). */
async function readBackBusiness(sb, id) {
  const { data, error } = await sb.from('businesses').select('*').eq('id', id).maybeSingle();
  if (error) {
    // PGRST116 = 0 sətir; digər xətaları yuxarı ötürmürük — nəticə null sayılır.
    if (/PGRST116/.test(String(error.code || error.message || ''))) return null;
    if (isMissingColumn(error)) return null;
    throw error;
  }
  return data || null;
}

/** UUID v4 — `crypto.randomUUID` olmayan (http) mühitlər üçün ehtiyat. */
function newUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function updateBusiness(id, payload) {
  const sb = getClient();
  const patch = {};
  if (payload.name !== undefined) patch.name = String(payload.name || '').trim();
  if (payload.legal_name !== undefined) patch.legal_name = clean(payload.legal_name);
  if (payload.phone !== undefined) patch.phone = clean(payload.phone);
  if (payload.email !== undefined) patch.email = clean(payload.email);
  if (payload.address !== undefined) patch.address = clean(payload.address);
  if (payload.currency !== undefined) patch.currency = payload.currency || 'AZN';
  if (payload.pay_day !== undefined) patch.pay_day = clampPayDay(payload.pay_day);
  if (payload.is_archived !== undefined) patch.is_archived = !!payload.is_archived;

  const { data, error } = await sb.from('businesses').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBusiness(id) {
  const sb = getClient();
  const { error } = await sb.from('businesses').delete().eq('id', id);
  if (error) throw error;
}

export async function rotateJoinCode(businessId) {
  const sb = getClient();
  const { data, error } = await sb.rpc('rotate_join_code', { p_business_id: businessId });
  if (error) throw error;
  return data;
}

/* ----------------------------- İŞÇİLƏR ---------------------------------- */

export async function listEmployees(businessId) {
  const sb = getClient();
  const { data, error } = await sb
    .from('employees')
    .select('*')
    .eq('business_id', businessId)
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listBalances(businessId) {
  const sb = getClient();
  let query = sb.from('v_employee_balances').select('*');
  if (businessId) query = query.eq('business_id', businessId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getEmployeeBalance(employeeId) {
  const sb = getClient();
  const { data, error } = await sb
    .from('v_employee_balances')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle();
  if (error && !/PGRST116/.test(error.code || '')) throw error;
  return data || null;
}

export async function createEmployee(businessId, payload) {
  const sb = getClient();
  const { data, error } = await sb
    .from('employees')
    .insert({
      business_id: businessId,
      full_name: String(payload.full_name || '').trim(),
      position: clean(payload.position),
      monthly_salary: Number(payload.monthly_salary) || 0,
      email: normalizeEmail(payload.email),
      phone: clean(payload.phone),
      hire_date: payload.hire_date || null,
      is_active: payload.is_active !== false,
      notes: clean(payload.notes)
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployee(id, payload) {
  const sb = getClient();
  const patch = {};
  if (payload.full_name !== undefined) patch.full_name = String(payload.full_name || '').trim();
  if (payload.position !== undefined) patch.position = clean(payload.position);
  if (payload.monthly_salary !== undefined) patch.monthly_salary = Number(payload.monthly_salary) || 0;
  if (payload.email !== undefined) patch.email = normalizeEmail(payload.email);
  if (payload.phone !== undefined) patch.phone = clean(payload.phone);
  if (payload.hire_date !== undefined) patch.hire_date = payload.hire_date || null;
  if (payload.is_active !== undefined) patch.is_active = !!payload.is_active;
  if (payload.notes !== undefined) patch.notes = clean(payload.notes);
  if (payload.access_code !== undefined) patch.access_code = clean(payload.access_code);

  const { data, error } = await sb.from('employees').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function setEmployeeActive(id, isActive) {
  const sb = getClient();
  const { error } = await sb.from('employees').update({ is_active: !!isActive }).eq('id', id);
  if (error) throw error;
}

/** İşçi üçün yeni giriş kodu yaradılır (server tərəfdə, toqquşma riski yoxdur). */
export async function regenerateEmployeeCode(employeeId) {
  const sb = getClient();

  // Əsas yol: fix_auth.sql → regenerate_employee_code (20 cəhd, unikal zəmanətli)
  try {
    const { data, error } = await sb.rpc('regenerate_employee_code', {
      p_employee_id: employeeId
    });
    if (!error && typeof data === 'string' && data.length >= 4) return data;
    if (error && !/42883|PGRST202|does not exist/i.test(String(error.code || error.message || ''))) {
      throw error;
    }
  } catch (err) {
    if (!/42883|PGRST202|does not exist|fetch/i.test(String(err?.code || err?.message || ''))) throw err;
    /* funksiya hələ yaradılmayıb → aşağıdaki ehtiyat yol */
  }

  // Ehtiyat yol (fix_auth.sql işə salınmayıbsa): yerli kod + toqquşmada təkrar cəhd
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode(8);
    const { data, error } = await sb
      .from('employees')
      .update({ access_code: code })
      .eq('id', employeeId)
      .select('id,access_code')
      .single();

    if (!error && data?.access_code) return data.access_code;

    lastError = error;
    if (!/23505|duplicate key/i.test(String(error?.code || error?.message || ''))) break;
  }

  throw lastError || new Error('CODE_GENERATION_FAILED');
}

export async function deleteEmployee(id) {
  const sb = getClient();
  const { error } = await sb.from('employees').delete().eq('id', id);
  if (error) throw error;
}

/** İşçi öz telefonunu yeniləyir (maaşa toxuna bilməz). */
export async function updateMyContact(phone) {
  const sb = getClient();
  const { error } = await sb.rpc('update_my_contact', { p_phone: String(phone || '') });
  if (error) throw error;
}

/* ----------------------------- ÖDƏNİŞLƏR -------------------------------- */

export async function listPayments({ businessId = null, employeeId = null, limit = 600 } = {}) {
  const sb = getClient();
  let query = sb
    .from('salary_payments')
    .select('*, employees!inner(id, full_name, position)')
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (businessId) query = query.eq('business_id', businessId);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createPayment(payload) {
  const sb = getClient();
  const { data, error } = await sb
    .from('salary_payments')
    .insert({
      employee_id: payload.employee_id,
      kind: payload.kind || 'salary',
      amount: Number(payload.amount) || 0,
      paid_at: payload.paid_at || new Date().toISOString().slice(0, 10),
      period: payload.period || null,
      method: payload.method || 'cash',
      note: clean(payload.note)
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createPaymentsBulk(rows) {
  const sb = getClient();
  const payload = rows.map((r) => ({
    employee_id: r.employee_id,
    kind: r.kind || 'salary',
    amount: Number(r.amount) || 0,
    paid_at: r.paid_at || new Date().toISOString().slice(0, 10),
    period: r.period || null,
    method: r.method || 'cash',
    note: clean(r.note)
  }));
  const { data, error } = await sb.from('salary_payments').insert(payload).select();
  if (error) throw error;
  return data || [];
}

export async function updatePayment(id, payload) {
  const sb = getClient();
  const { data, error } = await sb
    .from('salary_payments')
    .update({
      employee_id: payload.employee_id,
      kind: payload.kind || 'salary',
      amount: Number(payload.amount) || 0,
      paid_at: payload.paid_at,
      period: payload.period || null,
      method: payload.method || 'cash',
      note: clean(payload.note)
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayment(id) {
  const sb = getClient();
  const { error } = await sb.from('salary_payments').delete().eq('id', id);
  if (error) throw error;
}

/* ----------------------------- DAVAMİYYƏT ------------------------------- */

export async function listWorkLogs({ businessId = null, employeeId = null, from = null, to = null, limit = 800 } = {}) {
  const sb = getClient();
  let query = sb
    .from('work_logs')
    .select('*, employees!inner(id, full_name)')
    .order('work_date', { ascending: false })
    .limit(limit);
  if (businessId) query = query.eq('business_id', businessId);
  if (employeeId) query = query.eq('employee_id', employeeId);
  if (from) query = query.gte('work_date', from);
  if (to) query = query.lte('work_date', to);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Davamiyyət qeydini yarat və ya yenilə.
 * ---------------------------------------------------------------------------
 * ⚠️ ƏVVƏLKİ XƏTALAR:
 *   a) `.upsert({...}, {onConflict}).select().single()` — `return=representation`
 *      göndərir və RETURNING üçün əlavə SELECT yoxlaması tələb edir.
 *   b) `work_logs` cədvəlində işçi üçün UPDATE siyasəti yox idi → mövcud günü
 *      yeniləyəndə 42501 «icazəniz yoxdur» (USING expression) alınırdı.
 *   c) Təhlükəli səssiz hal: RLS UPDATE-i bloklayanda PostgREST **xəta
 *      qaytarmır** (0 sətir yenilənir, HTTP 204). «Əvvəlcə update» məntiqi ilə
 *      bu, «saxlanıldı» görünüb heç nə yazmamağa səbəb olurdu.
 *
 *   HƏLL: əvvəlcə sətri OXUYURUQ, sonra update/insert edirik və nəticəni
 *   YENİDƏN OXUYUB dəyərləri müqayisə edirik. Uyğunsuzluq varsa — aydın xəta.
 */
export async function upsertWorkLog(payload) {
  const sb = getClient();
  const employeeId = payload.employee_id;
  const workDate = payload.work_date;
  if (!employeeId || !workDate) throw new Error('İşçi və tarix mütləqdir.');

  const row = {
    hours: Number(payload.hours) || 0,
    overtime: Number(payload.overtime) || 0,
    note: clean(payload.note)
  };

  // 1) Sətir artıq var?
  const existing = await readBackWorkLog(sb, employeeId, workDate);

  if (existing) {
    // 2a) Mövcud sətri yenilə (RETURNING-siz → `.select()` YOXDUR).
    const { error } = await sb
      .from('work_logs')
      .update(row)
      .eq('employee_id', employeeId)
      .eq('work_date', workDate);
    if (error) throw error;

    const updated = await readBackWorkLog(sb, employeeId, workDate);
    if (updated && sameWorkLog(updated, row)) return updated;

    // Yazılmadı → UPDATE siyasəti icazə vermir.
    throw new Error(
      'Qeyd yenilənmədi — icazə yoxdur. Sahibkarınızdan icazə istəyin (baza: supabase/fix_business.sql).'
    );
  }

  // 2b) Yeni sətir yarat.
  const ins = await sb
    .from('work_logs')
    .insert({ employee_id: employeeId, work_date: workDate, ...row });

  if (ins.error) {
    // Paralel yazı toqquşması (23505) → update yoluna keç.
    if (/23505|duplicate key/i.test(String(ins.error.code || ins.error.message || ''))) {
      const { error } = await sb
        .from('work_logs')
        .update(row)
        .eq('employee_id', employeeId)
        .eq('work_date', workDate);
      if (error) throw error;
      const again = await readBackWorkLog(sb, employeeId, workDate);
      if (again && sameWorkLog(again, row)) return again;
      throw new Error('Qeyd yenilənmədi — icazə yoxdur.');
    }
    throw ins.error;
  }

  const created = await readBackWorkLog(sb, employeeId, workDate);
  if (created) return created;

  throw new Error('Davamiyyət qeydi yazıldı, amma oxuna bilmədi. Səhifəni yeniləyin.');
}

/** Oxunan sətir gözlənilən dəyərlərlə üst-üstə düşürmü? */
function sameWorkLog(actual, expected) {
  const near = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.001;
  const norm = (v) => String(v === null || v === undefined ? '' : v).trim();
  return (
    near(actual.hours, expected.hours) &&
    near(actual.overtime, expected.overtime) &&
    norm(actual.note) === norm(expected.note)
  );
}

async function readBackWorkLog(sb, employeeId, workDate) {
  const { data, error } = await sb
    .from('work_logs')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();
  if (error) {
    if (/PGRST116/.test(String(error.code || error.message || ''))) return null;
    throw error;
  }
  return data || null;
}

export async function deleteWorkLog(id) {
  const sb = getClient();
  // `.select('id')` → neçə sətir silindiyini göstərir.
  // RLS silməyə icazə vermirsə, əvvəl 204 qayıdırdı və istifadəçi «silindi»
  // mesajı görsə də sətir qalırdı. İndi bu hal aydın xəta kimi göstərilir.
  const { data, error } = await sb.from('work_logs').delete().eq('id', id).select('id');
  if (error) throw error;
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('Qeyd silinmədi — icazə yoxdur. Sahibkarınızla əlaqə saxlayın.');
  }
}

/* ----------------------------- MƏZUNİYYƏT ------------------------------- */

export async function listLeaves({ businessId = null, employeeId = null, limit = 300 } = {}) {
  const sb = getClient();
  let query = sb
    .from('leave_requests')
    .select('*, employees!inner(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (businessId) query = query.eq('business_id', businessId);
  if (employeeId) query = query.eq('employee_id', employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createLeaveRequest(payload) {
  const sb = getClient();
  const { data, error } = await sb
    .from('leave_requests')
    .insert({
      employee_id: payload.employee_id,
      kind: payload.kind || 'vacation',
      start_date: payload.start_date,
      end_date: payload.end_date,
      reason: clean(payload.reason),
      status: 'pending'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function decideLeave(id, status) {
  const sb = getClient();
  const { data, error } = await sb
    .from('leave_requests')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Məzuniyyət istəyini silir.
 * ---------------------------------------------------------------------------
 * ⚠️ ƏVVƏLKİ XƏTA: işçinin `leave_requests` üzərində DELETE siyasəti yox idi.
 *    PostgREST RLS-ə görə 0 sətir silirdi, amma cavab **204 No Content** olurdu
 *    → tətbiq «İstək silindi» mesajı göstərirdi, sətir isə qalırdı.
 *    İndi silinən sətirlər `select('id')` ilə yoxlanılır.
 *    Baza tərəfi `supabase/fix_business.sql` ilə düzəldilir.
 */
export async function deleteLeave(id) {
  const sb = getClient();
  const { data, error } = await sb.from('leave_requests').delete().eq('id', id).select('id');
  if (error) throw error;
  if (Array.isArray(data) && data.length === 0) {
    throw new Error(
      'İstək silinmədi — yalnız «gözləyir» halındaki istəkləri silə bilərsiniz.'
    );
  }
}

/* ------------------------------- QEYDLƏR -------------------------------- */

export async function listNotes(businessId) {
  const sb = getClient();
  const { data, error } = await sb
    .from('notes')
    .select('*')
    .eq('business_id', businessId)
    .order('is_done', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createNote(businessId, payload) {
  const sb = getClient();
  const { data, error } = await sb
    .from('notes')
    .insert({
      business_id: businessId,
      title: String(payload.title || '').trim(),
      body: clean(payload.body),
      due_date: payload.due_date || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleNote(id, isDone) {
  const sb = getClient();
  const { error } = await sb.from('notes').update({ is_done: !!isDone }).eq('id', id);
  if (error) throw error;
}

export async function updateNote(id, payload) {
  const sb = getClient();
  const { error } = await sb
    .from('notes')
    .update({
      title: String(payload.title || '').trim(),
      body: clean(payload.body),
      due_date: payload.due_date || null
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteNote(id) {
  const sb = getClient();
  const { error } = await sb.from('notes').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------------------- FƏALİYYƏT JURNALI ------------------------- */

export async function listActivity(businessId, limit = 12) {
  const sb = getClient();
  const { data, error } = await sb
    .from('activity_log')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error && !/relation|does not exist/i.test(error.message || '')) throw error;
  return data || [];
}

export async function logActivity(businessId, action, detail = null, actorName = null) {
  try {
    const sb = getClient();
    await sb.from('activity_log').insert({
      business_id: businessId,
      action: String(action || '').slice(0, 120),
      detail: detail ? String(detail).slice(0, 300) : null,
      actor_name: actorName
    });
  } catch (_) {
    /* jurnal kritik deyil — xətanı uduruq */
  }
}

/* ----------------------------- KÖMƏKÇİLƏR ------------------------------- */

/** Sxemdə sütun/cədvəl yoxdur xətası? (köhnə baza ilə uyğunluq üçün) */
export function isMissingColumn(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return (
    code === '42703' || // undefined_column
    code === '42P01' || // undefined_table
    code === 'PGRST204' || // kolon tapılmadı (PostgREST)
    code === 'PGRST205' || // cədvəl sxem keşində yoxdur
    /column .* does not exist/i.test(msg) ||
    /Could not find the '.*' column/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  );
}

export function clean(value) {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s === '' ? null : s;
}

function normalizeEmail(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === '' ? null : s;
}

function clampPayDay(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.min(28, Math.max(1, n));
}

/** Qarışdırıla bilən simvollar olmadan kod (O/0, I/1 yoxdur). */
export function makeCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(len);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 4294967296);
  }
  let out = '';
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

/* ----------------------------- HESABLAMALAR ----------------------------- */

export function summarize(balances, employees) {
  const list = Array.isArray(balances) ? balances : [];
  const active = (employees || []).filter((e) => e.is_active);
  const activeIds = new Set(active.map((e) => e.id));

  const monthlyFund = active.reduce((sum, e) => sum + Number(e.monthly_salary || 0), 0);

  let accrued = 0;
  let paid = 0;
  let balance = 0;
  let advance = 0;
  let salaryPaid = 0;
  let bonus = 0;
  let deduction = 0;
  let paidThisMonth = 0;

  for (const row of list) {
    if (!activeIds.has(row.id)) continue;
    accrued += Number(row.accrued_total || 0);
    paid += Number(row.total_paid || 0);
    balance += Number(row.balance || 0);
    advance += Number(row.total_advance || 0);
    salaryPaid += Number(row.total_salary_paid || 0);
    bonus += Number(row.total_bonus || 0);
    deduction += Number(row.total_deduction || 0);
    paidThisMonth += Number(row.paid_this_month || 0);
  }

  return {
    employeeCount: active.length,
    totalCount: (employees || []).length,
    inactiveCount: Math.max(0, (employees || []).length - active.length),
    monthlyFund,
    accrued,
    paid,
    balance,
    advance,
    salaryPaid,
    bonus,
    deduction,
    paidThisMonth,
    payoutRate: accrued > 0 ? Math.min(100, (paid / accrued) * 100) : 0
  };
}

export function groupPaymentsByEmployee(payments) {
  const map = new Map();
  for (const p of payments || []) {
    const key = p.employee_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return map;
}

/** Ödənişləri ay-ay qruplaşdırır: Map("2026-03" → { paid, advance, salary, bonus, deduction }) */
export function paymentsByMonth(payments) {
  const map = new Map();
  for (const p of payments || []) {
    const key = p.period || String(p.paid_at || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!map.has(key)) map.set(key, { paid: 0, advance: 0, salary: 0, bonus: 0, deduction: 0, count: 0 });
    const row = map.get(key);
    const amount = Number(p.amount || 0);
    row.count += 1;
    if (p.kind === 'deduction') row.deduction += amount;
    else row.paid += amount;
    if (row[p.kind] !== undefined) row[p.kind] += amount;
  }
  return map;
}
