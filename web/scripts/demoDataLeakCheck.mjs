// Sprint 62.P16 — demo_data_leak_check.
//
// Гарантирует, что обезличенный demo-файл (public/signals.demo.json) и UI-тексты
// AI Outreach Engine не содержат реальных людей/источников. Падает (exit 1) при
// любом нарушении, поэтому встроен в web build — спринт не считается выполненным,
// если демо может раскрыть реальные данные.
//
// Что проверяем в signals.demo.json:
//   • запрещённые поля: contact_username, source_link, raw_message_text;
//   • запрещённые паттерны в значениях: @username, t.me/, бренд-денилист;
//   • совпадения с реальными именами/чатами/хэндлами из signals.import.json,
//     если этот (gitignored) файл присутствует локально.
// Плюс статический скан UI-исходников на бренд-денилист.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');

const DEMO_FILE = resolve(webRoot, 'public/signals.demo.json');
const OWNER_FILE = resolve(webRoot, 'public/signals.import.json');
const UI_FILES = [
  resolve(webRoot, 'src/pages/OutreachEngine.tsx'),
  resolve(webRoot, 'src/lib/outreach.ts'),
  resolve(webRoot, 'src/lib/signalsImport.ts'),
];

// Бренды реальных сообществ/площадок — не должны попадать в демо или UI.
const BRAND_DENYLIST = ['FriendlyVC', 'PE-VC', 'САИК'];
// Поля сырого экспорта, которые деанонимизируют источник.
const FORBIDDEN_FIELDS = ['contact_username', 'source_link', 'raw_message_text'];

const TG_USERNAME = /(^|[^\w@])@[A-Za-z][A-Za-z0-9_]{3,}/;
const TG_LINK = /t\.me\//i;

const violations = [];
const add = (where, msg) => violations.push(`${where}: ${msg}`);

function brandHits(text) {
  return BRAND_DENYLIST.filter((b) => text.toLowerCase().includes(b.toLowerCase()));
}

// ── 1. demo-файл ────────────────────────────────────────────────────────────
if (!existsSync(DEMO_FILE)) {
  add('signals.demo.json', 'файл отсутствует — Safe Demo Mode не сможет показать обезличенные данные');
} else {
  const raw = readFileSync(DEMO_FILE, 'utf8');

  for (const b of brandHits(raw)) add('signals.demo.json', `найден бренд из денилиста: «${b}»`);
  if (TG_LINK.test(raw)) add('signals.demo.json', 'найдена ссылка t.me/');
  const uname = raw.match(TG_USERNAME);
  if (uname) add('signals.demo.json', `найден Telegram @username: «${uname[0].trim()}»`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    add('signals.demo.json', `невалидный JSON: ${e.message}`);
  }

  if (parsed && Array.isArray(parsed.signals)) {
    parsed.signals.forEach((s, i) => {
      for (const f of FORBIDDEN_FIELDS) {
        if (s[f] != null && String(s[f]).trim() !== '') {
          add('signals.demo.json', `signals[${i}] содержит запрещённое поле «${f}»`);
        }
      }
    });
  }

  // ── 2. кросс-проверка с реальным owner-файлом (если есть локально) ─────────
  if (existsSync(OWNER_FILE)) {
    try {
      const owner = JSON.parse(readFileSync(OWNER_FILE, 'utf8'));
      const realStrings = new Set();
      for (const s of owner.signals ?? []) {
        for (const f of ['contact_name', 'contact_username', 'source_title']) {
          const v = (s[f] || '').trim();
          if (v) realStrings.add(v);
        }
      }
      const lowerDemo = raw.toLowerCase();
      for (const v of realStrings) {
        // только осмысленные строки (не «—», не общие слова)
        if (v.length >= 4 && lowerDemo.includes(v.toLowerCase())) {
          add('signals.demo.json', `совпадает с реальными данными из signals.import.json: «${v}»`);
        }
      }
    } catch {
      // owner-файл локальный и может быть невалиден — это не валит demo-проверку.
    }
  }
}

// ── 3. UI-исходники ─────────────────────────────────────────────────────────
for (const file of UI_FILES) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const b of brandHits(text)) add(file.replace(webRoot + '/', ''), `захардкожен бренд из денилиста: «${b}»`);
}

// ── результат ─────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.error('\n✗ demo_data_leak_check: обнаружены потенциальные утечки реальных данных в демо:\n');
  for (const v of violations) console.error('  • ' + v);
  console.error('\nДемо не должно раскрывать реальных людей или закрытые источники. Сборка остановлена.\n');
  process.exit(1);
}

console.log('✓ demo_data_leak_check: signals.demo.json и UI-тексты чисты (без @username, t.me/, брендов и реальных данных).');
