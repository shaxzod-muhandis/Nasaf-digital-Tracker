// ═══════════════════════════════════════════════════════════════════════
// Netlify Scheduled Function — kunlik avtomatlashtirish.
// ═══════════════════════════════════════════════════════════════════════
// Tashqi cron xizmati (masalan cron-job.org)ga bog'liq bo'lib qolmaslik
// uchun — Netlify'ning o'zi shu funksiyani netlify.toml'dagi jadval
// bo'yicha har kuni chaqiradi. Funksiya faqat uchta mavjud cron
// endpoint'ni (X-Cron-Secret bilan himoyalangan) o'zi chaqiradi — mantiq
// ikki joyda takrorlanmasin deb, hech qanday alohida biznes-logika
// yozilmagan.
//
// Tartib muhim: avval davr (cycle) holatini yangilaymiz (rollover),
// keyin shu yangilangan holat asosida eslatmalarni hisoblaymiz.
// ═══════════════════════════════════════════════════════════════════════

exports.handler = async () => {
  const base = process.env.URL || "";
  const secret = process.env.CRON_SECRET || "";
  const endpoints = ["/api/cycles/rollover", "/api/reminder/run", "/api/birthdays/run"];

  const results = [];
  for (const path of endpoints) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "X-Cron-Secret": secret, "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      results.push({ path, status: res.status, body });
    } catch (e) {
      results.push({ path, error: e.message });
    }
  }

  console.log("Kunlik avtomatlashtirish natijasi:", JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ ok: true, ranAt: new Date().toISOString(), results }) };
};
