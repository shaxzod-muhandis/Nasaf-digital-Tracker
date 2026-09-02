#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Boshlang'ich foydalanuvchilarni yuklaydi — eski api.js'dagi qattiq
// yozilgan SUPER_ADMINS / ALLOWED_USERNAMES ro'yxatlari asosida.
// Idempotent: qayta ishga tushirsa xato bermaydi (ON CONFLICT DO NOTHING).
//
//   npm run db:seed
// ═══════════════════════════════════════════════════════════════════════

require("./_env").loadEnv();
const { Client } = require("pg");

// Eski netlify/functions/api.js'dan ko'chirilgan ro'yxatlar:
const SUPER_ADMINS = ["jahongirjuraqulov", "shaxzodshokirov"];
const EMPLOYEES = ["sta_nasaf", "logans_03", "mirshoddd", "rasulovjonibek", "nasafdigital_manager"];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL topilmadi.");
    process.exit(1);
  }
  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    for (const username of SUPER_ADMINS) {
      await client.query(
        `insert into users (username, role) values ($1, 'super_admin')
         on conflict (username) do update set role = 'super_admin'`,
        [username],
      );
      console.log(`✅ super_admin: @${username}`);
    }
    for (const username of EMPLOYEES) {
      await client.query(
        `insert into users (username, role) values ($1, 'employee')
         on conflict (username) do nothing`,
        [username],
      );
      console.log(`✅ employee: @${username}`);
    }
    console.log("\n🎉 Seed tugadi. Eslatma: bular hozircha 'employee' rolida —");
    console.log("   avvalgi tizimda kimdir dinamik admin bo'lgan bo'lsa, admin panelidan");
    console.log("   (Boshqaruv → Adminlar) qayta admin qilib belgilashni unutmang.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Seed xatosi:", e.message);
  process.exit(1);
});
