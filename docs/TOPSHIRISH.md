# Loyihaga qo'shilish — birinchi kun

Nasaf Digital'ning ikki loyihasi bilan ishlashni boshlayotgan odam
uchun. Tartib bilan bajaring.

## 1. Kirish huquqlari (egasi beradi)

| Nima | Qanday |
|---|---|
| GitHub | `shaxzod-muhandis/Nasaf-digital-Tracker` va `shaxzod-muhandis/Nasaf-Statistics` ga collaborator |
| Vercel | Jamoaga a'zo — env qiymatlari shu orqali olinadi |
| Supabase | Loyihaga a'zo (yoki faqat alohida test baza) |
| Telegram | Tracker'da xodim sifatida qo'shilish (ilovani ochish uchun) |

Maxfiy qiymatlar (`.env`) chat yoki fayl orqali yuborilmaydi — har kim
o'zi `vercel env pull` qiladi.

## 2. O'rnatish

```bash
git clone git@github.com:shaxzod-muhandis/Nasaf-digital-Tracker.git nasaf-tracker
git clone git@github.com:shaxzod-muhandis/Nasaf-Statistics.git nasaf-wall-screen

cd nasaf-tracker && npm install && vercel link && vercel env pull && npm run env:check
cd ../nasaf-wall-screen && npm install && vercel link && vercel env pull .env
```

Ikkala papkani **yonma-yon** qo'ying — hujjatlar bir-biriga
`nasaf-wall-screen/...` deb murojaat qiladi.

Testlar uchun Supabase'da alohida bo'sh loyiha oching va
`nasaf-tracker/.env.local` ga `TEST_DATABASE_URL` qo'shing, keyin
`npm run db:migrate:test`.

## 3. O'qish tartibi

1. `nasaf-tracker/CLAUDE.md` — tuzilma, qat'iy qoidalar, uch joyda bir xil mantiq
2. `nasaf-tracker/docs/UI-USLUB.md` — dizayn qoidalari
3. `nasaf-tracker/docs/OCHIQ-ISHLAR.md` — tugallanmagan ishlar
4. `nasaf-wall-screen/CLAUDE.md` — TV
5. Kerak bo'lganda: `docs/SETUP.md`, `docs/AUDIT-2026-11.md`,
   `docs/nasaf-tracker-UI-hujjat.pdf` (har bir ekran surati bilan)

## 4. Claude bilan ishlash

Claude Code'ni repo papkasida oching — `CLAUDE.md` ni o'zi o'qiydi.
Ikkala loyihaga tegadigan ish bo'lsa (masalan holat qoidasi), ikkala
papkani ham sessiyaga qo'shing.

Yaxshi so'rov namunasi:
> "Vazifa kartasiga 'muddati yaqin' nishoni qo'shmoqchiman. Avval
> mavjud nishonlar qanday qilinganini ko'rsat, `docs/UI-USLUB.md` ga
> mos taklif ber, keyin qil."

## 5. Ish tartibi

- Yangi ish — alohida branch, keyin Pull Request. Egasi ko'rib chiqadi.
- `main` ga push = prod'ga chiqish (Vercel avtomatik deploy).
- Prod bazaga migratsiya va ma'lumot o'zgartirish — faqat egasi bilan
  kelishib.
- Commit xabarlari o'zbekcha.
