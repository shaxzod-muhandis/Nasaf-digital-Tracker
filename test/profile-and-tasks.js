#!/usr/bin/env node
// Profil (/api/me), Tasks va bildirishnomalar jurnali uchun integratsion
// smoke-test — test/smoke.js bilan bir xil uslub va yordamchi naqshlar.
// Tizim faqat Telegram Mini App (X-Telegram-Init-Data) orqali ishlaydi —
// alohida web-login/sessiya mavjud emas.

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
  await db.query(`delete from tasks where title like 'Test vazifa%'`);
  await db.query(`delete from users where username in ('test_profileuser', 'test_profileuser2')`);
  await db.query(`delete from tags where name like 'TestTag%'`);
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

  console.log("── /api/me (PROFIL) ─────────────────────────────");
  await check("admin yordamida test_profileuser yaratiladi", async () => {
    const r = await call("POST", "/api/users", { user: "shaxzodshokirov", body: { username: "test_profileuser" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("yangi user uchun profileIncomplete=true", async () => {
    const r = await call("GET", "/api/me", { user: "test_profileuser" });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.profileIncomplete, true);
  });
  await check("PATCH /api/me profilni to'ldiradi", async () => {
    const r = await call("PATCH", "/api/me", {
      user: "test_profileuser",
      body: { firstName: "tEST", lastName: "USER", phone: "998900000000", jobTitle: "QA" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("endi profileIncomplete=false", async () => {
    const r = await call("GET", "/api/me", { user: "test_profileuser" });
    assert.strictEqual(r.json.profileIncomplete, false);
    assert.strictEqual(r.json.user.jobTitle, "QA");
  });
  await check("ism/familiya qanday kiritilmasin 'Har Bir So'z' formatiga keltiriladi", async () => {
    const r = await call("GET", "/api/me", { user: "test_profileuser" });
    assert.strictEqual(r.json.user.firstName, "Test", JSON.stringify(r.json.user));
    assert.strictEqual(r.json.user.lastName, "User", JSON.stringify(r.json.user));
  });
  await check("telefon raqam +998 99 999 99 99 formatiga keltiriladi", async () => {
    const r = await call("GET", "/api/me", { user: "test_profileuser" });
    assert.strictEqual(r.json.user.phone, "+998 90 000 00 00", JSON.stringify(r.json.user));
  });
  await check("admin PATCH /api/users/:username orqali ham profil maydonlarini tahrirlay oladi", async () => {
    const r = await call("PATCH", "/api/users/test_profileuser", {
      user: "shaxzodshokirov",
      body: { jobTitle: "Senior QA" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.user.job_title, "Senior QA");
  });

  console.log("── TUG'ILGAN KUN TABRIGI ──────────────────────────");
  const pad2 = (n) => String(n).padStart(2, "0");
  const monthDayOf = (d) => `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayMD = monthDayOf(new Date());
  const otherMD = monthDayOf(new Date(Date.now() + 10 * 24 * 3600 * 1000));
  await check("bugungi kunga mos birthDate — showBirthdayGreeting=true", async () => {
    const r = await call("PATCH", "/api/me", { user: "test_profileuser", body: { birthDate: `1995-${todayMD}` } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const me = await call("GET", "/api/me", { user: "test_profileuser" });
    assert.strictEqual(me.json.showBirthdayGreeting, true, JSON.stringify(me.json));
  });
  await check("/api/me/birthday-ack chaqirilgach showBirthdayGreeting=false bo'ladi", async () => {
    const ack = await call("POST", "/api/me/birthday-ack", { user: "test_profileuser" });
    assert.strictEqual(ack.status, 200, JSON.stringify(ack.json));
    const me = await call("GET", "/api/me", { user: "test_profileuser" });
    assert.strictEqual(me.json.showBirthdayGreeting, false, JSON.stringify(me.json));
  });
  await check("boshqa kunga to'g'ri keladigan birthDate — showBirthdayGreeting=false", async () => {
    const r = await call("PATCH", "/api/me", { user: "test_profileuser", body: { birthDate: `1995-${otherMD}` } });
    assert.strictEqual(r.status, 200);
    const me = await call("GET", "/api/me", { user: "test_profileuser" });
    assert.strictEqual(me.json.showBirthdayGreeting, false, JSON.stringify(me.json));
  });

  console.log("── TASKS ─────────────────────────────────────────");
  await check("2-test user yaratiladi (topshiriq berilmaydigan)", async () => {
    const r = await call("POST", "/api/users", { user: "shaxzodshokirov", body: { username: "test_profileuser2" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("dueDate'siz vazifa yaratilmaydi (400)", async () => {
    const r = await call("POST", "/api/tasks", {
      user: "shaxzodshokirov",
      body: { title: "Muddatsiz vazifa", assigneeUsername: "test_profileuser" },
    });
    assert.strictEqual(r.status, 400);
  });
  let taskId;
  await check("admin vazifa yaratadi va biriktiradi", async () => {
    const r = await call("POST", "/api/tasks", {
      user: "shaxzodshokirov",
      body: { title: "Test vazifa 1", assigneeUsername: "test_profileuser", dueDate: "2099-01-01" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "todo");
    assert.strictEqual(r.json.task.assigneeUsername, "test_profileuser");
    taskId = r.json.task.id;
  });
  await check("biriktirilgan user o'z vazifasini ko'radi", async () => {
    const r = await call("GET", "/api/tasks", { user: "test_profileuser" });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.tasks.some((t) => t.id === taskId));
  });
  await check("boshqa (biriktirilmagan) user HAM bu vazifani ko'radi (jamoaviy shaffoflik)", async () => {
    const r = await call("GET", "/api/tasks", { user: "test_profileuser2" });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.tasks.some((t) => t.id === taskId));
  });
  await check("admin barcha vazifalarni ko'radi", async () => {
    const r = await call("GET", "/api/tasks", { user: "shaxzodshokirov" });
    assert.ok(r.json.tasks.some((t) => t.id === taskId));
  });
  await check("biriktirilgan user statusni o'zgartira oladi", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "test_profileuser",
      body: { status: "in_progress" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "in_progress");
  });
  await check("boshqa user statusni o'zgartira olmaydi (403)", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, { user: "test_profileuser2", body: { status: "done" } });
    assert.strictEqual(r.status, 403);
  });
  await check("oddiy user title'ni o'zgartira olmaydi (400)", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, { user: "test_profileuser", body: { title: "Boshqa nom" } });
    assert.strictEqual(r.status, 400);
  });
  await check("oddiy user vazifani o'chira olmaydi (403)", async () => {
    const r = await call("DELETE", `/api/tasks/${taskId}`, { user: "test_profileuser" });
    assert.strictEqual(r.status, 403);
  });
  await check("'bajarilmadi' sababsiz saqlanmaydi (400)", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "test_profileuser",
      body: { status: "failed" },
    });
    assert.strictEqual(r.status, 400);
  });
  await check("biriktirilgan user sabab bilan 'bajarilmadi' deb belgilaydi", async () => {
    const r = await call("PATCH", `/api/tasks/${taskId}`, {
      user: "test_profileuser",
      body: { status: "failed", reason: "Mijoz materiallarni kech yubordi" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "failed");
    assert.strictEqual(r.json.task.reason, "Mijoz materiallarni kech yubordi");
  });
  await check("admin GET orqali sababni to'liq ko'radi", async () => {
    const r = await call("GET", "/api/tasks", { user: "shaxzodshokirov" });
    const t = r.json.tasks.find((x) => x.id === taskId);
    assert.ok(t, "vazifa topilmadi");
    assert.strictEqual(t.status, "failed");
    assert.strictEqual(t.reason, "Mijoz materiallarni kech yubordi");
  });
  await check("admin vazifani o'chiradi", async () => {
    const r = await call("DELETE", `/api/tasks/${taskId}`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  console.log("── VAZIFA: yaratish hammaga ochiq, 'Bajarildi' faqat admin ──");
  let permTaskId;
  await check("oddiy xodim (admin bo'lmagan) vazifa yarata oladi", async () => {
    const r = await call("POST", "/api/tasks", {
      user: "test_profileuser",
      body: { title: "Oddiy xodim yaratgan vazifa", assigneeUsername: "test_profileuser2", dueDate: "2099-01-01" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    permTaskId = r.json.task.id;
  });
  await check("biriktirilgan oddiy xodim statusni 'done'ga o'tkaza olmaydi (403)", async () => {
    const r = await call("PATCH", `/api/tasks/${permTaskId}`, {
      user: "test_profileuser2",
      body: { status: "done" },
    });
    assert.strictEqual(r.status, 403);
  });
  await check("biriktirilgan oddiy xodim 'in_progress'ga o'tkaza oladi", async () => {
    const r = await call("PATCH", `/api/tasks/${permTaskId}`, {
      user: "test_profileuser2",
      body: { status: "in_progress" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("admin 'done'ga o'tkaza oladi", async () => {
    const r = await call("PATCH", `/api/tasks/${permTaskId}`, {
      user: "shaxzodshokirov",
      body: { status: "done" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "done");
  });
  await check("GET /api/users/directory — oddiy xodim ham ko'radi, shaxsiy maydonlarsiz", async () => {
    const r = await call("GET", "/api/users/directory", { user: "test_profileuser" });
    assert.strictEqual(r.status, 200);
    const u = r.json.users.find((x) => x.username === "test_profileuser2");
    assert.ok(u, "xodim topilmadi");
    assert.strictEqual(u.phone, undefined);
    assert.strictEqual(u.birth_date, undefined);
  });
  await check("tozalash: test vazifasi o'chiriladi", async () => {
    const r = await call("DELETE", `/api/tasks/${permTaskId}`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200);
  });

  console.log("── BACKLOG / PRIORITY ────────────────────────────");
  let backlogTaskId;
  await check("backlog vazifa muddatsiz yaratiladi (200)", async () => {
    const r = await call("POST", "/api/tasks", {
      user: "shaxzodshokirov",
      body: {
        title: "Test vazifa Backlog",
        status: "backlog",
        assigneeUsername: "test_profileuser",
        priority: "high",
      },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "backlog");
    assert.strictEqual(r.json.task.dueDate, null);
    assert.strictEqual(r.json.task.priority, "high");
    backlogTaskId = r.json.task.id;
  });
  await check("backlog'ni muddatsiz 'todo'ga o'tkazib bo'lmaydi (400)", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "shaxzodshokirov",
      body: { status: "todo" },
    });
    assert.strictEqual(r.status, 400);
  });
  await check("o'ziga biriktirilgan xodim ham backlog'ni muddat berib navbatga qo'ya oladi", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "test_profileuser",
      body: { status: "todo", dueDate: "2099-02-01" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "todo");
    assert.strictEqual(r.json.task.dueDate, "2099-02-01");
  });
  await check("oddiy user allaqachon muddati bor vazifaning muddatini o'zgartira olmaydi", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "test_profileuser",
      body: { status: "in_progress", dueDate: "2099-03-01" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.dueDate, "2099-02-01");
  });
  await check("'review' bosqichiga o'tkazish mumkin", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "test_profileuser",
      body: { status: "review" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "review");
  });
  await check("admin 'review'dan 'done'ga o'tkazadi", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "shaxzodshokirov",
      body: { status: "done" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.status, "done");
  });
  await check("noto'g'ri priority rad etiladi (400)", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "shaxzodshokirov",
      body: { priority: "juda-shoshilinch" },
    });
    assert.strictEqual(r.status, 400);
  });
  await check("admin priority'ni o'zgartiradi, GET orqali ko'rinadi", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "shaxzodshokirov",
      body: { priority: "urgent" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.task.priority, "urgent");
    const g = await call("GET", "/api/tasks", { user: "shaxzodshokirov" });
    const t = g.json.tasks.find((x) => x.id === backlogTaskId);
    assert.strictEqual(t.priority, "urgent");
  });
  console.log("── TAGLAR ────────────────────────────────────────");
  await check("standart taglar mavjud (GET /api/tags)", async () => {
    const r = await call("GET", "/api/tags", { user: "test_profileuser" });
    assert.strictEqual(r.status, 200);
    const names = r.json.tags.map((t) => t.name);
    assert.ok(names.includes("Post"), JSON.stringify(names));
    assert.ok(names.includes("Reels"), JSON.stringify(names));
  });
  await check("oddiy user tag yarata olmaydi (403)", async () => {
    const r = await call("POST", "/api/tags", { user: "test_profileuser", body: { name: "TestTagX" } });
    assert.strictEqual(r.status, 403);
  });
  let newTagId;
  await check("admin yangi tag yaratadi", async () => {
    const r = await call("POST", "/api/tags", { user: "shaxzodshokirov", body: { name: "TestTag1" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.tag.name, "TestTag1");
    newTagId = r.json.tag.id;
  });
  await check("bir xil nomli tag qayta yaratilmaydi (409)", async () => {
    const r = await call("POST", "/api/tags", { user: "shaxzodshokirov", body: { name: "TestTag1" } });
    assert.strictEqual(r.status, 409);
  });
  await check("tagIds vazifaga PATCH orqali biriktiriladi, GET'da ko'rinadi", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}`, {
      user: "shaxzodshokirov",
      body: { tagIds: [newTagId] },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const g = await call("GET", "/api/tasks", { user: "shaxzodshokirov" });
    const t = g.json.tasks.find((x) => x.id === backlogTaskId);
    assert.ok(t.tags.some((tag) => tag.id === newTagId), JSON.stringify(t.tags));
  });

  console.log("── VAZIFA ACTIVITY / IZOHLAR ──────────────────────");
  await check("status/priority o'zgarishlari activity'ga avtomatik yoziladi", async () => {
    const r = await call("GET", `/api/tasks/${backlogTaskId}/activity`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const kinds = r.json.activity.map((a) => a.kind);
    assert.ok(kinds.includes("created"), JSON.stringify(kinds));
    assert.ok(kinds.includes("status_change"), JSON.stringify(kinds));
    assert.ok(kinds.includes("priority_change"), JSON.stringify(kinds));
  });
  await check("biriktirilgan xodim izoh qoldira oladi", async () => {
    const r = await call("POST", `/api/tasks/${backlogTaskId}/comments`, {
      user: "test_profileuser",
      body: { text: "Test izoh" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const g = await call("GET", `/api/tasks/${backlogTaskId}/activity`, { user: "shaxzodshokirov" });
    const comment = g.json.activity.find((a) => a.kind === "comment" && a.body === "Test izoh");
    assert.ok(comment, JSON.stringify(g.json.activity));
    assert.strictEqual(comment.actorUsername, "test_profileuser");
  });
  await check("bo'sh izoh rad etiladi (400)", async () => {
    const r = await call("POST", `/api/tasks/${backlogTaskId}/comments`, {
      user: "test_profileuser",
      body: { text: "   " },
    });
    assert.strictEqual(r.status, 400);
  });
  await check("aloqasi yo'q user HAM activity'ni ko'ra oladi (jamoaviy shaffoflik)", async () => {
    const r = await call("GET", `/api/tasks/${backlogTaskId}/activity`, { user: "test_profileuser2" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });
  await check("aloqasi yo'q user izoh qoldira olmaydi (403)", async () => {
    const r = await call("POST", `/api/tasks/${backlogTaskId}/comments`, {
      user: "test_profileuser2",
      body: { text: "Ruxsatsiz izoh" },
    });
    assert.strictEqual(r.status, 403);
  });

  console.log("── VAZIFA CHECKLIST ──────────────────────────────");
  let checklistItemId;
  await check("biriktirilgan xodim checklist bandi qo'sha oladi", async () => {
    const r = await call("POST", `/api/tasks/${backlogTaskId}/checklist`, {
      user: "test_profileuser",
      body: { text: "Sinf xonalari" },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    checklistItemId = r.json.item.id;
    assert.strictEqual(r.json.item.done, false);
  });
  await check("bo'sh matnli band rad etiladi (400)", async () => {
    const r = await call("POST", `/api/tasks/${backlogTaskId}/checklist`, {
      user: "test_profileuser",
      body: { text: "   " },
    });
    assert.strictEqual(r.status, 400);
  });
  await check("aloqasi yo'q user band qo'sha olmaydi (403)", async () => {
    const r = await call("POST", `/api/tasks/${backlogTaskId}/checklist`, {
      user: "test_profileuser2",
      body: { text: "Ruxsatsiz band" },
    });
    assert.strictEqual(r.status, 403);
  });
  await check("bandni belgilash (done=true)", async () => {
    const r = await call("PATCH", `/api/tasks/${backlogTaskId}/checklist/${checklistItemId}`, {
      user: "test_profileuser",
      body: { done: true },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.item.done, true);
  });
  await check("GET checklist ro'yxatni qaytaradi", async () => {
    const r = await call("GET", `/api/tasks/${backlogTaskId}/checklist`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.items.length, 1);
    assert.strictEqual(r.json.items[0].done, true);
  });
  await check("bandni o'chirish", async () => {
    const r = await call("DELETE", `/api/tasks/${backlogTaskId}/checklist/${checklistItemId}`, { user: "test_profileuser" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const g = await call("GET", `/api/tasks/${backlogTaskId}/checklist`, { user: "shaxzodshokirov" });
    assert.strictEqual(g.json.items.length, 0);
  });

  await check("backlog vazifani admin o'chiradi (tozalash)", async () => {
    const r = await call("DELETE", `/api/tasks/${backlogTaskId}`, { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  console.log("── NOTIFICATIONS LOG ─────────────────────────────");
  await check("admin bildirishnomalar jurnalini ko'radi", async () => {
    const r = await call("GET", "/api/notifications", { user: "shaxzodshokirov" });
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.notifications));
  });
  await check("oddiy user jurnalni ko'ra olmaydi (403)", async () => {
    const r = await call("GET", "/api/notifications", { user: "test_profileuser" });
    assert.strictEqual(r.status, 403);
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
