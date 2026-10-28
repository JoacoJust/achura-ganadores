import { Fragment, useEffect, useRef, useState } from 'react'
import Emblem from './components/Emblem.jsx'
import categorias from './data/categories.json'

/* ---------------------------------------------------------------
   Achura Awards.

   Tres partes:
   1) VOTAR OUTFIT DEL DÍA (público) -> #/      el invitado ingresa su nombre y vota
   2) TERNAS Y GANADORES (privado)   -> #/ternas contraseña + resultados EN VIVO
   3) OUTFIT DEL DÍA (privado)      -> #/outfit-panel ranking en vivo + quiénes votaron

   Las ternas (nombres, fotos, videos) salen de web/src/data/categories.json,
   la misma copia de la app de votación. Los resultados NO viajan en el bundle:
   se piden a la API, que exige la cookie de acceso.
---------------------------------------------------------------- */

const esVideo = (m) => /\.(mp4|webm|mov|m4v|ogv)$/i.test(m || '') && !/placeholder/i.test(m || '')
const esPlaceholder = (m) => !m || /placeholder/i.test(m)
const TRANSITION_VIDEO = '/media/sin_marca_de_agua.mp4'

function fotoDe(n) {
  if (!n) return ''
  const media = n.media || ''
  const poster = esPlaceholder(n.poster) ? '' : n.poster || ''
  // El placeholder no es una foto real: se muestra el emblema
  if (esPlaceholder(media)) return poster
  if (esVideo(media)) return poster
  return media || poster
}

// Imagen de la terna (portada propia; si no hay, la foto del primer nominado)
function fotoTerna(cat) {
  const poster = esPlaceholder(cat.poster) ? '' : cat.poster || ''
  return poster || fotoDe((cat.nominados || [])[0]) || ''
}

function resultadoDe(datos, id) {
  return (datos && datos.categorias && datos.categorias[id]) || {
    total: 0,
    puestos: [],
    ganadores: [],
    empate: false,
    empatados: [],
    permitido: true,
    pesos: [2, 1],
  }
}

function ganadoresDe(datos, id) {
  const r = resultadoDe(datos, id)
  if (Array.isArray(r.ganadores) && r.ganadores.length) return r.ganadores
  return (r.puestos || []).filter((p) => p.votos > 0).slice(0, 1)
}

/* ------------- la terna que sigue (para el botón "Continuar") ------------- */

function siguienteTerna(idActual) {
  const i = categorias.findIndex((c) => c.id === idActual)
  if (i < 0 || i === categorias.length - 1) return '#/ternas'
  return `#/terna/${encodeURIComponent(categorias[i + 1].id)}`
}

/* ------------- los invitados del outfit (todos juntos) ------------- */

/* ---------------- ruteo por hash (#/, #/ternas, #/terna/:id, #/outfit-panel) ---------------- */

function useRuta() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')

  useEffect(() => {
    const onHash = () => {
      setHash(window.location.hash || '#/')
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return hash
}

const esRutaPrivada = (hash) =>
  hash === '#/ternas' || hash.startsWith('#/terna/') || hash === '#/outfit-panel'

export default function App() {
  const hash = useRuta()
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: '' })
  const [mostrarTransicion, setMostrarTransicion] = useState(false)
  const hashAnterior = useRef(hash)

  useEffect(() => {
    const veniaDeTerna = hashAnterior.current.startsWith('#/terna/')
    const vaAOtraTerna = hash.startsWith('#/terna/') && hash !== hashAnterior.current
    if (veniaDeTerna && vaAOtraTerna) setMostrarTransicion(true)
    hashAnterior.current = hash
  }, [hash])

  // Chequeo de acceso (no necesita la base)
  async function chequearAcceso() {
    try {
      const r = await fetch('/api/resultados', { headers: { 'Cache-Control': 'no-cache' } })
      if (r.status === 401) {
        setRes({ estado: 'sin_acceso', datos: null, error: '' })
        return
      }
      // 503 = todavía no hay resultados.json generado: el acceso está bien igual
      if (r.status === 503) {
        setRes((s) => (s.estado === 'ok' ? s : { ...s, estado: 'ok' }))
        return
      }
      if (!r.ok) throw new Error('No se pudieron cargar los resultados')
      const datos = await r.json()
      setRes({ estado: 'ok', datos, error: '' })
    } catch (e) {
      setRes({ estado: 'error', datos: null, error: e.message })
    }
  }

  // Resultados EN VIVO: se recalculan contra la base cada 8 segundos
  async function cargarVivo() {
    try {
      const r = await fetch('/api/resultados/vivo', { headers: { 'Cache-Control': 'no-cache' } })
      if (r.status === 401) {
        setRes({ estado: 'sin_acceso', datos: null, error: '' })
        return
      }
      if (!r.ok) return
      setRes({ estado: 'ok', datos: await r.json(), error: '' })
    } catch (e) {
      // si falla la base nos quedamos con lo último que se vio
    }
  }

  useEffect(() => {
    chequearAcceso()
    cargarVivo()
    const t = setInterval(cargarVivo, 8000)
    return () => clearInterval(t)
  }, [])

  async function recargar() {
    await chequearAcceso()
    await cargarVivo()
  }

  let vista
  if (hash.startsWith('#/terna/')) {
    vista = <Terna id={decodeURIComponent(hash.slice('#/terna/'.length))} res={res} recargar={recargar} />
  } else if (hash === '#/ternas') {
    vista = <Ternas res={res} recargar={recargar} />
  } else if (hash === '#/outfit-panel') {
    vista = <OutfitPanel res={res} recargar={recargar} />
  } else {
    vista = <Outfit />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header hash={hash} autorizado={res.estado === 'ok'} recargar={recargar} />
      <main className="flex-1">
        {mostrarTransicion && <TransicionEntreTernas onContinuar={() => setMostrarTransicion(false)} />}
        {vista}
      </main>
      <Footer generado={res.estado === 'ok' ? res.datos && res.datos.generado : null} />
    </div>
  )
}

function TransicionEntreTernas({ onContinuar }) {
  return (
    <div className="terna-transition" role="dialog" aria-label="Transición entre ternas">
      <video src={TRANSITION_VIDEO} autoPlay loop muted playsInline aria-label="Video de espera" />
      <div className="terna-transition__content">
        <span className="terna-transition__spinner" aria-hidden="true" />
        <p>Cargando…</p>
      </div>
      <button
        type="button"
        className="terna-transition__next"
        onClick={onContinuar}
        aria-label="Pasar a la siguiente terna"
      >
        →
      </button>
    </div>
  )
}

/* ------------------------------- layout ------------------------------- */

function Header({ hash, autorizado, recargar }) {
  const enVotar = hash === '#/' || hash === ''
  const enTernas = hash === '#/ternas' || hash.startsWith('#/terna/')
  const enPanel = hash === '#/outfit-panel'

  async function salir() {
    await fetch('/api/salir', { method: 'POST' })
    window.location.hash = '#/'
    await recargar()
  }

  const link = (activo) =>
    `px-2.5 sm:px-3 py-2 rounded-full transition ${
      activo ? 'text-gold bg-white/5' : 'text-white/60 hover:text-white'
    }`

  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-ink/70 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
        <a href="#/" className="flex items-center gap-3 group shrink-0">
          <span className="text-gold group-hover:text-cyan transition">
            <Emblem size={34} />
          </span>
          <span className="leading-none hidden sm:block">
            <span className="block font-serif text-sm tracking-[0.28em] uppercase">Achura Awards</span>
            <span className="block text-[10px] tracking-[0.32em] uppercase text-cyan/80 mt-1">2026</span>
          </span>
        </a>

        <nav className="flex items-center gap-0.5 text-[11px] sm:text-xs uppercase tracking-[0.14em]">
          <a href="#/" className={link(enVotar)}>
            Votar outfit
          </a>
          <a href="#/ternas" className={`${link(enTernas)} flex items-center gap-1.5`} title="Sección privada">
            <span className="text-[10px]">{autorizado ? '★' : '🔒'}</span> Ternas
          </a>
          {autorizado && (
            <a href="#/outfit-panel" className={link(enPanel)}>
              Outfit en vivo
            </a>
          )}
          {autorizado && (
            <button onClick={salir} className="ml-1 px-2 py-2 rounded-full text-white/40 hover:text-white transition">
              Salir
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

function Footer({ generado }) {
  return (
    <footer className="border-t border-white/10 mt-20">
      <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
        <span className="tracking-[0.25em] uppercase">Achura Awards</span>
        {generado ? (
          <span>Resultados actualizados {new Date(generado).toLocaleTimeString('es-AR')}</span>
        ) : (
          <span>Outfit del día</span>
        )}
      </div>
    </footer>
  )
}

function Foto({ src, alt, className = '', size = 70 }) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div className={`${className} flex items-center justify-center bg-white/5 text-white/25`}>
        <Emblem size={size} />
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setError(true)} />
}

/* Foto COMPLETA: la imagen entera (sin recortes) sobre un fondo desenfocado
   de la misma foto. Así las fotos altas (los outfits) se ven bien y no cortan
   ni la cara ni el cuerpo. */
function FotoEntera({ src, alt, className = '', size = 70 }) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div className={`${className} flex items-center justify-center bg-white/5 text-white/25`}>
        <Emblem size={size} />
      </div>
    )
  }
  return (
    <span className={`${className} block overflow-hidden`}>
      <span className="relative block w-full h-full bg-ink">
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40"
        />
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setError(true)}
          className="relative w-full h-full object-contain"
        />
      </span>
    </span>
  )
}

