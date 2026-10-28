/* ============================================================================
   Hesab — Tənzimləmələr görünüşü (yalnız sahibkar)
   ========================================================================== */

import { $, $$, icon, escapeHtml, toast, setLoading, showError, confirmDialog } from '../../lib/dom.js';
import {
  updateProfile,
  changePassword,
  friendlyError,
  updateBusiness
} from '../../lib/store.js';
import { money, dateShort, downloadCsv, initials, KIND_LABELS, METHOD_LABELS } from '../../lib/format.js';
import { openBusinessForm } from '../forms.js';

export default function renderSettings(root, ctx) {
  const { business, state, employees, balances, payments, currency } = ctx;
  const user = state.user;
  const profile = state.profile || {};

  root.innerHTML = `
    <div class="stack">
      <section class="grid grid--sidebar">
        <div class="stack">
          <!-- Biznes profili -->
          <article class="card">
            <header class="card__head">
              <div class="row" style="gap:12px;flex-wrap:nowrap;min-width:0">
                <span class="avatar">${escapeHtml(initials(business?.name || 'B'))}</span>
                <div style="min-width:0">
                  <h3 class="card__title truncate">${escapeHtml(business?.name || 'Biznes')}</h3>
                  <p class="card__sub truncate">${escapeHtml(business?.legal_name || 'Hüquqi ad göstərilməyib')}</p>
                </div>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" data-act="edit-business">
                ${icon('i-edit', 15)} Redaktə
              </button>
            </header>
            <div class="card__body">
              <div class="kv">
                <div class="kv__row">
                  <span class="kv__key">Valyuta</span>
                  <span class="kv__val">${escapeHtml(business?.currency || 'AZN')}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Telefon</span>
                  <span class="kv__val">${escapeHtml(business?.phone || '—')}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">E-poçt</span>
                  <span class="kv__val">${escapeHtml(business?.email || '—')}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Ünvan</span>
                  <span class="kv__val">${escapeHtml(business?.address || '—')}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Yaradılma tarixi</span>
                  <span class="kv__val">${business?.created_at ? dateShort(business.created_at) : '—'}</span>
                </div>
              </div>
            </div>
          </article>

          <!-- Hesab -->
          <article class="card">
            <header class="card__head">
              <div>
                <h3 class="card__title">Hesab məlumatları</h3>
                <p class="card__sub">Ad, e-poçt və şifrə</p>
              </div>
            </header>
            <div class="card__body stack">
              <form id="profile-form" class="form-grid" novalidate>
                <div class="field span-2">
                  <label for="set-name">Ad və soyad</label>
                  <div class="field__control">
                    ${icon('i-user', 18)}
                    <input id="set-name" type="text" value="${escapeHtml(profile.full_name || '')}" placeholder="Ad və soyad" />
                  </div>
                </div>
                <div class="field span-2">
                  <label for="set-email">E-poçt</label>
                  <div class="field__control">
                    ${icon('i-mail', 18)}
                    <input id="set-email" type="email" value="${escapeHtml(user?.email || '')}" disabled />
                  </div>
                  <p class="field__hint">E-poçt ünvanı Supabase Authentication-da idarə olunur.</p>
                </div>
                <p class="form-error span-2" id="profile-err" role="alert" hidden></p>
                <div class="span-2">
                  <button class="btn btn--primary btn--sm" type="submit" id="profile-save">Yadda saxla</button>
                </div>
              </form>

              <div class="divider"></div>

              <form id="pw-form" class="form-grid" novalidate>
                <div class="field span-2">
                  <label for="set-pw">Yeni şifrə</label>
                  <div class="field__control">
                    ${icon('i-lock', 18)}
                    <input id="set-pw" type="password" autocomplete="new-password" placeholder="Ən azı 8 simvol" />
                  </div>
                </div>
                <div class="field span-2">
                  <label for="set-pw2">Yeni şifrənin təkrarı</label>
                  <div class="field__control">
                    ${icon('i-shield', 18)}
                    <input id="set-pw2" type="password" autocomplete="new-password" placeholder="Təkrar yazın" />
                  </div>
                </div>
                <p class="form-error span-2" id="pw-err" role="alert" hidden></p>
                <div class="span-2">
                  <button class="btn btn--ghost btn--sm" type="submit" id="pw-save">Şifrəni dəyiş</button>
                </div>
              </form>
            </div>
          </article>
        </div>

        <div class="stack">
          <!-- Statistika -->
          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Məlumat xülasəsi</h3>
            </header>
            <div class="card__body">
              <div class="kv">
                <div class="kv__row">
                  <span class="kv__key">İşçi qeydləri</span>
                  <span class="kv__val">${employees.length}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Ödəniş qeydləri</span>
                  <span class="kv__val">${payments.length}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Balans sətirləri</span>
                  <span class="kv__val">${balances.length}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Baza</span>
                  <span class="kv__val">Supabase PostgreSQL</span>
                </div>
              </div>
              <div class="row" style="margin-top:14px;gap:8px">
                <button class="btn btn--ghost btn--sm" type="button" data-act="export-employees">
                  ${icon('i-download', 15)} İşçilər
                </button>
                <button class="btn btn--ghost btn--sm" type="button" data-act="export-payments">
                  ${icon('i-download', 15)} Ödənişlər
                </button>
              </div>
            </div>
          </article>

          <!-- Təhlükəsizlik -->
          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Təhlükəsizlik</h3>
            </header>
            <div class="card__body stack--sm">
              <div class="alert alert--info">
                ${icon('i-shield', 17)}
                <span>
                  Bütün məlumatlar <strong>Row Level Security</strong> ilə qorunur.
                  Siz yalnız öz biznesinizin məlumatlarını görürsünüz.
                </span>
              </div>
              <div class="alert alert--soft">
                ${icon('i-key', 17)}
                <span>API açarları frontend-də yalnız <strong>anon key</strong> ilə işləyir; service_role açarı heç vaxt istifadə olunmur.</span>
              </div>
            </div>
          </article>

          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Sessiya</h3>
            </header>
            <div class="card__body">
              <p class="muted" style="font-size:13px;margin-bottom:12px">
                Hesabdan çıxdıqdan sonra məlumatlara giriş üçün yenidən daxil olmalısınız.
              </p>
              <button class="btn btn--danger btn--sm" type="button" data-act="logout">
                ${icon('i-logout', 15)} Hesabdan çıx
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  `;

  /* ------------------------------ ACTIONS ------------------------------- */

  $('[data-act="edit-business"]', root)?.addEventListener('click', () => {
    openBusinessForm({
      business,
      onSaved: ctx.refresh
    });
  });

  $('[data-act="logout"]', root)?.addEventListener('click', () => {
    $('#logout-btn')?.click();
  });

  $('[data-act="export-employees"]', root)?.addEventListener('click', () => {
    const header = ['Ad', 'Vəzifə', 'Aylıq maaş', 'E-poçt', 'Telefon', 'İşə qəbul', 'Status'];
    const body = employees.map((e) => [
      e.full_name,
      e.position || '',
      Number(e.monthly_salary || 0).toFixed(2),
      e.email || '',
      e.phone || '',
      e.hire_date || '',
      e.is_active ? 'Aktiv' : 'Passiv'
    ]);
    downloadCsv(`isci-siyahisi-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
    toast('İşçi siyahısı yükləndi.', 'ok');
  });

  $('[data-act="export-payments"]', root)?.addEventListener('click', () => {
    const header = ['Tarix', 'İşçi', 'Növ', 'Məbləğ', 'Üsul', 'Qeyd'];
    const body = payments.map((p) => [
      p.paid_at,
      p.employees?.full_name || '',
      KIND_LABELS[p.kind] || p.kind,
      Number(p.amount).toFixed(2),
      METHOD_LABELS[p.method] || '',
      p.note || ''
    ]);
    downloadCsv(`odenisler-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
    toast('Ödəniş tarixçəsi yükləndi.', 'ok');
  });

  /* ---------------------------- PROFIL FORMU ---------------------------- */

  const profileForm = $('#profile-form', root);
  profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = $('#profile-save', root);
    const err = $('#profile-err', root);
    showError(err, '');

    const name = $('#set-name', root).value.trim();
    if (name.length < 2) return showError(err, 'Ad və soyadınızı tam yazın.');

    setLoading(btn, true);
    try {
      await updateProfile(name);
      if (state.profile) state.profile.full_name = name;
      const label = $('#user-name');
      if (label) label.textContent = name;
      toast('Profil yeniləndi.', 'ok');
    } catch (e) {
      console.error('[settings] profile update failed', e);
      showError(err, friendlyError(e));
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---------------------------- ŞİFRƏ FORMU ----------------------------- */

  const pwForm = $('#pw-form', root);
  pwForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = $('#pw-save', root);
    const err = $('#pw-err', root);
    showError(err, '');

    const pw1 = $('#set-pw', root).value;
    const pw2 = $('#set-pw2', root).value;

    if (pw1.length < 8) return showError(err, 'Şifrə ən azı 8 simvol olmalıdır.');
    if (pw1 !== pw2) return showError(err, 'Şifrələr uyğun gəlmir.');

    setLoading(btn, true);
    try {
      await changePassword(pw1);
      pwForm.reset();
      toast('Şifrə dəyişdirildi.', 'ok');
    } catch (e) {
      console.error('[settings] password change failed', e);
      showError(err, friendlyError(e));
    } finally {
      setLoading(btn, false);
    }
  });
}
