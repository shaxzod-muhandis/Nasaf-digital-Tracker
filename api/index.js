// Vercel serverless function — bosh sahifa ("/") uchun. Express ilova
// o'zi to'g'ridan-to'g'ri (req,res) so'rov-javob signaturasiga ega
// bo'lgani uchun serverless-http kabi o'rovchisiz ham ishlaydi (Netlify
// funksiyasi bilan bir xil netlify/functions/api.js fayli qayta
// ishlatiladi — biznes-logika ikki joyda saqlanmasin deb).
module.exports = require("../netlify/functions/api.js");
