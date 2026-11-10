# RahatHesab — Əməkhaqqı və İşçi İdarəetmə Platforması

Kiçik bizneslər üçün **sadə əməkhaqqı uçotu** sistemi. Sahibkar işçiləri idarə edir,
avans və maaş ödənişlərini qeyd edir; sistem qalıq borcu avtomatik hesablayır.
İşçilər öz şəxsi kabinetlərində yalnız öz məlumatlarını görür.

> **Tam statik sayt** — HTML + CSS + JavaScript. Node.js server, Express, API,
> WebSocket və ya hər hansı backend infrastrukturu **yoxdur**.
> Render.com **Static Site** və ya Cloudflare Pages üzərində işləyir.

---

## 1. Loqo

Saytın loqosu `assets/img/` qovluğundadır. Loqo şəffaf PNG kimi hazırlanıb və
bütün ölçülərdə (favicon, mobil ikon, Apple Touch Icon) istifadə olunur:

| Fayl | Ölçü | İstifadə |
|------|------|----------|
| `assets/img/logo-mark.png` | 271×258 | Sidebar və giriş ekranı |
| `assets/img/logo-512.png` | 512×512 | PWA manifest |
| `assets/img/icon-192.png` | 192×192 | PWA manifest |
| `assets/img/apple-touch-icon.png` | 180×180 | iOS ana ekran |
| `assets/img/favicon-32.png` / `favicon-64.png` | 32 / 64 | Brauzer nişanı |

Loqonun rəng palitrası dizayn sisteminə köçürülüb:
yaşıl `#4ADB96` → `#22A06B`, tünd göy `#1F313F`.

---

## 2. Xüsusiyyətlər

### Əsas funksiyalar

| № | Funksiya | Vəziyyət |
|---|----------|----------|
| 1 | Qeydiyyat və giriş (Supabase Auth) | ✅ |
| 2 | Çoxbiznesli sahibkar paneli — bir hesabda **istənilən sayda biznes** | ✅ |
| 3 | İşçilər — əlavə etmə / redaktə / silmə / passiv etmə | ✅ |
| 4 | Avtomatik aylıq maaş hesablaması (işə qəbul tarixindən bu günə) | ✅ |
| 5 | Avans, maaş, mükafat, tutulma ödənişləri | ✅ |
| 6 | Qalıq borcun avtomatik hesablanması | ✅ |
| 7 | İşçi kabineti — **8 simvollu giriş kodu** ilə qoşulma | ✅ |
| 8 | Row Level Security — hər sahibkarın məlumatı tam təcrid olunub | ✅ |
| 9 | Tam responsive dizayn (telefon, planşet, masaüstü) | ✅ |
| 10 | İşıqlı / qaranlıq tema | ✅ |

### Əlavə funksiyalar (bu versiyada əlavə edildi)

**Çoxsahibkarlıq və çoxbizneslilik**
- Bir hesabda **istənilən sayda biznes** yaratmaq — köhnə `businesses_owner_unique`
  məhdudiyyəti silindi.
- Sol yuxarıdaki **biznes seçici** menyu ilə bizneslər arasında keçid.
- Bir istifadəçi eyni zamanda həm sahibkar, həm də işçi ola bilər — məkanlar
  (`spaces`) siyahısında hər ikisi görünür.
- Aktiv biznes `localStorage`-da yadda saxlanılır.

**İşçi girişi problemi həll edildi**
- Yeni `claim_employee_by_code(p_code)` SQL funksiyası — işçi kodu daxil edir və
  dərhal qoşulur. **E-poçt təsdiqindən asılı deyil.**
- Hər işçiyə avtomatik **8 simvollu unikal giriş kodu** (`access_code`) verilir.
  Qarışdırıla bilən simvollar yoxdur (`O/0`, `I/1`).
