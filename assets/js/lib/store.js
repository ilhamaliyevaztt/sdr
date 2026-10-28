/* ============================================================================
   Hesab — Supabase məlumat qatı
   Bütün əməliyyatlar real PostgreSQL bazası ilə işləyir (RLS qorunur).
   localStorage yalnız tema kimi UI seçimləri üçün istifadə olunur.
   ========================================================================== */

const env = window.__HESAB_ENV__ || {};

export const SUPABASE_URL = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = String(env.SUPABASE_ANON_KEY || '').trim();

let client = null;

export function getClient() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('MISSING_CONFIG');
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('LIBRARY_MISSING');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'hesab.auth'
    },
    global: {
      headers: { 'x-application-name': 'hesab-static' }
    }
  });
  return client;
}

/* ----------------------------- XƏTA MƏTNİ ------------------------------- */

const ERROR_MAP = {
  MISSING_CONFIG: 'Supabase konfiqurasiyası tapılmadı. SUPABASE_URL və SUPABASE_ANON_KEY təyin edilməlidir.',
  LIBRARY_MISSING: 'Supabase kitabxanası yüklənmədi. Səhifəni yeniləyin.',
  PGRST301: 'Sessiya vaxtı bitdi. Yenidən daxil olun.',
  '23505': 'Bu məlumat artıq mövcuddur.',
  '23503': 'Əlaqəli qeyd tapılmadı.',
  '23514': 'Daxil edilən dəyər qaydalara uyğun deyil.',
  '42501': 'Bu əməliyyat üçün icazəniz yoxdur.',
  '42P01': 'Baza strukturu hazır deyil. SQL skriptini işə salın.'
};

export function friendlyError(error) {
  if (!error) return 'Naməlum xəta baş verdi.';
  const code = error.code || error.status || '';
  if (ERROR_MAP[code]) return ERROR_MAP[code];
  const msg = String(error.message || '');

  if (/invalid login credentials/i.test(msg)) return 'E-poçt və ya şifrə yanlışdır.';
  if (/email not confirmed/i.test(msg)) return 'E-poçt ünvanı təsdiqlənməyib. Poçtunuzu yoxlayın.';
  if (/user already registered|already been registered/i.test(msg)) return 'Bu e-poçt ilə hesab artıq mövcuddur.';
  if (/password should be at least/i.test(msg)) return 'Şifrə ən azı 8 simvol olmalıdır.';
  if (/rate limit|too many requests/i.test(msg)) return 'Çox sayda cəhd. Bir az sonra yenidən yoxlayın.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Şəbəkə xətası. İnternet bağlantısını yoxlayın.';
  if (/duplicate key value/i.test(msg)) return 'Bu məlumat artıq mövcuddur.';
  if (/row-level security/i.test(msg)) return 'Bu əməliyyat üçün icazəniz yoxdur.';
  if (/does not exist/i.test(msg) && /relation|view/i.test(msg)) return 'Baza strukturu hazır deyil. SQL skriptini işə salın.';
  return msg || 'Xəta baş verdi.';
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
  return data.session;
}

export async function signUp(email, password, fullName) {
  const sb = getClient();
  const cleanEmail = String(email).trim().toLowerCase();
  const { data, error } = await sb.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: { full_name: String(fullName || '').trim() },
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });
  if (error) throw error;
  return data;
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

export async function updateProfile(fullName) {
  const sb = getClient();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Sessiya tapılmadı.');
  const { error } = await sb
    .from('profiles')
    .upsert({ id: uid, full_name: String(fullName || '').trim() }, { onConflict: 'id' });
  if (error) throw error;
  await sb.auth.updateUser({ data: { full_name: String(fullName || '').trim() } });
}

