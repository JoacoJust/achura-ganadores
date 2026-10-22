// Genera data/resultados.json con los votos reales de la base compartida.
// Uso: npm run sync
// Si no hay MONGO_URI, deja el archivo que ya estaba (el build no se rompe).
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Categoria, Opcion, Voto } = require('../src/models/votacion');

const ROOT = path.join(__dirname, '..');
const CATEGORIES = require(path.join(ROOT, 'web', 'src', 'data', 'categories.json'));
const OUT_FILE = path.join(ROOT, 'data', 'resultados.json');

const esVideo = (m) => /\.(mp4|webm|mov|m4v|ogv)$/i.test(m || '') && !/placeholder/i.test(m || '');
const esPlaceholder = (m) => !m || /placeholder/i.test(m);

// Foto que se muestra del nominado (si el material es un video, su portada)
function fotoDe(n) {
  const media = n.media || '';
  const poster = esPlaceholder(n.poster) ? '' : n.poster || '';
  if (esPlaceholder(media) || esVideo(media)) return poster;
  return media || poster;
}

(async () => {
  if (!process.env.MONGO_URI) {
    console.warn('⚠  Sin MONGO_URI: se mantiene el resultados.json actual.');
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);

  const salida = { generado: new Date().toISOString(), categorias: {} };
  const resumen = [];

  for (const cat of CATEGORIES) {
    const dbCat = await Categoria.findOne({ id_web: cat.id }).lean();
    const ops = dbCat ? await Opcion.find({ categoria: dbCat._id }).lean() : [];
    const porIdWeb = new Map(ops.filter((o) => o.id_web).map((o) => [o.id_web, o]));

    // Cantidad de votos de 1º (2 puntos) y de 2º (1 punto) por opción:
    // sirve para desempatar igual que en una tabla de posiciones.
    const filas = dbCat
      ? await Voto.aggregate([
          { $match: { categoria: dbCat._id } },
          { $group: { _id: { opcion: '$opcion', peso: '$peso' }, n: { $sum: 1 } } },
        ])
      : [];
    const porPeso = new Map();
    filas.forEach((f) => {
      const k = String(f._id.opcion);
      if (!porPeso.has(k)) porPeso.set(k, { 2: 0, 1: 0 });
      porPeso.get(k)[f._id.peso === 1 ? 1 : 2] += f.n;
    });

    const puestos = (cat.nominados || []).map((n, i) => {
      const op = porIdWeb.get(n.id);
      const pesos = op ? porPeso.get(String(op._id)) || { 2: 0, 1: 0 } : { 2: 0, 1: 0 };
      return {
        id: n.id,
        nombre: n.nombre,
        votos: op ? op.votos || 0 : 0,
        votos1: pesos[2],
        votos2: pesos[1],
        foto: fotoDe(n),
        orden: i,
      };
    });

    // Orden: más puntos; a igualdad, más votos de 2 puntos; después el orden original
    puestos.sort((a, b) => b.votos - a.votos || b.votos1 - a.votos1 || a.orden - b.orden);

    const total = puestos.reduce((acc, p) => acc + p.votos, 0);
    const conPct = puestos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      votos: p.votos,
      votos1: p.votos1,
      votos2: p.votos2,
      pct: total ? Math.round((p.votos / total) * 1000) / 10 : 0,
      foto: p.foto,
    }));

    // Premio compartido: "ganadores": 2 en categories.json (Achura del año)
    const nGanadores = Math.max(1, Number(cat.ganadores) || 1);
    const ganadores = conPct.filter((p) => p.votos > 0).slice(0, nGanadores);

    // Aviso de empate solo cuando el premio es para uno solo
    const empate =
      nGanadores === 1 && conPct.length > 1 && conPct[0].votos > 0 && conPct[1].votos === conPct[0].votos;
    const empatados = empate ? conPct.filter((p) => p.votos === conPct[0].votos).map((p) => p.nombre) : [];

    salida.categorias[cat.id] = { total, nGanadores, ganadores, puestos: conPct, empate, empatados };

    resumen.push(
      `${cat.nombre.padEnd(36)} ${
        ganadores.length
          ? '→ ' + ganadores.map((g) => g.nombre + ' (' + g.votos + ' pts)').join(' + ') + (empate ? ' [EMPATE]' : '')
          : '→ sin votos'
      }`
    );
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(salida, null, 2) + '\n', 'utf8');

  console.log('✅ Resultados generados: ' + path.relative(ROOT, OUT_FILE));
  resumen.forEach((l) => console.log('   ' + l));

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('⚠  No se pudieron leer los votos:', e.message);
  console.error('   Se mantiene el resultados.json actual.');
  try {
    await mongoose.disconnect();
  } catch {}
});
