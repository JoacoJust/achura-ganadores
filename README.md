# 🏆 Achura Awards — Ganadores

Sitio con **los ganadores y los puestos de cada terna** de los Achura Awards, más la votación
pública del **Outfit del día**.

Reutiliza todo lo de [`JoacoJust/achura-awards`](https://github.com/JoacoJust/achura-awards): los mismos
nombres, fotos y videos. No hay que volver a cargar nada.

---

## Tres partes separadas

| Parte | URL | Quién entra | Qué ve |
| --- | --- | --- | --- |
| **1 · Votar el Outfit del día** | `/#/` | Público | Ingresa su nombre y vota el mejor outfit (1 voto por dispositivo). Solo se ven **las iniciales** de los 19. **No ve ranking ni ternas.** |
| **2 · Ternas y ganadores** | `/#/ternas` | **Privado** (contraseña) | Todas las ternas **en vivo**: portada sin nombres, y al entrar a cada terna el ganador + los puestos, actualizándose solos. |
| **3 · Outfit del día (organizador)** | `/#/outfit-panel` | **Privado** (contraseña) | Ranking del outfit **en vivo** (solo iniciales, sin fotos) + **quiénes votaron** y a qué hora. |

- Los resultados **se calculan contra la base de datos en el momento** (`GET /api/resultados/vivo`,
  cache de 4 s) y el sitio los refresca cada 8 s: los puestos y el ganador se ven **en vivo**.
- La portada de las ternas **no muestra nombres de ganadores** ("VER GANADOR →"); el ganador se
  revela al entrar a la terna.
- Al entrar a una terna se ve **la terna completa**: primero los **candidatos con sus historias**
  (tocá a un candidato para abrirla), después un botón **✦ Revelar al ganador** y recién ahí el
  ganador (foto + nombre + puntos) con los **puestos** (podio + tabla), que se siguen actualizando en vivo.
- Al revelar, la terna queda **marcada como "ya se mostró"** (se anota en el navegador del
  organizador, en `localStorage`, clave `achura_ternas_mostradas`) y aparece un botón
  **Continuar →** que salta a la próxima terna que todavía no se mostró. En la portada se ve
  *"X de 17 ternas mostradas"* y las ternas ya feitas salen tachadas con un **✓**.
- La revelación queda accordada por terna en el navegador, así que se puede ir y volver sin perderla.
- **Achura del año tiene premio compartido: dos ganadores.** Se configura con `"ganadores": 2` en
  `web/src/data/categories.json`.
- Los resultados **no viajan en el JavaScript**: se piden a la API, que exige la cookie que se obtiene
  con la contraseña (`RESULTADOS_PASSWORD`).
- **Las fotos de las ternas se ven completas**: los candidatos, la historia y el ganador muestran la
  foto **entera** (sin recortes) sobre un fondo desenfocado de la misma foto. En los círculos
  pequeños (portada, podio, tabla de puestos) se recorta desde arriba para que no se corte la cara.
- **Se pueden ampliar fotos y videos**:
  - **Fotos**: al tocarlas se abren en grande (completas, sin recortes) en un visor con fondo negro.
    Funciona en la historia de cada candidato y en la foto del ganador.
  - **Videos**: el botón **▶** de la grilla de candidatos abre el video en grande, y dentro de la
    historia el botón **⛶ Ver en pantalla completa** lo abre con un reproductor grande que tiene el
    botón **⛶ Pantalla completa** (también con doble clic sobre el video).
- **La Gordiada del año** anuncia que el premio se entrega y quién cuenta las historias: antes de
  revelar aparece el bloque **🏆 El premio** ("Este premio sera entregado por el mismisimo Franco
  Bernardi (alias Gordi) al ganador"), arriba de los candidatos dice *"Las historias las cuenta
  Franco Bernardi (alias Gordi)"* y en cada historia *"Historia contada por Franco Bernardi
  (alias Gordi)"*. Se configura con `mencion`, `mencion_titulo` y `narrador` en
  `web/src/data/categories.json`.

### Rutas

| Ruta | Qué es |
| --- | --- |
| `#/` | Votación pública del Outfit del día. |
| `#/ternas` | Portada de las ternas (privada). |
| `#/terna/<id>` | Candidatos + botón de revelar + ganador y puestos (privada). |
| `#/outfit-panel` | Ranking en vivo del Outfit (privada). |

---

## Cómo correrlo local

```bash
npm install                                  # backend
cd web && npm install && npm run build && cd ..   # frontend
npm start                                    # http://localhost:3003
```

`.env`:

```env
MONGO_URI=...              # la misma base que usa achura-awards
RESULTADOS_PASSWORD=achura2026
ADMIN_PASSWORD=achura2026
PORT=3003
```

`npm run sync` (opcional) genera `data/resultados.json` con los votos reales: sirve como respaldo
si la base no está disponible. **Los resultados en vivo no dependen de ese archivo**: se calculan
siempre contra la base.

---

## Deploy en Render

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Variables de entorno:**

| Variable | Para qué |
| --- | --- |
| `MONGO_URI` | Leer los votos de las ternas y guardar los del Outfit. |
| `RESULTADOS_PASSWORD` | Contraseña de las secciones privadas (ternas y panel del Outfit). |
| `ADMIN_PASSWORD` | Para borrar los votos de Outfit (`POST /api/outfit/reset`). |
| `PORT` | Lo define Render. |

> Los resultados **no están en el repo** (para que no se filtren). El sitio los pide a la API con la
> cookie de acceso, así que no hace falta `npm run sync` para que funcionen.
> El build compila el frontend (`web/dist`) y sirve `index.html` sin caché, para que un deploy nuevo
> se vea al instante.

---

## Actualizar los resultados

No hay que hacer nada: se actualizan solos mientras llegan votos.

Si en algún momento querés dejar el archivo local al día:

```bash
npm run sync
```

Orden de los puestos: **puntos → votos de 2 puntos → orden original de la terna**.
Si queda un empate en el 1º puesto de un premio individual, el sitio lo avisa.

---

## Outfit del día

La lista de invitados está en **`data/invitados.json`**. Hay **19 personas** (9 de Achura + 10
Invitados) y **la grilla las muestra a todas juntas**, sin separarlas:

```json
{
  "titulo": "Outfit del día",
  "activo": true,
  "invitados": [
    { "id": "jesus-quiero", "nombre": "Jesús Quiero", "grupo": "achura", "foto": "" },
    { "id": "guadalupe-pedernera", "nombre": "Guadalupe Pedernera", "grupo": "invitado", "foto": "" }
  ]
}
```

| Campo | Qué es |
| --- | --- |
| `id` | Identificador del voto (no se repite). |
| `nombre` | Cómo se muestra y cómo queda registrado el voto. |
| `grupo` | Solo informativo (`achura` o `invitado`). No separa la lista. |
| `foto` | Ruta de `/media` (archivos en `web/public/media/`) o URL. **No se muestra** (la votación es solo con iniciales), pero queda guardada por si se quiere usar. |
- Todos votan **una sola vez** y el voto vale **1** (las anotaciones `(+2)` / `(+1)` no cuentan).
- `"activo": false` cierra la votación.
- Para cambiar los nombres, se edita `data/invitados.json` y se recarga el sitio
  (no hace falta buildear: el backend lo lee en cada request).
- **La votación pública muestra solo las iniciales** (círculo con las iniciales, sin fotos), en una
  sola grilla con los 19 juntos.
- **En el ranking en vivo del organizador tampoco se muestran fotos**, solo las iniciales (lo mismo
  para los 19).

Cada dispositivo vota **una sola vez** (cookie `outfit_token` + colección `outfit_votos`).
Antes de votar se pide el **nombre** del invitado (se guarda en el dispositivo y queda registrado
con el voto; el organizador lo ve en el panel *En vivo*).

Para reiniciar la votación:

```bash
curl -X POST https://TU-SITIO.onrender.com/api/outfit/reset \
  -H "x-admin-password: achura2026"
```

---

## API

| Endpoint | Qué hace |
| --- | --- |
| `POST /api/acceso` | Body `{ password }` → deja la cookie `res_token` (HMAC de la contraseña). |
| `POST /api/salir` | Borra la cookie de acceso. |
| `GET /api/resultados` | Resultados del último `npm run sync` (privado). |
| `GET /api/resultados/vivo` | **Resultados calculados contra la base en el momento** (privado). |
| `GET /api/outfit` | Datos de la votación pública + si este dispositivo ya votó. |
| `POST /api/outfit/votar` | Body `{ id, nombre }` → registra el voto. |
| `GET /api/outfit/detalle` | Ranking + quiénes votaronsolo para el organizador (privado). |
| `POST /api/outfit/reset` | Header `x-admin-password` → borra los votos del Outfit. |

---

## Estructura

```
src/server.js               Express: API de acceso, resultados (estático + vivo) y outfit + estáticos
src/resultados.js           Cálculo de puestos (compartido entre el sync y el endpoint en vivo)
src/db.js                   Conexión perezosa a Mongo
src/models/OutfitVoto.js    Votos del Outfit del día
src/models/votacion.js      Lectura de categorías/opciones/votos de achura-awards
scripts/sync-resultados.js  Genera data/resultados.json (respaldo)
data/resultados.json        Resultados (privado, se sirve por API; no se versiona)
data/invitados.json         Lista de invitados del Outfit (19: 9 Achura + 10 Invitados)
web/src/App.jsx             Outfit público + ternas privadas + panel en vivo del organizador
web/src/data/categories.json  Copia de las 17 ternas (nombres, fotos, videos)
web/public/media/           Fotos y videos copiados de achura-awards
```
