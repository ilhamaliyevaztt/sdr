/* ============================================================================
   RahatHesab — Tətbiq nüvəsi
   ----------------------------------------------------------------------------
   MARŞRUTLAMA: URL HEÇ VAXT DƏYİŞMİR (in-memory state).
   ÇOXİSTİFADƏÇİLİ: hər istifadəçinin bir neçə "məkanı" (biznesi) ola bilər —
   həm sahibkar kimi, həm işçi kimi. Yuxarı soldaki menyudan keçid edilir.
   ========================================================================== */

import { $, $$, icon, toast, emptyState, initialsOf } from './lib/dom.js';
import {
  getClient,
  getSession,
  onAuthChange,
  loadContext,
  signOut,
  listEmployees,
  listPayments,
  listBalances,
  listWorkLogs,
  listLeaves,
  listNotes,
  listActivity,
  summarize,
  friendlyError,
  claimEmployeeByCode
} from './lib/store.js';
import { initAuth, showAuth } from './auth.js';
import { openBusinessForm, openPaymentForm, openJoinCodeModal } from './ui/forms.js';

import renderDashboard from './ui/views/dashboard.js';
import renderEmployees, { renderEmployeeDetail } from './ui/views/employees.js';
import renderPayments from './ui/views/payments.js';
import renderWorklog from './ui/views/worklog.js';
import renderLeaves from './ui/views/leaves.js';
import renderNotes from './ui/views/notes.js';
import renderReports from './ui/views/reports.js';
import renderSettings from './ui/views/settings.js';
import renderProfile from './ui/views/profile.js';
import renderHelp from './ui/views/help.js';

/* ------------------------------- STATE ---------------------------------- */

export const state = {
  session: null,
  user: null,
  profile: null,
  spaces: [], // [{ type:'owner'|'employee', business, employee }]
  activeIndex: 0,
  view: 'dashboard',
  params: {},
  employees: [],
  balances: [],
  payments: [],
  worklogs: [],
  leaves: [],
  notes: [],
  activity: [],
  summary: null,
  loading: false,
  error: null
};

const STORE_KEY = 'rahathesab.biz';

const VIEWS = {
  dashboard: {
    title: 'İcmal',
    subtitle: 'Biznesin qısa mənzərəsi',
    render: renderDashboard,
    roles: ['owner', 'employee']
  },
  employees: {
    title: 'İşçilər',
    subtitle: 'Heyət və maaşlar',
    render: renderEmployees,
    roles: ['owner']
  },
  'employee-detail': {
    title: 'İşçi kartı',
    subtitle: 'Maaş hesablaması və tarixçə',
    render: renderEmployeeDetail,
    roles: ['owner']
  },
  payments: {
    title: 'Ödənişlər',
    subtitle: 'Avans, maaş və mükafatlar',
    render: renderPayments,
    roles: ['owner', 'employee']
  },
  worklog: {
    title: 'Davamiyyət',
    subtitle: 'Gündəlik iş saatları',
    render: renderWorklog,
    roles: ['owner', 'employee']
  },
  leaves: {
    title: 'Məzuniyyət',
    subtitle: 'İstəklər və qərarlar',
    render: renderLeaves,
    roles: ['owner', 'employee']
  },
  notes: {
    title: 'Qeydlər',
    subtitle: 'Tapşırıqlar və xatırlatmalar',
    render: renderNotes,
    roles: ['owner']
  },
  reports: {
    title: 'Hesabatlar',
    subtitle: 'Aylıq dinamika və yekunlar',
    render: renderReports,
    roles: ['owner']
  },
  settings: {
    title: 'Tənzimləmələr',
    subtitle: 'Biznes profili və hesab',
    render: renderSettings,
    roles: ['owner']
  },
  profile: {
    title: 'Şəxsi kabinet',
    subtitle: 'Maaş, ödənişlər və qalıq',
    render: renderProfile,
    roles: ['owner', 'employee']
  },
  help: {
    title: 'Kömək',
    subtitle: 'Sadə izahlar və addımlar',
    render: renderHelp,
    roles: ['owner', 'employee']
  }
};

let authUnsub = null;

export function activeSpace() {
  return state.spaces[state.activeIndex] || null;
}

