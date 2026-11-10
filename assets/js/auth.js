/* ============================================================================
   RahatHesab — Autentifikasiya ekranı
   ========================================================================== */

import { $, $$, icon, toast, showError, setLoading, isEmail } from './lib/dom.js';
import { signIn, signUp, resetPassword, friendlyError } from './lib/store.js';

const TITLES = {
  login: 'Xoş gəlmisiniz',
  register: 'Hesab yaradın',
  reset: 'Şifrə bərpası'
};

let onAuthenticated = null;

export function initAuth(handler) {
  onAuthenticated = handler;

  const yearEl = $('#auth-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  $$('[data-auth-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.authTab));
  });

  // Şifrə göstər/gizlət
  $$('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Şifrəni gizlət' : 'Şifrəni göstər');
      btn.innerHTML = icon(show ? 'i-eye-off' : 'i-eye', 18);
    });
  });

  const pw = $('#reg-password');
  if (pw) pw.addEventListener('input', () => updateMeter(pw.value));

  const loginForm = $('#login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const registerForm = $('#register-form');
  if (registerForm) registerForm.addEventListener('submit', handleRegister);

  const resetForm = $('#reset-form');
  if (resetForm) resetForm.addEventListener('submit', handleReset);

  const forgot = $('#forgot-password');
  if (forgot) {
    forgot.addEventListener('click', () => {
      const emailInput = $('#login-email');
      switchTab('reset');
      const resetEmail = $('#reset-email');
      if (resetEmail && emailInput && emailInput.value) resetEmail.value = emailInput.value;
      setTimeout(() => resetEmail?.focus(), 60);
    });
  }
}

export function switchTab(tab) {
  const name = TITLES[tab] ? tab : 'login';

  $$('[data-auth-tab]').forEach((btn) => {
    if (btn.classList.contains('segmented__btn')) {
      const active = btn.dataset.authTab === name;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });

  $('#login-form').hidden = name !== 'login';
  $('#register-form').hidden = name !== 'register';
  $('#reset-form').hidden = name !== 'reset';

  $$('#login-error, #register-error, #reset-error, #reset-success, #register-success').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });

  const focusMap = { login: '#login-email', register: '#reg-name', reset: '#reset-email' };
  setTimeout(() => $(focusMap[name])?.focus({ preventScroll: true }), 50);
}

export function showAuth() {
  $('#boot-screen').hidden = true;
  $('#fatal-screen').hidden = true;
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  document.title = 'Daxil ol — RahatHesab';
}

function updateMeter(value) {
  const meter = $('#pw-meter');
  if (!meter) return;
  const v = String(value || '');
  let score = 0;
  if (v.length >= 8) score += 1;
  if (v.length >= 12) score += 1;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score += 1;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score += 1;
  if (!v) score = 0;
  meter.setAttribute('data-level', String(Math.min(4, score)));
}

/* ------------------------------- LOGIN ---------------------------------- */

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submit = $('#login-submit');
  const errorBox = $('#login-error');

  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;

  showError(errorBox, '');

  if (!email) return showError(errorBox, 'E-poçt ünvanını daxil edin.');
  if (!isEmail(email)) return showError(errorBox, 'E-poçt ünvanı düzgün formatda deyil.');
  if (!password) return showError(errorBox, 'Şifrənizi daxil edin.');

  setLoading(submit, true);
  try {
    const session = await signIn(email, password);
    if (!session) throw new Error('Sessiya yaradılmadı.');

    form.reset();
    toast('Xoş gəlmisiniz!', 'ok');
    if (typeof onAuthenticated === 'function') await onAuthenticated(session);
  } catch (err) {
    console.error('[auth] login failed', err);
    showError(errorBox, friendlyError(err));
  } finally {
    setLoading(submit, false);
  }
}

/* ------------------------------ REGISTER -------------------------------- */

async function handleRegister(event) {
  event.preventDefault();

  const submit = $('#register-submit');
  const errorBox = $('#register-error');
  const successBox = $('#register-success');

  const fullName = $('#reg-name').value.trim();
  const email = $('#reg-email').value.trim();
  const password = $('#reg-password').value;
  const password2 = $('#reg-password2').value;
  const terms = $('#reg-terms').checked;

  showError(errorBox, '');
  showError(successBox, '');

  if (fullName.length < 2) return showError(errorBox, 'Ad və soyadınızı tam yazın.');
  if (!isEmail(email)) return showError(errorBox, 'Düzgün e-poçt ünvanı daxil edin.');
  if (password.length < 8) return showError(errorBox, 'Şifrə ən azı 8 simvol olmalıdır.');
  if (password !== password2) return showError(errorBox, 'Şifrələr uyğun gəlmir.');
  if (!terms) return showError(errorBox, 'Davam etmək üçün razılıq qeydini işarələyin.');

  setLoading(submit, true);
  try {
    const result = await signUp(email, password, fullName);

    if (result?.session) {
      $('#register-form').reset();
      updateMeter('');
      toast('Hesab yaradıldı!', 'ok');
      if (typeof onAuthenticated === 'function') await onAuthenticated(result.session);
    } else {
      $('#register-form').reset();
      updateMeter('');
      switchTab('login');
      const loginEmail = $('#login-email');
      if (loginEmail) loginEmail.value = email;
      showError(
        successBox,
        'Qeydiyyat tamamlandı. ' + email + ' ünvanına təsdiq linki göndərdik. Linki açıb daxil olun.'
      );
      toast('Təsdiq linki göndərildi. Poçtunuzu yoxlayın.', 'info', 7000);
    }
  } catch (err) {
    console.error('[auth] register failed', err);
    showError(errorBox, friendlyError(err));
  } finally {
    setLoading(submit, false);
  }
}

/* -------------------------------- RESET --------------------------------- */

async function handleReset(event) {
  event.preventDefault();

  const submit = $('#reset-submit');
  const errorBox = $('#reset-error');
  const successBox = $('#reset-success');
  const email = $('#reset-email').value.trim();

  showError(errorBox, '');
  showError(successBox, '');

  if (!isEmail(email)) return showError(errorBox, 'Düzgün e-poçt ünvanı daxil edin.');

  setLoading(submit, true);
  try {
    await resetPassword(email);
    showError(successBox, 'Bərpa linki ' + email + ' ünvanına göndərildi.');
  } catch (err) {
    console.error('[auth] reset failed', err);
    showError(errorBox, friendlyError(err));
  } finally {
    setLoading(submit, false);
  }
}
