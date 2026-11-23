// ═══════════════════════════════════════════════════════════════════════
// Bot stsenariylari — egasi, menejer, SMM, montajchi, dizayner,
// mobilograf, yangi xodim, ishdan ketgan xodim va MIJOZ nomidan bir ish
// kuni: shaxsiy menyu, guruhda /task (to'g'ri va xato yozilgan), izohlar,
// /vazifalar, 👍/🔥 bilan mijozga yuborish va qaytarib olish, ilovadagi
// amallardan keladigan xabarlar, kunlik cron.
//
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres \
//     npm run bot:sim
//
// Baza bo'sh (faqat migratsiya qilingan) yoki oldingi simulyatsiyadan
// qolgan bo'lishi mumkin — boshida tozalanadi. Bot matni yoki mantig'i
// o'zgarsa: simulyatsiyani o'zgarishdan oldin va keyin yurgizib,
// transkriptlarni solishtiring (`diff`).
// ═══════════════════════════════════════════════════════════════════════
const path = require("path");
const S = require("./telegram");
const { U, G, db, api, say, press, react, lastBot, step, started } = S;
const OUT = process.argv[2] || path.join(__dirname, "natija", "transkript");
require("fs").mkdirSync(path.dirname(OUT), { recursive: true });

async function seed() {
  // Faqat mavjud jadvallar: branch'ga qarab ba'zilari bo'lmasligi mumkin.
  const jadvallar = ["users", "projects", "tasks", "tags", "tg_groups", "tg_topics", "tg_messages", "tg_publications", "notification_log", "bot_eslatmalar"];
  const bor = await db.query(`select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`, [jadvallar]);
  await db.query(`truncate ${bor.rows.map((r) => r.table_name).join(", ")} restart identity cascade`);
  for (const u of Object.values(U)) {
    if (u.mijoz) continue;
    const r = await db.query(
      `insert into users (username, first_name, last_name, full_name, role, position, job_title, telegram_user_id, telegram_chat_id, is_active, access_status, phone)
       values ($1,$2,'Testov',$2,$3,$4,$5,$6,$7,$8,$9,'+998900000000') returning id`,
      [u.username, u.first_name, u.role, u.position, u.job_title,
       u.yangi ? null : u.tg,
       // Montajchi ilovani ochgan, lekin botga hech qachon /start yozmagan
       u.yangi ? null : u.tg,
       !u.blocked, u.blocked ? "blocked" : "active"],
    );
    u.id = r.rows[0].id;
    if (!u.yangi && u.key !== "montaj") started.add(u.tg);
  }
  for (const t of ["Dizayn", "Reels", "Stories", "Banner"]) await db.query(`insert into tags (name) values ($1)`, [t]);

  const mk = async (label, anchorDate, postsTarget, storiesTarget, who, hasPlan = true) => {
    const r = await api(U.egasi, "POST", "/api/projects", { label, anchorDate, postsTarget, storiesTarget, hasPlan, assigneeUsernames: who, notifyTelegram: false });
    return r.project || r;
  };
  const P = {};
  P.anhor = await mk("Anhor Park", "2026-11-01", 12, 30, ["aziz_smm", "bekzod_edit", "siroj_design", "jasur_video"]);
  P.east = await mk("East Line", "2026-11-05", 8, 20, ["aziz_smm", "bekzod_edit"]);
  P.ulugbek = await mk("Ulug'bek Clinic & Spa", "2026-10-25", 10, 10, ["dilnoza_pm", "siroj_design"]);
  P.brend = await mk("Brend dizayn <Nasaf>", null, null, null, ["siroj_design"], false);
  for (const k in P) { const r = await db.query(`select id, slug, label from projects where label = $1`, [P[k].label || { anhor: "Anhor Park", east: "East Line", ulugbek: "Ulug'bek Clinic & Spa", brend: "Brend dizayn <Nasaf>" }[k]]); P[k] = r.rows[0]; }

  // Ozgina bajarilgan ish: Anhor ortda, East oldinda
  for (let i = 1; i <= 2; i++) await api(U.smm, "PATCH", "/api/checks", { projectSlug: P.anhor.slug, type: "k", seqNumber: i, checked: true });
  for (let i = 1; i <= 6; i++) await api(U.smm, "PATCH", "/api/checks", { projectSlug: P.east.slug, type: "k", seqNumber: i, checked: true });

  // Ilovadan ochilgan vazifalar (bildirishnomalar ham ketadi)
  await api(U.menejer, "POST", "/api/tasks", { title: "Anhor: noyabr kontent-reja", dueDate: "2026-11-18", assigneeUsernames: ["aziz_smm"], projectSlug: P.anhor.slug });
  await api(U.menejer, "POST", "/api/tasks", { title: "East Line reels montaj", dueDate: "2026-11-19", assigneeUsernames: ["bekzod_edit"], projectSlug: P.east.slug, priority: "high" });
  await api(U.menejer, "POST", "/api/tasks", { title: "Klinika uchun banner 3x4 <yangi> & logo", description: "Rangi: ko'k <b>yorqin</b>", dueDate: "2026-11-22", assigneeUsernames: ["siroj_design"], projectSlug: P.ulugbek.slug });
  return P;
}

