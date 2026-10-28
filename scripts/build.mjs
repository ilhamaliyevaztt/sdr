#!/usr/bin/env node
/**
 * Hesab — statik build skripti
 * ----------------------------------------------------------------------------
 * Heç bir bundler, framework və ya server istifadə etmir.
 * Sadəcə sayt fayllarını `dist/` qovluğuna köçürür və runtime konfiqurasiyanı
 * Render environment dəyişənlərindən yaradır.
 *
 * Render Static Site ayarları:
 *   Build Command:    npm run build
 *   Publish Directory: dist
 */

import { cp, mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const COPY = [
  { from: 'index.html', to: 'index.html' },
  { from: 'assets', to: 'assets' },
  { from: 'favicon.ico', to: 'favicon.ico', optional: true }
];

const FALLBACK_URL = 'https://bmslfaltcwjonsasgez.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtc2xmYWxjdGN3am9uc2FzZ2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTM1NTksImV4cCI6MjEwODc4OTU1OX0.zmBD2SadwU6Ym463PrHZErdLAuC2GpsBGnv0kv6YZOA';

function log(msg) {
  process.stdout.write(`[build] ${msg}\n`);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  log('başladı');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const item of COPY) {
    const src = path.join(ROOT, item.from);
    const dest = path.join(DIST, item.to);

    if (!existsSync(src)) {
      if (item.optional) {
        log(`keçildi (yoxdur): ${item.from}`);
        continue;
      }
      throw new Error(`Məcburi fayl tapılmadı: ${item.from}`);
    }
    await cp(src, dest, { recursive: true });
    log(`köçürüldü: ${item.from}`);
  }

  // --- runtime konfiqurasiya -------------------------------------------------
  const envUrl = String(process.env.SUPABASE_URL || '').trim();
  const envKey = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

  const url = envUrl || FALLBACK_URL;
  const key = envKey || FALLBACK_KEY;

  if (!envUrl || !envKey) {
    log('XƏBƏRDARLIQ: environment dəyişənləri tapılmadı, repodaki fallback açarlar istifadə olunur.');
    log('           Render → Environment bölməsində SUPABASE_URL və SUPABASE_ANON_KEY təyin edin.');
  } else {
    log('Supabase konfiqurasiyası environment dəyişənlərindən oxundu.');
  }

  if (/service_role/i.test(key) || key.startsWith('sb_secret_')) {
    throw new Error(
      'TƏHLÜKƏSİZLİK: service_role / secret açarı frontend üçün qadağandır. Yalnız anon (publishable) açar istifadə edin.'
    );
  }

  const config = `/* AVTOMATİK YARADILIB — scripts/build.mjs tərəfindən.
   Bu faylı əl ilə redaktə etməyin; dəyərlər Render environment dəyişənlərindən gəlir. */
window.__HESAB_ENV__ = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(key)},
  APP_NAME: 'Hesab',
  DEFAULT_CURRENCY: 'AZN'
};
`;

  await writeFile(path.join(DIST, 'assets', 'js', 'config.js'), config, 'utf8');
  log('config.js yaradıldı');

  // --- yoxlama ---------------------------------------------------------------
  const indexHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');
  const requiredRefs = [
    'assets/css/styles.css',
    'assets/js/vendor/supabase.js',
    'assets/js/config.js',
    'assets/js/app.js'
  ];
  for (const ref of requiredRefs) {
    if (!indexHtml.includes(ref)) {
      throw new Error(`index.html daxilində istinad tapılmadı: ${ref}`);
    }
    if (!(await exists(path.join(DIST, ref)))) {
      throw new Error(`Build nəticəsində fayl yoxdur: ${ref}`);
    }
  }
  log('index.html istinadları yoxlanıldı');

  // Heç bir HTML faylı xarici JS/CDN-dən asılı olmamalıdır (şriftlər istisnadır)
  if (/<script[^>]+src="https?:\/\//i.test(indexHtml)) {
    throw new Error('index.html xarici <script src> istifadə edir — bütün JS lokal olmalıdır.');
  }

  log(`hazırdır → ${DIST}`);
}

main().catch((err) => {
  process.stderr.write(`[build] XƏTA: ${err.message}\n`);
  process.exit(1);
});
