/* ============================================================================
   RahatHesab — Tənzimləmələr (sahibkar)
   ========================================================================== */

import { icon, escapeHtml, toast, copyText, confirmDialog } from '../../lib/dom.js';
import {
  updateProfile, changePassword, friendlyError, rotateJoinCode
} from '../../lib/store.js';
import { openBusinessForm, openBusinessJoinCode } from '../forms.js';
import { money, dateShort, CURRENCIES } from '../../lib/format.js';
import { setLoading } from '../../lib/dom.js';

export default function renderSettings(root, ctx) {
  const { business, profile, state, currency, employees, reloadSpaces, refresh } = ctx;
  const user = state.user || {};
  const name = (profile && profile.full_name) || (user.user_metadata && user.user_metadata.full_name) || '';

  root.innerHTML = `
    <div class="grid grid--2">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Biznes profili</h3>
            <p class="card__sub">Ad, valyuta, maaş günü</p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" id="set-biz-edit">${icon('i-edit', 15)} Redaktə</button>
        </div>
        <div class="card__body">
          <dl class="kv">
            <div class="kv__row"><dt>Ad</dt><dd>${escapeHtml(business?.name || '—')}</dd></div>
            <div class="kv__row"><dt>Hüquqi ad</dt><dd>${escapeHtml(business?.legal_name || '—')}</dd></div>
            <div class="kv__row"><dt>Valyuta</dt><dd>${escapeHtml(business?.currency || 'AZN')}</dd></div>
            <div class="kv__row"><dt>Maaş günü</dt><dd>Ayın ${Number(business?.pay_day || 5)}-i</dd></div>
            <div class="kv__row"><dt>Telefon</dt><dd>${escapeHtml(business?.phone || '—')}</dd></div>
            <div class="kv__row"><dt>E-poçt</dt><dd>${escapeHtml(business?.email || '—')}</dd></div>
            <div class="kv__row"><dt>Ünvan</dt><dd>${escapeHtml(business?.address || '—')}</dd></div>
            <div class="kv__row"><dt>İşçi sayı</dt><dd>${employees.length}</dd></div>
          </dl>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Kodlar</h3>
            <p class="card__sub">İşçiləri necə qoşacaqsınız</p>
          </div>
        </div>
        <div class="card__body">
          <div class="banner" style="margin-bottom:14px">
            ${icon('i-key', 18)}
            <span>
              <strong>Ən sadə üsul: hər işçinin öz kodu</strong>
              «İşçilər» bölməsində işçi kartını açın — kod orada böyük hərflərlə yazılıb.
              Kopyalayıb işçiyə göndərin.
            </span>
          </div>

          <div class="field">
            <span class="field__label">Biznesin ümumi kodu</span>
            <div class="codebox" style="margin-top:4px">
              <div style="flex:1 1 140px;min-width:0">
                <div class="codebox__code" id="set-join-code">${escapeHtml(business?.join_code || '——')}</div>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" id="set-code-copy">${icon('i-copy', 14)} Kopyala</button>
              <button class="btn btn--ghost btn--sm" type="button" id="set-code-new">${icon('i-refresh', 14)} Yenilə</button>
            </div>
            <p class="field__hint">
              Bu kod yalnız ümumi giriş üçündür. Tövsiyə olunan yol — hər işçinin şəxsi kodu.
            </p>
          </div>

          <button class="btn btn--ghost btn--block btn--sm" type="button" id="set-code-help" style="margin-top:12px">
            ${icon('i-help', 15)} Kod necə işləyir?
          </button>
        </div>
      </section>
    </div>

    <div class="grid grid--2" style="margin-top:14px">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Şəxsi məlumatlarım</h3>
            <p class="card__sub">Ad və telefon</p>
          </div>
        </div>
        <div class="card__body">
          <form id="set-profile-form" style="display:grid;gap:12px" novalidate>
            <div class="field">
              <label for="set-name">Ad və soyad</label>
              <div class="field__control">
                ${icon('i-user', 18)}
                <input id="set-name" type="text" value="${escapeHtml(name)}" placeholder="Ad Soyad" />
              </div>
            </div>
            <div class="field">
              <label for="set-phone">Telefon</label>
              <div class="field__control">
                ${icon('i-receipt', 18)}
                <input id="set-phone" type="tel" value="${escapeHtml((profile && profile.phone) || '')}" placeholder="+994 50 000 00 00" />
              </div>
            </div>
            <p class="form-error" id="set-profile-err" role="alert" hidden></p>
            <button class="btn btn--primary btn--block btn--sm" type="submit" id="set-profile-save">
              Yadda saxla
            </button>
          </form>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Şifrə</h3>
            <p class="card__sub">Hesabın təhlükəsizliyi</p>
          </div>
        </div>
        <div class="card__body">
          <form id="set-pass-form" style="display:grid;gap:12px" novalidate>
            <div class="field">
              <label for="set-pass1">Yeni şifrə</label>
              <div class="field__control">
                ${icon('i-lock', 18)}
                <input id="set-pass1" type="password" autocomplete="new-password" placeholder="Ən azı 8 simvol" />
              </div>
            </div>
            <div class="field">
              <label for="set-pass2">Təkrar</label>
              <div class="field__control">
                ${icon('i-shield', 18)}
                <input id="set-pass2" type="password" autocomplete="new-password" placeholder="Şifrəni təkrar yazın" />
              </div>
            </div>
            <p class="form-error" id="set-pass-err" role="alert" hidden></p>
            <p class="form-success" id="set-pass-ok" role="status" hidden></p>
            <button class="btn btn--ghost btn--block btn--sm" type="submit" id="set-pass-save">
              Şifrəni dəyiş
            </button>
          </form>

          <p class="tiny muted" style="margin-top:14px;line-height:1.65">
            Hesab: <b>${escapeHtml(user.email || '—')}</b><br />
            Qeydiyyat: ${dateShort(user.created_at)}
          </p>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:14px">
      <div class="card__head">
        <div>
          <h3 class="card__title">Təhlükəli zona</h3>
          <p class="card__sub">Geri qaytarıla bilməyən əməliyyatlar</p>
        </div>
      </div>
      <div class="card__body">
        <div class="banner banner--danger" style="margin-bottom:14px">
          ${icon('i-alert', 18)}
          <span>
            <strong>Diqqət</strong>
            Biznesi silsəniz, bütün işçilər, ödənişlər, davamiyyət və qeydlər də silinir.
          </span>
        </div>
        <button class="btn btn--danger-ghost btn--sm" type="button" id="set-biz-delete">
          ${icon('i-trash', 15)} «${escapeHtml(business?.name || 'Biznes')}» biznesini sil
        </button>
      </div>
    </section>
  `;

  root.querySelector('#set-biz-edit')?.addEventListener('click', () => {
    openBusinessForm({ business, onSaved: reloadSpaces });
  });

  root.querySelector('#set-code-copy')?.addEventListener('click', async () => {
    const ok = await copyText(business?.join_code || '');
    toast(ok ? 'Kod kopyalandı.' : 'Kopyalamaq mümkün olmadı.', ok ? 'ok' : 'error');
  });

  root.querySelector('#set-code-new')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Ümumi kod yenilənsin?',
      message: 'Köhnə ümumi kod işləməyəcək. İşçilərin şəxsi kodları dəyişməz.',
      confirmText: 'Yenilə'
    });
    if (!ok) return;
    try {
      const code = await rotateJoinCode(business.id);
      const el = root.querySelector('#set-join-code');
      if (el) el.textContent = code;
      toast('Yeni kod: ' + code, 'ok', 7000);
      await refresh();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  });

  root.querySelector('#set-code-help')?.addEventListener('click', () => ctx.navigate('help'));

  root.querySelector('#set-biz-delete')?.addEventListener('click', () => {
    openBusinessForm({ business, onSaved: reloadSpaces });
  });

  const profileForm = root.querySelector('#set-profile-form');
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = root.querySelector('#set-profile-err');
    const btn = root.querySelector('#set-profile-save');
    errBox.hidden = true;

    const fullName = root.querySelector('#set-name').value.trim();
    const phone = root.querySelector('#set-phone').value.trim();

    if (fullName.length < 2) {
      errBox.textContent = 'Adınızı tam yazın.';
      errBox.hidden = false;
      return;
    }

    setLoading(btn, true);
    try {
      await updateProfile({ fullName, phone });
      toast('Məlumatlar yeniləndi.', 'ok');
      await refresh();
    } catch (err) {
      errBox.textContent = friendlyError(err);
      errBox.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });

  const passForm = root.querySelector('#set-pass-form');
  passForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = root.querySelector('#set-pass-err');
    const okBox = root.querySelector('#set-pass-ok');
    const btn = root.querySelector('#set-pass-save');
    errBox.hidden = true;
    okBox.hidden = true;

    const p1 = root.querySelector('#set-pass1').value;
    const p2 = root.querySelector('#set-pass2').value;

    if (p1.length < 8) {
      errBox.textContent = 'Şifrə ən azı 8 simvol olmalıdır.';
      errBox.hidden = false;
      return;
    }
    if (p1 !== p2) {
      errBox.textContent = 'Şifrələr uyğun gəlmir.';
      errBox.hidden = false;
      return;
    }

    setLoading(btn, true);
    try {
      await changePassword(p1);
      okBox.textContent = 'Şifrə dəyişdirildi.';
      okBox.hidden = false;
      passForm.reset();
      toast('Şifrə dəyişdirildi.', 'ok');
    } catch (err) {
      errBox.textContent = friendlyError(err);
      errBox.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });
}
