/* ============================================================================
   RahatHesab — Davamiyyət (iş saatları)
   Sahibkar: bütün işçilər üzrə qeydlər + aylıq cəm
   İşçi: öz saatları
   ========================================================================== */

import { icon, emptyState, escapeHtml, downloadFile } from '../../lib/dom.js';
import { dateShort, currentPeriod, monthLabel, buildCsv, todayISO, pluralAz } from '../../lib/format.js';
import { openWorkLogForm } from '../forms.js';

export default function renderWorklog(root, ctx) {
  const { role, worklogs, employees, employee, currency } = ctx;
  const isOwner = role === 'owner';

  const thisMonth = currentPeriod();
  const monthLogs = worklogs.filter((w) => String(w.work_date || '').slice(0, 7) === thisMonth);
  const totalHours = monthLogs.reduce((s, w) => s + Number(w.hours || 0), 0);
  const totalOvertime = monthLogs.reduce((s, w) => s + Number(w.overtime || 0), 0);

  // İşçi üzrə aylıq cəm
  const perEmployee = new Map();
  for (const w of monthLogs) {
    const key = w.employee_id;
    if (!perEmployee.has(key)) perEmployee.set(key, { name: w.employees?.full_name || '—', hours: 0, overtime: 0, days: 0 });
    const row = perEmployee.get(key);
    row.hours += Number(w.hours || 0);
    row.overtime += Number(w.overtime || 0);
    row.days += 1;
  }
  const perEmployeeRows = [...perEmployee.values()].sort((a, b) => b.hours - a.hours);

  const avgHours = monthLogs.length ? (totalHours / new Set(monthLogs.map((w) => w.employee_id)).size) : 0;

  root.innerHTML = `
    <div class="grid grid--stats" style="margin-bottom:14px">
      <article class="stat stat--brand">
        <div class="stat__top"><span class="stat__label">Bu ay iş saatı</span><span class="stat__icon">${icon('i-clock', 16)}</span></div>
        <div class="stat__value">${totalHours}</div>
        <div class="stat__hint">${monthLabel(thisMonth)}</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">Əlavə iş</span><span class="stat__icon stat__icon--warn">${icon('i-trending', 16)}</span></div>
        <div class="stat__value">${totalOvertime}</div>
        <div class="stat__hint">Saat (əlavə iş)</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">Qeyd sayı</span><span class="stat__icon stat__icon--info">${icon('i-calendar', 16)}</span></div>
        <div class="stat__value">${monthLogs.length}</div>
        <div class="stat__hint">Bu ay yazılan günlər</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">${isOwner ? 'İşçi sayı' : 'Orta saat'}</span><span class="stat__icon">${icon('i-users', 16)}</span></div>
        <div class="stat__value">${isOwner ? perEmployeeRows.length : Math.round(avgHours)}</div>
        <div class="stat__hint">${isOwner ? 'Bu ay qeyd olunan işçi' : 'Bir işçiyə düşən saat'}</div>
      </article>
    </div>

    <div class="toolbar">
      <span class="toolbar__count">${pluralAz(worklogs.length, 'qeyd', 'qeyd')} · son 600</span>
      <span class="spacer"></span>
      ${isOwner ? `<button class="btn btn--ghost btn--sm" type="button" id="wl-export">${icon('i-download', 15)} CSV</button>` : ''}
      <button class="btn btn--primary btn--sm" type="button" id="wl-add">${icon('i-plus', 16)} ${isOwner ? 'Qeyd et' : 'Bugünkü saatım'}</button>
    </div>

    ${isOwner && perEmployeeRows.length ? `
      <section class="card" style="margin-bottom:14px">
        <div class="card__head">
          <div>
            <h3 class="card__title">${monthLabel(thisMonth)} — işçi üzrə</h3>
            <p class="card__sub">Kim neçə saat işləyib</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr><th>İşçi</th><th class="num">Gün</th><th class="num">Saat</th><th class="num">Əlavə</th><th class="num">Cəm</th></tr>
              </thead>
              <tbody>
                ${perEmployeeRows.map((r) => `
                  <tr>
                    <td><strong>${escapeHtml(r.name)}</strong></td>
                    <td class="num">${r.days}</td>
                    <td class="num">${r.hours}</td>
                    <td class="num">${r.overtime}</td>
                    <td class="num" style="font-weight:800">${r.hours + r.overtime}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    ` : ''}

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">Gündəlik qeydlər</h3>
          <p class="card__sub">Ən yenilər əvvəldə</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        ${worklogs.length ? `
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr><th>Tarix</th>${isOwner ? '<th>İşçi</th>' : ''}<th class="num">Saat</th><th class="num">Əlavə</th><th>Qeyd</th><th></th></tr>
              </thead>
              <tbody>
                ${worklogs.slice(0, 120).map((w) => `
                  <tr>
                    <td class="nowrap">${dateShort(w.work_date)}</td>
                    ${isOwner ? `<td><strong>${escapeHtml(w.employees?.full_name || '—')}</strong></td>` : ''}
                    <td class="num">${Number(w.hours)}</td>
                    <td class="num">${Number(w.overtime) || 0}</td>
                    <td class="tiny muted">${escapeHtml(w.note || '—')}</td>
                    <td>
                      <div class="row-actions">
                        <button class="iconbtn iconbtn--sm" type="button" title="Redaktə"
                          data-wl-edit="${escapeHtml(w.id)}">${icon('i-edit', 15)}</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : emptyState({
          title: 'Hələ qeyd yoxdur',
          message: isOwner
            ? 'İşçilərin gündəlik iş saatlarını qeyd edin — hesablamalar daha dəqiq olacaq.'
            : 'Bu gün işlədiyiniz saatları qeyd edin.',
          iconName: 'i-clock',
          action: `<button class="btn btn--primary" type="button" id="wl-add2">${icon('i-plus', 16)} Qeyd əlavə et</button>`
        })}
      </div>
    </section>
  `;

  const addLog = () => {
    if (!isOwner && employee) {
      // İşçi üçün yalnız özü
      openWorkLogForm({ employees: [employee], currency, onSaved: ctx.refresh });
      return;
    }
    openWorkLogForm({ employees, currency, onSaved: ctx.refresh });
  };

  root.querySelector('#wl-add')?.addEventListener('click', addLog);
  root.querySelector('#wl-add2')?.addEventListener('click', addLog);

  root.querySelector('#wl-export')?.addEventListener('click', () => {
    const rows = [['Tarix', 'İşçi', 'Saat', 'Əlavə saat', 'Cəm', 'Qeyd']];
    for (const w of worklogs) {
      rows.push([
        w.work_date, w.employees?.full_name || '', w.hours, w.overtime,
        Number(w.hours || 0) + Number(w.overtime || 0), w.note || ''
      ]);
    }
    downloadFile(`davamiyyet-${todayISO()}.csv`, buildCsv(rows), 'text/csv;charset=utf-8');
    import('../lib/dom.js').then((m) => m.toast('CSV yükləndi.', 'ok'));
  });

  root.querySelectorAll('[data-wl-edit]').forEach((b) => {
    b.addEventListener('click', () => {
      const log = worklogs.find((w) => w.id === b.dataset.wlEdit);
      if (!log) return;
      const list = isOwner ? employees : [employee].filter(Boolean);
      openWorkLogForm({ employees: list, log, currency, onSaved: ctx.refresh });
    });
  });
}
