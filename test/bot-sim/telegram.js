// ═══════════════════════════════════════════════════════════════════════
// BOT SIMULYATORI — soxta Telegram + lokal test baza
//
// Bot kodini HAQIQIY Telegram'siz, haqiqiy xodimlarga xabar yubormasdan
// sinash uchun (2026-11-20). Ilova `app.listen(0)` bilan ko'tariladi,
// `global.fetch` ushlanadi: api.telegram.org ga ketadigan har bir
// so'rov shu yerdagi soxta Telegram'ga tushadi, boshqa tashqi manzillar
// esa umuman to'siladi.
//
// Soxta Telegram haqiqiysi kabi RAD ETADI — shu bilan xatolar topiladi:
//   • HTML buzuq bo'lsa (vazifa nomida `<` kabi) — 400
//   • matn 4096 belgidan uzun — 400
//   • botga /start bosmagan odamga shaxsiy xabar — 403
//   • callback_data 64 baytdan uzun, guruhda web_app tugma
//
// Natija: `test/bot-sim/natija/transkript.txt` (har chat, har tugma
// bosish, har tahrir ketma-ket) va `.html` (Telegram ko'rinishida).
//
// Ishga tushirish: `npm run bot:sim` — qarang stsenariylar.js boshidagi izoh.
// ═══════════════════════════════════════════════════════════════════════
const path = require("path");
const REPO = path.join(__dirname, "..", "..");
require(REPO + "/scripts/_env").loadEnv(); // .env.local dagi TEST_DATABASE_URL uchun
const DB_URL = process.env.TEST_DATABASE_URL || "";
// Simulyator jadvallarni TOZALAYDI (truncate). Shuning uchun faqat shu
// kompyuterdagi bazada ishlaydi — umumiy test bazasida ham emas.
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(DB_URL)) {
  console.error("❌ Bot simulyatori faqat LOKAL bazada ishlaydi (u jadvallarni tozalaydi).");
  console.error("   TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/postgres' kabi bering.");
  process.exit(1);
}
process.env.DATABASE_URL = DB_URL;
process.env.DATABASE_SSL = "false";
process.env.BOT_TOKEN = "123456:SIMULYATOR";
process.env.TG_WEBHOOK_SECRET = "sim-secret";
process.env.CRON_SECRET = "sim-cron";
process.env.APP_URL = "https://nasaf-digital-tracker.vercel.app";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ADMIN_CHAT_IDS;

const crypto = require("crypto");
const fs = require("fs");

// ── Soxta Telegram ───────────────────────────────────────────────────
const BOT = { id: 999, username: "nasafdigital_bot", first_name: "Nasaf Digital" };
const chats = new Map(); // chatId -> {title, type, msgs: Map(id -> msg), order: []}
const started = new Set(); // shaxsiy chatni ochgan (botga /start yozgan) tg id lar
const problems = []; // Telegram rad etadigan narsalar
let nextMsgId = 5000;
let currentStep = "";

function chat(id, meta = {}) {
  id = Number(id);
  if (!chats.has(id)) chats.set(id, { id, ...meta, msgs: new Map(), order: [], events: [], tl: [] });
  const c = chats.get(id);
  Object.assign(c, meta);
  return c;
}

