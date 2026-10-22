// Cálculo de resultados (puestos de cada terna) leyendo la base compartida.
//
// Lo usan:
//   - scripts/sync-resultados.js  -> escribe data/resultados.json (para el build)
//   - GET /api/resultados/vivo     -> los calcula en el momento (panel del organizador)
//
// Puestos: puntos -> votos de 2 puntos -> orden original de la terna.
const path = require('path');
const { connect } = require('./db');
const { Categoria, Opcion, Voto } = require('./models/votacion');

const ROOT = path.join(__dirname, '..');
const CATEGORIES = require(path.join(ROOT, 'web', 'src', 'data', 'categories.json'));

const esVideo = (m) => /\.(mp4|webm|mov|m4v|ogv)$/i.test(m || '') && !/placeholder/i.test(m || '');
const esPlaceholder = (m) => !m || /placeholder/i.test(m);

// Foto que se muestra del nominado (si el material es un video, su portada)
function fotoDe(n) {
  const media = n.media || '';
  const poster = esPlaceholder(n.poster) ? '' : n.poster || '';
  if (esPlaceholder(media) || esVideo(media)) return poster;
  return media || poster;
}

async function calcularResultados() {
  await connect();

  const cats = await Categoria.find({}).lean();
  const ops = await Opcion.find({}).lean();
  const votosAgg = await Voto.aggregate([
    { $group: { _id: { opcion: '$opcion', peso: '$peso' }, n: { $sum: 1 } } },
  ]);

  const catPorIdWeb = new Map(cats.filter((c) => c.id_web).map((c) => [c.id_web, c]));
  const opPorId = new Map(ops.map((o) => [String(o._id), o]));

  // cantidad de votos de 1º (2 puntos) y de 2º (1 punto) por opción
  const porOpcion = new Map();
  votosAgg.forEach((f) => {
    const k = String(f._id.opcion);
    if (!porOpcion.has(k)) porOpcion.set(k, { 2: 0, 1: 0 });
    porOpcion.get(k)[f._id.peso === 1 ? 1 : 2] += f.n;
  });

  const salida = { generado: new Date().toISOString(), categorias: {} };

  for (const cat of CATEGORIES) {
    const dbCat = catPorIdWeb.get(cat.id);
    const opsCat = dbCat ? ops.filter((o) => String(o.categoria) === String(dbCat._id)) : [];
    const porIdWeb = new Map(opsCat.filter((o) => o.id_web).map((o) => [o.id_web, o]));

    const puestos = (cat.nominados || []).map((n, i) => {
      const op = porIdWeb.get(n.id);
      const pesos = op ? porOpcion.get(String(op._id)) || { 2: 0, 1: 0 } : { 2: 0, 1: 0 };
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

    salida.categorias[cat.id] = {
      total,
      nGanadores,
      ganadores,
      puestos: conPct,
      empate,
      empatados,
      permitido: dbCat ? dbCat.permite_votar !== false : true,
      pesos: dbCat && Array.isArray(dbCat.pesos_voto) ? dbCat.pesos_voto : [2, 1],
    };
  }

  return salida;
}

module.exports = { calcularResultados, CATEGORIES, fotoDe };
