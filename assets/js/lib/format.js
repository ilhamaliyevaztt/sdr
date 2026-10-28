/* ============================================================================
   Hesab — formatlaşdırma köməkçiləri
   ========================================================================== */

const AZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'
];

const AZ_MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

const nf2 = new Intl.NumberFormat('az-AZ', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const nf0 = new Intl.NumberFormat('az-AZ', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

/** 1234.5 -> "1 234,50 ₼" */
export function money(value, currency = 'AZN') {
  const n = toNumber(value);
  const symbol = currency === 'AZN' ? '₼' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  return `${nf2.format(n)} ${symbol}`;
}

/** 1234.5 -> "1 235 ₼" (cədvəl və qrafiklər üçün) */
export function moneyShort(value, currency = 'AZN') {
  const n = toNumber(value);
  const symbol = currency === 'AZN' ? '₼' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  return `${nf0.format(Math.round(n))} ${symbol}`;
}

/** Böyük rəqəmləri yığcam göstərir: 12 500 -> "12,5 min ₼" */
export function moneyCompact(value, currency = 'AZN') {
  const n = toNumber(value);
  const symbol = currency === 'AZN' ? '₼' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${nf2.format(n / 1000000)} mln ${symbol}`;
  if (abs >= 10000) return `${nf2.format(n / 1000)} min ${symbol}`;
  return `${nf2.format(n)} ${symbol}`;
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** "2026-03-14" -> "14 mart 2026" */
export function dateLong(iso) {
  const d = parseDate(iso);
  if (!d) return '—';
  return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2026-03-14" -> "14.03.2026" */
export function dateShort(iso) {
  const d = parseDate(iso);
  if (!d) return '—';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function monthLabel(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return '—';
  const [y, m] = period.split('-').map(Number);
  if (m < 1 || m > 12) return '—';
  return `${AZ_MONTHS[m - 1]} ${y}`;
}

export function monthShort(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return '—';
  const [y, m] = period.split('-').map(Number);
  if (m < 1 || m > 12) return '—';
  return `${AZ_MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Cari ay: "2026-03" */
export function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function periodOf(iso) {
  const d = parseDate(iso);
  if (!d) return currentPeriod();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Son N ayın period siyahısı (ən köhnədən yeniyə) */
export function lastPeriods(count = 6) {
  const out = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
}

/** Aylar arasındakı fərq (daxil olmaqla) */
export function monthsBetween(fromISO, toDate = new Date()) {
  const from = parseDate(fromISO);
  if (!from) return 1;
  const months = (toDate.getFullYear() - from.getFullYear()) * 12 + (toDate.getMonth() - from.getMonth()) + 1;
  return Math.max(1, months);
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function pluralAz(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export const KIND_LABELS = {
  advance: 'Avans',
  salary: 'Maaş ödənişi',
  bonus: 'Mükafat',
  deduction: 'Tutulma'
};

export const METHOD_LABELS = {
  cash: 'Nağd',
  card: 'Kart',
  bank: 'Bank köçürməsi',
  other: 'Digər'
};

export const KIND_ICONS = {
  advance: 'i-wallet',
  salary: 'i-banknote',
  bonus: 'i-trending',
  deduction: 'i-minus'
};

/** CSV üçün təhlükəsiz hüceyrə */
export function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename, rows) {
  const content = '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
