# Hesab — Əməkhaqqı və İşçi İdarəetmə Platforması

Kiçik bizneslər üçün **əməkhaqqı uçotu** sistemi. Sahibkar işçiləri idarə edir,
avans və maaş ödənişlərini qeyd edir; sistem qalıq borcu avtomatik hesablayır.
İşçilər öz şəxsi kabinetlərində yalnız öz məlumatlarını görür.

> **Tam statik sayt** — HTML + CSS + JavaScript. Node.js server, Express, API,
> WebSocket və ya hər hansı backend infrastrukturu **yoxdur**.
> Render.com **Static Site** üzərində əlavə konfiqurasiya olmadan işləyir.

---

## 1. Xüsusiyyətlər

| № | Funksiya | Vəziyyət |
|---|----------|----------|
| 1 | Qeydiyyat və giriş (Supabase Auth) — sahibkar hesab yaradır, biznesini əlavə edir | ✅ |
| 2 | Əsas panel — işçi sayı, aylıq maaş fondu, ödənilmiş maaşlar, qalıq borc | ✅ |
| 3 | İşçilər — ad, vəzifə, aylıq maaş ilə əlavə etmə / redaktə / silmə | ✅ |
| 4 | Maaş hesablaması — hər işçinin maaşı avtomatik hesablanır | ✅ |
| 5 | Avans və ödənişlər — qalıq borc avtomatik yenilənir | ✅ |
| 6 | Hesablaşma tarixçəsi — tarixlə birlikdə tam jurnal | ✅ |
| 7 | İşçi kabineti — öz maaşı, aldığı pul, qalıq məbləğ | ✅ |
| 8 | Təhlükəsizlik — Supabase Row Level Security (RLS) | ✅ |

### Əlavə funksiyalar

- **Hesabatlar** — son 6 ay üzrə dinamika, işçi üzrə yekun, ödəniş tempi faizi
- **CSV ixracı** — işçi siyahısı, ödəniş tarixçəsi, hesabatlar
- **Şifrə bərpası** — e-poçtla bərpa linki
- **Tema** — işıqlı / qaranlıq rejim (yadda saxlanılır)
- **Passiv işçi** — maaş hesablamasından çıxarmaq, tarixçəni saxlamaqla
- **Mükafat və tutulma** — maaşdan əlavə əməliyyat növləri
- **Ödəniş üsulu** — nağd / kart / bank köçürməsi
- **İşçi hesabının avtomatik bağlanması** — işçi eyni e-poçtla qeydiyyatdan
  keçdikdə `claim_employee_account()` funksiyası onu işçi kartına bağlayır

---

## 2. URL davranışı (tələbə uyğun)

Sayt **tək səhifəli tətbiqdir (SPA)** və naviqasiya tamamilə yaddaşdaxilidir:

- ❌ `#anchor` — istifadə edilmir
- ❌ `?page=...` — istifadə edilmir
- ❌ `/muellimler` kimi route — istifadə edilmir
- ❌ `history.pushState` / `replaceState` — istifadə edilmir
- ✅ Brauzerin ünvan sətri bölmələr arasında keçiddə **heç vaxt dəyişmir**

---

## 3. Quraşdırma

### 3.1 Supabase

