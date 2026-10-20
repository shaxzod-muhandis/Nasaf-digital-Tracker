// ═══════════════════════════════════════════════════════════════════════
// Email yuborish (Resend)
// ═══════════════════════════════════════════════════════════════════════
// Faqat kalendar taklifnomalari uchun ishlatiladi. Ataylab qo'shimcha
// paket o'rnatilmagan — Resend oddiy REST API beradi va Node'ning o'z
// `fetch` i yetarli.
//
// Sozlanmagan bo'lsa (kalit yo'q) funksiya jim qaytadi: kalendar
// taklifnomasi qo'shimcha imkoniyat, uning yo'qligi reja saqlanishiga
// ta'sir qilmasligi kerak.
// ═══════════════════════════════════════════════════════════════════════

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "Nasaf Tracker <onboarding@resend.dev>";

function mailReady() {
  return !!RESEND_KEY;
}

// `ics` berilsa — taklifnoma sifatida biriktiriladi. Fayl nomi `.ics`
// bo'lishi muhim: Gmail va Apple Mail turni shunga qarab aniqlaydi va
// xat ichida "Kalendarga qo'shish" kartasini ko'rsatadi.
async function sendMail(db, { to, subject, text, html, ics, filename = "reja.ics" }) {
  if (!mailReady() || !to || !to.length) return { ok: false, reason: "no_key_or_recipient" };
  const body = {
    from: MAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (ics) {
    body.attachments = [{ filename, content: Buffer.from(ics, "utf8").toString("base64") }];
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok;
    if (!ok) console.error(`[mail ${r.status}]`, JSON.stringify(j));
    // Telegram xabarlari kabi, pochta ham jurnalga yoziladi — "xat
    // bordimi yo'qmi" degan savolga javob loglarni titmasdan topilsin.
    if (db) {
      await db
        .query(
          `insert into notification_log (chat_id, message, status, error) values ($1,$2,$3,$4)`,
          [
            `email:${(Array.isArray(to) ? to : [to]).join(",")}`,
            subject,
            ok ? "sent" : "error",
            ok ? null : JSON.stringify(j).slice(0, 500),
          ],
        )
        .catch(() => {});
    }
    return { ok, body: j };
  } catch (e) {
    console.error("[mail fetch]", e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMail, mailReady, MAIL_FROM };