export function currentRole() {
  const space = activeSpace();
  return space ? space.type : 'none';
}

export function currentBusiness() {
  const space = activeSpace();
  return space ? space.business : null;
}

export function currentEmployee() {
  const space = activeSpace();
  return space ? space.employee || null : null;
}

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
    authUnsub = onAuthChange(async (event) => {
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
  if (msg) msg.textContent = friendlyError(error);

  const retry = $('#fatal-retry');
  if (retry) retry.onclick = () => window.location.reload();
}

/* ------------------------------ APP START -------------------------------- */

export async function startApp(session) {
  try {
    state.session = session;
    state.user = session.user;

    await buildSpaces();

    if (!state.spaces.length) {
      showApp();
      renderWelcome();
      return;
    }

    await refreshData();
    showApp();
    navigate(state.view && VIEWS[state.view] ? state.view : 'dashboard');
  } catch (err) {
    console.error('[boot] app start failed', err);
    if (/relation|does not exist|schema/i.test(String(err?.message || ''))) {
      showAuth();
      toast('Baza hazır deyil. Supabase → SQL Editor → schema.sql faylını işə salın.', 'error', 9000);
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

/** İstifadəçinin bütün məkanlarını (sahibkar + işçi) yığır. */
async function buildSpaces() {
  const ctx = await loadContext(state.session);
  state.profile = ctx.profile;
  state.user = ctx.user;

  const spaces = [];
  for (const b of ctx.ownedBusinesses) {
    spaces.push({ type: 'owner', business: b, employee: null });
  }
  for (const b of ctx.memberBusinesses) {
    spaces.push({ type: 'employee', business: b, employee: b.employee });
  }

  state.spaces = spaces;

  // Aktiv məkanı yaddaşdan bərpa et
  let savedId = null;
  try {
    savedId = localStorage.getItem(STORE_KEY);
  } catch (_) {
    savedId = null;
  }
  const idx = savedId ? spaces.findIndex((s) => s.business.id === savedId) : -1;
  state.activeIndex = idx >= 0 ? idx : 0;

  rememberActive();
}

function rememberActive() {
  const space = activeSpace();
  try {
    if (space) localStorage.setItem(STORE_KEY, space.business.id);
    else localStorage.removeItem(STORE_KEY);
  } catch (_) {
    /* noop */
  }
}

export function resetState() {
  state.session = null;
  state.user = null;
  state.profile = null;
  state.spaces = [];
  state.activeIndex = 0;
  state.view = 'dashboard';
  state.params = {};
  state.employees = [];
  state.balances = [];
  state.payments = [];
  state.worklogs = [];
  state.leaves = [];
  state.notes = [];
  state.activity = [];
  state.summary = null;
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

  renderSpaceHeader();
  applyRoleVisibility();
  bindShell();
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function renderSpaceHeader() {
  const space = activeSpace();
  const bizName = space ? space.business.name : 'RahatHesab';
  setText('#business-name', bizName);
  setText('#business-avatar', initialsOf(bizName));
  setText('#business-role', space ? (space.type === 'owner' ? 'Sahibkar' : 'İşçi') : '—');

  const switchBtn = $('#business-switch-btn');
  if (switchBtn) switchBtn.disabled = state.spaces.length === 0;
}

function applyRoleVisibility() {
  const role = currentRole();

  $$('#main-nav .nav__item').forEach((btn) => {
    const cfg = VIEWS[btn.dataset.view];
    const explicit = btn.dataset.roles;
    let allowed = cfg ? cfg.roles.includes(role) : true;
    if (explicit === 'owner') allowed = allowed && role === 'owner';
    btn.hidden = !allowed;
  });

  $$('#main-nav .nav__label').forEach((label) => {
    if (label.dataset.roles === 'owner') label.hidden = role !== 'owner';
  });

  $$('[data-roles="owner"]').forEach((el) => {
    if (el.closest('#main-nav')) return;
    el.hidden = role !== 'owner';
  });

  const quickAdd = $('#quick-add');
  if (quickAdd) quickAdd.hidden = role !== 'owner';
}

/* ------------------------------- SHELL ---------------------------------- */

let shellBound = false;

function bindShell() {
  if (shellBound) return;
  shellBound = true;

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

  $$('#main-nav .nav__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.view);
      closeSidebar();
      if (document.activeElement) document.activeElement.blur();
    });
  });

  $('#quick-add')?.addEventListener('click', () => {
    if (currentRole() !== 'owner') return;
    openPaymentForm({
      employees: state.employees,
      payments: state.payments,
      currency: currencyOf(),
      onSaved: refreshAndRender
    });
  });

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

  $('#theme-toggle')?.addEventListener('click', toggleTheme);
  applyTheme(getStoredTheme());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('is-open')) closeSidebar();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeSidebar();
  });

  bindBusinessSwitcher();
}

