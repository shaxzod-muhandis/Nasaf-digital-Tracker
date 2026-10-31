// Telegram webhook'ini o'rnatadi, holatini ko'rsatadi yoki o'chiradi.
//
//   npm run tg:webhook          — holatni ko'rsatadi
//   npm run tg:webhook -- set   — o'rnatadi (APP_URL asosida)
//   npm run tg:webhook -- off   — o'chiradi
//
// TG_WEBHOOK_SECRET bo'lmasa, `set` uni o'zi yaratib beradi va
// ekranga chiqaradi — uni .env.local va Vercel'ga qo'yish kerak.
require("./_env.js").loadEnv();
const crypto = require("crypto");

const TOKEN = process.env.BOT_TOKEN || "";
const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;

async function tg(method, body) {
  const r = await fetch(API(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}

(async () => {
  if (!TOKEN) {
    console.error("❌ BOT_TOKEN topilmadi (.env.local ni tekshiring).");
    process.exit(1);
  }
  const amal = (process.argv[2] || "status").toLowerCase();
  const me = await tg("getMe");
  console.log(`🤖 Bot: @${me.username}\n`);

  if (amal === "off") {
    await tg("deleteWebhook", { drop_pending_updates: false });
    console.log("✅ Webhook o'chirildi. Bot endi guruhlarni eshitmaydi.");
    return;
  }

  if (amal === "set") {
    const base = (process.env.APP_URL || "").replace(/\/+$/, "");
    if (!base.startsWith("https://")) {
      console.error("❌ APP_URL https bo'lishi kerak (Telegram http qabul qilmaydi). Hozir:", base || "(bo'sh)");
      process.exit(1);
    }
    let secret = process.env.TG_WEBHOOK_SECRET || "";
    let yangi = false;
    if (!secret) {
      secret = crypto.randomBytes(24).toString("base64url");
      yangi = true;
    }
    await tg("setWebhook", {
      url: `${base}/api/tg/webhook`,
      secret_token: secret,
      // Faqat kerakli turlar: bot qo'shilgani/chiqarilgani va guruh
      // xabarlari. Qolganini so'ramaymiz — ortiqcha chaqiruv, ortiqcha
      // ma'lumot.
      allowed_updates: ["message", "my_chat_member"],
      drop_pending_updates: true,
      max_connections: 40,
    });
    console.log(`✅ Webhook o'rnatildi: ${base}/api/tg/webhook`);
    if (yangi) {
      console.log("\n⚠️  YANGI MAXFIY KALIT YARATILDI. Uni ikki joyga qo'ying:");
      console.log(`\n    TG_WEBHOOK_SECRET=${secret}\n`);
      console.log("    1) .env.local fayliga");
      console.log("    2) Vercel › Settings › Environment Variables");
      console.log("\n    Qo'ymasangiz server har xabarni 403 bilan rad etadi.");
    }
    console.log();
  }

  const info = await tg("getWebhookInfo");
  console.log("📡 Webhook holati");
  console.log("   manzil           :", info.url || "(o'rnatilmagan)");
  console.log("   maxfiy kalit     :", info.has_custom_certificate ? "(sertifikat)" : process.env.TG_WEBHOOK_SECRET ? "bor" : "YO'Q — xabarlar rad etiladi");
  console.log("   kutayotgan xabar :", info.pending_update_count);
  if (info.last_error_message) {
    console.log("   oxirgi xato      :", info.last_error_message,
      info.last_error_date ? `(${new Date(info.last_error_date * 1000).toISOString()})` : "");
  }
  if (!info.url) {
    console.log("\n   O'rnatish uchun:  npm run tg:webhook -- set");
  }
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
