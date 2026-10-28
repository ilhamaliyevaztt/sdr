/* ============================================================================
   Hesab — İşçilər görünüşü və işçi kartı
   ========================================================================== */

import { $, $$, icon, escapeHtml, emptyState, toast, confirmDialog } from '../../lib/dom.js';
import { setEmployeeActive, friendlyError, summarize } from '../../lib/store.js';
import {
  money,
  moneyShort,
  dateShort,
  dateLong,
  initials,
  KIND_LABELS,
  monthLabel,
  periodOf,
  downloadCsv
} from '../../lib/format.js';
import { openEmployeeForm, openPaymentForm, openPaymentEdit, confirmDeleteEmployee } from '../forms.js';

let filterText = '';
let sortKey = 'name';

/* ------------------------------- SİYAHI --------------------------------- */

export default function renderEmployees(root, ctx) {
  const { employees, balances, currency } = ctx;
  const balanceMap = new Map(balances.map((b) => [b.id, b]));

  const rows = employees.map((e) => ({
    emp: e,
    bal: balanceMap.get(e.id) || null
  }));

  const filtered = applyFilters(rows, filterText);
  const stats = summarize(balances, employees);

  root.innerHTML = `
    <div class="stack">
      <section class="grid grid--4">
        ${miniStat('Aktiv işçi', String(stats.employeeCount), 'i-users')}
        ${miniStat('Aylıq fond', moneyShort(stats.monthlyFund, currency), 'i-banknote')}
        ${miniStat('Ödənilib', moneyShort(stats.paid, currency), 'i-check-circle')}
        ${miniStat('Qalıq borc', moneyShort(stats.balance, currency), 'i-trending')}
      </section>

      <section class="card">
        <header class="card__head">
          <div>
            <h3 class="card__title">İşçi heyəti</h3>
            <p class="card__sub">${employees.length} qeyd · ${stats.employeeCount} aktiv</p>
          </div>
          <div class="toolbar">
            <label class="search" aria-label="İşçi axtar">
              ${icon('i-search', 17)}
              <input type="search" id="emp-search" placeholder="Ad, vəzifə və ya e-poçt…" value="${escapeHtml(filterText)}" autocomplete="off" />
            </label>
            <button class="btn btn--ghost btn--sm" type="button" data-act="export">
              ${icon('i-download', 16)} <span>CSV</span>
            </button>
            <button class="btn btn--primary btn--sm" type="button" data-act="add">
              ${icon('i-plus', 16)} İşçi əlavə et
            </button>
          </div>
        </header>

        <div class="card__body card__body--flush">
          ${
            !employees.length
              ? emptyState({
                  title: 'Hələ işçi yoxdur',
                  message: 'İlk işçinizi əlavə edin — ad, vəzifə və aylıq maaş kifayətdir.',
                  iconName: 'i-users',
                  action: `<button class="btn btn--primary btn--sm" type="button" data-act="add">${icon('i-plus', 16)} İşçi əlavə et</button>`
                })
              : !filtered.length
                ? emptyState({
                    title: 'Nəticə tapılmadı',
                    message: `"${filterText}" sorğusuna uyğun işçi yoxdur.`,
                    iconName: 'i-search'
                  })
                : `
                  <div class="table-wrap">
                    <table class="data">
                      <thead>
                        <tr>
                          <th scope="col">İşçi</th>
                          <th scope="col">Aylıq maaş</th>
                          <th scope="col">Ödənilib</th>
                          <th scope="col">Qalıq</th>
                          <th scope="col">Status</th>
                          <th scope="col" style="text-align:right">Əməliyyat</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${filtered.map((r) => employeeRow(r, currency)).join('')}
                      </tbody>
                    </table>
                  </div>
                `
          }
        </div>
      </section>
    </div>
  `;

  const search = $('#emp-search', root);
  if (search) {
    search.addEventListener('input', () => {
      filterText = search.value;
      const pos = search.selectionStart;
      renderEmployees(root, ctx);
      const next = $('#emp-search', root);
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

  $$('[data-act]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;

      if (act === 'add') {
        openEmployeeForm({
          businessId: ctx.business.id,
          currency,
          onSaved: ctx.refresh
        });
      }

      if (act === 'export') {
        const header = ['Ad', 'Vəzifə', 'Aylıq maaş', 'Hesablanmış', 'Ödənilib', 'Qalıq', 'Status'];
        const body = rows.map((r) => [
          r.emp.full_name,
          r.emp.position || '',
          Number(r.emp.monthly_salary || 0).toFixed(2),
          Number(r.bal?.accrued_total || 0).toFixed(2),
          Number(r.bal?.total_paid || 0).toFixed(2),
          Number(r.bal?.balance || 0).toFixed(2),
          r.emp.is_active ? 'Aktiv' : 'Passiv'
        ]);
        downloadCsv(`isci-siyahisi-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
        toast('CSV faylı yükləndi.', 'ok');
      }

      const empId = btn.dataset.emp;
      if (empId) {
        const emp = employees.find((x) => x.id === empId);
        if (!emp) return;

        if (act === 'open') {
          ctx.navigate('employee-detail', {
            employeeId: emp.id,
            title: emp.full_name,
            subtitle: emp.position || 'İşçi kartı'
          });
        }
        if (act === 'edit') {
          openEmployeeForm({
            businessId: ctx.business.id,
            employee: emp,
            currency,
            onSaved: ctx.refresh
          });
        }
        if (act === 'pay') {
          openPaymentForm({
            employees,
            payments: ctx.payments,
            employee: emp,
            currency,
            presetKind: 'advance',
            onSaved: ctx.refresh
          });
        }
        if (act === 'delete') {
          confirmDeleteEmployee(emp, ctx.refresh);
        }
        if (act === 'toggle') {
          setEmployeeActive(emp.id, !emp.is_active)
            .then(() => {
              toast(emp.is_active ? 'İşçi passiv edildi.' : 'İşçi aktiv edildi.', 'ok');
              return ctx.refresh();
            })
            .catch((err) => toast(friendlyError(err), 'error'));
        }
      }
    });
  });
}

function employeeRow(r, currency) {
  const { emp, bal } = r;
  const balance = Number(bal?.balance || 0);
  const paid = Number(bal?.total_paid || 0);
  const salary = Number(emp.monthly_salary || 0);

  const status = !emp.is_active
    ? '<span class="badge badge--muted">Passiv</span>'
    : emp.user_id
      ? '<span class="badge badge--ok badge--dot">Kabinet aktiv</span>'
      : '<span class="badge badge--info">Aktiv</span>';

  return `
    <tr>
      <td>
        <div class="person">
          <span class="avatar avatar--sm">${escapeHtml(initials(emp.full_name))}</span>
          <span class="person__text">
            <span class="person__name">${escapeHtml(emp.full_name)}</span>
            <span class="person__role">${escapeHtml(emp.position || 'Vəzifə göstərilməyib')}</span>
          </span>
        </div>
      </td>
      <td class="num" data-label="Aylıq maaş">${moneyShort(salary, currency)}</td>
      <td class="num" data-label="Ödənilib">${moneyShort(paid, currency)}</td>
      <td class="num" data-label="Qalıq" style="color:${balance > 0 ? 'var(--danger)' : 'var(--ink)'}">
        ${moneyShort(balance, currency)}
      </td>
      <td data-label="Status">${status}</td>
      <td class="actions">
        <div class="row">
          <button class="iconbtn iconbtn--sm" type="button" data-act="open" data-emp="${emp.id}" aria-label="${escapeHtml(emp.full_name)} kartını aç" title="Kart">
            ${icon('i-arrow-up-right', 16)}
          </button>
          <button class="iconbtn iconbtn--sm" type="button" data-act="pay" data-emp="${emp.id}" aria-label="Ödəniş et" title="Ödəniş">
            ${icon('i-wallet', 16)}
          </button>
          <button class="iconbtn iconbtn--sm" type="button" data-act="edit" data-emp="${emp.id}" aria-label="Redaktə et" title="Redaktə">
            ${icon('i-edit', 16)}
          </button>
          <button class="iconbtn iconbtn--sm iconbtn--danger" type="button" data-act="delete" data-emp="${emp.id}" aria-label="Sil" title="Sil">
            ${icon('i-trash', 16)}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function miniStat(label, value, iconName) {
  return `
    <article class="stat">
      <div class="stat__top">
        <span class="stat__label">${escapeHtml(label)}</span>
        <span class="stat__icon">${icon(iconName, 17)}</span>
      </div>
      <p class="stat__value" style="font-size:19px">${value}</p>
    </article>
  `;
}

function applyFilters(rows, text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const hay = [r.emp.full_name, r.emp.position, r.emp.email, r.emp.phone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/* --------------------------- İŞÇİ KARTI ---------------------------------- */

export function renderEmployeeDetail(root, ctx) {
  const id = ctx.state.params.employeeId;
  const emp = ctx.employees.find((e) => e.id === id);

  if (!emp) {
    root.innerHTML = emptyState({
      title: 'İşçi tapılmadı',
      message: 'Bu işçi silinmiş və ya sizə aid deyil.',
      iconName: 'i-user',
      action: `<button class="btn btn--primary btn--sm" type="button" data-act="back">${icon('i-arrow-left', 16)} İşçilərə qayıt</button>`
    });
    $('[data-act="back"]', root)?.addEventListener('click', () => ctx.navigate('employees'));
    return;
  }

  const bal = ctx.balances.find((b) => b.id === emp.id) || {};
  const payments = ctx.payments
    .filter((p) => p.employee_id === emp.id)
    .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));

  const salary = Number(emp.monthly_salary || 0);
  const accrued = Number(bal.accrued_total || 0);
  const paid = Number(bal.total_paid || 0);
  const balance = Number(bal.balance || 0);
  const advance = Number(bal.total_advance || 0);
  const bonus = Number(bal.total_bonus || 0);
  const deduction = Number(bal.total_deduction || 0);
  const months = Number(bal.months_count || 1);

  // Aylıq bölgü (son 6 ay)
  const monthly = buildMonthly(payments, 6);

  root.innerHTML = `
    <div class="stack">
      <section class="row" style="justify-content:space-between">
        <button class="btn btn--ghost btn--sm" type="button" data-act="back">
          ${icon('i-arrow-left', 16)} İşçilər
        </button>
        <div class="row" style="gap:8px">
          <button class="btn btn--ghost btn--sm" type="button" data-act="edit">
            ${icon('i-edit', 16)} <span>Redaktə</span>
          </button>
          <button class="btn btn--primary btn--sm" type="button" data-act="pay">
            ${icon('i-wallet', 16)} Ödəniş et
          </button>
        </div>
      </section>

      <section class="card">
        <div class="card__body">
          <div class="detail-hero">
            <span class="avatar avatar--lg">${escapeHtml(initials(emp.full_name))}</span>
            <div class="detail-hero__text">
              <h2>${escapeHtml(emp.full_name)}</h2>
              <p>
                ${escapeHtml(emp.position || 'Vəzifə göstərilməyib')}
                ${emp.email ? ' · ' + escapeHtml(emp.email) : ''}
                ${emp.phone ? ' · ' + escapeHtml(emp.phone) : ''}
              </p>
              <div class="row" style="margin-top:8px;gap:6px">
                ${
                  emp.is_active
                    ? '<span class="badge badge--ok badge--dot">Aktiv</span>'
                    : '<span class="badge badge--muted">Passiv</span>'
                }
                ${
                  emp.user_id
                    ? '<span class="badge badge--info">Şəxsi kabinet bağlıdır</span>'
                    : '<span class="badge badge--warn">Kabinet bağlanmayıb</span>'
                }
                <span class="badge badge--muted">İşə qəbul: ${dateShort(emp.hire_date)}</span>
              </div>
            </div>
          </div>

          <div class="pay-summary" style="margin-top:18px">
            <div class="pay-summary__cell">
              <span>Aylıq maaş</span>
              <strong>${moneyShort(salary, ctx.currency)}</strong>
            </div>
            <div class="pay-summary__cell">
              <span>Hesablanmış (${months} ay)</span>
              <strong>${moneyShort(accrued, ctx.currency)}</strong>
            </div>
            <div class="pay-summary__cell pay-summary__cell--accent">
              <span>Ödənilib</span>
              <strong>${moneyShort(paid, ctx.currency)}</strong>
            </div>
            <div class="pay-summary__cell ${balance > 0 ? 'pay-summary__cell--danger' : ''}">
              <span>Qalıq</span>
              <strong>${moneyShort(balance, ctx.currency)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="grid grid--sidebar">
        <article class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Hesablaşma tarixçəsi</h3>
              <p class="card__sub">${payments.length} əməliyyat</p>
            </div>
            <button class="btn btn--ghost btn--xs" type="button" data-act="export-emp">
              ${icon('i-download', 14)} CSV
            </button>
          </header>
          <div class="card__body card__body--flush">
            ${
              payments.length
                ? `<div class="timeline" style="padding:4px 18px">
                    ${payments
                      .map((p) => {
                        const tone = p.kind === 'advance' ? 'advance' : p.kind === 'salary' ? 'payment' : p.kind === 'bonus' ? 'salary' : 'adjust';
                        const ic =
                          p.kind === 'advance'
                            ? 'i-wallet'
                            : p.kind === 'salary'
                              ? 'i-banknote'
                              : p.kind === 'bonus'
                                ? 'i-trending'
                                : 'i-minus';
                        const sign = p.kind === 'deduction' ? '−' : '+';
                        return `
                          <div class="tl-item">
                            <div class="tl-icon tl-icon--${tone}">${icon(ic, 16)}</div>
                            <div class="tl-main">
                              <div class="tl-title">${escapeHtml(KIND_LABELS[p.kind] || p.kind)}</div>
                              <div class="tl-meta">
                                ${dateLong(p.paid_at)}${p.note ? ' · ' + escapeHtml(p.note) : ''}
                              </div>
                            </div>
                            <div class="tl-amount ${p.kind === 'deduction' ? 'tl-amount--out' : 'tl-amount--in'}">
                              ${sign}${moneyShort(p.amount, ctx.currency)}
                              <button class="iconbtn iconbtn--sm" type="button" data-editp="${p.id}" aria-label="Ödənişi redaktə et" style="margin-left:4px">
                                ${icon('i-edit', 14)}
                              </button>
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
                : emptyState({
                    title: 'Tarixçə boşdur',
                    message: 'Bu işçiyə hələ heç bir ödəniş qeyd edilməyib.',
                    iconName: 'i-receipt'
                  })
            }
          </div>
        </article>

        <div class="stack">
          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Aylıq bölgü</h3>
            </header>
            <div class="card__body">
              ${
                monthly.every((m) => m.total === 0)
                  ? `<p class="muted" style="font-size:13px">Son 6 ayda ödəniş qeydə alınmayıb.</p>`
                  : `<div class="bars" style="height:120px">
                      ${monthly
                        .map((m) => {
                          const max = Math.max(...monthly.map((x) => x.total), 1);
                          const h = Math.max(2, (m.total / max) * 100);
                          return `
                            <div class="bars__col" title="${m.label}: ${money(m.total, ctx.currency)}">
                              <div class="bars__stack"><div class="bars__seg" style="height:${h}%"></div></div>
                              <span class="bars__label">${m.label}</span>
                            </div>
                          `;
                        })
                        .join('')}
                    </div>`
              }
            </div>
          </article>

          <article class="card">
            <header class="card__head">
              <h3 class="card__title">Yekun</h3>
            </header>
            <div class="card__body">
              <div class="kv">
                <div class="kv__row">
                  <span class="kv__key">Avanslar</span>
                  <span class="kv__val mono">${money(advance, ctx.currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Maaş ödənişləri</span>
                  <span class="kv__val mono">${money(Number(bal.total_salary_paid || 0), ctx.currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Mükafatlar</span>
                  <span class="kv__val mono">${money(bonus, ctx.currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Tutulmalar</span>
                  <span class="kv__val mono" style="color:var(--danger)">${money(deduction, ctx.currency)}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key">Son ödəniş</span>
                  <span class="kv__val">${bal.last_paid_at ? dateShort(bal.last_paid_at) : '—'}</span>
                </div>
                <div class="kv__row">
                  <span class="kv__key" style="font-weight:700;color:var(--ink)">Qalıq borc</span>
                  <span class="kv__val mono" style="font-size:15px;color:${balance > 0 ? 'var(--danger)' : 'var(--accent)'}">
                    ${money(balance, ctx.currency)}
                  </span>
                </div>
              </div>
            </div>
          </article>

          ${
            emp.notes
              ? `<article class="card">
                  <header class="card__head"><h3 class="card__title">Qeyd</h3></header>
                  <div class="card__body">
                    <p style="font-size:13px;line-height:1.65;color:var(--ink-2);overflow-wrap:anywhere">${escapeHtml(emp.notes)}</p>
                  </div>
                </article>`
              : ''
          }
        </div>
      </section>
    </div>
  `;

  $('[data-act="back"]', root)?.addEventListener('click', () => ctx.navigate('employees'));

  $('[data-act="edit"]', root)?.addEventListener('click', () => {
    openEmployeeForm({
      businessId: ctx.business.id,
      employee: emp,
      currency: ctx.currency,
      onSaved: async () => {
        await ctx.refresh();
      }
    });
  });

  $('[data-act="pay"]', root)?.addEventListener('click', () => {
    openPaymentForm({
      employees: ctx.employees,
      payments: ctx.payments,
      employee: emp,
      currency: ctx.currency,
      onSaved: ctx.refresh
    });
  });

  $('[data-act="export-emp"]', root)?.addEventListener('click', () => {
    const header = ['Tarix', 'Növ', 'Məbləğ', 'Üsul', 'Qeyd'];
    const body = payments.map((p) => [
      p.paid_at,
      KIND_LABELS[p.kind] || p.kind,
      Number(p.amount).toFixed(2),
      p.method || '',
      p.note || ''
    ]);
    downloadCsv(`${slug(emp.full_name)}-tarixce.csv`, [header, ...body]);
  });

  $$('[data-editp]', root).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const payment = payments.find((p) => p.id === btn.dataset.editp);
      if (!payment) return;
      openPaymentEdit({
        payment,
        employees: ctx.employees,
        currency: ctx.currency,
        onSaved: ctx.refresh
      });
    });
  });
}

function buildMonthly(payments, count) {
  const out = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rows = payments.filter((p) => periodOf(p.paid_at) === period && p.kind !== 'deduction');
    out.push({
      period,
      label: monthLabel(period).split(' ')[0].slice(0, 3),
      total: rows.reduce((s, p) => s + Number(p.amount || 0), 0)
    });
  }
  return out;
}

function slug(text) {
  return String(text || 'isci')
    .toLowerCase()
    .replace(/[əçşğıöü]/g, (c) => ({ ə: 'e', ç: 'c', ş: 's', ğ: 'g', ı: 'i', ö: 'o', ü: 'u' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
