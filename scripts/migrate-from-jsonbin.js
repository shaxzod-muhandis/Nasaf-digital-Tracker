#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Bir martalik migratsiya: JSONBin.io'dagi mavjud ma'lumotlarni yangi
// Postgres sxemasiga o'tkazadi (users, projects, project_cycles, checks,
// permissions).
//
// Ishlatish:
//   node scripts/migrate-from-jsonbin.js --dry-run     (faqat ko'rib chiqish, yozmaydi)
//   node scripts/migrate-from-jsonbin.js --yes         (haqiqatan yozadi)
//
// Talab qilinadigan environment o'zgaruvchilar:
//   JSONBIN_BIN_ID, JSONBIN_KEY   — eski manba
//   DATABASE_URL                  — yangi Postgres (Supabase) manzili
//
// MUHIM: Bu skript IDEMPOTENT emas — ikki marta ishga tushirilsa,
// loyihalar/foydalanuvchilar takrorlanishi mumkin (aslida `on conflict`
// bilan ko'p joyda himoyalangan, lekin project_cycles/checks uchun
// takroriy ishga tushirishdan oldin bazani tozalab olish tavsiya etiladi).
// Faqat BO'SH (yangi) Postgres bazasida bir marta ishga tushiring.
// ═══════════════════════════════════════════════════════════════════════

require("./_env").loadEnv();
require("../netlify/functions/lib/pg-types"); // `date` ustunlarini satr sifatida o'qish uchun
const { Client } = require("pg");
const { cycleBounds } = require("../netlify/functions/lib/dates");

const SUPER_ADMINS = new Set(["jahongirjuraqulov", "shaxzodshokirov"]);
const LEGACY_EMPLOYEES = ["sta_nasaf", "logans_03", "mirshoddd", "rasulovjonibek", "nasafdigital_manager"];

const isDryRun = process.argv.includes("--dry-run") || !process.argv.includes("--yes");

async function fetchJsonBinData() {
  const binId = process.env.JSONBIN_BIN_ID;
  const key = process.env.JSONBIN_KEY;
  if (!binId || !key) throw new Error("JSONBIN_BIN_ID / JSONBIN_KEY environment'da yo'q.");
  const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers: { "X-Master-Key": key, "X-Bin-Meta": "false" },
  });
  if (!res.ok) throw new Error(`JSONBin GET xato [${res.status}]`);
  const data = await res.json();
  return data?.record ?? data ?? {};
}