- Kod bir kliklə kopyalanır («İşçilər» cədvəlindəki nişana klik).
- Kod yeniləmə (`regenerateEmployeeCode`) — köhnə kod ləğv olunur.
- Biznes səviyyəsində **ümumi giriş kodu** (`join_code`) + yeniləmə funksiyası.
- Köhnə `employees_user_unique_idx` məhdudiyyəti silindi — bir işçi
  **birdən çox biznesdə** işləyə bilər.
- E-poçt uyğunluğu ilə avtomatik qoşulma (`claim_employee_account`) ehtiyat üsul
  kimi saxlanıldı.

**Yeni bölmələr**
- **Davamiyyət** — gündəlik iş saatları və əlavə iş saatları; işçi üzrə aylıq cəm.
- **Məzuniyyət** — işçi istək göndərir, sahibkar təsdiqləyir/rədd edir.
- **Qeydlər** — tapşırıq siyahısı, son tarix, tamamlama işarəsi, gecikmə xəbərdarlığı.
- **Kömək** — 4 addımlı sadə izahlar + 10 sual-cavab (texniki dil olmadan).

**İcmal (dashboard) təkmilləşdirmələri**
- Kontekstual xəbərdarlıqlar: maaşı 0 olan işçilər, kabinetə qoşulmamış işçilər,
  cavab gözləyən məzuniyyət istəkləri.
- «Kimə nə qədər borcluyam?» cədvəli — bir kliklə həmin işçiyə ödəniş.
- Son 6 ayın ödəniş qrafiki.
- Maaş gününə qalan gün sayacı (biznesin `pay_day` sahəsi).
- Son hərəkətlər jurnalı (`activity_log`).

**İşçi kabineti**
- Aylıq maaş, bu ay alınan pul, qalıq borc, aylıq iş saatı.
- Ödəniş tarixçəsi ay-ay qruplaşdırılmış.
- Öz telefonunu yeniləyə bilir (`update_my_contact`), maaşa toxuna bilmir.
- Öz ödəniş tarixçəsini CSV kimi yükləyə bilir.

**İdxal / ixrac**
- İşçi siyahısının CSV ixracı (kodlar daxil).
- Ödənişlərin CSV ixracı (filtrlər tətbiq olunmuş halda).
- Davamiyyətin CSV ixracı.
- Hesabatların CSV ixracı.
- **İşçiləri CSV/Excel-dən kütləvi idxal** — yapışdır və əlavə et, sətir-sətir
  xəta hesabatı ilə.

**Digər**
- Şifrə gücü göstəricisi, şifrə göstər/gizlət.
- «Şifrəmi unutdum» → e-poçtla bərpa.
- Şifrə dəyişmə (tənzimləmələr və şəxsi kabinetdə).
- Biznes profili: hüquqi ad, valyuta (AZN/USD/EUR/TRY/RUB), telefon, e-poçt,
  ünvan, maaş günü.
- PWA manifest — telefonda «Ana ekrana əlavə et».
- Çap üçün xüsusi CSS (hesabatları kağıza çıxarmaq üçün).
- Klaviatura ilə idarə: `Escape` modal/menyu bağlayır, `Tab` fokus tələsi.
- `prefers-reduced-motion` dəstəyi (animasiyaları söndürür).
- Səssiz xəta idarəsi — hər xəta üçün Azərbaycan dilində aydın mesaj.

---

## 3. Supabase qurulumu

### 3.1 Sxemi işə salın

