-- ═══════════════════════════════════════════════════════════════════════
-- TABEL: har bir post/stories uchun "kim mas'ul edi" va "kim bajardi".
--
-- Hozirgi modelda `checks` jadvalidagi qator faqat ish BAJARILGANDA
-- paydo bo'ladi (PK: cycle_id + type + seq_number, done_at NOT NULL).
-- Rejadagi har bir ish uchun oldindan qator yaratish butun tizimga
-- (devor ekrani, Bugun, qarz hisobi, oy yopilishi) tegadi, shuning
-- uchun bu yerda faqat BAJARILGAN ishga mas'ul snapshot qilinadi;
-- bajarilmaganlar esa "reja − bajarilgan" sifatida hisoblanadi.
--
-- `done_by` avvalgidek qoladi va bajaruvchiga teng bo'ladi — undan
-- devor ekrani, Ncoin va faoliyat tasmasi foydalanadi.
-- ═══════════════════════════════════════════════════════════════════════

-- Rejada kim mas'ul edi (ish belgilangan paytdagi holat).
alter table checks add column if not exists assignee_id uuid references users(id);

-- Ishni amalda kim bajardi.
alter table checks add column if not exists performer_id uuid references users(id);

-- performer <> assignee bo'lsa — sabab majburiy (backendda tekshiriladi).
alter table checks add column if not exists substitution_reason text;
alter table checks add column if not exists substitution_note text;

-- Kim belgiladi (audit) — bajaruvchidan farq qilishi mumkin.
alter table checks add column if not exists marked_by uuid references users(id);

alter table checks drop constraint if exists checks_substitution_reason_check;
alter table checks add constraint checks_substitution_reason_check
  check (substitution_reason is null
         or substitution_reason in ('sick', 'vacation', 'urgent', 'other'));

-- ── Mavjud yozuvlarni to'ldirish ────────────────────────────────────
-- Kim belgilagani (audit) — bor bo'lsa saqlanadi.
update checks set marked_by = done_by where marked_by is null and done_by is not null;

-- Mas'ul — loyihaning SMM roli berilgan xodimi; u yo'q bo'lsa
-- ishni belgilagan xodimning o'zi.
update checks c
set assignee_id = coalesce(
  (select perm.user_id
     from project_cycles pc
     join permissions perm on perm.project_id = pc.project_id and perm.role = 'smm'
    where pc.id = c.cycle_id
    limit 1),
  c.done_by)
where c.assignee_id is null;

-- TZ: "Tarixiy ma'lumotda almashuv yo'q deb olinadi" — eski yozuvlarda
-- bajaruvchi mas'ulning o'zi deb qabul qilinadi. `done_by` ga
-- tenglashtirilsa, SMM'dan boshqa kishi belgilagan har bir eski ish
-- soxta "o'rniga bajarildi" bo'lib chiqar va o'tgan oylardagi oylik
-- foizini asossiz tushirib yuborardi.
update checks set performer_id = assignee_id where performer_id is null;

create index if not exists idx_checks_performer on checks(performer_id);
create index if not exists idx_checks_assignee on checks(assignee_id);
