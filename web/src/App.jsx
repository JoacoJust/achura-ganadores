import { useEffect, useState } from 'react'
import Emblem from './components/Emblem.jsx'
import categorias from './data/categories.json'

/* ---------------------------------------------------------------
   Sitio de Achura Awards.

   Dos secciones:
   1) OUTFIT DEL DÍA (público)  -> #/        votan los invitados
   2) TERNAS Y GANADORES (privado) -> #/ternas  pide contraseña

   Las ternas (nombres, fotos, videos) salen de web/src/data/categories.json,
   la misma copia de la app de votación. Los resultados NO viajan en el
   bundle: se piden a GET /api/resultados, que exige la cookie de acceso.
---------------------------------------------------------------- */

const esVideo = (m) => /\.(mp4|webm|mov|m4v|ogv)$/i.test(m || '') && !/placeholder/i.test(m || '')
const esPlaceholder = (m) => !m || /placeholder/i.test(m)

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
  }
}

function ganadoresDe(datos, id) {
  const r = resultadoDe(datos, id)
  if (Array.isArray(r.ganadores) && r.ganadores.length) return r.ganadores
  const top = (r.puestos || []).filter((p) => p.votos > 0).slice(0, 1)
  return top
}

/* ---------------- ruteo por hash (#/, #/ternas, #/terna/:id) ---------------- */

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

const esRutaPrivada = (hash) => hash === '#/ternas' || hash.startsWith('#/terna/')

export default function App() {
  const hash = useRuta()
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: '' })

  async function cargarResultados() {
    try {
      const r = await fetch('/api/resultados', { headers: { 'Cache-Control': 'no-cache' } })
      if (r.status === 401) {
        setRes({ estado: 'sin_acceso', datos: null, error: '' })
        return
      }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'No se pudieron cargar los resultados')
      }
      setRes({ estado: 'ok', datos: await r.json(), error: '' })
    } catch (e) {
      setRes({ estado: 'error', datos: null, error: e.message })
    }
  }

  useEffect(() => {
    cargarResultados()
  }, [])

  let vista
  if (hash.startsWith('#/terna/')) {
    vista = <Terna id={decodeURIComponent(hash.slice('#/terna/'.length))} res={res} recargar={cargarResultados} />
  } else if (hash === '#/ternas') {
    vista = <Ternas res={res} recargar={cargarResultados} />
  } else {
    vista = <Outfit />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header hash={hash} autorizado={res.estado === 'ok'} recargar={cargarResultados} />
      <main className="flex-1">{vista}</main>
      <Footer generado={res.estado === 'ok' ? res.datos && res.datos.generado : null} />
    </div>
  )
}

/* ------------------------------- layout ------------------------------- */

