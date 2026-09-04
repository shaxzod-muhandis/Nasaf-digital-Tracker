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

function verifyTelegramInitData(raw, botToken) {
  if (!botToken) return true; // lokal test rejimi (eski kod bilan bir xil xulq-atvor)
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
    return (
      crypto.createHmac("sha256", secret).update(checkStr).digest("hex") === hash
    );
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
  isAdminRole,
  createAuthMiddleware,
};
