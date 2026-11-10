/* ============================================================================
   RahatHesab — İşçilər
   ========================================================================== */

import {
  icon, emptyState, escapeHtml, toast, copyText, confirmDialog, debounce,
  downloadFile
} from '../../lib/dom.js';
import {
  money, dateShort, dateLong, initials, KIND_LABELS, METHOD_LABELS, monthLabel,
  buildCsv, daysBetween, todayISO
} from '../../lib/format.js';
import {
  openEmployeeForm, confirmDeleteEmployee, openPaymentForm, openImportEmployeesModal,
  openPaymentEdit
} from '../forms.js';
import { setEmployeeActive } from '../../lib/store.js';

let searchTerm = '';
let activeFilter = 'all';

export default function renderEmployees(root, ctx) {
  root.innerHTML = '';
  if (ctx.state.params?.openNew) {
    const p = { ...ctx.state.params };
    delete p.openNew;
    ctx.state.params = p;
    setTimeout(() => {
      openEmployeeForm({
        businessId: ctx.business.id,
        currency: ctx.currency,
        onSaved: ctx.refresh
      });
    }, 60);
  }

  return renderList(root, ctx);
}

function renderList(root, ctx) {
  const { employees, balances, currency, business, payments, refresh, navigate } = ctx;

  const balanceOf = new Map((balances || []).map((b) => [b.id, b]));

  const filtered = employees
    .filter((e) => {
      if (activeFilter === 'active' && !e.is_active) return false;
      if (activeFilter === 'inactive' && e.is_active) return false;
      if (activeFilter === 'noaccount' && e.user_id) return false;
      if (activeFilter === 'debt' && Number(balanceOf.get(e.id)?.balance || 0) <= 0.5) return false;
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        String(e.full_name || '').toLowerCase().includes(q) ||
        String(e.position || '').toLowerCase().includes(q) ||
        String(e.email || '').toLowerCase().includes(q) ||
        String(e.phone || '').toLowerCase().includes(q) ||
        String(e.access_code || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return String(a.full_name).localeCompare(String(b.full_name), 'az');
    });

  const totalSalary = filtered.filter((e) => e.is_active).reduce((s, e) => s + Number(e.monthly_salary || 0), 0);
  const totalDebt = filtered.reduce((s, e) => s + Math.max(0, Number(balanceOf.get(e.id)?.balance || 0)), 0);

  root.innerHTML = `
    <div class="toolbar">
      <div class="toolbar__search">
        ${icon('i-search', 17)}
        <input id="emp-search" type="search" placeholder="Ad, vəzifə, kod üzrə axtar…" value="${escapeHtml(searchTerm)}" />
      </div>
      <select id="emp-filter" aria-label="Filtrləmə">
        <option value="all"${activeFilter === 'all' ? ' selected' : ''}>Hamısı (${employees.length})</option>
        <option value="active"${activeFilter === 'active' ? ' selected' : ''}>Yalnız aktiv</option>
        <option value="inactive"${activeFilter === 'inactive' ? ' selected' : ''}>Yalnız passiv</option>
        <option value="debt"${activeFilter === 'debt' ? ' selected' : ''}>Borcu olanlar</option>
        <option value="noaccount"${activeFilter === 'noaccount' ? ' selected' : ''}>Kabinetə qoşulmayanlar</option>
      </select>
      <span class="spacer"></span>
      <button class="btn btn--ghost btn--sm" type="button" id="emp-export">${icon('i-download', 15)} CSV</button>
      <button class="btn btn--ghost btn--sm" type="button" id="emp-import">${icon('i-upload', 15)} İçəri al</button>
      <button class="btn btn--primary btn--sm" type="button" id="emp-add">${icon('i-plus', 16)} Yeni işçi</button>
    </div>

    ${filtered.length ? `
      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">${filtered.length} işçi</h2>
            <p class="card__sub">Aylıq fond ${money(totalSalary, currency)} · Qalıq borc ${money(totalDebt, currency)}</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>İşçi</th>
                  <th class="num">Maaş</th>
                  <th class="num">Ödənilib</th>
                  <th class="num">Qalıq</th>
                  <th>Giriş kodu</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map((e) => {
                  const b = balanceOf.get(e.id) || {};
                  const balance = Number(b.balance || 0);
                  return `
                    <tr class="${e.is_active ? '' : 'is-inactive'}">
                      <td>
                        <div class="cell-name">
                          <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(e.full_name))}</span>
                          <span>
                            <strong>${escapeHtml(e.full_name)}</strong>
                            <small>${escapeHtml(e.position || '—')}${e.is_active ? '' : ' · passiv'}</small>
                          </span>
                        </div>
                      </td>
                      <td class="num">${money(e.monthly_salary, currency)}</td>
                      <td class="num">${money(b.total_paid || 0, currency)}</td>
                      <td class="num" style="${balance > 0.5 ? 'color:var(--danger);font-weight:800' : 'color:var(--ink-3)'}">
                        ${money(balance, currency)}
                      </td>
                      <td>
                        <button class="badge ${e.user_id ? 'badge--ok' : 'badge--info'}" type="button"
                          data-copy-code="${escapeHtml(e.access_code || '')}" title="Kopyalamaq üçün klikləyin"
                          style="cursor:pointer;font-family:ui-monospace,monospace;letter-spacing:.06em">
                          ${e.user_id ? icon('i-check', 11) : icon('i-key', 11)}
                          ${escapeHtml(e.access_code || '——')}
                        </button>
                      </td>
                      <td>
                        <div class="row-actions">
                          <button class="iconbtn iconbtn--sm" type="button" title="Ödəniş et"
                            data-pay="${escapeHtml(e.id)}">${icon('i-wallet', 15)}</button>
                          <button class="iconbtn iconbtn--sm" type="button" title="Kartı aç"
                            data-open="${escapeHtml(e.id)}">${icon('i-edit', 15)}</button>
                          <button class="iconbtn iconbtn--sm" type="button" title="Sil"
                            data-del="${escapeHtml(e.id)}">${icon('i-trash', 15)}</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    ` : emptyState({
      title: employees.length ? 'Nəticə tapılmadı' : 'Hələ işçi yoxdur',
      message: employees.length
        ? 'Axtarış sözünü dəyişin və ya filtri sıfırlayın.'
        : 'İlk işçinizi əlavə edin — sistem maaşı avtomatik hesablayacaq.',
      iconName: employees.length ? 'i-search' : 'i-users',
      action: employees.length
        ? '<button class="btn btn--ghost" type="button" id="emp-clear">Filtri sıfırla</button>'
        : `<button class="btn btn--primary" type="button" id="emp-add2">${icon('i-plus', 16)} İşçi əlavə et</button>`
    })}
  `;

  const addEmployee = () => openEmployeeForm({ businessId: business.id, currency, onSaved: refresh });

  root.querySelector('#emp-add')?.addEventListener('click', addEmployee);
  root.querySelector('#emp-add2')?.addEventListener('click', addEmployee);

  const searchInput = root.querySelector('#emp-search');
  searchInput?.addEventListener('input', debounce(() => {
    searchTerm = searchInput.value;
    renderList(root, ctx);
    const el = root.querySelector('#emp-search');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, 260));

  root.querySelector('#emp-filter')?.addEventListener('change', (e) => {
    activeFilter = e.target.value;
    renderList(root, ctx);
  });

  root.querySelector('#emp-clear')?.addEventListener('click', () => {
    searchTerm = '';
    activeFilter = 'all';
    renderList(root, ctx);
  });

  root.querySelector('#emp-export')?.addEventListener('click', () => {
    const rows = [
      ['Ad Soyad', 'Vəzifə', 'Aylıq maaş', 'E-poçt', 'Telefon', 'İşə qəbul', 'Aktiv', 'Giriş kodu', 'Ödənilib', 'Qalıq']
    ];
    for (const e of filtered) {
      const b = balanceOf.get(e.id) || {};
      rows.push([
        e.full_name, e.position || '', e.monthly_salary, e.email || '', e.phone || '',
        e.hire_date || '', e.is_active ? 'Bəli' : 'Xeyr', e.access_code || '',
        b.total_paid || 0, b.balance || 0
      ]);
    }
    downloadFile(`isci-siyahisi-${todayISO()}.csv`, buildCsv(rows), 'text/csv;charset=utf-8');
    toast('CSV faylı yükləndi.', 'ok');
  });

  root.querySelector('#emp-import')?.addEventListener('click', () => {
    openImportEmployeesModal({ businessId: business.id, currency, onSaved: refresh });
  });

  root.querySelectorAll('[data-copy-code]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.copyCode;
      if (!code) return;
      const ok = await copyText(code);
      toast(ok ? `Kod kopyalandı: ${code}` : 'Kopyalamaq mümkün olmadı.', ok ? 'ok' : 'error', 3600);
    });
  });

  root.querySelectorAll('[data-pay]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emp = employees.find((x) => x.id === btn.dataset.pay);
      openPaymentForm({ employees, payments, employee: emp, currency, onSaved: refresh });
    });
  });

  root.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => navigate('employee-detail', { id: btn.dataset.open }));
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const emp = employees.find((x) => x.id === btn.dataset.del);
      if (!emp) return;
      const done = await confirmDeleteEmployee(emp, refresh);
      if (done) renderList(root, ctx);
    });
  });
}

/* --------------------------- İŞÇİ KARTI (detallı) ------------------------ */

export function renderEmployeeDetail(root, ctx) {
  const { employees, balances, payments, worklogs, leaves, currency, business, refresh, navigate } = ctx;
  const id = ctx.state.params?.id;
  const emp = employees.find((e) => e.id === id);

  if (!emp) {
    root.innerHTML = emptyState({
      title: 'İşçi tapılmadı',
      message: 'Bu işçi silinib və ya başqa biznesə aiddir.',
      iconName: 'i-alert',
      action: '<button class="btn btn--primary" type="button" id="back-list">İşçilərə qayıt</button>'
    });
    root.querySelector('#back-list')?.addEventListener('click', () => navigate('employees'));
    return;
  }

  const b = balances.find((x) => x.id === emp.id) || {};
  const balance = Number(b.balance || 0);
  const empPayments = payments.filter((p) => p.employee_id === emp.id);
  const empLogs = worklogs.filter((w) => w.employee_id === emp.id).slice(0, 10);
  const empLeaves = leaves.filter((l) => l.employee_id === emp.id).slice(0, 6);

  const monthsWorked = daysBetween(emp.hire_date, todayISO()) / 30.44;

  root.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      <button class="btn btn--ghost btn--sm" type="button" id="detail-back">
        ${icon('i-arrow-left', 15)} İşçilər
      </button>
      <span class="spacer"></span>
      <button class="btn btn--ghost btn--sm" type="button" id="detail-edit">${icon('i-edit', 15)} Redaktə</button>
      <button class="btn btn--primary btn--sm" type="button" id="detail-pay">${icon('i-wallet', 15)} Ödəniş et</button>
    </div>

    <div class="grid grid--main" style="margin-bottom:14px">
      <section class="card">
        <div class="card__body">
          <div class="row" style="gap:14px;align-items:flex-start;flex-wrap:nowrap">
            <span class="avatar avatar--lg" aria-hidden="true">${escapeHtml(initials(emp.full_name))}</span>
            <div style="flex:1 1 auto;min-width:0">
              <h2 style="font-size:18px;font-weight:800;letter-spacing:-.03em">${escapeHtml(emp.full_name)}</h2>
              <p class="tiny muted" style="margin-top:2px">${escapeHtml(emp.position || 'Vəzifə göstərilməyib')}</p>
              <div class="row" style="margin-top:8px;gap:6px">
                <span class="badge ${emp.is_active ? 'badge--ok' : ''}">${emp.is_active ? 'Aktiv' : 'Passiv'}</span>
                <span class="badge ${emp.user_id ? 'badge--ok' : 'badge--info'}">
                  ${emp.user_id ? 'Kabinetə qoşulub' : 'Kabinetə qoşulmayıb'}
                </span>
              </div>
            </div>
          </div>

          <dl class="kv" style="margin-top:18px">
            <div class="kv__row"><dt>Aylıq maaş</dt><dd>${money(emp.monthly_salary, currency)}</dd></div>
            <div class="kv__row"><dt>İşə qəbul</dt><dd>${dateLong(emp.hire_date)}</dd></div>
            <div class="kv__row"><dt>İş stajı</dt><dd>${Math.max(1, Math.round(monthsWorked))} ay</dd></div>
            <div class="kv__row"><dt>E-poçt</dt><dd>${escapeHtml(emp.email || '—')}</dd></div>
            <div class="kv__row"><dt>Telefon</dt><dd>${escapeHtml(emp.phone || '—')}</dd></div>
            ${emp.notes ? `<div class="kv__row"><dt>Qeyd</dt><dd style="font-weight:600">${escapeHtml(emp.notes)}</dd></div>` : ''}
          </dl>

          <div class="codebox" style="margin-top:16px">
            <div style="flex:1 1 160px;min-width:0">
              <div class="tiny muted" style="font-weight:700">İşçinin giriş kodu</div>
              <div class="codebox__code">${escapeHtml(emp.access_code || '——')}</div>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" id="detail-copy-code">${icon('i-copy', 14)} Kopyala</button>
          </div>
          <p class="field__hint" style="margin-top:6px">
            Bu kodu işçiyə verin. O, qeydiyyatdan keçib kodu daxil edəndə yalnız öz məlumatlarını görəcək.
          </p>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Hesablaşma</h2>
            <p class="card__sub">Bütün dövr üzrə</p>
          </div>
        </div>
        <div class="card__body">
          <div class="grid" style="gap:10px">
            <div class="stat" style="box-shadow:none;background:var(--surface-2)">
              <div class="stat__top"><span class="stat__label">Hesablanmış maaş</span></div>
              <div class="stat__value stat__value--sm">${money(b.accrued_total || 0, currency)}</div>
              <div class="stat__hint">${b.months_count || 1} ay × ${money(emp.monthly_salary, currency)}</div>
            </div>

            <div class="stat" style="box-shadow:none;background:var(--surface-2)">
              <div class="stat__top"><span class="stat__label">Ödənilib</span></div>
              <div class="stat__value stat__value--sm">${money(b.total_paid || 0, currency)}</div>
              <div class="stat__hint">
                Avans ${money(b.total_advance || 0, currency)} ·
                Maaş ${money(b.total_salary_paid || 0, currency)}
                ${Number(b.total_bonus || 0) ? ' · Mükafat ' + money(b.total_bonus, currency) : ''}
              </div>
            </div>

            <div class="stat ${balance > 0.5 ? 'stat--danger' : ''}" style="box-shadow:none;background:var(--surface-2)">
              <div class="stat__top"><span class="stat__label">Qalıq borc</span></div>
              <div class="stat__value stat__value--sm">${money(balance, currency)}</div>
              <div class="stat__hint">${balance > 0.5 ? 'Bu məbləğ ödənilməlidir' : 'Borç yoxdur'}</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="grid grid--2">
      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Ödəniş tarixçəsi</h2>
            <p class="card__sub">${empPayments.length} qeyd</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          ${empPayments.length ? `
            <div class="list">
              ${empPayments.slice(0, 12).map((p) => `
                <div class="list-row">
                  <span class="stat__icon ${p.kind === 'deduction' ? 'stat__icon--danger' : ''}" style="width:32px;height:32px">
                    ${icon(p.kind === 'deduction' ? 'i-minus' : 'i-wallet', 15)}
                  </span>
                  <div class="list-row__main">
                    <div class="list-row__title">${escapeHtml(KIND_LABELS[p.kind] || p.kind)}</div>
                    <div class="list-row__sub">
                      ${dateShort(p.paid_at)} · ${escapeHtml(METHOD_LABELS[p.method] || '—')}
                      ${p.note ? ' · ' + escapeHtml(p.note) : ''}
                    </div>
                  </div>
                  <div class="list-row__end">
                    <div class="list-row__amount">${money(p.amount, currency)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : emptyState({
            title: 'Ödəniş yoxdur',
            message: 'Bu işçiyə hələ ödəniş qeydə alınmayıb.',
            iconName: 'i-wallet'
          })}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Davamiyyət və məzuniyyət</h2>
            <p class="card__sub">Son qeydlər</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          ${(empLogs.length || empLeaves.length) ? `
            <div class="list">
              ${empLogs.slice(0, 6).map((w) => `
                <div class="list-row">
                  <span class="stat__icon" style="width:32px;height:32px">${icon('i-clock', 15)}</span>
                  <div class="list-row__main">
                    <div class="list-row__title">${Number(w.hours)} saat${Number(w.overtime) ? ` + ${Number(w.overtime)} əlavə` : ''}</div>
                    <div class="list-row__sub">${dateShort(w.work_date)}${w.note ? ' · ' + escapeHtml(w.note) : ''}</div>
                  </div>
                </div>
              `).join('')}
              ${empLeaves.map((l) => `
                <div class="list-row">
                  <span class="stat__icon stat__icon--warn" style="width:32px;height:32px">${icon('i-calendar', 15)}</span>
                  <div class="list-row__main">
                    <div class="list-row__title">${escapeHtml(({vacation:'Məzuniyyət',sick:'Xəstəlik',unpaid:'Ödənişsiz',other:'Digər'})[l.kind] || l.kind)}</div>
                    <div class="list-row__sub">${dateShort(l.start_date)} – ${dateShort(l.end_date)}</div>
                  </div>
                  <div class="list-row__end">
                    <span class="badge ${l.status === 'approved' ? 'badge--ok' : l.status === 'rejected' ? 'badge--danger' : 'badge--warn'}">
                      ${l.status === 'approved' ? 'Təsdiq' : l.status === 'rejected' ? 'Rədd' : 'Gözləyir'}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : emptyState({
            title: 'Qeyd yoxdur',
            message: 'Davamiyyət və məzuniyyət qeydləri burada görünəcək.',
            iconName: 'i-clock'
          })}
        </div>
      </section>
    </div>

    <div class="row" style="margin-top:16px">
      <button class="btn btn--ghost btn--sm" type="button" id="detail-toggle">
        ${emp.is_active ? 'İşçini passiv et' : 'İşçini aktiv et'}
      </button>
      <button class="btn btn--danger-ghost btn--sm" type="button" id="detail-delete">${icon('i-trash', 15)} İşçini sil</button>
    </div>
  `;

  root.querySelector('#detail-back')?.addEventListener('click', () => navigate('employees'));

  root.querySelector('#detail-edit')?.addEventListener('click', () => {
    openEmployeeForm({ businessId: business.id, employee: emp, currency, onSaved: refresh });
  });

  root.querySelector('#detail-pay')?.addEventListener('click', () => {
    openPaymentForm({ employees, payments, employee: emp, currency, onSaved: refresh });
  });

  root.querySelector('#detail-copy-code')?.addEventListener('click', async () => {
    const ok = await copyText(emp.access_code || '');
    toast(ok ? `Kod kopyalandı: ${emp.access_code}` : 'Kopyalamaq mümkün olmadı.', ok ? 'ok' : 'error', 3800);
  });

  root.querySelector('#detail-toggle')?.addEventListener('click', async () => {
    try {
      await setEmployeeActive(emp.id, !emp.is_active);
      toast(emp.is_active ? 'İşçi passiv edildi.' : 'İşçi aktiv edildi.', 'ok');
      await refresh();
    } catch (err) {
      toast(String(err?.message || 'Xəta'), 'error');
    }
  });

  root.querySelector('#detail-delete')?.addEventListener('click', async () => {
    const done = await confirmDeleteEmployee(emp, async () => {
      await refresh();
      navigate('employees');
    });
    if (done) navigate('employees');
  });
}