async function main() {
  const server = await S.start();
  step("0. Tayyorgarlik: xodimlar, loyihalar, ilovadan 3 ta vazifa");
  const P = await seed();

  // ── Guruhlar: bot qo'shildi ─────────────────────────────────────────
  step("1. Bot guruhlarga qo'shildi");
  for (const g of Object.values(G)) {
    await fetchMyChat(g);
  }
  // Admin Boshqaruvda sozladi (yangi guruh — sozlanmagan qoladi)
  await api(U.egasi, "PATCH", `/api/tg/groups/${G.team.id}`, { kind: "video" });
  await api(U.egasi, "PATCH", `/api/tg/groups/${G.montaj.id}`, { kind: "montaj" });
  await api(U.egasi, "PATCH", `/api/tg/groups/${G.dizayn.id}`, { kind: "dizayn", assigneeId: U.dizayn.id });
  await api(U.egasi, "PATCH", `/api/tg/groups/${G.mijoz.id}`, { kind: "mijoz", project: P.anhor.slug });

  // Mavzular paydo bo'ladi (kimdir yozganda)
  await say(U.montaj, G.montaj, "Anhor uchun ishlar shu yerda", { thread: 11, topicName: "Anhor Park" });
  await say(U.montaj, G.montaj, "East Line", { thread: 12, topicName: "East Line" });
  await say(U.dizayn, G.dizayn, "Anhor dizaynlari", { thread: 21, topicName: "Anhor Park" });
  await say(U.mijoz, G.mijoz, "Salom, kontentni shu yerga tashlang", { thread: 41, topicName: "Kontent" });
  await say(U.mijoz, G.mijoz, "Stories", { thread: 42, topicName: "Stories" });
  await api(U.egasi, "PATCH", `/api/tg/topics/${G.montaj.id}/11`, { project: P.anhor.slug });
  await api(U.egasi, "PATCH", `/api/tg/topics/${G.montaj.id}/12`, { project: P.east.slug });
  await api(U.egasi, "PATCH", `/api/tg/topics/${G.dizayn.id}/21`, { project: P.anhor.slug });
  await api(U.egasi, "PATCH", `/api/tg/topics/${G.mijoz.id}/41`, { purpose: "kontent" });
  await api(U.egasi, "PATCH", `/api/tg/topics/${G.mijoz.id}/42`, { purpose: "stories" });

  // ── Shaxsiy chat ────────────────────────────────────────────────────
  step("2. Egasi botni ochadi va menyuni aylanadi");
  await say(U.egasi, "dm", "/start");
  let menu = lastBot(U.egasi.tg);
  for (const d of ["v", "m", "x"]) { await press(U.egasi, U.egasi.tg, menu.id, d); }
  const xm = lastBot(U.egasi.tg);
  const first = xm.markup?.inline_keyboard?.[0]?.[0]?.callback_data;
  if (first && first.startsWith("x:")) await press(U.egasi, U.egasi.tg, xm.id, first);
  await press(U.egasi, U.egasi.tg, xm.id, "m");
  await press(U.egasi, U.egasi.tg, xm.id, "p");
  await press(U.egasi, U.egasi.tg, xm.id, "m");

  step("3. Oddiy xodimlar menyusi");
  await say(U.smm, "dm", "/start");
  menu = lastBot(U.smm.tg);
  await press(U.smm, U.smm.tg, menu.id, "v");
  await press(U.smm, U.smm.tg, menu.id, "p");
  await press(U.smm, U.smm.tg, menu.id, "x"); // yashirin tugmani soxtalashtirish
  await say(U.dizayn, "dm", "/start");
  await press(U.dizayn, U.dizayn.tg, lastBot(U.dizayn.tg).id, "v");
  await press(U.dizayn, U.dizayn.tg, lastBot(U.dizayn.tg).id, "p");
  await say(U.dizayn, "dm", "Assalomu alaykum, bugun kechroq kelaman");
  await say(U.dizayn, "dm", "/help");

  step("4. Begona va yangi odamlar shaxsiy chatda");
  await say(U.mijoz, "dm", "/start");
  await say(U.bloklangan, "dm", "/start");
  await say(U.yangi, "dm", "/start"); // ilovani hech ochmagan, username bo'yicha topiladi

  // ── /task ───────────────────────────────────────────────────────────
  step("5. Menejer dizayn guruhida /task (mavzu Anhor, standart mas'ul Siroj)");
  const t1 = await say(U.menejer, G.dizayn, "Yangi yil banneri\nUch o'lchamda: 1080x1080, 1080x1920, 1920x1080\nRangi ko'k\n\n/task 25.11 !yuqori #Banner", { thread: 21, topicName: "Anhor Park" });

  step("6. Har belgisi alohida qatorda, montaj guruhida");
  await say(U.menejer, G.montaj, "/task @bekzod_edit\n27.11\n14:30\n#Reels\nAnhor — yangi yil reels\nmusiqa: trenddagi", { thread: 11 });

  step("7. Bo'sh /task, noma'lum @, xato loyiha nomi, o'tgan sana, xato sana");
  await say(U.menejer, G.team, "/task");
  await say(U.menejer, G.team, "/task @valijon Logo tayyorlash");
  await say(U.menejer, G.team, "/task Post matni +anhr 26.11 @aziz_smm");
  await say(U.menejer, G.team, "/task Hisobot topshirish 01.11 @aziz_smm");
  await say(U.menejer, G.team, "/task Tadbir videosi 31.02 @jasur_video");
  await say(U.menejer, G.team, "/task Klinika posti +ulug 28.11");
  await say(U.menejer, G.team, "/task Video +xyz");

  step("8. Mijoz guruhida: mijoz so'raydi, SMM javob qilib /task");
  const mq = await say(U.mijoz, G.mijoz, "Iltimos, ertaga aksiyamiz haqida stories qilib bering, chegirma 20%", { thread: 41 });
  await say(U.smm, G.mijoz, "/task 21.11", { thread: 41, replyTo: mq });
  await say(U.mijoz, G.mijoz, "/task menga ham vazifa", { thread: 41 });
  await say(U.mijoz, G.mijoz, "@nasafdigital_bot salom, bu nima?", { thread: 41 });
  await say(U.smm, G.mijoz, "/task Banner +xyz", { thread: 41 });
  await say(U.mijoz, G.mijoz, "/vazifalar", { thread: 41 });
  const qabul = lastBot(G.mijoz.id, (m) => /Qabul|Vazifa ochildi/.test(m.text));
  if (qabul) await say(U.mijoz, G.mijoz, "Rahmat! Kechgacha bo'ladimi?", { thread: 41, replyTo: qabul.id });

  step("9. Sozlanmagan yangi guruhda /task (mas'ul yo'q)");
  await say(U.menejer, G.yangi, "/task Klinika uchun 3 ta post g'oyasi");

  step("10. Vazifa tasdig'iga javob — izoh");
  const tasdiq = lastBot(G.dizayn.id, (m) => /Vazifa ochildi/.test(m.text));
  if (tasdiq) {
    await say(U.dizayn, G.dizayn, "Qabul qildim, ertaga birinchi variantni tashlayman", { thread: 21, replyTo: tasdiq.id });
    await say(U.montaj, G.dizayn, "Men ham yordam beraman", { thread: 21, replyTo: tasdiq.id });
    await say(U.menejer, G.dizayn, "Logotip oq rangda bo'lsin", { thread: 21, replyTo: tasdiq.id });
  }

  step("11. /vazifalar guruhda");
  await say(U.dizayn, G.dizayn, "/vazifalar", { thread: 21 });
  await say(U.montaj, G.montaj, "/vazifalar", { thread: 11 }); // botga /start qilmagan
  await say(U.smm, G.team, "/vazifalar @bekzod_edit");
  await say(U.egasi, G.team, "/vazifalar hamma");

  step("11b. Montajchi botni ochadi va qayta so'raydi; yangi xodimga vazifa");
  await say(U.montaj, "dm", "/start menu");
  await say(U.montaj, G.montaj, "/vazifalar", { thread: 11 });
  await say(U.menejer, G.team, "/task Nodir uchun sinov vazifa @nodir_new 30.11");

  step("12. Botni guruhda belgilash va karta tugmalari");
  await say(U.smm, G.team, "@nasafdigital_bot yordam");
  const card = lastBot(G.team.id);
  await press(U.smm, G.team.id, card.id, "p");
  await press(U.montaj, G.team.id, card.id, "v");
  await press(U.video, G.team.id, card.id, "v");

  // ── 👍 nashr ─────────────────────────────────────────────────────────
  step("13. Montajchi video tashlaydi, SMM 👍 bosadi → mijoz guruhiga");
  const vid = await say(U.montaj, G.montaj, "Anhor reels v2 tayyor", { thread: 11, kind: "video" });
  await react(U.montaj, G.montaj, vid, "👍"); // o'zi bosdi — huquqi yo'q
  await react(U.smm, G.montaj, vid, "👍");
  await react(U.smm, G.montaj, vid, "👍"); // ikkinchi marta
  const ok = lastBot(G.montaj.id, (m) => /yuborildi/.test(m.text));
  step("14. 🔥 stories, keyin qaytarib olish (tugma va reaksiya)");
  const vid2 = await say(U.montaj, G.montaj, "Stories 1", { thread: 11, kind: "video" });
  await react(U.smm, G.montaj, vid2, "🔥");
  if (ok) await press(U.smm, G.montaj.id, ok.id, ok.markup.inline_keyboard[0][0].callback_data);
  await react(U.smm, G.montaj, vid2, "🔥", true);
  step("15. 👍 — mijoz guruhi yo'q loyiha, matnli xabar, dizayn guruhi");
  const vid3 = await say(U.montaj, G.montaj, "East reels", { thread: 12, kind: "video" });
  await react(U.smm, G.montaj, vid3, "👍");
  const txt = await say(U.montaj, G.montaj, "Musiqani o'zgartirdim", { thread: 11 });
  await react(U.smm, G.montaj, txt, "👍");
  const dz = await say(U.dizayn, G.dizayn, "Banner v1", { thread: 21, kind: "photo" });
  await react(U.menejer, G.dizayn, dz, "👍");

  // ── Ilovadagi amallar → bot xabarlari ───────────────────────────────
  step("16. Ilovada: dizayner vazifani tekshiruvga, menejer qabul qiladi");
  const tr = await db.query(`select id, title from tasks where title like 'Klinika uchun banner%'`);
  const tid = tr.rows[0].id;
  await api(U.dizayn, "PATCH", `/api/tasks/${tid}`, { status: "in_progress" });
  await api(U.dizayn, "PATCH", `/api/tasks/${tid}`, { status: "review" });
  await api(U.menejer, "PATCH", `/api/tasks/${tid}`, { status: "done", awardNcoin: true });
  await api(U.menejer, "POST", `/api/tasks/${tid}/comments`, { body: "Zo'r chiqdi, rahmat!", text: "Zo'r chiqdi, rahmat!" });

  step("16b. Egasi kechqurun menyuni qayta ochadi");
  await say(U.egasi, "dm", "/start");
  const mm = lastBot(U.egasi.tg);
  await press(U.egasi, U.egasi.tg, mm.id, "x");
  await press(U.egasi, U.egasi.tg, mm.id, "x:0");

  step("17. Kunlik cron (eslatmalar, aqlli bot)");
  // cron ichki endpointlarni APP_URL orqali chaqiradi — lokal serverga yo'naltiramiz
  process.env.APP_URL = server._base;
  await api(U.egasi, "GET", "/api/cron-daily");

  await S.finish(server, OUT);
  console.log("✔ Tayyor:", OUT + ".txt");
}

async function fetchMyChat(g) {
  await S.webhook({ update_id: Date.now(), my_chat_member: { chat: { id: g.id, type: g.type, title: g.title, is_forum: g.is_forum },
    from: { id: U.egasi.tg }, date: 1, old_chat_member: { status: "left", user: S.BOT }, new_chat_member: { status: "administrator", user: S.BOT } } });
}

main().catch(async (e) => { console.error(e); process.exit(1); });
