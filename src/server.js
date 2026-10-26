require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const { connect } = require('./db');
const OutfitVoto = require('./models/OutfitVoto');
const { calcularResultados } = require('./resultados');

const PORT = process.env.PORT || 3003;
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'web', 'dist');
const INVITADOS_FILE = path.join(ROOT, 'data', 'invitados.json');
const RESULTADOS_FILE = path.join(ROOT, 'data', 'resultados.json');

// Contraseña de la sección privada de ternas/resultados
const RESULTADOS_PASSWORD = process.env.RESULTADOS_PASSWORD || 'achura2026';
// Token estable derivado de la contraseña (no hace falta guardar sesiones en memoria)
const TOKEN_RES = crypto.createHmac('sha256', RESULTADOS_PASSWORD).update('achura-ganadores').digest('hex');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

// ---------- helpers ----------

function leerConfigOutfit() {
  try {
    const raw = JSON.parse(fs.readFileSync(INVITADOS_FILE, 'utf8'));
    const invitados = Array.isArray(raw) ? raw : raw.invitados || [];
    return {
      activo: Array.isArray(raw) ? true : raw.activo !== false,
      titulo: raw.titulo || 'Outfit del día',
      invitados,
    };
  } catch (e) {
    return { activo: false, titulo: 'Outfit del día', invitados: [] };
  }
}

function leerCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function tieneAcceso(req) {
  const token = leerCookies(req).res_token;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(TOKEN_RES);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Normaliza un nombre para comparar (los votos viejos no tienen id de votante)
const claveNombre = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// A qué invitado del padrón corresponde un voto.
// Los votos nuevos traen `votante` (id); los viejos se reconocen por el nombre.
function idDeVoto(cfg, v) {
  if (v.votante && cfg.invitados.some((i) => i.id === v.votante)) return v.votante;
  const k = claveNombre(v.nombre);
  if (!k) return null;
  const inv = cfg.invitados.find((i) => {
    const n = claveNombre(i.nombre);
    return n && (k === n || k.startsWith(n + ' ') || n.startsWith(k + ' '));
  });
  return inv ? inv.id : null;
}

// Ids del padrón que ya votaron (cada persona cuenta una sola vez)
function votantesDelPadron(cfg, votos) {
  const ids = new Set();
  for (const v of votos) {
    const id = idDeVoto(cfg, v);
    if (id) ids.add(id);
  }
  return ids;
}

// Límite simple para no permitir fuerza bruta contra la contraseña
const intentos = new Map();
const LIMITE_INTENTOS = 15;
const VENTANA_MS = 10 * 60 * 1000;

function demasiadosIntentos(ip) {
  const ahora = Date.now();
  const prev = (intentos.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (prev.length >= LIMITE_INTENTOS) {
    intentos.set(ip, prev);
    return true;
  }
  prev.push(ahora);
  intentos.set(ip, prev);
  return false;
}

// ---------- API: sección privada de resultados ----------

app.post('/api/acceso', (req, res) => {
  if (demasiadosIntentos(req.ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
  }
  const pass = String((req.body && req.body.password) || '');
  const a = Buffer.from(pass);
  const b = Buffer.from(RESULTADOS_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });

  res.cookie('res_token', TOKEN_RES, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  res.json({ ok: true });
});

app.post('/api/salir', (req, res) => {
  res.clearCookie('res_token');
  res.json({ ok: true });
});

app.get('/api/resultados', (req, res) => {
  if (!tieneAcceso(req)) return res.status(401).json({ error: 'Necesitás la contraseña' });
  try {
    const raw = fs.readFileSync(RESULTADOS_FILE, 'utf8');
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(raw);
  } catch (e) {
    res.status(503).json({ error: 'Todavía no hay resultados generados' });
  }
});

// Resultados EN VIVO: se calculan contra la base en el momento (para el organizador).
let cacheVivo = { ts: 0, data: null };

app.get('/api/resultados/vivo', async (req, res) => {
  if (!tieneAcceso(req)) return res.status(401).json({ error: 'Necesitás la contraseña' });
  try {
    const ahora = Date.now();
    if (cacheVivo.data && ahora - cacheVivo.ts < 4000) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(cacheVivo.data);
    }
    const data = await calcularResultados();
    cacheVivo = { ts: ahora, data };
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    console.error('Resultados en vivo:', e.message);
    res.status(503).json({ error: 'No se pudieron calcular los resultados' });
  }
});

// ---------- API: Outfit del día ----------

app.get('/api/outfit', async (req, res) => {
  const cfg = leerConfigOutfit();
  const token = leerCookies(req).outfit_token;

  let votos = new Map();
  let votantes = [];
  let totalVotos = 0;
  let miVoto = null;
  let miNombre = '';
  let baseOk = true;
  try {
    await connect();
    const rows = await OutfitVoto.find({}, { invitado: 1, votante: 1, nombre: 1 }).lean();
    totalVotos = rows.length;
    votos = new Map();
    for (const r of rows) votos.set(r.invitado, (votos.get(r.invitado) || 0) + 1);
    votantes = [...votantesDelPadron(cfg, rows)];
    if (token) {
      const v = await OutfitVoto.findOne({ token }).lean();
      miVoto = v ? v.invitado : null;
      miNombre = v ? v.nombre || '' : '';
    }
  } catch (e) {
    baseOk = false;
    console.error('Outfit: base no disponible:', e.message);
  }

  const invitados = cfg.invitados.map((i) => ({ ...i, votos: votos.get(i.id) || 0 }));
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    titulo: cfg.titulo,
    activo: cfg.activo,
    baseOk,
    invitados,
    padron: cfg.invitados.length,
    // Ids de los invitados que ya votaron (para el conteo X del padrón)
    votantes,
    total: totalVotos,
    yaVoto: !!miVoto,
    miVoto,
    miNombre,
  });
});

