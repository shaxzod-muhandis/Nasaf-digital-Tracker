-- ═══════════════════════════════════════════════════════════════════════
-- Nasaf Digital Tracker — Vazifa: Priority + Backlog/Review bosqichlari
-- ═══════════════════════════════════════════════════════════════════════
-- Linear uslubidagi ish oqimidan foydali qismlarni moslashtiramiz:
--   - "priority" ustuni (urgent/high/medium/low/no_priority)
--   - status ro'yxatiga "backlog" (hali navbatga qo'yilmagan, muddatsiz)
--     va "review" (tekshiruvda) bosqichlari qo'shiladi. Mavjud
--     bajarildi/bajarilmadi+sabab qoidasi (0004) o'zgarishsiz qoladi.
--
-- Bu fayl IDEMPOTENT — `npm run db:migrate` uni qayta ishga tushirsa ham
-- xato bermaydi.
-- ═══════════════════════════════════════════════════════════════════════

alter table tasks add column if not exists priority text not null default 'no_priority';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table tasks add constraint tasks_priority_check
      check (priority in ('urgent', 'high', 'medium', 'low', 'no_priority'));
  end if;
end $$;

-- status check constraint'ni 0004'dagi bilan bir xil usulda (nomini
-- qidirib topib) 'backlog' va 'review'ni qo'shib qayta yaratamiz.
do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'tasks'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%''todo''%';
  if con_name is not null then
    execute format('alter table tasks drop constraint %I', con_name);
  end if;
end $$;

alter table tasks add constraint tasks_status_check
  check (status in ('backlog', 'todo', 'in_progress', 'review', 'done', 'failed', 'cancelled'));