function Header({ hash, autorizado, recargar }) {
  const enOutfit = !esRutaPrivada(hash)

  async function salir() {
    await fetch('/api/salir', { method: 'POST' })
    await recargar()
  }

  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-ink/70 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <a href="#/" className="flex items-center gap-3 group">
          <span className="text-gold group-hover:text-cyan transition">
            <Emblem size={34} />
          </span>
          <span className="leading-none">
            <span className="block font-serif text-sm tracking-[0.28em] uppercase">Achura Awards</span>
            <span className="block text-[10px] tracking-[0.32em] uppercase text-cyan/80 mt-1">2026</span>
          </span>
        </a>

        <nav className="flex items-center gap-1 text-[11px] sm:text-xs uppercase tracking-[0.16em]">
          <a
            href="#/"
            className={`px-3 py-2 rounded-full transition ${
              enOutfit ? 'text-gold bg-white/5' : 'text-white/60 hover:text-white'
            }`}
          >
            Outfit del día
          </a>
          <a
            href="#/ternas"
            className={`px-3 py-2 rounded-full transition flex items-center gap-1.5 ${
              !enOutfit ? 'text-gold bg-white/5' : 'text-white/60 hover:text-white'
            }`}
            title="Sección privada"
          >
            <span className="text-[10px]">{autorizado ? '★' : '🔒'}</span> Ternas
          </a>
          {autorizado && !enOutfit && (
            <button
              onClick={salir}
              className="ml-1 px-3 py-2 rounded-full text-white/45 hover:text-white transition"
              title="Cerrar la sección privada"
            >
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
          <span>Resultados actualizados {new Date(generado).toLocaleDateString('es-AR')}</span>
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
          ← Ir al Outfit del día
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

function Ternas({ res, recargar }) {
  return (
    <BloquePrivado res={res} recargar={recargar}>
      {(datos) => {
        const definidas = categorias.filter((c) => ganadoresDe(datos, c.id).length > 0).length
        return (
          <div className="max-w-6xl mx-auto px-5 pt-14 pb-20">
            <div className="text-center animate-fade-up">
              <p className="text-[11px] uppercase tracking-[0.45em] text-cyan/80">Sección privada</p>
              <h1 className="font-serif text-4xl sm:text-6xl mt-4 tracking-wide">
                LOS <span className="text-gold">GANADORES</span>
              </h1>
              <div className="gold-rule h-px w-56 mx-auto mt-6" />
              <p className="mt-6 text-white/55 max-w-xl mx-auto text-sm">
                Entrá a cada terna para ver el ganador y cómo quedaron los puestos.
              </p>
              <p className="mt-4 text-xs text-white/35">
                {definidas} de {categorias.length} ternas con votos
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10 mt-14">
              {categorias.map((cat, i) => {
                const ganadores = ganadoresDe(datos, cat.id)
                return (
                  <a
                    key={cat.id}
                    href={`#/terna/${encodeURIComponent(cat.id)}`}
                    className="group flex flex-col items-center text-center animate-fade-up"
                    style={{ animationDelay: `${Math.min(i * 45, 500)}ms` }}
                  >
                    <span className="relative w-[132px] h-[132px] rounded-full p-[2px] bg-gradient-to-b from-white/25 via-white/5 to-transparent group-hover:from-gold/80 group-hover:via-gold/30 transition-all duration-300 group-hover:shadow-goldglow">
                      <Foto
                        src={fotoTerna(cat)}
                        alt={cat.nombre}
                        className="w-full h-full rounded-full object-cover"
                        size={70}
                      />
                      {ganadores.length > 0 && (
                        <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gold text-black text-sm font-bold flex items-center justify-center shadow-lg">
                          {ganadores.length > 1 ? ganadores.length : '★'}
                        </span>
                      )}
                    </span>

                    <span className="mt-4 font-serif text-[13px] leading-snug tracking-[0.12em] uppercase max-w-[180px]">
                      {cat.nombre}
                    </span>

                    {ganadores.length > 0 ? (
                      <span className="mt-2 text-sm text-gold/90 leading-snug">
                        {ganadores.map((g) => g.nombre).join(' · ')}
                      </span>
                    ) : (
                      <span className="mt-2 text-xs text-white/35 uppercase tracking-widest">En votación</span>
                    )}
                  </a>
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
      {(datos) => <DetalleTerna cat={cat} datos={datos} />}
    </BloquePrivado>
  )
}

function DetalleTerna({ cat, datos }) {
  const r = resultadoDe(datos, cat.id)
  const puestos = r.puestos || []
  const ganadores = ganadoresDe(datos, cat.id)
  const varios = ganadores.length > 1
  const conVotos = puestos.filter((p) => p.votos > 0)

  function irAPuestos() {
    const el = document.getElementById('puestos')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="max-w-5xl mx-auto px-5 pt-8 pb-20">
      <a href="#/ternas" className="text-sm text-white/50 hover:text-white transition">
        ← Volver a las ternas
      </a>

      <div className="mt-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">{cat.nombre}</p>
        <h1 className="font-serif text-3xl sm:text-5xl mt-3 tracking-wide">
          {varios ? 'Los ganadores' : 'El ganador'}
        </h1>
        <div className="gold-rule h-px w-40 mx-auto mt-5" />
      </div>

      {ganadores.length > 0 ? (
        <div className="mt-10 animate-reveal">
          <div className="relative rounded-3xl overflow-hidden border border-gold/25 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent shadow-goldglow">
            <div className="grid md:grid-cols-[minmax(0,400px)_1fr]">
              <div className={`grid ${varios ? 'grid-cols-2' : 'grid-cols-1'} gap-px bg-white/10`}>
                {ganadores.map((g) => (
                  <div key={g.id} className="relative h-64 md:h-auto md:min-h-[400px]">
                    <Foto
                      src={g.foto}
                      alt={g.nombre}
                      className="absolute inset-0 w-full h-full object-cover"
                      size={90}
                    />
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
                    <h2 className="font-serif text-3xl sm:text-5xl leading-[1.05]">{g.nombre}</h2>
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
          <h2 className="font-serif text-2xl sm:text-3xl mt-4">Votación en curso</h2>
          <p className="text-white/50 mt-3 max-w-md mx-auto">
            Todavía no hay votos cargados en esta terna. Cuando se cierre la votación, acá aparece el ganador.
          </p>
        </div>
      )}

      {cat.mencion && cat.mencion.trim() && (
        <div className="mt-8 rounded-2xl border border-gold/30 bg-gold/[0.04] p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">🎖 Mención honorífica</p>
          <p className="mt-2 text-white/75">{cat.mencion}</p>
        </div>
      )}

      <section id="puestos" className="mt-24 scroll-mt-24">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Puestos</p>
          <h2 className="font-serif text-2xl sm:text-3xl mt-3">
            {r.total > 0 ? 'Así quedó la terna' : 'Los candidatos'}
          </h2>
          {varios && r.total > 0 && (
            <p className="mt-3 text-xs text-cyan/70">Premio compartido: los dos primeros puestos son ganadores.</p>
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
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {(cat.nominados || []).map((n) => (
              <div key={n.id} className="text-center">
                <Foto
                  src={fotoDe(n)}
                  alt={n.nombre}
                  className="w-full h-40 object-cover rounded-xl border border-white/10"
                  size={60}
                />
                <p className="mt-3 text-sm text-white/80">{n.nombre}</p>
              </div>
            ))}
          </div>
        )}
      </section>
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
              className={`mt-3 mx-auto rounded-full object-cover border-2 ${
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

function FilaPuesto({ puesto, posicion, maximo, esGanador }) {
  const ancho = maximo > 0 ? Math.max((puesto.votos / maximo) * 100, puesto.votos > 0 ? 6 : 0) : 0

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
        esGanador ? 'border-gold/30 bg-gold/[0.04]' : 'border-white/5 bg-white/[0.02]'
      }`}
    >
      <span className={`w-7 text-center font-serif ${esGanador ? 'text-gold' : 'text-white/40'}`}>{posicion}</span>
      <Foto src={puesto.foto} alt={puesto.nombre} className="w-10 h-10 rounded-full object-cover" size={26} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className={`truncate ${esGanador ? 'text-gold' : 'text-white/85'}`}>
            {esGanador && <span className="mr-1">★</span>}
            {puesto.nombre}
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

/* ---------------------------- outfit del día (público) ---------------------------- */

function Outfit() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [elegido, setElegido] = useState(null)
  const [enviando, setEnviando] = useState(false)

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
  }, [])

  // Resultados en vivo mientras dura la noche
  useEffect(() => {
    const t = setInterval(cargar, 6000)
    return () => clearInterval(t)
  }, [])

  async function votar(invitado) {
    setEnviando(true)
    setError('')
    try {
      const r = await fetch('/api/outfit/votar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invitado.id }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'No se pudo registrar el voto')
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

  const { invitados, yaVoto, miVoto, activo, baseOk, titulo } = estado
  const votado = invitados.find((i) => i.id === miVoto)
  const puedenVotar = activo && baseOk && !yaVoto
  const ranking = [...invitados].sort((a, b) => b.votos - a.votos)
  const maximo = ranking[0]?.votos || 1

  return (
    <div className="max-w-5xl mx-auto px-5 pt-12 pb-20">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan/80">Votación de la noche</p>
        <h1 className="font-serif text-4xl sm:text-6xl mt-4 tracking-wide">
          {titulo || 'Outfit del día'}
        </h1>
        <div className="gold-rule h-px w-40 mx-auto mt-5" />
        <p className="mt-5 text-white/55 text-sm max-w-md mx-auto">
          {puedenVotar
            ? 'Elegí el mejor outfit de la noche. Un voto por dispositivo.'
            : yaVoto
              ? 'Ya registraste tu voto. Estos son los resultados en vivo.'
              : 'La votación está cerrada. Estos son los resultados.'}
        </p>
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

      {yaVoto && (
        <div className="mt-8 rounded-2xl border border-gold/40 bg-gold/[0.06] p-5 text-center">
          <p className="text-gold text-sm uppercase tracking-[0.2em]">✓ Tu voto</p>
          <p className="font-serif text-2xl mt-2">{votado ? votado.nombre : 'Registrado'}</p>
        </div>
      )}

      {puedenVotar && (
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {invitados.map((inv, i) => (
            <button
              key={inv.id}
              onClick={() => setElegido(inv)}
              className="group text-left rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-cyan/60 hover:bg-white/[0.06] transition animate-fade-up"
              style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
            >
              <FotoInvitado invitado={inv} className="w-full aspect-[4/5] rounded-xl" />
              <p className="mt-3 text-sm text-white/85 group-hover:text-white truncate">{inv.nombre}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-cyan/70 group-hover:text-cyan">Votar →</p>
            </button>
          ))}
        </div>
      )}

      {(yaVoto || !activo) && (
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {ranking.map((inv) => (
            <div
              key={inv.id}
              className={`rounded-2xl border p-3 ${
                inv.id === miVoto ? 'border-gold/50 bg-gold/[0.06]' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="relative">
                <FotoInvitado invitado={inv} className="w-full aspect-[4/5] rounded-xl" />
                {inv.votos > 0 && ranking[0].votos === inv.votos && (
                  <span className="absolute top-2 left-2 bg-gold text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                    ★ TOP
                  </span>
                )}
              </div>
              <p className={`mt-3 text-sm truncate ${inv.id === miVoto ? 'text-gold' : 'text-white/85'}`}>
                {inv.nombre}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${inv.id === miVoto ? 'bg-gold' : 'bg-cyan/60'}`}
                  style={{ width: `${inv.votos > 0 ? Math.max((inv.votos / maximo) * 100, 8) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-white/45">
                {inv.votos} {inv.votos === 1 ? 'voto' : 'votos'}
              </p>
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
            <FotoInvitado invitado={elegido} className="w-28 h-28 rounded-full mx-auto" />
            <p className="mt-4 text-sm text-white/60">¿Votás el outfit de</p>
            <p className="font-serif text-2xl mt-1">{elegido.nombre}?</p>
            <p className="text-xs text-white/35 mt-3">Solo podés votar una vez.</p>
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

function FotoInvitado({ invitado, className = '' }) {
  const [error, setError] = useState(false)

  if (!invitado.foto || error) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-teal2 to-ink border border-white/10 flex items-center justify-center`}
      >
        <span className="font-serif text-3xl text-cyan/70">{iniciales(invitado.nombre)}</span>
      </div>
    )
  }
  return (
    <img
      src={invitado.foto}
      alt={invitado.nombre}
      className={`${className} object-cover`}
      loading="lazy"
      onError={() => setError(true)}
    />
  )
}