/* -------------------------- BİZNES SEÇİCİ ------------------------------- */

function bindBusinessSwitcher() {
  const btn = $('#business-switch-btn');
  const menu = $('#business-menu');
  if (!btn || !menu) return;

  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) {
      close();
      return;
    }
    renderBusinessMenu();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  });

  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (e.target.closest('#bizswitch')) return;
    close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-space-index]');
    if (!item) return;
    const idx = Number(item.dataset.spaceIndex);
    close();
    switchSpace(idx);
  });
}

function renderBusinessMenu() {
  const menu = $('#business-menu');
  if (!menu) return;

  const items = state.spaces
    .map((s, i) => {
      const active = i === state.activeIndex;
      return `
        <button type="button" role="option" aria-selected="${active}" class="${active ? 'is-active' : ''}" data-space-index="${i}">
          <span class="avatar avatar--sq" aria-hidden="true">${escapeAttr(initialsOf(s.business.name))}</span>
          <span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeAttr(s.business.name)}
            <small style="display:block;font-size:10.5px;color:var(--ink-4);font-weight:600">
              ${s.type === 'owner' ? 'Sahibkar' : 'İşçi'}
            </small>
          </span>
          ${active ? icon('i-check', 16) : ''}
        </button>
      `;
    })
    .join('');

  const canCreate = currentRole() === 'owner' || state.spaces.some((s) => s.type === 'owner');

  menu.innerHTML = `
    ${items || '<p class="tiny muted" style="padding:10px">Biznes yoxdur.</p>'}
    <div class="bizswitch__sep"></div>
    <button type="button" class="bizswitch__add" data-menu-action="new-business">
      ${icon('i-plus', 16)} Yeni biznes
    </button>
    <button type="button" data-menu-action="join-code">
      ${icon('i-key', 16)} Kodla qoşul
    </button>
    ${canCreate ? '' : ''}
  `;

  menu.querySelector('[data-menu-action="new-business"]')?.addEventListener('click', () => {
    menu.hidden = true;
    $('#business-switch-btn')?.setAttribute('aria-expanded', 'false');
    openBusinessForm({
      onSaved: async () => {
        await reloadSpaces();
      }
    });
  });

  menu.querySelector('[data-menu-action="join-code"]')?.addEventListener('click', () => {
    menu.hidden = true;
    $('#business-switch-btn')?.setAttribute('aria-expanded', 'false');
    openJoinCodeModal({ onDone: reloadSpaces });
  });
}

/** Məkanları yenidən yükləyir (yeni biznes / kodla qoşulma sonrası). */
export async function reloadSpaces() {
  await buildSpaces();
  if (!state.spaces.length) {
    renderWelcome();
    return;
  }
  renderSpaceHeader();
  applyRoleVisibility();
  await refreshData();
  if (!VIEWS[state.view] || !VIEWS[state.view].roles.includes(currentRole())) {
    state.view = 'dashboard';
  }
  navigate(state.view);
  toast('Yeniləndi.', 'ok');
}

export async function switchSpace(index) {
  if (index === state.activeIndex || !state.spaces[index]) return;
  state.activeIndex = index;
  rememberActive();
  renderSpaceHeader();
  applyRoleVisibility();
  state.view = 'dashboard';
  await refreshData();
  navigate('dashboard');
  toast(`${state.spaces[index].business.name} açıldı.`, 'info', 2600);
}

/* ------------------------------- THEME ---------------------------------- */

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('rahathesab.theme', next);
  } catch (_) {
    /* noop */
  }
}

function getStoredTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem('rahathesab.theme');
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
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1519' : '#1F313F');
}

/* ----------------------------- NAVIGATION -------------------------------- */

export function navigate(view, params = {}) {
  const cfg = VIEWS[view];
  if (!cfg) return;
  if (!cfg.roles.includes(currentRole())) {
    const fallback = cfg.roles.includes(currentRole()) ? view : 'dashboard';
    toast('Bu bölmə sizin üçün açıq deyil.', 'info', 2600);
    if (fallback !== view) return navigate(fallback, params);
    return;
  }

  state.view = view;
  state.params = params || {};

  $$('#main-nav .nav__item').forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  const title = (params && params.title) || cfg.title;
  const subtitle = (params && params.subtitle) || cfg.subtitle;
  setText('#page-title', title);
  setText('#page-subtitle', subtitle);

  rerender();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function rerender() {
  const root = $('#view-root');
  if (!root) return;

  const cfg = VIEWS[state.view];
  if (!cfg) return;

  const ctx = {
    state,
    role: currentRole(),
    business: currentBusiness(),
    employee: currentEmployee(),
    space: activeSpace(),
    employees: state.employees,
    balances: state.balances,
    payments: state.payments,
    worklogs: state.worklogs,
    leaves: state.leaves,
    notes: state.notes,
    activity: state.activity,
    summary: state.summary,
    currency: currencyOf(),
    navigate,
    rerender,
    refresh: refreshAndRender,
    refreshData,
    reloadSpaces
  };

  try {
    cfg.render(root, ctx);
  } catch (err) {
    console.error('[view] render failed', err);
    root.innerHTML = emptyState({
      title: 'Bölmə yüklənmədi',
      message: friendlyError(err),
      iconName: 'i-alert',
      action: '<button class="btn btn--primary" type="button" id="render-retry">Yenidən cəhd et</button>'
    });
    $('#render-retry', root)?.addEventListener('click', () => rerender());
  }
}

export function currencyOf() {
  const b = currentBusiness();
  return (b && b.currency) || 'AZN';
}

/* ------------------------------ DATA ------------------------------------ */

export async function refreshAndRender() {
  await refreshData();
  rerender();
}

export async function refreshData() {
  const space = activeSpace();
  if (!space) return;

  const businessId = space.business.id;

  if (space.type === 'owner') {
    const [employees, balances, payments, worklogs, leaves, notes, activity] = await Promise.all([
      listEmployees(businessId),
      listBalances(businessId),
      listPayments({ businessId, limit: 600 }),
      listWorkLogs({ businessId, limit: 600 }),
      listLeaves({ businessId, limit: 300 }),
      listNotes(businessId),
      listActivity(businessId, 10)
    ]);
    state.employees = employees;
    state.balances = balances;
    state.payments = payments;
    state.worklogs = worklogs;
    state.leaves = leaves;
    state.notes = notes;
    state.activity = activity;
    state.summary = summarize(balances, employees);
  } else {
    const employeeId = space.employee?.id;
    const [balances, payments, worklogs, leaves] = await Promise.all([
      listBalances(null),
      employeeId ? listPayments({ employeeId, limit: 300 }) : Promise.resolve([]),
      employeeId ? listWorkLogs({ employeeId, limit: 200 }) : Promise.resolve([]),
      employeeId ? listLeaves({ employeeId, limit: 100 }) : Promise.resolve([])
    ]);
    state.employees = [];
    state.balances = balances || [];
    state.payments = payments || [];
    state.worklogs = worklogs || [];
    state.leaves = leaves || [];
    state.notes = [];
    state.activity = [];

    // İşçi üçün xülasə yalnız öz kartı üzərindən hesablanır
    const ownCards = space.employee
      ? [{ id: space.employee.id, is_active: true, monthly_salary: space.employee.monthly_salary }]
      : [];
    state.summary = summarize(state.balances, ownCards);
  }

  updateBadges();
}

function updateBadges() {
  const empBadge = $('#nav-employees-badge');
  if (empBadge) {
    const count = state.employees.filter((e) => e.is_active).length;
    empBadge.textContent = String(count);
    empBadge.hidden = count === 0;
  }

  const leaveBadge = $('#nav-leaves-badge');
  if (leaveBadge) {
    const pending = state.leaves.filter((l) => l.status === 'pending').length;
    leaveBadge.textContent = String(pending);
    leaveBadge.hidden = pending === 0;
  }

  const payLabel = $('#nav-payments-label');
  if (payLabel) payLabel.textContent = currentRole() === 'employee' ? 'Maaşım' : 'Ödənişlər';

  const wlLabel = $('#nav-worklog-label');
  if (wlLabel) wlLabel.textContent = currentRole() === 'employee' ? 'İş saatlarım' : 'Davamiyyət';
}

/* --------------------------- WELCOME / NO BIZ --------------------------- */

function renderWelcome() {
  setText('#page-title', 'Xoş gəlmisiniz!');
  setText('#page-subtitle', 'Başlamaq üçün bir seçim edin');

  const root = $('#view-root');
  if (!root) return;

  const name = (state.profile && state.profile.full_name) || 'Dostum';

  root.innerHTML = `
    <section class="card" style="max-width:760px;margin:0 auto">
      <div class="card__body" style="padding:26px 22px">
        <div class="row" style="gap:14px;align-items:flex-start">
          <span class="avatar avatar--lg" aria-hidden="true">${escapeAttr(initialsOf(name))}</span>
          <div style="flex:1 1 240px;min-width:0">
            <h2 style="font-size:19px;letter-spacing:-.03em;font-weight:800">Salam, ${escapeAttr(name)}!</h2>
            <p class="muted" style="font-size:13px;margin-top:4px;line-height:1.7">
              Hesabınız hazırdır. İndi iki yoldan birini seçin:
            </p>
          </div>
        </div>

        <div class="grid grid--2" style="margin-top:22px">
          <article class="card" style="box-shadow:none;background:var(--surface-2)">
            <div class="card__body">
              <div class="stat__icon" style="margin-bottom:10px">${icon('i-building', 18)}</div>
              <h3 style="font-size:15px;font-weight:800;letter-spacing:-.02em">Mən sahibkaram</h3>
              <p class="tiny muted" style="margin-top:4px;line-height:1.65">
                Biznesinizi yaradın, işçiləri əlavə edin və maaş uçotuna başlayın.
              </p>
              <button class="btn btn--primary btn--block" type="button" id="welcome-create-business" style="margin-top:14px">
                ${icon('i-plus', 16)} Biznes yarat
              </button>
            </div>
          </article>

          <article class="card" style="box-shadow:none;background:var(--surface-2)">
            <div class="card__body">
              <div class="stat__icon stat__icon--info" style="margin-bottom:10px">${icon('i-key', 18)}</div>
              <h3 style="font-size:15px;font-weight:800;letter-spacing:-.02em">Mən işçiyəm</h3>
              <p class="tiny muted" style="margin-top:4px;line-height:1.65">
                Sahibkarınızdan aldığınız 8 simvollu kodu daxil edin — kabinetiniz açılacaq.
              </p>
              <button class="btn btn--soft btn--block" type="button" id="welcome-join-code" style="margin-top:14px">
                ${icon('i-key', 16)} Kodu daxil et
              </button>
            </div>
          </article>
        </div>

        <div class="banner" style="margin-top:20px">
          ${icon('i-info', 18)}
          <span>
            <strong>Kod hardan alınır?</strong>
            Sahibkar «İşçilər» bölməsində hər işçinin kartında 8 simvollu kodu görür və sizə verir.
          </span>
        </div>

        <p class="tiny muted center" style="margin-top:16px">
          Hesab: ${escapeAttr((state.user && state.user.email) || '—')}
        </p>
      </div>
    </section>
  `;

  $('#welcome-create-business', root)?.addEventListener('click', () => {
    openBusinessForm({ onSaved: reloadSpaces });
  });

  $('#welcome-join-code', root)?.addEventListener('click', () => {
    openJoinCodeModal({ onDone: reloadSpaces });
  });
}

/* ------------------------------- HELPERS -------------------------------- */

function escapeAttr(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export { VIEWS };

/* ------------------------------- BOOT ----------------------------------- */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
