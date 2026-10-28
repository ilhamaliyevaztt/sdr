/* ============================================================================
   Hesab — Forma modalları (işçi, ödəniş, biznes)
   ========================================================================== */

import { $, $$, icon, openModal, closeModal, toast, setLoading, escapeHtml, isEmail, confirmDialog } from '../lib/dom.js';
import {
  createEmployee,
  updateEmployee,
  createPayment,
  updatePayment,
  deletePayment,
  deleteEmployee,
  createBusiness,
  updateBusiness,
  friendlyError
} from '../lib/store.js';
import { todayISO, money, KIND_LABELS, METHOD_LABELS, dateShort, toNumber } from '../lib/format.js';

/* ------------------------------- İŞÇİ ------------------------------------ */

export function openEmployeeForm({ businessId, employee = null, currency = 'AZN', onSaved }) {
  const isEdit = !!employee;
  const e = employee || {};

  openModal({
    title: isEdit ? 'İşçini redaktə et' : 'Yeni işçi',
    subtitle: isEdit ? 'Məlumatları yeniləyin' : 'İşçinin əsas məlumatlarını daxil edin',
    body: `
      <form id="employee-form" class="form-grid" novalidate>
        <div class="field span-2">
          <label for="emp-name">Ad və soyad <span aria-hidden="true" style="color:var(--danger)">*</span></label>
          <div class="field__control">
            ${icon('i-user', 18)}
            <input id="emp-name" name="full_name" type="text" autocomplete="off" placeholder="Məsələn: Nigar Əliyeva"
              value="${escapeHtml(e.full_name || '')}" required />
          </div>
        </div>

        <div class="field">
          <label for="emp-position">Vəzifə</label>
          <div class="field__control">
            ${icon('i-briefcase', 18)}
            <input id="emp-position" name="position" type="text" autocomplete="off" placeholder="Satış meneceri"
              value="${escapeHtml(e.position || '')}" />
          </div>
        </div>

        <div class="field">
          <label for="emp-salary">Aylıq maaş (${escapeHtml(currency)}) <span aria-hidden="true" style="color:var(--danger)">*</span></label>
          <div class="field__control">
            ${icon('i-banknote', 18)}
            <input id="emp-salary" name="monthly_salary" type="number" inputmode="decimal" min="0" step="0.01"
              placeholder="0.00" value="${e.monthly_salary !== undefined && e.monthly_salary !== null ? Number(e.monthly_salary) : ''}" required />
          </div>
        </div>

        <div class="field">
          <label for="emp-email">E-poçt</label>
          <div class="field__control">
            ${icon('i-mail', 18)}
            <input id="emp-email" name="email" type="email" autocomplete="off" placeholder="isci@biznes.az"
              value="${escapeHtml(e.email || '')}" />
          </div>
          <p class="field__hint">İşçi bu e-poçtla qeydiyyatdan keçsə, öz kabinetinə giriş əldə edəcək.</p>
        </div>

        <div class="field">
          <label for="emp-phone">Telefon</label>
          <div class="field__control">
            ${icon('i-receipt', 18)}
            <input id="emp-phone" name="phone" type="tel" autocomplete="off" placeholder="+994 50 000 00 00"
              value="${escapeHtml(e.phone || '')}" />
          </div>
        </div>

        <div class="field">
          <label for="emp-hire">İşə qəbul tarixi</label>
          <div class="field__control">
            ${icon('i-calendar', 18)}
            <input id="emp-hire" name="hire_date" type="date" value="${escapeHtml(e.hire_date || todayISO())}" />
          </div>
        </div>

        <div class="field span-2">
          <label for="emp-notes">Qeyd</label>
          <div class="field__control field__control--area">
            <textarea id="emp-notes" name="notes" placeholder="Əlavə qeydlər (istəyə bağlı)">${escapeHtml(e.notes || '')}</textarea>
          </div>
        </div>

        <div class="field span-2">
          <label class="checkbox">
            <input type="checkbox" id="emp-active" name="is_active" ${e.is_active === false ? '' : 'checked'} />
            <span>Aktiv işçidir (maaş hesablamasına daxil edilir)</span>
          </label>
        </div>

        <p class="form-error span-2" id="employee-error" role="alert" hidden></p>
      </form>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-modal-close>Ləğv et</button>
      <button class="btn btn--primary" type="button" id="employee-save">${isEdit ? 'Yadda saxla' : 'İşçi əlavə et'}</button>
    `,
    onMount: (modal) => {
      const saveBtn = $('#employee-save', modal);
      const errBox = $('#employee-error', modal);
      const form = $('#employee-form', modal);

      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        saveBtn.click();
      });

      saveBtn.addEventListener('click', async () => {
        errBox.hidden = true;

        const fullName = $('#emp-name', modal).value.trim();
        const salaryRaw = $('#emp-salary', modal).value.trim();
        const email = $('#emp-email', modal).value.trim();

        if (fullName.length < 2) return showErr(errBox, 'İşçinin adını tam yazın.');
        if (salaryRaw === '') return showErr(errBox, 'Aylıq maaşı daxil edin.');
        if (toNumber(salaryRaw) < 0) return showErr(errBox, 'Maaş mənfi ola bilməz.');
        if (email && !isEmail(email)) return showErr(errBox, 'E-poçt ünvanı düzgün deyil.');
        if (!businessId) return showErr(errBox, 'Biznes tapılmadı.');

        const payload = {
          full_name: fullName,
          position: $('#emp-position', modal).value.trim(),
          monthly_salary: toNumber(salaryRaw),
          email,
          phone: $('#emp-phone', modal).value.trim(),
          hire_date: $('#emp-hire', modal).value || todayISO(),
          is_active: $('#emp-active', modal).checked,
          notes: $('#emp-notes', modal).value.trim()
        };

        setLoading(saveBtn, true);
        try {
          if (isEdit) {
            await updateEmployee(employee.id, payload);
            toast('İşçi məlumatları yeniləndi.', 'ok');
          } else {
            await createEmployee(businessId, payload);
            toast('Yeni işçi əlavə edildi.', 'ok');
          }
          closeModal(true);
          if (typeof onSaved === 'function') await onSaved();
        } catch (err) {
          console.error('[employee] save failed', err);
          showErr(errBox, friendlyError(err));
        } finally {
          setLoading(saveBtn, false);
        }
      });
    }
  });
}

