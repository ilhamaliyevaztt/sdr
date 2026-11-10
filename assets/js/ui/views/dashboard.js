/* ============================================================================
   RahatHesab — İcmal (dashboard)
   Sahibkar: pul mənzərəsi + xəbərdarlıqlar + son hərəkətlər
   İşçi:   öz maaşı, aldığı pul, qalıq
   ========================================================================== */

import { icon, emptyState, escapeHtml, initialsOf } from '../../lib/dom.js';
import {
  money, moneyCompact, dateShort, dateLong, timeAgo, currentPeriod,
  monthLabel, lastPeriods, KIND_LABELS, LEAVE_LABELS, daysBetween, pluralAz
} from '../../lib/format.js';
import { openPaymentForm, openLeaveForm } from '../forms.js';

export default function renderDashboard(root, ctx) {
  const { role } = ctx;
  if (role === 'employee') return renderEmployeeHome(root, ctx);
  return renderOwnerHome(root, ctx);
}

/* =========================== İŞÇİ GÖRÜNÜŞÜ ============================== */

function renderEmployeeHome(root, ctx) {
  const { currency, employee, business, balances, payments, worklogs, leaves, refresh } = ctx;
  const me = (balances || []).find((b) => b.id === employee?.id) || null;
  const salary = Number(me?.monthly_salary ?? employee?.monthly_salary ?? 0);
  const balance = Number(me?.balance ?? 0);
  const paid = Number(me?.total_paid ?? 0);
  const accrued = Number(me?.accrued_total ?? 0);
  const paidThisMonth = Number(me?.paid_this_month ?? 0);
  const rate = accrued > 0 ? Math.min(100, (paid / accrued) * 100) : 0;

  const thisMonth = currentPeriod();
  const monthLogs = (worklogs || []).filter((w) => String(w.work_date || '').slice(0, 7) === thisMonth);
  const monthHours = monthLogs.reduce((s, w) => s + Number(w.hours || 0), 0);
  const monthOvertime = monthLogs.reduce((s, w) => s + Number(w.overtime || 0), 0);

  const pendingLeave = (leaves || []).filter((l) => l.status === 'pending').length;

  const recent = (payments || []).slice(0, 6);

  root.innerHTML = `
    <section class="hero" style="margin-bottom:16px">
      <div class="hero__text">
        <h2>Salam, ${escapeHtml(employee?.full_name || 'İşçi')}!</h2>
        <p>${escapeHtml(business?.name || 'Biznes')} biznesində işləyirsiniz. Aşağıda bu ayın mənzərəsi var.</p>
      </div>
      <div class="hero__actions">
        <button class="btn btn--ghost btn--sm" type="button" id="emp-request-leave">
          ${icon('i-calendar', 16)} Məzuniyyət istə
        </button>
      </div>
    </section>

    <div class="grid grid--stats" style="margin-bottom:14px">
      <article class="stat stat--brand">
        <div class="stat__top">
          <span class="stat__label">Aylıq maaşım</span>
          <span class="stat__icon">${icon('i-banknote', 16)}</span>
        </div>
        <div class="stat__value">${money(salary, currency)}</div>
        <div class="stat__hint">${escapeHtml(employee?.position || 'Vəzifə göstərilməyib')}</div>
      </article>

      <article class="stat">
        <div class="stat__top">
          <span class="stat__label">Bu ay aldım</span>
          <span class="stat__icon stat__icon--info">${icon('i-wallet', 16)}</span>
        </div>
        <div class="stat__value stat__value--sm">${money(paidThisMonth, currency)}</div>
        <div class="stat__hint">${monthLabel(thisMonth)}</div>
      </article>

      <article class="stat ${balance > 0 ? 'stat--danger' : ''}">
        <div class="stat__top">
          <span class="stat__label">Qalıq borc</span>
          <span class="stat__icon ${balance > 0 ? 'stat__icon--danger' : ''}">${icon('i-receipt', 16)}</span>
        </div>
        <div class="stat__value stat__value--sm">${money(Math.max(0, balance), currency)}</div>
        <div class="stat__hint">${balance > 0 ? 'Sahibkarın sizə ödəməli olduğu məbləğ' : 'Borç yoxdur — hər şey ödənilib'}</div>
      </article>

      <article class="stat">
        <div class="stat__top">
          <span class="stat__label">Bu ay iş saatı</span>
          <span class="stat__icon">${icon('i-clock', 16)}</span>
        </div>
        <div class="stat__value stat__value--sm">${monthHours} saat</div>
        <div class="stat__hint">${monthOvertime > 0 ? `+${monthOvertime} saat əlavə iş` : 'Əlavə iş qeydə alınmayıb'}</div>
      </article>
    </div>

    <div class="grid grid--main">
      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Son ödənişlərim</h2>
            <p class="card__sub">Ən yeni 6 qeyd</p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" id="emp-see-all">Hamısı</button>
        </div>
        <div class="card__body card__body--flush">
          ${recent.length ? `<div class="list">${recent.map((p) => paymentRow(p, currency)).join('')}</div>` : emptyState({
            title: 'Hələ ödəniş yoxdur',
            message: 'Sahibkarınız ödəniş qeyd edəndə burada görünəcək.',
            iconName: 'i-wallet'
          })}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Ümumi vəziyyət</h2>
            <p class="card__sub">İşə başladığınızdan bəri</p>
          </div>
        </div>
        <div class="card__body">
          <div class="kv">
            <div class="kv__row"><dt>İşə qəbul</dt><dd>${dateShort(employee?.hire_date)}</dd></div>
            <div class="kv__row"><dt>Hesablanmış maaş</dt><dd>${money(accrued, currency)}</dd></div>
            <div class="kv__row"><dt>Alınan pul</dt><dd>${money(paid, currency)}</dd></div>
            <div class="kv__row"><dt>Qalıq</dt><dd style="color:${balance > 0 ? 'var(--danger)' : 'var(--brand-700)'}">${money(balance, currency)}</dd></div>
          </div>

          <div style="margin-top:16px">
            <div class="row row--between" style="margin-bottom:6px">
              <span class="tiny muted">Ödəniş tempi</span>
              <strong class="tiny">${Math.round(rate)}%</strong>
            </div>
            <div class="progress ${rate >= 90 ? '' : rate >= 50 ? 'progress--warn' : 'progress--danger'}">
              <span style="width:${Math.max(2, rate)}%"></span>
            </div>
          </div>

          ${pendingLeave ? `
            <div class="banner banner--warn" style="margin-top:16px">
              ${icon('i-clock', 18)}
              <span><strong>${pluralAz(pendingLeave, 'istək', 'istək')} cavab gözləyir</strong>Məzuniyyət istəyinizə hələ cavab verilməyib.</span>
            </div>
          ` : ''}
        </div>
      </section>
    </div>
  `;

  root.querySelector('#emp-request-leave')?.addEventListener('click', () => {
    openLeaveForm({ employeeId: employee?.id, onSaved: refresh });
  });
  root.querySelector('#emp-see-all')?.addEventListener('click', () => ctx.navigate('payments'));
}

