#!/usr/bin/env node
// Ncoin (gamifikatsiya) + NShop uchun integratsion smoke-test — mavjud
// test fayllari (smoke.js, profile-and-tasks.js) bilan bir xil uslub.

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

  await check("test xodim yaratiladi", async () => {
    const r = await call("POST", "/api/users", { user: "shaxzodshokirov", body: { username: "test_ncoin_emp" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  let projectSlug;
  await check("test loyiha yaratiladi va ruxsat beriladi", async () => {
    const r = await call("POST", "/api/projects", {
      user: "shaxzodshokirov",
      body: { label: "Ncoin Test Loyiha", anchorDate: today, postsTarget: 5, storiesTarget: 5 },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    projectSlug = r.json.project.id;
    const p = await call("PUT", "/api/permissions", {
      user: "shaxzodshokirov",
      body: { test_ncoin_emp: [projectSlug] },
    });
    assert.strictEqual(p.status, 200, JSON.stringify(p.json));
  });

  console.log("── CHECK → NCOIN ──────────────────────────────────");
  await check("yangi balans 0", async () => {
    const r = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.balance, 0);
  });
  await check("post#1 belgilanganda 0.5 Ncoin beriladi", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: "test_ncoin_emp",
      body: { projectSlug, type: "k", seqNumber: 1, checked: true },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const me = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    assert.strictEqual(me.json.balance, 0.5);
  });
  await check("tafsilotni qayta belgilash (hali checked) QAYTA coin bermaydi", async () => {
    await call("PATCH", "/api/checks", {
      user: "test_ncoin_emp",
      body: { projectSlug, type: "k", seqNumber: 1, checked: true, workDate: today },
    });
    const me = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    assert.strictEqual(me.json.balance, 0.5);
  });
  await check("belgi bekor qilinganda coin qaytariladi", async () => {
    const r = await call("PATCH", "/api/checks", {
      user: "test_ncoin_emp",
      body: { projectSlug, type: "k", seqNumber: 1, checked: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const me = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    assert.strictEqual(me.json.balance, 0);
  });
  await check("qayta belgilansa yana 0.5 beriladi (farm qilib bo'lmaydi, lekin yangi belgilash haqiqiy)", async () => {
    await call("PATCH", "/api/checks", {
      user: "test_ncoin_emp",
      body: { projectSlug, type: "k", seqNumber: 1, checked: true },
    });
    const me = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    assert.strictEqual(me.json.balance, 0.5);
  });

  console.log("── VAZIFA → NCOIN ─────────────────────────────────");
  let taskId;
  await check("test_ncoin_emp'ga vazifa biriktiriladi", async () => {
    const r = await call("POST", "/api/tasks", {
      user: "shaxzodshokirov",
      body: {
        title: "Ncoin test vazifa 1",
        assigneeUsername: "test_ncoin_emp",
        dueDate: today,
        status: "todo",
        notifyTelegram: false,
      },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    taskId = r.json.task.id;
  });
  await check("vazifa 'bajarildi'ga o'tganda mas'ulga 0.5 Ncoin beriladi (faqat admin belgilay oladi)", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "shaxzodshokirov",
      body: { status: "done", notifyTelegram: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const me = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    assert.strictEqual(me.json.balance, 1);
  });
  await check("admin holatni orqaga qaytarsa coin qaytariladi", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "shaxzodshokirov",
      body: { status: "in_progress", notifyTelegram: false },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const me = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    assert.strictEqual(me.json.balance, 0.5);
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
      user: "test_ncoin_emp",
      body: { name: "Ruxsatsiz mahsulot", price: 1, stock: 1 },
    });
    assert.strictEqual(r.status, 403);
  });
  await check("yashirin mahsulot ro'yxatda ko'rinmaydi", async () => {
    const r = await call("GET", "/api/ncoin/products", { user: "test_ncoin_emp" });
    assert.ok(!r.json.products.some((p) => p.id === hiddenProductId));
  });
  await check("yashirin mahsulot sotib olinmaydi", async () => {
    const r = await call("POST", "/api/ncoin/purchase", {
      user: "test_ncoin_emp",
      body: { productId: hiddenProductId },
    });
    assert.strictEqual(r.status, 404);
  });
  await check("yetarli balans bilan xarid muvaffaqiyatli", async () => {
    const r = await call("POST", "/api/ncoin/purchase", {
      user: "test_ncoin_emp",
      body: { productId },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.balance, 0);
    const prods = await call("GET", "/api/ncoin/admin/products", { user: "shaxzodshokirov" });
    const p = prods.json.products.find((x) => x.id === productId);
    assert.strictEqual(p.stock, 1);
  });
  await check("balans yetarli bo'lmasa 400", async () => {
    const r = await call("POST", "/api/ncoin/purchase", {
      user: "test_ncoin_emp",
      body: { productId },
    });
    assert.strictEqual(r.status, 400);
  });
  await check("tarixda check + task + purchase yozuvlari bor", async () => {
    const r = await call("GET", "/api/ncoin/me", { user: "test_ncoin_emp" });
    const reasons = r.json.transactions.map((t) => t.reason);
    assert.ok(reasons.includes("check_completed"), JSON.stringify(reasons));
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