const ALLOWED = new Set(["b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "a", "code", "pre", "tg-spoiler", "span", "blockquote", "tg-emoji"]);
let warn = [];
function checkHtml(text) {
  warn = [];
  const errs = [];
  const stack = [];
  const re = /<\/?([a-zA-Z-]+)[^>]*>|&(?!(amp|lt|gt|quot|#\d+);)|<(?![a-zA-Z/])/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].startsWith("&")) { warn.push("eskeyp qilinmagan '&'"); continue; }
    if (m[0] === "<") { errs.push("eskeyp qilinmagan '<'"); continue; }
    const tag = m[1].toLowerCase();
    if (!ALLOWED.has(tag)) { errs.push(`ruxsat etilmagan teg <${tag}>`); continue; }
    if (m[0].startsWith("</")) {
      if (stack.pop() !== tag) errs.push(`teg yopilishi xato </${tag}>`);
    } else stack.push(tag);
  }
  if (stack.length) errs.push("yopilmagan teg: " + stack.join(","));
  return errs;
}
function plain(text) {
  return String(text || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function problem(method, body, msg) {
  problems.push({ step: currentStep, method, chat: body.chat_id, msg, text: (body.text || "").slice(0, 160) });
}
function validateMarkup(method, body) {
  const kb = body.reply_markup && body.reply_markup.inline_keyboard;
  if (!kb) return;
  for (const row of kb) for (const b of row) {
    if (b.callback_data && Buffer.byteLength(b.callback_data) > 64) problem(method, body, `callback_data 64 baytdan uzun: ${b.callback_data}`);
    if (b.web_app && Number(body.chat_id) < 0) problem(method, body, "web_app tugmasi guruhda ishlamaydi (Telegram rad etadi)");
    if (!b.callback_data && !b.url && !b.web_app) problem(method, body, "tugmada amal yo'q");
    if (Buffer.byteLength(b.text || "") > 64 * 4) problem(method, body, "tugma matni juda uzun");
  }
}

function tgOk(result) { return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "content-type": "application/json" } }); }
function tgErr(code, description) { return new Response(JSON.stringify({ ok: false, error_code: code, description }), { status: code, headers: { "content-type": "application/json" } }); }

function storeBotMsg(body, extra = {}) {
  const c = chat(body.chat_id);
  const id = nextMsgId++;
  const msg = { id, from: "bot", text: body.text, markup: body.reply_markup, markupFirst: body.reply_markup || null, thread: body.message_thread_id || null, replyTo: body.reply_parameters?.message_id || null, step: currentStep, ...extra };
  c.msgs.set(id, msg);
  c.order.push(id);
  c.tl.push({ t: "msg", m: msg, snap: msg.text, step: currentStep });
  return msg;
}

function fakeTelegram(method, body) {
  const chatId = body.chat_id;
  if (method === "getMe") return tgOk(BOT);
  if (method === "answerCallbackQuery") {
    if (body.text) lastCallbackToast.push(body.text);
    if (body.url) lastCallbackToast.push("↗ Telegram ochdi: " + body.url);
    return tgOk(true);
  }
  if (method === "sendMessage" || method === "editMessageText") {
    const text = body.text || "";
    if (!text.trim()) { problem(method, body, "bo'sh matn"); return tgErr(400, "Bad Request: message text is empty"); }
    if (plain(text).length > 4096) { problem(method, body, `matn ${plain(text).length} belgi (>4096)`); return tgErr(400, "Bad Request: message is too long"); }
    if (body.parse_mode === "HTML") {
      const e = checkHtml(text);
      if (e.length) { problem(method, body, "HTML: " + e.join("; ")); return tgErr(400, "Bad Request: can't parse entities"); }
      if (warn.length) problem(method, body, "(ogohlantirish) HTML: " + [...new Set(warn)].join("; "));
    }
    validateMarkup(method, body);
    if (Number(chatId) > 0 && !started.has(Number(chatId))) {
      problem(method, body, "xodim botni hali /start qilmagan — Telegram 403 qaytaradi (xabar yetmaydi)");
      return tgErr(403, "Forbidden: bot can't initiate conversation with a user");
    }
    if (method === "editMessageText") {
      const c = chat(chatId);
      const old = c.msgs.get(body.message_id);
      if (!old) return tgErr(400, "Bad Request: message to edit not found");
      if (old.text === text && JSON.stringify(old.markup || null) === JSON.stringify(body.reply_markup || null)) {
        return tgErr(400, "Bad Request: message is not modified");
      }
      c.tl.push({ t: "edit", m: old, snap: text, markup: body.reply_markup, step: currentStep });
      old.history = [...(old.history || []), old.text];
      old.text = text; old.markup = body.reply_markup; old.edited = true; old.step = currentStep;
      return tgOk({ message_id: old.id });
    }
    const m = storeBotMsg(body);
    return tgOk({ message_id: m.id, chat: { id: chatId }, date: Math.floor(Date.now() / 1000), text: plain(text) });
  }
  if (method === "copyMessage") {
    const src = chat(body.from_chat_id).msgs.get(body.message_id);
    const m = storeBotMsg({ chat_id: chatId, text: src ? `[nusxa] ${src.text}` : "[nusxa]", message_thread_id: body.message_thread_id });
    m.copy = true;
    return tgOk({ message_id: m.id });
  }
  if (method === "deleteMessage") {
    const c = chat(chatId);
    const m = c.msgs.get(body.message_id);
    if (m) { m.deleted = true; c.tl.push({ t: "ev", s: `🗑 bot #${m.id} ni o'chirdi`, step: currentStep }); }
    return tgOk(true);
  }
  if (method === "setMessageReaction" || method === "sendChatAction") return tgOk(true);
  problem(method, body, `noma'lum metod ${method}`);
  return tgOk(true);
}
let lastCallbackToast = [];

const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const m = /^https:\/\/api\.telegram\.org\/bot[^/]*\/(\w+)/.exec(u);
  if (m) {
    let body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch {}
    return fakeTelegram(m[1], body);
  }
  // Tashqi dunyoga HECH NARSA chiqmaydi — faqat lokal server.
  if (!/^http:\/\/127\.0\.0\.1:/.test(u)) throw new Error("simulyator tashqi so'rovni to'sdi: " + u.slice(0, 60));
  return realFetch(url, opts);
};

// ── Ilova ──────────────────────────────────────────────────────────
const db = require(REPO + "/netlify/functions/lib/db");
const app = require(REPO + "/netlify/functions/api.js");
let BASE;

function initData(user) {
  const params = new URLSearchParams();
  params.set("user", JSON.stringify({ id: user.tg, username: user.username, first_name: user.first_name }));
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
async function api(user, method, p, body) {
  const r = await realFetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData(user), "Authorization": "Bearer " + process.env.CRON_SECRET, "X-Cron-Secret": process.env.CRON_SECRET },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) console.log(`   ⚠ API ${method} ${p} -> ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// ── Odamlar ─────────────────────────────────────────────────────────
const U = {
  egasi:   { tg: 1001, username: "shaxzod_boss", first_name: "Shaxzod", role: "super_admin", position: "smm", job_title: "Direktor" },
  menejer: { tg: 1002, username: "dilnoza_pm", first_name: "Dilnoza", role: "admin", position: "smm", job_title: "Loyiha menejeri" },
  smm:     { tg: 1003, username: "aziz_smm", first_name: "Aziz", role: "employee", position: "smm", job_title: "SMM mutaxassis" },
  montaj:  { tg: 1004, username: "bekzod_edit", first_name: "Bekzod", role: "employee", position: "montajchi", job_title: "Montajchi" },
  dizayn:  { tg: 1005, username: "siroj_design", first_name: "Siroj", role: "employee", position: "dizayner", job_title: "Grafik dizayner" },
  video:   { tg: 1006, username: "jasur_video", first_name: "Jasur", role: "employee", position: "mobilograf", job_title: "Mobilograf" },
  yangi:   { tg: 1007, username: "nodir_new", first_name: "Nodir", role: "employee", position: "smm", job_title: "SMM (yangi)", yangi: true },
  bloklangan: { tg: 1008, username: "old_staff", first_name: "Eski", role: "employee", position: "smm", job_title: "Ketgan xodim", blocked: true },
  mijoz:   { tg: 2001, username: "anhor_marketing", first_name: "Anhor marketolog", mijoz: true },
};
const G = {
  team:   { id: -100111, title: "Nasaf Digital | Team", type: "supergroup", is_forum: false },
  montaj: { id: -100222, title: "Montaj | Nasaf Digital", type: "supergroup", is_forum: true },
  dizayn: { id: -100333, title: "Dizayn | Nasaf Digital", type: "supergroup", is_forum: true },
  mijoz:  { id: -100444, title: "Anhor Park × Nasaf", type: "supergroup", is_forum: true },
  yangi:  { id: -100555, title: "Ulugbek Clinic × Nasaf", type: "supergroup", is_forum: false },
};
for (const k in U) U[k].key = k;
for (const k in G) chat(G[k].id, { title: G[k].title, type: "group" });
for (const k in U) chat(U[k].tg, { title: "🤖 " + U[k].first_name + " ↔ bot (shaxsiy)", type: "private" });

let msgDate = Math.floor(Date.now() / 1000);
function userMsg(user, chatObj, text, extra = {}) {
  const c = chat(chatObj.id);
  const id = nextMsgId++;
  const msg = { id, from: user.key, name: user.first_name, text, thread: extra.thread || null, replyTo: extra.replyTo || null, kind: extra.kind || "text", step: currentStep };
  c.msgs.set(id, msg); c.order.push(id);
  c.tl.push({ t: "msg", m: msg, snap: text, step: currentStep });
  const tgMsg = {
    message_id: id, date: msgDate++, chat: { id: chatObj.id, type: chatObj.type, title: chatObj.title, is_forum: chatObj.is_forum },
    from: { id: user.tg, username: user.username, first_name: user.first_name, is_bot: false },
  };
  if (extra.kind === "video") { tgMsg.video = { file_id: "v" }; if (text) tgMsg.caption = text; }
  else if (extra.kind === "photo") { tgMsg.photo = [{ file_id: "p" }]; if (text) tgMsg.caption = text; }
  else tgMsg.text = text;
  if (extra.thread) { tgMsg.message_thread_id = extra.thread; tgMsg.is_topic_message = true; }
  if (extra.replyTo) {
    const r = c.msgs.get(extra.replyTo);
    tgMsg.reply_to_message = { message_id: extra.replyTo, date: msgDate, chat: tgMsg.chat, text: r ? plain(r.text) : "",
      from: r && r.from === "bot" ? { ...BOT, is_bot: true } : r ? { id: U[r.from].tg, username: U[r.from].username, first_name: U[r.from].first_name } : undefined };
  } else if (extra.thread) {
    tgMsg.reply_to_message = { message_id: extra.thread, forum_topic_created: { name: extra.topicName || "Mavzu" } };
  }
  return { msg, tgMsg };
}
async function webhook(update) {
  const r = await realFetch(BASE + "/api/tg/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "sim-secret" }, body: JSON.stringify(update) });
  if (r.status !== 200) console.log("   webhook status", r.status);
}
function pchat(user) { return { id: user.tg, type: "private", title: user.first_name }; }
async function say(user, where, text, extra = {}) {
  const chatObj = where === "dm" ? pchat(user) : where;
  if (where === "dm") { if (/^\/start/.test(text)) started.add(user.tg); }
  const { msg, tgMsg } = userMsg(user, chatObj, text, extra);
  await webhook({ update_id: msg.id, message: tgMsg });
  return msg.id;
}
async function press(user, chatId, messageId, data) {
  const c = chat(chatId);
  const m = c.msgs.get(messageId);
  c.tl.push({ t: "ev", s: `👆 ${user.first_name} «${btnText(m, data)}» tugmasini bosdi (#${messageId})`, step: currentStep });
  lastCallbackToast = [];
  await webhook({ update_id: nextMsgId++, callback_query: { id: "cq" + nextMsgId, from: { id: user.tg, username: user.username, first_name: user.first_name },
    data, message: { message_id: messageId, chat: { id: chatId, type: chatId > 0 ? "private" : "supergroup" }, text: m ? plain(m.text) : "", message_thread_id: m?.thread || undefined } } });
  if (lastCallbackToast.length) c.tl.push({ t: "ev", s: "💬 qalqib chiquvchi: " + lastCallbackToast.join(" | "), step: currentStep });
}
async function react(user, chatObj, messageId, emoji, remove = false) {
  const c = chat(chatObj.id);
  c.tl.push({ t: "ev", s: `${user.first_name} #${messageId} ga ${remove ? "reaksiyani olib tashladi" : "reaksiya qo'ydi"} ${emoji}`, step: currentStep });
  await webhook({ update_id: nextMsgId++, message_reaction: { chat: { id: chatObj.id, type: "supergroup", title: chatObj.title }, message_id: messageId,
    user: { id: user.tg, username: user.username, first_name: user.first_name }, date: msgDate++,
    old_reaction: remove ? [{ type: "emoji", emoji }] : [], new_reaction: remove ? [] : [{ type: "emoji", emoji }] } });
}
function lastBot(chatId, pred = () => true) {
  const c = chat(chatId);
  for (let i = c.order.length - 1; i >= 0; i--) { const m = c.msgs.get(c.order[i]); if (m.from === "bot" && pred(m)) return m; }
  return null;
}
function btnText(m, data) {
  for (const r of m?.markup?.inline_keyboard || []) for (const b of r) if (b.callback_data === data) return b.text;
  return "soxta: " + data;
}
function step(name) { currentStep = name; console.log("▶ " + name); for (const c of chats.values()) c.events.push({ kind: "step", name }); }

module.exports = { webhook, U, G, db, api, say, press, react, lastBot, step, chat, chats, problems, started, plain, BOT, start, finish };

async function start() {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  server._base = BASE;
  process.env.APP_URL = process.env.APP_URL; // tashqi URL qoladi
  return server;
}
async function finish(server, outFile) {
  // Matnli transkript (Claude o'qishi uchun) + HTML (odam ko'rishi uchun)
  const lines = [];
  const html = [];
  const NAMES = Object.fromEntries(Object.values(U).map((u) => [u.key, `${u.first_name} (${u.role || "mijoz"})`]));
  for (const c of chats.values()) {
    if (!c.tl.length) continue;
    lines.push(`\n════════ ${c.title || c.id} [${c.id}] ════════`);
    html.push(`<section class="chat"><h2>${esc(c.title || String(c.id))}</h2>`);
    let lastStep = null;
    for (const it of c.tl) {
      if (it.step !== lastStep) { lines.push(`  ── ${it.step}`); html.push(`<div class="step">${esc(it.step)}</div>`); lastStep = it.step; }
      if (it.t === "ev") { lines.push("    " + it.s); html.push(`<div class="ev">${esc(it.s)}</div>`); continue; }
      const m = it.m;
      const isEdit = it.t === "edit";
      const who = m.from === "bot" ? "🤖 BOT" : NAMES[m.from] || m.from;
      const meta = [isEdit ? `#${m.id} TAHRIRLANDI` : "", m.thread ? `mavzu ${m.thread}` : "", m.replyTo && !isEdit ? `javob→#${m.replyTo}` : "", m.kind && m.kind !== "text" ? m.kind : "", m.copy ? "nusxa" : ""].filter(Boolean).join(", ");
      const markup = isEdit ? it.markup : (m.markupFirst !== undefined ? m.markupFirst : m.markup);
      lines.push(`    ${isEdit ? "✏️" : "#" + m.id} ${who}${meta ? " (" + meta + ")" : ""}:`);
      lines.push(plain(it.snap).split("\n").map((l) => "      | " + l).join("\n"));
      const kb = markup && markup.inline_keyboard;
      if (kb) lines.push("      " + kb.map((r) => r.map((b) => `[${b.text}${b.callback_data ? " →" + b.callback_data : b.url ? " ↗url" : b.web_app ? " ↗app" : ""}]`).join(" ")).join(" / "));
      html.push(`<div class="msg ${m.from === "bot" ? "bot" : "user"}${isEdit ? " edit" : ""}"><div class="who">${esc(who)} <span>${isEdit ? "✏️ tahrir" : "#" + m.id}${meta ? " · " + esc(meta) : ""}</span></div><div class="txt">${m.from === "bot" ? it.snap : esc(it.snap)}</div>${kb ? `<div class="kb">${kb.map((r) => `<div>${r.map((b) => `<span>${esc(b.text)}</span>`).join("")}</div>`).join("")}</div>` : ""}</div>`);
    }
    html.push(`</section>`);
  }
  lines.push(`\n════════ TELEGRAM RAD ETGAN / MUAMMOLAR (${problems.length}) ════════`);
  for (const p of problems) lines.push(`  • [${p.step}] ${p.method} → ${p.chat}: ${p.msg}\n      «${plain(p.text).replace(/\n/g, " ⏎ ").slice(0, 140)}»`);
  fs.writeFileSync(outFile + ".txt", lines.join("\n"));
  fs.writeFileSync(outFile + ".html", `<!doctype html><meta charset="utf-8"><title>Bot simulyatsiyasi</title><style>
body{font:14px/1.45 -apple-system,system-ui,sans-serif;background:#e7ebf0;margin:0;padding:16px;color:#111}
.chat{max-width:640px;margin:0 auto 32px;background:#9fbfd9 linear-gradient(#a8c6dc,#c9dbe6);border-radius:14px;padding:12px}
h2{margin:0 0 8px;font-size:15px;background:#fff;padding:8px 12px;border-radius:10px}
.step{text-align:center;margin:12px 0 6px;font-size:12px;color:#fff;background:rgba(0,0,0,.25);border-radius:99px;padding:2px 10px;width:fit-content;margin-inline:auto}
.msg{background:#fff;border-radius:12px;padding:6px 10px;margin:4px 0;max-width:85%;white-space:pre-wrap;word-break:break-word}
.msg.user{background:#effdde;margin-left:auto}.msg.edit{border:1px dashed #7aa}.msg.del{opacity:.4;text-decoration:line-through}
.who{font-size:12px;font-weight:600;color:#2a7ab0}.who span{font-weight:400;color:#999}
.kb div{display:flex;gap:4px;margin-top:4px}.kb span{flex:1;text-align:center;background:rgba(0,0,0,.08);border-radius:8px;padding:5px;font-size:13px;color:#2a7ab0}
.ev{font-size:12px;color:#234;text-align:center;margin:3px 0}
pre,code{background:#f2f2f2;border-radius:4px;padding:0 3px}
</style>${html.join("\n")}`);
  server.close();
  await db.getPool().end();
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]); }
