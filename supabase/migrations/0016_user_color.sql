-- ═══════════════════════════════════════════════════════════════════════
-- Xodim rangi — avatar, kalendar va jadvallarda shu rang ishlatiladi.
-- ═══════════════════════════════════════════════════════════════════════
-- Nima uchun kerak: interfeysda xodimlar ko'pincha faqat bosh harflari
-- bilan ko'rsatiladi (ustma-ust avatarlar, kanban kartalari). Bir xil
-- harfli xodimlar — "Mirshod / Malika", "Jahongir / Jafar" — bir-biridan
-- ajralmay qoladi. Rang shu muammoni yechadi.
--
-- Nega bazada saqlanadi: rangni ism asosida hisoblab ham bo'lardi, lekin
-- u holda yangi xodim qo'shilganda (ayniqsa alifboda oldinroq turadigan
-- ism bilan) mavjud xodimlarning rangi siljib ketadi. Bazada saqlangach
-- rang xodimga bir marta biriktiriladi va o'zgarmaydi.
--
-- Qiymat bo'sh (null) bo'lsa, frontend uni vaqtincha o'zi hisoblaydi —
-- shu sabab bu migratsiya hech narsani buzmaydi va to'ldirish shart emas.

alter table users add column if not exists color text;

-- Faqat #rrggbb ko'rinishidagi qiymat (kichik harflarda) qabul qilinadi —
-- interfeysga to'g'ridan-to'g'ri tushadigan qiymat bo'lgani uchun.
alter table users drop constraint if exists users_color_check;
alter table users add constraint users_color_check
  check (color is null or color ~ '^#[0-9a-f]{6}$');
