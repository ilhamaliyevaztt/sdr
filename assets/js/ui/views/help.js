/* ============================================================================
   RahatHesab — Kömək
   Sadə dildə izahlar. 10 yaşlı uşağın da başa düşəcəyi kimi yazılıb.
   ========================================================================== */

import { icon, escapeHtml } from '../../lib/dom.js';

export default function renderHelp(root, ctx) {
  const isOwner = ctx.role === 'owner';

  const ownerSteps = [
    {
      icon: 'i-building',
      title: '1. Biznes yarat',
      text: 'Yuxarı soldaki menyuda «Yeni biznes» düyməsini bas. Biznesin adını yaz — məsələn «Mərkəz Kafe». Bu qədər.'
    },
    {
      icon: 'i-users',
      title: '2. İşçi əlavə et',
      text: '«İşçilər» bölməsinə keç və «Yeni işçi» düyməsini bas. Adını, vəzifəsini və aylıq maaşını yaz. Sistem hər işçiyə avtomatik 8 simvollu kod verir.'
    },
    {
      icon: 'i-key',
      title: '3. Kodu işçiyə ver',
      text: '«İşçilər» siyahısında kod görünür. Ona klikləyəndə kopyalanır. Kodu işçiyə WhatsApp-la göndər.'
    },
    {
      icon: 'i-wallet',
      title: '4. Ödəniş qeyd et',
      text: 'İşçiyə pul verəndə «Ödənişlər» → «Yeni ödəniş» bas. Avans, maaş və ya mükafat seç. Qalıq borc avtomatik hesablanır — əl ilə hesablamaq lazım deyil.'
    }
  ];

  const employeeSteps = [
    {
      icon: 'i-user',
      title: '1. Qeydiyyatdan keç',
      text: '«Qeydiyyat» bölməsində adını, e-poçtunu və şifrəni yaz. Bu, sənin şəxsi hesabındır.'
    },
    {
      icon: 'i-key',
      title: '2. Kodu daxil et',
      text: 'Sahibkarından aldığın 8 simvollu kodu yaz. Sistem səni avtomatik həmin biznesə bağlayacaq.'
    },
    {
      icon: 'i-banknote',
      title: '3. Maaşını gör',
      text: '«İcmal» bölməsində aylıq maaşın, bu ay nə qədər aldığın və nə qədər qaldığı yazılır.'
    },
    {
      icon: 'i-calendar',
      title: '4. İstək göndər',
      text: 'Məzuniyyət lazımdırsa «Məzuniyyət» bölməsindən istək göndər. Sahibkarın təsdiqləyəndə burada görünəcək.'
    }
  ];

  const steps = isOwner ? ownerSteps : employeeSteps;

  const faqs = [
    {
      q: 'Niyə qalıq borc dəyişir?',
      a: 'Sistem belə hesablayır: (aylıq maaş × işlədiyin ay sayı) − (verdiyin pul). İşçi nə qədər çox işləyibsə, o qədər çox qazanıb; nə qədər pul alıbsa, borc o qədər azalır.'
    },
    {
      q: 'İşçi kodu itirsə nə olar?',
      a: '«İşçilər» bölməsində işçini aç və «Yenilə» düyməsini bas. Yeni kod yaranacaq, köhnə kod işləməyəcək.'
    },
    {
      q: 'Bir neçə biznesim ola bilərmi?',
      a: 'Bəli! İstənilən sayda biznes yarada bilərsən. Yuxarı soldaki biznes adına klikləyəndə siyahı açılır və oradan keçid edirsən. Hər biznesin məlumatı tamamilə ayrıdır.'
    },
    {
      q: 'Bir işçi iki biznesdə işləyə bilərmi?',
      a: 'Bəli. İşçi hər iki biznesin kodunu daxil edir və hər iki biznes onun siyahısında görünür. Hansına keçsə, yalnız onun məlumatını görür.'
    },
    {
      q: 'Başqa sahibkar mənim məlumatımı görərmi?',
      a: 'Xeyr, qətiyyən. Hər sahibkarın məlumatı bazada kilidlənib — buna «Row Level Security» deyilir. Bir sahibkar digərinin işçisini, maaşını və ya ödənişini görə bilməz.'
    },
    {
      q: 'Avansla maaş arasındakı fərq nədir?',
      a: 'Avans — ayın əvvəlində və ya ortasında verilən pul. Maaş — ayın sonunda tam hesablaşma. Hər ikisi «ödənilib» sayılır və qalıqdan çıxılır.'
    },
    {
      q: 'Tutulma nədir?',
      a: 'Tutulma — işçinin maaşından çıxılan məbləğ. Məsələn, işçi borclu qalıbsa və ya cərimə varsa. Tutulma qalıq borcu azaldır, amma «ödənilmiş pul» sayılmır.'
    },
    {
      q: 'Məlumatlar itə bilərmi?',
      a: 'Məlumatlar Supabase bulud bazasında saxlanılır. Brauzeri təmizləsən də, telefondan girəndə hər şey yerində olacaq. Yenə də «Hesabatlar» bölməsindən CSV yükləyib ehtiyat nüsxə saxlamaq yaxşı fikirdir.'
    },
    {
      q: 'Şifrəmi unutdum, nə edim?',
      a: '«Daxil ol» ekranında «Şifrəmi unutdum» bas, e-poçtunu yaz. Bərpa linki gələcək.'
    },
    {
      q: 'Telefonda işləyirmi?',
      a: 'Bəli, tam işləyir. Menyu yuxarı soldaki üç xətt düyməsi ilə açılır.'
    }
  ];

  root.innerHTML = `
    <section class="card" style="margin-bottom:14px">
      <div class="card__body" style="padding:24px 22px">
        <div class="row" style="gap:12px;flex-wrap:nowrap;align-items:center">
          <span class="stat__icon" style="width:44px;height:44px;border-radius:13px">${icon('i-help', 22)}</span>
          <div>
            <h2 style="font-size:18px;font-weight:800;letter-spacing:-.03em">
              ${isOwner ? 'RahatHesab necə işləyir?' : 'Sənin kabinetin necə işləyir?'}
            </h2>
            <p class="tiny muted" style="margin-top:2px">4 addım — hamısı bu qədər sadə.</p>
          </div>
        </div>

        <div class="grid grid--2" style="margin-top:20px">
          ${steps.map((s) => `
            <article style="display:flex;gap:11px;align-items:flex-start;padding:14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line)">
              <span class="stat__icon" style="flex:none">${icon(s.icon, 17)}</span>
              <div style="min-width:0">
                <h3 style="font-size:13.5px;font-weight:800;letter-spacing:-.01em">${escapeHtml(s.title)}</h3>
                <p class="tiny muted" style="margin-top:3px;line-height:1.65">${escapeHtml(s.text)}</p>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">Tez-tez verilən suallar</h3>
          <p class="card__sub">Sadə cavablar, texniki sözlər olmadan</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        ${faqs.map((f, i) => `
          <details class="faq"${i === 0 ? ' open' : ''}>
            <summary>
              <span>${escapeHtml(f.q)}</span>
              ${icon('i-chevron-down', 16)}
            </summary>
            <p>${escapeHtml(f.a)}</p>
          </details>
        `).join('')}
      </div>
    </section>

    <section class="card" style="margin-top:14px">
      <div class="card__body">
        <div class="banner banner--ok">
          ${icon('i-shield', 18)}
          <span>
            <strong>Məlumatların təhlükəsizdir</strong>
            Hər sahibkarın məlumatı bazada ayrıca kilidlənib. Kənar adam nə sənin işçilərini,
            nə maaşlarını, nə də ödənişlərini görə bilməz. İşçi isə yalnız öz kartını görür.
          </span>
        </div>

        <div class="row" style="margin-top:16px;gap:8px">
          <button class="btn btn--soft btn--sm" type="button" data-goto="dashboard">
            ${icon('i-grid', 15)} İcmala keç
          </button>
          ${isOwner ? `<button class="btn btn--ghost btn--sm" type="button" data-goto="employees">${icon('i-users', 15)} İşçilər</button>` : ''}
          <button class="btn btn--ghost btn--sm" type="button" data-goto="profile">
            ${icon('i-user', 15)} Şəxsi kabinet
          </button>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => ctx.navigate(b.dataset.goto));
  });
}
