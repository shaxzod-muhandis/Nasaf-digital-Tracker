// ═══════════════════════════════════════════════════════════════════════
// Ncoin — ledger (tranzaksiyalar jadvali) asosidagi virtual valyuta.
// Balans alohida saqlanmaydi, har doim ncoin_transactions'dan
// sum(amount) orqali hisoblanadi — shu bilan "tarix" talabi avtomatik
// bajariladi va balans/tarix hech qachon bir-biridan uzilib qolmaydi.
// ═══════════════════════════════════════════════════════════════════════

async function getBalance(db, userId) {
  const r = await db.query(
    `select coalesce(sum(amount), 0)::float as balance from ncoin_transactions where user_id = $1`,
    [userId],
  );
  return r.rows[0].balance;
}

async function awardNcoin(db, { userId, amount, reason, referenceType = null, referenceId = null }) {
  await db.query(
    `insert into ncoin_transactions (user_id, amount, reason, reference_type, reference_id)
     values ($1, $2, $3, $4, $5)`,
    [userId, amount, reason, referenceType, referenceId],
  );
}

// Berilgan reference uchun eng oxirgi HALI QAYTARILMAGAN musbat
// tranzaksiyani topib, aynan shuncha manfiy yozuv qo'shadi. Asl yozuv
// o'chirilmaydi (ledger append-only qoladi) — shu bilan "check belgilab
// - bekor qilib - qayta belgilash" orqali coin ferma qilish oldini
// oladi (bitta muvaffaqiyatli award'ga faqat bitta reversal mumkin).
async function reverseNcoin(db, { referenceType, referenceId, reason }) {
  const r = await db.query(
    `select id, user_id, amount from ncoin_transactions
     where reference_type = $1 and reference_id = $2 and amount > 0
       and not exists (
         select 1 from ncoin_transactions r
         where r.reference_type = $1 and r.reference_id = $2 and r.amount < 0
       )
     order by created_at desc limit 1`,
    [referenceType, referenceId],
  );
  const original = r.rows[0];
  if (!original) return false;
  await awardNcoin(db, {
    userId: original.user_id,
    amount: -Number(original.amount),
    reason,
    referenceType,
    referenceId,
  });
  return true;
}

module.exports = { getBalance, awardNcoin, reverseNcoin };
