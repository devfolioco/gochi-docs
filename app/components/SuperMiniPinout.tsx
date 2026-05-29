// Static top-view pinout of the ESP32-C3 SuperMini for the wiring docs.
// The whole header is drawn for orientation, but the four pins this build
// uses early — 5V, GND, GPIO5 (SDA), GPIO6 (SCK) — are highlighted; the rest
// are greyed. Once the board is pushed into the breadboard you can't read the
// silkscreen, so this is the reference for "which pin is which".

type Kind = 'power' | 'gnd' | 'io' | 'muted'
type Pin = { num: string; label: string; role?: string; kind: Kind }

const LEFT: Pin[] = [
  { num: '5V', label: '5V', role: '→ + rail', kind: 'power' },
  { num: 'G', label: 'GND', role: '→ − rail', kind: 'gnd' },
  { num: '3.3', label: '3V3', kind: 'muted' },
  { num: '4', label: 'GPIO4', kind: 'muted' },
  { num: '3', label: 'GPIO3', kind: 'muted' },
  { num: '2', label: 'GPIO2', kind: 'muted' },
  { num: '1', label: 'GPIO1', kind: 'muted' },
  { num: '0', label: 'GPIO0', kind: 'muted' },
]
const RIGHT: Pin[] = [
  { num: '5', label: 'GPIO5', role: 'OLED SDA', kind: 'io' },
  { num: '6', label: 'GPIO6', role: 'OLED SCK', kind: 'io' },
  { num: '7', label: 'GPIO7', kind: 'muted' },
  { num: '8', label: 'GPIO8', kind: 'muted' },
  { num: '9', label: 'GPIO9', kind: 'muted' },
  { num: '10', label: 'GPIO10', kind: 'muted' },
  { num: '20', label: 'GPIO20', kind: 'muted' },
  { num: '21', label: 'GPIO21', kind: 'muted' },
]

const FILL: Record<Kind, string> = {
  power: '#c0392b',
  gnd: '#1b1e23',
  io: '#2f9e44',
  muted: '#2a2d33',
}
const TEXT: Record<Kind, string> = {
  power: '#ffffff',
  gnd: '#e6efd9',
  io: '#ffffff',
  muted: '#9a9da5',
}

const W = 580
const H = 412
const TOP = 86
const STEP = 33
const BOARD_X = 225
const BOARD_W = 130
const BOARD_R = BOARD_X + BOARD_W // 355
const PILL_W = 78
const PILL_H = 22
const SANS = 'ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'

function ys() {
  return Array.from({ length: 8 }, (_, i) => TOP + i * STEP)
}

function Pad({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 8} y={y - 6} width={16} height={12} rx={2.5} fill="#caa05a" />
      <circle cx={x - 3} cy={y} r={1.6} fill="#3a2c10" />
      <circle cx={x + 3} cy={y} r={1.6} fill="#3a2c10" />
    </g>
  )
}

const RAIL: Partial<Record<Kind, string>> = { power: '#c0392b', gnd: '#2c5e9e' }

// A short breadboard power-rail bar with a jumper running to the pin's pill,
// drawn on the left for the two pins you jumper in Step 1 (5V → + rail,
// GND → − rail). USB powers the board; these jumpers feed the rails.
function Rail({ y, color, sign, pillX }: { y: number; color: string; sign: string; pillX: number }) {
  const barX = 22
  const barW = 64
  return (
    <g>
      <text x={8} y={y + 4} fontFamily={SANS} fontSize={13} fontWeight={700}
        fill={color}>{sign}</text>
      <rect x={barX} y={y - 4} width={barW} height={8} rx={3} fill={color} opacity={0.9} />
      {[0.25, 0.5, 0.75].map((f) => (
        <circle key={f} cx={barX + barW * f} cy={y} r={1.5} fill="#0b0c0f" opacity={0.5} />
      ))}
      {/* jumper from the rail to the pin's pill */}
      <line x1={barX + barW} y1={y} x2={pillX} y2={y} stroke={color} strokeWidth={2.4} />
    </g>
  )
}

