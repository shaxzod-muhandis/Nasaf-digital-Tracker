// ═══════════════════════════════════════════════════════════════════════
// Nasaf Digital Tracker — API (Faza 1: Postgres/Supabase asosida)
// ═══════════════════════════════════════════════════════════════════════
// Bu fayl eski JSONBin-asosli api.js o'rnini bosadi. Endpoint nomlari va
// javob formatlari, imkon qadar, eski frontend bilan moslashtirilgan,
// lekin "oy" (calendar month) tushunchasi endi "loyiha davri" (project
// cycle) bilan almashtirilgani sababli ba'zi endpointlar (masalan
// /api/months) o'rniga yangi, davr-modeliga mos endpointlar keldi
// (/api/projects). Batafsil: docs/ROADMAP.md va docs/SETUP.md
// ═══════════════════════════════════════════════════════════════════════

const serverless = require("serverless-http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const db = require("./lib/db");
const {
  createAuthMiddleware,
  isAdminRole,
  verifyTelegramInitData,
  getUsernameFromInitData,
} = require("./lib/auth");
const {
  getActiveCycle,
  getCycleById,
  closeCycle,
  countDoneChecks,
  recomputeDebtIfClosed,
  ensureCurrentCycle,
  getProjectCycleSummary,
} = require("./lib/cycles");
const { todayTashkent, dayDiff, addMonthsClamped, cycleBounds } = require("./lib/dates");
const {
  APP_URL,
  appOpenButton,
  sendMsg,
  resolveRecipients,
  notifyCheckChange,
  notifyTaskAssigned,
  notifyTeamTaskEvent,
  notifyProjectAssigned,
  pct,
  buildPacingMessage,
} = require("./lib/notify");

// Faqat Telegram bildirishnoma matnlarini tuzish uchun (Vazifalar
// ekranidagi TASK_STATUS_LABEL bilan bir xil) — front-end'ga ulanmagan
// alohida oqim, chunki bu xabarlar to'g'ridan-to'g'ri serverdan
// yuboriladi (frontend formatlab bera olmaydi).
const TASK_STATUS_LABEL_UZ = {
  backlog: "Backlog",
  todo: "Boshlanmagan",
  in_progress: "Jarayonda",
  review: "Tekshiruvda",
  done: "Bajarilgan",
  failed: "Bajarilmadi",
  cancelled: "Bekor qilingan",
};

const app = express();
app.use(cors());
app.use(express.json());

const auth = createAuthMiddleware(db);
const CRON_SECRET = process.env.CRON_SECRET || "";

function requireAdmin(req, res) {
  if (!isAdminRole(req.user.role)) {
    res.status(403).json({ error: "Faqat adminlar" });
    return false;
  }
  return true;
}
function requireSuperAdmin(req, res) {
  if (req.user.role !== "super_admin") {
    res.status(403).json({ error: "Faqat super adminlar" });
    return false;
  }
  return true;
}
function slugify(label) {
  return String(label)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function sendAppHtml(res) {
  const appPath = path.join(process.cwd(), "private", "app.html");
  try {
    const html = fs.readFileSync(appPath, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: "App topilmadi", detail: e.message });
  }
}

// Cron (X-Cron-Secret) yoki admin/super-admin initData orqali chaqirish
// mumkin bo'lgan endpointlar uchun umumiy tekshiruv.
async function resolveCronOrAdminCaller(req, { requireSuper = false } = {}) {
  const secret = req.headers["x-cron-secret"] || req.body?.secret || "";
  if (CRON_SECRET && secret === CRON_SECRET) return { ok: true, caller: "cron" };

  const initData = req.headers["x-telegram-init-data"] || "";
  if (!initData || !verifyTelegramInitData(initData, process.env.BOT_TOKEN || "")) {
    return { ok: false, status: 401, error: "Ruxsatsiz kirish" };
  }
  const uname = getUsernameFromInitData(initData);
  const ur = await db.query(`select role from users where username = $1 and is_active`, [uname]);
  const role = ur.rows[0]?.role;
  if (!role) return { ok: false, status: 403, error: "Ruxsat yo'q" };
  if (requireSuper && role !== "super_admin") return { ok: false, status: 403, error: "Faqat super adminlar" };
  if (!requireSuper && !isAdminRole(role)) return { ok: false, status: 403, error: "Faqat adminlar" };
  return { ok: true, caller: uname };
}

// ── /api/get-app — Mini App HTML'ni yuboradi ────────────────────────
app.get("/", (req, res) => sendAppHtml(res));
app.post("/api/get-app", auth, (req, res) => sendAppHtml(res));

// ── /api/auth ─────────────────────────────────────────────────────────
app.post("/api/auth", auth, (req, res) => {
  res.json({
    ok: true,
    username: req.user.username,
    isAdmin: isAdminRole(req.user.role),
    isSuperAdmin: req.user.role === "super_admin",
    role: req.user.role,
  });
});

// ── /api/register-chat ──────────────────────────────────────────────
app.post("/api/register-chat", auth, async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: "chatId kerak" });
    await db.query(
      `update users set telegram_chat_id = $1, telegram_user_id = coalesce(telegram_user_id, $2::bigint)
       where id = $3`,
      [String(chatId), String(chatId), req.user.id],
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROFIL (o'zi haqida ko'rish/tahrirlash) ──────────────────────────
const PROFILE_REQUIRED_FIELDS = ["first_name", "last_name", "phone", "job_title"];

app.get("/api/me", auth, (req, res) => {
  const u = req.user;
  const profileIncomplete = PROFILE_REQUIRED_FIELDS.some((f) => !u[f]);
  res.json({
    ok: true,
    user: {
      username: u.username,
      fullName: u.full_name,
      firstName: u.first_name,
      lastName: u.last_name,
      birthDate: u.birth_date,
      phone: u.phone,
      jobTitle: u.job_title,
      avatarUrl: u.avatar_url,
      role: u.role,
      isAdmin: isAdminRole(u.role),
      isSuperAdmin: u.role === "super_admin",
    },
    profileIncomplete,
  });
});

app.patch("/api/me", auth, async (req, res) => {
  try {
    const fieldMap = {
      firstName: "first_name",
      lastName: "last_name",
      birthDate: "birth_date",
      phone: "phone",
      jobTitle: "job_title",
    };
    const sets = [];
    const values = [];
    for (const [bodyKey, column] of Object.entries(fieldMap)) {
      if (typeof req.body[bodyKey] === "undefined") continue;
      values.push(req.body[bodyKey] || null);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: "O'zgartiriladigan maydon yo'q" });
    values.push(req.user.id);
    await db.query(`update users set ${sets.join(", ")} where id = $${values.length}`, values);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── FOYDALANUVCHILAR (admin) ─────────────────────────────────────────
// Eski tizimda MANAGED_USERS frontend kodida qattiq yozilgan edi — endi
// bu yerdan dinamik olinadi, yangi xodim qo'shish uchun deploy shart emas.
app.get("/api/users", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await db.query(
      `select username, full_name, role, is_active, access_status, access_granted_at, blocked_at,
              telegram_user_id, (telegram_chat_id is not null) as has_chat,
              first_name, last_name, birth_date, phone, job_title, avatar_url
       from users order by (role = 'employee'), username`,
    );
    res.json({ users: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Botga kirish huquqini berish (yangi user qo'shish yoki avval "removed"/
// "blocked" bo'lgan userni qayta faollashtirish) — TZ 3, 13-band: faqat
// Super Admin.
app.post("/api/users", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const username = (req.body.username || "").toLowerCase().replace("@", "").trim();
    const fullName = (req.body.fullName || "").trim() || null;
    const firstName = (req.body.firstName || "").trim() || null;
    const lastName = (req.body.lastName || "").trim() || null;
    const birthDate = req.body.birthDate || null;
    const phone = (req.body.phone || "").trim() || null;
    const jobTitle = (req.body.jobTitle || "").trim() || null;
    if (!username) return res.status(400).json({ error: "username kerak" });
    const r = await db.query(
      `insert into users (username, full_name, role, first_name, last_name, birth_date, phone, job_title)
       values ($1, $2, 'employee', $3, $4, $5, $6, $7)
       on conflict (username) do update set
         is_active         = true,
         access_status      = 'active',
         access_granted_at = now(),
         blocked_at        = null,
         full_name  = coalesce(excluded.full_name, users.full_name),
         first_name = coalesce(excluded.first_name, users.first_name),
         last_name  = coalesce(excluded.last_name, users.last_name),
         birth_date = coalesce(excluded.birth_date, users.birth_date),
         phone      = coalesce(excluded.phone, users.phone),
         job_title  = coalesce(excluded.job_title, users.job_title)
       returning username, full_name, role, is_active, access_status, access_granted_at, first_name, last_name, birth_date, phone, job_title`,
      [username, fullName, firstName, lastName, birthDate, phone, jobTitle],
    );
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Botga kirish holatini o'zgartirish (active/blocked/removed) — TZ
// 5,6,7,13-band: FAQAT Super Admin. Profil maydonlarini tahrirlashdan
// (pastdagi umumiy PATCH) ataylab ALOHIDA endpoint — chunki ruxsat
// darajasi boshqacha (u yerda oddiy admin ham yetarli).
app.patch("/api/users/:username/access", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const uname = req.params.username.toLowerCase().replace("@", "");
    const status = req.body.status;
    if (!["active", "blocked", "removed"].includes(status)) {
      return res.status(400).json({ error: "status: active | blocked | removed bo'lishi kerak" });
    }
    const sets = ["access_status = $1", "is_active = $2"];
    const values = [status, status === "active"];
    if (status === "blocked") sets.push("blocked_at = now()");
    if (status === "active") {
      sets.push("blocked_at = null");
      sets.push("access_granted_at = now()");
    }
    values.push(uname);
    const r = await db.query(
      `update users set ${sets.join(", ")} where username = $${values.length}
       returning username, full_name, role, is_active, access_status, access_granted_at, blocked_at`,
      values,
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/users/:username", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const uname = req.params.username.toLowerCase().replace("@", "");
    const sets = [];
    const values = [];
    if (typeof req.body.fullName === "string") {
      values.push(req.body.fullName);
      sets.push(`full_name = $${values.length}`);
    }
    const profileFieldMap = {
      firstName: "first_name",
      lastName: "last_name",
      birthDate: "birth_date",
      phone: "phone",
      jobTitle: "job_title",
    };
    for (const [bodyKey, column] of Object.entries(profileFieldMap)) {
      if (typeof req.body[bodyKey] === "undefined") continue;
      values.push(req.body[bodyKey] || null);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: "O'zgartiriladigan maydon yo'q" });
    values.push(uname);
    const r = await db.query(
      `update users set ${sets.join(", ")} where username = $${values.length}
       returning username, full_name, role, is_active, first_name, last_name, birth_date, phone, job_title`,
      values,
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ADMINLAR (eski frontend bilan mos javob formati) ────────────────
app.get("/api/admins", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await db.query(
      `select username, role from users where role in ('super_admin','admin') order by role, username`,
    );
    res.json({
      superAdmins: r.rows.filter((u) => u.role === "super_admin").map((u) => u.username),
      dynamicAdmins: r.rows.filter((u) => u.role === "admin").map((u) => u.username),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admins", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const uname = (req.body.username || "").toLowerCase().replace("@", "").trim();
    if (!uname) return res.status(400).json({ error: "username kiritilmadi" });
    const existing = await db.query(`select role from users where username = $1`, [uname]);
    if (!existing.rows[0]) {
      return res.status(404).json({
        error: "Bunday foydalanuvchi topilmadi. Avval uni /api/users orqali (yoki botga /start bosgach) ro'yxatga oling.",
      });
    }
    if (existing.rows[0].role !== "employee") {
      return res.status(409).json({ error: "Allaqachon admin yoki super admin" });
    }
    await db.query(`update users set role = 'admin' where username = $1`, [uname]);
    const r = await db.query(`select username from users where role = 'admin' order by username`);
    res.json({ ok: true, admins: r.rows.map((x) => x.username) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admins/:username", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const uname = req.params.username.toLowerCase().replace("@", "");
    await db.query(`update users set role = 'employee' where username = $1 and role = 'admin'`, [uname]);
    const r = await db.query(`select username from users where role = 'admin' order by username`);
    res.json({ ok: true, admins: r.rows.map((x) => x.username) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── XODIMLAR (staff: montajchi / mobilograf / ...) ───────────────────
// users jadvalidan mustaqil — video oluvchi odam Telegram'ga kirmasa ham
// bu ro'yxatda bo'ladi. Post belgilanganda modal shu ro'yxatdan tanlaydi.
const STAFF_POSITIONS = [
  "montajchi",
  "mobilograf",
  "smm",
  "dizayner",
  "kopirayter",
  "boshqa",
];

// Ro'yxatni HAR QANDAY tasdiqlangan foydalanuvchi o'qiy oladi — chunki
// oddiy xodim ham post belgilaganda modaldan tanlashi kerak.
app.get("/api/staff", auth, async (req, res) => {
  try {
    const r = await db.query(
      `select id, full_name, position, is_active from staff
       where is_active = true order by position, lower(full_name)`,
    );
    res.json({
      staff: r.rows.map((s) => ({
        id: s.id,
        fullName: s.full_name,
        position: s.position,
      })),
      positions: STAFF_POSITIONS,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/staff", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const fullName = String(req.body.fullName || "").trim();
    const position = String(req.body.position || "boshqa").trim().toLowerCase();
    if (!fullName) return res.status(400).json({ error: "Ism kiritilmadi" });
    if (fullName.length > 120) return res.status(400).json({ error: "Ism juda uzun" });
    if (!STAFF_POSITIONS.includes(position)) {
      return res.status(400).json({ error: "Noto'g'ri lavozim" });
    }
    const dup = await db.query(
      `select id from staff where lower(full_name) = lower($1) and position = $2 and is_active`,
      [fullName, position],
    );
    if (dup.rows[0]) return res.status(409).json({ error: "Bu xodim allaqachon bor" });
    const r = await db.query(
      `insert into staff (full_name, position) values ($1,$2) returning id, full_name, position`,
      [fullName, position],
    );
    res.json({
      ok: true,
      staff: { id: r.rows[0].id, fullName: r.rows[0].full_name, position: r.rows[0].position },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/staff/:id", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const cur = await db.query(`select * from staff where id = $1`, [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: "Xodim topilmadi" });
    const fullName =
      req.body.fullName !== undefined
        ? String(req.body.fullName).trim()
        : cur.rows[0].full_name;
    const position =
      req.body.position !== undefined
        ? String(req.body.position).trim().toLowerCase()
        : cur.rows[0].position;
    if (!fullName) return res.status(400).json({ error: "Ism bo'sh bo'lmasin" });
    if (!STAFF_POSITIONS.includes(position)) {
      return res.status(400).json({ error: "Noto'g'ri lavozim" });
    }
    await db.query(`update staff set full_name = $1, position = $2 where id = $3`, [
      fullName,
      position,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Yumshoq o'chirish — eski checklardagi bog'lanish saqlanib qoladi
app.delete("/api/staff/:id", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await db.query(`update staff set is_active = false where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TABEL: oy davomida kim qaysi loyihada nima qilgan ────────────────
// Hisob-kitob (pul) YO'Q — faqat belgilanganlar ro'yxati va soni.
app.get("/api/worklog", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const month = String(req.query.month || todayTashkent().slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "month formati: YYYY-MM" });
    }
    const from = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const to = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;

    const r = await db.query(
      `select c.type, c.seq_number, c.work_date,
              c.editor_id, c.videographer_id,
              e.full_name as editor_name,
              v.full_name as videographer_name,
              pr.label as project_label, pr.slug as project_slug
         from checks c
         join project_cycles pc on pc.id = c.cycle_id
         join projects pr       on pr.id = pc.project_id
         left join staff e      on e.id = c.editor_id
         left join staff v      on v.id = c.videographer_id
        where c.work_date >= $1 and c.work_date < $2
        order by c.work_date desc, pr.label`,
      [from, to],
    );

    // Xodim bo'yicha guruhlash: montaj qilganlar va video olganlar alohida
    const group = (idField, nameField) => {
      const map = new Map();
      r.rows.forEach((row) => {
        if (!row[idField]) return;
        const key = row[idField];
        if (!map.has(key)) {
          map.set(key, { staffId: key, name: row[nameField], count: 0, items: [] });
        }
        const g = map.get(key);
        g.count++;
        g.items.push({
          project: row.project_label,
          projectSlug: row.project_slug,
          type: row.type,
          seqNumber: row.seq_number,
          workDate: row.work_date,
        });
      });
      return [...map.values()].sort((a, b) => b.count - a.count);
    };

    res.json({
      month,
      editors: group("editor_id", "editor_name"),
      videographers: group("videographer_id", "videographer_name"),
      totalMarked: r.rows.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── RUXSATLAR ────────────────────────────────────────────────────────
app.get("/api/permissions", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await db.query(
      `select u.username, pr.slug
       from permissions p
       join users u on u.id = p.user_id
       join projects pr on pr.id = p.project_id
       order by u.username`,
    );
    const out = {};
    r.rows.forEach((row) => {
      if (!out[row.username]) out[row.username] = [];
      out[row.username].push(row.slug);
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Faqat payload'da kelgan username'lar uchun to'liq sinxronlash — boshqa
// userlarning ruxsatlariga tegilmaydi (eski "butun obyektni almashtirish"
// xulq-atvoridan ataylab xavfsizroq variant, chunki endi userlar ro'yxati
// dinamik).
app.put("/api/permissions", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const payload = req.body || {};
    // Har bir user uchun eski ruxsatlar to'liq almashtiriladi (bulk
    // replace) — shu sababli YANGI berilgan loyihalarni bilish uchun
    // eski to'plamni o'chirishdan OLDIN saqlab qo'yamiz va farqini
    // topamiz (faqat haqiqatan YANGI qo'shilganlar haqida xabar boradi).
    const toNotify = [];
    await db.withTransaction(async (client) => {
      for (const uname of Object.keys(payload)) {
        const ur = await client.query(`select id from users where username = $1`, [uname]);
        if (!ur.rows[0]) continue;
        const userId = ur.rows[0].id;
        const slugs = Array.isArray(payload[uname]) ? payload[uname] : [];

        const oldR = await client.query(`select project_id from permissions where user_id = $1`, [userId]);
        const oldSet = new Set(oldR.rows.map((r) => r.project_id));

        await client.query(`delete from permissions where user_id = $1`, [userId]);
        if (slugs.length > 0) {
          const pr = await client.query(`select id, label from projects where slug = any($1::text[])`, [slugs]);
          for (const proj of pr.rows) {
            await client.query(
              `insert into permissions (user_id, project_id) values ($1,$2) on conflict do nothing`,
              [userId, proj.id],
            );
            if (!oldSet.has(proj.id) && uname !== req.user.username) {
              toNotify.push({ assigneeUserId: userId, projectLabel: proj.label });
            }
          }
        }
      }
    });
    // Bildirishnomalar tranzaksiya yopilgandan KEYIN, lekin javob
    // qaytarishdan OLDIN kutiladi — notify.js'dagi "serverless cold-cut"
    // falsafasi bilan bir xil (javob ketgach funksiya to'xtatilishi
    // mumkin, shuning uchun orqada qoldirilmaydi).
    await Promise.allSettled(
      toNotify.map((n) => notifyProjectAssigned(db, { ...n, actorUsername: req.user.username })),
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/announcements", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const message = String(req.body.message || "").trim();
  if (!message) return res.status(400).json({ error: "Xabar matni kerak" });
  if (message.length > 4000) return res.status(400).json({ error: "Xabar 4000 belgidan oshmasin" });
  if (!process.env.BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN yo'q" });

  const escapeHtml = (value) => value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  const envIds = (process.env.ADMIN_CHAT_IDS || process.env.ALL_CHAT_IDS || "")
    .replace(/[\'\"]/g, "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id) && id !== String(req.user.telegram_chat_id || ""));
  const usersR = await db.query(
    `select username, telegram_chat_id from users
     where is_active and telegram_chat_id is not null and id <> $1`,
    [req.user.id],
  );
  const recipients = new Map(envIds.map((chatId) => [chatId, null]));
  usersR.rows.forEach((user) => recipients.set(String(user.telegram_chat_id), user.username));
  const text = `📣 <b>@${escapeHtml(req.user.username)} e’loni</b>\n\n${escapeHtml(message)}`;
  const results = await Promise.all(
    [...recipients].map(async ([chatId, username]) => ({
      chatId,
      username,
      result: await sendMsg(db, chatId, text, { replyMarkup: appOpenButton() }),
    })),
  );
  res.json({ ok: true, total: results.length, sent: results.filter(({ result }) => result.ok).length });
});

// ── LOYIHALAR + JORIY DAVR (eski /api/months + /api/state o'rnini bosadi) ─
// Bitta chaqiriqda: ko'rish huquqi bor barcha loyihalar, har birining
// joriy davri (avtomatik rollover bilan), belgilangan checklar va
// qarz(lar) haqida ma'lumot.
app.get("/api/projects", auth, async (req, res) => {
  try {
    const isAdm = isAdminRole(req.user.role);
    const projectsR = isAdm
      ? await db.query(`select * from projects where is_active = true order by created_at`)
      : await db.query(
          `select pr.* from projects pr
           join permissions p on p.project_id = pr.id
           where pr.is_active = true and p.user_id = $1
           order by pr.created_at`,
          [req.user.id],
        );

    const projects = [];
    for (const project of projectsR.rows) {
      const summary = await getProjectCycleSummary(db, project);
      const checksR = await db.query(
        `select c.type, c.seq_number, c.work_date, c.editor_id, c.videographer_id,
                e.full_name as editor_name, v.full_name as videographer_name
           from checks c
           left join staff e on e.id = c.editor_id
           left join staff v on v.id = c.videographer_id
          where c.cycle_id = $1`,
        [summary.cycle.id],
      );
      // checks — eski format (truthy), checkDetails — kalendar va modal uchun
      const checks = {};
      const checkDetails = {};
      checksR.rows.forEach((c) => {
        const key = `${c.type}-${c.seq_number}`;
        checks[key] = true;
        checkDetails[key] = {
          workDate: c.work_date,
          editorId: c.editor_id,
          editorName: c.editor_name,
          videographerId: c.videographer_id,
          videographerName: c.videographer_name,
        };
      });
      projects.push({
        id: project.slug,
        label: project.label,
        k: summary.cycle.posts_target,
        s: summary.cycle.stories_target,
        doneK: summary.doneK,
        doneS: summary.doneS,
        checks,
        checkDetails,
        cycleId: summary.cycle.id,
        cycleIndex: summary.cycle.cycle_index,
        periodStart: summary.cycle.period_start,
        periodEnd: summary.cycle.period_end,
        anchorDate: project.anchor_date,
        outstandingDebt: summary.outstandingDebt,
      });
    }
    res.json({ projects, isAdmin: isAdm });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/projects/:slug/cycles", auth, async (req, res) => {
  try {
    const projR = await db.query(`select * from projects where slug = $1`, [req.params.slug]);
    const project = projR.rows[0];
    if (!project) return res.status(404).json({ error: "Loyiha topilmadi" });
    if (!isAdminRole(req.user.role)) {
      const permR = await db.query(
        `select 1 from permissions where user_id = $1 and project_id = $2`,
        [req.user.id, project.id],
      );
      if (!permR.rows[0]) return res.status(403).json({ error: "Ruxsat yo'q" });
    }
    const cyclesR = await db.query(
      `select * from project_cycles where project_id = $1 order by cycle_index desc`,
      [project.id],
    );
    const cycles = [];
    for (const c of cyclesR.rows) {
      const { doneK, doneS } = await countDoneChecks(db, c.id);
      const checksR = await db.query(`select type, seq_number from checks where cycle_id = $1`, [c.id]);
      const checksMap = {};
      checksR.rows.forEach((row) => {
        checksMap[`${row.type}-${row.seq_number}`] = true;
      });
      cycles.push({
        cycleId: c.id,
        cycleIndex: c.cycle_index,
        periodStart: c.period_start,
        periodEnd: c.period_end,
        k: c.posts_target,
        s: c.stories_target,
        doneK,
        doneS,
        status: c.status,
        isDebt: c.is_debt,
        checks: checksMap,
      });
    }
    res.json({
      project: { slug: project.slug, label: project.label, anchorDate: project.anchor_date },
      cycles,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/projects", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { label, anchorDate, postsTarget, storiesTarget, assigneeUsernames, notifyTelegram } = req.body;
    if (!label || !anchorDate || postsTarget == null || storiesTarget == null) {
      return res.status(400).json({ error: "label, anchorDate, postsTarget, storiesTarget majburiy" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
      return res.status(400).json({ error: "anchorDate format: YYYY-MM-DD" });
    }
    let slug = slugify(label);
    if (!slug) return res.status(400).json({ error: "Noto'g'ri loyiha nomi" });
    const exists = await db.query(`select 1 from projects where slug = $1`, [slug]);
    if (exists.rows[0]) slug = `${slug}_${Date.now().toString(36)}`;

    const r = await db.query(
      `insert into projects (slug, label, anchor_date, posts_target, stories_target)
       values ($1,$2,$3,$4,$5) returning *`,
      [slug, String(label).trim(), anchorDate, parseInt(postsTarget), parseInt(storiesTarget)],
    );
    const project = r.rows[0];
    const summary = await getProjectCycleSummary(db, project); // 1-davrni darhol yaratadi

    // "Mas'ul" — tanlangan xodim(lar)ga shu loyihaga darhol ruxsat
    // beriladi (alohida "responsible person" ustuni yo'q — mavjud
    // Ruxsatlar/permissions tizimidan foydalanamiz, chunki loyihani
    // amalda ko'rish/belgilash huquqi ham aynan shu orqali beriladi).
    const assignedUsernames = [];
    const uniqueUsernames = [...new Set((assigneeUsernames || []).map((u) => String(u).toLowerCase().replace("@", "")).filter(Boolean))];
    if (uniqueUsernames.length) {
      const ur = await db.query(`select id, username from users where lower(username) = any($1::text[])`, [uniqueUsernames]);
      for (const u of ur.rows) {
        await db.query(`insert into permissions (user_id, project_id) values ($1,$2) on conflict do nothing`, [u.id, project.id]);
        assignedUsernames.push(u.username);
      }
      if (notifyTelegram !== false) {
        await Promise.allSettled(
          ur.rows.map((u) =>
            notifyProjectAssigned(db, { assigneeUserId: u.id, projectLabel: project.label, actorUsername: req.user.username }),
          ),
        );
      }
    }

    res.json({
      ok: true,
      project: {
        id: project.slug,
        label: project.label,
        k: summary.cycle.posts_target,
        s: summary.cycle.stories_target,
        anchorDate: project.anchor_date,
        cycleId: summary.cycle.id,
        periodStart: summary.cycle.period_start,
        periodEnd: summary.cycle.period_end,
        assignedUsernames,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/projects/:slug", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const projR = await db.query(`select * from projects where slug = $1 and is_active = true`, [
      req.params.slug,
    ]);
    const project = projR.rows[0];
    if (!project) return res.status(404).json({ error: "Loyiha topilmadi" });

    const { label, postsTarget, storiesTarget, applyToCurrentCycle, periodStart } = req.body;
    const newLabel = (label ?? project.label).toString().trim();
    const newK = postsTarget != null ? parseInt(postsTarget) : project.posts_target;
    const newS = storiesTarget != null ? parseInt(storiesTarget) : project.stories_target;

    await db.query(`update projects set label = $1, posts_target = $2, stories_target = $3 where id = $4`, [
      newLabel,
      newK,
      newS,
      project.id,
    ]);

    const applyNow = applyToCurrentCycle !== false; // standart: joriy davrga ham qo'llanadi
    if (applyNow) {
      const { cycle } = await ensureCurrentCycle(db, project);
      await db.query(`update project_cycles set posts_target = $1, stories_target = $2 where id = $3`, [
        newK,
        newS,
        cycle.id,
      ]);
      // Eski xulq-atvor bilan bir xil: raqam kamaytirilsa, chegaradan
      // tashqaridagi belgilar o'chiriladi
      await db.query(`delete from checks where cycle_id = $1 and type = 'k' and seq_number > $2`, [cycle.id, newK]);
      await db.query(`delete from checks where cycle_id = $1 and type = 's' and seq_number > $2`, [cycle.id, newS]);

      // Ba'zi loyihalar oyning o'rtasidan boshlangan — joriy davr sanasi
      // noto'g'ri kiritilgan bo'lishi mumkin. Tuzatilsa: bugungi davr
      // yangi kundan boshlab qayta hisoblanadi VA loyihaning anchor_date'i
      // ham shu kunga moslab suriladi — shu bilan KEYINGI davrlar ham
      // to'g'ri kundan boshlanadi (faqat o'tgan/yopilgan davrlar
      // o'zgarishsiz qoladi).
      if (periodStart && periodStart !== cycle.period_start) {
        if (cycle.cycle_index > 1) {
          const prevR = await db.query(
            `select period_end from project_cycles where project_id = $1 and cycle_index = $2`,
            [project.id, cycle.cycle_index - 1],
          );
          if (prevR.rows[0] && periodStart <= prevR.rows[0].period_end) {
            return res.status(400).json({ error: "Boshlanish sanasi oldingi davr tugashidan keyin bo'lishi kerak" });
          }
        }
        const newAnchor = addMonthsClamped(periodStart, -(cycle.cycle_index - 1));
        const bounds = cycleBounds(newAnchor, cycle.cycle_index);
        // Muhim: agar tuzatilgan davr tugash sanasi allaqachon o'tib
        // ketgan bo'lsa, keyingi ensureCurrentCycle() chaqiruvida bu davr
        // darhol "qarz" bilan yopib yuboriladi — sana xato kiritilgani
        // uchun jamoa hali maqsadga yeta olmagani adolatsiz hisoblanadi.
        // Shuning uchun bunday holatda tuzatishga yo'l qo'yilmaydi.
        if (bounds.periodEnd < todayTashkent()) {
          return res
            .status(400)
            .json({ error: "Bu sana bilan davr allaqachon tugagan bo'lardi — loyiha qarz hisobiga tushib qolmasligi uchun kechroq sana tanlang" });
        }
        await db.query(`update projects set anchor_date = $1 where id = $2`, [newAnchor, project.id]);
        await db.query(`update project_cycles set period_start = $1, period_end = $2 where id = $3`, [
          bounds.periodStart,
          bounds.periodEnd,
          cycle.id,
        ]);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Loyiha oyning o'rtasidan boshlangan, lekin davr chegarasi noto'g'ri
// (masalan to'liq kalendar-oy) qo'yilgani uchun OLDINGI davr allaqachon
// "qarz" bilan yopilib ulgurgan bo'lsa — shu yerda tuzatiladi. Faqat
// eng OXIRGI yopilgan davr uchun (joriy davrdan bevosita oldingi) va
// faqat joriy davrda hali hech narsa belgilanmagan bo'lsa (xavfsizlik —
// aks holda ikki davrni "birlashtirish" noaniq bo'lib qoladi). Agar
// to'g'irlangan sana bilan haqiqiy muddat hali o'tmagan bo'lsa (bugungi
// kundan keyin tugaydi) — oldingi davr qayta ochiladi va "qarz" belgisi
// olib tashlanadi (joriy davr esa, hali bo'sh bo'lgani uchun, shunchaki
// o'chiriladi). Aks holda — bu tuzatish qarz holatini o'zgartirmasligi
// aniq bo'lgani uchun rad etiladi.
app.post("/api/projects/:slug/fix-previous-cycle", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const projR = await db.query(`select * from projects where slug = $1 and is_active = true`, [
      req.params.slug,
    ]);
    const project = projR.rows[0];
    if (!project) return res.status(404).json({ error: "Loyiha topilmadi" });

    const periodStart = (req.body.periodStart || "").trim();
    if (!periodStart) return res.status(400).json({ error: "Sana kerak" });

    const active = await getActiveCycle(db, project.id);
    if (!active) return res.status(400).json({ error: "Joriy davr topilmadi" });
    if (active.cycle_index <= 1) {
      return res.status(400).json({ error: "Bu birinchi davr — undan oldingi davr yo'q" });
    }
    const { doneK, doneS } = await countDoneChecks(db, active.id);
    if (doneK > 0 || doneS > 0) {
      return res.status(400).json({ error: "Joriy davrda allaqachon belgilar bor — bu tuzatish endi qo'llanilmaydi" });
    }

    const prevR = await db.query(
      `select * from project_cycles where project_id = $1 and cycle_index = $2`,
      [project.id, active.cycle_index - 1],
    );
    const prev = prevR.rows[0];
    if (!prev || prev.status !== "closed") {
      return res.status(400).json({ error: "Oldingi yopilgan davr topilmadi" });
    }

    if (prev.cycle_index > 1) {
      const prevPrevR = await db.query(
        `select period_end from project_cycles where project_id = $1 and cycle_index = $2`,
        [project.id, prev.cycle_index - 1],
      );
      if (prevPrevR.rows[0] && periodStart <= prevPrevR.rows[0].period_end) {
        return res.status(400).json({ error: "Boshlanish sanasi undan oldingi davr tugashidan keyin bo'lishi kerak" });
      }
    }

    const newAnchor = addMonthsClamped(periodStart, -(prev.cycle_index - 1));
    const bounds = cycleBounds(newAnchor, prev.cycle_index);
    if (bounds.periodEnd < todayTashkent()) {
      return res
        .status(400)
        .json({ error: "Bu sana bilan ham davr allaqachon tugagan bo'lardi — qarz holati o'zgarmaydi" });
    }

    await db.withTransaction(async (client) => {
      await client.query(`delete from project_cycles where id = $1`, [active.id]);
      await client.query(
        `update project_cycles
         set period_start = $1, period_end = $2, status = 'active', is_debt = false, closed_at = null
         where id = $3`,
        [bounds.periodStart, bounds.periodEnd, prev.id],
      );
      await client.query(`update projects set anchor_date = $1 where id = $2`, [newAnchor, project.id]);
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Loyihani arxivlash (yumshoq o'chirish). Tarixiy davrlar/belgilar
// saqlanib qoladi — faqat yangi davrlar ochilishi to'xtaydi.
app.delete("/api/projects/:slug", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const projR = await db.query(`select * from projects where slug = $1 and is_active = true`, [
      req.params.slug,
    ]);
    const project = projR.rows[0];
    if (!project) return res.status(404).json({ error: "Loyiha topilmadi" });
    await db.query(`update projects set is_active = false where id = $1`, [project.id]);
    const active = await getActiveCycle(db, project.id);
    if (active) await closeCycle(db, active.id);
    res.json({ ok: true, archived: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CHECKS — post/stories belgisini yoqish/o'chirish ────────────────
app.patch("/api/checks", auth, async (req, res) => {
  try {
    const { projectSlug, type, seqNumber, checked, cycleId } = req.body;
    // Yangi (ixtiyoriy) maydonlar: kim montaj qildi, kim video oldi,
    // va ish qaysi kuni bajarildi (kalendar shu sana bo'yicha chiziladi).
    const editorId = req.body.editorId || null;
    const videographerId = req.body.videographerId || null;
    const workDate = req.body.workDate || null;
    if (workDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(workDate))) {
      return res.status(400).json({ error: "workDate formati: YYYY-MM-DD" });
    }
    if (!projectSlug || !["k", "s"].includes(type) || !seqNumber) {
      return res.status(400).json({ error: "projectSlug, type, seqNumber majburiy" });
    }

    const projR = await db.query(`select * from projects where slug = $1`, [projectSlug]);
    const project = projR.rows[0];
    if (!project) return res.status(404).json({ error: "Loyiha topilmadi" });

    const isAdm = isAdminRole(req.user.role);
    if (!isAdm) {
      const permR = await db.query(
        `select 1 from permissions where user_id = $1 and project_id = $2`,
        [req.user.id, project.id],
      );
      if (!permR.rows[0]) {
        return res.status(403).json({ error: `"${project.label}" uchun ruxsat yo'q`, code: "NO_PROJECT_PERMISSION" });
      }
    }

    let cycle;
    if (cycleId) {
      // Eski (yopilgan) davrga qaytib "qarz yopish" — ataylab ruxsat beriladi
      cycle = await getCycleById(db, cycleId);
      if (!cycle || cycle.project_id !== project.id) {
        return res.status(404).json({ error: "Davr topilmadi" });
      }
    } else {
      const ensured = await ensureCurrentCycle(db, project);
      cycle = ensured.cycle;
    }

    const seq = parseInt(seqNumber);
    const targetCount = type === "k" ? cycle.posts_target : cycle.stories_target;
    if (!(seq >= 1 && seq <= targetCount)) {
      return res.status(400).json({ error: "seqNumber chegaradan tashqarida" });
    }

    if (checked) {
      // Qayta belgilanganda ham tafsilotlar yangilanadi (modal qayta ochilsa)
      await db.query(
        `insert into checks (cycle_id, type, seq_number, done_by, editor_id, videographer_id, work_date)
         values ($1,$2,$3,$4,$5,$6, coalesce($7::date, $8::date))
         on conflict (cycle_id, type, seq_number) do update
           set editor_id       = excluded.editor_id,
               videographer_id = excluded.videographer_id,
               work_date       = excluded.work_date`,
        [
          cycle.id,
          type,
          seq,
          req.user.id,
          editorId,
          videographerId,
          workDate,
          todayTashkent(),
        ],
      );
    } else {
      await db.query(`delete from checks where cycle_id = $1 and type = $2 and seq_number = $3`, [
        cycle.id,
        type,
        seq,
      ]);
    }

    if (cycle.status === "closed") {
      cycle = await recomputeDebtIfClosed(db, cycle.id);
    }

    const { doneK, doneS } = await countDoneChecks(db, cycle.id);

    // Bildirishnoma javob bilan BIRGA kutiladi (serverless'da yo'qolmasligi uchun)
    await notifyCheckChange(db, {
      actorUsername: req.user.username,
      project,
      cycle,
      type,
      seqNumber: seq,
      checked: !!checked,
      doneK,
      doneS,
    }).catch((e) => console.error("Bildirishnoma xatosi:", e.message));

    res.json({ ok: true, checked: !!checked, doneK, doneS, cycleStatus: cycle.status, isDebt: cycle.is_debt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TASKS — muayyan xodimga biriktirilgan, muddati bor vazifalar ────
const TASK_ROW_SQL = `
  select
    t.id, t.title, t.description, t.due_date, t.status, t.reason, t.priority,
    t.created_at, t.updated_at, t.completed_at,
    p.slug as project_slug, p.label as project_label,
    au.username as assignee_username,
    coalesce(au.full_name, au.username) as assignee_user_name,
    ast.full_name as assignee_staff_name,
    cu.username as created_by_username
  from tasks t
  left join projects p on p.id = t.project_id
  left join users au on au.id = t.assignee_user_id
  left join staff ast on ast.id = t.assignee_staff_id
  left join users cu on cu.id = t.created_by
`;
function shapeTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    status: row.status,
    reason: row.reason,
    priority: row.priority,
    projectSlug: row.project_slug,
    projectLabel: row.project_label,
    assigneeUsername: row.assignee_username || null,
    assigneeName: row.assignee_user_name || row.assignee_staff_name || null,
    createdByUsername: row.created_by_username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    tags: [],
  };
}

// Bir nechta vazifaga tegishli taglarni BITTA so'rov bilan olib, har bir
// shaped task'ga `tags: [{id,name}]` qilib biriktiradi (N+1 so'rovsiz).
async function attachTags(tasks) {
  if (!tasks.length) return tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const r = await db.query(
    `select tt.task_id, tg.id, tg.name
     from task_tags tt join tags tg on tg.id = tt.tag_id
     where tt.task_id = any($1::uuid[])`,
    [tasks.map((t) => t.id)],
  );
  r.rows.forEach((row) => {
    const t = byId.get(row.task_id);
    if (t) t.tags.push({ id: row.id, name: row.name });
  });
  return tasks;
}

// Yangi vazifaga taglarni biriktiradi (yaratishda) — tagIds mavjud
// tags jadvalidagi id'lar bo'lishi shart, aks holda e'tiborsiz qoldiriladi.
async function setTaskTags(taskId, tagIds) {
  await db.query(`delete from task_tags where task_id = $1`, [taskId]);
  const ids = Array.isArray(tagIds) ? [...new Set(tagIds)].filter(Boolean) : [];
  if (!ids.length) return;
  const valid = await db.query(`select id from tags where id = any($1::uuid[])`, [ids]);
  for (const row of valid.rows) {
    await db.query(`insert into task_tags (task_id, tag_id) values ($1,$2) on conflict do nothing`, [
      taskId,
      row.id,
    ]);
  }
}

async function logTaskActivity(taskId, actorUserId, kind, { body, detail } = {}) {
  await db.query(
    `insert into task_activity (task_id, actor_user_id, kind, body, detail) values ($1,$2,$3,$4,$5)`,
    [taskId, actorUserId || null, kind, body || null, detail || null],
  );
}

// Vazifalar bo'limidagi barcha o'zgarishlar HAMMAGA ko'rinadi (faqat
// admin emas) — kim nima ustida ishlayotgani va statuslar jamoaviy
// shaffoflik uchun ochiq. Tahrirlash/status o'zgartirish huquqi bundan
// mustaqil — u har bir endpoint'ning o'z ichida (masalan PATCH'dagi
// `existing.assignee_user_id !== req.user.id` tekshiruvi) saqlanadi.
app.get("/api/tasks", auth, async (req, res) => {
  try {
    const conds = [];
    const values = [];
    if (req.query.project) {
      values.push(req.query.project);
      conds.push(`p.slug = $${values.length}`);
    }
    if (req.query.status) {
      values.push(req.query.status);
      conds.push(`t.status = $${values.length}`);
    }
    const where = conds.length ? `where ${conds.join(" and ")}` : "";
    const r = await db.query(
      `${TASK_ROW_SQL} ${where} order by (t.status in ('done','cancelled')), t.due_date nulls last, t.created_at desc`,
      values,
    );
    const tasks = await attachTags(r.rows.map(shapeTaskRow));
    res.json({ tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/tasks", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const title = (req.body.title || "").trim();
    if (!title) return res.status(400).json({ error: "title kerak" });
    const description = (req.body.description || "").trim() || null;
    const status = req.body.status === "backlog" ? "backlog" : "todo";
    const dueDate = req.body.dueDate || null;
    // Backlog — hali navbatga qo'yilmagan, muddat keyinroq ("To Do"ga
    // o'tkazilganda) kiritiladi. Boshqa har qanday holatda muddat shart.
    if (status !== "backlog" && !dueDate) return res.status(400).json({ error: "Muddat (dueDate) kerak" });
    const priority = req.body.priority || "no_priority";
    if (!["urgent", "high", "medium", "low", "no_priority"].includes(priority)) {
      return res.status(400).json({ error: "Noto'g'ri priority" });
    }

    let projectId = null;
    if (req.body.projectSlug) {
      const pr = await db.query(`select id from projects where slug = $1`, [req.body.projectSlug]);
      if (!pr.rows[0]) return res.status(404).json({ error: "Loyiha topilmadi" });
      projectId = pr.rows[0].id;
    }

    let assigneeUserId = null;
    let assigneeStaffId = null;
    if (req.body.assigneeUsername) {
      const ur = await db.query(`select id from users where username = $1`, [
        String(req.body.assigneeUsername).toLowerCase().replace("@", ""),
      ]);
      if (!ur.rows[0]) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      assigneeUserId = ur.rows[0].id;
    } else if (req.body.assigneeStaffId) {
      assigneeStaffId = req.body.assigneeStaffId;
    }

    const ins = await db.query(
      `insert into tasks (project_id, title, description, assignee_user_id, assignee_staff_id, due_date, created_by, status, priority)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [projectId, title, description, assigneeUserId, assigneeStaffId, dueDate, req.user.id, status, priority],
    );
    const taskId = ins.rows[0].id;

    await setTaskTags(taskId, req.body.tagIds);
    await logTaskActivity(taskId, req.user.id, "created");

    const r = await db.query(`${TASK_ROW_SQL} where t.id = $1`, [taskId]);
    const [task] = await attachTags([shapeTaskRow(r.rows[0])]);

    // "Telegramga xabar yuborilsin" belgisi — yangi vazifa formasidagi
    // checkbox orqali o'chirilishi mumkin (standart holatda yuboriladi).
    // Natija javobga qo'shiladi — frontend xabar bormaganini (masalan
    // xodim botni hali ochmagani uchun) admin'ga darhol ko'rsatadi.
    let notify = { attempted: false, ok: false, reason: "not_applicable" };
    if (assigneeUserId && req.body.notifyTelegram !== false) {
      notify = await notifyTaskAssigned(db, { assigneeUserId, task, actorUsername: req.user.username }).catch((e) => {
        console.error("Task bildirishnomasi xatosi:", e.message);
        return { attempted: true, ok: false, reason: e.message };
      });
    }

    // Jamoaviy bildirishnoma — Vazifalar bo'limidagi barcha o'zgarishlar
    // hammaga ko'rinishi kerak degan talab bo'yicha, yangi vazifa
    // yaratilgani haqida (mas'uldan tashqari — u yuqorida o'zining
    // batafsil xabarini oldi).
    if (req.body.notifyTelegram !== false) {
      const teamText =
        `📋 <b>@${req.user.username}</b> yangi vazifa yaratdi` +
        (task.assigneeName ? ` — <b>${task.assigneeName}</b>ga` : "") +
        `\n${task.title}` +
        (task.dueDate ? `\n📅 Muddat: ${task.dueDate}` : "");
      notifyTeamTaskEvent(db, {
        excludeUserIds: assigneeUserId ? [assigneeUserId] : [],
        excludeUsernames: [req.user.username],
        text: teamText,
        taskId: task.id,
      }).catch((e) => console.error("Jamoaviy bildirishnoma xatosi:", e.message));
    }

    res.json({ ok: true, task, notify });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/tasks/:id", auth, async (req, res) => {
  try {
    const existingR = await db.query(`select * from tasks where id = $1`, [req.params.id]);
    const existing = existingR.rows[0];
    if (!existing) return res.status(404).json({ error: "Vazifa topilmadi" });
    // Activity uchun "oldin" holatini (odam o'qiy oladigan shaklda,
    // TASK_ROW_SQL orqali) update'dan oldin saqlab qo'yamiz.
    const beforeR = await db.query(`${TASK_ROW_SQL} where t.id = $1`, [req.params.id]);
    const before = shapeTaskRow(beforeR.rows[0]);
    // reassigned-bildirishnoma uchun — assigneeUsername berilganda shu
    // yerga yoziladi (RAW ID kerak, TASK_ROW_SQL'da assignee_user_id yo'q).
    let newAssigneeUserId = null;

    const isAdm = isAdminRole(req.user.role);
    if (!isAdm) {
      if (existing.assignee_user_id !== req.user.id) {
        return res.status(403).json({ error: "Bu vazifa sizga biriktirilmagan" });
      }
      if (typeof req.body.status !== "string") {
        return res.status(400).json({ error: "Faqat status o'zgartirishga ruxsat bor" });
      }
    }

    const sets = ["updated_at = now()"];
    const values = [];
    if (isAdm) {
      if (typeof req.body.title === "string") {
        values.push(req.body.title.trim());
        sets.push(`title = $${values.length}`);
      }
      if (typeof req.body.description === "string") {
        values.push(req.body.description.trim() || null);
        sets.push(`description = $${values.length}`);
      }
      if (typeof req.body.dueDate !== "undefined") {
        values.push(req.body.dueDate || null);
        sets.push(`due_date = $${values.length}`);
      }
      if (typeof req.body.priority === "string") {
        if (!["urgent", "high", "medium", "low", "no_priority"].includes(req.body.priority)) {
          return res.status(400).json({ error: "Noto'g'ri priority" });
        }
        values.push(req.body.priority);
        sets.push(`priority = $${values.length}`);
      }
      if (typeof req.body.projectSlug !== "undefined") {
        let projectId = null;
        if (req.body.projectSlug) {
          const pr = await db.query(`select id from projects where slug = $1`, [req.body.projectSlug]);
          if (!pr.rows[0]) return res.status(404).json({ error: "Loyiha topilmadi" });
          projectId = pr.rows[0].id;
        }
        values.push(projectId);
        sets.push(`project_id = $${values.length}`);
      }
      if (typeof req.body.assigneeUsername !== "undefined" || typeof req.body.assigneeStaffId !== "undefined") {
        let assigneeStaffId = null;
        if (req.body.assigneeUsername) {
          const ur = await db.query(`select id from users where username = $1`, [
            String(req.body.assigneeUsername).toLowerCase().replace("@", ""),
          ]);
          if (!ur.rows[0]) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
          newAssigneeUserId = ur.rows[0].id;
        } else if (req.body.assigneeStaffId) {
          assigneeStaffId = req.body.assigneeStaffId;
        }
        values.push(newAssigneeUserId);
        sets.push(`assignee_user_id = $${values.length}`);
        values.push(assigneeStaffId);
        sets.push(`assignee_staff_id = $${values.length}`);
      }
      if (typeof req.body.tagIds !== "undefined") {
        await setTaskTags(req.params.id, req.body.tagIds);
      }
    }
    if (typeof req.body.status === "string") {
      if (!["backlog", "todo", "in_progress", "review", "done", "failed", "cancelled"].includes(req.body.status)) {
        return res.status(400).json({ error: "Noto'g'ri status" });
      }
      // Backlog'dan chiqqanda ("bitiruv" — Linear'dagi kabi) muddat shart
      // bo'lib qoladi. Vazifada hali muddat yo'q bo'lsa, shu so'rovda
      // berilishi kerak — o'ziga biriktirilgan xodim ham (admin bo'lmasa
      // ham) shu bitta holatda muddatni kirita oladi, chunki ishni
      // boshlashga qaror qilayotgan aynan o'sha.
      const needsDueDate = ["todo", "in_progress", "review"].includes(req.body.status);
      const effectiveDueDate = existing.due_date || (typeof req.body.dueDate !== "undefined" ? req.body.dueDate : null);
      if (needsDueDate && !effectiveDueDate) {
        return res.status(400).json({ error: "Muddat (dueDate) kerak" });
      }
      if (!isAdm && !existing.due_date && req.body.dueDate) {
        values.push(req.body.dueDate);
        sets.push(`due_date = $${values.length}`);
      }
      const reason = String(req.body.reason || "").trim() || null;
      if (req.body.status === "failed" && !reason) {
        return res.status(400).json({ error: "Bajarilmagan sababi yozilishi shart" });
      }
      values.push(req.body.status);
      sets.push(`status = $${values.length}`);
      values.push(req.body.status === "failed" ? reason : null);
      sets.push(`reason = $${values.length}`);
      sets.push(`completed_at = ${["done", "failed"].includes(req.body.status) ? "now()" : "null"}`);
    }

    values.push(req.params.id);
    await db.query(`update tasks set ${sets.join(", ")} where id = $${values.length}`, values);

    const r = await db.query(`${TASK_ROW_SQL} where t.id = $1`, [req.params.id]);
    const [task] = await attachTags([shapeTaskRow(r.rows[0])]);

    // ── Activity: faqat haqiqatan o'zgargan maydonlar uchun yoziladi.
    // status/priority — enum qiymatlarining o'zi saqlanadi (frontend
    // TASK_STATUS_LABEL/TASK_PRIORITY_LABEL orqali formatlaydi), muddat —
    // xom ISO sana (frontend fmtDay bilan formatlaydi), mas'ul esa
    // tayyor inson-o'qiydigan ism (frontendda ID→ism xaritasi yo'q).
    if (task.status !== before.status) {
      await logTaskActivity(req.params.id, req.user.id, "status_change", {
        detail: `${before.status}:${task.status}`,
      });
      // Jamoaviy bildirishnoma — status o'zgarishi ham hammaga ko'rinishi
      // kerak degan talab bo'yicha (o'zgartirgan kishidan tashqari).
      if (req.body.notifyTelegram !== false) {
        const teamText =
          `🔄 <b>@${req.user.username}</b>: <b>${task.title}</b>\n` +
          `${TASK_STATUS_LABEL_UZ[before.status] || before.status} → ${TASK_STATUS_LABEL_UZ[task.status] || task.status}` +
          (task.assigneeName ? `\n👤 ${task.assigneeName}` : "");
        notifyTeamTaskEvent(db, { excludeUsernames: [req.user.username], text: teamText, taskId: task.id }).catch((e) =>
          console.error("Jamoaviy bildirishnoma xatosi:", e.message),
        );
      }
    }
    if (task.priority !== before.priority) {
      await logTaskActivity(req.params.id, req.user.id, "priority_change", {
        detail: `${before.priority}:${task.priority}`,
      });
    }
    if ((task.dueDate || "") !== (before.dueDate || "")) {
      await logTaskActivity(req.params.id, req.user.id, "deadline_change", {
        detail: `${before.dueDate || ""}:${task.dueDate || ""}`,
      });
    }
    if ((task.assigneeName || "") !== (before.assigneeName || "")) {
      await logTaskActivity(req.params.id, req.user.id, "assignment_change", {
        detail: `${before.assigneeName || "Biriktirilmagan"}:${task.assigneeName || "Biriktirilmagan"}`,
      });
    }

    const reassigned =
      isAdm &&
      typeof req.body.assigneeUsername !== "undefined" &&
      newAssigneeUserId &&
      newAssigneeUserId !== existing.assignee_user_id;
    let notify = { attempted: false, ok: false, reason: "not_applicable" };
    if (reassigned && req.body.notifyTelegram !== false) {
      notify = await notifyTaskAssigned(db, {
        assigneeUserId: newAssigneeUserId,
        task,
        actorUsername: req.user.username,
      }).catch((e) => {
        console.error("Task bildirishnomasi xatosi:", e.message);
        return { attempted: true, ok: false, reason: e.message };
      });
      const teamText = `👤 <b>@${req.user.username}</b>: <b>${task.title}</b> vazifasi ${task.assigneeName || "boshqa xodim"}ga qayta biriktirildi`;
      notifyTeamTaskEvent(db, {
        excludeUserIds: [newAssigneeUserId],
        excludeUsernames: [req.user.username],
        text: teamText,
        taskId: task.id,
      }).catch((e) => console.error("Jamoaviy bildirishnoma xatosi:", e.message));
    }

    res.json({ ok: true, task, notify });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/tasks/:id", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await db.query(`delete from tasks where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TAGLAR ─────────────────────────────────────────────────────────
app.get("/api/tags", auth, async (req, res) => {
  try {
    const r = await db.query(`select id, name from tags order by name`);
    res.json({ tags: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/tags", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Tag nomi kerak" });
    const ins = await db
      .query(`insert into tags (name) values ($1) returning id, name`, [name])
      .catch((e) => {
        if (e.code === "23505") return null; // unique violation — allaqachon mavjud
        throw e;
      });
    if (!ins) {
      const existing = await db.query(`select id, name from tags where name = $1`, [name]);
      return res.status(409).json({ error: "Bunday tag allaqachon mavjud", tag: existing.rows[0] });
    }
    res.json({ ok: true, tag: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LOYIHA SHABLONLARI ("Yangi loyiha" modalidagi "Shablondan") ────
app.get("/api/project-templates", auth, async (req, res) => {
  try {
    const r = await db.query(
      `select id, name, posts_target, stories_target from project_templates order by name`,
    );
    res.json({
      templates: r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        postsTarget: row.posts_target,
        storiesTarget: row.stories_target,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/project-templates", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const name = (req.body.name || "").trim();
    const postsTarget = parseInt(req.body.postsTarget);
    const storiesTarget = parseInt(req.body.storiesTarget);
    if (!name) return res.status(400).json({ error: "Shablon nomi kerak" });
    if (!Number.isFinite(postsTarget) || postsTarget < 0 || !Number.isFinite(storiesTarget) || storiesTarget < 0) {
      return res.status(400).json({ error: "Post/stories soni noto'g'ri" });
    }
    const ins = await db
      .query(
        `insert into project_templates (name, posts_target, stories_target, created_by)
         values ($1,$2,$3,$4) returning id, name, posts_target, stories_target`,
        [name, postsTarget, storiesTarget, req.user.id],
      )
      .catch((e) => {
        if (e.code === "23505") return null;
        throw e;
      });
    if (!ins) return res.status(409).json({ error: "Bunday nomdagi shablon allaqachon mavjud" });
    const row = ins.rows[0];
    res.json({
      ok: true,
      template: { id: row.id, name: row.name, postsTarget: row.posts_target, storiesTarget: row.stories_target },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/project-templates/:id", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await db.query(`delete from project_templates where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── VAZIFA ACTIVITY / IZOHLAR ─────────────────────────────────────
// Vazifani ko'rish huquqi bilan bir xil: admin yoki shu vazifaning
// o'ziga biriktirilgan xodimi.
// Izoh QOLDIRISH huquqi — faqat admin yoki vazifaning o'z mas'uli
// (ko'rish huquqidan mustaqil: hamma ko'radi, lekin hamma yozolmaydi —
// aks holda aloqasi yo'q xodimlar bir-birining vazifalariga izoh
// yozib chiqishi mumkin bo'lib qolardi).
async function canCommentOnTask(req, taskId) {
  const r = await db.query(`select assignee_user_id from tasks where id = $1`, [taskId]);
  if (!r.rows[0]) return { ok: false, status: 404, error: "Vazifa topilmadi" };
  if (isAdminRole(req.user.role) || r.rows[0].assignee_user_id === req.user.id) return { ok: true };
  return { ok: false, status: 403, error: "Bu vazifaga izoh qoldira olmaysiz" };
}

// Izoh/tarixni KO'RISH — Vazifalar bo'limidagi barcha o'zgarishlar
// hammaga ko'rinishi kerak degan talab bo'yicha, har qanday autentifikatsiya
// qilingan foydalanuvchiga ochiq (faqat vazifa mavjudligi tekshiriladi).
app.get("/api/tasks/:id/activity", auth, async (req, res) => {
  try {
    const exists = await db.query(`select 1 from tasks where id = $1`, [req.params.id]);
    if (!exists.rows[0]) return res.status(404).json({ error: "Vazifa topilmadi" });
    const r = await db.query(
      `select ta.id, ta.kind, ta.body, ta.detail, ta.created_at,
              u.username as actor_username, coalesce(u.full_name, u.username) as actor_name
       from task_activity ta
       left join users u on u.id = ta.actor_user_id
       where ta.task_id = $1
       order by ta.created_at asc`,
      [req.params.id],
    );
    res.json({
      activity: r.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        body: row.body,
        detail: row.detail,
        createdAt: row.created_at,
        actorUsername: row.actor_username,
        actorName: row.actor_name,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/tasks/:id/comments", auth, async (req, res) => {
  try {
    const access = await canCommentOnTask(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const text = (req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Izoh matni kerak" });
    await logTaskActivity(req.params.id, req.user.id, "comment", { body: text });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DAVR ROLLOVER (kunlik cron uchun, lekin qo'lda ham chaqirilishi mumkin) ─
app.post("/api/cycles/rollover", async (req, res) => {
  const access = await resolveCronOrAdminCaller(req);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  try {
    const projR = await db.query(`select * from projects where is_active = true`);
    const events = [];
    for (const project of projR.rows) {
      const { cycle, closedNow } = await ensureCurrentCycle(db, project);
      for (const closed of closedNow) {
        events.push({ project: project.label, cycleIndex: closed.cycle_index, isDebt: closed.is_debt });
        const text = closed.is_debt
          ? `⚠️ <b>${project.label}</b> — ${closed.cycle_index}-davr yakunlandi, lekin TO'LIQ bajarilmadi (qarz qoldi).`
          : `✅ <b>${project.label}</b> — ${closed.cycle_index}-davr to'liq bajarilgan holda yakunlandi! 🎉`;
        const recipients = await resolveRecipients(db, "__system__", project.id);
        await Promise.allSettled(recipients.map((r) => sendMsg(db, r.chatId, text, { replyMarkup: appOpenButton() })));
      }
      if (closedNow.length > 0) {
        const newText = `🆕 <b>${project.label}</b> — yangi davr boshlandi (${cycle.period_start} – ${cycle.period_end}).`;
        const recipients = await resolveRecipients(db, "__system__", project.id);
        await Promise.allSettled(recipients.map((r) => sendMsg(db, r.chatId, newText, { replyMarkup: appOpenButton() })));
      }
    }
    res.json({ ok: true, caller: access.caller, projectsChecked: projR.rows.length, events });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PACING ESLATMASI (haftalik/davriy — eski /api/weekly-reminder o'rnini bosadi) ─
app.post("/api/reminder/run", async (req, res) => {
  const access = await resolveCronOrAdminCaller(req, { requireSuper: true });
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  try {
    const projR = await db.query(`select * from projects where is_active = true`);
    const today = todayTashkent();
    const allUsersR = await db.query(
      `select id, username, role, telegram_chat_id from users where telegram_chat_id is not null and is_active`,
    );

    const perUser = {}; // username -> { chatId, stats: [] }

    for (const project of projR.rows) {
      const summary = await getProjectCycleSummary(db, project);
      const cycle = summary.cycle;
      const remK = cycle.posts_target - summary.doneK;
      const remS = cycle.stories_target - summary.doneS;
      if (remK <= 0 && remS <= 0) continue; // bu loyiha to'liq — eslatma shart emas

      const daysLeft = Math.max(1, dayDiff(today, cycle.period_end) + 1);
      const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
      const weekK = Math.ceil(Math.max(0, remK) / weeksLeft);
      const weekS = Math.ceil(Math.max(0, remS) / weeksLeft);
      const overallP = pct(summary.doneK + summary.doneS, cycle.posts_target + cycle.stories_target);

      const permR = await db.query(`select user_id from permissions where project_id = $1`, [project.id]);
      const allowedUserIds = new Set(permR.rows.map((r) => r.user_id));

      for (const u of allUsersR.rows) {
        const isAdm = u.role === "super_admin" || u.role === "admin";
        if (!isAdm && !allowedUserIds.has(u.id)) continue;
        if (!perUser[u.username]) perUser[u.username] = { chatId: u.telegram_chat_id, stats: [] };
        perUser[u.username].stats.push({
          label: project.label,
          remK,
          remS,
          weekK,
          weekS,
          overallP,
          periodEnd: cycle.period_end,
        });
      }
    }

    // Muddati o'tgan (yoki bugun tugaydigan) vazifalar bo'yicha eslatma
    const overdueR = await db.query(
      `select t.title, t.due_date, u.username, u.telegram_chat_id
       from tasks t join users u on u.id = t.assignee_user_id
       where t.status not in ('done','cancelled') and t.due_date is not null
         and t.due_date <= $1 and u.telegram_chat_id is not null and u.is_active`,
      [today],
    );
    const overdueByUser = {};
    overdueR.rows.forEach((row) => {
      (overdueByUser[row.username] ||= { chatId: row.telegram_chat_id, items: [] }).items.push(row);
    });

    const results = [];
    const sends = [];
    for (const [username, { chatId, stats }] of Object.entries(perUser)) {
      if (stats.length === 0) continue;
      const text = buildPacingMessage(stats);
      sends.push(
        sendMsg(db, chatId, text, { replyMarkup: appOpenButton() })
          .then(() => results.push({ username, status: "sent" }))
          .catch((e) => results.push({ username, status: "error", error: e.message })),
      );
    }
    for (const [username, { chatId, items }] of Object.entries(overdueByUser)) {
      const lines = items
        .map((it) => `⏰ <b>${it.title}</b> — muddati: ${it.due_date} (o'tgan/bugun)`)
        .join("\n");
      const text = `📋 <b>Vazifalar bo'yicha eslatma</b>\n─────────────────\n\n${lines}`;
      sends.push(
        sendMsg(db, chatId, text, { replyMarkup: appOpenButton("?tab=tasks") })
          .then(() => results.push({ username, status: "sent", kind: "task" }))
          .catch((e) => results.push({ username, status: "error", error: e.message, kind: "task" })),
      );
    }
    await Promise.allSettled(sends);

    res.json({
      ok: true,
      caller: access.caller,
      total: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── BILDIRISHNOMALAR JURNALI (admin, faqat o'qish) ───────────────────
app.get("/api/notifications", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await db.query(
      `select id, chat_id, message, status, error, created_at
       from notification_log order by created_at desc limit 50`,
    );
    res.json({ notifications: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DEBUG / TEST ─────────────────────────────────────────────────────
app.get("/api/debug", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const counts = await db.query(`select
        (select count(*) from projects where is_active = true) as projects,
        (select count(*) from project_cycles) as cycles,
        (select count(*) from checks) as checks,
        (select count(*) from users) as users`);
    res.json({
      ok: true,
      env: {
        BOT_TOKEN: process.env.BOT_TOKEN ? "✅" : "❌ YOQ",
        DATABASE_URL: process.env.DATABASE_URL ? "✅" : "❌ YOQ",
        ADMIN_CHAT_IDS: process.env.ADMIN_CHAT_IDS || process.env.ALL_CHAT_IDS ? "✅" : "❌ YOQ",
        CRON_SECRET: process.env.CRON_SECRET ? "✅" : "❌ YOQ",
      },
      counts: counts.rows[0],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/test-notify", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!process.env.BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN yo'q" });
  const text = `🔔 <b>Test xabar</b>\n✅ Nasaf Digital (Postgres) ishlayapti!\n👤 Admin: @${req.user.username}`;
  const envIds = (process.env.ADMIN_CHAT_IDS || process.env.ALL_CHAT_IDS || "")
    .replace(/['"]/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
  const usersR = await db.query(`select username, telegram_chat_id from users where telegram_chat_id is not null`);
  const sent = [];
  const sends = [];
  envIds.forEach((id) => sends.push(sendMsg(db, id, text, { replyMarkup: appOpenButton() }).then(() => sent.push(id))));
  usersR.rows.forEach((u) => {
    if (!envIds.includes(String(u.telegram_chat_id))) {
      sends.push(
        sendMsg(db, u.telegram_chat_id, text, { replyMarkup: appOpenButton() }).then(() =>
          sent.push(`${u.username}:${u.telegram_chat_id}`),
        ),
      );
    }
  });
  await Promise.allSettled(sends);
  res.json({ ok: true, sent_to: sent });
});

// Netlify Functions handler + lokal test/skriptlar uchun `app`ning o'zi
module.exports = app;
module.exports.handler = serverless(app);