/* ------------------------- ampliar fotos y videos ------------------------- */

/* La foto EN GRANDE (a pantalla completa, sin recortes) */
function ModalImagen({ src, alt, onCerrar }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 animate-fade"
      onClick={(e) => {
        e.stopPropagation()
        onCerrar()
      }}
    >
      <button
        onClick={onCerrar}
        aria-label="Cerrar"
        className="absolute top-4 right-4 w-10 h-10 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-cyan/60 transition text-lg"
      >
        ✕
      </button>
      <div className="max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt || ''}
          className="max-h-[88vh] max-w-[94vw] object-contain rounded-xl"
        />
      </div>
    </div>
  )
}

/* El video EN GRANDE, con botón de pantalla completa */
function ModalVideo({ src, poster, onCerrar }) {
  const ref = useRef(null)
  // Pantalla completa "a mano" (por si el navegador bloquea la nativa)
  const [expandido, setExpandido] = useState(false)
  const expandidoRef = useRef(false)
  expandidoRef.current = expandido

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (document.fullscreenElement) return
      if (expandidoRef.current) {
        setExpandido(false)
        return
      }
      onCerrar()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onCerrar])

  // Si el navegador entra en pantalla completa de verdad, apagamos la de mentira.
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) setExpandido(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Instantáneo: agrandamos el video a toda la pantalla nosotros mismos.
  // (A pedir la pantalla completa del navegador se tarda ~1 seg en algunos
  // navegadores, así que ese camino queda sólo para el botón nativo del video.)
  function pantallaCompleta() {
    setExpandido((prev) => !prev)
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center ${
        expandido ? 'bg-black p-0' : 'bg-black/95 p-4'
      }`}
      onClick={(e) => {
        e.stopPropagation()
        onCerrar()
      }}
    >
      {!expandido && (
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute top-4 right-4 w-10 h-10 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-cyan/60 transition text-lg z-10"
        >
          ✕
        </button>
      )}

      <div
        className={
          expandido
            ? 'fixed inset-0 z-[70] bg-black flex flex-col p-2'
            : 'w-full max-w-5xl'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={ref}
          src={src}
          poster={poster}
          controls
          autoPlay
          playsInline
          onDoubleClick={pantallaCompleta}
          className={
            expandido
              ? 'flex-1 min-h-0 w-full object-contain bg-black'
              : 'w-full max-h-[78vh] rounded-2xl bg-black'
          }
        />
        <div
          className={
            expandido
              ? 'py-3 flex items-center justify-center gap-3'
              : 'mt-4 flex items-center justify-center gap-3'
          }
        >
          <button
            onClick={pantallaCompleta}
            className="inline-flex items-center gap-2 border border-cyan/50 hover:bg-cyan/10 hover:text-cyan text-cyan/90 rounded-full px-5 py-2.5 text-sm transition"
          >
            {expandido ? '✕ Salir de pantalla completa' : '⛶ Pantalla completa'}
          </button>
          <button
            onClick={onCerrar}
            className="border border-white/20 hover:bg-white/5 rounded-full px-5 py-2.5 text-sm text-white/70 transition"
          >
            Cerrar
          </button>
        </div>
        {!expandido && (
          <p className="mt-3 text-center text-[11px] text-white/35">
            Doble clic en el video para ponerlo en pantalla completa.
          </p>
        )}
      </div>
    </div>
  )
}

function BadgeEnVivo({ texto = 'En vivo' }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cyan/80">
      <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
      {texto}
    </span>
  )
}

/* ------------------------- acceso a la sección privada ------------------------- */

function Acceso({ onOk }) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      const r = await fetch('/api/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Contraseña incorrecta')
      setPass('')
      await onOk()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 py-20 animate-fade-up">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="flex justify-center text-gold">
          <Emblem size={64} />
        </div>
        <p className="mt-6 text-[10px] uppercase tracking-[0.4em] text-cyan/80">Sección privada</p>
        <h1 className="font-serif text-3xl mt-3">Ternas y ganadores</h1>
        <p className="text-sm text-white/45 mt-3">Esta sección es solo para la organización.</p>
        <div className="gold-rule h-px w-32 mx-auto mt-6" />

        <form onSubmit={entrar} className="mt-7 space-y-3 text-left">
          <label className="block text-[10px] uppercase tracking-[0.25em] text-white/40" htmlFor="pass">
            Contraseña
          </label>
          <input
            id="pass"
            type="password"
            autoFocus
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl bg-white/5 border border-white/15 focus:border-cyan/70 focus:outline-none px-4 py-3 text-white placeholder:text-white/20"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={enviando || !pass}
            className="w-full bg-gold text-black font-semibold rounded-full py-3 text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <a href="#/" className="inline-block mt-6 text-xs text-white/40 hover:text-white transition">
          ← Ir a votar el outfit
        </a>
      </div>
    </div>
  )
}

function BloquePrivado({ res, recargar, children }) {
  if (res.estado === 'cargando') {
    return <p className="text-center text-white/40 py-24">Cargando…</p>
  }
  if (res.estado === 'sin_acceso') {
    return <Acceso onOk={recargar} />
  }
  if (res.estado === 'error') {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <p className="text-red-400 text-sm">{res.error}</p>
        <button onClick={recargar} className="mt-4 text-gold text-sm underline">
          Reintentar
        </button>
      </div>
    )
  }
  return children(res.datos)
}

/* ------------------------------ ternas (privado) ------------------------------ */

/* Separador de bloque: filete dorado con el nombre del bloque en el medio.
   El nombre sale de `bloque` en categories.json, así que el orden de los bloques
   se cambia editando el JSON y no el código. */
function SeparadorBloque({ nombre }) {
  return (
    <div className="col-span-full flex items-center gap-4 pt-2 animate-fade-up">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
      <span className="font-serif text-[11px] uppercase tracking-[0.45em] text-gold/90 whitespace-nowrap">
        ✦&nbsp;&nbsp;{nombre}&nbsp;&nbsp;✦
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
    </div>
  )
}

function Ternas({ res, recargar }) {
  return (
    <BloquePrivado res={res} recargar={recargar}>
      {(datos) => {
        // La terna del outfit no sale de resultados.json: su encuesta se lee en vivo
        // (y el ganador se revela recién cuando votó todo el padrón).
        const normales = categorias.filter((c) => c.tipo !== 'outfit' && c.tipo !== 'video-solo')
        const definidas = normales.filter((c) => ganadoresDe(datos, c.id).length > 0).length
        return (
          <div className="max-w-6xl mx-auto px-5 pt-14 pb-20">
            <div className="text-center animate-fade-up">
              <div className="flex justify-center mb-4">
                <BadgeEnVivo />
              </div>
              <p className="text-[11px] uppercase tracking-[0.45em] text-cyan/80">Sección privada</p>
              <h1 className="font-serif text-4xl sm:text-6xl mt-4 tracking-wide">
                LOS <span className="text-gold">GANADORES</span>
              </h1>
              <div className="gold-rule h-px w-56 mx-auto mt-6" />
              <p className="mt-6 text-white/55 max-w-xl mx-auto text-sm">
                Entrá a cada terna para ver el ganador y cómo quedaron los puestos.
              </p>
              <p className="mt-4 text-xs text-white/35">
                {definidas} de {normales.length} ternas con votos · se actualiza solo
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10 mt-14">
              {categorias.map((cat, i) => {
                const listoTerna = ganadoresDe(datos, cat.id).length > 0
                return (
                  <Fragment key={cat.id}>
                    {cat.bloque && <SeparadorBloque nombre={cat.bloque} />}
                    <a
                      href={`#/terna/${encodeURIComponent(cat.id)}`}
                      className="group flex flex-col items-center text-center animate-fade-up"
                      style={{ animationDelay: `${Math.min(i * 45, 500)}ms` }}
                    >
                      <span className="relative w-[132px] h-[132px] rounded-full p-[2px] bg-gradient-to-b from-white/25 via-white/5 to-transparent group-hover:from-gold/80 group-hover:via-gold/30 transition-all duration-300 group-hover:shadow-goldglow">
                        <Foto
                          src={fotoTerna(cat)}
                          alt={cat.nombre}
                          className="w-full h-full rounded-full object-cover object-top"
                          size={70}
                        />
                      </span>

                      <span className="mt-4 font-serif text-[13px] leading-snug tracking-[0.12em] uppercase max-w-[180px]">
                        {cat.nombre}
                      </span>

                      {cat.tipo === 'video-solo' ? (
                        <span className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/30 group-hover:text-cyan transition">
                          Ver video →
                        </span>
                      ) : cat.tipo === 'outfit' ? (
                        <EstadoOutfit />
                      ) : listoTerna ? (
                        <span className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/30 group-hover:text-cyan transition">
                          Ver ganador →
                        </span>
                      ) : (
                        <span className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/25">En votación</span>
                      )}
                    </a>
                  </Fragment>
                )
              })}
            </div>

            <p className="mt-16 text-center text-[11px] text-white/25">
              Cada persona votó 2 veces por terna: el 1º voto vale 2 puntos y el 2º vale 1 punto.
            </p>
          </div>
        )
      }}
    </BloquePrivado>
  )
}

