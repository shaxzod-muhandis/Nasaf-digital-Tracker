# Ochiq ishlar va holat (2026-11-09)

Loyihani topshirish paytidagi holat: nima tugallanmagan, nima kutib
turibdi, nimaga ehtiyot bo'lish kerak. Ishni boshlashdan oldin o'qing.
Biror band yopilsa — shu fayldan o'chiring yoki "yopildi" deb belgilang.

## 1. Tugallanmagan kod

### 1.1 Audit tuzatishlari (commit qilinmagan)

Egasining kompyuterida, `main` ustida commit qilinmagan holda turibdi.
Topshirishdan oldin alohida branch'ga chiqarilishi kerak — aks holda
repoda ko'rinmaydi. Uch qism, uchalasi `docs/AUDIT-2026-11.md` dan:

**a) Qarz modeli (audit 1.1).**
Eski qoida (prod'da hozir shu): davr muddati tugasa-yu reja to'liq
bajarilmagan bo'lsa, yangi oy **ochilmaydi**. Loyiha o'tgan oyda "osilib"
qoladi, yangi ish eski oyga yoziladi va qarz har oy kattalashadi.
Yangi qoida: davr muddati tugashi bilan yopiladi (bajarilmagani
`is_debt` bo'lib qoladi), keyingi oy o'z vaqtida ochiladi. Qarz alohida
qoldiq sifatida ko'rinadi va eski davrga qaytib yopiladi.

**b) Rejani kamaytirish (audit 1.3).** Reja kamaytirilsa, chegaradan
tashqaridagi belgilangan ishlar o'chadi. Endi avval tasdiq so'raladi
(`confirmChecksDelete`), berilgan Ncoin `reverseNcoin` bilan qaytariladi.

**c) Ncoin oluvchini tekshirish (audit 1.4).** `editorUserId` va
`videographerUserId` endi mavjud va loyihaga aloqador xodim ekani
tekshiriladi — avval Ncoin'ni istalgan odamga yozib berish mumkin edi.

O'zgargan fayllar: `netlify/functions/lib/cycles.js`
(`ensureCurrentCycle`), `netlify/functions/api.js`, `private/app.html`,
`test/smoke.js`, `test/ncoin.js`, `test/staff-worklog.js`.

Prod'ga chiqarishdan oldin:
- [ ] test bazada `npm run test:all` to'liq o'tsin;
- [ ] prod bazada qaysi loyihalar "osilib" turganini o'qish rejimida
      ko'rib, o'tish paytida ular bilan nima bo'lishini egasi bilan kelishing
      (eski oyga yozilgan yangi ishlar);
- [ ] panel, bot va TV qarzni bir xil ko'rsatishini tekshiring.

### 1.2 `ui-v3` branch

2026-09 dagi v3 dizayn tajribasi. Prod'ga chiqarilgan, ikki kamchilik
uchun ataylab qaytarilgan:
1. Desktop "Bugun" sahifasi v3 maketiga 1:1 mos emas edi;
2. Telegram Desktop'da `requestFullscreen()` tufayli tepada ortiqcha bo'sh joy.

O'shandan beri `main` 130+ commit oldinga ketgan, shuning uchun
`ui-v3` ni to'g'ridan-to'g'ri merge qilib bo'lmaydi. Egasi aytmaguncha
tegmang; qayta boshlansa — `main` dan yangi branch ochib, `ui-v3` dan
kerakli qismlarni ko'chirish ma'qul.

## 2. Ma'lumotdagi muammolar (prod baza)

Bularni tuzatish — prod ma'lumotni o'zgartirish. **Faqat egasining aniq
roziligi bilan**, avval o'qish rejimida tekshirib.

- **Anhor | Beruniy, Post #10.** Ish sanasi (`work_date`) 2-noyabr, lekin
  sentabr davriga yozilgan. Hisobotlarda g'alati ko'rinadi (sentabr
  davrida noyabr sanasi).
- **2 ta yo'qolgan Ncoin.** Bir xodimning 2 coini noto'g'ri hisob tufayli
  yo'qolgan; qaytarish kutilmoqda (kim va qaysi belgi — egasidan so'rang).
- **Test qoldiqlari.** Testlar ilgari real bazada ishlatilgan davrdan
  qolgan yozuvlar bo'lishi mumkin. `@nasafdigital_manager` (test hisobi)
  ning faoliyati va coinlari — sinov qoldig'i.

## 3. Sozlama kutayotgan narsalar

- **Bot reaksiyalari (👍 → mijoz guruhiga yuborish).** Ishlashi uchun bot
  guruhda **admin** bo'lishi va webhook `message_reaction`
  yangilanishlarini so'rashi kerak (`npm run tg:webhook -- set`).
- **TV kirishi.** Devor ekrani telefon raqam + bot kodi bilan kiradi;
  televizorda sessiya 30 kun turadi, keyin qayta kirish kerak.

## 4. Audit

`docs/AUDIT-2026-11.md` — 2026-11 dagi to'liq tekshiruv: biznes mantiq,
UI/UX, kichik xatolar va tavsiya etilgan tartib. Undagi bandlarning bir
qismi yopilgan (masalan 2.4 — kalendar eslatmalari, `0034`). Yangi ishni
boshlashdan oldin qaysilari ochiqligini kod bilan solishtiring.