function monthBounds(monthId) {
  // monthId = "YYYY-MM" — eski tizimda har doim 1-sanadan boshlanadi
  const [y, m] = monthId.split("-").map(Number);
  const start = `${monthId}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${monthId}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function monthDiffIndex(anchorMonthId, targetMonthId) {
  const [ay, am] = anchorMonthId.split("-").map(Number);
  const [ty, tm] = targetMonthId.split("-").map(Number);
  return (ty - ay) * 12 + (tm - am) + 1; // 1-based
}

async function main() {
  console.log(isDryRun ? "🔎 DRY-RUN rejimi (hech narsa yozilmaydi)\n" : "✍️  YOZISH rejimi\n");

  const record = await fetchJsonBinData();
  const months = record.months || {};
  const monthIds = Object.keys(months).sort();
  if (monthIds.length === 0) {
    console.log("JSONBin'da hech qanday oy topilmadi. Migratsiya qilinadigan narsa yo'q.");
    return;
  }
  const activeMonth = record.activeMonth && months[record.activeMonth] ? record.activeMonth : monthIds[monthIds.length - 1];
  console.log(`Topilgan oylar: ${monthIds.join(", ")}`);
  console.log(`Faol oy (activeMonth): ${activeMonth}\n`);

  // ── 1. Projects: barcha oylardagi unique clientId'larni yig'amiz ────
  const projectsBySlug = new Map(); // slug -> { label, k, s, firstMonth, lastMonth, isActive }
  for (const monthId of monthIds) {
    const clients = months[monthId].clients || [];
    for (const c of clients) {
      const existing = projectsBySlug.get(c.id);
      if (!existing) {
        projectsBySlug.set(c.id, {
          slug: c.id,
          label: c.label,
          k: c.k,
          s: c.s,
          firstMonth: monthId,
          lastMonth: monthId,
          appearsInActiveMonth: monthId === activeMonth,
        });
      } else {
        existing.label = c.label; // eng oxirgisi ustun
        existing.k = c.k;
        existing.s = c.s;
        existing.lastMonth = monthId;
        if (monthId === activeMonth) existing.appearsInActiveMonth = true;
      }
    }
  }
  console.log(`Aniqlangan loyihalar (${projectsBySlug.size} ta):`);
  for (const p of projectsBySlug.values()) {
    console.log(
      `  - ${p.slug} ("${p.label}") — birinchi: ${p.firstMonth}, oxirgi: ${p.lastMonth}, faolmi: ${p.appearsInActiveMonth}`,
    );
  }

  // ── 2. Users ──────────────────────────────────────────────────────
  const usernames = new Set([
    ...SUPER_ADMINS,
    ...LEGACY_EMPLOYEES,
    ...Object.keys(record.permissions || {}),
    ...Object.keys(record.userChatIds || {}),
    ...(record.admins || []),
  ]);
  const usersOut = [];
  for (const uname of usernames) {
    let role = "employee";
    if (SUPER_ADMINS.has(uname)) role = "super_admin";
    else if ((record.admins || []).includes(uname)) role = "admin";
    usersOut.push({
      username: uname,
      role,
      telegramChatId: record.userChatIds?.[uname] ? String(record.userChatIds[uname]) : null,
    });
  }
  console.log(`\nAniqlangan foydalanuvchilar (${usersOut.length} ta):`);
  usersOut.forEach((u) => console.log(`  - @${u.username} (${u.role})${u.telegramChatId ? " · chat_id bor" : ""}`));

  // ── 3. Permissions ────────────────────────────────────────────────
  const permsOut = [];
  Object.entries(record.permissions || {}).forEach(([uname, slugs]) => {
    (slugs || []).forEach((slug) => {
      if (projectsBySlug.has(slug)) permsOut.push({ username: uname, slug });
    });
  });
  console.log(`\nRuxsat yozuvlari: ${permsOut.length} ta`);

  let totalCycles = 0,
    totalChecks = 0;
  for (const monthId of monthIds) {
    totalCycles += (months[monthId].clients || []).length;
    totalChecks += Object.values(months[monthId].checks || {}).filter(Boolean).length;
  }
  console.log(`Jami davr (cycle) yozuvlari: ${totalCycles} ta, jami belgilangan check: ${totalChecks} ta`);

  if (isDryRun) {
    console.log("\n✅ Dry-run tugadi. Haqiqatan yozish uchun: node scripts/migrate-from-jsonbin.js --yes");
    return;
  }

  // ── YOZISH ────────────────────────────────────────────────────────
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");

    // Users
    const userIdBySlug = new Map();
    for (const u of usersOut) {
      const r = await client.query(
        `insert into users (username, role, telegram_chat_id) values ($1,$2,$3)
         on conflict (username) do update set role = excluded.role, telegram_chat_id = coalesce(excluded.telegram_chat_id, users.telegram_chat_id)
         returning id`,
        [u.username, u.role, u.telegramChatId],
      );
      userIdBySlug.set(u.username, r.rows[0].id);
    }

    // Projects — anchor_date = birinchi ko'rilgan oyning 1-sanasi
    const projectIdBySlug = new Map();
    for (const p of projectsBySlug.values()) {
      const anchorDate = `${p.firstMonth}-01`;
      const r = await client.query(
        `insert into projects (slug, label, anchor_date, posts_target, stories_target, is_active)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (slug) do update set label = excluded.label
         returning id`,
        [p.slug, p.label, anchorDate, p.k, p.s, p.appearsInActiveMonth],
      );
      projectIdBySlug.set(p.slug, r.rows[0].id);
    }

    // Project cycles + checks — har (loyiha, oy) juftligi uchun
    for (const monthId of monthIds) {
      const { start, end } = monthBounds(monthId);
      const clients = months[monthId].clients || [];
      const checks = months[monthId].checks || {};
      for (const c of clients) {
        const p = projectsBySlug.get(c.id);
        const projectId = projectIdBySlug.get(c.id);
        const cycleIndex = monthDiffIndex(p.firstMonth, monthId);
        const expectedBounds = cycleBounds(`${p.firstMonth}-01`, cycleIndex);
        if (expectedBounds.periodStart !== start || expectedBounds.periodEnd !== end) {
          console.warn(
            `  ⚠️  ${c.id}/${monthId}: hisoblangan davr chegarasi mos kelmadi (${expectedBounds.periodStart}..${expectedBounds.periodEnd} vs ${start}..${end}) — baribir yozilmoqda.`,
          );
        }
        const isActiveCycle = monthId === activeMonth && p.appearsInActiveMonth;
        const cr = await client.query(
          `insert into project_cycles (project_id, cycle_index, period_start, period_end, posts_target, stories_target, status, is_debt, closed_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (project_id, cycle_index) do update set status = excluded.status
           returning id`,
          [
            projectId,
            cycleIndex,
            start,
            end,
            c.k,
            c.s,
            isActiveCycle ? "active" : "closed",
            false, // pastda hisoblab, kerak bo'lsa yangilaymiz
            isActiveCycle ? null : new Date(),
          ],
        );
        const cycleId = cr.rows[0].id;

        let doneK = 0,
          doneS = 0;
        for (let i = 1; i <= c.k; i++) {
          if (checks[`${c.id}-k-${i}`]) {
            await client.query(
              `insert into checks (cycle_id, type, seq_number) values ($1,'k',$2) on conflict do nothing`,
              [cycleId, i],
            );
            doneK++;
          }
        }
        for (let i = 1; i <= c.s; i++) {
          if (checks[`${c.id}-s-${i}`]) {
            await client.query(
              `insert into checks (cycle_id, type, seq_number) values ($1,'s',$2) on conflict do nothing`,
              [cycleId, i],
            );
            doneS++;
          }
        }
        if (!isActiveCycle) {
          const isDebt = doneK < c.k || doneS < c.s;
          await client.query(`update project_cycles set is_debt = $1 where id = $2`, [isDebt, cycleId]);
        }
      }
    }

    // Permissions
    for (const { username, slug } of permsOut) {
      const userId = userIdBySlug.get(username);
      const projectId = projectIdBySlug.get(slug);
      if (!userId || !projectId) continue;
      await client.query(
        `insert into permissions (user_id, project_id) values ($1,$2) on conflict do nothing`,
        [userId, projectId],
      );
    }

    await client.query("COMMIT");
    console.log("\n🎉 Migratsiya muvaffaqiyatli yakunlandi!");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Migratsiya xatosi:", e.message);
  process.exit(1);
});
