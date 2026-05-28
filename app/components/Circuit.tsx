'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ensureLoop } from './OledFace'

// Wiring matches firmware/src/config.h — four jumpers between the SSD1306
// breakout and the ESP32-C3 SuperMini.

type Pin = { id: string; cx: number; cy: number; label: string }
type Component = {
  id: string
  pins: Pin[]
}
type Wire = {
  id: string
  from: { c: string; p: string }
  to: { c: string; p: string }
  dockX: number
  color: string
  signal: string
  desc: string
}

const VB_W = 720
const VB_H = 600

// ---- ESP32-C3 SuperMini (bottom card) ----------------------------------
const ESP_X = 200
const ESP_Y = 340
const ESP_W = 320
const ESP_H = 230

const ESP_PIN_Y = ESP_Y - 4
const ESP_PIN_TIP_Y = ESP_PIN_Y - 30
const ESP_PIN_XS = [ESP_X + 90, ESP_X + 150, ESP_X + 210, ESP_X + 270]

// ---- SSD1306 OLED breakout (top card) ----------------------------------
const OLED_X = 200
const OLED_Y = 30
const OLED_W = 320
const OLED_H = 200

const OLED_HEADER_Y = OLED_Y + OLED_H - 8
const OLED_PAD_Y = OLED_HEADER_Y + 5
const OLED_PLASTIC_Y = OLED_Y + OLED_H - 6
const OLED_PIN_TIP_Y = OLED_PLASTIC_Y + 40
const OLED_PIN_XS = [OLED_X + 90, OLED_X + 150, OLED_X + 210, OLED_X + 270]

const SCREEN_W = OLED_W * 0.8
const SCREEN_H = SCREEN_W / 2
const SCREEN_X = OLED_X + (OLED_W - SCREEN_W) / 2
const SCREEN_Y = OLED_Y + 17

// loose-end resting positions — the four unplugged wires fan out between
// the two boards so it's obvious they're not connected yet
const DOCK_Y = (OLED_PIN_TIP_Y + ESP_PIN_TIP_Y) / 2 + 10
const DOCK_XS = [VB_W / 2 - 130, VB_W / 2 - 50, VB_W / 2 + 50, VB_W / 2 + 130]
const SNAP_RADIUS = 28

const ESP: Component = {
  id: 'esp',
  pins: [
    { id: 'g', cx: ESP_PIN_XS[0], cy: ESP_PIN_Y, label: 'G' },
    { id: '3v3', cx: ESP_PIN_XS[1], cy: ESP_PIN_Y, label: '3V3' },
    { id: 'gp6', cx: ESP_PIN_XS[2], cy: ESP_PIN_Y, label: 'GP6' },
    { id: 'gp5', cx: ESP_PIN_XS[3], cy: ESP_PIN_Y, label: 'GP5' },
  ],
}

const OLED: Component = {
  id: 'oled',
  pins: [
    { id: 'gnd', cx: OLED_PIN_XS[0], cy: OLED_PAD_Y, label: 'GND' },
    { id: 'vcc', cx: OLED_PIN_XS[1], cy: OLED_PAD_Y, label: 'VCC' },
    { id: 'scl', cx: OLED_PIN_XS[2], cy: OLED_PAD_Y, label: 'SCL' },
    { id: 'sda', cx: OLED_PIN_XS[3], cy: OLED_PAD_Y, label: 'SDA' },
  ],
}

const COMPONENTS: Record<string, Component> = { esp: ESP, oled: OLED }

const WIRES: Wire[] = [
  {
    id: 'w-gnd',
    from: { c: 'oled', p: 'gnd' },
    to: { c: 'esp', p: 'g' },
    dockX: DOCK_XS[0],
    color: '#2a2d33',
    signal: 'GND',
    desc: 'common ground',
  },
  {
    id: 'w-vcc',
    from: { c: 'oled', p: 'vcc' },
    to: { c: 'esp', p: '3v3' },
    dockX: DOCK_XS[1],
    color: '#c0392b',
    signal: '3V3',
    desc: 'OLED power — never 5V, the kit panel is 3.3V only',
  },
  {
    id: 'w-scl',
    from: { c: 'oled', p: 'scl' },
    to: { c: 'esp', p: 'gp6' },
    dockX: DOCK_XS[2],
    color: '#d9b14a',
    signal: 'I²C SCL → GPIO6',
    desc: 'clock line, set by PIN_SCL in config.h',
  },
  {
    id: 'w-sda',
    from: { c: 'oled', p: 'sda' },
    to: { c: 'esp', p: 'gp5' },
    dockX: DOCK_XS[3],
    color: '#3b86b8',
    signal: 'I²C SDA → GPIO5',
    desc: 'data line, set by PIN_SDA in config.h',
  },
]

