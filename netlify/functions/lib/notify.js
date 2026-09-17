// ═══════════════════════════════════════════════════════════════════════
// Telegram bildirishnomalari
// ═══════════════════════════════════════════════════════════════════════
// sendMsg — eski kod bilan bir xil mantiq, endi qo'shimcha ravishda
// notification_log jadvaliga yozadi (audit/debug uchun foydali, eskisida
// yo'q edi). Yuborish DB yozuvi bilan BIRGA kutiladi (await) — eski
// koddagi "serverless cold-cut" muammosidan saqlanish falsafasi davom
// ettiriladi.
// ═══════════════════════════════════════════════════════════════════════

// Mini App'ning haqiqiy manzili — bildirishnomalardagi "Ilovani ochish"
// tugmasi shu asosda quriladi. TO'G'RI YECHIM — Vercel'da APP_URL
// environment o'zgaruvchisini o'zini sozlash (Netlify'dan Vercel'ga
// ko'chgach, bu hech qachon sozlanmagan edi — natijada HAR BIR
// bildirishnomadagi tugma pastdagi eski, endi muzlab qolgan Netlify
// manziliga olib borar edi, real xodimlar o'sha yerdagi eski koddan
// "hammaga umumiy xabar" muammosiga qayta-qayta duch kelishardi,
// 2026-09-11). Shu yerdagi qiymat faqat oxirgi chora — ENV o'rnatilgan
// bo'lsa, u ustun keladi.
const APP_URL = (process.env.APP_URL || "https://nasaf-digital-tracker.vercel.app").replace(/\/$/, "");

// Bitta "Ilovani ochish" tugmasi bo'lgan inline keyboard quradi. `path`
// berilsa (masalan "?openTask=<id>"), bosilganda ilova to'g'ridan-to'g'ri
// o'sha ekranga ochiladi (frontend buni window.location.search orqali
// o'qib, tegishli joyga navigatsiya qiladi).
function appOpenButton(path = "") {
  const url = path ? `${APP_URL}/${path}` : APP_URL;
  return { inline_keyboard: [[{ text: "📱 Ilovani ochish", web_app: { url } }]] };
}

async function sendMsg(db, chatId, text, opts = {}) {
  const botToken = process.env.BOT_TOKEN || "";
  if (!botToken || !chatId) return { ok: false, reason: "no_token_or_chatid" };
  let result;
  try {
    const body = { chat_id: chatId, text, parse_mode: "HTML" };
    if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`TG xato (${chatId}) [${r.status}]:`, JSON.stringify(b));
      result = { ok: false, chatId, status: r.status, body: b };
    } else {
      result = { ok: true, chatId };
    }
  } catch (e) {
    console.error(`TG fetch xato (${chatId}):`, e.message);
    result = { ok: false, chatId, error: e.message };
  }
  if (db) {
    await db
      .query(
        `insert into notification_log (chat_id, message, status, error) values ($1,$2,$3,$4)`,
        [
          String(chatId),
          text,
          result.ok ? "sent" : "error",
          result.ok ? null : result.error || JSON.stringify(result.body || {}),
        ],
      )
      .catch((e) => console.error("notification_log yozib bo'lmadi:", e.message));
  }
  return result;
}