function Row({ pin, y, side }: { pin: Pin; y: number; side: 'left' | 'right' }) {
  const muted = pin.kind === 'muted'
  const padX = side === 'left' ? BOARD_X : BOARD_R
  const pillX = side === 'left' ? BOARD_X - 30 - PILL_W : BOARD_R + 30
  const lineX2 = side === 'left' ? pillX + PILL_W : pillX
  const numX = side === 'left' ? BOARD_X + 9 : BOARD_R - 9
  const numAnchor = side === 'left' ? 'start' : 'end'
  const roleX = pillX + PILL_W + 8
  const railColor = side === 'left' ? RAIL[pin.kind] : undefined

  return (
    <g opacity={muted ? 0.5 : 1}>
      {/* lead from the board pad to the label pill */}
      <line x1={padX} y1={y} x2={lineX2} y2={y}
        stroke={muted ? '#3a3d45' : FILL[pin.kind] === '#1b1e23' ? '#6b7280' : FILL[pin.kind]}
        strokeWidth={1.6} />
      <Pad x={padX} y={y} />
      {/* on-board pin number */}
      <text x={numX} y={y + 3.5} textAnchor={numAnchor}
        fontFamily={MONO} fontSize={10} fill="#cfd2d8">{pin.num}</text>
      {/* breadboard rail + jumper (left power/gnd pins only) */}
      {railColor && <Rail y={y} color={railColor} sign={pin.kind === 'power' ? '+' : '−'} pillX={pillX} />}
      {/* label pill */}
      <rect x={pillX} y={y - PILL_H / 2} width={PILL_W} height={PILL_H} rx={4}
        fill={FILL[pin.kind]}
        stroke={muted ? 'none' : 'rgba(255,255,255,0.18)'} strokeWidth={1} />
      <text x={pillX + PILL_W / 2} y={y + 4} textAnchor="middle"
        fontFamily={SANS} fontSize={12} fontWeight={700}
        fill={TEXT[pin.kind]}>{pin.label}</text>
      {/* role text (right-side highlighted pins) */}
      {pin.role && side === 'right' && (
        <text x={roleX} y={y + 3.5} textAnchor="start"
          fontFamily={MONO} fontSize={10} fill="#aeb2ba">{pin.role}</text>
      )}
    </g>
  )
}

function LegendItem({ x, color, label }: { x: number; color: string; label: string }) {
  return (
    <g transform={`translate(${x} ${H - 16})`}>
      <rect x={0} y={-9} width={11} height={11} rx={2} fill={color} />
      <text x={16} y={0} fontFamily={SANS} fontSize={11} fill="#9a9da5">{label}</text>
    </g>
  )
}

export function SuperMiniPinout() {
  const Y = ys()
  const boardY = Y[0] - 22
  const boardH = Y[7] - Y[0] + 44
  const midY = (Y[0] + Y[7]) / 2

  return (
    <div style={{ maxWidth: 560, margin: '1.25rem auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="ESP32-C3 SuperMini pinout, top view. 5V and GND on the upper left; GPIO5 and GPIO6 on the upper right.">
        {/* USB-C at the top edge */}
        <rect x={W / 2 - 26} y={boardY - 14} width={52} height={18} rx={4}
          fill="#2a2d35" stroke="#3a3d45" strokeWidth={1} />
        <text x={W / 2} y={boardY - 2} textAnchor="middle"
          fontFamily={MONO} fontSize={8} fill="#7a7c84" letterSpacing={1}>USB-C</text>

        {/* board */}
        <rect x={BOARD_X} y={boardY} width={BOARD_W} height={boardH} rx={10}
          fill="#15171c" stroke="#22252b" strokeWidth={1.2} />

        {/* centre silk */}
        <text x={W / 2} y={midY - 4} textAnchor="middle"
          fontFamily={SANS} fontSize={13} fontWeight={700} fill="#e6e8ec">ESP32-C3</text>
        <text x={W / 2} y={midY + 13} textAnchor="middle"
          fontFamily={SANS} fontSize={11} fill="#9a9da5">Super Mini</text>

        {LEFT.map((p, i) => <Row key={`l-${p.label}`} pin={p} y={Y[i]} side="left" />)}
        {RIGHT.map((p, i) => <Row key={`r-${p.label}`} pin={p} y={Y[i]} side="right" />)}

        {/* legend */}
        <LegendItem x={70} color="#c0392b" label="Power" />
        <LegendItem x={170} color="#1b1e23" label="GND" />
        <LegendItem x={250} color="#2f9e44" label="I²C (OLED)" />
        <LegendItem x={400} color="#2a2d33" label="other" />
      </svg>
    </div>
  )
}
