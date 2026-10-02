// ═══════════════════════════════════════════════════════════════════════
// TESTLAR REAL BAZAGA TEGMASLIGI UCHUN QO'RIQCHI
//
// Testlar haqiqiy HTTP so'rovlar yuboradi va haqiqiy yozuvlar yaratadi:
// loyiha, xodim, vazifa, belgi, Ncoin. Ular tozalab ketsa ham, ishlab
// turgan bazada bajarilishi noto'g'ri — bitta uzilish (tarmoq uzilsa,
// test o'rtasida to'xtasa) real ma'lumot orasida qoldiq qoldiradi, va
// test paytidagi har bir yozuv real hisobotlarga tushib turadi.
//
// Shuning uchun testlar FAQAT alohida baza bilan ishlaydi:
//   TEST_DATABASE_URL — .env.local / .env ichida
//
// U sozlanmagan bo'lsa test ishga tushmaydi (production'ga sukut
// bo'yicha tushib ketmasligi uchun). Ataylab real bazada ishlatish
// kerak bo'lsa — ALLOW_PROD_TESTS=1 bilan ochiq aytiladi.
// ═══════════════════════════════════════════════════════════════════════

require("../scripts/_env").loadEnv();

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(noma'lum)";
  }
}

function useTestDatabase() {
  const testUrl = process.env.TEST_DATABASE_URL;
  const prodUrl = process.env.DATABASE_URL;

  if (testUrl) {
    if (prodUrl && testUrl === prodUrl) {
      console.error("❌ TEST_DATABASE_URL va DATABASE_URL bir xil — bu alohida baza emas.");
      process.exit(1);
    }
    process.env.DATABASE_URL = testUrl;
    console.log(`🧪 Test bazasi: ${hostOf(testUrl)}\n`);
    return;
  }

  if (process.env.ALLOW_PROD_TESTS === "1") {
    console.log("⚠️  ALLOW_PROD_TESTS=1 — testlar ASOSIY bazada ishlayapti.");
    console.log(`   Baza: ${hostOf(prodUrl || "")}\n`);
    return;
  }

  console.error("❌ TEST_DATABASE_URL sozlanmagan — testlar ishga tushmadi.");
  console.error("");
  console.error("   Testlar real yozuvlar yaratadi, shuning uchun ishlab turgan");
  console.error("   bazada bajarilmaydi. Alohida baza kerak:");
  console.error("");
  console.error("     1. Supabase'da yangi (bo'sh) loyiha oching");
  console.error("     2. .env.local ichiga yozing:");
  console.error("          TEST_DATABASE_URL='postgresql://...'");
  console.error("     3. npm run db:migrate:test");
  console.error("");
  console.error("   (Ataylab asosiy bazada ishlatish kerak bo'lsa: ALLOW_PROD_TESTS=1)");
  process.exit(1);
}

module.exports = { useTestDatabase };
