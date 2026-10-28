/* ============================================================================
   Hesab — Runtime konfiqurasiya
   ----------------------------------------------------------------------------
   BU FAYL `npm run build` zamanı (Render-də) environment dəyişənlərindən
   avtomatik yenidən yaradılır:  SUPABASE_URL, SUPABASE_ANON_KEY
   (bax: scripts/generate-config.mjs)

   Repoda olan dəyərlər fallback-dir — birbaşa statik yerləşdirmə üçün.
   HEÇ VAXT gizli (secret) açarı buraya yazmayın. Anon key publikdir və
   yalnız Row Level Security ilə qorunan sorğular üçün istifadə olunur.
   ========================================================================== */
window.__HESAB_ENV__ = {
  SUPABASE_URL: 'https://bmslfaltcwjonsasgez.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtc2xmYWxjdGN3am9uc2FzZ2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTM1NTksImV4cCI6MjEwODc4OTU1OX0.zmBD2SadwU6Ym463PrHZErdLAuC2GpsBGnv0kv6YZOA',
  APP_NAME: 'Hesab',
  DEFAULT_CURRENCY: 'AZN'
};
