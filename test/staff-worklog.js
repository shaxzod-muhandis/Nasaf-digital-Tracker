#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Faza 2 integratsion testi — xodimlar (staff), post tafsilotlari
// (kim montaj qildi / kim video oldi / qaysi kun) va oylik tabel.
//
// smoke.js bilan bir xil uslubda: real Postgres'ga ulangan Express
// ilovasiga haqiqiy HTTP so'rovlar yuboriladi. BOT_TOKEN ataylab bo'sh
// (test rejimi — initData imzosi tekshirilmaydi).
//
// Ishga tushirish:  npm run test:staff
// ═══════════════════════════════════════════════════════════════════════

require("../scripts/_env").loadEnv();
process.env.BOT_TOKEN = "";
const assert = require("assert");
const db = require("../netlify/functions/lib/db");

let passed = 0,
  failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

function initDataFor(username, id = 111) {
  return `user=${encodeURIComponent(JSON.stringify({ username, id }))}&auth_date=1&hash=fake`;
}

async function cleanupTestData() {
  await db.query(`delete from projects where slug like 'wl_test%'`);
  await db.query(`delete from staff where full_name ilike 'test %'`);
}

process.once("SIGINT", async () => {
  await cleanupTestData().catch(() => {});
  process.exit(130);
});

