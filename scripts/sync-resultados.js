// Genera data/resultados.json con los votos reales de la base compartida.
// Uso: npm run sync
// Si no hay MONGO_URI, deja el archivo que ya estaba (el build no se rompe).
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { calcularResultados } = require('../src/resultados');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'resultados.json');

(async () => {
  if (!process.env.MONGO_URI) {
    console.warn('⚠  Sin MONGO_URI: se mantiene el resultados.json actual.');
    return;
  }

  const salida = await calcularResultados();

  fs.writeFileSync(OUT_FILE, JSON.stringify(salida, null, 2) + '\n', 'utf8');

  console.log('✅ Resultados generados: ' + path.relative(ROOT, OUT_FILE));
  Object.keys(salida.categorias).forEach((id) => {
    const c = salida.categorias[id];
    const cat = require(path.join(ROOT, 'web', 'src', 'data', 'categories.json')).find((x) => x.id === id);
    const nombres = c.ganadores.map((g) => g.nombre + ' (' + g.votos + ' pts)').join(' + ');
    console.log(
      `   ${(cat ? cat.nombre : id).padEnd(36)} ${
        c.ganadores.length ? '→ ' + nombres + (c.empate ? ' [EMPATE]' : '') : '→ sin votos'
      }`
    );
  });
})()
  .catch((e) => {
    console.error('⚠  No se pudieron leer los votos:', e.message);
    console.error('   Se mantiene el resultados.json actual.');
  })
  .finally(async () => {
    // Cierra la conexión: si no, el proceso queda esperando y nunca termina
    await mongoose.disconnect().catch(() => {});
  });
