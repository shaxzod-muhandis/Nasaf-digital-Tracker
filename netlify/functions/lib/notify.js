// ═══════════════════════════════════════════════════════════════════════
// Telegram bildirishnomalari
// ═══════════════════════════════════════════════════════════════════════
// sendMsg — eski kod bilan bir xil mantiq, endi qo'shimcha ravishda
// notification_log jadvaliga yozadi (audit/debug uchun foydali, eskisida
// yo'q edi). Yuborish DB yozuvi bilan BIRGA kutiladi (await) — eski
// koddagi "serverless cold-cut" muammosidan saqlanish falsafasi davom
// ettiriladi.
// ═══════════════════════════════════════════════════════════════════════

async function sendMsg(db, chatId, text) {
  const botToken = process.env.BOT_TOKEN || "";
  if (!botToken || !chatId) return { ok: false, reason: "no_token_or_chatid" };
  let result;
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
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
async function notifyCheckChange(db, { actorUsername, project, cycle, type, seqNumber, checked, doneK, doneS }) {
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
  await Promise.allSettled(recipients.map((r) => sendMsg(db, r.chatId, text)));
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
  const result = await sendMsg(db, chatId, text);
  return { attempted: true, ok: result.ok, reason: result.ok ? null : result.error || "send_failed" };
}

// Butun jamoaga vazifa hodisasi haqida qisqa xabar yuboradi (Vazifalar
// bo'limidagi barcha o'zgarishlar hammaga ko'rinishi kerak degan talab
// bo'yicha) — faol (is_active) va Telegram chat ID'si saqlangan HAR BIR
// userga, ko'rsatilgan id/username'lardan tashqari (masalan, allaqachon
// o'zining alohida batafsil xabarini olgan yangi mas'ul, yoki hodisani
// o'zi qilgan actor).
async function notifyTeamTaskEvent(db, { excludeUserIds = [], excludeUsernames = [], text }) {
  if (!process.env.BOT_TOKEN) return { attempted: false, ok: false, reason: "no_bot_token" };
  const r = await db.query(
    `select id, username, telegram_chat_id from users
     where is_active = true and telegram_chat_id is not null
       and not (id = any($1::uuid[]))
       and not (lower(username) = any($2::text[]))`,
    [excludeUserIds, excludeUsernames.map((u) => String(u).toLowerCase())],
  );
  await Promise.allSettled(r.rows.map((u) => sendMsg(db, u.telegram_chat_id, text)));
  return { attempted: true, ok: true, recipients: r.rows.length };
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
  await sendMsg(db, chatId, text);
}

function progressEmoji(p) {
  if (p >= 100) return "🏆";
  if (p >= 75) return "🔥";
  if (p >= 50) return "💪";
  if (p >= 25) return "⚡";
  return "⚠️";
}

const pct = (d, t) => (t === 0 ? 0 : Math.round((d / t) * 100));

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
  sendMsg,
  resolveRecipients,
  notifyCheckChange,
  notifyTaskAssigned,
  notifyTeamTaskEvent,
  notifyProjectAssigned,
  progressEmoji,
  pct,
  buildPacingMessage,
};