1. [supabase.com](https://supabase.com) → yeni layihə yaradın.
2. **SQL Editor** → New query → `supabase/schema.sql` faylının **hamısını**
   kopyalayıb **Run** edin.
3. Skript **idempotentdir** — köhnə baza üzərində də təkrar işə salmaq təhlükəsizdir
   (köhnə məhdudiyyətlər avtomatik silinir).

### 3.2 Authentication

- **Authentication → Providers → Email** aktiv olsun.
- Tövsiyə: **Confirm email** söndürülsün ki, işçilər dərhal daxil ola bilsin.
  (İşçi qoşulması artıq e-poçt təsdiqindən **asılı deyil** — kodla işləyir.)

### 3.3 Açarlar

**Project Settings → API** bölməsindən:

- `Project URL` → `https://<ref>.supabase.co`
- `publishable key` (`sb_publishable_...`) **və ya** `anon key` (`eyJ...`)

⚠️ `service_role` / `sb_secret_...` açarı **heç vaxt** frontend-ə yazılmayın.
`scripts/build.mjs` belə açar görsə build-i dayandırır.

---

## 4. Yerləşdirmə

### Render.com

Blueprint ilə: **New → Blueprint** → repoyu seçin (`render.yaml` avtomatik oxunur).

Environment dəyişənləri:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### Cloudflare Pages

```
Build command:       npm run build
Build output directory: dist
```

### Lokal

```bash
npm run check     # struktur + sintaksis + import yoxlaması
npm run build     # dist/ yaradılır
npm run preview   # http://localhost:3000
```

`assets/js/config.js` faylındaki dəyərlər fallback-dir; build zamanı environment
dəyişənləri varsa, onlar üstün gəlir.

---

## 5. URL davranışı

Sayt **tək səhifəli tətbiqdir (SPA)** və naviqasiya tamamilə yaddaşdaxildir:

- ❌ `#anchor` — istifadə edilmir
- ❌ `?page=...` — istifadə edilmir
- ❌ `/isci` kimi route — istifadə edilmir
- ❌ `history.pushState` / `replaceState` — istifadə edilmir
- ✅ Brauzerin ünvan sətri bölmələr arasında keçiddə **heç vaxt dəyişmir**

---

## 6. Data modeli

### Cədvəllər

| Cədvəl | Təyinat |
|--------|---------|
| `profiles` | İstifadəçi profili (ad, e-poçt, telefon) — `auth.users` ilə 1:1 |
| `businesses` | Sahibkarın biznesi. **Çoxsaylı** (`owner_id` unique deyil) |
| `business_members` | Biznes ↔ istifadəçi əlaqəsi (rol + status) |
| `employees` | İşçi kartı + `access_code` (8 simvollu giriş kodu) |
| `salary_payments` | Avans / maaş / mükafat / tutulma |
| `work_logs` | Gündəlik iş saatları (unikal: işçi + tarix) |
| `leave_requests` | Məzuniyyət istəyi (pending / approved / rejected) |
| `notes` | Qeydlər və tapşırıqlar |
| `activity_log` | Sadə fəaliyyət jurnalı |

### Görünüşlər

| Görünüş | Təyinat |
|---------|---------|
| `v_employee_balances` | İşçi üzrə hesablanmış maaş, ödənişlər, qalıq borc |

### Funksiyalar (RPC)

| Funksiya | Təyinat |
|----------|---------|
| `claim_employee_by_code(code)` | **İşçi kodu ilə biznesə qoşulur** |
| `claim_employee_account()` | E-poçt uyğunluğu ilə ehtiyat qoşulma |
| `update_my_contact(phone)` | İşçi öz telefonunu yeniləyir |
| `rotate_join_code(biznes_id)` | Biznesin ümumi kodunu yeniləyir |
| `can_manage_business(id)` | RLS: istifadəçi biznesi idarə edə bilərmi |
| `can_read_business(id)` | RLS: istifadəçi biznesi oxuya bilərmi |
| `gen_code(len)` | Təsadüfi giriş kodu generatoru |

### Hesablama düsturu

```
hesablanmış  = aylıq maaş × (işə qəbuldan bu günə ay sayı)
ödənilib     = bütün avans + maaş + mükafat
qalıq borc   = hesablanmış − ödənilib − tutulmalar
```

---

## 7. Təhlükəsizlik

- Bütün cədvəllərdə **RLS aktivdir**.
- Sahibkar yalnız `owner_id = auth.uid()` olan biznesi görür.
- İşçi yalnız `user_id = auth.uid()` olan işçi kartını və öz ödənişlərini görür.
- İşçi `salary_payments`, `employees` cədvəllərinə **yaza bilmir** (yalnız oxuyur).
- İşçi `work_logs` / `leave_requests` cədvəllərinə yalnız öz adına yazır.
- `claim_employee_by_code` `SECURITY DEFINER`-dır, amma yalnız öz hesabına bağlamağa
  icazə verir; başqa hesaba bağlanmış kod `CODE_ALREADY_USED` xətası qaytarır.
- Build skripti frontend-də `service_role` / `sb_secret_` açarı aşkar etsə dayanır.

---

## 8. Bölmələr (owner)

| Bölmə | Nə edir |
|-------|---------|
| **İcmal** | Maaş fondu, bu ay ödənilən, ümumi borc, borclu işçilər, xəbərdarlıqlar |
| **İşçilər** | Siyahı, axtarış, filtrlər, CSV idxal/ixrac, giriş kodları |
| **Ödənişlər** | Avans/maaş/mükafat/tutulma, növ-dövr-işçi filtrləri |
| **Davamiyyət** | Gündəlik saatlar, işçi üzrə aylıq cəm |
| **Məzuniyyət** | İstəklərin təsdiqi / rəddi |
| **Qeydlər** | Tapşırıqlar, son tarixlər, tamamlama |
| **Hesabatlar** | Aylıq dinamika, növ/üsul bölgüsü, işçi yekunları, çap |
| **Tənzimləmələr** | Biznes profili, kodlar, şifrə, təhlükəli zona |
| **Şəxsi kabinet** | Öz məlumatları, məkanlar siyahısı |
| **Kömək** | Sadə izahlar, 10 sual-cavab |

## 9. Bölmələr (employee)

| Bölmə | Nə edir |
|-------|---------|
| **İcmal** | Aylıq maaş, bu ay alınan, qalıq, iş saatı |
| **Maaşım** | Ödəniş tarixçəsi ay-ay |
| **İş saatlarım** | Öz davamiyyət qeydləri (əlavə edə bilir) |
| **Məzuniyyət** | İstək göndərmə, vəziyyəti izləmə |
| **Şəxsi kabinet** | Hesablaşma, telefon yeniləmə, CSV ixracı |
| **Kömək** | Sadə izahlar, 10 sual-cavab |

---

## 10. Layihə strukturu

```
webapp/
├── index.html                    # Tək səhifə: boot, auth, app shell, ikon sprite
├── manifest.webmanifest          # PWA manifest
├── render.yaml                   # Render blueprint
├── supabase/
│   └── schema.sql                # Bütün cədvəllər, RLS, funksiyalar (idempotent)
├── assets/
│   ├── css/styles.css            # Dizayn sistemi (token, komponent, responsive)
│   ├── img/                      # Loqo və ikonlar
│   └── js/
│       ├── app.js                # Nüvə: router, shell, biznes seçici, data
│       ├── auth.js               # Giriş / qeydiyyat / şifrə bərpası
│       ├── config.js             # Runtime konfiqurasiya (build zamanı yazılır)
│       ├── lib/
│       │   ├── dom.js            # modal, toast, clipboard, fayl, escape
│       │   ├── format.js         # pul, tarix, CSV, sabitlər
│       │   └── store.js          # Supabase məlumat qatı (bütün CRUD)
│       ├── ui/
│       │   ├── forms.js          # Bütün forma modalları
│       │   └── views/            # 10 görünüş modulu
│       └── vendor/supabase.js    # Supabase JS (lokal, CDN-siz)
├── scripts/
│   ├── build.mjs                 # dist/ yaradır + config.js yazır + yoxlayır
│   └── check.mjs                 # struktur + sintaksis + import + RLS yoxlaması
└── dist/                         # Build nəticəsi
```

---

## 11. Lisenziya

MIT
