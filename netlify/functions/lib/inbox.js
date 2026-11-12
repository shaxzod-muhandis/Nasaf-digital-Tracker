// ── ILOVA ICHIDAGI BILDIRISHNOMALAR (D29, 2026-11-12) ────────────────
// Telegram xabari bilan birga `notifications` jadvaliga ham yoziladi.
// Telegram'ga bog'liq emas: BOT_TOKEN yo'q bo'lsa yoki xodimning
// chat_id'si bo'lmasa ham ilova ichida ko'rinadi.
//
// Yozish hech qachon asosiy amalni buzmaydi: jadval yo'q bo'lsa
// (migratsiya hali ishlatilmagan) yoki boshqa xato bo'lsa — faqat log.

// Telegram HTML matnini oddiy matnga aylantiradi: birinchi qator —
// sarlavha, qolgani — matn. Emoji va teglar olib tashlanadi.
function tgMatnniAjrat(html) {
  const toza = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  const qatorlar = toza
    .split("\n")
    .map((q) => q.trim())
    .filter(Boolean);
  // Boshidagi emoji/belgilarni olib tashlaymiz — ilovada teg o'zi bor.
  const birinchi = (qatorlar.shift() || "").replace(/^[^\p{L}\p{N}«"(@+−-]+/u, "").trim();
  return {
    title: birinchi.slice(0, 200) || "Bildirishnoma",
    body: qatorlar.join("\n").slice(0, 1000) || null,
  };
}

// userIds — bitta id yoki massiv. matn — Telegram HTML (yoki {title, body}).
async function yozBildirishnoma(db, userIds, { type, html, title, body, entityType = null, entityId = null }) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
  if (!db || !ids.length || !type) return;
  const m = html ? tgMatnniAjrat(html) : { title: String(title || "").slice(0, 200), body: body || null };
  if (!m.title) return;
  try {
    await db.query(
      `insert into notifications (user_id, type, title, body, entity_type, entity_id)
       select u, $2, $3, $4, $5, $6 from unnest($1::uuid[]) as u`,
      [ids, type, m.title, m.body, entityType, entityId == null ? null : String(entityId)],
    );
  } catch (e) {
    console.error("[bildirishnoma yozilmadi]", type, e.code || "", e.message);
  }
}

module.exports = { yozBildirishnoma, tgMatnniAjrat };
