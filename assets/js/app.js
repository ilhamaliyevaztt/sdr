/* ============================================================================
   Hesab — Tətbiq nüvəsi
   ----------------------------------------------------------------------------
   MARŞRUTLAMA: URL HEÇ VAXT DƏYİŞMİR.
   Naviqasiya yalnız yaddaşda (in-memory state) saxlanılır — history API,
   hash (#), query (?page=) və ya path (/elaqe) istifadə edilmir.
   ========================================================================== */

import { $, $$, icon, toast, emptyState } from './lib/dom.js';
import {
  getClient,
  getSession,
  onAuthChange,
  loadContext,
  signOut,
  listEmployees,
  listPayments,
  listBalances,
  friendlyError
} from './lib/store.js';
import { initAuth, showAuth } from './auth.js';
import { openBusinessForm, openPaymentForm } from './ui/forms.js';

import renderDashboard from './ui/views/dashboard.js';
import renderEmployees, { renderEmployeeDetail } from './ui/views/employees.js';
import renderPayments from './ui/views/payments.js';
import renderReports from './ui/views/reports.js';
import renderSettings from './ui/views/settings.js';
import renderProfile from './ui/views/profile.js';

/* ------------------------------- STATE ---------------------------------- */

export const state = {
  session: null,
  user: null,
  profile: null,
  role: 'none', // owner | employee | none
  business: null,
  employee: null,
  view: 'dashboard',
  params: {},
  employees: [],
  balances: [],
  payments: [],
  loading: false,
  error: null
};

const VIEWS = {
  dashboard: { title: 'İcmal', subtitle: 'Biznesinizin əməkhaqqı mənzərəsi', render: renderDashboard, roles: ['owner'] },
  employees: { title: 'İşçilər', subtitle: 'İşçi heyəti və maaş parametrləri', render: renderEmployees, roles: ['owner'] },
  payments: { title: 'Ödənişlər', subtitle: 'Avans, maaş və mükafat tarixçəsi', render: renderPayments, roles: ['owner'] },
  reports: { title: 'Hesabatlar', subtitle: 'Aylıq dinamika və yekunlar', render: renderReports, roles: ['owner'] },
  settings: { title: 'Tənzimləmələr', subtitle: 'Biznes profili və hesab ayarları', render: renderSettings, roles: ['owner'] },
  profile: { title: 'Şəxsi kabinet', subtitle: 'Maaş, ödənişlər və qalıq', render: renderProfile, roles: ['owner', 'employee'] },
  'employee-detail': { title: 'İşçi kartı', subtitle: 'Maaş hesablaması və tarixçə', render: renderEmployeeDetail, roles: ['owner'] }
};

let authUnsub = null;

/* -------------------------------- BOOT ---------------------------------- */

export async function boot() {
  try {
    getClient();
  } catch (err) {
    showFatal(err);
    return;
  }

  initAuth(async (session) => {
    await startApp(session);
  });

  // OAuth / magic-link qayıdışı: URL-də token ola bilər — client özü təmizləyir
  try {
    const session = await getSession();
    if (session) {
      await startApp(session);
    } else {
      showAuth();
    }
  } catch (err) {
    console.error('[boot] session error', err);
    showAuth();
  }

  if (!authUnsub) {
    authUnsub = onAuthChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        resetState();
        showAuth();
      }
    });
  }
}

function showFatal(error) {
  $('#boot-screen').hidden = true;
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = true;
  $('#fatal-screen').hidden = false;

  const msg = $('#fatal-message');
  if (msg) {
    const text = friendlyError(error);
    msg.textContent =
      error?.message === 'MISSING_CONFIG'
        ? 'Supabase URL və anon key tapılmadı. Render mühit dəyişənlərini yoxlayın.'
        : text;
  }

  const retry = $('#fatal-retry');
  if (retry) {
    retry.onclick = () => window.location.reload();
  }
}

/* ------------------------------ APP START -------------------------------- */

export async function startApp(session) {
  try {
    state.session = session;
    state.user = session.user;

    const context = await loadContext(session);
    state.role = context.role;
    state.user = context.user;
    state.profile = context.profile;
    state.business = context.business;
    state.employee = context.employee;

    if (state.role === 'none') {
      showApp();
      renderNoBusiness();
      return;
    }

    await refreshData();
    showApp();

    if (state.role === 'employee') {
      navigate('profile');
    } else {
      navigate('dashboard');
    }
  } catch (err) {
    console.error('[boot] app start failed', err);
    // Sxem quraşdırılmayıbsa aydın mesaj göstər
    if (/relation|does not exist|schema/i.test(String(err?.message || ''))) {
      showAuth();
      toast('Baza strukturu hazır deyil. Supabase-də schema.sql faylını işə salın.', 'error', 9000);
      return;
    }
    if (/session|JWT|token/i.test(String(err?.message || ''))) {
      resetState();
      showAuth();
      return;
    }
    showAuth();
    toast(friendlyError(err), 'error', 7000);
  }
}