function showErr(box, message) {
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

/* ------------------------------ ÖDƏNİŞ ----------------------------------- */

export function openPaymentForm({
  employees,
  payments = [],
  employee = null,
  currency = 'AZN',
  presetKind = 'salary',
  onSaved
}) {
  const list = (employees || []).filter((x) => x.is_active || (employee && x.id === employee.id));
  if (!list.length) {
    toast('Əvvəlcə işçi əlavə edin.', 'info');
    return;
  }

  const selectedId = employee?.id || list[0].id;
  const isEdit = false;

  const options = list
    .map((x) => `<option value="${x.id}"${x.id === selectedId ? ' selected' : ''}>${escapeHtml(x.full_name)}${x.position ? ' — ' + escapeHtml(x.position) : ''}</option>`)
    .join('');

  const kindOptions = Object.keys(KIND_LABELS)
    .map((k) => `<option value="${k}"${k === presetKind ? ' selected' : ''}>${KIND_LABELS[k]}</option>`)
    .join('');

  const methodOptions = Object.keys(METHOD_LABELS)
    .map((m) => `<option value="${m}"${m === 'cash' ? ' selected' : ''}>${METHOD_LABELS[m]}</option>`)
    .join('');

  openModal({
    title: 'Ödəniş qeyd et',
    subtitle: 'Avans, maaş və ya mükafat əlavə edin',
    body: `
      <form id="payment-form" class="form-grid" novalidate>
        <div class="field span-2">
          <label for="pay-employee">İşçi <span aria-hidden="true" style="color:var(--danger)">*</span></label>
          <div class="field__control field--select select-wrap">
            ${icon('i-users', 18)}
            <select id="pay-employee" name="employee_id">${options}</select>
          </div>
        </div>

        <div class="field">
          <label for="pay-kind">Növ <span aria-hidden="true" style="color:var(--danger)">*</span></label>
          <div class="field__control field--select select-wrap">
            ${icon('i-receipt', 18)}
            <select id="pay-kind" name="kind">${kindOptions}</select>
          </div>
        </div>

        <div class="field">
          <label for="pay-amount">Məbləğ (${escapeHtml(currency)}) <span aria-hidden="true" style="color:var(--danger)">*</span></label>
          <div class="field__control">
            ${icon('i-banknote', 18)}
            <input id="pay-amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0.00" required />
          </div>
        </div>

        <div class="field">
          <label for="pay-date">Ödəniş tarixi</label>
          <div class="field__control">
            ${icon('i-calendar', 18)}
            <input id="pay-date" name="paid_at" type="date" value="${todayISO()}" />
          </div>
        </div>

        <div class="field">
          <label for="pay-method">Ödəniş üsulu</label>
          <div class="field__control field--select select-wrap">
            ${icon('i-wallet', 18)}
            <select id="pay-method" name="method">${methodOptions}</select>
          </div>
        </div>

        <div class="field span-2">
          <label for="pay-note">Qeyd</label>
          <div class="field__control field__control--area">
            <textarea id="pay-note" name="note" placeholder="Məsələn: mart ayı üçün avans"></textarea>
          </div>
        </div>

        <div class="span-2" id="pay-preview"></div>
        <p class="form-error span-2" id="payment-error" role="alert" hidden></p>
      </form>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-modal-close>Ləğv et</button>
      <button class="btn btn--primary" type="button" id="payment-save">Qeyd et</button>
    `,
    onMount: (modal) => {
      const empSelect = $('#pay-employee', modal);
      const amountInput = $('#pay-amount', modal);
      const kindSelect = $('#pay-kind', modal);
      const preview = $('#pay-preview', modal);
      const errBox = $('#payment-error', modal);
      const saveBtn = $('#payment-save', modal);
      const form = $('#payment-form', modal);

      const balanceOf = (id) => {
        const rows = payments.filter((p) => p.employee_id === id);
        const paid = rows
          .filter((p) => p.kind !== 'deduction')
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        return { paid, count: rows.length };
      };

      const renderPreview = () => {
        const id = empSelect.value;
        const emp = list.find((x) => x.id === id);
        if (!emp) {
          preview.innerHTML = '';
          return;
        }
        const info = balanceOf(id);
        const salary = Number(emp.monthly_salary || 0);
        preview.innerHTML = `
          <div class="alert alert--soft" style="align-items:center;gap:12px">
            ${icon('i-info', 18)}
            <span>
              <strong>${escapeHtml(emp.full_name)}</strong> — aylıq maaş ${money(salary, currency)}.
              Bu işçiyə indiyə qədər ${money(info.paid, currency)} ödəniş qeydə alınıb
              (${info.count} əməliyyat).
            </span>
          </div>
        `;
      };

      empSelect.addEventListener('change', renderPreview);
      renderPreview();

      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        saveBtn.click();
      });

      saveBtn.addEventListener('click', async () => {
        errBox.hidden = true;
        const employeeId = empSelect.value;
        const amount = toNumber(amountInput.value);
        const kind = kindSelect.value;
        const paidAt = $('#pay-date', modal).value || todayISO();

        if (!employeeId) return showErr(errBox, 'İşçi seçin.');
        if (!amountInput.value.trim()) return showErr(errBox, 'Məbləği daxil edin.');
        if (amount <= 0) return showErr(errBox, 'Məbləğ sıfırdan böyük olmalıdır.');

        setLoading(saveBtn, true);
        try {
          await createPayment({
            employee_id: employeeId,
            kind,
            amount,
            paid_at: paidAt,
            period: paidAt.slice(0, 7),
            method: $('#pay-method', modal).value,
            note: $('#pay-note', modal).value.trim()
          });
          toast(`${KIND_LABELS[kind]} uğurla qeyd edildi.`, 'ok');
          closeModal(true);
          if (typeof onSaved === 'function') await onSaved();
        } catch (err) {
          console.error('[payment] save failed', err);
          showErr(errBox, friendlyError(err));
        } finally {
          setLoading(saveBtn, false);
        }
      });
    }
  });
}

