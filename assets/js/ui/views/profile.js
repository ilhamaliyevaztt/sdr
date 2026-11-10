/* ============================================================================
   RahatHesab — Şəxsi kabinet
   Sahibkar: profil məlumatları + biznes siyahısı
   İşçi:   maaş, ödənişlər, qalıq (yalnız oxuma) + əlaqə məlumatı
   ========================================================================== */

import { icon, escapeHtml, toast, setLoading, downloadFile } from '../../lib/dom.js';
import {
  money, dateShort, dateLong, monthLabel, KIND_LABELS, METHOD_LABELS,
  initials, buildCsv, todayISO, currentPeriod
} from '../../lib/format.js';
import { updateProfile, updateMyContact, changePassword, friendlyError } from '../../lib/store.js';
import { openLeaveForm } from '../forms.js';

export default function renderProfile(root, ctx) {
  if (ctx.role === 'employee') return renderEmployeeProfile(root, ctx);
  return renderOwnerProfile(root, ctx);
}

/* ------------------------------- SAHİBKAR ------------------------------- */

function renderOwnerProfile(root, ctx) {
  const { state, profile, currency, businesses = [], reloadSpaces } = ctx;
  const user = state.user || {};
  const name = (profile && profile.full_name) || (user.user_metadata && user.user_metadata.full_name) || 'İstifadəçi';

  const spaces = state.spaces || [];

  root.innerHTML = `
    <section class="card" style="margin-bottom:14px">
      <div class="card__body">
        <div class="row" style="gap:14px;flex-wrap:nowrap;align-items:flex-start">
          <span class="avatar avatar--lg" aria-hidden="true">${escapeHtml(initials(name))}</span>
          <div style="flex:1 1 auto;min-width:0">
            <h2 style="font-size:18px;font-weight:800;letter-spacing:-.03em">${escapeHtml(name)}</h2>
            <p class="tiny muted" style="margin-top:2px">${escapeHtml(user.email || '—')}</p>
            <div class="row" style="margin-top:8px;gap:6px">
              <span class="badge badge--ok">Sahibkar</span>
              <span class="badge">${spaces.length} məkan</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="grid grid--2">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Məlumatlarım</h3>
            <p class="card__sub">Ad və telefon</p>
          </div>
        </div>
        <div class="card__body">
          <form id="pf-form" style="display:grid;gap:12px" novalidate>
            <div class="field">
              <label for="pf-name">Ad və soyad</label>
              <div class="field__control">
                ${icon('i-user', 18)}
                <input id="pf-name" type="text" value="${escapeHtml(name)}" />
              </div>
            </div>
            <div class="field">
              <label for="pf-phone">Telefon</label>
              <div class="field__control">
                ${icon('i-receipt', 18)}
                <input id="pf-phone" type="tel" value="${escapeHtml((profile && profile.phone) || '')}" placeholder="+994 50 000 00 00" />
              </div>
            </div>
            <p class="form-error" id="pf-err" role="alert" hidden></p>
            <button class="btn btn--primary btn--block btn--sm" type="submit" id="pf-save">Yadda saxla</button>
          </form>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Şifrə dəyiş</h3>
            <p class="card__sub">Təhlükəsizlik</p>
          </div>
        </div>
        <div class="card__body">
          <form id="pw-form" style="display:grid;gap:12px" novalidate>
            <div class="field">
              <label for="pw1">Yeni şifrə</label>
              <div class="field__control">
                ${icon('i-lock', 18)}
                <input id="pw1" type="password" autocomplete="new-password" placeholder="Ən azı 8 simvol" />
              </div>
            </div>
            <div class="field">
              <label for="pw2">Təkrar</label>
              <div class="field__control">
                ${icon('i-shield', 18)}
                <input id="pw2" type="password" autocomplete="new-password" placeholder="Təkrar yazın" />
              </div>
            </div>
            <p class="form-error" id="pw-err" role="alert" hidden></p>
            <button class="btn btn--ghost btn--block btn--sm" type="submit" id="pw-save">Şifrəni dəyiş</button>
          </form>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:14px">
      <div class="card__head">
        <div>
          <h3 class="card__title">Mənim məkanlarım</h3>
          <p class="card__sub">Hansı bizneslərdə iştirak edirsiniz</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        <div class="list">
          ${spaces.map((s, i) => `
            <div class="list-row">
              <span class="avatar avatar--sq" aria-hidden="true">${escapeHtml(initials(s.business.name))}</span>
              <div class="list-row__main">
                <div class="list-row__title">${escapeHtml(s.business.name)}</div>
                <div class="list-row__sub">
                  ${s.type === 'owner' ? 'Sahibkar' : 'İşçi'}
                  ${i === state.activeIndex ? ' · hazırda açıq' : ''}
                </div>
              </div>
              <div class="row-actions">
                <span class="badge ${s.type === 'owner' ? 'badge--ok' : 'badge--info'}">
                  ${s.type === 'owner' ? 'İdarə edir' : 'İşləyir'}
                </span>
              </div>
            </div>
          `).join('') || '<p class="tiny muted" style="padding:16px">Hələ məkan yoxdur.</p>'}
        </div>
      </div>
    </section>
  `;

  const pfForm = root.querySelector('#pf-form');
  pfForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = root.querySelector('#pf-err');
    const btn = root.querySelector('#pf-save');
    errBox.hidden = true;

    const fullName = root.querySelector('#pf-name').value.trim();
    if (fullName.length < 2) {
      errBox.textContent = 'Adınızı tam yazın.';
      errBox.hidden = false;
      return;
    }

    setLoading(btn, true);
    try {
      await updateProfile({ fullName, phone: root.querySelector('#pf-phone').value.trim() });
      toast('Məlumatlar yeniləndi.', 'ok');
      if (typeof reloadSpaces === 'function') await reloadSpaces();
    } catch (err) {
      errBox.textContent = friendlyError(err);
      errBox.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });

  const pwForm = root.querySelector('#pw-form');
  pwForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = root.querySelector('#pw-err');
    const btn = root.querySelector('#pw-save');
    errBox.hidden = true;

    const p1 = root.querySelector('#pw1').value;
    const p2 = root.querySelector('#pw2').value;
    if (p1.length < 8) {
      errBox.textContent = 'Şifrə ən azı 8 simvol olmalıdır.';
      errBox.hidden = false;
      return;
    }
    if (p1 !== p2) {
      errBox.textContent = 'Şifrələr uyğun gəlmir.';
      errBox.hidden = false;
      return;
    }

    setLoading(btn, true);
    try {
      await changePassword(p1);
      pwForm.reset();
      toast('Şifrə dəyişdirildi.', 'ok');
    } catch (err) {
      errBox.textContent = friendlyError(err);
      errBox.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });
}

