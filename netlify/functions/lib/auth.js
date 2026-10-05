// ═══════════════════════════════════════════════════════════════════════
// Telegram autentifikatsiya + rol tizimi
// ═══════════════════════════════════════════════════════════════════════
// HMAC tekshiruvi eski koddan bir xil (o'zgarishsiz) ko'chirildi — bu
// qism to'g'ri ishlagan va Telegram'ning rasmiy talabiga mos edi.
// Farq: ruxsat berilgan foydalanuvchilar ro'yxati endi kod ichida
// qattiq yozilgan Set emas, balki `users` jadvalidan olinadi.
//
// Tizim faqat Telegram Web App (Mini App) orqali ishlaydi — boshqa
// autentifikatsiya usuli (masalan alohida web-sayt login) ataylab yo'q.
// ═══════════════════════════════════════════════════════════════════════

const crypto = require("crypto");

// `initData` qancha vaqt yaroqli. Telegram `auth_date` beradi va
// tavsiyasi — eski ma'lumotni rad etish. Busiz bir marta qo'lga tushgan
// satr (masalan brauzer tarixidan yoki log'dan) abadiy ishlayverardi.
const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;

function verifyTelegramInitData(raw, botToken) {
  // Imzosiz rejim — FAQAT lokal test uchun. Avval shunchaki
  // `if (!botToken) return true` edi: production'da env o'zgaruvchisi
  // yo'qolsa yoki yangi muhitga ko'chirilmasa, autentifikatsiya
  // butunlay o'chib qolardi va har kim istalgan username bilan
  // (shu jumladan super admin bo'lib) kira olardi.
  if (!botToken) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
      console.error("BOT_TOKEN sozlanmagan — production'da imzosiz kirishga ruxsat berilmaydi");
      return false;
    }
    return true;
  }
  try {
    const params = new URLSearchParams(raw);
    const hash = params.get("hash");
    if (!hash) return false;
    params.delete("hash");
    const checkStr = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expected = crypto.createHmac("sha256", secret).update(checkStr).digest("hex");
    // Vaqt bo'yicha teng solishtirish — hash'ni belgima-belgi taxmin
    // qilish yo'lini yopadi.
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

    // Muddat. `auth_date` — Unix soniya.
    const authDate = Number(params.get("auth_date"));
    if (!Number.isFinite(authDate)) return false;
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > INIT_DATA_MAX_AGE_SEC) return false;
    // Kelajakdagi sana ham shubhali (soat farqiga biroz yon beriladi).
    if (age < -300) return false;
    return true;
  } catch {
    return false;
  }
}

function getUsernameFromInitData(raw) {
  try {
    return (
      JSON.parse(new URLSearchParams(raw).get("user") || "{}").username || ""
    ).toLowerCase();
  } catch {
    return null;
  }
}

// Telegram profil rasmi — initData ichidagi `user.photo_url`. Bu
// qiymat HMAC bilan imzolangan ma'lumotdan olinadi, ya'ni brauzer uni
// o'zgartira olmaydi.
//
// Rasm HAR DOIM ham kelavermaydi: foydalanuvchi Telegram'da profil
// rasmini kimlar ko'rishini cheklagan bo'lsa yoki ilova qanday
// ochilganiga qarab maydon umuman bo'lmasligi mumkin. Shu sabab
// bo'sh qiymat "rasm o'chirilgan" degani EMAS — bunday holda eski
// rasm saqlanib qoladi.
function getPhotoUrlFromInitData(raw) {
  try {
    const url = JSON.parse(new URLSearchParams(raw).get("user") || "{}").photo_url;
    return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

function isAdminRole(role) {
  return role === "super_admin" || role === "admin";
}

// select'ga profil maydonlari ham qo'shildi (Profil ekrani uchun) — bundan
// tashqari hech narsa eski xulq-atvordan farq qilmaydi.
const USER_ROW_SELECT = `select id, username, full_name, role, is_active, access_status, telegram_chat_id,
       first_name, last_name, birth_date, phone, job_title, telegram_user_id, avatar_url,
       birthday_ack_date
       from users`;

// Express middleware factory — `db` bog'lab beriladi (bog'liqlikni
// aniq ko'rsatish uchun, global holatga tayanmaslik).
function createAuthMiddleware(db) {
  return async function auth(req, res, next) {
    const initData = req.headers["x-telegram-init-data"] || "";
    if (!initData) {
      return res.status(401).json({ error: "Telegram orqali kiring", code: "NO_INIT_DATA" });
    }
    const botToken = process.env.BOT_TOKEN || "";
    if (!verifyTelegramInitData(initData, botToken)) {
      return res.status(401).json({ error: "Noto'g'ri imzo", code: "INVALID_SIGNATURE" });
    }
    const username = getUsernameFromInitData(initData);
    if (!username) {
      return res.status(403).json({ error: "Ruxsat yo'q", code: "FORBIDDEN", username: null });
    }
    try {
      const r = await db.query(`${USER_ROW_SELECT} where username = $1`, [username]);
      const row = r.rows[0];
      // Uchta holat aniq farqlanadi (TZ: "Blocked user" va "mavjud emas/
      // removed" uchun turli xabar ko'rsatilishi kerak):
      //   yo'q / removed -> "ruxsat mavjud emas"
      //   blocked        -> "kirish huquqingiz bloklangan"
      if (!row || row.access_status === "removed") {
        return res.status(403).json({
          error: "Sizda ushbu botdan foydalanish uchun ruxsat mavjud emas.",
          code: "NO_ACCESS",
          username,
        });
      }
      if (row.access_status === "blocked") {
        return res.status(403).json({
          error: "Sizning botdan foydalanish huquqingiz bloklangan.",
          code: "BLOCKED",
          username,
        });
      }
      if (!row.is_active) {
        // Ehtiyot chorasi — access_status='active' bo'lsa ham is_active
        // qandaydir sabab bilan mos kelmasa (nazariy jihatdan sodir
        // bo'lmasligi kerak, ikkalasi doim sinxron yozilgani uchun).
        return res.status(403).json({ error: "Ruxsat yo'q", code: "FORBIDDEN", username });
      }
      // Profil rasmi o'zgargan bo'lsa — yangilaymiz. Har so'rovda
      // tekshiriladi, lekin yozish faqat manzil haqiqatan boshqa
      // bo'lgandagina bo'ladi. So'rovni kutdirmaymiz: rasm yangilanishi
      // javobga ta'sir qilmasligi kerak.
      const photoUrl = getPhotoUrlFromInitData(initData);
      if (photoUrl && photoUrl !== row.avatar_url) {
        row.avatar_url = photoUrl;
        db.query(`update users set avatar_url = $1 where id = $2`, [photoUrl, row.id]).catch((e) =>
          console.error("Avatar yangilanmadi:", e.message),
        );
      }
      req.tgUser = row.username;
      req.user = row;
      next();
    } catch (e) {
      console.error("Auth DB xatosi:", e.message);
      res.status(500).json({ error: "Server xatosi (auth)" });
    }
  };
}

module.exports = {
  verifyTelegramInitData,
  getUsernameFromInitData,
  getPhotoUrlFromInitData,
  isAdminRole,
  createAuthMiddleware,
};
