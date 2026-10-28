/* ============================================================================
   Hesab — Şəxsi kabinet (işçi görünüşü)
   ========================================================================== */

import { $, $$, icon, escapeHtml, emptyState } from '../../lib/dom.js';
import {
  money,
  moneyShort,
  dateShort,
  dateLong,
  monthLabel,
  monthShort,
  periodOf,
  initials,
  KIND_LABELS,
  METHOD_LABELS,
  lastPeriods,
  currentPeriod
} from '../../lib/format.js';

export default function renderProfile(root, ctx) {
  const { state, employee, balances, payments, currency, role } = ctx;

  // Sahibkar üçün də "Şəxsi kabinet" açılır — öz hesab məlumatları göstərilir
  if (role === 'owner') {
    renderOwnerProfile(root, ctx);
    return;
  }

  if (!employee) {
    root.innerHTML = emptyState({
      title: 'İşçi kartı tapılmadı',
      message:
        'Hesabınız hələ biznesin işçi siyahısına bağlanmayıb. Sahibkarınız sizi eyni e-poçt ilə işçi kimi əlavə etdikdə məlumatlar burada görünəcək.',
      iconName: 'i-user'
    });
    return;
  }

  const bal = balances.find((b) => b.id === employee.id) || {};
  const myPayments = payments
    .filter((p) => p.employee_id === employee.id)
    .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));

  const salary = Number(employee.monthly_salary || 0);
  const accrued = Number(bal.accrued_total || 0);
  const paid = Number(bal.total_paid || 0);
  const balance = Number(bal.balance || 0);
  const paidThisMonth = Number(bal.paid_this_month || 0);
  const months = Number(bal.months_count || 1);
  const advance = Number(bal.total_advance || 0);

  const progressPct = accrued > 0 ? Math.min(100, (paid / accrued) * 100) : 0;

  const periods = lastPeriods(6);
  const monthly = periods.map((p) => {
    const rows = myPayments.filter((x) => periodOf(x.paid_at) === p && x.kind !== 'deduction');
    return { period: p, total: rows.reduce((s, x) => s + Number(x.amount), 0) };
  });
  const maxMonthly = Math.max(...monthly.map((m) => m.total), 1);

  root.innerHTML = `
    <div class="stack">
      <!-- Başlıq -->
      <section class="card">
        <div class="card__body">
          <div class="detail-hero">
            <span class="avatar avatar--lg">${escapeHtml(initials(employee.full_name))}</span>
            <div class="detail-hero__text">
              <h2>${escapeHtml(employee.full_name)}</h2>
              <p>${escapeHtml(employee.position || 'Vəzifə göstərilməyib')}</p>
              <div class="row" style="margin-top:8px;gap:6px">
                <span class="badge badge--ok badge--dot">${employee.is_active ? 'Aktiv işçi' : 'Passiv'}</span>
                <span class="badge badge--muted">İşə qəbul: ${dateShort(employee.hire_date)}</span>
                <span class="badge badge--info">${months} ay hesablanıb</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Əsas rəqəmlər -->
      <section class="grid grid--4">
        ${card('Aylıq maaş', money(salary, currency), 'i-banknote', 'accent', 'Müqavilə üzrə')}
        ${card('Hesablanmış cəm', money(accrued, currency), 'i-chart', '', `${months} ay üzrə`)}
        ${card('Alınan pul', money(paid, currency), 'i-check-circle', 'info', `Bu ay: ${moneyShort(paidThisMonth, currency)}`)}
        ${card('Qalıq məbləğ', money(balance, currency), 'i-wallet', balance > 0 ? 'warn' : '', balance > 0 ? 'Ödənilməli' : 'Borç yoxdur')}
      </section>

      <!-- Ödəniş tempi -->
      <section class="grid grid--sidebar">
        <article class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Hesablaşma tarixçəsi</h3>
              <p class="card__sub">${myPayments.length} əməliyyat</p>
            </div>
          </header>
          <div class="card__body card__body--flush">
            ${
              myPayments.length
                ? `<div class="timeline" style="padding:4px 18px">
                    ${myPayments
                      .map((p) => {
                        const tone =
                          p.kind === 'advance' ? 'advance' : p.kind === 'salary' ? 'payment' : p.kind === 'bonus' ? 'salary' : 'adjust';
                        const ic =
                          p.kind === 'advance'
                            ? 'i-wallet'
                            : p.kind === 'salary'
                              ? 'i-banknote'
                              : p.kind === 'bonus'
                                ? 'i-trending'
                                : 'i-minus';
                        return `
                          <div class="tl-item">
                            <div class="tl-icon tl-icon--${tone}">${icon(ic, 16)}</div>
                            <div class="tl-main">
                              <div class="tl-title">${escapeHtml(KIND_LABELS[p.kind] || p.kind)}</div>
                              <div class="tl-meta">
                                ${dateLong(p.paid_at)}
                                ${p.method ? ' · ' + escapeHtml(METHOD_LABELS[p.method] || p.method) : ''}
                                ${p.note ? ' · ' + escapeHtml(p.note) : ''}
                              </div>
                            </div>
                            <div class="tl-amount ${p.kind === 'deduction' ? 'tl-amount--out' : 'tl-amount--in'}">
                              ${p.kind === 'deduction' ? '−' : '+'}${moneyShort(p.amount, currency)}
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
                : emptyState({
                    title: 'Hələ ödəniş yoxdur',
                    message: 'Sahibkarınız ödəniş qeyd etdikdə burada görünəcək.',
                    iconName: 'i-receipt'
                  })
            }
          </div>
        </article>

        <div class="stack">
          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Ödəniş tempi</h3>
            </header>
            <div class="card__body">
              <div class="row row--between" style="align-items:flex-end;margin-bottom:10px">
                <span class="muted" style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Ödənilib</span>
                <strong style="font-family:'JetBrains Mono',monospace;font-size:20px;letter-spacing:-.03em">
                  ${progressPct.toFixed(0)}%
                </strong>
              </div>
              <div class="progress progress--lg">
                <div class="progress__bar ${progressPct >= 100 ? '' : progressPct >= 50 ? 'progress__bar--warn' : 'progress__bar--danger'}"
                     style="width:${progressPct.toFixed(1)}%"></div>
              </div>
              <div class="kv" style="margin-top:12px">
                <div class="kv__row">
                  <span class="kv__key">Hesablanmış</span>
                  <span class="kv__val mono">${money(accrued, currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Avanslar</span>
                  <span class="kv__val mono">${money(advance, currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Ödənilmiş</span>
                  <span class="kv__val mono">${money(paid, currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key" style="font-weight:700;color:var(--ink)">Qalıq</span>
                  <span class="kv__val mono" style="color:${balance > 0 ? 'var(--danger)' : 'var(--accent)'}">
                    ${money(balance, currency)}
                  </span>
                </div>
              </div>
            </div>
          </article>

          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Aylıq ödənişlər</h3>
            </header>
            <div class="card__body">
              <div class="bars" style="height:118px">
                ${monthly
                  .map((m) => {
                    const h = Math.max(2, (m.total / maxMonthly) * 100);
                    return `
                      <div class="bars__col" title="${monthLabel(m.period)}: ${money(m.total, currency)}">
                        <div class="bars__stack"><div class="bars__seg" style="height:${h}%"></div></div>
                        <span class="bars__label">${monthShort(m.period)}</span>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          </article>

          ${
            employee.notes
              ? `<article class="card">
                  <header class="card__head"><h3 class="card__title">Qeyd</h3></header>
                  <div class="card__body">
                    <p style="font-size:13px;line-height:1.65;color:var(--ink-2);overflow-wrap:anywhere">${escapeHtml(employee.notes)}</p>
                  </div>
                </article>`
              : ''
          }
        </div>
      </section>

      <section class="alert alert--soft" style="align-items:center">
        ${icon('i-shield', 18)}
        <span style="font-size:12.5px">
          Bu kabinetdə yalnız sizə aid məlumatlar göstərilir. Digər işçilərin maaşları
          və biznesin ümumi maliyyə göstəriciləri sizin üçün əlçatan deyil
          (Supabase Row Level Security).
        </span>
      </section>
    </div>
  `;
}

/* --------------------------- SAHİBKAR KABİNETİ --------------------------- */

function renderOwnerProfile(root, ctx) {
  const { state, business } = ctx;
  const user = state.user;
  const profile = state.profile || {};

  root.innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="card__body">
          <div class="detail-hero">
            <span class="avatar avatar--lg">${escapeHtml(initials(profile.full_name || user?.email || 'S'))}</span>
            <div class="detail-hero__text">
              <h2>${escapeHtml(profile.full_name || 'Sahibkar')}</h2>
              <p>${escapeHtml(user?.email || '')}</p>
              <div class="row" style="margin-top:8px;gap:6px">
                <span class="badge badge--ok badge--dot">Sahibkar</span>
                <span class="badge badge--muted">${escapeHtml(business?.name || 'Biznes')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="grid grid--2">
        <article class="card">
          <header class="card__head">
            <h3 class="card__title">Hesab məlumatları</h3>
          </header>
          <div class="card__body">
            <div class="kv">
              <div class="kv__row"><span class="kv__key">Ad və soyad</span><span class="kv__val">${escapeHtml(profile.full_name || '—')}</span></div>
              <div class="kv__row"><span class="kv__key">E-poçt</span><span class="kv__val">${escapeHtml(user?.email || '—')}</span></div>
              <div class="kv__row"><span class="kv__key">Rol</span><span class="kv__val">Biznes sahibi</span></div>
              <div class="kv__row"><span class="kv__key">Biznes</span><span class="kv__val">${escapeHtml(business?.name || '—')}</span></div>
            </div>
          </div>
          <footer class="card__foot">
            <button class="btn btn--ghost btn--sm" type="button" data-act="goto-settings">
              ${icon('i-settings', 15)} Tənzimləmələrə keç
            </button>
          </footer>
        </article>

        <article class="card">
          <header class="card__head">
            <h3 class="card__title">Necə işləyir</h3>
          </header>
          <div class="card__body stack--sm">
            <div class="alert alert--info">
              ${icon('i-users', 17)}
              <span>İşçilər bölməsindən işçi əlavə edin və e-poçtlarını qeyd edin.</span>
            </div>
            <div class="alert alert--info">
              ${icon('i-link', 17)}
              <span>İşçi həmin e-poçtla qeydiyyatdan keçdikdə avtomatik olaraq öz kabinetinə bağlanır.</span>
            </div>
            <div class="alert alert--soft">
              ${icon('i-shield', 17)}
              <span>İşçilər yalnız öz maaş və ödəniş məlumatlarını görür.</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  `;

  $('[data-act="goto-settings"]', root)?.addEventListener('click', () => ctx.navigate('settings'));
}

/* ------------------------------- HELPERS -------------------------------- */

function card(label, value, iconName, tone, meta) {
  return `
    <article class="stat ${tone ? 'stat--' + tone : ''}">
      <div class="stat__top">
        <span class="stat__label">${escapeHtml(label)}</span>
        <span class="stat__icon">${icon(iconName, 17)}</span>
      </div>
      <p class="stat__value">${value}</p>
      <p class="stat__meta"><span>${escapeHtml(meta || '')}</span></p>
    </article>
  `;
}