// Detalle en vivo para el organizador (incluye quién votó). Requiere la contraseña
// de la sección privada.
app.get('/api/outfit/detalle', async (req, res) => {
  if (!tieneAcceso(req)) return res.status(401).json({ error: 'Necesitás la contraseña' });

  const cfg = leerConfigOutfit();
  try {
    await connect();
    const votos = await OutfitVoto.find({}).sort({ createdAt: -1 }).lean();
    const ranking = cfg.invitados
      .map((i, orden) => ({
        id: i.id,
        nombre: i.nombre,
        foto: i.foto || '',
        grupo: i.grupo || 'invitado',
        orden,
        votos: votos.filter((v) => v.invitado === i.id).length,
      }))
      .sort((a, b) => b.votos - a.votos);

    // Quiénes votaron y quiénes faltan: el voto va atado al id del invitado
    // (una persona = un voto). Los votos viejos se reconocen por el nombre.
    const porId = new Map(cfg.invitados.map((i) => [i.id, i]));
    const fechas = new Map();
    const votaron = [];
    const vistosSueltos = new Set();
    for (const v of votos) {
      const id = idDeVoto(cfg, v);
      if (id) {
        if (!fechas.has(id)) fechas.set(id, v.createdAt);
        continue;
      }
      const k = claveNombre(v.nombre);
      if (k && !vistosSueltos.has(k)) {
        vistosSueltos.add(k);
        votaron.push({ nombre: v.nombre || 'Sin nombre', fecha: v.createdAt });
      }
    }
    for (const [id, fecha] of fechas) {
      const inv = porId.get(id);
      if (inv) votaron.push({ nombre: inv.nombre, fecha });
    }
    votaron.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const faltantes = cfg.invitados
      .filter((i) => !fechas.has(i.id))
      .map((i) => ({ id: i.id, nombre: i.nombre, grupo: i.grupo || 'invitado' }));

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      titulo: cfg.titulo,
      activo: cfg.activo,
      total: votos.length,
      // Padrón: los invitados del outfit. El ganador se revela
      // recién cuando votaron todos.
      padron: cfg.invitados.length,
      votaronTotal: votaron.length,
      faltan: faltantes.length,
      listo: cfg.invitados.length > 0 && faltantes.length === 0,
      ranking,
      votantes: votaron.slice(0, 40),
      faltantes,
      ultimos: votos.slice(0, 40).map((v) => ({
        nombre: v.nombre || 'Sin nombre',
        invitado: v.invitado,
        fecha: v.createdAt,
      })),
    });
  } catch (e) {
    res.status(503).json({ error: 'La base no está disponible' });
  }
});

