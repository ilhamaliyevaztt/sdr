/* ============================================================================
   Hesab — Ödənişlər görünüşü
   ========================================================================== */

import { $, $$, icon, escapeHtml, emptyState, toast } from '../../lib/dom.js';
import { summarize, friendlyError } from '../../lib/store.js';
import {
  money,
  moneyShort,
  dateShort,
  monthLabel,
  periodOf,
  initials,
  KIND_LABELS,
  METHOD_LABELS,
  currentPeriod,
  downloadCsv
} from '../../lib/format.js';
import { openPaymentForm, openPaymentEdit } from '../forms.js';

let activeKind = 'all';
let activePeriod = 'all';
let searchText = '';

export default function renderPayments(root, ctx) {
  const { payments, employees, currency } = ctx;

  const periods = Array.from(new Set(payments.map((p) => periodOf(p.paid_at)))).sort().reverse();

  const filtered = payments.filter((p) => {
    if (activeKind !== 'all' && p.kind !== activeKind) return false;
    if (activePeriod !== 'all' && periodOf(p.paid_at) !== activePeriod) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const name = (p.employees?.full_name || '').toLowerCase();
      const note = (p.note || '').toLowerCase();
      if (!name.includes(q) && !note.includes(q)) return false;
    }
    return true;
  });

  const totals = {
    advance: filtered.filter((p) => p.kind === 'advance').reduce((s, p) => s + Number(p.amount), 0),
    salary: filtered.filter((p) => p.kind === 'salary').reduce((s, p) => s + Number(p.amount), 0),
    bonus: filtered.filter((p) => p.kind === 'bonus').reduce((s, p) => s + Number(p.amount), 0),
    deduction: filtered.filter((p) => p.kind === 'deduction').reduce((s, p) => s + Number(p.amount), 0)
  };
  const netTotal = totals.advance + totals.salary + totals.bonus;

  const kindChips = [
    { key: 'all', label: 'Hamısı' },
    { key: 'salary', label: 'Maaş' },
    { key: 'advance', label: 'Avans' },
    { key: 'bonus', label: 'Mükafat' },
    { key: 'deduction', label: 'Tutulma' }
  ];

  root.innerHTML = `
    <div class="stack">
      <section class="grid grid--4">
        ${mini('Cəm ödəniş', moneyShort(netTotal, currency), 'i-wallet', 'accent')}
        ${mini('Maaş', moneyShort(totals.salary, currency), 'i-banknote', 'info')}
        ${mini('Avans', moneyShort(totals.advance, currency), 'i-receipt', 'warn')}
        ${mini('Tutulma', moneyShort(totals.deduction, currency), 'i-minus', '')}
      </section>

      <section class="card">
        <header class="card__head">
          <div>
            <h3 class="card__title">Ödəniş tarixçəsi</h3>
            <p class="card__sub">${filtered.length} qeyd göstərilir</p>
          </div>
          <div class="toolbar">
            <button class="btn btn--ghost btn--sm" type="button" data-act="export">
              ${icon('i-download', 16)} <span>CSV</span>
            </button>
            <button class="btn btn--primary btn--sm" type="button" data-act="add">
              ${icon('i-plus', 16)} Yeni ödəniş
            </button>
          </div>
        </header>

        <div class="card__body" style="padding-bottom:0">
          <div class="toolbar" style="margin-bottom:12px">
            <label class="search" aria-label="Ödəniş axtar">
              ${icon('i-search', 17)}
              <input type="search" id="pay-search" placeholder="İşçi adı və ya qeyd…" value="${escapeHtml(searchText)}" autocomplete="off" />
            </label>
            <div class="row" style="gap:6px">
              ${kindChips
                .map(
                  (k) =>
                    `<button class="chip${activeKind === k.key ? ' is-active' : ''}" type="button" data-kind="${k.key}">${escapeHtml(k.label)}</button>`
                )
                .join('')}
            </div>
            ${
              periods.length
                ? `<div class="field field--select" style="min-width:150px;flex:0 1 auto">
                    <div class="field__control field--select select-wrap" style="height:36px;border-radius:10px">
                      <select id="pay-period" aria-label="Ay seçimi">
                        <option value="all"${activePeriod === 'all' ? ' selected' : ''}>Bütün aylar</option>
                        ${periods
                          .map(
                            (p) =>
                              `<option value="${p}"${activePeriod === p ? ' selected' : ''}>${monthLabel(p)}</option>`
                          )
                          .join('')}
                      </select>
                    </div>
                  </div>`
                : ''
            }
          </div>
        </div>

        <div class="card__body card__body--flush">
          ${
            !payments.length
              ? emptyState({
                  title: 'Hələ ödəniş yoxdur',
                  message: 'İşçilərə verdiyiniz avans və maaşları burada qeyd edin.',
                  iconName: 'i-receipt',
                  action: `<button class="btn btn--primary btn--sm" type="button" data-act="add">${icon('i-plus', 16)} Ödəniş qeyd et</button>`
                })
              : !filtered.length
                ? emptyState({
                    title: 'Nəticə tapılmadı',
                    message: 'Seçilmiş filtrlərə uyğun ödəniş yoxdur.',
                    iconName: 'i-filter'
                  })
                : `
                  <div class="table-wrap">
                    <table class="data">
                      <thead>
                        <tr>
                          <th scope="col">İşçi</th>
                          <th scope="col">Növ</th>
                          <th scope="col">Tarix</th>
                          <th scope="col">Üsul</th>
                          <th scope="col" style="text-align:right">Məbləğ</th>
                          <th scope="col" style="text-align:right">Əməliyyat</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${filtered
                          .map((p) => {
                            const name = p.employees?.full_name || 'İşçi';
                            const badgeCls =
                              p.kind === 'salary'
                                ? 'badge--ok'
                                : p.kind === 'advance'
                                  ? 'badge--warn'
                                  : p.kind === 'bonus'
                                    ? 'badge--info'
                                    : 'badge--danger';
                            return `
                              <tr>
                                <td>
                                  <div class="person">
                                    <span class="avatar avatar--sm">${escapeHtml(initials(name))}</span>
                                    <span class="person__text">
                                      <span class="person__name">${escapeHtml(name)}</span>
                                      <span class="person__role">${escapeHtml(p.employees?.position || '—')}</span>
                                    </span>
                                  </div>
                                </td>
                                <td data-label="Növ"><span class="badge ${badgeCls}">${escapeHtml(KIND_LABELS[p.kind] || p.kind)}</span></td>
                                <td data-label="Tarix" class="nowrap">${dateShort(p.paid_at)}</td>
                                <td data-label="Üsul" class="nowrap">${escapeHtml(METHOD_LABELS[p.method] || '—')}</td>
                                <td class="num" data-label="Məbləğ" style="${p.kind === 'deduction' ? 'color:var(--danger)' : ''}">
                                  ${p.kind === 'deduction' ? '−' : ''}${moneyShort(p.amount, currency)}
                                </td>
                                <td class="actions">
                                  <div class="row">
                                    <button class="iconbtn iconbtn--sm" type="button" data-edit="${p.id}" aria-label="Redaktə et" title="Redaktə">
                                      ${icon('i-edit', 16)}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `;
                          })
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                `
          }
        </div>
        ${
          filtered.length
            ? `<footer class="card__foot row row--between">
                <span>Göstərilən: ${filtered.length} qeyd</span>
                <strong style="font-family:'JetBrains Mono',monospace">${money(netTotal, currency)}</strong>
              </footer>`
            : ''
        }
      </section>
    </div>
  `;

  // Axtarış
  const search = $('#pay-search', root);
  if (search) {
    search.addEventListener('input', () => {
      searchText = search.value;
      const pos = search.selectionStart;
      renderPayments(root, ctx);
      const next = $('#pay-search', root);
      if (next) {
        next.focus();
        try {
          next.setSelectionRange(pos, pos);
        } catch (_) {
          /* noop */
        }
      }
    });
  }

  // Növ filtri
  $$('[data-kind]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      activeKind = btn.dataset.kind;
      renderPayments(root, ctx);
    });
  });

  // Ay filtri
  const periodSelect = $('#pay-period', root);
  if (periodSelect) {
    periodSelect.addEventListener('change', () => {
      activePeriod = periodSelect.value;
      renderPayments(root, ctx);
    });
  }

  // Əməliyyatlar
  $$('[data-act]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'add') {
        openPaymentForm({
          employees,
          payments,
          currency,
          presetKind: activeKind === 'all' ? 'salary' : activeKind,
          onSaved: ctx.refresh
        });
      }
      if (act === 'export') {
        const header = ['Tarix', 'İşçi', 'Növ', 'Məbləğ', 'Üsul', 'Qeyd'];
        const body = filtered.map((p) => [
          p.paid_at,
          p.employees?.full_name || '',
          KIND_LABELS[p.kind] || p.kind,
          Number(p.amount).toFixed(2),
          METHOD_LABELS[p.method] || '',
          p.note || ''
        ]);
        downloadCsv(`odenisler-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
        toast('CSV faylı yükləndi.', 'ok');
      }
    });
  });

  $$('[data-edit]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const payment = payments.find((p) => p.id === btn.dataset.edit);
      if (!payment) return;
      openPaymentEdit({
        payment,
        employees,
        currency,
        onSaved: ctx.refresh
      });
    });
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
