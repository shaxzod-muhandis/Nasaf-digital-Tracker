#!/usr/bin/env node
// Lokal integratsion smoke-test — real Postgres'ga ulangan Express
// ilovasini haqiqiy HTTP so'rovlar bilan sinaydi. BOT_TOKEN atayin
// o'rnatilmagan (test rejimi — initData imzosi tekshirilmaydi).

require("../scripts/_env").loadEnv();
process.env.BOT_TOKEN = "";
const assert = require("assert");
const db = require("../netlify/functions/lib/db");
const { addMonthsClamped, addDays } = require("../netlify/functions/lib/dates");

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
  const user = JSON.stringify({ username, id });
  return `user=${encodeURIComponent(user)}&auth_date=1&hash=fake`;
}

async function cleanupTestData() {
  await db.query(`
    delete from projects
    where slug like 'test_loyiha%'
       or slug like 'boshqa_loyiha%'
       or slug like 'eski_loyiha%'
       or slug like 'oy_ortasida%'
       or slug like 'avto_tuzatish%'
  `);
  await db.query(`delete from users where username like 'test_employee%'`);
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
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}`;

  async function call(method, urlPath, { user, body, headers } = {}) {
    const h = { "Content-Type": "application/json", ...(headers || {}) };
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

  console.log("── AUTH ──────────────────────────────────────────");
  await check("super admin auth", async () => {
    const r = await call("POST", "/api/auth", { user: "shaxzodshokirov", body: {} });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.isSuperAdmin, true);
  });
  await check("noma'lum user 403", async () => {
    const r = await call("POST", "/api/auth", { user: "notauser_xyz", body: {} });
    assert.strictEqual(r.status, 403);
  });

  console.log("── USERS ─────────────────────────────────────────");
  await check("yangi xodim qo'shish", async () => {
    const r = await call("POST", "/api/users", { user: "shaxzodshokirov", body: { username: "test_employee" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.user.role, "employee");
  });
  await check("employee /api/users'ga kira olmaydi (403)", async () => {
    const r = await call("GET", "/api/users", { user: "test_employee" });
    assert.strictEqual(r.status, 403);
  });

  console.log("── PROJECTS + CYCLE YARATISH ────────────────────");
  let projectSlug;
  const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  await check("yangi loyiha yaratish (bugungi anchor)", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Test Loyiha", anchorDate: today, postsTarget: 3, storiesTarget: 2 },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.project.k, 3);
    projectSlug = r.json.project.id;
  });
  await check("admin GET /api/projects'da ko'rinadi", async () => {
    const r = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200);
    const p = r.json.projects.find((x) => x.id === projectSlug);
    assert.ok(p, "loyiha topilmadi");
    assert.strictEqual(p.doneK, 0);
  });
  await check("ruxsatsiz employee loyihani ko'rmaydi", async () => {
    const r = await call("GET", "/api/projects", { user: "test_employee" });
    assert.strictEqual(r.status, 200);
    assert.ok(
      !r.json.projects.some((project) => project.id === projectSlug),
      "employee yangi loyihani ruxsatsiz ko'rmasligi kerak",
    );
  });

  console.log("── PERMISSIONS ───────────────────────────────────");
  await check("ruxsat berish", async () => {
    const r = await call("PUT", "/api/permissions", {
      user: "shaxzodshokirov",
      body: { test_employee: [projectSlug] },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("endi employee loyihani ko'radi", async () => {
    const r = await call("GET", "/api/projects", { user: "test_employee" });
    assert.strictEqual(r.json.projects.length, 1);
  });

  console.log("── CHECKS ────────────────────────────────────────");
  await check("employee post#1 ni belgilaydi", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: "test_employee",
      body: { projectSlug, type: "k", seqNumber: 1, checked: true },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.doneK, 1);
  });
  await check("belgini bekor qiladi", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: "test_employee",
      body: { projectSlug, type: "k", seqNumber: 1, checked: false },
    });
    assert.strictEqual(r.json.doneK, 0);
  });
  await check("chegaradan tashqari seqNumber rad etiladi", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: "test_employee",
      body: { projectSlug, type: "k", seqNumber: 99, checked: true },
    });
    assert.strictEqual(r.status, 400);
  });

  console.log("── RUXSATSIZ LOYIHA ──────────────────────────────");
  let otherSlug;
  await check("2-loyiha yaratish (ruxsat berilmaydi)", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Boshqa Loyiha", anchorDate: today, postsTarget: 5, storiesTarget: 5 },
    });
    otherSlug = r.json.project.id;
  });
  await check("employee ruxsatsiz loyihada check bosa olmaydi (403)", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: "test_employee",
      body: { projectSlug: otherSlug, type: "k", seqNumber: 1, checked: true },
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.code, "NO_PROJECT_PERMISSION");
  });

  console.log("── CYCLE ROLLOVER + QARZ ─────────────────────────");
  let oldProjectSlug;
  await check("3 oy oldin boshlangan loyiha yaratish", async () => {
    const d = new Date(Date.now() + 5 * 3600 * 1000);
    d.setUTCMonth(d.getUTCMonth() - 3);
    const anchor = d.toISOString().slice(0, 10);
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Eski Loyiha", anchorDate: anchor, postsTarget: 2, storiesTarget: 2 },
    });
    oldProjectSlug = r.json.project.id;
    // YANGI QOIDA: qarz yopilmaguncha yangi oy ochilmaydi — shuning
    // uchun anchor 3 oy oldin bo'lsa ham, hali BIRINCHI (muddati allaqachon
    // o'tgan) davrning o'zida "osilib" turadi, avtomatik oldinga
    // surilmaydi.
    assert.strictEqual(r.json.project.periodStart, anchor, "hali ham birinchi (anchor) davrda turishi kerak");
  });
  await check("qarz yopilmaguncha yangi oy avtomatik OCHILMAYDI", async () => {
    const r = await call("GET", `/api/projects/${oldProjectSlug}/cycles`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const cycles = r.json.cycles;
    assert.strictEqual(cycles.length, 1, `faqat 1 ta (hali ochiq) davr kutilgan edi, ${cycles.length} keldi`);
    const only = cycles[0];
    assert.strictEqual(only.status, "active", "davr hali 'active' bo'lib qolishi kerak (yopilmagan)");
    assert.strictEqual(only.cycleIndex, 1);
    // Loyihalar ro'yxatida ham shu davr endi "qarz" sifatida ko'rinishi kerak
    const proj = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const p = proj.json.projects.find((x) => x.id === oldProjectSlug);
    assert.ok(p.outstandingDebt, "muddati o'tgan-lekin-tugallanmagan joriy davr 'qarz' sifatida ko'rinishi kerak edi");
  });
  await check("davr to'liq bajarilgach, YANGI oy avtomatik ochiladi", async () => {
    const r0 = await call("GET", `/api/projects/${oldProjectSlug}/cycles`, { user: "shaxzodshokirov" });
    const openCycleId = r0.json.cycles[0].cycleId;
    // Maqsad: k=2, s=2 — hammasini belgilaymiz (cycleId berilmaydi — bu
    // "joriy davr" oddiy Tracker checkbox oqimi, xuddi haqiqiy foydalanuvchi
    // qiladigandek).
    for (const type of ["k", "s"]) {
      for (let seq = 1; seq <= 2; seq++) {
        const r = await call("PATCH", "/api/checks", {
          user: "shaxzodshokirov",
          body: { projectSlug: oldProjectSlug, type, seqNumber: seq, checked: true },
        });
        assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      }
    }
    // Rollover lazy — /api/projects (ro'yxat) o'qilganda ensureCurrentCycle()
    // ishga tushib, endi TO'LIQ bajarilgan davrni yopib, yangisini ochadi.
    await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const after = await call("GET", `/api/projects/${oldProjectSlug}/cycles`, { user: "shaxzodshokirov" });
    const cycles = after.json.cycles;
    assert.strictEqual(cycles.length, 2, `endi 2 ta davr (eski to'liq yopilgan + yangi) kutilgan edi, ${cycles.length} keldi`);
    const closedOne = cycles.find((c) => c.cycleId === openCycleId);
    assert.strictEqual(closedOne.status, "closed");
    assert.strictEqual(closedOne.isDebt, false, "maqsadga to'liq yetilgani uchun qarz emas");
    const newActive = cycles.find((c) => c.status === "active");
    assert.ok(newActive, "yangi joriy davr ochilishi kerak edi");
    assert.strictEqual(newActive.periodStart, today, "kech qolingani uchun yangi davr BUGUNGI kundan boshlanishi kerak");
  });
  await check("legacy: eski (yopilgan) qarzli davrga qaytib to'lash hamon ishlaydi", async () => {
    // Bu yo'l endi faqat ARXIVLANGAN loyihalarda yoki shu o'zgarishdan
    // oldingi eski ma'lumotlarda uchraydi — to'g'ridan-to'g'ri SQL bilan
    // shunday holatni simulyatsiya qilamiz.
    const cyc = await db.query(
      `select id from project_cycles
       where project_id = (select id from projects where slug=$1) and status='active'`,
      [oldProjectSlug],
    );
    const cycleId = cyc.rows[0].id;
    await db.query(`update project_cycles set status='closed', is_debt=true, closed_at=now() where id=$1`, [cycleId]);
    const r = await call("PATCH", "/api/checks", {
      user: "shaxzodshokirov",
      body: { projectSlug: oldProjectSlug, type: "k", seqNumber: 1, checked: true, cycleId },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    // s hali yo'q edi (arxivlashdan oldin), shu sababli hali ham qarzli
    // bo'lib qolishi mumkin — muhimi endpoint xato bermasligi
    assert.strictEqual(typeof r.json.isDebt, "boolean");
    // Bu loyihada endi "active" davr yo'q (qo'lda yopib qo'yildi) —
    // keyingi testlar uni umumiy /api/projects orqali o'qib,
    // ensureCurrentCycle()ni chalkash holatda ishga tushirmasligi uchun
    // arxivlab qo'yamiz (tozalash bilan bir xil — bu loyiha shu testdan
    // keyin boshqa kerak emas).
    await db.query(`update projects set is_active=false where slug=$1`, [oldProjectSlug]);
  });

  console.log("── AVTOMATIK TUZATISH (yangi qoidadan oldin xato ochilgan bo'sh oy) ─");
  await check("bo'sh joriy davr + qarzli oldingi davr — o'qishning o'zida avtomatik orqaga qaytadi", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Avto Tuzatish Loyiha", anchorDate: today, postsTarget: 4, storiesTarget: 6 },
    });
    const slug = r.json.project.id;
    const projectId = (await db.query(`select id from projects where slug=$1`, [slug])).rows[0].id;
    const openCyc = await db.query(`select id from project_cycles where project_id=$1`, [projectId]);
    const prevStart = addMonthsClamped(today, -1);
    await db.query(
      `update project_cycles set period_start=$1, period_end=$2, status='closed', is_debt=true, closed_at=now()
       where id = $3`,
      [prevStart, addDays(today, -1), openCyc.rows[0].id],
    );
    await db.query(
      `insert into project_cycles (project_id, cycle_index, period_start, period_end, posts_target, stories_target, status)
       values ($1, 2, $2, $3, 4, 6, 'active')`,
      [projectId, today, addDays(addMonthsClamped(today, 1), -1)],
    );
    // Hech qanday qo'lda "fix" chaqirilmaydi — shunchaki loyihalar
    // ro'yxatini o'qiymiz (xuddi Panel/Loyihalar ekrani qilganidek).
    const list = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const p = list.json.projects.find((x) => x.id === slug);
    assert.strictEqual(p.periodStart, prevStart, "avtomatik ravishda eski (qarzli) davrga qaytishi kerak edi");
    assert.ok(p.outstandingDebt, "qarz darhol ko'rinishi kerak edi");
    const cycles = (await call("GET", `/api/projects/${slug}/cycles`, { user: "shaxzodshokirov" })).json.cycles;
    assert.strictEqual(cycles.length, 1, "bo'sh 2-davr o'chirilgan, faqat 1-davr qolishi kerak edi");
    assert.strictEqual(cycles[0].status, "active");
    await db.query(`update projects set is_active=false where slug=$1`, [slug]);
  });

  console.log("── DAVR SANASINI TUZATISH (oy o'rtasidan boshlangan loyihalar) ─");
  let midMonthSlug;
  await check("fixture: yopilgan qarzli davr + bo'sh joriy davr (eski tizim holatini simulyatsiya)", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Oy O'rtasida Loyiha", anchorDate: today, postsTarget: 10, storiesTarget: 15 },
    });
    midMonthSlug = r.json.project.id;
    const projectId = (await db.query(`select id, anchor_date from projects where slug=$1`, [midMonthSlug])).rows[0];
    const openCyc = await db.query(`select id from project_cycles where project_id=$1`, [projectId.id]);
    // 1-davrni "avvalgi oy"da yopilgan-qarzli qilib belgilaymiz, 2-davrni
    // bo'sh "joriy" sifatida qo'shamiz — xuddi eski (yangi qoidadan oldingi)
    // tizim qanday holat qoldirgan bo'lardi.
    const prevStart = addMonthsClamped(today, -1);
    await db.query(
      `update project_cycles set period_start=$1, period_end=$2, status='closed', is_debt=true, closed_at=now()
       where id = $3`,
      [prevStart, addDays(today, -1), openCyc.rows[0].id],
    );
    await db.query(`update projects set anchor_date=$1 where id=$2`, [prevStart, projectId.id]);
    await db.query(
      `insert into project_cycles (project_id, cycle_index, period_start, period_end, posts_target, stories_target, status)
       values ($1, 2, $2, $3, 10, 15, 'active')`,
      [projectId.id, today, addDays(addMonthsClamped(today, 1), -1)],
    );
  });
  await check("loyiha oy o'rtasidan boshlangani uchun oxirgi davr adolatsiz qarzga chiqqan bo'lsa — tuzatish mumkin", async () => {
    const before = await call("GET", `/api/projects/${midMonthSlug}/cycles`, { user: "shaxzodshokirov" });
    const activeBefore = before.json.cycles.find((c) => c.status === "active");
    const lastClosedBefore = before.json.cycles.find((c) => c.cycleIndex === activeBefore.cycleIndex - 1);
    assert.ok(lastClosedBefore.isDebt, "boshlang'ich holatda oxirgi yopilgan davr qarzli bo'lishi kerak edi");
    assert.strictEqual(activeBefore.doneK, 0, "joriy davr hali bo'sh bo'lishi kerak edi");

    const r = await call("POST", `/api/projects/${midMonthSlug}/fix-previous-cycle`, {
      user: "shaxzodshokirov",
      body: { periodStart: today },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));

    const after = await call("GET", `/api/projects/${midMonthSlug}/cycles`, { user: "shaxzodshokirov" });
    const cycles = after.json.cycles;
    assert.ok(!cycles.some((c) => c.cycleId === activeBefore.cycleId), "eski bo'sh joriy davr o'chirilishi kerak edi");
    const newActive = cycles.find((c) => c.status === "active");
    assert.strictEqual(newActive.cycleId, lastClosedBefore.cycleId, "oldingi davr qayta ochilib, joriy bo'lishi kerak edi");
    assert.strictEqual(newActive.isDebt, false, "qarz belgisi olib tashlanishi kerak edi");
    assert.strictEqual(newActive.periodStart, today);
  });
  await check("birinchi davrda oldingi davr yo'q — tuzatish rad etiladi (400)", async () => {
    const r = await call("POST", `/api/projects/${projectSlug}/fix-previous-cycle`, {
      user: "shaxzodshokirov",
      body: { periodStart: today },
    });
    assert.strictEqual(r.status, 400);
  });

  console.log("── ADMIN BOSHQARUVI ──────────────────────────────");
  await check("employee'ni admin qilish", async () => {
    const r = await call("POST", "/api/admins", { user: "shaxzodshokirov", body: { username: "test_employee" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.admins.includes("test_employee"));
  });
  await check("endi u admin sifatida barcha loyihalarni ko'radi", async () => {
    const r = await call("GET", "/api/projects", { user: "test_employee" });
    assert.ok(r.json.projects.length >= 3);
  });
  await check("adminlikdan olish", async () => {
    const r = await call("DELETE", "/api/admins/test_employee", { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200);
    assert.ok(!r.json.admins.includes("test_employee"));
  });

  console.log("── TELEGRAM BOT — KIRISH NAZORATI (access control) ─");
  await check("fixture: test_employee2 yaratiladi (Super Admin orqali)", async () => {
    const r = await call("POST", "/api/users", { user: "shaxzodshokirov", body: { username: "test_employee2" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.user.access_status, "active");
  });
  await check("oddiy admin (super emas) userga access bera olmaydi (403)", async () => {
    await call("POST", "/api/admins", { user: "shaxzodshokirov", body: { username: "test_employee" } });
    const r = await call("POST", "/api/users", { user: "test_employee", body: { username: "test_employee3" } });
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    const r2 = await call("PATCH", "/api/users/test_employee2/access", {
      user: "test_employee",
      body: { status: "blocked" },
    });
    assert.strictEqual(r2.status, 403, JSON.stringify(r2.json));
    await call("DELETE", "/api/admins/test_employee", { user: "shaxzodshokirov" });
  });
  await check("oddiy admin hali ham profil maydonlarini tahrirlay oladi", async () => {
    await call("POST", "/api/admins", { user: "shaxzodshokirov", body: { username: "test_employee" } });
    const r = await call("PATCH", "/api/users/test_employee2", {
      user: "test_employee",
      body: { jobTitle: "Test lavozim" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.user.job_title, "Test lavozim");
    await call("DELETE", "/api/admins/test_employee", { user: "shaxzodshokirov" });
  });
  await check("Super Admin userni bloklaydi", async () => {
    const r = await call("PATCH", "/api/users/test_employee2/access", {
      user: "shaxzodshokirov",
      body: { status: "blocked" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.user.access_status, "blocked");
  });
  await check("bloklangan user botga kira olmaydi — aniq xabar bilan", async () => {
    const r = await call("GET", "/api/me", { user: "test_employee2" });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.code, "BLOCKED");
    assert.ok(/bloklangan/i.test(r.json.error), JSON.stringify(r.json));
  });
  await check("Super Admin blokdan chiqaradi — user qayta kira oladi", async () => {
    const r = await call("PATCH", "/api/users/test_employee2/access", {
      user: "shaxzodshokirov",
      body: { status: "active" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const r2 = await call("GET", "/api/me", { user: "test_employee2" });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.json));
  });
  await check("fixture: test_employee2'ga loyihaga ruxsat beriladi", async () => {
    const r = await call("PUT", "/api/permissions", {
      user: "shaxzodshokirov",
      body: { test_employee2: [projectSlug] },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const g = await call("GET", "/api/permissions", { user: "shaxzodshokirov" });
    assert.ok((g.json.test_employee2 || []).includes(projectSlug), JSON.stringify(g.json));
  });
  await check("Super Admin userni chiqaradi (remove) — 'ruxsat mavjud emas' xabari bilan", async () => {
    const r = await call("PATCH", "/api/users/test_employee2/access", {
      user: "shaxzodshokirov",
      body: { status: "removed" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.user.access_status, "removed");
    const r2 = await call("GET", "/api/me", { user: "test_employee2" });
    assert.strictEqual(r2.status, 403);
    assert.strictEqual(r2.json.code, "NO_ACCESS");
    assert.ok(/ruxsat mavjud emas/i.test(r2.json.error), JSON.stringify(r2.json));
  });
  await check("chiqarilgan userning loyiha ruxsatlari ham tozalanadi", async () => {
    const g = await call("GET", "/api/permissions", { user: "shaxzodshokirov" });
    assert.ok(!(g.json.test_employee2 || []).length, JSON.stringify(g.json));
  });
  await check("chiqarilgan userga qayta ruxsat berish (Give Access)", async () => {
    const r = await call("PATCH", "/api/users/test_employee2/access", {
      user: "shaxzodshokirov",
      body: { status: "active" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const r2 = await call("GET", "/api/me", { user: "test_employee2" });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.json));
  });
  await check("noto'g'ri status qiymati rad etiladi (400)", async () => {
    const r = await call("PATCH", "/api/users/test_employee2/access", {
      user: "shaxzodshokirov",
      body: { status: "banned" },
    });
    assert.strictEqual(r.status, 400);
  });

  console.log("── LOYIHANI TAHRIRLASH VA ARXIVLASH (frontend uchun) ─");
  await check("loyihani tahrirlash (PUT /api/projects/:slug)", async () => {
    const r = await call("PUT", `/api/projects/${projectSlug}`, {
      user: "shaxzodshokirov",
      body: { label: "Test Loyiha (yangilangan)", postsTarget: 4, storiesTarget: 6, applyToCurrentCycle: true },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const after = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const p = after.json.projects.find((x) => x.id === projectSlug);
    assert.strictEqual(p.label, "Test Loyiha (yangilangan)");
    assert.strictEqual(p.k, 4);
    assert.strictEqual(p.s, 6);
  });
  await check("loyiha oy o'rtasidan boshlangan bo'lsa, davr boshlanish sanasini tuzatish mumkin", async () => {
    const shifted = new Date(Date.parse(today + "T00:00:00Z") + 3 * 86400000).toISOString().slice(0, 10);
    const r = await call("PUT", `/api/projects/${projectSlug}`, {
      user: "shaxzodshokirov",
      body: { label: "Test Loyiha (yangilangan)", postsTarget: 4, storiesTarget: 6, applyToCurrentCycle: true, periodStart: shifted },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const after = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const p = after.json.projects.find((x) => x.id === projectSlug);
    assert.strictEqual(p.periodStart, shifted, JSON.stringify(p));
    // Keyingi oy boshi - 1 kun bo'lishi kerak (taxminan 27-31 kun orasida)
    const days = Math.round((Date.parse(p.periodEnd + "T00:00:00Z") - Date.parse(shifted + "T00:00:00Z")) / 86400000);
    assert.ok(days >= 26 && days <= 30, `periodEnd oy chegarasiga mos emas: ${days} kun`);
  });
  await check("davr sanasi shu qadar orqaga tuzatilmaydiki, davr 'qarz'ga tushib qolsin", async () => {
    // 40 kun orqaga surilsa, yangi davr allaqachon tugagan bo'lardi —
    // bu holatda loyiha maqsadga yetmagani uchun adolatsiz "qarz"ga
    // chiqib ketmasligi kerak, shuning uchun rad etilishi kerak.
    const tooEarly = new Date(Date.parse(today + "T00:00:00Z") - 40 * 86400000).toISOString().slice(0, 10);
    const r = await call("PUT", `/api/projects/${projectSlug}`, {
      user: "shaxzodshokirov",
      body: { label: "Test Loyiha (yangilangan)", postsTarget: 4, storiesTarget: 6, applyToCurrentCycle: true, periodStart: tooEarly },
    });
    assert.strictEqual(r.status, 400, JSON.stringify(r.json));
    // Loyiha o'zgarishsiz qolgani (oldingi tuzatilgan sana saqlanib
    // qolgani) ni tasdiqlaymiz.
    const after = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const p = after.json.projects.find((x) => x.id === projectSlug);
    assert.notStrictEqual(p.periodStart, tooEarly);
  });
  await check("loyihani arxivlash (DELETE /api/projects/:slug)", async () => {
    const r = await call("DELETE", `/api/projects/${otherSlug}`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.archived, true);
    const list = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    assert.ok(
      !list.json.projects.some((x) => x.id === otherSlug),
      "arxivlangan loyiha ro'yxatda ko'rinmasligi kerak",
    );
  });
  await check("arxivlangan loyihaning tarixi hali ham ochiladi", async () => {
    const r = await call("GET", `/api/projects/${otherSlug}/cycles`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.cycles.length >= 1);
  });

  console.log("── CRON ENDPOINTLAR ──────────────────────────────");
  await check("rollover endpoint (super admin orqali)", async () => {
    const r = await call("POST", "/api/cycles/rollover", { user: "shaxzodshokirov", body: {} });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("pacing-eslatma endpoint (super admin orqali)", async () => {
    const r = await call("POST", "/api/reminder/run", { user: "shaxzodshokirov", body: {} });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("debug endpoint", async () => {
    const r = await call("GET", "/api/debug", { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200);
    // counts.projects faqat is_active=true'larni sanaydi — otherSlug yuqorida
    // arxivlangani uchun 3 emas, kamida 2 ta faol loyiha qolgan bo'lishi kerak
    assert.ok(parseInt(r.json.counts.projects) >= 2, JSON.stringify(r.json.counts));
  });

  await cleanupTestData();
  server.close();
  console.log(`\n${passed} ta o'tdi, ${failed} ta xato.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test skript ishga tushmadi:", e);
  cleanupTestData()
    .catch(() => {})
    .finally(() => process.exit(1));
});