async function main() {
  await cleanupTestData();
  const app = require("../netlify/functions/api.js");
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  async function call(method, urlPath, { user, body } = {}) {
    const h = { "Content-Type": "application/json" };
    if (user) h["X-Telegram-Init-Data"] = initDataFor(user);
    const res = await fetch(`${BASE}${urlPath}`, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  }

  const ADMIN = "shaxzodshokirov";
  const EMP = "logans_03"; // seed'dagi oddiy xodim
  let editorId, videoId, slug;

  console.log("── XODIMLAR (staff) ──────────────────────────────");
  await check("montajchi qo'shish", async () => {
    const r = await call("POST", "/api/staff", {
      user: ADMIN,
      body: { fullName: "TEST Montajchi", position: "montajchi" },
    });
    assert.strictEqual(r.status, 200);
    editorId = r.json.staff.id;
    assert.ok(editorId, "id qaytmadi");
  });

  await check("mobilograf qo'shish", async () => {
    const r = await call("POST", "/api/staff", {
      user: ADMIN,
      body: { fullName: "TEST Mobilograf", position: "mobilograf" },
    });
    assert.strictEqual(r.status, 200);
    videoId = r.json.staff.id;
  });

  await check("bir xil ism+lavozim ikki marta qo'shilmaydi (409)", async () => {
    const r = await call("POST", "/api/staff", {
      user: ADMIN,
      body: { fullName: "TEST Montajchi", position: "montajchi" },
    });
    assert.strictEqual(r.status, 409);
  });

  await check("noma'lum lavozim rad etiladi (400)", async () => {
    const r = await call("POST", "/api/staff", {
      user: ADMIN,
      body: { fullName: "TEST Boshqa", position: "prezident" },
    });
    assert.strictEqual(r.status, 400);
  });

  await check("ro'yxatni oddiy xodim ham o'qiy oladi (modal uchun)", async () => {
    const r = await call("GET", "/api/staff", { user: EMP });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.staff.length >= 2);
  });

  await check("oddiy xodim yangi xodim qo'sha olmaydi (403)", async () => {
    const r = await call("POST", "/api/staff", {
      user: EMP,
      body: { fullName: "TEST Ruxsatsiz", position: "boshqa" },
    });
    assert.strictEqual(r.status, 403);
  });

  await check("xodimni tahrirlash", async () => {
    const r = await call("PATCH", `/api/staff/${editorId}`, {
      user: ADMIN,
      body: { fullName: "TEST Montajchi 2" },
    });
    assert.strictEqual(r.status, 200);
    const l = await call("GET", "/api/staff", { user: ADMIN });
    assert.ok(l.json.staff.some((s) => s.fullName === "Test Montajchi 2"), JSON.stringify(l.json.staff));
  });

  console.log("── POST TAFSILOTLARI (kim qildi / qaysi kun) ─────");
  await check("test loyihasi yaratish", async () => {
    const r = await call("POST", "/api/projects", {
      user: ADMIN,
      body: {
        label: "wl_test loyiha",
        anchorDate: new Date().toISOString().slice(0, 10),
        postsTarget: 5,
        storiesTarget: 3,
      },
    });
    assert.strictEqual(r.status, 200);
    const list = await call("GET", "/api/projects", { user: ADMIN });
    slug = list.json.projects.find((p) => p.label === "wl_test loyiha").id;
  });

  await check("post belgilash — montajchi, mobilograf va sana bilan", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: ADMIN,
      body: {
        projectSlug: slug,
        type: "k",
        seqNumber: 1,
        checked: true,
        editorId,
        videographerId: videoId,
        workDate: "2026-08-13",
      },
    });
    assert.strictEqual(r.status, 200);
  });

  await check("checkDetails javobda qaytadi (kalendar uchun)", async () => {
    const r = await call("GET", "/api/projects", { user: ADMIN });
    const p = r.json.projects.find((x) => x.id === slug);
    const d = p.checkDetails["k-1"];
    assert.ok(d, "checkDetails yo'q");
    assert.strictEqual(String(d.workDate).slice(0, 10), "2026-08-13");
    assert.strictEqual(d.editorName, "Test Montajchi 2");
    assert.strictEqual(d.videographerName, "Test Mobilograf");
    // eski frontend formati buzilmagan bo'lishi kerak
    assert.strictEqual(p.checks["k-1"], true);
  });

  await check("qayta belgilash tafsilotlarni yangilaydi", async () => {
    await call("PATCH", "/api/checks", {
      user: ADMIN,
      body: {
        projectSlug: slug,
        type: "k",
        seqNumber: 1,
        checked: true,
        editorId: videoId,
        videographerId: editorId,
        workDate: "2026-08-20",
      },
    });
    const r = await call("GET", "/api/projects", { user: ADMIN });
    const p = r.json.projects.find((x) => x.id === slug);
    assert.strictEqual(String(p.checkDetails["k-1"].workDate).slice(0, 10), "2026-08-20");
  });

  await check("noto'g'ri sana formati rad etiladi (400)", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: ADMIN,
      body: { projectSlug: slug, type: "k", seqNumber: 2, checked: true, workDate: "13.08.2026" },
    });
    assert.strictEqual(r.status, 400);
  });

  await check("sana berilmasa — bugungi kun yoziladi", async () => {
    await call("PATCH", "/api/checks", {
      user: ADMIN,
      body: { projectSlug: slug, type: "s", seqNumber: 1, checked: true },
    });
    const r = await call("GET", "/api/projects", { user: ADMIN });
    const p = r.json.projects.find((x) => x.id === slug);
    assert.ok(p.checkDetails["s-1"].workDate, "workDate bo'sh qoldi");
  });

  console.log("── TABEL (oylik yozuvlar) ────────────────────────");
  await check("tabel montajchi va mobilograflarni qaytaradi", async () => {
    const r = await call("GET", "/api/worklog?month=2026-08", { user: ADMIN });
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.editors));
    assert.ok(Array.isArray(r.json.videographers));
    assert.ok(r.json.editors.length >= 1, "montajchi yozuvi yo'q");
  });

  await check("tabelda qaysi loyiha/post ekani ko'rinadi", async () => {
    const r = await call("GET", "/api/worklog?month=2026-08", { user: ADMIN });
    const all = [...r.json.editors, ...r.json.videographers];
    const e = all.find((x) => x.name && /^test/i.test(x.name));
    assert.ok(e, "TEST xodim tabelda yo'q");
    assert.ok(e.items.length >= 1 && e.items[0].project, "items bo'sh");
  });

  await check("noto'g'ri month formati (400)", async () => {
    const r = await call("GET", "/api/worklog?month=2026", { user: ADMIN });
    assert.strictEqual(r.status, 400);
  });

  await check("oddiy xodim tabelni ko'ra olmaydi (403)", async () => {
    const r = await call("GET", "/api/worklog", { user: EMP });
    assert.strictEqual(r.status, 403);
  });

  await check("yozuv yo'q oy bo'sh qaytadi", async () => {
    const r = await call("GET", "/api/worklog?month=2030-01", { user: ADMIN });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.totalMarked, 0);
  });

  console.log("── XODIMNI O'CHIRISH ─────────────────────────────");
  await check("yumshoq o'chirish — ro'yxatdan chiqadi", async () => {
    const r = await call("DELETE", `/api/staff/${editorId}`, { user: ADMIN });
    assert.strictEqual(r.status, 200);
    const l = await call("GET", "/api/staff", { user: ADMIN });
    assert.ok(!l.json.staff.some((s) => s.id === editorId), "hali ro'yxatda");
  });

  await check("o'chirilgandan keyin eski tabel yozuvi saqlanadi", async () => {
    const r = await call("GET", "/api/worklog?month=2026-08", { user: ADMIN });
    assert.ok([...r.json.editors, ...r.json.videographers].length >= 1, "tabel bo'shab qoldi");
  });

  await cleanupTestData();
  server.close();
  console.log(`\n${passed} ta o'tdi, ${failed} ta xato.`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error("❌ Test xatosi:", e);
  await cleanupTestData().catch(() => {});
  process.exit(1);
});
