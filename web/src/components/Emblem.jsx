// Emblema circular: corona hecha con un PUCHO y TIJERAS cruzadas (SVG línea fina)
export default function Emblem({ size = 160, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" className={className}>
      <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
      {/* Pucho cruzado */}
      <g stroke="currentColor" strokeWidth="2" fill="none" transform="rotate(-45 100 100)">
        <rect x="55" y="94" width="90" height="12" rx="4" />
        <line x1="70" y1="94" x2="70" y2="106" />
        <line x1="78" y1="94" x2="78" y2="106" />
      </g>
      {/* Tijeras cruzadas */}
      <g stroke="currentColor" strokeWidth="2" fill="none" transform="rotate(45 100 100)">
        <line x1="60" y1="100" x2="140" y2="100" />
        <circle cx="58" cy="100" r="7" />
        <line x1="140" y1="100" x2="145" y2="92" />
      </g>
    </svg>
  )
}
