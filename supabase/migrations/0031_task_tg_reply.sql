-- ═══════════════════════════════════════════════════════════════════
-- TELEGRAMDAN IZOH — botning javob xabarini eslab qolish
--
-- Vazifa ochilganda bot guruhga "✅ Vazifa ochildi" deb yozadi. Odam
-- o'sha xabarga javob yozsa, uni vazifaga izoh qilib qo'yish kerak.
-- Buning uchun bot O'Z javobining message_id sini bilishi shart.
--
-- `tg_message_id` (0030) bu ishga yaramaydi: u MANBA xabar, ya'ni
-- `/task ...` yozilgan xabar. Odam esa botning javobiga javob
-- yozadi — bu boshqa xabar.
-- ═══════════════════════════════════════════════════════════════════

alter table tasks add column if not exists tg_reply_message_id bigint;

-- Bitta bot xabari — bitta vazifa. Indeks ham qidiruvni tezlashtiradi
-- (har guruh xabariga javob berilganda shu bo'yicha qidiriladi), ham
-- chalkashlikning oldini oladi.
-- QISMAN: null'lar kirmaydi, aks holda hamma eski vazifalar bitta
-- (null, null) juftligiga urilib ketardi.
create unique index if not exists one_task_per_tg_reply
  on tasks (tg_chat_id, tg_reply_message_id)
  where tg_chat_id is not null and tg_reply_message_id is not null;
