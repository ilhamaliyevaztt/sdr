/* ============================================================================
   Hesab — Runtime konfiqurasiya
   ----------------------------------------------------------------------------
   BU FAYL `npm run build` zamanı environment dəyişənlərindən avtomatik
   yenidən yaradılır (bax: scripts/build.mjs):
       SUPABASE_URL               — layihə URL-i (https://<ref>.supabase.co)
       SUPABASE_PUBLISHABLE_KEY   — yeni publik açar (sb_publishable_...)
       SUPABASE_ANON_KEY          — köhnə publik açar (eyJ... role:"anon")

   Repoda olan dəyərlər fallback-dir — birbaşa statik yerləşdirmə üçün.

   ⚠️ TƏHLÜKƏSİZLİK:
   HEÇ VAXT `service_role` açarı və ya `sb_secret_...` açarı buraya yazılmayın.
   Onlar RLS-i tamamilə keçir və brauzerdə açıq şəkildə görünəcək.
   Publik açarlar (publishable / anon) yalnız Row Level Security ilə qorunan
   sorğular üçün nəzərdə tutulub və brauzerdə olması normaldır.

   ⚠️ URL DİQQƏT: layihə referansı (ref) açarın içindəki `ref` ilə EYNİ olmalıdır.
   Buradaki ref: bmslfalctcwjonsasgez
   ========================================================================== */
window.__HESAB_ENV__ = {
  SUPABASE_URL: 'https://bmslfalctcwjonsasgez.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_3hncd-dCCnvqcVKQLX-c3g_r-6pI9f5',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtc2xmYWxjdGN3am9uc2FzZ2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTM1NTksImV4cCI6MjEwODc4OTU1OX0.zmBD2SadwU6Ym463PrHZErdLAuC2GpsBGnv0kv6YZOA',
  APP_NAME: 'Hesab',
  DEFAULT_CURRENCY: 'AZN'
};
