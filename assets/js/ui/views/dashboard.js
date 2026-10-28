/* ============================================================================
   Hesab — İcmal (dashboard) görünüşü
   ========================================================================== */

import { $, $$, icon, escapeHtml, emptyState } from '../../lib/dom.js';
import { summarize } from '../../lib/store.js';
import {
  money,
  moneyShort,
  moneyCompact,
  dateShort,
  monthShort,
  lastPeriods,
  initials,
  KIND_LABELS,
  periodOf
} from '../../lib/format.js';
import { openPaymentForm, openEmployeeForm } from '../forms.js';

export default function renderDashboard(root, ctx) {
  const { state, employees, balances, payments, currency } = ctx;
  const stats = summarize(balances, employees);

  const activeEmployees = employees.filter((e) => e.is_active);
  const balanceMap = new Map(balances.map((b) => [b.id, b]));

  // Borclu işçilər (ən böyük borc əvvəldə)
  const debtors = activeEmployees
    .map((e) => ({ emp: e, row: balanceMap.get(e.id) }))
    .filter((x) => x.row && Number(x.row.balance) > 0)
    .sort((a, b) => Number(b.row.balance) - Number(a.row.balance))
    .slice(0, 5);

  // Son ödənişlər
  const recent = payments.slice(0, 6);

  // Aylıq dinamika (son 6 ay)
  const periods = lastPeriods(6);
  const monthlyData = periods.map((p) => {
    const rows = payments.filter((x) => periodOf(x.paid_at) === p);
    const salary = rows.filter((x) => x.kind === 'salary').reduce((s, x) => s + Number(x.amount), 0);
    const advance = rows.filter((x) => x.kind === 'advance').reduce((s, x) => s + Number(x.amount), 0);
    const bonus = rows.filter((x) => x.kind === 'bonus').reduce((s, x) => s + Number(x.amount), 0);
    return { period: p, salary, advance, bonus, total: salary + advance + bonus };
  });
  const maxMonthly = Math.max(...monthlyData.map((m) => m.total), 1);

  root.innerHTML = `
    <div class="stack">
      <!-- Salamlama -->
      <section class="row row--between" aria-label="Xülasə">
        <div class="truncate">
          <h2 style="font-size:19px;font-weight:800;letter-spacing:-.03em" class="truncate">
            ${greeting()}, ${escapeHtml(firstName(ctx.state))}
          </h2>
          <p class="muted" style="font-size:13px">
            ${escapeHtml(state.business?.name || 'Biznes')} ·
            ${activeEmployees.length} aktiv işçi ·
            ${dateShort(new Date().toISOString())}
          </p>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn--ghost btn--sm" type="button" data-act="new-employee">
            ${icon('i-plus', 16)} İşçi
          </button>
          <button class="btn btn--primary btn--sm" type="button" data-act="new-payment">
            ${icon('i-wallet', 16)} Ödəniş
          </button>
        </div>
      </section>

      <!-- Statistika kartları -->
      <section class="grid grid--4" aria-label="Əsas göstəricilər">
        ${statCard({
          label: 'Ümumi işçi sayı',
          value: String(stats.employeeCount),
          unit: 'nəfər',
          icon: 'i-users',
          tone: '',
          meta: stats.totalCount > stats.employeeCount
            ? `${stats.totalCount - stats.employeeCount} passiv işçi`
            : 'Bütün işçilər aktiv'
        })}
        ${statCard({
          label: 'Aylıq maaş fondu',
          value: moneyShort(stats.monthlyFund, currency),
          icon: 'i-banknote',
          tone: 'accent',
          meta: 'Aktiv işçilər üzrə cəm'
        })}
        ${statCard({
          label: 'Ödənilmiş maaşlar',
          value: moneyShort(stats.paid, currency),
          icon: 'i-check-circle',
          tone: 'info',
          meta: `Bu ay: ${moneyShort(stats.paidThisMonth, currency)}`
        })}
        ${statCard({
          label: 'Qalıq borc',
          value: moneyShort(stats.balance, currency),
          icon: 'i-trending',
          tone: stats.balance > 0 ? 'warn' : '',
          meta: stats.balance > 0 ? 'Ödənilməli məbləğ' : 'Borç yoxdur'
        })}
      </section>

      <!-- Ödəniş tempi + qrafik -->
      <section class="grid grid--sidebar">
        <article class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Aylıq ödəniş dinamikası</h3>
              <p class="card__sub">Son 6 ay üzrə ödənişlər</p>
            </div>
            <div class="legend">
              <span class="legend__item"><span class="legend__swatch"></span>Maaş</span>
              <span class="legend__item"><span class="legend__swatch legend__swatch--advance"></span>Avans</span>
            </div>
          </header>
          <div class="card__body">
            ${
              monthlyData.every((m) => m.total === 0)
                ? emptyState({
                    title: 'Hələ ödəniş yoxdur',
                    message: 'İlk ödənişi qeyd etdikdən sonra burada aylıq dinamika görünəcək.',
                    iconName: 'i-chart'
                  })
                : `<div class="bars" role="img" aria-label="Son 6 ayın ödəniş qrafiki">
                    ${monthlyData
                      .map((m) => {
                        const h = Math.max(2, (m.total / maxMonthly) * 100);
                        const advShare = m.total > 0 ? (m.advance / m.total) * 100 : 0;
                        return `
                          <div class="bars__col" title="${monthShort(m.period)}: ${money(m.total, currency)}">
                            <div class="bars__stack">
                              <div class="bars__seg" style="height:${Math.max(2, h - (h * advShare) / 100)}%"></div>
                              ${
                                m.advance > 0
                                  ? `<div class="bars__seg bars__seg--advance" style="height:${Math.max(2, (h * advShare) / 100)}%"></div>`
                                  : ''
                              }
                            </div>
                            <span class="bars__label">${monthShort(m.period)}</span>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
            }
          </div>
          <footer class="card__foot row row--between">
            <span>Ümumi ödənilib</span>
            <strong style="font-family:'JetBrains Mono',monospace;color:var(--ink)">
              ${money(stats.paid, currency)}
            </strong>
          </footer>
        </article>

        <article class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Ödəniş tempi</h3>
              <p class="card__sub">Hesablanmış maaşa nisbətən</p>
            </div>
          </header>
          <div class="card__body stack">
            <div class="row row--between" style="align-items:flex-end">
              <div>
                <p class="muted" style="font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Ödənilib</p>
                <p style="font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:600;letter-spacing:-.04em;line-height:1.2">
                  ${stats.payoutRate.toFixed(1)}%
                </p>
              </div>
              <span class="badge ${stats.payoutRate >= 100 ? 'badge--ok' : stats.payoutRate >= 50 ? 'badge--warn' : 'badge--danger'} badge--dot">
                ${stats.payoutRate >= 100 ? 'Tam ödənilib' : stats.payoutRate >= 50 ? 'Qismən' : 'Gecikmə'}
              </span>
            </div>
            <div class="progress progress--lg">
              <div class="progress__bar ${stats.payoutRate >= 100 ? '' : stats.payoutRate >= 50 ? 'progress__bar--warn' : 'progress__bar--danger'}"
                   style="width:${Math.min(100, stats.payoutRate).toFixed(1)}%"></div>
            </div>
            <div class="kv">
              <div class="kv__row">
                <span class="kv__key">Hesablanmış cəm</span>
                <span class="kv__val mono">${money(stats.accrued, currency)}</span>
              </div>
              <div class="kv__row">
                <span class="kv__key">Ödənilmiş</span>
                <span class="kv__val mono">${money(stats.paid, currency)}</span>
              </div>
              <div class="kv__row">
                <span class="kv__key">Avanslar</span>
                <span class="kv__val mono">${money(stats.advance, currency)}</span>
              </div>
              <div class="kv__row">
                <span class="kv__key">Qalıq borc</span>
                <span class="kv__val mono" style="color:${stats.balance > 0 ? 'var(--danger)' : 'var(--accent)'}">
                  ${money(stats.balance, currency)}
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <!-- Borclular + son ödənişlər -->
      <section class="grid grid--sidebar">
        <article class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Ən böyük borclar</h3>
              <p class="card__sub">Ödəniş tələb edən işçilər</p>
            </div>
            <button class="btn btn--ghost btn--xs" type="button" data-act="goto-employees">
              Hamısı ${icon('i-arrow-up-right', 14)}
            </button>
          </header>
          <div class="card__body card__body--flush">
            ${
              debtors.length
                ? `<div class="stack--sm" style="padding:8px 0">
                    ${debtors
                      .map((d) => {
                        const bal = Number(d.row.balance);
                        const acc = Number(d.row.accrued_total) || 1;
                        const pct = Math.min(100, Math.max(0, 100 - (bal / acc) * 100));
                        return `
                          <div class="row" style="padding:9px 18px;gap:12px;flex-wrap:nowrap">
                            <span class="avatar avatar--sm">${escapeHtml(initials(d.emp.full_name))}</span>
                            <div style="min-width:0;flex:1 1 auto">
                              <div class="row row--between" style="gap:10px;flex-wrap:nowrap">
                                <span class="truncate" style="font-size:13.5px;font-weight:650">${escapeHtml(d.emp.full_name)}</span>
                                <span class="nowrap" style="font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:600;color:var(--danger)">
                                  ${money(bal, currency)}
                                </span>
                              </div>
                              <div class="progress" style="height:4px;margin-top:5px">
                                <div class="progress__bar" style="width:${pct.toFixed(1)}%"></div>
                              </div>
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
                : emptyState({
                    title: 'Borclu yoxdur',
                    message: 'Bütün işçilərə hesablanmış maaşlar ödənilib.',
                    iconName: 'i-check-circle'
                  })
            }
          </div>
        </article>

        <article class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Son ödənişlər</h3>
              <p class="card__sub">Ən yeni 6 qeyd</p>
            </div>
            <button class="btn btn--ghost btn--xs" type="button" data-act="goto-payments">
              Hamısı ${icon('i-arrow-up-right', 14)}
            </button>
          </header>
          <div class="card__body card__body--flush">
            ${
              recent.length
                ? `<div class="timeline" style="padding:4px 18px">
                    ${recent
                      .map((p) => {
                        const name = p.employees?.full_name || 'İşçi';
                        const tone = p.kind === 'advance' ? 'advance' : p.kind === 'salary' ? 'payment' : p.kind === 'bonus' ? 'salary' : 'adjust';
                        const sign = p.kind === 'deduction' ? '−' : '+';
                        return `
                          <div class="tl-item">
                            <div class="tl-icon tl-icon--${tone}">${icon(p.kind === 'advance' ? 'i-wallet' : p.kind === 'salary' ? 'i-banknote' : p.kind === 'bonus' ? 'i-trending' : 'i-minus', 16)}</div>
                            <div class="tl-main">
                              <div class="tl-title truncate">${escapeHtml(name)}</div>
                              <div class="tl-meta">${escapeHtml(KIND_LABELS[p.kind] || p.kind)} · ${dateShort(p.paid_at)}</div>
                            </div>
                            <div class="tl-amount ${p.kind === 'deduction' ? 'tl-amount--out' : ''}">
                              ${sign}${moneyShort(p.amount, currency)}
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
                : emptyState({
                    title: 'Ödəniş qeydi yoxdur',
                    message: 'İlk avans və ya maaş ödənişini qeyd edin.',
                    iconName: 'i-receipt',
                    action: `<button class="btn btn--primary btn--sm" type="button" data-act="new-payment">${icon('i-plus', 16)} Ödəniş et</button>`
                  })
            }
          </div>
        </article>
      </section>
    </div>
  `;

  bindActions(root, ctx);
}

/* ------------------------------ HELPERS --------------------------------- */

function statCard({ label, value, unit = '', icon: iconName, tone = '', meta = '' }) {
  return `
    <article class="stat ${tone ? 'stat--' + tone : ''}">
      <div class="stat__top">
        <span class="stat__label">${escapeHtml(label)}</span>
        <span class="stat__icon">${icon(iconName, 17)}</span>
      </div>
      <p class="stat__value">${value}${unit ? `<span style="font-size:12px;font-weight:600;color:var(--muted);margin-left:5px">${escapeHtml(unit)}</span>` : ''}</p>
      <p class="stat__meta"><span>${escapeHtml(meta)}</span></p>
    </article>
  `;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Gecəniz xeyir';
  if (h < 12) return 'Sabahınız xeyir';
  if (h < 18) return 'Günortanız xeyir';
  return 'Axşamınız xeyir';
}

function firstName(state) {
  const p = state.profile;
  const u = state.user;
  const full =
    (p && p.full_name) ||
    (u && u.user_metadata && u.user_metadata.full_name) ||
    '';
  if (!full) return 'sahibkar';
  return String(full).trim().split(/\s+/)[0];
}

function bindActions(root, ctx) {
  $$('[data-act]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'new-payment') {
        openPaymentForm({
          employees: ctx.employees,
          payments: ctx.payments,
          currency: ctx.currency,
          onSaved: ctx.refresh
        });
      } else if (act === 'new-employee') {
        openEmployeeForm({
          businessId: ctx.business.id,
          currency: ctx.currency,
          onSaved: ctx.refresh
        });
      } else if (act === 'goto-employees') {
        ctx.navigate('employees');
      } else if (act === 'goto-payments') {
        ctx.navigate('payments');
      }
    });
  });
}
