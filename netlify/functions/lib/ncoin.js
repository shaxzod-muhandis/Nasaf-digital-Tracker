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

// Berilgan reference uchun HALI QAYTARILMAGAN barcha musbat
// tranzaksiyalarni (har bir user bo'yicha alohida) topib, har biriga
// aynan shuncha manfiy yozuv qo'shadi. Asl yozuvlar o'chirilmaydi
// (ledger append-only qoladi) — shu bilan "check belgilab - bekor
// qilib - qayta belgilash" orqali coin ferma qilish oldini oladi.
//
// Bitta reference (masalan bitta post) endi BIR NECHA odamga (video
// oluvchi, montaj qiluvchi, SMM menejer) coin berishi mumkin bo'lgani
// uchun — har bir userning o'z award/reversal sonini alohida
// hisoblaymiz (umumiy "shu reference uchun biror reversal bormi"
// tekshiruvi o'rniga), aks holda bitta userning reversali boshqa
// userlarning hali qaytarilmagan coinini ham "qaytarilgan" deb
// bloklab qo'yardi.
async function reverseNcoin(db, { referenceType, referenceId, reason }) {
  const r = await db.query(
    `with p as (
       select id, user_id, amount, created_at,
              row_number() over (partition by user_id order by created_at) as rn
       from ncoin_transactions
       where reference_type = $1 and reference_id = $2 and amount > 0
     ),
     n as (
       select user_id, count(*) as cnt
       from ncoin_transactions
       where reference_type = $1 and reference_id = $2 and amount < 0
       group by user_id
     )
     select p.id, p.user_id, p.amount
     from p left join n on n.user_id = p.user_id
     where p.rn > coalesce(n.cnt, 0)
     order by p.created_at asc`,
    [referenceType, referenceId],
  );
  for (const original of r.rows) {
    await awardNcoin(db, {
      userId: original.user_id,
      amount: -Number(original.amount),
      reason,
      referenceType,
      referenceId,
    });
  }
  return r.rows.length;
}

module.exports = { getBalance, awardNcoin, reverseNcoin };
