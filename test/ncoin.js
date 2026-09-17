#!/usr/bin/env node
// Ncoin (rol-asosli mukofot) + NShop uchun integratsion smoke-test —
// mavjud test fayllari (smoke.js, profile-and-tasks.js) bilan bir xil
// uslub.

require("../scripts/_env").loadEnv();
process.env.BOT_TOKEN = "";
const assert = require("assert");
const db = require("../netlify/functions/lib/db");
const { closeCycle } = require("../netlify/functions/lib/cycles");

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
  // Tartib muhim: ncoin_transactions users'ga FK bilan bog'langan,
  // shuning uchun avval tranzaksiyalar, keyingina userlar o'chiriladi.
  await db.query(`
    delete from ncoin_transactions where user_id in (select id from users where username like 'test_ncoin%')
  `);
  await db.query(`delete from tasks where title like 'Ncoin test vazifa%'`);
  await db.query(`delete from projects where slug like 'ncoin_test_loyiha%'`);
  await db.query(`delete from users where username like 'test_ncoin%'`);
  await db.query(`delete from ncoin_products where name like 'Test Mahsulot%'`);
}

process.once("SIGINT", async () => {
  await cleanupTestData().catch(() => {});
  process.exit(130);
});

async function userId(username) {
  const r = await db.query(`select id from users where username = $1`, [username]);
  return r.rows[0].id;
}

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

  const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

  const EMP = "test_ncoin_emp";
  const EDITOR = "test_ncoin_editor";
  const VIDEO = "test_ncoin_video";
  const SMM = "test_ncoin_smm";

  for (const u of [EMP, EDITOR, VIDEO, SMM]) {
    await check(`${u} yaratiladi`, async () => {
      const r = await call("POST", "/api/users", { user: "shaxzodshokirov", body: { username: u } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    });
  }

  let projectSlug;
  await check("test loyiha yaratiladi va hammaga ruxsat beriladi", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Ncoin Test Loyiha", anchorDate: today, postsTarget: 5, storiesTarget: 5 },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    projectSlug = r.json.project.id;
    for (const u of [EMP, EDITOR, VIDEO, SMM]) {
      const p = await call("PUT", "/api/permissions", { user: "shaxzodshokirov", body: { [u]: [projectSlug] } });
      assert.strictEqual(p.status, 200, JSON.stringify(p.json));
    }
  });

  let editorId, videoId;
  await check("loyiha-ichidagi rollar beriladi (montajchi/mobilograf/smm)", async () => {
    editorId = await userId(EDITOR);
    videoId = await userId(VIDEO);
    const r1 = await call("PATCH", "/api/permissions/role", {
      user: "shaxzodshokirov",
      body: { username: EDITOR, projectSlug, role: "montajchi" },
    });
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.json));
    const r2 = await call("PATCH", "/api/permissions/role", {
      user: "shaxzodshokirov",
      body: { username: VIDEO, projectSlug, role: "mobilograf" },
    });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.json));
    const r3 = await call("PATCH", "/api/permissions/role", {
      user: "shaxzodshokirov",
      body: { username: SMM, projectSlug, role: "smm" },
    });
    assert.strictEqual(r3.status, 200, JSON.stringify(r3.json));
  });

  async function balanceOf(username) {
    const r = await call("GET", "/api/ncoin/me", { user: username });
    return r.json.balance;
  }

  console.log("── POST → NCOIN (video + montaj + SMM) ──────────────");
  await check("post#1: video+montaj+SMM uchligi to'liq bo'lsa — 3 xil odamga +1", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: EMP,
      body: { projectSlug, type: "k", seqNumber: 1, checked: true, editorUserId: editorId, videographerUserId: videoId },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EDITOR), 1);
    assert.strictEqual(await balanceOf(VIDEO), 1);
    assert.strictEqual(await balanceOf(SMM), 1);
  });
  await check("post#1 bekor qilinsa — uchala balans ham 0ga qaytadi", async () => {
    const r = await call("PATCH", "/api/checks", { user: EMP, body: { projectSlug, type: "k", seqNumber: 1, checked: false } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EDITOR), 0);
    assert.strictEqual(await balanceOf(VIDEO), 0);
    assert.strictEqual(await balanceOf(SMM), 0);
  });
  await check("post#2: faqat montajchi tanlansa — faqat montajchiga (+ SMM har doim) beriladi", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: EMP,
      body: { projectSlug, type: "k", seqNumber: 2, checked: true, editorUserId: editorId },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EDITOR), 1);
    assert.strictEqual(await balanceOf(VIDEO), 0);
    assert.strictEqual(await balanceOf(SMM), 1);
  });
  await check("post#2 bekor qilinadi (tozalash)", async () => {
    await call("PATCH", "/api/checks", { user: EMP, body: { projectSlug, type: "k", seqNumber: 2, checked: false } });
    assert.strictEqual(await balanceOf(EDITOR), 0);
    assert.strictEqual(await balanceOf(SMM), 0);
  });

  console.log("── Bitta user ikkita rolda (ko'p-qabul-qiluvchili reverseNcoin) ──");
  await check("bitta user ham montaj ham video sifatida tanlansa — ikkita alohida yozuv", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: EMP,
      body: { projectSlug, type: "k", seqNumber: 3, checked: true, editorUserId: editorId, videographerUserId: editorId },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EDITOR), 2); // +1 montaj, +1 video
  });
  await check("bekor qilinsa — ikkalasi ham qaytariladi", async () => {
    await call("PATCH", "/api/checks", { user: EMP, body: { projectSlug, type: "k", seqNumber: 3, checked: false } });
    assert.strictEqual(await balanceOf(EDITOR), 0);
  });

  console.log("── Ketma-ket belgilab-bekor qilish (eski reverseNcoin xatosi regressiyasi) ──");
  await check("check-uncheck ikki marta ketma-ket — oxirgi balans 0, coin qotib qolmaydi", async () => {
    for (let i = 0; i < 2; i++) {
      await call("PATCH", "/api/checks", { user: EMP, body: { projectSlug, type: "k", seqNumber: 4, checked: true, editorUserId: editorId } });
      await call("PATCH", "/api/checks", { user: EMP, body: { projectSlug, type: "k", seqNumber: 4, checked: false } });
    }
    assert.strictEqual(await balanceOf(EDITOR), 0);
  });

  console.log("── STORIES → NCOIN ────────────────────────────────────");
  await check("stories 'info' (standart) — faqat SMMga +0.2, video/montajga hech narsa", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: EMP,
      body: {
        projectSlug,
        type: "s",
        seqNumber: 1,
        checked: true,
        storyKind: "info",
        editorUserId: editorId,
        videographerUserId: videoId,
      },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(SMM), 0.2);
    assert.strictEqual(await balanceOf(EDITOR), 0);
    assert.strictEqual(await balanceOf(VIDEO), 0);
  });
  await check("stories#1 bekor qilinadi (tozalash)", async () => {
    await call("PATCH", "/api/checks", { user: EMP, body: { projectSlug, type: "s", seqNumber: 1, checked: false } });
    assert.strictEqual(await balanceOf(SMM), 0);
  });
  await check("stories 'atmospheric' — faqat video+montajga +0.1/+0.1, SMMga hech narsa", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: EMP,
      body: {
        projectSlug,
        type: "s",
        seqNumber: 2,
        checked: true,
        storyKind: "atmospheric",
        editorUserId: editorId,
        videographerUserId: videoId,
      },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EDITOR), 0.1);
    assert.strictEqual(await balanceOf(VIDEO), 0.1);
    assert.strictEqual(await balanceOf(SMM), 0);
  });
  await check("stories#2 bekor qilinadi (tozalash)", async () => {
    await call("PATCH", "/api/checks", { user: EMP, body: { projectSlug, type: "s", seqNumber: 2, checked: false } });
    assert.strictEqual(await balanceOf(EDITOR), 0);
    assert.strictEqual(await balanceOf(VIDEO), 0);
  });

  console.log("── VAZIFA → NCOIN (faqat Tekshiruvda→Bajarildi, admin roziligi bilan) ──");
  let taskId;
  await check("EMP'ga vazifa biriktiriladi", async () => {
    const r = await call("POST", "/api/tasks", {
      user: "shaxzodshokirov",
      body: { title: "Ncoin test vazifa 1", assigneeUsername: EMP, dueDate: today, status: "todo", notifyTelegram: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    taskId = r.json.task.id;
  });
  await check("todo→done to'g'ridan-to'g'ri (review'siz), awardNcoin:true bo'lsa ham — coin YO'Q", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "shaxzodshokirov",
      body: { status: "done", awardNcoin: true, notifyTelegram: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EMP), 0);
  });
  await check("holat review'ga qaytariladi", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, { user: "shaxzodshokirov", body: { status: "review", notifyTelegram: false } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("review→done, awardNcoin:false — coin YO'Q", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "shaxzodshokirov",
      body: { status: "done", awardNcoin: false, notifyTelegram: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EMP), 0);
  });
  await check("review→done, awardNcoin:true — +0.2", async () => {
    await call("PATCH", `/api/tasks/${taskId}`, { user: "shaxzodshokirov", body: { status: "review", notifyTelegram: false } });
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "shaxzodshokirov",
      body: { status: "done", awardNcoin: true, notifyTelegram: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EMP), 0.2);
  });
  await check("done'dan chiqarilsa — coin qaytariladi", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, { user: "shaxzodshokirov", body: { status: "in_progress", notifyTelegram: false } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await balanceOf(EMP), 0);
  });
  await check("faqat admin awardNcoin so'ray oladi (oddiy xodim 'done' o'rnata olmaydi — 403)", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: EMP,
      body: { status: "done", awardNcoin: true, notifyTelegram: false },
    });
    assert.strictEqual(r.status, 403);
  });

  console.log("── LOYIHA BONUSI ────────────────────────────────────");
  let bonusProjectSlug, bonusCycleId, bonusPeriodEnd;
  await check("bonus-loyiha yaratiladi, EMP+SMM biriktiriladi", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Ncoin Test Loyiha Bonus", anchorDate: today, postsTarget: 1, storiesTarget: 0 },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    bonusProjectSlug = r.json.project.id;
    for (const u of [EMP, SMM]) {
      await call("PUT", "/api/permissions", { user: "shaxzodshokirov", body: { [u]: [bonusProjectSlug] } });
    }
    const projR = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const proj = projR.json.projects.find((p) => p.id === bonusProjectSlug);
    bonusCycleId = proj.cycleId;
    bonusPeriodEnd = proj.periodEnd;
  });
  await check("muddatida (period_end'dan oldin) tugatilsa — har bir biriktirilgan xodimga +2", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: EMP,
      body: { projectSlug: bonusProjectSlug, type: "k", seqNumber: 1, checked: true, workDate: today },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const before = { emp: await balanceOf(EMP), smm: await balanceOf(SMM) };
    const closed = await closeCycle(db, bonusCycleId);
    assert.strictEqual(closed.is_debt, false, "davr qarzsiz yopilishi kerak");
    assert.strictEqual(await balanceOf(EMP), before.emp + 2);
    assert.strictEqual(await balanceOf(SMM), before.smm + 2);
  });

  let lateProjectSlug, lateCycleId;
  await check("kech tugatilgan loyihada — is_debt=false bo'lsa ham, bonus YO'Q", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Ncoin Test Loyiha Bonus Kech", anchorDate: today, postsTarget: 1, storiesTarget: 0 },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    lateProjectSlug = r.json.project.id;
    await call("PUT", "/api/permissions", { user: "shaxzodshokirov", body: { [EMP]: [lateProjectSlug] } });
    const projR = await call("GET", "/api/projects", { user: "shaxzodshokirov" });
    const proj = projR.json.projects.find((p) => p.id === lateProjectSlug);
    lateCycleId = proj.cycleId;
    // Ish sanasi ataylab davr muddatidan (period_end) KEYIN qilib beriladi.
    const lateDate = new Date(new Date(proj.periodEnd).getTime() + 20 * 86400000).toISOString().slice(0, 10);
    const ck = await call("PATCH", "/api/checks", {
      user: EMP,
      body: { projectSlug: lateProjectSlug, type: "k", seqNumber: 1, checked: true, workDate: lateDate },
    });
    assert.strictEqual(ck.status, 200, JSON.stringify(ck.json));
    const before = await balanceOf(EMP);
    const closed = await closeCycle(db, lateCycleId);
    assert.strictEqual(closed.is_debt, false);
    assert.strictEqual(await balanceOf(EMP), before, "ish sanasi muddatdan keyin bo'lgani uchun bonus berilmasligi kerak");
  });

  console.log("── PUT /api/permissions REGRESSIYASI (rol saqlanib qolishi) ──");
  await check("bitta loyihaga rol berilgach, boshqa loyihani PUT qilish — roli saqlanib qoladi", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Ncoin Test Loyiha Ikkinchi", anchorDate: today, postsTarget: 1, storiesTarget: 1 },
    });
    const secondSlug = r.json.project.id;
    // EDITOR'ga ikkinchi loyihaga ham ruxsat beramiz (ikkalasiga ham ega bo'ladi)
    await call("PUT", "/api/permissions", { user: "shaxzodshokirov", body: { [EDITOR]: [projectSlug, secondSlug] } });
    await call("PATCH", "/api/permissions/role", { user: "shaxzodshokirov", body: { username: EDITOR, projectSlug, role: "montajchi" } });

    // Endi FAQAT ikkinchi loyihani o'zgartiradigan PUT yuboramiz (birinchisi ro'yxatda bor, ikkinchisi olib tashlanadi)
    const p = await call("PUT", "/api/permissions", { user: "shaxzodshokirov", body: { [EDITOR]: [projectSlug] } });
    assert.strictEqual(p.status, 200, JSON.stringify(p.json));

    const rolesR = await call("GET", "/api/permissions/roles", { user: "shaxzodshokirov" });
    assert.strictEqual(rolesR.json.roles[EDITOR]?.[projectSlug], "montajchi", JSON.stringify(rolesR.json));
  });

  console.log("── NSHOP XARID ─────────────────────────────────────");
  let productId, hiddenProductId;
  await check("admin mahsulot qo'shadi (narx=0.5)", async () => {
    const r = await call("POST", "/api/ncoin/admin/products", {
      user: "shaxzodshokirov",
      body: { name: "Test Mahsulot A", price: 0.5, stock: 2, isVisible: true },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    productId = r.json.product.id;
  });
  await check("yashirin mahsulot ham qo'shiladi", async () => {
    const r = await call("POST", "/api/ncoin/admin/products", {
      user: "shaxzodshokirov",
      body: { name: "Test Mahsulot B (yashirin)", price: 0, stock: 5, isVisible: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    hiddenProductId = r.json.product.id;
  });
  await check("oddiy xodim admin endpointiga kira olmaydi (403)", async () => {
    const r = await call("POST", "/api/ncoin/admin/products", {
      user: EMP,
      body: { name: "Ruxsatsiz mahsulot", price: 1, stock: 1 },
    });
    assert.strictEqual(r.status, 403);
  });
  await check("yashirin mahsulot ro'yxatda ko'rinmaydi", async () => {
    const r = await call("GET", "/api/ncoin/products", { user: EMP });
    assert.ok(!r.json.products.some((p) => p.id === hiddenProductId));
  });
  await check("yashirin mahsulot sotib olinmaydi", async () => {
    const r = await call("POST", "/api/ncoin/purchase", { user: EMP, body: { productId: hiddenProductId } });
    assert.strictEqual(r.status, 404);
  });
  await check("yetarli balans bilan xarid muvaffaqiyatli", async () => {
    // Bonus tufayli EMP'da hozir balans bor (yuqoridagi loyiha bonusidan)
    const before = await balanceOf(EMP);
    const r = await call("POST", "/api/ncoin/purchase", { user: EMP, body: { productId } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.balance, before - 0.5);
    const prods = await call("GET", "/api/ncoin/admin/products", { user: "shaxzodshokirov" });
    const p = prods.json.products.find((x) => x.id === productId);
    assert.strictEqual(p.stock, 1);
  });
  await check("balans yetarli bo'lmaguncha xarid rad etiladi (2-marta, stock=1 lekin narx endi balansdan katta bo'lguncha sinovni tugatamiz)", async () => {
    // Ikkinchi xaridni ham amalga oshiramiz, keyin balans 0.5'dan kam bo'lguncha davom etmaymiz — shu bitta xaridning o'zi yetarli, faqat 400 holatini alohida tekshiramiz:
    // EMP balansini vaqtincha 0'ga tushirib ko'ramiz (to'g'ridan-to'g'ri bazadan emas, mavjud mexanizm orqali emas — shu sabab shunchaki juda qimmat mahsulot bilan tekshiramiz).
    const r = await call("POST", "/api/ncoin/admin/products", {
      user: "shaxzodshokirov",
      body: { name: "Test Mahsulot Qimmat", price: 999, stock: 1, isVisible: true },
    });
    const expensiveId = r.json.product.id;
    const buy = await call("POST", "/api/ncoin/purchase", { user: EMP, body: { productId: expensiveId } });
    assert.strictEqual(buy.status, 400);
  });
  await check("tarixda post/story/task/bonus/purchase sabablari bor", async () => {
    const r = await call("GET", "/api/ncoin/me", { user: EMP });
    const reasons = r.json.transactions.map((t) => t.reason);
    assert.ok(reasons.includes("project_bonus"), JSON.stringify(reasons));
    assert.ok(reasons.includes("task_completed"), JSON.stringify(reasons));
    assert.ok(reasons.includes("purchase"), JSON.stringify(reasons));
  });

  await cleanupTestData();
  server.close();
  console.log(`\n${passed} ta o'tdi, ${failed} ta xato.\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Test ishga tushmadi:", e);
  process.exit(1);
});
