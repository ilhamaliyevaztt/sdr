/* ============================================================================
   Hesab — Hesabatlar görünüşü
   ========================================================================== */

import { $, $$, icon, escapeHtml, emptyState, toast } from '../../lib/dom.js';
import { summarize } from '../../lib/store.js';
import {
  money,
  moneyShort,
  moneyCompact,
  monthLabel,
  monthShort,
  periodOf,
  lastPeriods,
  dateShort,
  initials,
  KIND_LABELS,
  downloadCsv
} from '../../lib/format.js';

export default function renderReports(root, ctx) {
  const { employees, balances, payments, currency } = ctx;
  const stats = summarize(balances, employees);

  const periods = lastPeriods(6);
  const monthly = periods.map((p) => {
    const rows = payments.filter((x) => periodOf(x.paid_at) === p);
    const salary = rows.filter((x) => x.kind === 'salary').reduce((s, x) => s + Number(x.amount), 0);
    const advance = rows.filter((x) => x.kind === 'advance').reduce((s, x) => s + Number(x.amount), 0);
    const bonus = rows.filter((x) => x.kind === 'bonus').reduce((s, x) => s + Number(x.amount), 0);
    const deduction = rows.filter((x) => x.kind === 'deduction').reduce((s, x) => s + Number(x.amount), 0);
    return { period: p, salary, advance, bonus, deduction, total: salary + advance + bonus, count: rows.length };
  });

  const maxTotal = Math.max(...monthly.map((m) => m.total), 1);
  const active = employees.filter((e) => e.is_active);
  const balanceMap = new Map(balances.map((b) => [b.id, b]));

  // İşçi üzrə yekun cədvəl
  const perEmployee = active
    .map((e) => {
      const b = balanceMap.get(e.id) || {};
      return {
        emp: e,
        accrued: Number(b.accrued_total || 0),
        paid: Number(b.total_paid || 0),
        balance: Number(b.balance || 0),
        salary: Number(e.monthly_salary || 0)
      };
    })
    .sort((a, b) => b.balance - a.balance);

  // Ay seçimi üzrə detallı hesabat (default: cari ay)
  const months = Array.from(new Set(payments.map((p) => periodOf(p.paid_at)))).sort().reverse();
  const reportPeriod = months[0] || new Date().toISOString().slice(0, 7);
  const reportRows = perEmployee.map((r) => {
    const rows = payments.filter((p) => p.employee_id === r.emp.id && periodOf(p.paid_at) === reportPeriod);
    const paidInMonth = rows.filter((p) => p.kind !== 'deduction').reduce((s, p) => s + Number(p.amount), 0);
    const advInMonth = rows.filter((p) => p.kind === 'advance').reduce((s, p) => s + Number(p.amount), 0);
    return { ...r, paidInMonth, advInMonth };
  });

  root.innerHTML = `
    <div class="stack">
      <section class="grid grid--4">
        ${mini('Aylıq fond', moneyShort(stats.monthlyFund, currency), 'i-banknote', 'accent')}
        ${mini('Hesablanmış cəm', moneyShort(stats.accrued, currency), 'i-chart', '')}
        ${mini('Ödənilmiş', moneyShort(stats.paid, currency), 'i-check-circle', 'info')}
        ${mini('Qalıq borc', moneyShort(stats.balance, currency), 'i-trending', stats.balance > 0 ? 'warn' : '')}
      </section>

      <section class="card">
        <header class="card__head">
          <div>
            <h3 class="card__title">Aylıq ödənişlər</h3>
            <p class="card__sub">Son 6 ay · növlər üzrə bölgü</p>
          </div>
          <div class="legend">
            <span class="legend__item"><span class="legend__swatch"></span>Maaş</span>
            <span class="legend__item"><span class="legend__swatch legend__swatch--advance"></span>Avans</span>
            <span class="legend__item"><span class="legend__swatch legend__swatch--muted"></span>Mükafat</span>
          </div>
        </header>
        <div class="card__body">
          <div class="bars" style="height:170px">
            ${monthly
              .map((m) => {
                const h = (m.total / maxTotal) * 100;
                const salPct = m.total > 0 ? (m.salary / m.total) * 100 : 0;
                const advPct = m.total > 0 ? (m.advance / m.total) * 100 : 0;
                const bonPct = m.total > 0 ? (m.bonus / m.total) * 100 : 0;
                return `
                  <div class="bars__col" title="${monthLabel(m.period)}: ${money(m.total, currency)}">
                    <div class="bars__stack">
                      ${m.bonus > 0 ? `<div class="bars__seg bars__seg--muted" style="height:${Math.max(1, (h * bonPct) / 100)}%"></div>` : ''}
                      ${m.advance > 0 ? `<div class="bars__seg bars__seg--advance" style="height:${Math.max(1, (h * advPct) / 100)}%"></div>` : ''}
                      ${m.salary > 0 ? `<div class="bars__seg" style="height:${Math.max(1, (h * salPct) / 100)}%"></div>` : ''}
                      ${m.total === 0 ? '<div class="bars__seg bars__seg--muted" style="height:2px"></div>' : ''}
                    </div>
                    <span class="bars__label">${monthShort(m.period)}</span>
                  </div>
                `;
              })
              .join('')}
          </div>

          <div class="table-wrap" style="margin-top:18px">
            <table class="data">
              <thead>
                <tr>
                  <th scope="col">Ay</th>
                  <th scope="col" style="text-align:right">Maaş</th>
                  <th scope="col" style="text-align:right">Avans</th>
                  <th scope="col" style="text-align:right">Mükafat</th>
                  <th scope="col" style="text-align:right">Tutulma</th>
                  <th scope="col" style="text-align:right">Cəm</th>
                </tr>
              </thead>
              <tbody>
                ${monthly
                  .map(
                    (m) => `
                      <tr>
                        <td data-label="Ay" style="font-weight:650">${monthLabel(m.period)}</td>
                        <td class="num" data-label="Maaş">${moneyShort(m.salary, currency)}</td>
                        <td class="num" data-label="Avans">${moneyShort(m.advance, currency)}</td>
                        <td class="num" data-label="Mükafat">${moneyShort(m.bonus, currency)}</td>
                        <td class="num" data-label="Tutulma" style="color:var(--danger)">${moneyShort(m.deduction, currency)}</td>
                        <td class="num" data-label="Cəm" style="font-weight:700">${moneyShort(m.total, currency)}</td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="grid grid--sidebar">
        <article class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">İşçi üzrə yekun</h3>
              <p class="card__sub">${reportPeriod ? monthLabel(reportPeriod) : '—'} ayı üzrə</p>
            </div>
            <button class="btn btn--ghost btn--xs" type="button" data-act="export">
              ${icon('i-download', 14)} CSV
            </button>
          </header>
          <div class="card__body card__body--flush">
            ${
              reportRows.length
                ? `<div class="table-wrap">
                    <table class="data">
                      <thead>
                        <tr>
                          <th scope="col">İşçi</th>
                          <th scope="col" style="text-align:right">Aylıq</th>
                          <th scope="col" style="text-align:right">Bu ay ödənilib</th>
                          <th scope="col" style="text-align:right">Ümumi qalıq</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${reportRows
                          .map(
                            (r) => `
                              <tr>
                                <td>
                                  <div class="person">
                                    <span class="avatar avatar--sm">${escapeHtml(initials(r.emp.full_name))}</span>
                                    <span class="person__text">
                                      <span class="person__name">${escapeHtml(r.emp.full_name)}</span>
                                      <span class="person__role">${escapeHtml(r.emp.position || '—')}</span>
                                    </span>
                                  </div>
                                </td>
                                <td class="num" data-label="Aylıq">${moneyShort(r.salary, currency)}</td>
                                <td class="num" data-label="Bu ay ödənilib">${moneyShort(r.paidInMonth, currency)}</td>
                                <td class="num" data-label="Qalıq" style="color:${r.balance > 0 ? 'var(--danger)' : 'var(--ink)'}">
                                  ${moneyShort(r.balance, currency)}
                                </td>
                              </tr>
                            `
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>`
                : emptyState({
                    title: 'Məlumat yoxdur',
                    message: 'Hesabat üçün əvvəlcə aktiv işçi əlavə edin.',
                    iconName: 'i-chart'
                  })
            }
          </div>
        </article>

        <div class="stack">
          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Yekun göstəricilər</h3>
            </header>
            <div class="card__body">
              <div class="kv">
                <div class="kv__row">
                  <span class="kv__key">Aktiv işçi</span>
                  <span class="kv__val">${stats.employeeCount} nəfər</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Aylıq maaş fondu</span>
                  <span class="kv__val mono">${money(stats.monthlyFund, currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Hesablanmış cəm</span>
                  <span class="kv__val mono">${money(stats.accrued, currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Ödənilmiş cəm</span>
                  <span class="kv__val mono">${money(stats.paid, currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Avanslar</span>
                  <span class="kv__val mono">${money(stats.advance, currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key" style="font-weight:700;color:var(--ink)">Qalıq borc</span>
                  <span class="kv__val mono" style="color:${stats.balance > 0 ? 'var(--danger)' : 'var(--accent)'}">
                    ${money(stats.balance, currency)}
                  </span>
                </div>
              </div>
              <div class="progress" style="margin-top:14px">
                <div class="progress__bar ${stats.payoutRate >= 100 ? '' : stats.payoutRate >= 50 ? 'progress__bar--warn' : 'progress__bar--danger'}"
                     style="width:${Math.min(100, stats.payoutRate).toFixed(1)}%"></div>
              </div>
              <p class="muted" style="font-size:12px;margin-top:7px">
                Ödəniş tempi: ${stats.payoutRate.toFixed(1)}%
              </p>
            </div>
          </article>

          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Qeyd</h3>
            </header>
            <div class="card__body">
              <div class="alert alert--info">
                ${icon('i-info', 17)}
                <span>
                  Hesablanmış məbləğ hər işçinin <strong>aylıq maaşı × işə qəbuldan bu yana tam ay sayı</strong>
                  düsturu ilə Supabase görünüşündə avtomatik hesablanır.
                </span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  `;

  $('[data-act="export"]', root)?.addEventListener('click', () => {
    const header = ['İşçi', 'Vəzifə', 'Aylıq maaş', 'Hesablanmış', 'Ödənilib', 'Qalıq'];
    const body = perEmployee.map((r) => [
      r.emp.full_name,
      r.emp.position || '',
      r.salary.toFixed(2),
      r.accrued.toFixed(2),
      r.paid.toFixed(2),
      r.balance.toFixed(2)
    ]);
    downloadCsv(`hesabat-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
    toast('Hesabat CSV kimi yükləndi.', 'ok');
  });
}

function mini(label, value, iconName, tone) {
  return `
    <article class="stat ${tone ? 'stat--' + tone : ''}">
      <div class="stat__top">
        <span class="stat__label">${escapeHtml(label)}</span>
        <span class="stat__icon">${icon(iconName, 17)}</span>
      </div>
      <p class="stat__value" style="font-size:19px">${value}</p>
    </article>
  `;
}
