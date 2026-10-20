// Juda oddiy .env yuklovchi — tashqi `dotenv` paketiga bog'liq bo'lmaslik
// uchun (loyihada minimal dependency falsafasi saqlanadi). Faqat
// `node scripts/*.js` qo'lda ishga tushirilganda foydali; Netlify Functions
// ishlab chiqarishda (production) o'zining environment variables'idan
// foydalanadi, bu faylga muhtoj emas.
const fs = require("fs");
const path = require("path");

// `.env.local` — `vercel env pull` shu nomga yozadi va u odatda
// `.env`dan ustun turadi (standart konventsiya). Ikkalasi ham o'qiladi:
// avval `.env.local`, keyin `.env` — birinchi topilgan qiymat qoladi.
//
// Qaysi kalit qaysi fayldan kelgani eslab qolinadi: shu bo'lmasa, eski
// `.env` dagi NOTO'G'RI qiymat yangi `.env.local` tagida jimgina yotib,
// `.env.local` yo'qolgan kuni o'rniga chiqib qolardi. Bo'sh qiymat
// ustidan sakrash xavfsiz, farq qiluvchi qiymat esa ogohlantiriladi —
// APP_URL bilan aynan shunday nosozlik ishlab chiqarishga yetib borgan
// (2026-09-11, qarang: netlify/functions/lib/notify.js).
const envSource = {};
const envShadowed = [];

function loadEnv(file) {
  if (file) return loadEnvFile(file);
  const root = path.join(__dirname, "..");
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(root, ".env"));
  warnShadowed();
}

function warnShadowed() {
  if (!envShadowed.length) return;
  console.warn(
    `\n⚠️  Quyidagi kalitlar ikki faylda TURLICHA yozilgan. Amalda birinchisi ishlatildi:`,
  );
  envShadowed.forEach((x) => {
    console.warn(`   ${x.key}: ${x.used} (ishlatildi)  ←  ${x.ignored} (e'tiborsiz)`);
  });
  console.warn(`   Tekshirish: npm run env:check\n`);
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    const nom = path.basename(file);
    if (process.env[key] === undefined) {
      process.env[key] = value;
      envSource[key] = nom;
      return;
    }
    // Allaqachon bor. Ogohlantirish faqat shu yuklovchi qo'ygan va
    // qiymat HAQIQATDA farq qilsa — bo'sh qiymat yoki shelldan kelgan
    // o'zgaruvchi ustidan jim o'tiladi.
    if (envSource[key] && value && value !== process.env[key]) {
      envShadowed.push({ key, used: envSource[key], ignored: nom });
    }
  });
}

module.exports = { loadEnv, envSource };
