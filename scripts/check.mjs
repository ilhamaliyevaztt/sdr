#!/usr/bin/env node
/**
 * Hesab — layihə yoxlama skripti
 * ----------------------------------------------------------------------------
 * Build etmədən əvvəl strukturun və importların düzgünlüyünü yoxlayır.
 *   npm run check
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = [
  'index.html',
  'package.json',
  'render.yaml',
  'README.md',
  'supabase/schema.sql',
  'assets/css/styles.css',
  'assets/favicon.svg',
  'assets/js/app.js',
  'assets/js/auth.js',
  'assets/js/config.js',
  'assets/js/vendor/supabase.js',
  'assets/js/lib/dom.js',
  'assets/js/lib/format.js',
  'assets/js/lib/store.js',
  'assets/js/ui/forms.js',
  'assets/js/ui/views/dashboard.js',
  'assets/js/ui/views/employees.js',
  'assets/js/ui/views/payments.js',
  'assets/js/ui/views/reports.js',
  'assets/js/ui/views/settings.js',
  'assets/js/ui/views/profile.js'
];

const errors = [];
const warnings = [];

function log(msg) {
  process.stdout.write(`${msg}\n`);
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
  log('── Fayl strukturu ─────────────────────────────');

  for (const rel of REQUIRED) {
    if (await exists(path.join(ROOT, rel))) {
      log(`  ✓ ${rel}`);
    } else {
      errors.push(`Çatışmayan fayl: ${rel}`);
      log(`  ✗ ${rel}`);
    }
  }

  log('\n── index.html yoxlamaları ─────────────────────');
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');

  if (/<script[^>]+src="https?:\/\//i.test(html)) {
    errors.push('index.html xarici <script src> istifadə edir — JS lokal olmalıdır.');
  } else {
    log('  ✓ Xarici script yoxdur');
  }

  const ids = ['boot-screen', 'fatal-screen', 'auth-screen', 'app-shell', 'view-root', 'modal-root', 'toast-root', 'main-nav'];
  for (const id of ids) {
    if (!html.includes(`id="${id}"`)) errors.push(`index.html-də #${id} tapılmadı.`);
  }
  log(`  ✓ Əsas DOM qurğuları (${ids.length})`);

  // İstinad olunan bütün fayllar mövcuddurmu?
  const refs = [...html.matchAll(/(?:href|src)="(assets\/[^"]+)"/g)].map((m) => m[1]);
  for (const ref of new Set(refs)) {
    if (!(await exists(path.join(ROOT, ref)))) errors.push(`index.html istinadı mövcud deyil: ${ref}`);
  }
  log(`  ✓ Statik istinadlar (${new Set(refs).size})`);

  log('\n── JS modulları ───────────────────────────────');

  const jsFiles = [];
  async function walk(dir) {
    for (
      const entry of await readdir(dir, { withFileTypes: true })
    ) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'vendor' || entry.name === 'node_modules') continue;
        await walk(full);
      } else if (entry.name.endsWith('.js')) {
        jsFiles.push(full);
      }
    }
  }
  await walk(path.join(ROOT, 'assets', 'js'));

  // ESM sintaksis yoxlaması + import/export uyğunluğu
  const exportsMap = new Map();
  const importMap = new Map();

  for (const file of jsFiles) {
    const source = await readFile(file, 'utf8');
    const rel = path.relative(ROOT, file);

    // Sintaksis yoxlaması: `node --check` (package.json type=module → ESM)
    try {
      await execFileAsync(process.execPath, ['--check', file]);
      log(`  ✓ ${rel}`);
    } catch (err) {
      const msg = String(err.stderr || err.message || '').split('\n').slice(0, 3).join(' ').trim();
      errors.push(`Sintaksis xətası (${rel}): ${msg}`);
      log(`  ✗ ${rel} — ${msg}`);
      continue;
    }

    const names = new Set();
    for (const m of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
    for (const m of source.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
    exportsMap.set(file, names);

    const imports = [];
    for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const items = m[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      imports.push({ items, from: m[2] });
    }
    importMap.set(file, imports);
  }

  log('\n── Import/export uyğunluğu ────────────────────');
  let checked = 0;
  for (const [file, imports] of importMap) {
    for (const imp of imports) {
      if (!imp.from.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), imp.from);
      if (!(await exists(target))) {
        errors.push(`Import hədəfi yoxdur — ${path.relative(ROOT, file)} → ${imp.from}`);
        continue;
      }
      const available = exportsMap.get(target);
      if (!available) continue;
      for (const name of imp.items) {
        checked++;
        if (!available.has(name)) {
          errors.push(`"${name}" ${path.relative(ROOT, target)} faylında export olunmayıb (istifadə: ${path.relative(ROOT, file)})`);
        }
      }
    }
  }
  log(`  ✓ ${checked} import yoxlanıldı`);

  log('\n── SQL sxemi ──────────────────────────────────');
  const sql = await readFile(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const tables = ['profiles', 'businesses', 'employees', 'salary_payments'];
  for (const t of tables) {
    if (!new RegExp(`create table if not exists public\\.${t}`, 'i').test(sql)) {
      errors.push(`SQL: public.${t} cədvəli yaradılmır.`);
    }
    if (!new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i').test(sql)) {
      errors.push(`SQL: public.${t} üçün RLS aktiv deyil.`);
    }
  }
  if (!/service_role/i.test(sql) === false) warnings.push('SQL daxilində service_role qeydi var (yalnız şərh olmalıdır).');
  const policyCount = (sql.match(/create policy/gi) || []).length;
  log(`  ✓ ${tables.length} cədvəl, ${policyCount} RLS siyasəti`);

  log('\n── Supabase konfiqurasiyası ───────────────────');
  const cfg = await readFile(path.join(ROOT, 'assets', 'js', 'config.js'), 'utf8');

  // 1) URL ↔ açar ref uyğunluğu — ən çox rast gəlinən səhv (URL yazı xətası)
  const urlMatch = cfg.match(/SUPABASE_URL:\s*['"`]([^'"`]+)['"`]/);
  const cfgUrl = urlMatch ? urlMatch[1].trim() : '';
  const urlRef = (cfgUrl.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co\/?$/i) || [])[1];

  if (!urlRef) {
    errors.push(`config.js: SUPABASE_URL düzgün formatda deyil → "${cfgUrl}" (gözlənilən: https://<ref>.supabase.co)`);
  } else {
    const urls = cfg.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    let mismatch = null;
    for (const t of urls) {
      try {
        const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
        if (payload?.ref && String(payload.ref).toLowerCase() !== urlRef.toLowerCase()) {
          mismatch = String(payload.ref);
        }
      } catch {
        /* keç */
      }
    }
    if (mismatch) {
      errors.push(
        `config.js: SUPABASE_URL ref-i "${urlRef}", açarın ref-i "${mismatch}" — UYĞUN DEYİL. URL yazı xətası ola bilər.`
      );
    } else {
      log(`  ✓ URL ref ↔ açar ref uyğundur (${urlRef})`);
    }
  }

  // 2) Publik açar mövcuddurmu?
  const hasPublishable = /SUPABASE_PUBLISHABLE_KEY:\s*['"`]sb_publishable_[A-Za-z0-9_-]+['"`]/.test(cfg);
  const hasAnon = /SUPABASE_ANON_KEY:\s*['"`]eyJ[A-Za-z0-9_.-]+['"`]/.test(cfg);
  if (!hasPublishable && !hasAnon) {
    errors.push('config.js: nə SUPABASE_PUBLISHABLE_KEY, nə də SUPABASE_ANON_KEY təyin olunmayıb.');
  } else {
    log(`  ✓ Publik açar mövcuddur (${hasPublishable ? 'publishable' : 'anon'})`);
  }

  log('\n── Təhlükəsizlik ──────────────────────────────');
  // Yalnız REAL açarları yoxla (şərhlərdəki söz deyil)
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(cfg)) {
    errors.push('config.js daxilində secret açarı (sb_secret_) var — QADAĞANDIR.');
  } else {
    const jwts = cfg.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    let hasServiceRole = false;
    for (const t of jwts) {
      try {
        const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
        if (payload && payload.role === 'service_role') hasServiceRole = true;
      } catch {
        /* keç */
      }
    }
    if (hasServiceRole) errors.push('config.js daxilində service_role JWT-si var — QADAĞANDIR.');
    else log('  ✓ Frontend konfiqurasiyasında yalnız publik açar');
  }
  const allJs = jsFiles.map((f) => f);
  for (const f of allJs) {
    const src = await readFile(f, 'utf8');
    // Yalnız REAL açar materialı (prefix + uzun bədən) — tək "sb_secret_" sözü guard kodunda ola bilər
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(src)) {
      errors.push(`Secret açar aşkarlandı: ${path.relative(ROOT, f)}`);
    }
  }
  log('  ✓ Kodda secret açar yoxdur');

  log('\n───────────────────────────────────────────────');
  if (warnings.length) {
    log(`XƏBƏRDARLIQLAR (${warnings.length}):`);
    warnings.forEach((w) => log(`  ! ${w}`));
  }
  if (errors.length) {
    log(`\nXƏTALAR (${errors.length}):`);
    errors.forEach((e) => log(`  ✗ ${e}`));
    process.exit(1);
  }
  log('Bütün yoxlamalar uğurla keçdi ✓');
}

main().catch((err) => {
  process.stderr.write(`[check] XƏTA: ${err.message}\n`);
  process.exit(1);
});
