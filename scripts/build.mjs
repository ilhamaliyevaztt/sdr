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

const FALLBACK_URL = 'https://bmslfalctcwjonsasgez.supabase.co';
const FALLBACK_PUBLISHABLE_KEY = 'sb_publishable_3hncd-dCCnvqcVKQLX-c3g_r-6pI9f5';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtc2xmYWxjdGN3am9uc2FzZ2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTM1NTksImV4cCI6MjEwODc4OTU1OX0.zmBD2SadwU6Ym463PrHZErdLAuC2GpsBGnv0kv6YZOA';

/** `https://<ref>.supabase.co` → `<ref>` */
function projectRefFromUrl(url) {
  const m = String(url || '').match(/^https?:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
  return m ? m[1].toLowerCase() : '';
}

/** JWT payload-ındaki `ref` (yalnız eyJ... formatlı açarlar üçün) */
function projectRefFromJwt(key) {
  const parts = String(key || '').split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return String(payload?.ref || '').toLowerCase();
  } catch {
    return '';
  }
}

function isSecretKey(key) {
  return /service_role/i.test(key) || String(key).startsWith('sb_secret_');
}

function isPublicKey(key) {
  const k = String(key || '');
  return k.startsWith('sb_publishable_') || k.startsWith('eyJ');
}

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
  const rawPublishable = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const rawAnon = String(process.env.SUPABASE_ANON_KEY || '').trim();

  // Gizli açar build-i dayandırır — brauzerdə ola bilməz.
  for (const [name, value] of [
    ['SUPABASE_PUBLISHABLE_KEY', rawPublishable],
    ['SUPABASE_ANON_KEY', rawAnon]
  ]) {
    if (value && isSecretKey(value)) {
      throw new Error(
        `TƏHLÜKƏSİZLİK: ${name} gizli açar (service_role / sb_secret_) saxlayır. ` +
          'Frontend üçün yalnız publik açar (publishable / anon) istifadə edin.'
      );
    }
    if (value && !isPublicKey(value)) {
      throw new Error(`TƏHLÜKƏSİZLİK: ${name} publik açar formatında deyil.`);
    }
  }

  const url = envUrl || FALLBACK_URL;
  // Əgər mühit yalnız anon (JWT) verirsə, publishable fallback yazılmır.
  const publishableKey = rawPublishable || (rawAnon ? '' : FALLBACK_PUBLISHABLE_KEY);
  const anonKey = rawAnon || '';

  if (!envUrl || (!rawPublishable && !rawAnon)) {
    log('XƏBƏRDARLIQ: environment dəyişənləri tapılmadı, repodaki fallback açarlar istifadə olunur.');
    log('           Render → Environment bölməsində SUPABASE_URL və SUPABASE_PUBLISHABLE_KEY təyin edin.');
  } else {
    log('Supabase konfiqurasiyası environment dəyişənlərindən oxundu.');
  }

  if (!isPublicKey(publishableKey) && !isPublicKey(anonKey)) {
    throw new Error('Supabase publik açarı tapılmadı (publishable və ya anon).');
  }

  // --- URL ↔ açar uyğunluğu (ən çox rast gəlinən səhv: ref yazı xətası) ------
  const urlRef = projectRefFromUrl(url);
  if (!urlRef) {
    throw new Error(
      `SUPABASE_URL yanlış formatdadır: "${url}". Gözlənilən: https://<ref>.supabase.co`
    );
  }

  for (const [name, key] of [
    ['SUPABASE_ANON_KEY', anonKey]
  ]) {
    const keyRef = projectRefFromJwt(key);
    if (keyRef && keyRef !== urlRef) {
      throw new Error(
        `UYUŞMAZLIQ: ${name} layihə ref-i "${keyRef}", SUPABASE_URL ref-i "${urlRef}". ` +
          'Açar və URL eyni Supabase layihəsinə aid olmalıdır.'
      );
    }
  }

  const config = `/* AVTOMATİK YARADILIB — scripts/build.mjs tərəfindən.
   Bu faylı əl ilə redaktə etməyin; dəyərlər environment dəyişənlərindən gəlir.
   Layihə ref: ${urlRef} */
window.__HESAB_ENV__ = {
  SUPABASE_URL: ${JSON.stringify(url)},${
    publishableKey
      ? `
  SUPABASE_PUBLISHABLE_KEY: ${JSON.stringify(publishableKey)},`
      : ''
  }${
    anonKey
      ? `
  SUPABASE_ANON_KEY: ${JSON.stringify(anonKey)},`
      : ''
  }
  APP_NAME: 'Hesab',
  DEFAULT_CURRENCY: 'AZN'
};
`;

  await writeFile(path.join(DIST, 'assets', 'js', 'config.js'), config, 'utf8');
  log(`config.js yaradıldı (ref: ${urlRef})`);
  log(`açar növü: ${publishableKey ? 'publishable' : 'anon(JWT)'}`);

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