export async function changePassword(newPassword) {
  const sb = getClient();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* ----------------------------- KONTEKST --------------------------------- */

/**
 * Cari istifadəçinin rolunu və məlumatlarını yükləyir.
 * owner    → businesses cədvəlində öz sətri var
 * employee → employees cədvəlində user_id = uid olan sətr var
 */
export async function loadContext(session) {
  const sb = getClient();
  const user = session?.user;
  if (!user) throw new Error('Sessiya tapılmadı.');

  // Profil
  let profile = null;
  {
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error && !/PGRST116/.test(error.code || '')) {
      // profil cədvəli yoxdursa davam et
      if (!/relation|does not exist/i.test(error.message || '')) throw error;
    }
    profile = data || null;
  }

  // İşçi hesabını bağlamağa cəhd et (yalnız e-poçt təsdiqlənibsə işləyir)
  try {
    await sb.rpc('claim_employee_account');
  } catch (_) {
    /* funksiya yoxdursa və ya uyğun işçi yoxdursa səssiz keç */
  }

  // Sahibkar? (yalnız owner_id özü olan sətir)
  const { data: ownedBusiness, error: bizError } = await sb
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (bizError && !/PGRST116/.test(bizError.code || '')) throw bizError;

  if (ownedBusiness) {
    return {
      role: 'owner',
      user,
      profile,
      business: ownedBusiness,
      employee: null
    };
  }

  // İşçi?
  const { data: employee, error: empError } = await sb
    .from('employees')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (empError && !/PGRST116/.test(empError.code || '')) throw empError;

  if (employee) {
    let biz = null;
    const { data: b } = await sb
      .from('businesses')
      .select('id,name,currency')
      .eq('id', employee.business_id)
      .maybeSingle();
    biz = b || null;

    return {
      role: 'employee',
      user,
      profile,
      business: biz,
      employee
    };
  }

  return { role: 'none', user, profile, business: null, employee: null };
}

/* ----------------------------- BİZNES ----------------------------------- */

export async function createBusiness(payload) {
  const sb = getClient();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Sessiya tapılmadı.');

  const { data, error } = await sb
    .from('businesses')
    .insert({
      owner_id: uid,
      name: String(payload.name || '').trim(),
      legal_name: clean(payload.legal_name),
      phone: clean(payload.phone),
      email: clean(payload.email),
      address: clean(payload.address),
      currency: payload.currency || 'AZN'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBusiness(id, payload) {
  const sb = getClient();
  const { data, error } = await sb
    .from('businesses')
    .update({
      name: String(payload.name || '').trim(),
      legal_name: clean(payload.legal_name),
      phone: clean(payload.phone),
      email: clean(payload.email),
      address: clean(payload.address),
      currency: payload.currency || 'AZN'
    })
    .eq('id', id)
    .select()
    .single();
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
  const { data, error } = await sb
    .from('employees')
    .update({
      full_name: String(payload.full_name || '').trim(),
      position: clean(payload.position),
      monthly_salary: Number(payload.monthly_salary) || 0,
      email: normalizeEmail(payload.email),
      phone: clean(payload.phone),
      hire_date: payload.hire_date || null,
      is_active: payload.is_active !== false,
      notes: clean(payload.notes)
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setEmployeeActive(id, isActive) {
  const sb = getClient();
  const { error } = await sb.from('employees').update({ is_active: !!isActive }).eq('id', id);
  if (error) throw error;
}

export async function deleteEmployee(id) {
  const sb = getClient();
  const { error } = await sb.from('employees').delete().eq('id', id);
  if (error) throw error;
}

/* ----------------------------- ÖDƏNİŞLƏR -------------------------------- */

export async function listPayments({ businessId = null, employeeId = null, limit = 500 } = {}) {
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

/* ----------------------------- KÖMƏKÇİLƏR ------------------------------- */

function clean(value) {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s === '' ? null : s;
}

function normalizeEmail(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === '' ? null : s;
}

/* ----------------------------- HESABLAMALAR ----------------------------- */

/**
 * Panel göstəriciləri — tam olaraq baza görünüşündən hesablanır.
 */
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
  let paidThisMonth = 0;

  for (const row of list) {
    if (!activeIds.has(row.id)) continue;
    accrued += Number(row.accrued_total || 0);
    paid += Number(row.total_paid || 0);
    balance += Number(row.balance || 0);
    advance += Number(row.total_advance || 0);
    salaryPaid += Number(row.total_salary_paid || 0);
    paidThisMonth += Number(row.paid_this_month || 0);
  }

  return {
    employeeCount: active.length,
    totalCount: (employees || []).length,
    monthlyFund,
    accrued,
    paid,
    balance,
    advance,
    salaryPaid,
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