/* ------------------------------ terna (privado) ------------------------------ */

function Terna({ id, res, recargar }) {
  const cat = categorias.find((c) => c.id === id)

  if (!cat) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center">
        <p className="text-white/60">No encontramos esa terna.</p>
        <a href="#/ternas" className="inline-block mt-6 text-gold underline">
          Volver a las ternas
        </a>
      </div>
    )
  }

  return (
    <BloquePrivado res={res} recargar={recargar}>
      {(datos) =>
        cat.tipo === 'outfit' ? (
          <DetalleOutfit key={cat.id} cat={cat} />
        ) : cat.tipo === 'video-solo' ? (
          <DetalleVideoSolo key={cat.id} cat={cat} />
        ) : (
          <DetalleTerna key={cat.id} cat={cat} datos={datos} />
        )
      }
    </BloquePrivado>
  )
}

function DetalleTerna({ cat, datos }) {
  const r = resultadoDe(datos, cat.id)
  const puestos = r.puestos || []
  const ganadores = ganadoresDe(datos, cat.id)
  const varios = ganadores.length > 1
  const conVotos = puestos.filter((p) => p.votos > 0)
  const abierta = r.permitido !== false

  // El ganador se revela a mano (es el momento de la noche). Queda revelado
  // mientras el organizador navegue entre ternas.
  const [revelado, setRevelado] = useState(() => {
    try {
      return sessionStorage.getItem('revelado_' + cat.id) === '1'
    } catch (e) {
      return false
    }
  })
  const [historia, setHistoria] = useState(null)
  const [fotoGanador, setFotoGanador] = useState(null)

  // Una terna ya revelada en esta sesión no se vuelve a revelar: se entra directo al resultado
  const mostrarGanador = revelado

  function irAPuestos() {
    const el = document.getElementById('puestos')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function revelar() {
    setRevelado(true)
    try {
      sessionStorage.setItem('revelado_' + cat.id, '1')
    } catch (e) {}
    setTimeout(() => {
      const el = document.getElementById('ganador')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }

  const siguiente = siguienteTerna(cat.id)

  return (
    <div className="max-w-5xl mx-auto px-5 pt-8 pb-20">
      <a href="#/ternas" className="text-sm text-white/50 hover:text-white transition">
        ← Volver a las ternas
      </a>

      <div className="mt-6 text-center">
        <div className="flex justify-center mb-4">
          {abierta ? <BadgeEnVivo /> : <span className="text-[10px] uppercase tracking-[0.25em] text-white/35">Cerrada</span>}
        </div>
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Terna</p>
        <h1 className="font-serif text-3xl sm:text-5xl mt-3 tracking-wide">{cat.nombre}</h1>
        <div className="gold-rule h-px w-40 mx-auto mt-5" />
      </div>

      {/* La mención (o el premio) se anuncia siempre, antes de revelar */}
      {cat.mencion && cat.mencion.trim() && (
        <div className="mt-8 rounded-2xl border border-gold/30 bg-gold/[0.04] p-5 sm:p-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
            {cat.mencion_titulo && cat.mencion_titulo.trim() ? cat.mencion_titulo : '🎖 Mención honorífica'}
          </p>
          <p className="mt-2 text-white/75">{cat.mencion}</p>
        </div>
      )}

      {/* 1) los candidatos y sus historias */}
      <Candidatos cat={cat} onAbrir={setHistoria} />

      {/* 2) el botón para revelar */}
      {!mostrarGanador && (
        <div className="mt-14 text-center animate-fade-up">
          <button
            onClick={revelar}
            className="inline-flex items-center gap-3 bg-gold text-black font-bold uppercase text-xs tracking-[0.22em] px-8 py-4 rounded-full hover:brightness-110 shadow-goldglow transition"
          >
            <span>✦</span> Revelar al ganador <span>✦</span>
          </button>
          <p className="mt-4 text-[11px] text-white/30">
            Nadie ve los resultados hasta que vos los revelás.
          </p>
        </div>
      )}

      {/* 3) los ganadores (después de revelar) */}
      {mostrarGanador && (
        <section id="ganador" className="mt-16 scroll-mt-24">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Resultado</p>
            <h2 className="font-serif text-3xl sm:text-5xl mt-3 tracking-wide">
              {varios ? 'Los ganadores' : 'El ganador'}
            </h2>
            <div className="gold-rule h-px w-40 mx-auto mt-5" />
          </div>

          {ganadores.length > 0 ? (
            <div className="mt-10 animate-reveal">
              <div className="relative rounded-3xl overflow-hidden border border-gold/25 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent shadow-goldglow">
                <div className="grid md:grid-cols-[minmax(0,400px)_1fr]">
                  <div className={`grid ${varios ? 'grid-cols-2' : 'grid-cols-1'} gap-px bg-white/10`}>
                    {ganadores.map((g) => (
                      <div key={g.id} className="relative h-64 md:h-auto md:min-h-[400px]">
                        <button
                          onClick={() => setFotoGanador(g.foto)}
                          aria-label={`Ampliar la foto de ${g.nombre}`}
                          className="absolute inset-0 w-full h-full cursor-zoom-in"
                        >
                          <FotoEntera
                            src={g.foto}
                            alt={g.nombre}
                            className="absolute inset-0 w-full h-full"
                            size={90}
                          />
                        </button>
                      </div>
                    ))}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-transparent via-transparent to-ink/90 md:to-ink/95" />
                  </div>

                  <div className="relative p-7 sm:p-10 flex flex-col justify-center items-center md:items-start text-center md:text-left">
                    <span className="text-[10px] uppercase tracking-[0.35em] text-white/40">{cat.nombre}</span>

                    <span className="mt-5 inline-flex items-center gap-2 bg-gold text-black text-[11px] font-bold tracking-[0.22em] px-4 py-1.5 rounded-full">
                      ★ {varios ? 'GANADORES' : 'GANADOR'}
                    </span>

                    {varios && (
                      <p className="mt-4 text-[10px] uppercase tracking-[0.25em] text-cyan/70">Premio compartido</p>
                    )}

                    {ganadores.map((g) => (
                      <div key={g.id} className="mt-4 md:mt-3">
                        <h3 className="font-serif text-3xl sm:text-5xl leading-[1.05]">{g.nombre}</h3>
                        <p className="mt-1.5 text-white/50 text-xs">
                          {g.votos} puntos · {g.pct}% de los votos
                        </p>
                      </div>
                    ))}

                    {!varios && r.empate && (r.empatados || []).length > 1 && (
                      <p className="mt-3 text-xs text-cyan/70">
                        Empate en puntos con {r.empatados.filter((n) => n !== ganadores[0].nombre).join(' y ')}
                      </p>
                    )}

                    {conVotos.length > 1 && (
                      <button
                        onClick={irAPuestos}
                        className="mt-7 inline-flex items-center gap-2 border border-white/20 hover:border-cyan/60 hover:text-cyan px-5 py-2.5 rounded-full text-sm transition"
                      >
                        Ver los puestos ↓
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center animate-reveal">
              <p className="text-4xl">🕒</p>
              <h3 className="font-serif text-2xl sm:text-3xl mt-4">Votación en curso</h3>
              <p className="text-white/50 mt-3 max-w-md mx-auto">
                Todavía no hay votos cargados en esta terna. Cuando se cierre la votación, acá aparece el ganador.
              </p>
            </div>
          )}

          <div id="puestos" className="mt-20 scroll-mt-24">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <BadgeEnVivo texto="Puestos en vivo" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Puestos</p>
              <h3 className="font-serif text-2xl sm:text-3xl mt-3">
                {r.total > 0 ? 'Así quedó la terna' : 'Los candidatos'}
              </h3>
              {varios && r.total > 0 && (
                <p className="mt-3 text-xs text-cyan/70">Premio compartido: los dos primeros puestos son ganadores.</p>
              )}
              {r.total > 0 && (
                <p className="text-xs text-white/40 mt-3">
                  {Array.isArray(r.pesos) && r.pesos.length === 1
                    ? 'En esta terna cada persona vota una sola vez: 2 puntos.'
                    : 'Cada persona votó 2 veces: el 1º voto vale 2 puntos y el 2º vale 1 punto.'}
                </p>
              )}
              <div className="gold-rule h-px w-32 mx-auto mt-5" />
            </div>

            {conVotos.length > 0 ? (
              <>
                {!varios && <Podio puestos={conVotos.slice(0, 3)} />}

                <div className="mt-14 space-y-3">
                  {puestos.map((p, i) => (
                    <FilaPuesto
                      key={p.id}
                      puesto={p}
                      posicion={i + 1}
                      maximo={puestos[0]?.votos || 1}
                      esGanador={ganadores.some((g) => g.id === p.id)}
                      lider={!varios && i === 0 && abierta}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-10 text-center text-white/40">Todavía no hay votos en esta terna.</p>
            )}
          </div>

          {/* 4) continuar con la próxima terna */}
          <div className="mt-16 text-center">
            <a
              href={siguiente}
              className="inline-flex items-center justify-center gap-2 bg-gold text-black font-bold uppercase text-xs tracking-[0.2em] px-7 py-3.5 rounded-full hover:brightness-110 shadow-goldglow transition"
            >
              {siguiente === '#/ternas' ? 'Volver a las ternas' : 'Continuar →'}
            </a>
          </div>
        </section>
      )}

      {historia && <ModalHistoria cat={cat} nom={historia} onCerrar={() => setHistoria(null)} />}

      {fotoGanador && (
        <ModalImagen src={fotoGanador} alt="Ganador" onCerrar={() => setFotoGanador(null)} />
      )}
    </div>
  )
}

/* --------------------- los candidatos y sus historias --------------------- */

function tieneHistoria(n) {
  return (n.story || []).some((b) => (b.contenido || '').trim())
}

function Candidatos({ cat, onAbrir }) {
  const [videoAbierto, setVideoAbierto] = useState(null)
  // Cuando la terna tiene 3 candidatos (las 3 parejas de "Achura mas gobernado")
  // no se dejan pegados a la izquierda: se centran.
  const sonTres = (cat.nominados || []).length === 3

  return (
    <section id="candidatos" className="mt-12">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">La terna</p>
        <h2 className="font-serif text-2xl sm:text-3xl mt-3">Los candidatos</h2>
        <p className="mt-3 text-xs text-white/40">Tocá a un candidato para ver su historia.</p>
        {cat.narrador && (
          <p className="mt-2 text-xs text-gold/85">Las historias las cuenta {cat.narrador}</p>
        )}
        <div className="gold-rule h-px w-32 mx-auto mt-5" />
      </div>

      <div
        className={`mt-10 grid gap-5 sm:gap-6 ${
          sonTres
            ? 'grid-cols-2 sm:grid-cols-3 max-w-4xl mx-auto'
            : 'grid-cols-2 sm:grid-cols-4'
        }`}
      >
        {(cat.nominados || []).map((n, i) => (
          <button
            key={n.id}
            onClick={() => onAbrir(n)}
            className={`group text-left animate-fade-up ${
              sonTres && i === 2
                ? 'col-span-2 sm:col-span-1 w-[calc(50%_-_0.625rem)] sm:w-full mx-auto sm:mx-0'
                : ''
            }`}
            style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}
          >
            <span className="relative block">
              <FotoEntera
                src={fotoDe(n)}
                alt={n.nombre}
                className="w-full h-48 sm:h-56 rounded-xl border border-white/10 group-hover:border-gold/50 transition"
                size={60}
              />
              {esVideo(n.media) && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    setVideoAbierto(n)
                  }}
                  title="Ver el video en pantalla completa"
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                >
                  <span className="bg-black/60 text-white rounded-full w-10 h-10 flex items-center justify-center text-sm group-hover:bg-cyan group-hover:text-black transition">
                    ▶
                  </span>
                </span>
              )}
              {tieneHistoria(n) && (
                <span className="absolute bottom-2 right-2 bg-black/70 text-white rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  📖 Historia
                </span>
              )}
            </span>
            <span className="block mt-3 text-center font-semibold text-white/85 group-hover:text-gold transition">
              {n.nombre}
            </span>
          </button>
        ))}
      </div>

      {videoAbierto && (
        <ModalVideo
          src={videoAbierto.media}
          poster={videoAbierto.poster}
          onCerrar={() => setVideoAbierto(null)}
        />
      )}
    </section>
  )
}

function ModalHistoria({ cat, nom, onCerrar }) {
  const bloques = (nom.story || []).filter((b) => (b.contenido || '').trim())
  const video = esVideo(nom.media)
  const [fotoGrande, setFotoGrande] = useState(null)
  const [videoGrande, setVideoGrande] = useState(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-5"
      onClick={onCerrar}
    >
      <div
        className="bg-ink border border-white/15 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan/80">{cat.nombre}</p>
          <h3 className="font-serif text-2xl sm:text-3xl mt-1">{nom.nombre}</h3>
          <div className="gold-rule h-px w-24 mt-4" />
          {cat.narrador && (
            <p className="mt-3 text-sm text-gold/90">Historia contada por {cat.narrador}</p>
          )}

          {video ? (
            <div className="mt-6">
              <video src={nom.media} poster={nom.poster} controls autoPlay playsInline className="w-full rounded-xl" />
              <button
                onClick={() => setVideoGrande(nom)}
                className="mt-3 inline-flex items-center gap-2 border border-cyan/50 hover:bg-cyan/10 hover:text-cyan text-cyan/90 rounded-full px-4 py-2 text-xs uppercase tracking-[0.15em] transition"
              >
                ⛶ Ver en pantalla completa
              </button>
            </div>
          ) : (
            <button
              onClick={() => setFotoGrande(fotoDe(nom))}
              aria-label={`Ampliar la foto de ${nom.nombre}`}
              className="block w-full cursor-zoom-in"
            >
              <FotoEntera
                src={fotoDe(nom)}
                alt={nom.nombre}
                className="w-full h-80 rounded-xl mt-6"
                size={60}
              />
              <span className="mt-2 block text-[11px] uppercase tracking-[0.2em] text-white/35">
                Tocá la foto para verla grande
              </span>
            </button>
          )}

          {bloques.length > 0 && (
            <div className="text-white/90 space-y-4 mt-6">
              {bloques.map((b, i) =>
                b.tipo === 'titulo' ? (
                  <p key={i} className="font-serif text-xl text-gold">
                    {b.contenido}
                  </p>
                ) : (
                  <p key={i} className="leading-relaxed whitespace-pre-line">
                    {b.contenido}
                  </p>
                )
              )}
            </div>
          )}

          <button
            onClick={onCerrar}
            className="mt-8 w-full border border-white/20 hover:border-cyan/60 hover:text-cyan rounded-full py-2.5 text-sm transition"
          >
            Cerrar
          </button>
        </div>
      </div>

      {fotoGrande && (
        <ModalImagen src={fotoGrande} alt={nom.nombre} onCerrar={() => setFotoGrande(null)} />
      )}
      {videoGrande && (
        <ModalVideo
          src={videoGrande.media}
          poster={videoGrande.poster}
          onCerrar={() => setVideoGrande(null)}
        />
      )}
    </div>
  )
}

function Podio({ puestos }) {
  const orden = [1, 0, 2].filter((i) => puestos[i])
  const alturas = { 0: 'md:mt-0', 1: 'md:mt-8', 2: 'md:mt-12' }
  const medallas = ['🥇', '🥈', '🥉']

  return (
    <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 items-end max-w-3xl mx-auto">
      {orden.map((idx) => {
        const p = puestos[idx]
        const primero = idx === 0
        return (
          <div
            key={p.id}
            className={`relative rounded-2xl border p-5 text-center animate-reveal ${alturas[idx]} ${
              primero ? 'border-gold/50 bg-gold/[0.06] shadow-goldglow' : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <p className="text-2xl">{medallas[idx]}</p>
            <Foto
              src={p.foto}
              alt={p.nombre}
              className={`mt-3 mx-auto rounded-full object-cover object-top border-2 ${
                primero ? 'w-32 h-32 border-gold/60' : 'w-24 h-24 border-white/20'
              }`}
              size={primero ? 66 : 52}
            />
            <p className={`mt-4 font-semibold leading-tight ${primero ? 'text-gold text-lg' : 'text-white/85'}`}>
              {p.nombre}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {p.votos} pts · {p.pct}%
            </p>
          </div>
        )
      })}
    </div>
  )
}

function FilaPuesto({ puesto, posicion, maximo, esGanador, lider }) {
  const ancho = maximo > 0 ? Math.max((puesto.votos / maximo) * 100, puesto.votos > 0 ? 6 : 0) : 0

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
        esGanador ? 'border-gold/30 bg-gold/[0.04]' : 'border-white/5 bg-white/[0.02]'
      }`}
    >
      <span className={`w-7 text-center font-serif ${esGanador ? 'text-gold' : 'text-white/40'}`}>{posicion}</span>
      <Foto src={puesto.foto} alt={puesto.nombre} className="w-10 h-10 rounded-full object-cover object-top" size={26} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className={`truncate ${esGanador ? 'text-gold' : 'text-white/85'}`}>
            {esGanador && <span className="mr-1">★</span>}
            {puesto.nombre}
            {lider && <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-cyan/70">Líder</span>}
          </p>
          <p className="text-xs text-white/45 whitespace-nowrap">
            {puesto.votos} pts · {puesto.pct}%
          </p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full ${esGanador ? 'bg-gold' : 'bg-cyan/60'}`}
            style={{ width: `${ancho}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/* ------------------- outfit del día EN VIVO (privado, organizador) ------------------- */

function OutfitPanel({ res, recargar }) {
  return (
    <BloquePrivado res={res} recargar={recargar}>
      {() => (
        <div className="max-w-5xl mx-auto px-5 pt-12 pb-20">
          <a href="#/ternas" className="text-sm text-white/50 hover:text-white transition">
            ← Volver a las ternas
          </a>

          <div className="mt-6 text-center">
            <div className="flex justify-center mb-4">
              <BadgeEnVivo />
            </div>
            <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Organizador</p>
            <h1 className="font-serif text-3xl sm:text-5xl mt-3 tracking-wide">Outfit del día</h1>
            <div className="gold-rule h-px w-40 mx-auto mt-5" />
            <a
              href="#/terna/outfit-del-dia"
              className="mt-5 inline-block text-[11px] uppercase tracking-[0.2em] text-cyan/70 hover:text-cyan transition"
            >
              Ver la terna (revelar ganador) →
            </a>
          </div>

          <OutfitEnVivo />
        </div>
      )}
    </BloquePrivado>
  )
}

/* ---- datos del outfit EN VIVO: ranking, quiénes votaron y padrón ---- */

function useOutfitVivo(intervalo = 5000) {
  const [d, setD] = useState(null)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        const r = await fetch('/api/outfit/detalle', { headers: { 'Cache-Control': 'no-cache' } })
        if (!r.ok) return
        const data = await r.json()
        if (vivo) setD(data)
      } catch (e) {
        // nos quedamos con lo último que se vio
      }
    }
    cargar()
    const t = setInterval(cargar, intervalo)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [intervalo])

  return d
}

const votosTexto = (n) => `${n} ${n === 1 ? 'voto' : 'votos'}`
const horaDe = (f) =>
  new Date(f).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

function RankingOutfit({ ranking = [], maximo = 1, destacar = false, mostrarPuestos = true }) {
  return (
    <div className="space-y-3">
      {ranking.map((inv, i) => {
        const primero = destacar && i === 0 && inv.votos > 0
        return (
          <div
            key={inv.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
              primero ? 'border-gold/40 bg-gold/[0.05]' : 'border-white/5 bg-white/[0.02]'
            }`}
          >
            {mostrarPuestos && (
              <span className={`w-6 text-center font-serif text-sm ${primero ? 'text-gold' : 'text-white/35'}`}>
                {i + 1}
              </span>
            )}
            <AvatarInvitado invitado={inv} className="w-9 h-9 rounded-full" text="text-[11px]" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className={`truncate text-sm ${primero ? 'text-gold' : 'text-white/85'}`}>{inv.nombre}</p>
                <p className="text-xs text-white/45 whitespace-nowrap">{votosTexto(inv.votos)}</p>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${primero ? 'bg-gold' : 'bg-cyan/60'}`}
                  style={{ width: `${inv.votos > 0 ? Math.max((inv.votos / maximo) * 100, 6) : 0}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QuienesVotaron({ ultimos = [] }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/35">Quiénes votaron</p>
      {ultimos.length ? (
        <ul className="mt-3 space-y-1.5 max-h-80 overflow-auto pr-2">
          {ultimos.map((v, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 text-sm text-white/60 border-b border-white/5 pb-1.5"
            >
              <span className="truncate">{v.nombre}</span>
              <span className="text-[11px] text-white/30 whitespace-nowrap">{horaDe(v.fecha)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-white/30">Todavía no votó nadie.</p>
      )}
    </div>
  )
}

// Paso 1 de la terna del outfit: quiénes votaron y quiénes faltan
function ListaVotacion({ votaron = [], faltaron = [], padron = 0 }) {
  return (
    <div className="grid sm:grid-cols-2 gap-5">
      <div className="rounded-2xl border border-cyan/25 bg-cyan/[0.04] p-5">
        <p className="text-[11px] uppercase tracking-[0.25em] text-cyan/80">
          ✓ Votaron ({votaron.length})
        </p>
        {votaron.length ? (
          <ul className="mt-3 space-y-1.5 max-h-72 overflow-auto pr-1">
            {votaron.map((v, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-sm text-white/70 border-b border-white/5 pb-1.5"
              >
                <span className="truncate">{v.nombre}</span>
                <span className="text-[11px] text-white/30 whitespace-nowrap">{horaDe(v.fecha)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-white/30">Todavía no votó nadie.</p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="text-[11px] uppercase tracking-[0.25em] text-gold/80">
          ⏳ Faltaron ({faltaron.length})
        </p>
        {faltaron.length ? (
          <ul className="mt-3 space-y-1.5 max-h-72 overflow-auto pr-1">
            {faltaron.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2.5 text-sm text-white/65 border-b border-white/5 pb-1.5"
              >
                <AvatarInvitado invitado={f} className="w-7 h-7 rounded-full shrink-0" text="text-[10px]" />
                <span className="truncate">{f.nombre}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gold/70">No falta nadie: votaron los {padron}.</p>
        )}
      </div>

      <p className="sm:col-span-2 text-center text-[11px] text-white/25">
        Cada invitado elige su nombre de la lista: una persona, un voto.
      </p>
    </div>
  )
}

function OutfitEnVivo() {
  const d = useOutfitVivo(5000)

  if (!d) return <p className="text-center text-white/40 py-16">Cargando…</p>

  const maximo = d.ranking[0]?.votos || 1
  const padron = d.padron || 0

  return (
    <div className="mt-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl sm:text-3xl">Ranking en vivo</h2>
          <p className="text-xs text-white/40 mt-2">
            {d.votaronTotal ?? d.total} de {padron} votaron · {d.activo ? 'votación abierta' : 'votación cerrada'}
            {d.faltan > 0 ? ` · faltan ${d.faltan}` : ' · ¡ya votaron todos!'}
          </p>
        </div>
        <BadgeEnVivo texto="Se actualiza solo" />
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-8">
        <RankingOutfit ranking={d.ranking} maximo={maximo} destacar />
        <QuienesVotaron ultimos={d.ultimos} />
      </div>
    </div>
  )
}

// Estado corto para la tarjeta del outfit en la portada de las ternas
function EstadoOutfit() {
  const d = useOutfitVivo(6000)

  if (!d) {
    return <span className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/25 group-hover:text-cyan transition">En vivo →</span>
  }

  const padron = d.padron || 0
  const votaronTotal = d.votaronTotal ?? d.total ?? 0
  const faltan = typeof d.faltan === 'number' ? d.faltan : Math.max(0, padron - votaronTotal)

  return (
    <span
      className={`mt-2 text-[11px] uppercase tracking-[0.2em] ${
        faltan === 0 ? 'text-gold/80' : 'text-white/30 group-hover:text-cyan transition'
      }`}
    >
      {faltan === 0 ? 'Ver ganador →' : `${votaronTotal} de ${padron} votaron`}
    </span>
  )
}

/* ---------- la terna del Outfit del día: encuesta en vivo y ganador ---------- */

function DetalleOutfit({ cat }) {
  const d = useOutfitVivo(4000)
  // 0 = encuesta · 1 = quiénes votaron / quiénes faltaron · 2 = ganador
  const [paso, setPaso] = useState(() => {
    try {
      const g = sessionStorage.getItem('outfit_paso_' + cat.id)
      return g === '2' ? 2 : g === '1' ? 1 : 0
    } catch (e) {
      return 0
    }
  })

  const mostrarGanador = paso === 2
  const siguiente = siguienteTerna(cat.id)

  function irA(p, ancla) {
    setPaso(p)
    try {
      sessionStorage.setItem('outfit_paso_' + cat.id, String(p))
    } catch (e) {}
    setTimeout(() => {
      const el = document.getElementById(ancla)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }

  // 1er click: quiénes votaron y quiénes faltan
  const verVotacion = () => irA(1, 'votacion')

  // 2do click: recién ahí el ganador (y sólo si votaron todos)
  function verGanador() {
    if (!listo) return
    irA(2, 'ganador')
  }

  const total = (d && (d.votaronTotal ?? d.total)) || 0
  const padron = (d && d.padron) || 0
  const faltan = d && typeof d.faltan === 'number' ? d.faltan : Math.max(0, padron - total)
  const listo = !!(d && d.listo)
  const ranking = (d && d.ranking) || []

  // Antes de revelar no se ordena por votos: se muestran en el orden del padrón
  // para no spoilear el podio. Después del reveal sí, con el 1º en dorado.
  const porOrden = [...ranking].sort((a, b) => (a.orden || 0) - (b.orden || 0))
  const ordenado = [...ranking].sort((a, b) => b.votos - a.votos || (a.orden || 0) - (b.orden || 0))
  const maximo = Math.max(1, ...ranking.map((r) => r.votos || 0))
  const conVotos = ordenado.filter((p) => p.votos > 0)
  const ganadores = conVotos.length ? conVotos.filter((p) => p.votos === conVotos[0].votos) : []

  return (
    <div className="max-w-5xl mx-auto px-5 pt-8 pb-20">
      <a href="#/ternas" className="text-sm text-white/50 hover:text-white transition">
        ← Volver a las ternas
      </a>

      <div className="mt-6 text-center">
        <div className="flex justify-center mb-4">
          <BadgeEnVivo />
        </div>
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Terna</p>
        <h1 className="font-serif text-3xl sm:text-5xl mt-3 tracking-wide">{cat.nombre}</h1>
        <div className="gold-rule h-px w-40 mx-auto mt-5" />
        <p className="mt-5 text-white/55 text-sm max-w-md mx-auto">
          La encuesta del outfit, en vivo. El ganador se revela cuando votaron los {padron || 'invitados'}.
        </p>
      </div>

      {!d ? (
        <p className="text-center text-white/40 py-16">Cargando la encuesta…</p>
      ) : (
        <>
          <section className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-cyan/80">Encuesta en vivo</p>
                <h2 className="font-serif text-2xl sm:text-3xl mt-2">
                  {total} de {padron} ya votaron
                </h2>
                <p className="mt-2 text-xs text-white/40">
                  {faltan > 0 ? `Faltan ${faltan} para que voten todos.` : '¡Ya votaron todos!'}
                </p>
              </div>
              <BadgeEnVivo texto="Se actualiza solo" />
            </div>

            <div className="mt-5 h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${listo ? 'bg-gold' : 'bg-cyan/70'}`}
                style={{ width: `${padron ? Math.min(100, Math.round((total / padron) * 100)) : 0}%` }}
              />
            </div>

            <div className="mt-8 max-w-2xl mx-auto">
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/35">
                {mostrarGanador ? 'Resultado' : 'Votos por invitado'}
              </p>
              <div className="mt-3">
                <RankingOutfit
                  ranking={mostrarGanador ? ordenado : porOrden}
                  maximo={maximo}
                  destacar={mostrarGanador}
                  mostrarPuestos={mostrarGanador}
                />
              </div>
              {!mostrarGanador && (
                <p className="mt-4 text-center text-[11px] text-white/25">
                  Se ordena y se destaca el 1º cuando se muestra el ganador.
                </p>
              )}
            </div>
          </section>

          {/* Paso 1: al tocar "Revelar al ganador" se ve quiénes votaron y quiénes faltan */}
          {paso >= 1 && (
            <section id="votacion" className="mt-14 scroll-mt-24 animate-fade-up">
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">La votación</p>
                <h2 className="font-serif text-2xl sm:text-4xl mt-3 tracking-wide">
                  Quiénes votaron y quiénes faltan
                </h2>
                <div className="gold-rule h-px w-40 mx-auto mt-5" />
              </div>

              <div className="mt-8">
                <ListaVotacion
                  votaron={(d && (d.votantes || d.ultimos)) || []}
                  faltaron={(d && d.faltantes) || []}
                  padron={padron}
                />
              </div>

              {!mostrarGanador && (
                <div className="mt-10 text-center">
                  <button
                    onClick={verGanador}
                    disabled={!listo}
                    className={`inline-flex items-center gap-3 font-bold uppercase text-xs tracking-[0.22em] px-8 py-4 rounded-full transition ${
                      listo
                        ? 'bg-gold text-black hover:brightness-110 shadow-goldglow'
                        : 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    <span>✦</span>
                    {listo
                      ? 'Mostrar al ganador'
                      : !padron
                        ? 'Sin invitados'
                        : faltan === 1
                          ? 'Falta 1 voto'
                          : `Faltan ${faltan} votos`}
                    <span>✦</span>
                  </button>
                  <p className="mt-4 text-[11px] text-white/30">
                    {listo
                      ? `Ya votaron los ${padron}. Es el momento.`
                      : `El ganador se muestra recién cuando los ${padron} hayan votado.`}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Paso 0 → 1: el botón muestra primero quiénes votaron y quiénes faltaron */}
          {paso === 0 && (
            <div className="mt-12 text-center animate-fade-up">
              <button
                onClick={verVotacion}
                className="inline-flex items-center gap-3 bg-gold text-black font-bold uppercase text-xs tracking-[0.22em] px-8 py-4 rounded-full hover:brightness-110 shadow-goldglow transition"
              >
                <span>✦</span>
                Revelar al ganador
                <span>✦</span>
              </button>
              <p className="mt-4 text-[11px] text-white/30">
                Primero se muestran <strong className="text-white/55">quiénes votaron</strong> y{' '}
                <strong className="text-white/55">quiénes faltaron</strong>; después, el ganador.
              </p>
            </div>
          )}

          {/* El ganador (después de revelar) */}
          {mostrarGanador && (
            <section id="ganador" className="mt-16 scroll-mt-24">
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Resultado</p>
                <h2 className="font-serif text-3xl sm:text-5xl mt-3 tracking-wide">
                  {ganadores.length > 1 ? 'Los ganadores' : 'El ganador'}
                </h2>
                <div className="gold-rule h-px w-40 mx-auto mt-5" />
              </div>

              {ganadores.length > 0 ? (
                <div className="mt-10 rounded-3xl border border-gold/25 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent shadow-goldglow p-8 sm:p-10 text-center animate-reveal">
                  <div className={`grid gap-8 ${ganadores.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {ganadores.map((g) => (
                      <div key={g.id}>
                        <AvatarInvitado invitado={g} className="w-28 h-28 rounded-full mx-auto" text="text-4xl" />
                        <p className="mt-5 inline-flex items-center gap-2 bg-gold text-black text-[11px] font-bold tracking-[0.22em] px-4 py-1.5 rounded-full">
                          ★ {ganadores.length > 1 ? 'GANADORES' : 'GANADOR'}
                        </p>
                        <h3 className="font-serif text-3xl sm:text-4xl mt-4 leading-tight">{g.nombre}</h3>
                        <p className="mt-1.5 text-white/50 text-xs">
                          {votosTexto(g.votos)} · {total ? Math.round((g.votos / total) * 1000) / 10 : 0}%
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-7 text-xs text-white/35">
                    {ganadores.length > 1
                      ? 'Empate en el primer puesto: el premio es compartido.'
                      : 'El outfit más votado de la noche.'}
                  </p>
                </div>
              ) : (
                <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
                  <p className="text-4xl">🕒</p>
                  <h3 className="font-serif text-2xl sm:text-3xl mt-4">Sin votos todavía</h3>
                  <p className="text-white/50 mt-3 max-w-md mx-auto">
                    Cuando voten los {padron}, acá aparece el ganador.
                  </p>
                </div>
              )}

              <div className="mt-16 text-center">
                <a
                  href={siguiente}
                  className="inline-flex items-center justify-center gap-2 bg-gold text-black font-bold uppercase text-xs tracking-[0.2em] px-7 py-3.5 rounded-full hover:brightness-110 shadow-goldglow transition"
                >
                  {siguiente === '#/ternas' ? 'Volver a las ternas' : 'Continuar →'}
                </a>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* -------------------------- terna de video (sin votación) -------------------------- */

function DetalleVideoSolo({ cat }) {
  const [videoGrande, setVideoGrande] = useState(false)
  const posterior = cat.poster && !esPlaceholder(cat.poster) ? cat.poster : undefined
  const siguiente = siguienteTerna(cat.id)

  return (
    <div className="max-w-5xl mx-auto px-5 pt-8 pb-20">
      <a href="#/ternas" className="text-sm text-white/50 hover:text-white transition">
        ← Volver a las ternas
      </a>

      <div className="mt-6 text-center">
        <div className="flex justify-center mb-4">
          <BadgeEnVivo texto="Video" />
        </div>
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Terna</p>
        <h1 className="font-serif text-3xl sm:text-5xl mt-3 tracking-wide">{cat.nombre}</h1>
        <div className="gold-rule h-px w-40 mx-auto mt-5" />
      </div>

      <div className="mt-10 rounded-3xl overflow-hidden border border-white/10 bg-black shadow-[0_40px_80px_-60px_rgba(18,199,228,0.25)]">
        <video
          src={cat.video}
          poster={posterior}
          controls
          autoPlay
          playsInline
          className="w-full max-h-[78vh] bg-black"
        />
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => setVideoGrande(true)}
          className="inline-flex items-center gap-2 border border-cyan/50 hover:bg-cyan/10 hover:text-cyan text-cyan/90 rounded-full px-5 py-2.5 text-sm transition"
        >
          ⛶ Ver en pantalla completa
        </button>
      </div>

      <div className="mt-14 text-center">
        <a
          href={siguiente}
          className="inline-flex items-center justify-center gap-2 bg-gold text-black font-bold uppercase text-xs tracking-[0.2em] px-7 py-3.5 rounded-full hover:brightness-110 shadow-goldglow transition"
        >
          {siguiente === '#/ternas' ? 'Volver a las ternas' : 'Continuar →'}
        </a>
      </div>

      {videoGrande && (
        <ModalVideo src={cat.video} poster={posterior} onCerrar={() => setVideoGrande(false)} />
      )}
    </div>
  )
}

/* ---------------------------- outfit del día (público) ---------------------------- */

const VOTANTE_KEY = 'achura_outfit_votante'

const normalizarNombre = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// A qué invitado del padrón corresponde el nombre que se escribió.
// Acepta nombre y apellido en cualquier orden, alias ("Joaco", "Gordi") y
// abreviaturas de 4+ letras ("Joaq", "Sofi"). Si hay dudas, pide el nombre completo.
function buscarInvitado(invitados, texto) {
  const k = normalizarNombre(texto)
  if (k.length < 2) return { error: 'Escribí tu nombre para votar.' }
  const busca = k.split(' ')
  const filtrar = (modo) =>
    (invitados || []).filter((inv) => {
      const nombres = [inv.nombre, ...(inv.alias || [])].map(normalizarNombre)
      return nombres.some((n) => {
        const partes = n.split(' ')
        return busca.every((t) =>
          modo === 'exacto' ? partes.includes(t) : partes.some((p) => p.startsWith(t))
        )
      })
    })
  const exactos = filtrar('exacto')
  const candidatos = exactos.length ? exactos : filtrar('prefijo')
  if (!candidatos.length) {
    return { error: 'No encontramos ese nombre en la lista. Escribí nombre y apellido (o tu apodo).' }
  }
  if (candidatos.length > 1) {
    return { error: 'Hay más de una persona con ese nombre. Escribí el nombre completo.' }
  }
  return { id: candidatos[0].id, nombre: candidatos[0].nombre }
}

function Outfit() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [elegido, setElegido] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [nombreTemp, setNombreTemp] = useState('')
  const [votanteId, setVotanteId] = useState(() => {
    try {
      return localStorage.getItem(VOTANTE_KEY) || ''
    } catch (e) {
      return ''
    }
  })

  function elegirVotante(id) {
    try {
      localStorage.setItem(VOTANTE_KEY, id)
    } catch (e) {}
    setVotanteId(id)
    setError('')
  }

  function cambiarVotante() {
    try {
      localStorage.removeItem(VOTANTE_KEY)
    } catch (e) {}
    setVotanteId('')
    setNombreTemp('')
    setElegido(null)
  }

  function guardarNombre(e) {
    e.preventDefault()
    const lista = (estado && estado.invitados) || []
    const yaVotaron = (estado && estado.votantes) || []
    const r = buscarInvitado(lista, nombreTemp)
    if (r.error) {
      setError(r.error)
      return
    }
    if (yaVotaron.includes(r.id)) {
      setError('Ese nombre ya votó. Si sos otra persona, escribí tu nombre completo.')
      return
    }
    setError('')
    elegirVotante(r.id)
  }

  async function cargar() {
    try {
      const r = await fetch('/api/outfit')
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar la votación')
      setEstado(d)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 8000)
    return () => clearInterval(t)
  }, [])

  async function votar(invitado) {
    setEnviando(true)
    setError('')
    try {
      const r = await fetch('/api/outfit/votar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invitado.id, votante: votanteId }),
      })
      const d = await r.json()
      if (!r.ok) {
        // Ese nombre ya votó: que elija el suyo
        if (d.yaVoto) cambiarVotante()
        throw new Error(d.error || 'No se pudo registrar el voto')
      }
      setElegido(null)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (!estado) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center text-white/50">
        {error ? <p className="text-red-400">{error}</p> : 'Cargando…'}
      </div>
    )
  }

  const { invitados, yaVoto, miVoto, miNombre, activo, baseOk, titulo } = estado
  const votantes = estado.votantes || []
  const padron = estado.padron || invitados.length
  const votaron = votantes.length
  const completo = padron > 0 && votaron >= padron
  const votado = invitados.find((i) => i.id === miVoto)
  const puedenVotar = activo && baseOk && !yaVoto
  // El nombre elegido no vale si ya votó (desde otro celular)
  const votante = votantes.includes(votanteId) ? null : invitados.find((i) => i.id === votanteId) || null
  const necesitaNombre = puedenVotar && !votante && !completo

  return (
    <div className="max-w-5xl mx-auto px-5 pt-12 pb-20">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Votación de la noche</p>
        <h1 className="font-serif text-4xl sm:text-6xl mt-4 tracking-wide">{titulo || 'Outfit del día'}</h1>
        <div className="gold-rule h-px w-40 mx-auto mt-5" />
        <p className="mt-5 text-white/55 text-sm max-w-md mx-auto">
          {necesitaNombre
            ? 'Escribí tu nombre y votá el mejor outfit de la noche. Cada uno vota una sola vez.'
            : completo && puedenVotar
              ? `¡Ya votaron las ${padron} personas!`
              : puedenVotar
                ? 'Elegí el mejor outfit de la noche. Un voto por persona.'
                : yaVoto
                  ? '¡Gracias por votar!'
                  : 'La votación está cerrada.'}
        </p>

        {/* Conteo en vivo: los nombres que ya votaron, sin pasar el padrón */}
        <div className="mt-7 max-w-sm mx-auto">
          <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.2em]">
            <span className="text-white/40">Ya votaron</span>
            <span className={completo ? 'text-gold' : 'text-cyan/80'}>
              {votaron} de {padron}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${completo ? 'bg-gold' : 'bg-cyan/70'}`}
              style={{ width: `${padron ? Math.min(100, Math.round((votaron / padron) * 100)) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-6 text-center text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!baseOk && (
        <p className="mt-6 text-center text-sm text-yellow-300/80 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
          La votación no está disponible en este momento (sin conexión a la base).
        </p>
      )}

      {necesitaNombre && (
        <form
          onSubmit={guardarNombre}
          className="mt-10 max-w-sm mx-auto rounded-3xl border border-white/10 bg-white/[0.03] p-7 text-center animate-fade-up"
        >
          <p className="text-[10px] uppercase tracking-[0.32em] text-cyan/80">Ingresá tu nombre</p>
          <p className="mt-2 text-sm text-white/45">Para registrar tu voto del outfit.</p>
          <input
            autoFocus
            value={nombreTemp}
            onChange={(e) => setNombreTemp(e.target.value)}
            maxLength={40}
            placeholder="Tu nombre"
            className="mt-5 w-full rounded-xl bg-white/5 border border-white/15 focus:border-cyan/70 focus:outline-none px-4 py-3 text-center text-lg text-white placeholder:text-white/25"
          />
          <button
            type="submit"
            disabled={nombreTemp.replace(/\s+/g, ' ').trim().length < 2}
            className="mt-3 w-full bg-gold text-black font-semibold rounded-full py-3 text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar
          </button>
          <p className="mt-4 text-[11px] text-white/25">
            Tiene que coincidir con la lista de invitados ({padron}). Podés usar tu apodo.
          </p>
        </form>
      )}

      {puedenVotar && votante && (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-sm text-white/40">
          <span>
            Votás como <span className="text-gold">{votante.nombre}</span>
          </span>
          <button
            onClick={cambiarVotante}
            className="text-[11px] uppercase tracking-[0.2em] underline hover:text-white transition"
          >
            cambiar
          </button>
        </div>
      )}

      {yaVoto && (
        <div className="mt-12 max-w-md mx-auto rounded-3xl border border-gold/40 bg-gold/[0.06] p-8 text-center animate-reveal">
          <p className="text-4xl">✓</p>
          <p className="font-serif text-3xl mt-4">{votado ? votado.nombre : 'Voto registrado'}</p>
          {miNombre && <p className="text-sm text-white/50 mt-3">Tu voto quedó registrado como {miNombre}.</p>}
          <p className="text-xs text-white/35 mt-4">
            Ya votaron {votaron} de {padron}.
          </p>
          <p className="text-xs text-white/35 mt-1">
            Los resultados se dan en la noche de los premios.
          </p>
        </div>
      )}

      {!activo && !yaVoto && (
        <div className="mt-12 max-w-md mx-auto rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-3xl">🔒</p>
          <p className="font-serif text-2xl mt-4">La votación está cerrada</p>
          <p className="text-sm text-white/45 mt-3">Gracias a todos los que participaron.</p>
        </div>
      )}

      {puedenVotar && completo && (
        <div className="mt-10 max-w-md mx-auto rounded-3xl border border-gold/30 bg-gold/[0.05] p-7 text-center animate-fade-up">
          <p className="text-2xl">✓</p>
          <p className="font-serif text-2xl mt-3">Ya votaron los {padron}</p>
          <p className="text-sm text-white/50 mt-2">Gracias, equipo. Los resultados se dan en la noche.</p>
        </div>
      )}

      {puedenVotar && votante && (
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {invitados.map((inv, i) => (
            <div
              key={inv.id}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center hover:border-cyan/60 hover:bg-white/[0.06] transition animate-fade-up"
              style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
            >
              <AvatarInvitado
                invitado={inv}
                className="w-20 h-20 rounded-full mx-auto"
                text="text-2xl"
              />
              <p className="mt-3 text-sm text-white/85 group-hover:text-white">{inv.nombre}</p>
              <button
                onClick={() => setElegido(inv)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-cyan/70 hover:text-cyan transition"
              >
                Votar →
              </button>
            </div>
          ))}
        </div>
      )}

      {!invitados.length && (
        <p className="mt-10 text-center text-white/40">Todavía no hay invitados cargados.</p>
      )}

      {elegido && (
        <div
          className="fixed inset-0 z-40 bg-black/85 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={() => !enviando && setElegido(null)}
        >
          <div
            className="bg-ink border border-white/15 rounded-2xl p-6 max-w-sm w-full text-center animate-reveal"
            onClick={(e) => e.stopPropagation()}
          >
            <AvatarInvitado
              invitado={elegido}
              className="w-24 h-24 rounded-full mx-auto"
              text="text-3xl"
            />

            <p className="mt-4 text-sm text-white/60">¿Votás el outfit de</p>
            <p className="font-serif text-2xl mt-1">{elegido.nombre}?</p>
            <p className="text-xs text-white/35 mt-3">
              Votás como <span className="text-white/70">{votante ? votante.nombre : miNombre}</span> · solo una vez.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setElegido(null)}
                disabled={enviando}
                className="flex-1 border border-white/20 rounded-full py-2.5 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => votar(elegido)}
                disabled={enviando}
                className="flex-1 bg-gold text-black font-semibold rounded-full py-2.5 text-sm hover:brightness-110 disabled:opacity-60"
              >
                {enviando ? 'Enviando…' : 'Votar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function iniciales(nombre) {
  return (nombre || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

function Iniciales({ nombre, className = 'text-3xl' }) {
  return (
    <>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(18,199,228,.18),transparent_65%)]" />
      <span className={`relative font-serif text-cyan/70 tracking-[0.08em] ${className}`}>
        {iniciales(nombre)}
      </span>
    </>
  )
}

// Avatar con SOLO las iniciales (sin fotos): se usa en el ranking en vivo
function AvatarInvitado({ invitado, className = '', text = 'text-3xl' }) {
  return (
    <div
      className={`${className} relative bg-gradient-to-br from-white/[0.07] via-teal2/60 to-ink border border-white/10 flex items-center justify-center overflow-hidden`}
    >
      <Iniciales nombre={invitado.nombre} className={text} />
    </div>
  )
}

