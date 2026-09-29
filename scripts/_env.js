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
function loadEnv(file) {
  if (file) return loadEnvFile(file);
  const root = path.join(__dirname, "..");
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(root, ".env"));
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
    if (process.env[key] === undefined) process.env[key] = value;
  });
}

module.exports = { loadEnv };
