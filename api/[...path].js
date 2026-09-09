// Vercel serverless function — "/api/*" ostidagi HAMMA yo'llar uchun
// (Vercel'ning o'z "catch-all" fayl nomlash konventsiyasi orqali,
// vercel.json'da alohida rewrite yozish shart emas). Xuddi shu Express
// ilova (netlify/functions/api.js) qayta ishlatiladi — u ichida barcha
// route'lar "/api/..." prefiksi bilan aniqlangan, shuning uchun to'liq
// yo'l (masalan "/api/projects") to'g'ridan-to'g'ri to'g'ri ishlaydi.
module.exports = require("../netlify/functions/api.js");
