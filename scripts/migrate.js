#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// supabase/migrations/*.sql fayllarini DATABASE_URL'ga tartib bilan
// qo'llaydi. `npm run db:migrate` orqali ishga tushiriladi.
//
// Eslatma: buni Supabase SQL Editor'da qo'lda ham bajarish mumkin —
// bu skript shunchaki qulaylik uchun (CI/terminal'dan bir buyruq bilan).
// ═══════════════════════════════════════════════════════════════════════

require("./_env").loadEnv();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  // `--test` bilan migratsiyalar TEST_DATABASE_URL'ga qo'llanadi —
  // testlar uchun alohida bazani tayyorlashda shu ishlatiladi.
  const useTest = process.argv.includes("--test");
  const envName = useTest ? "TEST_DATABASE_URL" : "DATABASE_URL";
  const connectionString = process.env[envName];
  if (!connectionString) {
    console.error(`❌ ${envName} environment o'zgaruvchisi topilmadi.`);
    console.error(`   .env.local faylida ${envName}='postgresql://...' o'rnating.`);
    process.exit(1);
  }
  if (useTest && connectionString === process.env.DATABASE_URL) {
    console.error("❌ TEST_DATABASE_URL asosiy baza bilan bir xil — to'xtatildi.");
    process.exit(1);
  }
  try {
    console.log(`📦 Baza: ${new URL(connectionString).host}${useTest ? " (test)" : ""}`);
  } catch {}

  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("Hech qanday migratsiya fayli topilmadi:", dir);
    return;
  }

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("✅ Bazaga ulandi.");

  try {
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      console.log(`▶ Bajarilmoqda: ${file} ...`);
      await client.query(sql);
      console.log(`  ✅ ${file} muvaffaqiyatli`);
    }
    console.log("\n🎉 Barcha migratsiyalar muvaffaqiyatli qo'llandi.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Migratsiya xatosi:", e.message);
  process.exit(1);
});
