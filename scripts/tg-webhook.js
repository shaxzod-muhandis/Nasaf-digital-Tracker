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

// Telegram'da `/` yozilganda va input yonidagi "Menu" tugmasida
// ko'rinadigan ro'yxat. Shu yerda turgani uchun yangi buyruq
// qo'shilganda bitta joyni yangilash kifoya.
const BUYRUQLAR = [
  { command: "menu", description: "Asosiy menyu" },
  { command: "vazifalar", description: "Ochiq vazifalar" },
  { command: "task", description: "Dizayn guruhida: yangi vazifa ochish" },
];
const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;

const kut = (ms) => new Promise((r) => setTimeout(r, ms));

// Tarmoq uzilishi bu skriptni butunlay to'xtatib qo'yardi va odam
// buyruqni qo'lda qayta terishi kerak bo'lardi. Faqat ULANISH xatosi
// qayta uriniladi — Telegram'ning o'zi rad etgan so'rov (noto'g'ri
// token, noto'g'ri URL) qayta urinishdan tuzalmaydi, uni darhol
// ko'rsatish kerak.
async function tg(method, body) {
  let oxirgi;
  for (let urinish = 1; urinish <= 3; urinish++) {
    let r;
    try {
      r = await fetch(API(method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      oxirgi = e;
      if (urinish < 3) {
        console.log(`   ⏳ ${method}: ulanmadi (${e.cause?.code || e.name}), qayta urinaman…`);
        await kut(urinish * 1500);
        continue;
      }
      throw new Error(`${method}: tarmoqqa ulanib bo'lmadi (${e.cause?.code || e.name}). Internetni tekshiring.`);
    }
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
    return j.result;
  }
  throw oxirgi;
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
      // Faqat kerakli turlar: bot qo'shilgani/chiqarilgani, xabarlar
      // va menyu tugmalari. Qolganini so'ramaymiz — ortiqcha chaqiruv,
      // ortiqcha ma'lumot.
      //
      // `callback_query` SHART: busiz inline menyu tugmalari bosilganda
      // Telegram serverga hech narsa yubormaydi va tugma ustida
      // aylanuvchi belgi qotib qoladi.
      //
      // `message_reaction` ham SHART: tasdiqlangan ishni mijoz guruhiga
      // yuborish aynan reaksiyadan boshlanadi. Buning IKKI sharti bor
      // va ikkalasi ham Telegram tomonidan qo'yilgan:
      //   1) shu yerda ochiq ko'rsatilishi (standart ro'yxatga kirmaydi);
      //   2) bot o'sha guruhda ADMIN bo'lishi.
      // Admin bo'lmasa Telegram reaksiyalarni umuman yubormaydi —
      // server tomonda tuzatib bo'lmaydigan yagona joy shu.
      allowed_updates: ["message", "my_chat_member", "callback_query", "message_reaction"],
      // Navbatdagi xabarlarni TASHLAMAYMIZ: ular orasida "bot guruhga
      // qo'shildi" hodisalari bor va aynan o'shalar guruhlarni
      // ro'yxatdan o'tkazadi. Tashlab yuborsak, har guruhga qo'lda
      // xabar yozib chiqish kerak bo'lardi.
      drop_pending_updates: false,
      max_connections: 40,
    });
    console.log(`✅ Webhook o'rnatildi: ${base}/api/tg/webhook`);
    console.log("   Navbatda turgan xabarlar ham yetkaziladi — guruhlar o'zi ro'yxatdan o'tadi.\n");
    await tg("setMyCommands", { commands: BUYRUQLAR });
    console.log("✅ Buyruqlar ro'yxati yangilandi (`/` yozilganda va Menu tugmasida chiqadi):");
    BUYRUQLAR.forEach((c) => console.log(`   /${c.command} — ${c.description}`));
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