// Bitta loyihaga tegishli xabar oluvchilarni aniqlaydi:
//  1) ENV orqali sozlangan admin chat idlar (har doim, hammasi haqida)
//  2) shu loyihaga ruxsati bor yoki admin/super_admin bo'lgan userlar
//     (actor bundan mustasno, chat_id ENV ro'yxatida bo'lsa qayta yubormaymiz)
async function resolveRecipients(db, actorUsername, projectId) {
  const envIds = (process.env.ADMIN_CHAT_IDS || process.env.ALL_CHAT_IDS || "")
    .replace(/['"]/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));

  const recipients = [];
  const seen = new Set();
  envIds.forEach((id) => {
    recipients.push({ chatId: id });
    seen.add(id);
  });

  const r = await db.query(
    `select u.username, u.telegram_chat_id
     from users u
     where u.telegram_chat_id is not null
       and u.username <> $1
       and (
         u.role in ('super_admin','admin')
         or exists (select 1 from permissions p where p.user_id = u.id and p.project_id = $2)
       )`,
    [actorUsername, projectId],
  );
  r.rows.forEach((u) => {
    const cid = String(u.telegram_chat_id);
    if (seen.has(cid)) return;
    seen.add(cid);
    recipients.push({ chatId: cid, username: u.username });
  });
  return recipients;
}

// Bitta checkbox o'zgarishi haqida xabar quradi va yuboradi
async function notifyCheckChange(db, { actorUserId, actorUsername, project, cycle, type, seqNumber, checked, doneK, doneS }) {
  if (!process.env.BOT_TOKEN) return;
  const kind = type === "k" ? "Post" : "Stories";
  const actionLine = checked
    ? `✅ ${kind} #${seqNumber} bajarildi`
    : `↩️ ${kind} #${seqNumber} bekor qilindi`;
  const remK = cycle.posts_target - doneK;
  const remS = cycle.stories_target - doneS;
  const remParts = [
    remK > 0 ? `${remK} post` : "barcha postlar ✓",
    remS > 0 ? `${remS} stories` : "barcha stories ✓",
  ];

  const text =
    `👤 <b>@${actorUsername}</b>\n` +
    `📁 <b>${project.label}</b>\n` +
    `${actionLine}\n` +
    `📊 Qoldi: ${remParts.join(", ")}`;

  const recipients = await resolveRecipients(db, actorUsername, project.id);
  const jobs = recipients.map((r) => sendMsg(db, r.chatId, text, { replyMarkup: appOpenButton() }));

  // O'zi bajargan ishini o'ziga ham tasdiqlab qo'yamiz — resolveRecipients
  // ataylab actor'ni chetlab o'tadi (u boshqalarga ketadigan oqim), shu
  // sabab bu alohida, to'g'ridan-to'g'ri actor'ning o'z chat_id'siga
  // yuboriladi (2026-09-14, foydalanuvchi so'rovi: "o'zi ham shu ishni
  // qilganini bilish uchun").
  if (actorUserId) {
    const ur = await db.query(`select telegram_chat_id from users where id = $1`, [actorUserId]);
    const chatId = ur.rows[0]?.telegram_chat_id;
    if (chatId) jobs.push(sendMsg(db, chatId, text, { replyMarkup: appOpenButton() }));
  }

  await Promise.allSettled(jobs);
}

// Ncoin balansi o'zgarganda (topilgan/sarflangan) — shaxsiy, o'ziga
// xos bildirishnoma. Reversal (xatoni tuzatish) uchun ATAYLAB
// chaqirilmaydi — chaqiruvchi tomon buni ta'minlaydi, chunki bu
// haqiqiy ishlab topish/sarflash hodisasi emas.
async function notifyNcoinChange(db, userId, amountSigned, text) {
  if (!process.env.BOT_TOKEN || !userId) return;
  const ur = await db.query(`select telegram_chat_id from users where id = $1`, [userId]);
  const chatId = ur.rows[0]?.telegram_chat_id;
  if (!chatId) return;
  const amt = Number(amountSigned);
  const sign = amt > 0 ? "+" : "";
  const fmt = Number.isInteger(amt) ? String(amt) : amt.toFixed(1);
  await sendMsg(db, chatId, `🪙 <b>${sign}${fmt} Ncoin</b>\n${text}`, { replyMarkup: appOpenButton() }).catch(
    (e) => console.error("Ncoin bildirishnomasi xatosi:", e.message),
  );
}

// Vazifa biriktirilganda/qayta biriktirilganda bildirishnoma yuboradi —
// kim biriktirganini va (bo'lsa) vazifa izohini ham ko'rsatadi.
// Natija obyektini qaytaradi ({attempted, ok, reason}) — chaqiruvchi
// tomon (api.js) buni javobga qo'shib, admin panelida "xabar bordimi
// yo'qmi"ni ko'rsatishi uchun (jim-ketgan xatoni yashirmaslik uchun).
async function notifyTaskAssigned(db, { assigneeUserId, task, actorUsername }) {
  if (!process.env.BOT_TOKEN) return { attempted: false, ok: false, reason: "no_bot_token" };
  if (!assigneeUserId) return { attempted: false, ok: false, reason: "no_assignee" };
  const ur = await db.query(`select telegram_chat_id from users where id = $1`, [assigneeUserId]);
  const chatId = ur.rows[0]?.telegram_chat_id;
  if (!chatId) return { attempted: false, ok: false, reason: "no_chat_id" };
  const byLine = actorUsername ? ` @${actorUsername} tomonidan` : "";
  const dueLine = task.dueDate ? `\n📅 Muddat: ${task.dueDate}` : "";
  const projLine = task.projectLabel ? `\n📁 ${task.projectLabel}` : "";
  const descLine = task.description ? `\n\n📝 ${task.description}` : "";
  const text = `🆕 <b>Sizga${byLine} yangi vazifa biriktirildi</b>\n${task.title}${projLine}${dueLine}${descLine}`;
  const result = await sendMsg(db, chatId, text, { replyMarkup: appOpenButton(`?openTask=${task.id}`) });
  return { attempted: true, ok: result.ok, reason: result.ok ? null : result.error || "send_failed" };
}

// Vazifa hodisasi (status o'zgarishi, qayta biriktirilishi, yangi
// vazifa) haqida — endi HAMMAGA emas, faqat tegishli odamlarga:
//   - mas'ulga (`assigneeUserId`) — `personalText` bilan ("Sizning
//     vazifangiz..."), chunki bu haqiqatan HAM uning ishi;
//   - vazifani yaratganga (`createdByUserId`) va barcha admin/super
//     admin'larga — `overviewText` bilan (nazorat uchun umumiy shakl).
// Actor va `excludeUserIds` (masalan, allaqachon notifyTaskAssigned
// orqali shaxsiy xabar olgan yangi mas'ul) har doim chetlab o'tiladi.
// Ilgari bu joyda har bir vazifa hodisasi FAOL bo'lgan HAR BIR xodimga
// yuborilardi — shu sabab xodimlar o'zlariga tegishli xabarni boshqalar
// haqidagi oqim ichida topa olmay qiynalishgan (2026-09-10 fikr-mulohaza).
async function notifyTaskEvent(
  db,
  { actorUserId, assigneeUserId, createdByUserId, personalText, overviewText, selfText, taskId, excludeUserIds = [] },
) {
  if (!process.env.BOT_TOKEN) return { attempted: false, ok: false, reason: "no_bot_token" };
  const excluded = new Set([actorUserId, ...excludeUserIds].filter(Boolean).map(String));
  const replyMarkup = appOpenButton(taskId ? `?openTask=${taskId}` : "");
  const sentTo = new Set();
  const jobs = [];

  if (assigneeUserId && personalText && !excluded.has(String(assigneeUserId))) {
    const ur = await db.query(`select telegram_chat_id from users where id = $1`, [assigneeUserId]);
    const chatId = ur.rows[0]?.telegram_chat_id;
    if (chatId) {
      sentTo.add(String(assigneeUserId));
      jobs.push(sendMsg(db, chatId, personalText, { replyMarkup }));
    }
  }

  if (overviewText) {
    const r = await db.query(
      `select id, telegram_chat_id from users
       where is_active = true and telegram_chat_id is not null
         and (role in ('super_admin','admin') or id = $1)`,
      [createdByUserId || null],
    );
    r.rows.forEach((u) => {
      const id = String(u.id);
      if (excluded.has(id) || sentTo.has(id)) return;
      sentTo.add(id);
      jobs.push(sendMsg(db, u.telegram_chat_id, overviewText, { replyMarkup }));
    });
  }

  // Actor'ning o'ziga — shu ishni qilgani (yaratgani/bajargani) haqida
  // tasdiq. Yuqoridagi `excluded` ataylab actor'ni boshqalarga ketadigan
  // oqimdan chetlab o'tadi — bu esa shundan mustasno, alohida shaxsiy
  // tasdiqlash xabari (chaqiruvchi tomon `selfText` orqali beradi, faqat
  // matn to'g'ri bo'ladigan holatlarda — masalan "Vazifangiz..." matni
  // faqat actor haqiqatan ham mas'ul bo'lgandagina beriladi).
  if (actorUserId && selfText) {
    const ur = await db.query(`select telegram_chat_id from users where id = $1`, [actorUserId]);
    const chatId = ur.rows[0]?.telegram_chat_id;
    if (chatId) jobs.push(sendMsg(db, chatId, selfText, { replyMarkup }));
  }

  await Promise.allSettled(jobs);
  return { attempted: true, ok: true, recipients: sentTo.size };
}

// Loyihaga ruxsat berilganda bildirishnoma yuboradi (kim berganini
// ko'rsatib) — vazifalarnikiga o'xshash, lekin loyiha uchun.
async function notifyProjectAssigned(db, { assigneeUserId, actorUsername, projectLabel }) {
  if (!process.env.BOT_TOKEN || !assigneeUserId) return;
  const ur = await db.query(`select telegram_chat_id from users where id = $1`, [assigneeUserId]);
  const chatId = ur.rows[0]?.telegram_chat_id;
  if (!chatId) return;
  const byLine = actorUsername ? ` @${actorUsername} tomonidan` : "";
  const text = `📁 <b>Sizga${byLine} loyihaga ruxsat berildi</b>\n${projectLabel}`;
  await sendMsg(db, chatId, text, { replyMarkup: appOpenButton() });
}

function progressEmoji(p) {
  if (p >= 100) return "🏆";
  if (p >= 75) return "🔥";
  if (p >= 50) return "💪";
  if (p >= 25) return "⚡";
  return "⚠️";
}

const pct = (d, t) => (t === 0 ? 0 : Math.round((d / t) * 100));

// Loyiha progress foizi — Post ("kontent") va Stories teng og'irlikda
// hisoblanmaydi: Post umumiy progressning 70%ini, Stories 30%ini
// tashkil qiladi (frontenddagi projPct() bilan bir xil mantiq — shu
// pacing-eslatmasidagi % ilovada ko'rinadigan % bilan mos kelishi
// uchun). Loyihada faqat bittasi bo'lsa, o'sha yagona tur 100% sifatida
// hisoblanadi.
function projectPct(doneK, k, doneS, s) {
  const hasK = k > 0,
    hasS = s > 0;
  if (!hasK && !hasS) return 0;
  const kFrac = hasK ? doneK / k : 0;
  const sFrac = hasS ? doneS / s : 0;
  if (hasK && hasS) return Math.round((kFrac * 0.7 + sFrac * 0.3) * 100);
  return Math.round((hasK ? kFrac : sFrac) * 100);
}

// Xodimga shaxsiy pacing-eslatma matnini quradi (bir nechta loyiha bo'yicha)
function buildPacingMessage(stats) {
  let text = `📊 <b>Kontent reja bo'yicha holat</b>\n─────────────────\n\n`;
  stats.forEach((p) => {
    const emoji = progressEmoji(p.overallP);
    text += `${emoji} <b>${p.label}</b> — ${p.overallP}% (davr oxiri: ${p.periodEnd})\n`;
    if (p.remK > 0)
      text += `   📝 Post: qoldi <b>${p.remK}</b> ta${p.weekK > 0 ? ` → shu hafta <b>${p.weekK} ta</b>` : ""}\n`;
    if (p.remS > 0)
      text += `   🎬 Stories: qoldi <b>${p.remS}</b> ta${p.weekS > 0 ? ` → shu hafta <b>${p.weekS} ta</b>` : ""}\n`;
    text += `\n`;
  });
  text += `💡 <i>Shu haftadagi maqsadni bajarsangiz, davr oxirigacha rejani o'z vaqtida yopasiz.</i>`;
  return text;
}

module.exports = {
  APP_URL,
  appOpenButton,
  sendMsg,
  resolveRecipients,
  notifyNcoinChange,
  notifyCheckChange,
  notifyTaskAssigned,
  notifyTaskEvent,
  notifyProjectAssigned,
  progressEmoji,
  pct,
  projectPct,
  buildPacingMessage,
};
