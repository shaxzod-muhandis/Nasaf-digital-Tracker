#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Environment tekshiruvi — `npm run env:check`
// ═══════════════════════════════════════════════════════════════════════
// Savolga javob beradi: "lokalda nima yuklanyapti va qayerdan?"
//
// Sabab: `.env` va `.env.local` ikkalasi ham o'qiladi, birinchisi
// ustun turadi. Shuning uchun eski `.env` dagi NOTO'G'RI qiymat
// jimgina yotib, `.env.local` yo'qolgan kuni o'rniga chiqib qolishi
// mumkin. Aynan shunday nosozlik (eski APP_URL) real xodimlarga
// yetib borgan — qarang: netlify/functions/lib/notify.js.
//
// Qiymatlar HECH QACHON to'liq chiqarilmaydi: faqat uzunligi va
// oxirgi bir necha belgisi. Chiqishni skrinshot qilib yuborish
// xavfsiz bo'lishi kerak.
// ═══════════════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FAYLLAR = [".env.local", ".env"]; // ustunlik tartibida

// Kodda haqiqatda o'qiladigan kalitlar (process.env.* bo'yicha).
const KALITLAR = [
  { key: "DATABASE_URL", zarur: "majburiy", izoh: "Supabase pooler (port 6543)" },
  { key: "BOT_TOKEN", zarur: "majburiy", izoh: "@BotFather" },
  { key: "CRON_SECRET", zarur: "majburiy", izoh: "cron chaqiruvlari himoyasi" },
  { key: "ADMIN_CHAT_IDS", zarur: "muhim", izoh: "admin bildirishnomalari", muqobil: "ALL_CHAT_IDS" },
  { key: "APP_URL", zarur: "muhim", izoh: "bildirishnomadagi «Ilovani ochish» manzili" },
  { key: "BLOB_READ_WRITE_TOKEN", zarur: "muhim", izoh: "rasm/fayl yuklash (Vercel Blob)" },
  { key: "DATABASE_SSL", zarur: "ixtiyoriy", izoh: "faqat lokal Postgres uchun 'false'" },
  { key: "RESEND_API_KEY", zarur: "ixtiyoriy", izoh: "kalendar taklifnomasi xati" },
  { key: "MAIL_FROM", zarur: "ixtiyoriy", izoh: "xat jo'natuvchisi (domen tasdiqlangan bo'lsin)" },
  { key: "MINIAPP_URL", zarur: "ixtiyoriy", izoh: "bot nomi getMe bilan o'zi topiladi — kerak emas" },
  { key: "TEST_DATABASE_URL", zarur: "ixtiyoriy", izoh: "testlar uchun ALOHIDA baza" },
];

// Faylda bor, lekin kod o'qimaydigan kalitlar — shovqin.
const ESKIRGAN = ["JSONBIN_KEY", "JSONBIN_BIN_ID"];
// Vercel o'zi yozadi, biz tekshirmaymiz.
const TIZIM = ["VERCEL_OIDC_TOKEN", "NODE_ENV", "VERCEL_ENV"];

function parse(p) {
  if (!fs.existsSync(p)) return null;
  const out = {};
  fs.readFileSync(p, "utf8")
    .split("\n")
    .forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const i = t.indexOf("=");
      if (i === -1) return;
      let v = t.slice(i + 1).trim();
      if (v.length > 1 && v[0] === v[v.length - 1] && (v[0] === "'" || v[0] === '"')) {
        v = v.slice(1, -1);
      }
      out[t.slice(0, i).trim()] = v;
    });
  return out;
}

// Sir chiqib ketmasin: faqat uzunlik va oxirgi 4 belgi.
function niqob(v) {
  if (v === undefined) return "—";
  if (v === "") return "BO'SH";
  return v.length <= 8 ? `••• (${v.length})` : `•••${v.slice(-4)} (${v.length})`;
}

