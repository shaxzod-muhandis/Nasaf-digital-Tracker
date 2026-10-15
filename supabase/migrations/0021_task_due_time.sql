-- Vazifa muddatiga SOAT qo'shiladi.
--
-- Hozirgacha muddat faqat kun edi (`due_date`), ya'ni "16-oktabrgacha".
-- Amalda esa ish kun ichida ham muddatli bo'ladi — "18:00 gacha". TZ
-- (Vazifa yaratish sahifasi, 6.4) shu soatni so'raydi.
--
-- Ish oynasi (`start_date` .. `due_date`) o'z holicha qoladi: soat
-- oraliqning OXIRGI kuniga tegishli, ya'ni "14-oktabrdan 18-oktabr
-- soat 18:00 gacha". Shuning uchun alohida ustun — `due_date` ni
-- `timestamptz` ga aylantirish eski ma'lumotni ham, uning ustida
-- ishlayotgan hamma joyni ham (Tabel, eslatmalar, hisobotlar,
-- `date` solishtiruvlari) buzgan bo'lardi.
--
-- Bo'sh qoldirilsa — muddat avvalgidek kun bo'yicha, soatsiz.
alter table tasks add column if not exists due_time time;

comment on column tasks.due_time is
  'Muddat soati (ish oynasining oxirgi kunida). NULL — soat belgilanmagan.';