function paymentRow(p, currency) {
  const isDeduction = p.kind === 'deduction';
  return `
    <div class="list-row">
      <span class="stat__icon ${isDeduction ? 'stat__icon--danger' : ''}" style="width:34px;height:34px">
        ${icon(isDeduction ? 'i-minus' : 'i-wallet', 16)}
      </span>
      <div class="list-row__main">
        <div class="list-row__title">${escapeHtml(KIND_LABELS[p.kind] || p.kind)}</div>
        <div class="list-row__sub">${dateShort(p.paid_at)}${p.note ? ' · ' + escapeHtml(p.note) : ''}</div>
      </div>
      <div class="list-row__end">
        <div class="list-row__amount" style="color:${isDeduction ? 'var(--danger)' : 'var(--ink)'}">
          ${isDeduction ? '−' : '+'}${money(p.amount, currency)}
        </div>
      </div>
    </div>
  `;
}

/* ============================ SAHİBKAR GÖRÜNÜŞÜ ========================== */

function renderOwnerHome(root, ctx) {
  const {
    currency, business, employees, balances, payments, worklogs, leaves, notes,
    activity, summary, refresh, navigate
  } = ctx;

  const s = summary || {
    employeeCount: 0, monthlyFund: 0, accrued: 0, paid: 0, balance: 0,
    advance: 0, paidThisMonth: 0, payoutRate: 0
  };

  const today = new Date();
  const dayOfMonth = today.getDate();
  const payDay = Number(business?.pay_day || 5);
  const daysToPay = payDay >= dayOfMonth ? payDay - dayOfMonth : payDay + 30 - dayOfMonth;

  const thisMonth = currentPeriod();
  const monthPayments = (payments || []).filter((p) => (p.period || String(p.paid_at || '').slice(0, 7)) === thisMonth);
  const monthPaid = monthPayments.filter((p) => p.kind !== 'deduction').reduce((a, p) => a + Number(p.amount || 0), 0);

  const pendingLeaves = (leaves || []).filter((l) => l.status === 'pending');
  const openNotes = (notes || []).filter((n) => !n.is_done);

  // Borclu işçilər (ən böyük borc əvvəldə)
  const debtors = (balances || [])
    .filter((b) => Number(b.balance || 0) > 0.5)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5);

  const noSalary = (employees || []).filter((e) => e.is_active && Number(e.monthly_salary || 0) <= 0);
  const noCode = (employees || []).filter((e) => e.is_active && !e.access_code);
  const notJoined = (employees || []).filter((e) => e.is_active && !e.user_id);

  const periods = lastPeriods(6);
  const byMonth = new Map();
  for (const p of payments || []) {
    const key = p.period || String(p.paid_at || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!byMonth.has(key)) byMonth.set(key, 0);
    byMonth.set(key, byMonth.get(key) + (p.kind === 'deduction' ? 0 : Number(p.amount || 0)));
  }
  const maxMonth = Math.max(1, ...periods.map((p) => byMonth.get(p) || 0));

  const thisMonthHours = (worklogs || [])
    .filter((w) => String(w.work_date || '').slice(0, 7) === thisMonth)
    .reduce((a, w) => a + Number(w.hours || 0) + Number(w.overtime || 0), 0);

  const alerts = [];
  if (noSalary.length) {
    alerts.push({
      cls: 'banner--warn',
      icon: 'i-alert',
      title: `${pluralAz(noSalary.length, 'işçinin', 'işçinin')} maaşı 0-dır`,
      text: 'Maaş yazılmayıbsa hesablama düzgün olmayacaq. İşçi kartını açıb maaşı əlavə edin.',
      action: '<button class="btn btn--ghost btn--sm" type="button" data-goto="employees">İşçilər</button>'
    });
  }
  if (notJoined.length) {
    alerts.push({
      cls: '',
      icon: 'i-key',
      title: `${notJoined.length} işçi hələ kabinetə qoşulmayıb`,
      text: 'İşçiyə 8 simvollu giriş kodunu verin — öz maaşını və ödənişlərini görə bilsin.',
      action: '<button class="btn btn--ghost btn--sm" type="button" data-goto="employees">Kodları göstər</button>'
    });
  }
  if (pendingLeaves.length) {
    alerts.push({
      cls: 'banner--warn',
      icon: 'i-calendar',
      title: `${pluralAz(pendingLeaves.length, 'məzuniyyət istəyi', 'məzuniyyət istəyi')} gözləyir`,
      text: 'Qərar verilməmiş istəklər var.',
      action: '<button class="btn btn--ghost btn--sm" type="button" data-goto="leaves">Bax</button>'
    });
  }

  root.innerHTML = `
    <section class="hero" style="margin-bottom:16px">
      <div class="hero__text">
        <h2>${escapeHtml(business?.name || 'Biznes')}</h2>
        <p>
          ${pluralAz(s.employeeCount, 'aktiv işçi', 'aktiv işçi')} ·
          Aylıq fond ${money(s.monthlyFund, currency)} ·
          ${daysToPay === 0 ? 'Bu gün maaş günüdür!' : `Maaş gününə ${daysToPay} gün qalıb (ayın ${payDay}-i)`}
        </p>
      </div>
      <div class="hero__actions">
        <button class="btn btn--primary btn--sm" type="button" id="dash-add-payment">
          ${icon('i-plus', 16)} Ödəniş qeyd et
        </button>
        <button class="btn btn--ghost btn--sm" type="button" id="dash-add-employee">
          ${icon('i-users', 16)} İşçi əlavə et
        </button>
      </div>
    </section>

    <div class="grid grid--stats" style="margin-bottom:14px">
      <article class="stat">
        <div class="stat__top">
          <span class="stat__label">Aktiv işçi</span>
          <span class="stat__icon">${icon('i-users', 16)}</span>
        </div>
        <div class="stat__value">${s.employeeCount}</div>
        <div class="stat__hint">${s.totalCount > s.employeeCount ? `${s.totalCount - s.employeeCount} passiv işçi` : 'Hamısı aktivdir'}</div>
      </article>

      <article class="stat">
        <div class="stat__top">
          <span class="stat__label">Aylıq maaş fondu</span>
          <span class="stat__icon stat__icon--info">${icon('i-banknote', 16)}</span>
        </div>
        <div class="stat__value stat__value--sm">${moneyCompact(s.monthlyFund, currency)}</div>
        <div class="stat__hint">Hər ay ödənilməli ümumi məbləğ</div>
      </article>

      <article class="stat">
        <div class="stat__top">
          <span class="stat__label">Bu ay ödənilib</span>
          <span class="stat__icon">${icon('i-wallet', 16)}</span>
        </div>
        <div class="stat__value stat__value--sm">${moneyCompact(monthPaid, currency)}</div>
        <div class="stat__hint">${monthLabel(thisMonth)} · ${monthPayments.length} qeyd</div>
      </article>

      <article class="stat ${s.balance > 0.5 ? 'stat--danger' : ''}">
        <div class="stat__top">
          <span class="stat__label">Ümumi qalıq borc</span>
          <span class="stat__icon ${s.balance > 0.5 ? 'stat__icon--danger' : ''}">${icon('i-receipt', 16)}</span>
        </div>
        <div class="stat__value stat__value--sm">${moneyCompact(Math.max(0, s.balance), currency)}</div>
        <div class="stat__hint">${s.balance > 0.5 ? `${debtors.length} işçiyə borclunuz` : 'Borç yoxdur 🎉'}</div>
      </article>
    </div>

    ${alerts.length ? `
      <div class="col" style="margin-bottom:16px">
        ${alerts.map((a) => `
          <div class="banner ${a.cls}">
            ${icon(a.icon, 18)}
            <span style="flex:1 1 auto">
              <strong>${escapeHtml(a.title)}</strong>
              ${escapeHtml(a.text)}
            </span>
            ${a.action}
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="grid grid--main" style="margin-bottom:14px">
      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Kimə nə qədər borcluyam?</h2>
            <p class="card__sub">Qalıq borcu olan işçilər</p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" id="dash-all-employees">Hamısı</button>
        </div>
        <div class="card__body card__body--flush">
          ${debtors.length ? `
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>İşçi</th>
                    <th class="num">Maaş</th>
                    <th class="num">Ödənilib</th>
                    <th class="num">Qalıq</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${debtors.map((b) => `
                    <tr>
                      <td>
                        <div class="cell-name">
                          <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initialsOf(b.full_name))}</span>
                          <span>
                            <strong>${escapeHtml(b.full_name)}</strong>
                            <small>${escapeHtml(b.position || '—')}</small>
                          </span>
                        </div>
                      </td>
                      <td class="num">${money(b.monthly_salary, currency)}</td>
                      <td class="num">${money(b.total_paid, currency)}</td>
                      <td class="num" style="color:var(--danger);font-weight:800">${money(b.balance, currency)}</td>
                      <td>
                        <div class="row-actions">
                          <button class="iconbtn iconbtn--sm" type="button" title="Ödəniş et"
                            data-quick-pay="${escapeHtml(b.id)}">${icon('i-wallet', 15)}</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : emptyState({
            title: s.employeeCount ? 'Borç yoxdur' : 'Hələ işçi yoxdur',
            message: s.employeeCount
              ? 'Bütün işçilərə hesablanmış maaşlar ödənilib. Əla iş!'
              : 'İlk işçinizi əlavə edin — maaş uçotu avtomatik başlayacaq.',
            iconName: s.employeeCount ? 'i-check-circle' : 'i-users',
            action: s.employeeCount ? '' : '<button class="btn btn--primary" type="button" data-act="add-employee">İşçi əlavə et</button>'
          })}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Son 6 ay</h2>
            <p class="card__sub">Ödənilən məbləğ</p>
          </div>
        </div>
        <div class="card__body">
          <div class="bars">
            ${periods.map((p) => {
              const v = byMonth.get(p) || 0;
              const h = Math.max(3, Math.round((v / maxMonth) * 130));
              return `
                <div class="bars__item" title="${monthLabel(p)}: ${money(v, currency)}">
                  <span class="bars__value">${v > 0 ? moneyCompact(v, currency) : ''}</span>
                  <div class="bars__bar ${v > 0 ? '' : 'bars__bar--soft'}" style="height:${h}px"></div>
                  <span class="bars__label">${p.slice(5)}/${p.slice(2, 4)}</span>
                </div>
              `;
            }).join('')}
          </div>

          <div class="kv" style="margin-top:18px">
            <div class="kv__row"><dt>Bu ay iş saatı</dt><dd>${thisMonthHours} saat</dd></div>
            <div class="kv__row"><dt>Açıq qeydlər</dt><dd>${openNotes.length}</dd></div>
            <div class="kv__row"><dt>Ödəniş tempi</dt><dd>${Math.round(s.payoutRate)}%</dd></div>
          </div>
        </div>
      </section>
    </div>

    <div class="grid grid--2">
      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Son hərəkətlər</h2>
            <p class="card__sub">Nə vaxt nə oldu</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          ${renderActivity(activity, payments, currency)}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">Qeydlər</h2>
            <p class="card__sub">Tamamlanmamış tapşırıqlar</p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" id="dash-notes">Aç</button>
        </div>
        <div class="card__body card__body--flush">
          ${openNotes.length ? `
            <div class="list">
              ${openNotes.slice(0, 5).map((n) => `
                <div class="list-row">
                  <span class="stat__icon" style="width:32px;height:32px">${icon('i-note', 15)}</span>
                  <div class="list-row__main">
                    <div class="list-row__title">${escapeHtml(n.title)}</div>
                    <div class="list-row__sub">${n.due_date ? 'Son tarix: ' + dateShort(n.due_date) : 'Tarix yoxdur'}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : emptyState({
            title: 'Açıq qeyd yoxdur',
            message: 'Yeni tapşırıq əlavə etmək üçün «Qeydlər» bölməsinə keçin.',
            iconName: 'i-note'
          })}
        </div>
      </section>
    </div>
  `;

  const byId = (id) => employees.find((e) => e.id === id);

  root.querySelector('#dash-add-payment')?.addEventListener('click', () => {
    openPaymentForm({ employees, payments, currency, onSaved: refresh });
  });

  const addEmployee = () => navigate('employees', { openNew: true });
  root.querySelector('#dash-add-employee')?.addEventListener('click', addEmployee);
  root.querySelectorAll('[data-act="add-employee"]').forEach((b) => b.addEventListener('click', addEmployee));

  root.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => navigate(b.dataset.goto));
  });

  root.querySelectorAll('[data-quick-pay]').forEach((b) => {
    b.addEventListener('click', () => {
      const emp = byId(b.dataset.quickPay);
      openPaymentForm({ employees, payments, employee: emp, currency, onSaved: refresh });
    });
  });

  root.querySelector('#dash-all-employees')?.addEventListener('click', () => navigate('employees'));
  root.querySelector('#dash-notes')?.addEventListener('click', () => navigate('notes'));
}

function renderActivity(activity, payments, currency) {
  const rows = [];

  for (const a of activity || []) {
    rows.push({
      icon: 'i-info',
      title: a.action,
      sub: [a.detail, a.actor_name].filter(Boolean).join(' · ') || '—',
      when: a.created_at
    });
  }

  if (!rows.length) {
    for (const p of (payments || []).slice(0, 6)) {
      rows.push({
        icon: 'i-wallet',
        title: `${KIND_LABELS[p.kind] || p.kind}: ${money(p.amount, currency)}`,
        sub: p.employees?.full_name || 'İşçi',
        when: p.created_at
      });
    }
  }

  if (!rows.length) {
    return emptyState({
      title: 'Hələ hərəkət yoxdur',
      message: 'İşçi əlavə edin və ya ödəniş qeyd edin — burada tarixçə görünəcək.',
      iconName: 'i-clock'
    });
  }

  return `
    <div class="list">
      ${rows.slice(0, 8).map((r) => `
        <div class="list-row">
          <span class="stat__icon" style="width:32px;height:32px">${icon(r.icon, 15)}</span>
          <div class="list-row__main">
            <div class="list-row__title">${escapeHtml(r.title)}</div>
            <div class="list-row__sub">${escapeHtml(r.sub)}</div>
          </div>
          <div class="list-row__end">
            <div class="tiny muted">${timeAgo(r.when)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