const yuklangan = {};
for (const nom of FAYLLAR) {
  const d = parse(path.join(ROOT, nom));
  if (!d) continue;
  for (const [k, v] of Object.entries(d)) if (!(k in yuklangan)) yuklangan[k] = { v, nom };
}

const mavjud = FAYLLAR.filter((n) => fs.existsSync(path.join(ROOT, n)));
console.log(`\nFayllar (ustunlik tartibida): ${mavjud.join("  >  ") || "hech qaysi topilmadi"}\n`);

let xato = 0;
let ogoh = 0;

console.log("KALIT".padEnd(24) + "QIYMAT".padEnd(18) + "MANBA".padEnd(14) + "HOLAT");
console.log("─".repeat(78));

for (const k of KALITLAR) {
  let rec = yuklangan[k.key];
  let nom = k.key;
  if (!rec && k.muqobil && yuklangan[k.muqobil]) {
    rec = yuklangan[k.muqobil];
    nom = `${k.key} (${k.muqobil})`;
  }
  const bor = rec && rec.v !== "";
  let holat;
  if (bor) holat = "✅";
  else if (k.zarur === "majburiy") (holat = "❌ YO'Q — majburiy"), xato++;
  else if (k.zarur === "muhim") (holat = "⚠️  yo'q — " + k.izoh), ogoh++;
  else holat = "·  yo'q (ixtiyoriy)";
  console.log(
    nom.padEnd(24) + niqob(rec && rec.v).padEnd(18) + (rec ? rec.nom : "—").padEnd(14) + holat,
  );
}

// ── Fayllar orasidagi ziddiyat ─────────────────────────────────────
const d0 = parse(path.join(ROOT, FAYLLAR[0])) || {};
const d1 = parse(path.join(ROOT, FAYLLAR[1])) || {};
const ziddiyat = Object.keys(d1).filter((k) => k in d0 && d1[k] && d0[k] !== d1[k]);
const bekor = Object.keys(d1).filter((k) => k in d0);

if (ziddiyat.length) {
  console.log(`\n⚠️  ${FAYLLAR[1]} da BOSHQACHA yozilgan (ishlatilmaydi, lekin kutib turadi):`);
  ziddiyat.forEach((k) =>
    console.log(`   ${k.padEnd(22)} ${FAYLLAR[0]}: ${niqob(d0[k])}   ${FAYLLAR[1]}: ${niqob(d1[k])}`),
  );
  console.log(
    `   ${FAYLLAR[0]} o'chsa yoki qayta yuklansa, shu eski qiymatlar o'rniga chiqadi.\n` +
      `   Yechim: ${FAYLLAR[1]} ni o'chirib, faqat \`vercel env pull\` ga tayaning.`,
  );
  ogoh += ziddiyat.length;
} else if (bekor.length && fs.existsSync(path.join(ROOT, FAYLLAR[1]))) {
  console.log(`\n·  ${FAYLLAR[1]} dagi ${bekor.length} ta kalit butunlay soyada — fayl keraksiz.`);
}

const eski = ESKIRGAN.filter((k) => k in yuklangan);
if (eski.length) console.log(`\n·  Kod o'qimaydigan eski kalitlar: ${eski.join(", ")}`);

const notanish = Object.keys(yuklangan).filter(
  (k) => !KALITLAR.some((x) => x.key === k || x.muqobil === k) && !ESKIRGAN.includes(k) && !TIZIM.includes(k),
);
if (notanish.length) console.log(`·  Nomi tanish bo'lmagan kalitlar: ${notanish.join(", ")}`);

console.log(
  xato
    ? `\n❌ ${xato} ta majburiy kalit yo'q — skriptlar ishlamaydi.\n`
    : ogoh
      ? `\n⚠️  Majburiylari joyida, ${ogoh} ta e'tibor talab qiladigan narsa bor.\n`
      : `\n✅ Hammasi joyida.\n`,
);
process.exit(xato ? 1 : 0);
