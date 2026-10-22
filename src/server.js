require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const { connect } = require('./db');
const OutfitVoto = require('./models/OutfitVoto');

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

async function conteosOutfit() {
  const rows = await OutfitVoto.aggregate([{ $group: { _id: '$invitado', votos: { $sum: 1 } } }]);
  const map = new Map();
  rows.forEach((r) => map.set(r._id, r.votos));
  return map;
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

// ---------- API: Outfit del día ----------

app.get('/api/outfit', async (req, res) => {
  const cfg = leerConfigOutfit();
  const token = leerCookies(req).outfit_token;

  let votos = new Map();
  let miVoto = null;
  let baseOk = true;
  try {
    await connect();
    votos = await conteosOutfit();
    if (token) {
      const v = await OutfitVoto.findOne({ token }).lean();
      miVoto = v ? v.invitado : null;
    }
  } catch (e) {
    baseOk = false;
    console.error('Outfit: base no disponible:', e.message);
  }

  const invitados = cfg.invitados.map((i) => ({ ...i, votos: votos.get(i.id) || 0 }));
  res.json({
    titulo: cfg.titulo,
    activo: cfg.activo,
    baseOk,
    invitados,
    total: [...votos.values()].reduce((a, b) => a + b, 0),
    yaVoto: !!miVoto,
    miVoto,
  });
});

app.post('/api/outfit/votar', async (req, res) => {
  const cfg = leerConfigOutfit();
  const id = String((req.body && req.body.id) || '');

  if (!cfg.activo) return res.status(400).json({ error: 'La votación de Outfit del día está cerrada' });
  if (!cfg.invitados.some((i) => i.id === id)) return res.status(400).json({ error: 'Invitado inválido' });

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

  try {
    await OutfitVoto.create({
      token,
      invitado: id,
      ip_address: req.ip,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 250),
    });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Ya votaste tu outfit del día' });
    console.error('Outfit: error al guardar el voto:', e.message);
    return res.status(500).json({ error: 'No se pudo guardar el voto' });
  }

  res.json({ ok: true, miVoto: id });
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