function pinOf(componentId: string, pinId: string): Pin | undefined {
  return COMPONENTS[componentId]?.pins.find((p) => p.id === pinId)
}

// curve a wire from one point to another with a control offset for a
// natural drape
function curve(ax: number, ay: number, bx: number, by: number): string {
  const midY = (ay + by) / 2
  return `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by}`
}

const SILK = '#e6efd9'

type Connection = 'idle' | 'connected'
type Drag = { wireId: string; x: number; y: number }

export function Circuit() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverWire, setHoverWire] = useState<string | null>(null)
  const [conn, setConn] = useState<Record<string, Connection>>(() =>
    Object.fromEntries(WIRES.map((w) => [w.id, 'idle' as const])),
  )
  const [drag, setDrag] = useState<Drag | null>(null)

  const connectedCount = useMemo(
    () => Object.values(conn).filter((c) => c === 'connected').length,
    [conn],
  )
  const allConnected = connectedCount === WIRES.length

  useEffect(() => {
    if (allConnected) ensureLoop()
  }, [allConnected])

  // Global pointer handlers while dragging — keep tracking even if the
  // cursor leaves the SVG.
  useEffect(() => {
    if (!drag) return
    const toSvg = (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      return {
        x: ((clientX - rect.left) / rect.width) * VB_W,
        y: ((clientY - rect.top) / rect.height) * VB_H,
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = toSvg(e.clientX, e.clientY)
      if (!p) return
      setDrag((d) => (d ? { ...d, x: p.x, y: p.y } : null))
    }
    const onUp = () => {
      setDrag((d) => {
        if (!d) return null
        const w = WIRES.find((x) => x.id === d.wireId)
        if (w) {
          const target = pinOf(w.to.c, w.to.p)
          if (target) {
            const dist = Math.hypot(target.cx - d.x, target.cy - d.y)
            if (dist < SNAP_RADIUS) {
              setConn((c) => ({ ...c, [d.wireId]: 'connected' }))
            }
          }
        }
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag])

  const startDrag = (wireId: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    const w = WIRES.find((x) => x.id === wireId)
    if (!w) return
    // start drag at current dock position
    setDrag({ wireId, x: w.dockX, y: DOCK_Y })
  }

  const toggleSidebar = (wireId: string) => {
    setConn((c) => ({
      ...c,
      [wireId]: c[wireId] === 'connected' ? 'idle' : 'connected',
    }))
  }

  const reset = () =>
    setConn(Object.fromEntries(WIRES.map((w) => [w.id, 'idle' as const])))

  // For each wire, decide its current geometry.
  function wireGeometry(w: Wire): { tipX: number; tipY: number; connected: boolean; isDragging: boolean } {
    if (drag?.wireId === w.id) {
      return { tipX: drag.x, tipY: drag.y, connected: false, isDragging: true }
    }
    if (conn[w.id] === 'connected') {
      const t = pinOf(w.to.c, w.to.p)!
      return { tipX: t.cx, tipY: ESP_PIN_TIP_Y, connected: true, isDragging: false }
    }
    return { tipX: w.dockX, tipY: DOCK_Y, connected: false, isDragging: false }
  }

  // Snap target highlight: which ESP pin is within snap range of the drag?
  const snapTargetId = useMemo(() => {
    if (!drag) return null
    const w = WIRES.find((x) => x.id === drag.wireId)
    if (!w) return null
    const target = pinOf(w.to.c, w.to.p)
    if (!target) return null
    const dist = Math.hypot(target.cx - drag.x, target.cy - drag.y)
    return dist < SNAP_RADIUS ? `${w.to.c}:${w.to.p}` : null
  }, [drag])

  const hoveredPins = useMemo(() => {
    if (!hoverWire) return new Set<string>()
    const w = WIRES.find((x) => x.id === hoverWire)
    if (!w) return new Set<string>()
    return new Set([`${w.from.c}:${w.from.p}`, `${w.to.c}:${w.to.p}`])
  }, [hoverWire])

  return (
    <div className="circuit-page">
      <header className="circuit-top">
        <a href="/" className="circuit-back">← back</a>
        <div className="circuit-title">
          <span className="circuit-eyebrow">wiring · h.m.f #1</span>
          <h1>Circuit Builder</h1>
        </div>
        <a
          href="https://github.com/prathamVaidya/gochi/blob/main/firmware/src/config.h"
          target="_blank"
          rel="noreferrer"
          className="circuit-source"
        >
          config.h ↗
        </a>
      </header>

      <p className="circuit-hint">
        Drag each loose wire end onto the matching pin on the ESP32 to plug
        it in. Once all four are connected, the OLED powers up.
      </p>

      <div className="circuit-grid">
        <section className="circuit-canvas">
          <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} className="circuit-svg">
            <defs>
              <linearGradient id="cb-pcb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d6a40" />
                <stop offset="50%" stopColor="#134a2c" />
                <stop offset="100%" stopColor="#0a3522" />
              </linearGradient>
              <pattern id="cb-fine" width={12} height={12} patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" fill="none"
                  stroke="rgba(255,255,255,0.09)" strokeWidth={0.5} />
              </pattern>
              <pattern id="cb-major" width={60} height={60} patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none"
                  stroke="rgba(255,255,255,0.16)" strokeWidth={0.6} />
              </pattern>
              <radialGradient id="cb-pad" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#f4d28a" />
                <stop offset="60%" stopColor="#caa05a" />
                <stop offset="100%" stopColor="#5a4220" />
              </radialGradient>
              <linearGradient id="cb-pin-metal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f6e3a8" />
                <stop offset="50%" stopColor="#c79a3a" />
                <stop offset="100%" stopColor="#8a6a20" />
              </linearGradient>
              <linearGradient id="cb-header-plastic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2b2d33" />
                <stop offset="100%" stopColor="#15161a" />
              </linearGradient>
              <radialGradient id="cb-connector" cx="0.5" cy="0.35" r="0.6">
                <stop offset="0%" stopColor="#fff7d6" />
                <stop offset="55%" stopColor="#caa05a" />
                <stop offset="100%" stopColor="#5a4220" />
              </radialGradient>
              <filter id="cb-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>

            {/* ---- SSD1306 OLED breakout (drawn first, behind wires) ---- */}
            <g>
              <rect x={OLED_X} y={OLED_Y} width={OLED_W} height={OLED_H} rx={8}
                fill="url(#cb-pcb)" stroke="#0a3522" strokeWidth={1.2} />
              <rect x={OLED_X} y={OLED_Y} width={OLED_W} height={OLED_H} rx={8}
                fill="url(#cb-fine)" pointerEvents="none" />
              <rect x={OLED_X} y={OLED_Y} width={OLED_W} height={OLED_H} rx={8}
                fill="url(#cb-major)" pointerEvents="none" />

              <rect x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H}
                fill="none" stroke={SILK} strokeWidth={0.8} opacity={0.6} />
              {[
                [SCREEN_X, SCREEN_Y, 1, 1],
                [SCREEN_X + SCREEN_W, SCREEN_Y, -1, 1],
                [SCREEN_X, SCREEN_Y + SCREEN_H, 1, -1],
                [SCREEN_X + SCREEN_W, SCREEN_Y + SCREEN_H, -1, -1],
              ].map(([cx, cy, sx, sy], i) => (
                <path key={`b-${i}`}
                  d={`M ${cx + sx * 6} ${cy} L ${cx} ${cy} L ${cx} ${cy + sy * 6}`}
                  fill="none" stroke={SILK} strokeWidth={1.4} opacity={0.85} />
              ))}

              <rect x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H}
                fill="#04060a" />
              {allConnected ? (
                <foreignObject x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H}>
                  <canvas
                    data-oled-face=""
                    width={128}
                    height={64}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      background: '#04060a',
                      imageRendering: 'pixelated',
                      filter: 'drop-shadow(0 0 3px rgba(234, 243, 247, 0.35))',
                    }}
                  />
                </foreignObject>
              ) : (
                <text x={SCREEN_X + SCREEN_W / 2} y={SCREEN_Y + SCREEN_H / 2 + 4}
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace" fontSize={9}
                  fill={SILK} opacity={0.18}>
                  awaiting power ({connectedCount}/{WIRES.length})
                </text>
              )}

              {[
                [OLED_X + 14, OLED_Y + 8],
                [OLED_X + OLED_W - 14, OLED_Y + 8],
              ].map(([cx, cy], i) => (
                <g key={`omh-${i}`}>
                  <circle cx={cx} cy={cy} r={3} fill="#caa05a" />
                  <circle cx={cx} cy={cy} r={1.3} fill="#06241a" />
                </g>
              ))}

              {OLED.pins.map((p) => {
                const isHot = hoveredPins.has(`oled:${p.id}`)
                return (
                  <g key={`opin-${p.id}`}>
                    <text x={p.cx} y={OLED_HEADER_Y} textAnchor="middle"
                      fontFamily="'Pixelify Sans', monospace" fontSize={9}
                      fill={SILK} opacity={isHot ? 1 : 0.85}>
                      {p.label}
                    </text>
                    <circle cx={p.cx} cy={OLED_PAD_Y} r={isHot ? 4 : 2.8}
                      fill="url(#cb-pad)" />
                    <circle cx={p.cx} cy={OLED_PAD_Y} r={1.3} fill="#06241a" />
                  </g>
                )
              })}

              <rect x={OLED_PIN_XS[0] - 10} y={OLED_PLASTIC_Y}
                width={OLED_PIN_XS[3] - OLED_PIN_XS[0] + 20} height={14} rx={1.5}
                fill="url(#cb-header-plastic)"
                stroke="#0a0b0d" strokeWidth={0.5} />
              {OLED_PIN_XS.map((x) => (
                <rect key={`well-${x}`} x={x - 1.5} y={OLED_PLASTIC_Y + 2}
                  width={3} height={10} fill="#0a0b0d" />
              ))}
              {OLED_PIN_XS.map((x) => (
                <g key={`tab-${x}`}>
                  <rect x={x - 1.8} y={OLED_PLASTIC_Y + 14}
                    width={3.6} height={OLED_PIN_TIP_Y - OLED_PLASTIC_Y - 14}
                    fill="url(#cb-pin-metal)" />
                  <rect x={x - 1.8} y={OLED_PIN_TIP_Y - 4}
                    width={3.6} height={4} fill="#f6e3a8" />
                </g>
              ))}
            </g>

            {/* ---- ESP32-C3 SuperMini (drawn before wires so wires plug into header pins on top) ---- */}
            <g>
              {ESP_PIN_XS.map((x, i) => {
                const isHot = hoveredPins.has(`esp:${ESP.pins[i].id}`)
                const isSnap = snapTargetId === `esp:${ESP.pins[i].id}`
                return (
                  <g key={`epin-${i}`}>
                    {isSnap && (
                      <circle cx={x} cy={ESP_PIN_TIP_Y} r={14}
                        fill="none" stroke="#22c55e" strokeWidth={2}
                        opacity={0.9}>
                        <animate attributeName="r" values="10;16;10" dur="900ms" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="1;0.4;1" dur="900ms" repeatCount="indefinite" />
                      </circle>
                    )}
                    <rect x={x - 1.8} y={ESP_PIN_TIP_Y}
                      width={3.6} height={ESP_PIN_Y - ESP_PIN_TIP_Y}
                      fill="url(#cb-pin-metal)" />
                    <rect x={x - 1.8} y={ESP_PIN_TIP_Y}
                      width={3.6} height={3}
                      fill={isHot || isSnap ? '#ffeaa3' : '#f6e3a8'} />
                    <rect x={x - 6} y={ESP_PIN_Y}
                      width={12} height={12}
                      fill="url(#cb-header-plastic)"
                      stroke="#0a0b0d" strokeWidth={0.4} />
                    <rect x={x - 1.5} y={ESP_PIN_Y + 2}
                      width={3} height={8} fill="#0a0b0d" />
                  </g>
                )
              })}

              <rect x={ESP_X} y={ESP_Y} width={ESP_W} height={ESP_H} rx={10}
                fill="url(#cb-pcb)" stroke="#0a3522" strokeWidth={1.2} />
              <rect x={ESP_X} y={ESP_Y} width={ESP_W} height={ESP_H} rx={10}
                fill="url(#cb-fine)" pointerEvents="none" />
              <rect x={ESP_X} y={ESP_Y} width={ESP_W} height={ESP_H} rx={10}
                fill="url(#cb-major)" pointerEvents="none" />

              {ESP.pins.map((p) => {
                const isHot = hoveredPins.has(`esp:${p.id}`)
                return (
                  <text key={`elbl-${p.id}`} x={p.cx} y={ESP_Y + 30}
                    textAnchor="middle"
                    fontFamily="'Pixelify Sans', monospace" fontSize={9}
                    fill={SILK} opacity={isHot ? 1 : 0.85}>
                    {p.label}
                  </text>
                )
              })}

              {[
                [ESP_X + 14, ESP_Y + 16],
                [ESP_X + ESP_W - 14, ESP_Y + 16],
                [ESP_X + 14, ESP_Y + ESP_H - 16],
                [ESP_X + ESP_W - 14, ESP_Y + ESP_H - 16],
              ].map(([cx, cy], i) => (
                <g key={`emh-${i}`}>
                  <circle cx={cx} cy={cy} r={4.5} fill="#caa05a" />
                  <circle cx={cx} cy={cy} r={2} fill="#06241a" />
                </g>
              ))}

              <g transform={`translate(${ESP_X + ESP_W / 2 - 50} ${ESP_Y + 60})`}>
                <rect width={100} height={70} rx={3}
                  fill="#15171c" stroke="#22252b" strokeWidth={0.8} />
                {Array.from({ length: 10 }).map((_, i) => (
                  <g key={`pp-${i}`}>
                    <rect x={6 + i * 9} y={-3} width={4} height={6} fill="#9c8048" />
                    <rect x={6 + i * 9} y={67} width={4} height={6} fill="#9c8048" />
                  </g>
                ))}
                {Array.from({ length: 7 }).map((_, i) => (
                  <g key={`sp-${i}`}>
                    <rect x={-3} y={6 + i * 8} width={6} height={4} fill="#9c8048" />
                    <rect x={97} y={6 + i * 8} width={6} height={4} fill="#9c8048" />
                  </g>
                ))}
                <text x={50} y={32} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={11}
                  fill="#a8aab2" letterSpacing={1}>ESP32-C3</text>
                <text x={50} y={46} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={9}
                  fill="#74767e" letterSpacing={1}>SuperMini</text>
                <circle cx={8} cy={8} r={1.4} fill="#caa05a" />
              </g>

              <g transform={`translate(${ESP_X + ESP_W / 2 - 40} ${ESP_Y + ESP_H - 30})`}>
                <rect width={80} height={26} rx={5}
                  fill="#2a2d35" stroke="#3a3d45" />
                <rect x={8} y={6} width={64} height={14} rx={2} fill="#0a0b0d" />
                <text x={40} y={16} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#7a7c84" letterSpacing={2}>USB-C</text>
              </g>

              <g transform={`translate(${ESP_X + ESP_W - 35} ${ESP_Y + 70})`}>
                <circle r={5} fill="#08211a" stroke="#041511" />
                {conn['w-gnd'] === 'connected' && conn['w-vcc'] === 'connected' && (
                  <circle r={2.8} fill="#22c55e" filter="url(#cb-glow)" opacity={0.95} />
                )}
              </g>

              <text x={ESP_X + ESP_W / 2} y={ESP_Y + ESP_H - 6}
                textAnchor="middle"
                fontFamily="'Pixelify Sans', monospace" fontSize={9}
                fill={SILK} opacity={0.55} letterSpacing={1.2}>
                tamagotchi · v1.0
              </text>
            </g>

            {/* ---- wires ---- */}
            {WIRES.map((w) => {
              const from = pinOf(w.from.c, w.from.p)!
              const g = wireGeometry(w)
              const path = curve(from.cx, OLED_PIN_TIP_Y, g.tipX, g.tipY)
              const isHover = hoverWire === w.id
              return (
                <g key={w.id}
                  onMouseEnter={() => setHoverWire(w.id)}
                  onMouseLeave={() => setHoverWire(null)}>
                  {/* shadow */}
                  <path d={path} stroke="rgba(0,0,0,0.45)"
                    strokeWidth={5} fill="none" strokeLinecap="round"
                    transform="translate(2 3)" />
                  {/* wire */}
                  <path d={path} stroke={w.color}
                    strokeWidth={g.isDragging || isHover ? 5 : 3.8}
                    fill="none" strokeLinecap="round"
                    opacity={g.connected ? 1 : 0.95} />
                  {/* highlight */}
                  <path d={path} stroke="rgba(255,255,255,0.22)"
                    strokeWidth={1} fill="none" strokeLinecap="round" />

                  {/* loose connector tip — only when not connected */}
                  {!g.connected && (
                    <g
                      style={{ cursor: g.isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
                      onPointerDown={startDrag(w.id)}>
                      {/* fat invisible hit target */}
                      <circle cx={g.tipX} cy={g.tipY} r={18} fill="transparent" />
                      {/* metal ferrule + plug */}
                      <rect x={g.tipX - 4} y={g.tipY - 14}
                        width={8} height={12}
                        fill="url(#cb-pin-metal)"
                        stroke="#5a4220" strokeWidth={0.6} rx={1} />
                      <circle cx={g.tipX} cy={g.tipY} r={6}
                        fill="url(#cb-connector)"
                        stroke="#5a4220" strokeWidth={0.8} />
                      <circle cx={g.tipX - 1.5} cy={g.tipY - 1.5} r={1.4}
                        fill="rgba(255,255,255,0.65)" />
                    </g>
                  )}
                </g>
              )
            })}

          </svg>
        </section>

        <aside className="circuit-side">
          <section className="circuit-status">
            <div className="circuit-status__count">
              <span className="circuit-status__n">{connectedCount}</span>
              <span className="circuit-status__d">/ {WIRES.length}</span>
            </div>
            <div className="circuit-status__label">
              {allConnected ? 'powered on' : 'wires connected'}
            </div>
            <button type="button" className="circuit-reset" onClick={reset}>
              reset
            </button>
          </section>

          <section className="circuit-list">
            <h2>Connections</h2>
            <p className="circuit-list__hint">
              Or click an entry below to plug / unplug that wire without dragging.
            </p>
            <ul>
              {WIRES.map((w) => {
                const isConnected = conn[w.id] === 'connected'
                return (
                  <li key={w.id}
                    className={isConnected ? 'is-verified' : ''}
                    onMouseEnter={() => setHoverWire(w.id)}
                    onMouseLeave={() => setHoverWire(null)}
                    onClick={() => toggleSidebar(w.id)}>
                    <span className="circuit-list__swatch" style={{ background: w.color }} />
                    <span className="circuit-list__sig">{w.signal}</span>
                    <span className="circuit-list__desc">{w.desc}</span>
                    <span className="circuit-list__check" aria-hidden="true">
                      {isConnected ? '✓' : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="circuit-bom">
            <h2>Bill of materials</h2>
            <ul>
              <li><b>ESP32-C3 SuperMini</b> — Espressif RISC-V SoC, USB-C</li>
              <li><b>SSD1306 OLED</b> — 0.96″, 128×64, I²C, addr 0x3C</li>
              <li><b>4-pin male header</b> — soldered to the OLED breakout</li>
              <li><b>4 jumper wires</b> — ~80mm, black / red / yellow / blue</li>
              <li><b>USB-C cable</b> — data + power</li>
            </ul>
          </section>
        </aside>
      </div>

    </div>
  )
}