export function resetState() {
  state.session = null;
  state.user = null;
  state.profile = null;
  state.role = 'none';
  state.business = null;
  state.employee = null;
  state.view = 'dashboard';
  state.params = {};
  state.employees = [];
  state.balances = [];
  state.payments = [];
}

function showApp() {
  $('#boot-screen').hidden = true;
  $('#fatal-screen').hidden = true;
  $('#auth-screen').hidden = true;
  $('#app-shell').hidden = false;

  const user = state.user;
  const name =
    (state.profile && state.profile.full_name) ||
    (user && user.user_metadata && user.user_metadata.full_name) ||
    (user && user.email) ||
    'İstifadəçi';

  setText('#user-name', name);
  setText('#user-email', (user && user.email) || '—');
  setText('#user-avatar', initialsOf(name));

  const bizName = (state.business && state.business.name) || 'Biznes yoxdur';
  setText('#business-name', bizName);
  setText('#business-avatar', initialsOf(bizName));
  setText('#business-role', state.role === 'employee' ? 'İşçi' : 'Sahibkar');

  applyRoleVisibility();
  bindShell();
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function applyRoleVisibility() {
  const isOwner = state.role === 'owner';
  $$('#main-nav .nav__item').forEach((btn) => {
    const view = btn.dataset.view;
    const cfg = VIEWS[view];
    if (!cfg) return;
    const allowed = cfg.roles.includes(state.role);
    btn.hidden = !allowed;
  });

  // Sahibkar üçün "Şəxsi kabinet" yalnız profil məlumatları üçündür
  const quickAdd = $('#quick-add');
  if (quickAdd) quickAdd.hidden = !isOwner;

  // Bölmə başlıqları
  $$('#main-nav .nav__label').forEach((label) => {
    label.hidden = !isOwner;
  });
}

/* ------------------------------- SHELL ---------------------------------- */

let shellBound = false;

function bindShell() {
  if (shellBound) return;
  shellBound = true;

  // Menyu (mobil)
  const sidebar = $('#sidebar');
  const scrim = $('#scrim');

  const openSidebar = () => {
    sidebar.classList.add('is-open');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  const closeSidebar = () => {
    sidebar.classList.remove('is-open');
    scrim.hidden = true;
    document.body.style.overflow = '';
  };

  $('#sidebar-open')?.addEventListener('click', openSidebar);
  $('#sidebar-close')?.addEventListener('click', closeSidebar);
  scrim?.addEventListener('click', closeSidebar);

  // Naviqasiya
  $$('#main-nav .nav__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.view);
      closeSidebar();
      // Mobil klaviatura bağlanması üçün
      if (document.activeElement) document.activeElement.blur();
    });
  });

  // Sürətli ödəniş
  $('#quick-add')?.addEventListener('click', () => {
    if (state.role !== 'owner') return;
    openPaymentForm({
      employees: state.employees,
      payments: state.payments,
      currency: currencyOf(),
      onSaved: async () => {
        await refreshData();
        rerender();
      }
    });
  });

  // Çıxış
  $('#logout-btn')?.addEventListener('click', async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('[logout] failed', err);
    } finally {
      resetState();
      showAuth();
      toast('Hesabdan çıxdınız.', 'info');
    }
  });

  // Tema
  $('#theme-toggle')?.addEventListener('click', toggleTheme);
  applyTheme(getStoredTheme());

  // Klaviatura: Escape ilə menyunu bağla
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('is-open')) closeSidebar();
  });

  // Ekran ölçüsü dəyişdikdə menyunu sıfırla
  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeSidebar();
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('hesab.theme', next);
  } catch (_) {
    /* noop */
  }
}

function getStoredTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem('hesab.theme');
  } catch (_) {
    stored = null;
  }
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const iconUse = $('#theme-icon');
  if (iconUse) iconUse.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#080d12' : '#f5f7f8');
}

/* ----------------------------- NAVIGATION -------------------------------- */

/**
 * Bölməyə keçid — URL-ə TOXUNMUR.
 * @param {string} view
 * @param {object} params
 */
