/* ============================================================================
   RahatHesab — Hesabatlar
   ========================================================================== */

import { icon, emptyState, escapeHtml, downloadFile } from '../../lib/dom.js';
import {
  money, moneyCompact, monthLabel, lastPeriods, currentPeriod, dateShort,
  KIND_LABELS, METHOD_LABELS, buildCsv, todayISO, initials, toNumber
} from '../../lib/format.js';

let rangeMonths = 6;

export default function renderReports(root, ctx) {
  const { payments, employees, balances, currency, worklogs, summary } = ctx;
  const s = summary || {};

  const periods = lastPeriods(rangeMonths);

  const byMonth = new Map();
  for (const p of payments) {
    const key = p.period || String(p.paid_at || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!byMonth.has(key)) byMonth.set(key, { paid: 0, advance: 0, salary: 0, bonus: 0, deduction: 0, count: 0 });
    const row = byMonth.get(key);
    const amount = Number(p.amount || 0);
    row.count += 1;
    if (p.kind === 'deduction') row.deduction += amount;
    else row.paid += amount;
    if (row[p.kind] !== undefined) row[p.kind] += amount;
  }

  const monthValues = periods.map((p) => byMonth.get(p) || { paid: 0, advance: 0, salary: 0, bonus: 0, deduction: 0, count: 0 });
  const maxVal = Math.max(1, ...monthValues.map((m) => m.paid + m.deduction));
  const totalInRange = monthValues.reduce((a, m) => a + m.paid, 0);
  const avgMonth = totalInRange / Math.max(1, periods.length);

  const last = monthValues[monthValues.length - 1] || { paid: 0 };
  const prev = monthValues[monthValues.length - 2] || { paid: 0 };
  const trend = prev.paid > 0 ? ((last.paid - prev.paid) / prev.paid) * 100 : 0;

  // İşçi üzrə yekun
  const perEmployee = new Map();
  for (const b of balances || []) {
    perEmployee.set(b.id, {
      name: b.full_name,
      position: b.position,
      salary: Number(b.monthly_salary || 0),
      accrued: Number(b.accrued_total || 0),
      paid: Number(b.total_paid || 0),
      balance: Number(b.balance || 0),
      active: !!b.is_active,
      months: b.months_count || 1
    });
  }
  const empRows = [...perEmployee.values()].sort((a, b) => b.balance - a.balance);

  // Üsul üzrə bölgü
  const byMethod = new Map();
  for (const p of payments) {
    if (p.kind === 'deduction') continue;
    const key = p.method || 'other';
    byMethod.set(key, (byMethod.get(key) || 0) + Number(p.amount || 0));
  }
  const methodTotal = [...byMethod.values()].reduce((a, b) => a + b, 0) || 1;

  // Növ üzrə bölgü
  const byKind = new Map();
  for (const p of payments) {
    byKind.set(p.kind, (byKind.get(p.kind) || 0) + Number(p.amount || 0));
  }

  // Davamiyyət cəmi
  const workTotal = (worklogs || []).reduce((a, w) => a + Number(w.hours || 0) + Number(w.overtime || 0), 0);

  root.innerHTML = `
    <div class="toolbar">
      <div class="tabs" style="margin:0;flex:1 1 auto">
        ${[3, 6, 12].map((m) => `
          <button class="tabs__btn ${rangeMonths === m ? 'is-active' : ''}" type="button" data-range="${m}">${m} ay</button>
        `).join('')}
      </div>
      <button class="btn btn--ghost btn--sm" type="button" id="rep-export">${icon('i-download', 15)} CSV</button>
      <button class="btn btn--ghost btn--sm" type="button" id="rep-print">${icon('i-print', 15)} Çap</button>
    </div>

    <div class="grid grid--stats" style="margin-bottom:14px">
      <article class="stat stat--brand">
        <div class="stat__top"><span class="stat__label">Dövr üzrə cəm</span><span class="stat__icon">${icon('i-banknote', 16)}</span></div>
        <div class="stat__value stat__value--sm">${moneyCompact(totalInRange, currency)}</div>
        <div class="stat__hint">Son ${rangeMonths} ay</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">Aylıq orta</span><span class="stat__icon stat__icon--info">${icon('i-chart', 16)}</span></div>
        <div class="stat__value stat__value--sm">${moneyCompact(avgMonth, currency)}</div>
        <div class="stat__hint">Orta ödəniş</div>
      </article>
      <article class="stat ${trend < 0 ? 'stat--danger' : ''}">
        <div class="stat__top"><span class="stat__label">Keçən aya nisbətən</span><span class="stat__icon ${trend < 0 ? 'stat__icon--danger' : ''}">${icon('i-trending', 16)}</span></div>
        <div class="stat__value stat__value--sm">${trend > 0 ? '+' : ''}${Math.round(trend)}%</div>
        <div class="stat__hint">${monthLabel(periods[periods.length - 1])} vs ${monthLabel(periods[periods.length - 2])}</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">İş saatı</span><span class="stat__icon">${icon('i-clock', 16)}</span></div>
        <div class="stat__value stat__value--sm">${workTotal}</div>
        <div class="stat__hint">Bütün qeydlər üzrə</div>
      </article>
    </div>

    <div class="grid grid--main" style="margin-bottom:14px">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Aylıq ödəniş dinamikası</h3>
            <p class="card__sub">Son ${rangeMonths} ay</p>
          </div>
        </div>
        <div class="card__body">
          <div class="bars" style="height:190px">
            ${periods.map((p, i) => {
              const m = monthValues[i];
              const h = Math.max(3, Math.round((m.paid / maxVal) * 150));
              return `
                <div class="bars__item" title="${monthLabel(p)}: ${money(m.paid, currency)}">
                  <span class="bars__value">${m.paid > 0 ? moneyCompact(m.paid, currency) : '—'}</span>
                  <div class="bars__bar ${m.paid > 0 ? '' : 'bars__bar--soft'}" style="height:${h}px"></div>
                  <span class="bars__label">${p.slice(5)}/${p.slice(2, 4)}</span>
                </div>
              `;
            }).join('')}
          </div>
          <div class="legend" style="margin-top:14px">
            <span><i></i> Ödənilən məbləğ</span>
            <span><i class="soft"></i> Qeyd olmayan ay</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Növlər və üsullar</h3>
            <p class="card__sub">Pul necə ödənilib</p>
          </div>
        </div>
        <div class="card__body">
          <div class="kv">
            ${Object.keys(KIND_LABELS).map((k) => {
              const v = byKind.get(k) || 0;
              if (!v) return '';
              return `<div class="kv__row"><dt>${KIND_LABELS[k]}</dt><dd>${money(v, currency)}</dd></div>`;
            }).join('') || '<p class="tiny muted">Hələ ödəniş yoxdur.</p>'}
          </div>

          <div style="margin-top:18px;display:grid;gap:10px">
            ${[...byMethod.entries()].map(([m, v]) => `
              <div>
                <div class="row row--between" style="margin-bottom:4px">
                  <span class="tiny" style="font-weight:700">${escapeHtml(METHOD_LABELS[m] || m)}</span>
                  <span class="tiny muted">${money(v, currency)}</span>
                </div>
                <div class="progress"><span style="width:${Math.round((v / methodTotal) * 100)}%"></span></div>
              </div>
            `).join('') || ''}
          </div>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">İşçilər üzrə yekun</h3>
          <p class="card__sub">Bütün dövr ərzində</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        ${empRows.length ? `
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>İşçi</th>
                  <th class="num">Aylıq maaş</th>
                  <th class="num">Hesablanmış</th>
                  <th class="num">Ödənilib</th>
                  <th class="num">Qalıq</th>
                  <th class="num">Ödəniş %</th>
                </tr>
              </thead>
              <tbody>
                ${empRows.map((r) => {
                  const pct = r.accrued > 0 ? Math.min(100, Math.round((r.paid / r.accrued) * 100)) : 0;
                  return `
                    <tr style="${r.active ? '' : 'opacity:.6'}">
                      <td>
                        <div class="cell-name">
                          <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(r.name))}</span>
                          <span>
                            <strong>${escapeHtml(r.name)}</strong>
                            <small>${escapeHtml(r.position || '—')}${r.active ? '' : ' · passiv'}</small>
                          </span>
                        </div>
                      </td>
                      <td class="num">${money(r.salary, currency)}</td>
                      <td class="num">${money(r.accrued, currency)}</td>
                      <td class="num">${money(r.paid, currency)}</td>
                      <td class="num" style="${r.balance > 0.5 ? 'color:var(--danger);font-weight:800' : ''}">${money(r.balance, currency)}</td>
                      <td class="num">${pct}%</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : emptyState({
          title: 'Məlumat yoxdur',
          message: 'İşçi əlavə etdikdən sonra hesabatlar burada görünəcək.',
          iconName: 'i-chart'
        })}
      </div>
    </section>
  `;

  root.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => {
      rangeMonths = Number(b.dataset.range);
      renderReports(root, ctx);
    });
  });

  root.querySelector('#rep-export')?.addEventListener('click', () => {
    const rows = [['Ay', 'Ödənilib', 'Avans', 'Maaş', 'Mükafat', 'Tutulma', 'Qeyd sayı']];
    periods.forEach((p, i) => {
      const m = monthValues[i];
      rows.push([monthLabel(p), m.paid, m.advance, m.salary, m.bonus, m.deduction, m.count]);
    });
    rows.push([]);
    rows.push(['İşçi', 'Aylıq maaş', 'Hesablanmış', 'Ödənilib', 'Qalıq']);
    for (const r of empRows) rows.push([r.name, r.salary, r.accrued, r.paid, r.balance]);

    downloadFile(`hesabat-${todayISO()}.csv`, buildCsv(rows), 'text/csv;charset=utf-8');
    import('../lib/dom.js').then((m) => m.toast('Hesabat yükləndi.', 'ok'));
  });

  root.querySelector('#rep-print')?.addEventListener('click', () => window.print());
}
