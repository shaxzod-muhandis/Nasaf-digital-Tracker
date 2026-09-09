// Vercel Cron Job — netlify/functions/scheduled-daily.js bilan bir xil
// vazifani bajaradi (kunlik: davr yangilash, vazifa/tug'ilgan kun
// eslatmalari), faqat Vercel'ning o'z chaqiruv konventsiyasiga moslab:
// Vercel cron so'rovlari GET bo'ladi va "Authorization: Bearer
// <CRON_SECRET>" header'ini o'zi qo'shadi (agar loyihada shu nomdagi
// environment variable mavjud bo'lsa). Qo'lda tekshirish uchun eski
// "X-Cron-Secret" header'i ham qabul qilinadi.
//
// Alohida, mustaqil funksiya sifatida yozilgan (Express ilovaga
// ulanmagan) — asosiy /api/* yo'nalishiga tegmasdan, xavfsiz qo'shish
// uchun.
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET || "";
  const authHeader = req.headers["authorization"] || "";
  const legacyHeader = req.headers["x-cron-secret"] || "";
  const authorized = !!secret && (authHeader === `Bearer ${secret}` || legacyHeader === secret);
  if (!authorized) {
    res.status(401).json({ error: "Ruxsatsiz" });
    return;
  }

  const base = process.env.APP_URL || `https://${req.headers.host}`;
  const endpoints = ["/api/cycles/rollover", "/api/reminder/run", "/api/birthdays/run"];

  const results = [];
  for (const path of endpoints) {
    try {
      const r = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "X-Cron-Secret": secret, "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await r.json().catch(() => ({}));
      results.push({ path, status: r.status, body });
    } catch (e) {
      results.push({ path, error: e.message });
    }
  }

  res.status(200).json({ ok: true, ranAt: new Date().toISOString(), results });
};