app.post('/api/outfit/votar', async (req, res) => {
  const cfg = leerConfigOutfit();
  const id = String((req.body && req.body.id) || '');
  const votanteId = String((req.body && req.body.votante) || '').trim();

  if (!cfg.activo) return res.status(400).json({ error: 'La votación de Outfit del día está cerrada' });
  if (!cfg.invitados.some((i) => i.id === id)) return res.status(400).json({ error: 'Invitado inválido' });

  // Quién vota: tiene que ser uno de los invitados del padrón
  const votante = cfg.invitados.find((i) => i.id === votanteId);
  if (!votante) return res.status(400).json({ error: 'Elegí tu nombre de la lista para votar' });

  try {
    await connect();
  } catch (e) {
    return res.status(503).json({ error: 'La votación no está disponible en este momento' });
  }

  const cookies = leerCookies(req);
  let token = cookies.outfit_token;
  if (!token) {
    token = crypto.randomUUID();
    res.cookie('outfit_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });
  }

  const previo = await OutfitVoto.findOne({ token }).lean();
  if (previo) return res.status(409).json({ error: 'Ya votaste tu outfit del día', miVoto: previo.invitado });

  // Una persona = un voto (aunque entre desde otro celular)
  const yaVoto = await OutfitVoto.findOne({ votante: votante.id }).lean();
  if (yaVoto) return res.status(409).json({ error: 'Ese nombre ya votó', yaVoto: true });

  // Nunca puede haber más votos que invitados del padrón
  const total = await OutfitVoto.countDocuments({});
  if (total >= cfg.invitados.length) {
    return res.status(409).json({ error: `Ya votaron las ${cfg.invitados.length} personas`, completo: true });
  }

  try {
    await OutfitVoto.create({
      token,
      invitado: id,
      votante: votante.id,
      nombre: votante.nombre,
      ip_address: req.ip,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 250),
    });
  } catch (e) {
    if (e.code === 11000) {
      const porPersona = e.keyPattern && e.keyPattern.votante;
      return res.status(409).json({
        error: porPersona ? 'Ese nombre ya votó' : 'Ya votaste tu outfit del día',
        yaVoto: !!porPersona,
      });
    }
    console.error('Outfit: error al guardar el voto:', e.message);
    return res.status(500).json({ error: 'No se pudo guardar el voto' });
  }

  res.json({ ok: true, miVoto: id, miNombre: votante.nombre });
});

// Reset manual (para el organizador). Requiere el header x-admin-password.
app.post('/api/outfit/reset', async (req, res) => {
  const pass = String(req.headers['x-admin-password'] || '');
  if (pass !== (process.env.ADMIN_PASSWORD || 'achura2026')) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  try {
    await connect();
    const r = await OutfitVoto.deleteMany({});
    console.log('Outfit: votos borrados (' + r.deletedCount + ')');
    res.json({ ok: true, borrados: r.deletedCount });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- Frontend ----------

app.use(
  express.static(DIST, {
    maxAge: '1h',
    setHeaders(res, filePath) {
      // El index.html nunca se cachea: así un deploy nuevo se ve al instante
      if (/\.html?$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(filePath)) {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const index = path.join(DIST, 'index.html');
  if (!fs.existsSync(index)) return res.status(503).send('Falta compilar el frontend: npm run build');
  res.sendFile(index);
});

app.listen(PORT, () => {
  console.log(`🏆 Achura Ganadores en http://localhost:${PORT}`);
  if (!fs.existsSync(DIST)) console.log('⚠  Todavía no existe web/dist: corré "npm run build" para ver el sitio.');
  if (!process.env.MONGO_URI) console.log('⚠  Sin MONGO_URI: el voto de Outfit queda deshabilitado.');
});