/* --------------------------- ÖDƏNİŞ REDAKTƏ ------------------------------ */

export function openPaymentEdit({ payment, employees, currency = 'AZN', onSaved }) {
  const options = (employees || [])
    .map((x) => `<option value="${x.id}"${x.id === payment.employee_id ? ' selected' : ''}>${escapeHtml(x.full_name)}</option>`)
    .join('');

  const kindOptions = Object.keys(KIND_LABELS)
    .map((k) => `<option value="${k}"${k === payment.kind ? ' selected' : ''}>${KIND_LABELS[k]}</option>`)
    .join('');

  const methodOptions = Object.keys(METHOD_LABELS)
    .map((m) => `<option value="${m}"${m === payment.method ? ' selected' : ''}>${METHOD_LABELS[m]}</option>`)
    .join('');

  openModal({
    title: 'Ödənişi redaktə et',
    subtitle: `${dateShort(payment.paid_at)} tarixli qeyd`,
    body: `
      <form id="payment-edit-form" class="form-grid" novalidate>
        <div class="field span-2">
          <label for="pe-employee">İşçi</label>
          <div class="field__control field--select select-wrap">
            ${icon('i-users', 18)}
            <select id="pe-employee" name="employee_id">${options}</select>
          </div>
        </div>
        <div class="field">
          <label for="pe-kind">Növ</label>
          <div class="field__control field--select select-wrap">
            ${icon('i-receipt', 18)}
            <select id="pe-kind" name="kind">${kindOptions}</select>
          </div>
        </div>
        <div class="field">
          <label for="pe-amount">Məbləğ (${escapeHtml(currency)})</label>
          <div class="field__control">
            ${icon('i-banknote', 18)}
            <input id="pe-amount" name="amount" type="number" min="0.01" step="0.01" value="${Number(payment.amount)}" required />
          </div>
        </div>
        <div class="field">
          <label for="pe-date">Tarix</label>
          <div class="field__control">
            ${icon('i-calendar', 18)}
            <input id="pe-date" name="paid_at" type="date" value="${escapeHtml(payment.paid_at || '')}" />
          </div>
        </div>
        <div class="field">
          <label for="pe-method">Üsul</label>
          <div class="field__control field--select select-wrap">
            ${icon('i-wallet', 18)}
            <select id="pe-method" name="method">${methodOptions}</select>
          </div>
        </div>
        <div class="field span-2">
          <label for="pe-note">Qeyd</label>
          <div class="field__control field__control--area">
            <textarea id="pe-note" name="note">${escapeHtml(payment.note || '')}</textarea>
          </div>
        </div>
        <p class="form-error span-2" id="payment-edit-error" role="alert" hidden></p>
      </form>
    `,
    footer: `
      <button class="btn btn--danger btn--sm" type="button" id="pe-delete">${icon('i-trash', 15)} Sil</button>
      <span class="spacer"></span>
      <button class="btn btn--ghost" type="button" data-modal-close>Ləğv et</button>
      <button class="btn btn--primary" type="button" id="pe-save">Yadda saxla</button>
    `,
    onMount: (modal) => {
      const errBox = $('#payment-edit-error', modal);
      const saveBtn = $('#pe-save', modal);
      const delBtn = $('#pe-delete', modal);

      saveBtn.addEventListener('click', async () => {
        errBox.hidden = true;
        const amount = toNumber($('#pe-amount', modal).value);
        if (amount <= 0) return showErr(errBox, 'Məbləğ sıfırdan böyük olmalıdır.');

        setLoading(saveBtn, true);
        try {
          await updatePayment(payment.id, {
            employee_id: $('#pe-employee', modal).value,
            kind: $('#pe-kind', modal).value,
            amount,
            paid_at: $('#pe-date', modal).value || todayISO(),
            period: ($('#pe-date', modal).value || todayISO()).slice(0, 7),
            method: $('#pe-method', modal).value,
            note: $('#pe-note', modal).value.trim()
          });
          toast('Ödəniş yeniləndi.', 'ok');
          closeModal(true);
          if (typeof onSaved === 'function') await onSaved();
        } catch (err) {
          console.error('[payment] update failed', err);
          showErr(errBox, friendlyError(err));
        } finally {
          setLoading(saveBtn, false);
        }
      });

      delBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Ödənişi sil',
          message: 'Bu ödəniş qeydi birdəfəlik silinəcək. Davam edilsin?',
          confirmText: 'Sil',
          danger: true
        });
        if (!ok) return;
        try {
          await deletePayment(payment.id);
          toast('Ödəniş silindi.', 'ok');
          closeModal(true);
          if (typeof onSaved === 'function') await onSaved();
        } catch (err) {
          console.error('[payment] delete failed', err);
          toast(friendlyError(err), 'error');
        }
      });
    }
  });
}

