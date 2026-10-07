-- ═══════════════════════════════════════════════════════════════════════
-- Bitta vazifaga BIR NECHTA mas'ul.
--
-- Avval `tasks.assignee_user_id` bitta xodimni ko'rsatardi. Endi
-- mas'ullar alohida jadvalda — "umumiy" vazifa (bir nechta odam birga
-- qiladigan ish) yozib bo'ladigan bo'ldi.
--
-- `tasks.assignee_user_id` o'chirilmaydi: u BIRINCHI mas'ulning
-- nusxasi bo'lib qoladi. Shu bilan eski so'rovlar (indekslar, hisobot,
-- bildirishnoma) ishlayveradi. Nusxa faqat bitta joydan —
-- `setTaskAssignees()` dan yoziladi, shuning uchun ikkisi bir-biridan
-- uzilib qolmaydi.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists task_assignees (
  task_id  uuid not null references tasks(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  -- Ro'yxatdagi o'rni: 0 — birinchi (asosiy) mas'ul. Tartib muhim,
  -- chunki kartochkada birinchi avatar shu odamniki bo'ladi.
  position int  not null default 0,
  primary key (task_id, user_id)
);

create index if not exists idx_task_assignees_user on task_assignees(user_id);
create index if not exists idx_task_assignees_task on task_assignees(task_id, position);

-- Mavjud vazifalarni ko'chirish — har birida bitta mas'ul bor edi.
insert into task_assignees (task_id, user_id, position)
select id, assignee_user_id, 0 from tasks where assignee_user_id is not null
on conflict (task_id, user_id) do nothing;
