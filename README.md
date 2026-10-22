# 🏆 Achura Awards — Ganadores

Sitio con **los ganadores y los puestos de cada terna** de los Achura Awards, más la votación pública del **Outfit del día**.

Reutiliza todo lo de [`JoacoJust/achura-awards`](https://github.com/JoacoJust/achura-awards): los mismos nombres, fotos y videos. No hay que volver a cargar nada.

---

## Dos secciones

| Sección | URL | Quién entra |
| --- | --- | --- |
| **Outfit del día** | `/#/` | Público. Cada invitado vota el mejor outfit desde su celular (1 voto por dispositivo). |
| **Ternas y ganadores** | `/#/ternas` | **Privado.** Solo con la contraseña (`RESULTADOS_PASSWORD`). |

- En la sección privada se ven **todas las ternas con su nombre e imagen**.
- Al entrar a una terna se ve **el ganador** (foto + nombre + puntos) y **los puestos** completos (podio + tabla).
- **Achura del año tiene premio compartido: dos ganadores.** Se configura con `"ganadores": 2` en `web/src/data/categories.json`.
- Los resultados **no viajan en el JavaScript**: se piden a `GET /api/resultados`, que exige la cookie que se obtiene con la contraseña.

---

## Cómo correrlo local

```bash
npm install          # backend
npm run sync         # lee los votos reales de Mongo -> data/resultados.json
cd web && npm install && npm run build && cd ..
npm start            # http://localhost:3003
```

`.env`:

```env
MONGO_URI=...              # la misma base que usa achura-awards
RESULTADOS_PASSWORD=achura2026
ADMIN_PASSWORD=achura2026
PORT=3003
```

---

## Deploy en Render

- **Build command:** `npm install && npm run build`
  (el `build` corre `npm run sync` y después compila el frontend en `web/dist`)
- **Start command:** `npm start`
- **Variables de entorno:**

| Variable | Para qué |
| --- | --- |
| `MONGO_URI` | Leer los votos de las ternas y guardar los del Outfit. |
| `RESULTADOS_PASSWORD` | Contraseña de la sección privada de ternas. |
| `ADMIN_PASSWORD` | Para borrar los votos de Outfit (`POST /api/outfit/reset`). |

> Los resultados **no están en el repo** (para que no se filtren). `npm run sync` los genera
> durante el build leyendo la base: por eso `MONGO_URI` tiene que estar disponible también
> en el build. Si falta, la sección privada muestra un aviso hasta que se vuelva a deployar.

---

## Actualizar los resultados

Cuando se cierren las votaciones (o para refrescar los puestos):

```bash
npm run sync
```

Eso reescribe `data/resultados.json` leyendo los votos de Mongo. Hacé commit + push y Render lo publica.

Orden de los puestos: **puntos → votos de 2 puntos → orden original de la terna**.
Si queda un empate en el 1º puesto de un premio individual, el sitio lo avisa.

---

## Outfit del día

La lista de invitados está en **`data/invitados.json`**:

```json
{
  "titulo": "Outfit del día",
  "activo": true,
  "invitados": [
    { "id": "tiscornia", "nombre": "Nicolás Tiscornia", "foto": "/media/outfit-tiscornia.jpg" },
    { "id": "just", "nombre": "Joaquín Just", "foto": "/media/outfit-just.jpg" }
  ]
}
```

- `foto` puede ser una ruta de `/media` (archivos en `web/public/media/`) o una URL.
- Si no hay foto, la tarjeta muestra las iniciales.
- `"activo": false` cierra la votación y deja ver los resultados.

Cada dispositivo vota **una sola vez** (cookie `outfit_token` + colección `outfit_votos`).
Para reiniciar la votación:

```bash
curl -X POST https://TU-SITIO.onrender.com/api/outfit/reset \
  -H "x-admin-password: achura2026"
```

---

## Estructura

```
src/server.js               Express: API de acceso, resultados y outfit + estáticos
src/db.js                   Conexión perezosa a Mongo
src/models/OutfitVoto.js    Votos del Outfit del día
src/models/votacion.js      Lectura de categorías/opciones/votos de achura-awards
scripts/sync-resultados.js  Genera data/resultados.json
data/resultados.json        Resultados (privado, se sirve por API)
data/invitados.json         Lista de invitados del Outfit
web/src/App.jsx             Outfit público + ternas privadas
web/src/data/categories.json  Copia de las 17 ternas (nombres, fotos, videos)
web/public/media/           Fotos y videos copiados de achura-awards
```