export function navigate(view, params = {}) {
  const cfg = VIEWS[view];
  if (!cfg) return;
  if (!cfg.roles.includes(state.role)) {
    toast('Bu bölməyə giriş icazəniz yoxdur.', 'error');
    return;
  }

  state.view = view;
  state.params = params || {};

  // Aktiv naviqasiya
  $$('#main-nav .nav__item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === view);
  });

  const title = (params && params.title) || cfg.title;
  const subtitle = (params && params.subtitle) || cfg.subtitle;
  setText('#page-title', title);
  setText('#page-subtitle', subtitle);

  const navBtn = document.querySelector(`#main-nav .nav__item[data-view="${view}"]`);
  if (navBtn) navBtn.setAttribute('aria-current', 'page');
  $$('#main-nav .nav__item').forEach((btn) => {
    if (btn.dataset.view !== view) btn.removeAttribute('aria-current');
  });

  rerender();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/** Cari görünüşü yenidən çəkir */
export function rerender() {
  const root = $('#view-root');
  if (!root) return;

  const cfg = VIEWS[state.view];
  if (!cfg) return;

  const ctx = {
    state,
    role: state.role,
    business: state.business,
    employee: state.employee,
    employees: state.employees,
    balances: state.balances,
    payments: state.payments,
    currency: currencyOf(),
    navigate,
    refresh: async () => {
      await refreshData();
      rerender();
    },
    refreshData,
    rerender
  };

  try {
    cfg.render(root, ctx);
  } catch (err) {
    console.error('[view] render failed', err);
    root.innerHTML = emptyState({
      title: 'Görünüş yüklənmədi',
      message: friendlyError(err),
      iconName: 'i-alert'
    });
  }
}

export function currencyOf() {
  return (state.business && state.business.currency) || 'AZN';
}

/* ------------------------------ DATA ------------------------------------ */

export async function refreshData() {
  if (state.role === 'owner' && state.business) {
    const [employees, balances, payments] = await Promise.all([
      listEmployees(state.business.id),
      listBalances(state.business.id),
      listPayments({ businessId: state.business.id, limit: 400 })
    ]);
    state.employees = employees;
    state.balances = balances;
    state.payments = payments;
  } else if (state.role === 'employee' && state.employee) {
    const [balances, payments] = await Promise.all([
      listBalances(null),
      listPayments({ employeeId: state.employee.id, limit: 200 })
    ]);
    state.balances = balances;
    state.payments = payments;
    state.employees = [];
  }

  updateBadge();
}

function updateBadge() {
  const badge = $('#nav-employees-badge');
  if (!badge) return;
  if (state.role !== 'owner') {
    badge.hidden = true;
    return;
  }
  const count = state.employees.filter((e) => e.is_active).length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

/* --------------------------- NO BUSINESS -------------------------------- */

function renderNoBusiness() {
  setText('#page-title', 'Biznesinizi yaradın');
  setText('#page-subtitle', 'Başlamaq üçün bir addım qaldı');

  const root = $('#view-root');
  if (!root) return;

  root.innerHTML = `
    <div class="card" style="max-width:640px;margin:0 auto">
      <div class="card__body" style="padding:32px">
        <div class="empty" style="padding:0;text-align:left;justify-items:start">
          <div class="empty__icon">${icon('i-building', 24)}</div>
          <h3 style="font-size:19px;letter-spacing:-.03em">Hesabınız hazırdır</h3>
          <p style="max-width:52ch">
            Hələ heç bir biznes profili yoxdur. Biznes adınızı daxil edin —
            işçiləri əlavə edib maaş uçotuna dərhal başlaya biləcəksiniz.
          </p>
        </div>
        <div class="row" style="margin-top:22px">
          <button class="btn btn--primary btn--lg" type="button" id="create-biz">
            ${icon('i-plus', 18)} Biznes yarat
          </button>
        </div>
        <p class="muted" style="font-size:12.5px;margin-top:16px">
          Qeyd: işçi hesabı ilə daxil olmusunuzsa, sahibkarınız sizi işçi
          siyahısına əlavə etməlidir.
        </p>
      </div>
    </div>
  `;

  $('#create-biz', root)?.addEventListener('click', () => {
    openBusinessForm({
      onSaved: async () => {
        const context = await loadContext(state.session);
        state.role = context.role;
        state.business = context.business;
        state.employee = context.employee;
        state.profile = context.profile;
        showApp();
        await refreshData();
        navigate('dashboard');
      }
    });
  });
}

/* ------------------------------ EXPORT ---------------------------------- */

export { VIEWS };

/* ------------------------------- BOOT ----------------------------------- */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    boot();
  });
} else {
  boot();
}