1. [supabase.com](https://supabase.com) → yeni layihə yaradın.
2. **SQL Editor** → New query → `supabase/schema.sql` faylının **hamısını**
   kopyalayıb **Run** edin.
3. **Project Settings → API** bölməsindən götürün:
   - `Project URL` → `https://<ref>.supabase.co`
   - `publishable` açar (`sb_publishable_...`) — **tövsiyə olunur**
   - və ya köhnə `anon public` açar (`eyJ...`)
4. **Authentication → Providers → Email** aktiv olsun.
   - Tövsiyə: *Confirm email* **aktiv** saxlanılsın — işçi hesabının e-poçt
     sahibinə bağlanması bu təsdiqə əsaslanır.

> ⚠️ **URL ↔ açar uyğunluğu:** `SUPABASE_URL`-dəki `<ref>` hissəsi açarın
> JWT payload-ındaki `ref` ilə **eyni** olmalıdır. Ən çox rast gəlinən
> "Supabase-ə qoşulmur" səbəbi URL-dəki yazı xətasıdır (məsələn
> `bmslfaltcw…` yerinə `bmslfalctcw…`). `npm run check` və `npm run build`
> bu uyğunsuzluğu aşkar edib dayanır.

> ⚠️ `service_role` açarı və `sb_secret_...` açarı **heç vaxt** frontend-də
> istifadə olunmur və repoya yazılmır. Hər ikisi RLS-i tam keçir.
> `scripts/build.mjs` və `scripts/check.mjs` bunu yoxlayır; aşkar olunarsa
> build dayanır.

**Cari layihə dəyərləri** (`assets/js/config.js`):

| Dəyişən | Dəyər |
|---------|-------|
| Layihə ref | `bmslfalctcwjonsasgez` |
| `SUPABASE_URL` | `https://bmslfalctcwjonsasgez.supabase.co` |

### 3.2 Render.com

**Variant A — Blueprint (tövsiyə olunur):**

1. Render → **New → Blueprint** → GitHub reponu seçin.
2. `render.yaml` avtomatik oxunur.
3. Environment dəyişənlərini doldurun:
   - `SUPABASE_URL` = `https://<ref>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (tövsiyə olunur)
   - `SUPABASE_ANON_KEY` = anon açar (yalnız köhnə format istifadə edirsinizsə)
4. **Apply** → deploy başlayır.

> Əgər heç bir mühit dəyişəni təyin etməsəniz, build `assets/js/config.js`
> faylındaki fallback dəyərləri istifadə edir — sayt yenə işləyir.

**Variant B — əl ilə Static Site:**

| Ayar | Dəyər |
|------|-------|
| Service Type | **Static Site** |
| Build Command | `npm run build` |
| Publish Directory | `dist` |
| Environment | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` |

Custom Domain və HTTPS Render tərəfindən avtomatik idarə olunur.

### 3.3 Lokal yoxlama

```bash
npm run check        # struktur + sintaksis + import + Supabase konfiq yoxlaması
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... npm run build
npx serve dist       # və ya hər hansı statik server
```

---

## 4. Fayl strukturu

```
.
├── index.html                     # Tək HTML səhifə (app shell + SVG ikon sprite)
├── render.yaml                    # Render Blueprint (Static Site)
├── package.json
├── supabase/
│   └── schema.sql                 # Cədvəllər, əlaqələr, RLS siyasətləri, görünüş
├── assets/
│   ├── favicon.svg
│   ├── css/
│   │   └── styles.css             # Dizayn sistemi, tam responsive
│   └── js/
│       ├── config.js              # Runtime konfiqurasiya (build zamanı yenilənir)
│       ├── app.js                 # Nüvə: state, yaddaşdaxili router, shell
│       ├── auth.js                # Giriş / qeydiyyat / şifrə bərpası
│       ├── vendor/
│       │   └── supabase.js        # supabase-js (lokal, CDN asılılığı yoxdur)
│       ├── lib/
│       │   ├── dom.js             # Modal, toast, forma köməkçiləri
│       │   ├── format.js          # Pul, tarix, CSV formatlaşdırma
│       │   └── store.js           # Supabase məlumat qatı + xəta xəritəsi
│       └── ui/
│           ├── forms.js           # İşçi / ödəniş / biznes modalları
│           └── views/
│               ├── dashboard.js   # İcmal
│               ├── employees.js   # İşçilər + işçi kartı
│               ├── payments.js    # Ödəniş tarixçəsi
│               ├── reports.js     # Hesabatlar
│               ├── settings.js    # Tənzimləmələr
│               └── profile.js     # Şəxsi kabinet (işçi görünüşü)
└── scripts/
    ├── build.mjs                  # Statik build (dist/ + config.js)
    └── check.mjs                  # Layihə yoxlama
```

---

## 5. Məlumat bazası

### Cədvəllər

| Cədvəl | Təyinat |
|--------|---------|
| `profiles` | Auth istifadəçisi profili (ad, e-poçt) |
| `businesses` | Sahibkarın biznesi (`owner_id` → `auth.users`) |
| `employees` | İşçi kartı (`business_id`, `user_id` → `auth.users`) |
| `salary_payments` | Avans / maaş / mükafat / tutulma hərəkətləri |

### Görünüş

`v_employee_balances` — hər işçi üzrə:

- `months_count` — işə qəbuldan bu yana tam ay sayı
- `accrued_total` = `monthly_salary × months_count`
- `total_advance`, `total_salary_paid`, `total_bonus`, `total_deduction`
- `total_paid` = avans + maaş + mükafat
- `paid_this_month`
- `balance` = hesablanmış − ödənilmiş − tutulmalar

Görünüş `security_invoker = on` ilə işləyir → RLS qaydaları ona da tətbiq olunur.

### RLS siyasətləri

| Cədvəl | Sahibkar | İşçi |
|--------|----------|------|
| `profiles` | öz sətri | öz sətri |
| `businesses` | öz biznesi (CRUD) | — |
| `employees` | öz biznesinin bütün işçiləri (CRUD) | yalnız öz kartı (SELECT) |
| `salary_payments` | öz biznesinin bütün ödənişləri (CRUD) | yalnız öz tarixçəsi (SELECT) |

---

## 6. Təhlükəsizlik qeydləri

- Frontend-də yalnız **anon / publishable** açar var.
- `service_role` / `sb_secret_...` açarı koda **heç vaxt** daxil edilmir;
  `scripts/build.mjs` bu halda build-i dayandırır.
- Bütün cədvəllərdə `ENABLE ROW LEVEL SECURITY` aktivdir.
- Funksiyalar `SECURITY DEFINER` + `set search_path` ilə yazılıb (axtarış yolu
  zəhərlənməsinə qarşı).
- `claim_employee_account()` yalnız **təsdiqlənmiş e-poçt** üçün işləyir.
- Bütün istifadəçi mətnləri HTML-ə yazılarkən escape olunur (XSS qoruması).
- `localStorage` yalnız tema seçimi üçün istifadə olunur — məlumat bazası kimi yox.

---

## 7. Brauzer dəstəyi

Chrome / Edge 100+, Firefox 100+, Safari 15.4+.
Responsive: 320px-dən 4K-ya qədər — üfüqi daşma yoxdur.

---

## 8. Lisenziya

MIT