/* ------------------------------ BİZNES ----------------------------------- */

export function openBusinessForm({ business = null, onSaved }) {
  const isEdit = !!business;
  const b = business || {};

  const currencies = ['AZN', 'USD', 'EUR'];

  openModal({
    title: isEdit ? 'Biznes məlumatları' : 'Biznesinizi əlavə edin',
    subtitle: isEdit ? 'Məlumatları yeniləyin' : 'Bir addımda biznes profilinizi yaradın',
    body: `
      <form id="business-form" class="form-grid" novalidate>
        <div class="field span-2">
          <label for="biz-name">Biznes adı <span aria-hidden="true" style="color:var(--danger)">*</span></label>
          <div class="field__control">
            ${icon('i-building', 18)}
            <input id="biz-name" name="name" type="text" placeholder="Məsələn: Mərkəz Kafe" value="${escapeHtml(b.name || '')}" required />
          </div>
        </div>
        <div class="field">
          <label for="biz-legal">Hüquqi ad</label>
          <div class="field__control">
            ${icon('i-briefcase', 18)}
            <input id="biz-legal" name="legal_name" type="text" placeholder="MMC / Fərdi sahibkar" value="${escapeHtml(b.legal_name || '')}" />
          </div>
        </div>
        <div class="field">
          <label for="biz-currency">Valyuta</label>
          <div class="field__control field--select select-wrap">
            ${icon('i-banknote', 18)}
            <select id="biz-currency" name="currency">
              ${currencies.map((c) => `<option value="${c}"${(b.currency || 'AZN') === c ? ' selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="biz-phone">Telefon</label>
          <div class="field__control">
            ${icon('i-receipt', 18)}
            <input id="biz-phone" name="phone" type="tel" placeholder="+994 12 000 00 00" value="${escapeHtml(b.phone || '')}" />
          </div>
        </div>
        <div class="field">
          <label for="biz-email">E-poçt</label>
          <div class="field__control">
            ${icon('i-mail', 18)}
            <input id="biz-email" name="email" type="email" placeholder="info@biznes.az" value="${escapeHtml(b.email || '')}" />
          </div>
        </div>
        <div class="field span-2">
          <label for="biz-address">Ünvan</label>
          <div class="field__control">
            ${icon('i-building', 18)}
            <input id="biz-address" name="address" type="text" placeholder="Bakı, Nizami küç. 203" value="${escapeHtml(b.address || '')}" />
          </div>
        </div>
        <p class="form-error span-2" id="business-error" role="alert" hidden></p>
      </form>
    `,
    footer: `
      ${isEdit ? '<button class="btn btn--ghost" type="button" data-modal-close>Ləğv et</button>' : ''}
      <button class="btn btn--primary" type="button" id="business-save">${isEdit ? 'Yadda saxla' : 'Biznesi yarat'}</button>
    `,
    closable: isEdit,
    onMount: (modal) => {
      const errBox = $('#business-error', modal);
      const saveBtn = $('#business-save', modal);

      saveBtn.addEventListener('click', async () => {
        errBox.hidden = true;
        const name = $('#biz-name', modal).value.trim();
        if (name.length < 2) return showErr(errBox, 'Biznes adını daxil edin.');

        const email = $('#biz-email', modal).value.trim();
        if (email && !isEmail(email)) return showErr(errBox, 'E-poçt ünvanı düzgün deyil.');

        const payload = {
          name,
          legal_name: $('#biz-legal', modal).value.trim(),
          currency: $('#biz-currency', modal).value,
          phone: $('#biz-phone', modal).value.trim(),
          email,
          address: $('#biz-address', modal).value.trim()
        };

        setLoading(saveBtn, true);
        try {
          if (isEdit) {
            await updateBusiness(business.id, payload);
            toast('Biznes məlumatları yeniləndi.', 'ok');
          } else {
            await createBusiness(payload);
            toast('Biznes yaradıldı. Xoş gəlmisiniz!', 'ok');
          }
          closeModal(true);
          if (typeof onSaved === 'function') await onSaved();
        } catch (err) {
          console.error('[business] save failed', err);
          showErr(errBox, friendlyError(err));
        } finally {
          setLoading(saveBtn, false);
        }
      });
    }
  });
}

/* --------------------------- İŞÇİ SİLMƏ ---------------------------------- */

export async function confirmDeleteEmployee(employee, onDone) {
  const ok = await confirmDialog({
    title: 'İşçini sil',
    message: `${employee.full_name} və onun bütün ödəniş tarixçəsi silinəcək. Bu əməliyyat geri qaytarıla bilməz.`,
    confirmText: 'Sil',
    danger: true
  });
  if (!ok) return false;
  try {
    await deleteEmployee(employee.id);
    toast('İşçi silindi.', 'ok');
    if (typeof onDone === 'function') await onDone();
    return true;
  } catch (err) {
    console.error('[employee] delete failed', err);
    toast(friendlyError(err), 'error');
    return false;
  }
}
