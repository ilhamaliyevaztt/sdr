/* ============================================================================
   RahatHesab — Məzuniyyət / istəklər
   ========================================================================== */

import { icon, emptyState, escapeHtml } from '../../lib/dom.js';
import { dateShort, daysBetween, LEAVE_LABELS, LEAVE_STATUS, pluralAz, initials } from '../../lib/format.js';
import {
  openLeaveForm, confirmDecideLeave, confirmDeleteLeave
} from '../forms.js';

export default function renderLeaves(root, ctx) {
  const { role, leaves, employees, employee } = ctx;
  const isOwner = role === 'owner';

  const pending = leaves.filter((l) => l.status === 'pending');
  const approved = leaves.filter((l) => l.status === 'approved');
  const rejected = leaves.filter((l) => l.status === 'rejected');

  const approvedDays = approved.reduce((s, l) => s + daysBetween(l.start_date, l.end_date), 0);

  root.innerHTML = `
    <div class="grid grid--stats" style="margin-bottom:14px">
      <article class="stat stat--brand">
        <div class="stat__top"><span class="stat__label">Təsdiqlənmiş</span><span class="stat__icon">${icon('i-check-circle', 16)}</span></div>
        <div class="stat__value">${approved.length}</div>
        <div class="stat__hint">${approvedDays} gün cəmi</div>
      </article>
      <article class="stat ${pending.length ? 'stat--danger' : ''}">
        <div class="stat__top"><span class="stat__label">Cavab gözləyir</span><span class="stat__icon stat__icon--warn">${icon('i-clock', 16)}</span></div>
        <div class="stat__value">${pending.length}</div>
        <div class="stat__hint">${pending.length ? 'Qərar verilməlidir' : 'Hamısı həll olunub'}</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">Rədd edilmiş</span><span class="stat__icon stat__icon--danger">${icon('i-minus', 16)}</span></div>
        <div class="stat__value">${rejected.length}</div>
        <div class="stat__hint">Rədd edilən istəklər</div>
      </article>
      <article class="stat">
        <div class="stat__top"><span class="stat__label">Ümumi istək</span><span class="stat__icon stat__icon--info">${icon('i-calendar', 16)}</span></div>
        <div class="stat__value">${leaves.length}</div>
        <div class="stat__hint">Bütün tarixçə</div>
      </article>
    </div>

    <div class="toolbar">
      <span class="toolbar__count">${pluralAz(leaves.length, 'istək', 'istək')}</span>
      <span class="spacer"></span>
      <button class="btn btn--primary btn--sm" type="button" id="lv-add">
        ${icon('i-plus', 16)} ${isOwner ? 'İstək əlavə et' : 'Məzuniyyət istə'}
      </button>
    </div>

    ${pending.length && isOwner ? `
      <section class="card" style="margin-bottom:14px;border-color:color-mix(in srgb, var(--warn) 40%, var(--line))">
        <div class="card__head">
          <div>
            <h3 class="card__title">Qərar gözləyən istəklər</h3>
            <p class="card__sub">Təsdiqləyin və ya rədd edin</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          <div class="list">
            ${pending.map((l) => `
              <div class="list-row">
                <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(l.employees?.full_name || '?'))}</span>
                <div class="list-row__main">
                  <div class="list-row__title">${escapeHtml(l.employees?.full_name || '—')} · ${escapeHtml(LEAVE_LABELS[l.kind] || l.kind)}</div>
                  <div class="list-row__sub">
                    ${dateShort(l.start_date)} – ${dateShort(l.end_date)} · ${daysBetween(l.start_date, l.end_date)} gün
                    ${l.reason ? ' · ' + escapeHtml(l.reason) : ''}
                  </div>
                </div>
                <div class="row-actions" style="flex:none">
                  <button class="btn btn--soft btn--sm" type="button" data-approve="${escapeHtml(l.id)}">${icon('i-check', 14)} Təsdiqlə</button>
                  <button class="btn btn--danger-ghost btn--sm" type="button" data-reject="${escapeHtml(l.id)}">Rədd et</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    ` : ''}

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">Bütün istəklər</h3>
          <p class="card__sub">Ən yenilər əvvəldə</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        ${leaves.length ? `
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  ${isOwner ? '<th>İşçi</th>' : ''}
                  <th>Növ</th>
                  <th>Tarixlər</th>
                  <th class="num">Gün</th>
                  <th>Vəziyyət</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${leaves.map((l) => {
                  const st = LEAVE_STATUS[l.status] || LEAVE_STATUS.pending;
                  return `
                    <tr>
                      ${isOwner ? `<td><strong>${escapeHtml(l.employees?.full_name || '—')}</strong></td>` : ''}
                      <td>${escapeHtml(LEAVE_LABELS[l.kind] || l.kind)}</td>
                      <td class="tiny">${dateShort(l.start_date)} – ${dateShort(l.end_date)}</td>
                      <td class="num">${daysBetween(l.start_date, l.end_date)}</td>
                      <td><span class="badge ${st.cls}">${st.label}</span></td>
                      <td>
                        <div class="row-actions">
                          ${isOwner && l.status === 'pending' ? `
                            <button class="iconbtn iconbtn--sm" type="button" title="Təsdiqlə"
                              data-approve="${escapeHtml(l.id)}">${icon('i-check', 15)}</button>
                          ` : ''}
                          <button class="iconbtn iconbtn--sm" type="button" title="Sil"
                            data-del="${escapeHtml(l.id)}">${icon('i-trash', 15)}</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : emptyState({
          title: 'Hələ istək yoxdur',
          message: isOwner
            ? 'İşçilər öz kabinetlərindən istək göndərə bilər, yaxud siz əl ilə əlavə edin.'
            : 'Məzuniyyətə çıxmaq lazımdırsa, istək göndərin.',
          iconName: 'i-calendar',
          action: `<button class="btn btn--primary" type="button" id="lv-add2">${icon('i-plus', 16)} İstək əlavə et</button>`
        })}
      </div>
    </section>
  `;

  const addLeave = () => {
    if (isOwner) openLeaveForm({ employees, onSaved: ctx.refresh });
    else openLeaveForm({ employeeId: employee?.id, onSaved: ctx.refresh });
  };

  root.querySelector('#lv-add')?.addEventListener('click', addLeave);
  root.querySelector('#lv-add2')?.addEventListener('click', addLeave);

  root.querySelectorAll('[data-approve]').forEach((b) => {
    b.addEventListener('click', () => {
      const leave = leaves.find((l) => l.id === b.dataset.approve);
      if (leave) confirmDecideLeave(leave, 'approved', ctx.refresh);
    });
  });

  root.querySelectorAll('[data-reject]').forEach((b) => {
    b.addEventListener('click', () => {
      const leave = leaves.find((l) => l.id === b.dataset.reject);
      if (leave) confirmDecideLeave(leave, 'rejected', ctx.refresh);
    });
  });

  root.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', () => {
      const leave = leaves.find((l) => l.id === b.dataset.del);
      if (leave) confirmDeleteLeave(leave, ctx.refresh);
    });
  });
}