/* -------------------------------- İŞÇİ ---------------------------------- */

function renderEmployeeProfile(root, ctx) {
  const { employee, balances, payments, currency, business, refresh } = ctx;
  const me = balances.find((b) => b.id === employee?.id) || {};
  const balance = Number(me.balance || 0);
  const rate = Number(me.accrued_total || 0) > 0
    ? Math.min(100, Math.round((Number(me.total_paid || 0) / Number(me.accrued_total)) * 100))
    : 0;

  const thisMonth = currentPeriod();
  const monthPaid = payments
    .filter((p) => (p.period || String(p.paid_at || '').slice(0, 7)) === thisMonth && p.kind !== 'deduction')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  root.innerHTML = `
    <section class="card" style="margin-bottom:14px">
      <div class="card__body">
        <div class="row" style="gap:14px;flex-wrap:nowrap;align-items:flex-start">
          <span class="avatar avatar--lg" aria-hidden="true">${escapeHtml(initials(employee?.full_name || '?'))}</span>
          <div style="flex:1 1 auto;min-width:0">
            <h2 style="font-size:18px;font-weight:800;letter-spacing:-.03em">${escapeHtml(employee?.full_name || '—')}</h2>
            <p class="tiny muted" style="margin-top:2px">
              ${escapeHtml(employee?.position || 'Vəzifə yoxdur')} · ${escapeHtml(business?.name || '—')}
            </p>
            <div class="row" style="margin-top:8px;gap:6px">
              <span class="badge badge--ok">İşçi</span>
              <span class="badge">${dateShort(employee?.hire_date)} tarixindən</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="grid grid--stats" style="margin-bottom:14px">
      <article class="stat stat--brand">
        <div class="stat__top"><span class="stat__label">Aylıq maaş</span><span class="stat__icon">${icon('i-banknote', 16)}</span></div>
        <div class="stat__value stat__value--sm">${money(employee?.monthly_salary || 0, currency)}</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">Bu ay aldım</span><span class="stat__icon stat__icon--info">${icon('i-wallet', 16)}</span></div>
        <div class="stat__value stat__value--sm">${money(monthPaid, currency)}</div>
        <div class="stat__hint">${monthLabel(thisMonth)}</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">Ümumi aldım</span><span class="stat__icon">${icon('i-receipt', 16)}</span></div>
        <div class="stat__value stat__value--sm">${money(me.total_paid || 0, currency)}</div>
      </article>
      <article class="stat ${balance > 0.5 ? 'stat--danger' : ''}">
        <div class="stat__top"><span class="stat__label">Qalıq</span><span class="stat__icon ${balance > 0.5 ? 'stat__icon--danger' : ''}">${icon('i-alert', 16)}</span></div>
        <div class="stat__value stat__value--sm">${money(Math.max(0, balance), currency)}</div>
        <div class="stat__hint">${balance > 0.5 ? 'Ödənilməli məbləğ' : 'Borç yoxdur'}</div>
      </article>
    </div>

    <div class="grid grid--2">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Hesablaşma</h3>
            <p class="card__sub">İşə başladığınızdan bəri</p>
          </div>
        </div>
        <div class="card__body">
          <dl class="kv">
            <div class="kv__row"><dt>İşə qəbul</dt><dd>${dateLong(employee?.hire_date)}</dd></div>
            <div class="kv__row"><dt>İşlənmiş ay</dt><dd>${me.months_count || 1}</dd></div>
            <div class="kv__row"><dt>Hesablanmış</dt><dd>${money(me.accrued_total || 0, currency)}</dd></div>
            <div class="kv__row"><dt>Avanslar</dt><dd>${money(me.total_advance || 0, currency)}</dd></div>
            <div class="kv__row"><dt>Maaş ödənişləri</dt><dd>${money(me.total_salary_paid || 0, currency)}</dd></div>
            <div class="kv__row"><dt>Mükafatlar</dt><dd>${money(me.total_bonus || 0, currency)}</dd></div>
            <div class="kv__row"><dt>Tutulmalar</dt><dd>${money(me.total_deduction || 0, currency)}</dd></div>
          </dl>

          <div style="margin-top:16px">
            <div class="row row--between" style="margin-bottom:6px">
              <span class="tiny muted">Ödəniş tempi</span>
              <strong class="tiny">${rate}%</strong>
            </div>
            <div class="progress ${rate >= 90 ? '' : rate >= 50 ? 'progress--warn' : 'progress--danger'}">
              <span style="width:${Math.max(2, rate)}%"></span>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Əlaqə məlumatım</h3>
            <p class="card__sub">Telefonu siz dəyişə bilərsiniz</p>
          </div>
        </div>
        <div class="card__body">
          <form id="emp-contact-form" style="display:grid;gap:12px" novalidate>
            <div class="field">
              <label for="ec-phone">Telefon</label>
              <div class="field__control">
                ${icon('i-receipt', 18)}
                <input id="ec-phone" type="tel" value="${escapeHtml(employee?.phone || '')}" placeholder="+994 50 000 00 00" />
              </div>
            </div>
            <p class="form-error" id="ec-err" role="alert" hidden></p>
            <button class="btn btn--primary btn--block btn--sm" type="submit" id="ec-save">Yadda saxla</button>
          </form>

          <div class="banner" style="margin-top:14px">
            ${icon('i-shield', 18)}
            <span>
              <strong>Maaşı yalnız sahibkar dəyişə bilər</strong>
              Siz öz əlaqə məlumatınızı yeniləyə bilərsiniz, amma maaş və ödənişlərə toxuna bilməzsiniz.
            </span>
          </div>

          <button class="btn btn--ghost btn--block btn--sm" type="button" id="ec-leave" style="margin-top:12px">
            ${icon('i-calendar', 15)} Məzuniyyət istə
          </button>
          <button class="btn btn--ghost btn--block btn--sm" type="button" id="ec-export" style="margin-top:8px">
            ${icon('i-download', 15)} Ödəniş tarixçəmi yüklə (CSV)
          </button>
        </div>
      </section>
    </div>
  `;

  const form = root.querySelector('#emp-contact-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = root.querySelector('#ec-err');
    const btn = root.querySelector('#ec-save');
    errBox.hidden = true;

    setLoading(btn, true);
    try {
      await updateMyContact(root.querySelector('#ec-phone').value.trim());
      toast('Telefon yeniləndi.', 'ok');
      await refresh();
    } catch (err) {
      errBox.textContent = friendlyError(err);
      errBox.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });

  root.querySelector('#ec-leave')?.addEventListener('click', () => {
    openLeaveForm({ employeeId: employee?.id, onSaved: refresh });
  });

  root.querySelector('#ec-export')?.addEventListener('click', () => {
    const rows = [['Tarix', 'Növ', 'Məbləğ', 'Üsul', 'Qeyd']];
    for (const p of payments) {
      rows.push([p.paid_at, KIND_LABELS[p.kind] || p.kind, p.amount, METHOD_LABELS[p.method] || '', p.note || '']);
    }
    downloadFile(`odenis-tarixcem-${todayISO()}.csv`, buildCsv(rows), 'text/csv;charset=utf-8');
    toast('CSV yükləndi.', 'ok');
  });
}
