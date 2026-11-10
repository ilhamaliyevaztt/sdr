/* ============================================================================
   RahatHesab — DOM köməkçiləri (modal, toast, ikon, forma, clipboard)
   ========================================================================== */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** SVG sprite ikonu */
export function icon(name, size = 20, cls = '') {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"${cls ? ` class="${cls}"` : ''} aria-hidden="true" focusable="false"><use href="#${name}"></use></svg>`;
}

export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ------------------------------ TOAST ----------------------------------- */

export function toast(message, type = 'ok', timeout = 4200) {
  const root = $('#toast-root');
  if (!root) return () => {};

  const map = {
    ok: { icon: 'i-check-circle', cls: 'toast--ok' },
    error: { icon: 'i-alert', cls: 'toast--error' },
    info: { icon: 'i-info', cls: 'toast--info' }
  };
  const cfg = map[type] || map.ok;

  const node = document.createElement('div');
  node.className = `toast ${cfg.cls}`;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');
  node.innerHTML = `
    <span class="toast__icon">${icon(cfg.icon, 18)}</span>
    <span class="toast__text">${escapeHtml(message)}</span>
    <button class="toast__close" type="button" aria-label="Bağla">${icon('i-close', 15)}</button>
  `;

  const remove = () => {
    if (!node.isConnected) return;
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 220);
  };

  node.querySelector('.toast__close').addEventListener('click', remove);
  root.appendChild(node);

  while (root.children.length > 4) root.firstElementChild.remove();
  if (timeout > 0) setTimeout(remove, timeout);
  return remove;
}

/* ------------------------------ MODAL ----------------------------------- */

let activeModal = null;
let lastFocused = null;

export function openModal({ title, subtitle = '', body = '', footer = '', wide = false, onMount, onClose, closable = true }) {
  const root = $('#modal-root');
  if (!root) return null;

  closeModal(true);
  lastFocused = document.activeElement;

  const wrap = document.createElement('div');
  wrap.className = 'modal' + (wide ? ' modal--wide' : '');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'modal-title');

  wrap.innerHTML = `
    <div class="modal__head">
      <div>
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${closable ? `<button class="iconbtn iconbtn--sm" type="button" data-modal-close aria-label="Bağla">${icon('i-close', 17)}</button>` : ''}
    </div>
    <div class="modal__body">${body}</div>
    ${footer ? `<div class="modal__foot">${footer}</div>` : ''}
  `;

  root.innerHTML = '';
  root.appendChild(wrap);
  root.hidden = false;
  document.body.style.overflow = 'hidden';

  const onKey = (e) => {
    if (e.key === 'Escape' && closable) {
      e.preventDefault();
      closeModal();
    }
    if (e.key === 'Tab') trapFocus(e, wrap);
  };
  document.addEventListener('keydown', onKey);

  const onBackdrop = (e) => {
    if (e.target === root && activeModal && activeModal.closable) closeModal();
  };

  const onCloseClick = (e) => {
    const btn = e.target.closest('[data-modal-close]');
    if (btn && activeModal && activeModal.closable) closeModal();
  };

  wrap.addEventListener('click', onCloseClick);
  bindModalRoot(onBackdrop);

  activeModal = { wrap, onKey, onClose: onClose || null, closable };

  if (typeof onMount === 'function') onMount(wrap);

  const first = wrap.querySelector('input, select, textarea, button:not([data-modal-close])');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 40);

  return wrap;
}

export function closeModal(silent = false) {
  const root = $('#modal-root');
  if (!root || root.hidden) return;

  if (activeModal) {
    document.removeEventListener('keydown', activeModal.onKey);
    if (!silent && typeof activeModal.onClose === 'function') activeModal.onClose();
  }

  root.hidden = true;
  root.innerHTML = '';
  document.body.style.overflow = '';
  activeModal = null;

  if (lastFocused && lastFocused.isConnected) {
    lastFocused.focus({ preventScroll: true });
    lastFocused = null;
  }
}

let modalRootBound = false;

function bindModalRoot(handler) {
  const root = $('#modal-root');
  if (!root || modalRootBound) return;
  root.addEventListener('mousedown', handler);
  modalRootBound = true;
}

function trapFocus(e, container) {
  const nodes = $$(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    container
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* --------------------------- CONFIRM DIALOG ------------------------------ */

export function confirmDialog({ title, message, confirmText = 'Təsdiqlə', cancelText = 'Ləğv et', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    openModal({
      title,
      body: `<p style="font-size:13.5px;line-height:1.65;color:var(--ink-2)">${escapeHtml(message)}</p>`,
      footer: `
        <button class="btn btn--ghost" type="button" data-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm>${escapeHtml(confirmText)}</button>
      `,
      onClose: () => finish(false),
      onMount: (m) => {
        m.querySelector('[data-cancel]').addEventListener('click', () => {
          finish(false);
          closeModal(true);
        });
        m.querySelector('[data-confirm]').addEventListener('click', () => {
          finish(true);
          closeModal(true);
        });
      }
    });
  });
}

/* ------------------------------ FORM HELPERS ----------------------------- */

export function setLoading(button, loading) {
  if (!button) return;
  button.classList.toggle('is-loading', !!loading);
  button.disabled = !!loading;
}

export function showError(container, message) {
  if (!container) return;
  if (!message) {
    container.hidden = true;
    container.textContent = '';
    return;
  }
  container.textContent = message;
  container.hidden = false;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function isEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

export function debounce(fn, wait = 220) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function emptyState({ title, message, iconName = 'i-empty-box', action = '' }) {
  return `
    <div class="empty">
      <div class="empty__icon">${icon(iconName, 24)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${action}
    </div>
  `;
}

/* ------------------------------ CLIPBOARD -------------------------------- */

export async function copyText(text) {
  const value = String(text || '');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {
    /* fallback aşağıda */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

/* ------------------------------ FILE HELPERS ----------------------------- */

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Fayl seçdirib mətnini qaytarır (CSV import üçün) */
export function pickFile(accept = '.csv,text/csv') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) {
        input.remove();
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        input.remove();
        resolve({ name: file.name, text });
      } catch (_) {
        input.remove();
        resolve(null);
      }
    });
    input.click();
  });
}

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
