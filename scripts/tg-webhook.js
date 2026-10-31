// Telegram webhook'ini o'rnatadi, holatini ko'rsatadi yoki o'chiradi.
//
//   npm run tg:webhook           — holatni ko'rsatadi
//   npm run tg:webhook -- secret — maxfiy kalit yaratadi (o'rnatmaydi)
//   npm run tg:webhook -- set    — webhook'ni o'rnatadi
//   npm run tg:webhook -- off    — o'chiradi
//
// TARTIB MUHIM. Avval `secret`, kalitni .env.local va Vercel'ga
// qo'yib deploy qilinadi, ANDAN KEYIN `set`. Teskarisi bo'lsa
// Telegram xabar yubora boshlaydi, server esa kalitni bilmagani
// uchun hammasini 403 bilan rad etadi va ular yo'qoladi.
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

  if (amal === "secret") {
    if (process.env.TG_WEBHOOK_SECRET) {
      console.log("ℹ️  Kalit allaqachon bor. Yangisini yaratsangiz eskisi ishlamay qoladi.");
      console.log("   Hozirgisi:", process.env.TG_WEBHOOK_SECRET.slice(0, 6) + "…");
      console.log("\n   Baribir yangisi kerak bo'lsa, .env.local dagi qatorni o'chirib qayta urining.");
      return;
    }
    console.log("Quyidagi qatorni IKKI joyga qo'ying, keyin deploy qiling:\n");
    console.log(`    TG_WEBHOOK_SECRET=${crypto.randomBytes(24).toString("base64url")}\n`);
    console.log("    1) .env.local fayliga");
    console.log("    2) Vercel › Settings › Environment Variables");
    console.log("\nDeploy tugagach:  npm run tg:webhook -- set");
    return;
  }

  if (amal === "set") {
    const base = (process.env.APP_URL || "").replace(/\/+$/, "");
    if (!base.startsWith("https://")) {
      console.error("❌ APP_URL https bo'lishi kerak (Telegram http qabul qilmaydi). Hozir:", base || "(bo'sh)");
      process.exit(1);
    }
    const secret = process.env.TG_WEBHOOK_SECRET || "";
    if (!secret) {
      console.error("❌ TG_WEBHOOK_SECRET yo'q.\n");
      console.error("   Avval kalit yarating:  npm run tg:webhook -- secret");
      console.error("   Uni .env.local va Vercel'ga qo'ying, deploy qiling, keyin qaytib keling.");
      console.error("\n   Hozir o'rnatsak Telegram xabar yubora boshlaydi, server esa");
      console.error("   kalitni bilmagani uchun hammasini rad etadi va ular yo'qoladi.");
      process.exit(1);
    }
    await tg("setWebhook", {
      url: `${base}/api/tg/webhook`,
      secret_token: secret,
      // Faqat kerakli turlar: bot qo'shilgani/chiqarilgani va guruh
      // xabarlari. Qolganini so'ramaymiz — ortiqcha chaqiruv, ortiqcha
      // ma'lumot.
      allowed_updates: ["message", "my_chat_member"],
      // Navbatdagi xabarlarni TASHLAMAYMIZ: ular orasida "bot guruhga
      // qo'shildi" hodisalari bor va aynan o'shalar guruhlarni
      // ro'yxatdan o'tkazadi. Tashlab yuborsak, har guruhga qo'lda
      // xabar yozib chiqish kerak bo'lardi.
      drop_pending_updates: false,
      max_connections: 40,
    });
    console.log(`✅ Webhook o'rnatildi: ${base}/api/tg/webhook`);
    console.log("   Navbatda turgan xabarlar ham yetkaziladi — guruhlar o'zi ro'yxatdan o'tadi.\n");
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
    console.log(
      process.env.TG_WEBHOOK_SECRET
        ? "\n   O'rnatish uchun:  npm run tg:webhook -- set"
        : "\n   Boshlash uchun:   npm run tg:webhook -- secret",
    );
  }
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
