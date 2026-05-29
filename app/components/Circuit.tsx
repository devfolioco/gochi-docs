'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cycleExpression, ensureLoop, onExpressionChange } from './OledFace'
import { playJingle, unlockAudio } from './buzzer'

// Pin map from firmware/src/config.h:
//   PIN_SDA    = 5    OLED data           (level 1, blue)
//   PIN_SCL    = 6    OLED clock          (level 1, yellow)
//   OLED_VCC   = 3V3                       (level 1, red)
//   OLED_GND   = G                         (level 1, black)
//   PIN_BUZZER = 10   passive piezo PWM    (level 2, white)
//   PIN_BTN_A  = 2    active-low to GND    (level 3, green)
//   PIN_BTN_B  = 3    active-low to GND    (level 3, orange)
//   PIN_BTN_C  = 4    active-low to GND    (level 3, magenta)
//   PIN_BTN_BOOT = 9  on-board, no wiring

type Pin = { id: string; cx: number; cy: number; label: string }
type Comp = { id: string; pins: Pin[] }
type Wire = {
  id: string
  level: 1 | 2 | 3
  from: { c: string; p: string }
  to: { c: string; p: string }
  fromY?: number // override Y for the "from" anchor (e.g. OLED pin tip)
  dockX: number
  dockY?: number
  color: string
  signal: string
  desc: string
}

const VB_W = 920
const VB_H = 740

// ---- Breadboard --------------------------------------------------------
const BB_X = 40
const BB_Y = 400
const BB_W = 840
const BB_H = 320

// ---- ESP32-C3 SuperMini (sits on the breadboard) -----------------------
const ESP_X = 280
const ESP_Y = 440
const ESP_W = 360
const ESP_H = 250

// ten possible pin slots across the top of the ESP32 — visible per level
const ESP_PIN_Y = ESP_Y - 4
const ESP_PIN_TIP_Y = ESP_PIN_Y - 30
const ESP_PIN_STEP = 36
const ESP_PIN_LEFT = ESP_X + 18

function espX(i: number) { return ESP_PIN_LEFT + i * ESP_PIN_STEP }

//  index → semantic pin
//   0 G_btn  · 1 GP2 · 2 GP3 · 3 GP4
//   4 G     · 5 3V3 · 6 GP6 · 7 GP5     (the four OLED pins, centered)
//   8 GP10  · 9 G_buz

// ---- SSD1306 OLED breakout (floats above ESP32, lines up with OLED pins)
const OLED_W = 320
const OLED_PIN_XS = [espX(4), espX(5), espX(6), espX(7)]
const OLED_X = (OLED_PIN_XS[0] + OLED_PIN_XS[3]) / 2 - OLED_W / 2
const OLED_Y = 40
const OLED_H = 200
const OLED_HEADER_Y = OLED_Y + OLED_H - 8
const OLED_PAD_Y = OLED_HEADER_Y + 5
const OLED_PLASTIC_Y = OLED_Y + OLED_H - 6
const OLED_PIN_TIP_Y = OLED_PLASTIC_Y + 40

const SCREEN_W = OLED_W * 0.8
const SCREEN_H = SCREEN_W / 2
const SCREEN_X = OLED_X + (OLED_W - SCREEN_W) / 2
const SCREEN_Y = OLED_Y + 17

// ---- Piezo buzzer (level 2, sits on breadboard right of ESP32) --------
const BUZ_X = 750
const BUZ_Y = 560
const BUZ_R = 44

// ---- Push buttons (level 3, sit on breadboard left of ESP32) ----------
const BTN_Y = 510
const BTN_W = 46
const BTN_H = 46
const BTN_XS = [90, 165, 240]
// breadboard ground rail — three button GND legs share it via on-board
// traces; the user only plugs one wire from the rail terminal to ESP G.
const RAIL_X = 60
const RAIL_TOP_Y = 460
const RAIL_BOT_Y = 600
const RAIL_TERMINAL_Y = 440

// loose-end resting positions for each level's wires
const DOCK_Y = (OLED_PIN_TIP_Y + ESP_PIN_TIP_Y) / 2 - 10
const SNAP_RADIUS = 28

const ESP: Comp = {
  id: 'esp',
  pins: [
    { id: 'g_btn', cx: espX(0), cy: ESP_PIN_Y, label: 'G' },
    { id: 'gp2', cx: espX(1), cy: ESP_PIN_Y, label: 'GP2' },
    { id: 'gp3', cx: espX(2), cy: ESP_PIN_Y, label: 'GP3' },
    { id: 'gp4', cx: espX(3), cy: ESP_PIN_Y, label: 'GP4' },
    { id: 'g', cx: espX(4), cy: ESP_PIN_Y, label: 'G' },
    { id: '3v3', cx: espX(5), cy: ESP_PIN_Y, label: '3V3' },
    { id: 'gp6', cx: espX(6), cy: ESP_PIN_Y, label: 'GP6' },
    { id: 'gp5', cx: espX(7), cy: ESP_PIN_Y, label: 'GP5' },
    { id: 'gp10', cx: espX(8), cy: ESP_PIN_Y, label: 'GP10' },
    { id: 'g_buz', cx: espX(9), cy: ESP_PIN_Y, label: 'G' },
  ],
}

const OLED: Comp = {
  id: 'oled',
  pins: [
    { id: 'gnd', cx: OLED_PIN_XS[0], cy: OLED_PAD_Y, label: 'GND' },
    { id: 'vcc', cx: OLED_PIN_XS[1], cy: OLED_PAD_Y, label: 'VCC' },
    { id: 'scl', cx: OLED_PIN_XS[2], cy: OLED_PAD_Y, label: 'SCL' },
    { id: 'sda', cx: OLED_PIN_XS[3], cy: OLED_PAD_Y, label: 'SDA' },
  ],
}

const BUZZER: Comp = {
  id: 'buzzer',
  pins: [
    { id: 'sig', cx: BUZ_X - 16, cy: BUZ_Y - 12, label: 'S' },
    { id: 'gnd', cx: BUZ_X - 16, cy: BUZ_Y + 12, label: 'G' },
  ],
}

// each button's signal leg is a wire endpoint; its GND leg is hard-wired
// to the breadboard's GND rail (an internal trace, not user-facing).
const BTN: Comp = {
  id: 'btn',
  pins: [
    { id: 'a', cx: BTN_XS[0] + BTN_W - 6, cy: BTN_Y + 4, label: 'A' },
    { id: 'b', cx: BTN_XS[1] + BTN_W - 6, cy: BTN_Y + 4, label: 'B' },
    { id: 'c', cx: BTN_XS[2] + BTN_W - 6, cy: BTN_Y + 4, label: 'C' },
  ],
}

const RAIL: Comp = {
  id: 'rail',
  pins: [{ id: 'gnd', cx: RAIL_X, cy: RAIL_TERMINAL_Y, label: 'GND rail' }],
}

const COMPS: Record<string, Comp> = { esp: ESP, oled: OLED, buzzer: BUZZER, btn: BTN, rail: RAIL }

const WIRES: Wire[] = [
  // Level 1 — OLED I²C
  { id: 'w-gnd', level: 1, from: { c: 'oled', p: 'gnd' }, to: { c: 'esp', p: 'g' }, dockX: 360, color: '#2a2d33', signal: 'GND', desc: 'common ground' },
  { id: 'w-vcc', level: 1, from: { c: 'oled', p: 'vcc' }, to: { c: 'esp', p: '3v3' }, dockX: 410, color: '#c0392b', signal: '3V3', desc: 'OLED power — never 5V (the SSD1306 panel is 3.3V only)' },
  { id: 'w-scl', level: 1, from: { c: 'oled', p: 'scl' }, to: { c: 'esp', p: 'gp6' }, dockX: 460, color: '#d9b14a', signal: 'I²C SCL → GPIO6', desc: 'PIN_SCL in config.h' },
  { id: 'w-sda', level: 1, from: { c: 'oled', p: 'sda' }, to: { c: 'esp', p: 'gp5' }, dockX: 510, color: '#3b86b8', signal: 'I²C SDA → GPIO5', desc: 'PIN_SDA in config.h' },
  // Level 2 — passive piezo
  { id: 'w-buz-sig', level: 2, from: { c: 'buzzer', p: 'sig' }, to: { c: 'esp', p: 'gp10' }, dockX: 700, color: '#e5e7eb', signal: 'PWM → GPIO10', desc: 'LEDC non-blocking tone, PIN_BUZZER in config.h' },
  { id: 'w-buz-gnd', level: 2, from: { c: 'buzzer', p: 'gnd' }, to: { c: 'esp', p: 'g_buz' }, dockX: 760, color: '#2a2d33', signal: 'GND', desc: 'piezo return' },
  // Level 3 — three buttons sharing a rail
  { id: 'w-btn-a', level: 3, from: { c: 'btn', p: 'a' }, to: { c: 'esp', p: 'gp2' }, dockX: 180, dockY: DOCK_Y + 30, color: '#4ade80', signal: 'BTN_A → GPIO2', desc: 'PIN_BTN_A (active-low, INPUT_PULLUP)' },
  { id: 'w-btn-b', level: 3, from: { c: 'btn', p: 'b' }, to: { c: 'esp', p: 'gp3' }, dockX: 230, dockY: DOCK_Y + 30, color: '#f59e0b', signal: 'BTN_B → GPIO3', desc: 'PIN_BTN_B (active-low, INPUT_PULLUP)' },
  { id: 'w-btn-c', level: 3, from: { c: 'btn', p: 'c' }, to: { c: 'esp', p: 'gp4' }, dockX: 280, dockY: DOCK_Y + 30, color: '#ec4899', signal: 'BTN_C → GPIO4', desc: 'PIN_BTN_C (active-low, INPUT_PULLUP)' },
  { id: 'w-rail-gnd', level: 3, from: { c: 'rail', p: 'gnd' }, to: { c: 'esp', p: 'g_btn' }, dockX: 120, dockY: DOCK_Y - 20, color: '#2a2d33', signal: 'rail GND', desc: 'one wire from the breadboard rail powers all three buttons' },
]

function pinOf(c: string, p: string): Pin | undefined {
  return COMPS[c]?.pins.find((x) => x.id === p)
}

function curve(ax: number, ay: number, bx: number, by: number): string {
  const midY = (ay + by) / 2
  return `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by}`
}

const SILK = '#e6efd9'

type Connection = 'idle' | 'connected'
type Drag = { wireId: string; x: number; y: number }
type Level = 1 | 2 | 3

const LEVELS: Record<Level, { title: string; subtitle: string; code: string }> = {
  1: {
    title: 'Level 1 · Display',
    subtitle: 'Get the OLED talking I²C so the pet has a face.',
    code: `#include <Wire.h>
#include <U8g2lib.h>
#include "config.h"

U8G2_SSD1306_128X64_NONAME_F_SW_I2C oled(
    U8G2_R0, /* SCL = */ PIN_SCL, /* SDA = */ PIN_SDA);

void setup() {
  oled.begin();           // wake the SSD1306 at I²C address 0x3C
}

void loop() {
  oled.clearBuffer();
  drawFace(oled);         // procedural face — blink, gaze, swap
  oled.sendBuffer();      // ship the 128×64 frame to the panel
}`,
  },
  2: {
    title: 'Level 2 · Voice',
    subtitle: 'Add a passive piezo so every face change gets a jingle.',
    code: `#include "buzzer/buzzer.h"
#include "assets/jingles.h"

void setup() {
  buzzer::begin();        // configure LEDC + PIN_BUZZER (GPIO10)
}

void loop() {
  buzzer::update(millis()); // non-blocking, advances the active tune

  if (faceJustChanged) {
    Jingle j = jingleFor(face.expression());
    buzzer::play(j.tones, j.count);   // {freq, ms} table per face
  }
}`,
  },
  3: {
    title: 'Level 3 · Touch',
    subtitle: 'Three momentary buttons on the breadboard — poke the pet.',
    code: `#include "config.h"

void setup() {
  // Buttons share the breadboard's GND rail. INPUT_PULLUP enables the
  // ESP32-C3's internal ~45kΩ pull-up so each pin idles HIGH and reads
  // LOW only while pressed.
  pinMode(PIN_BTN_A, INPUT_PULLUP);  // GPIO2
  pinMode(PIN_BTN_B, INPUT_PULLUP);  // GPIO3
  pinMode(PIN_BTN_C, INPUT_PULLUP);  // GPIO4
}

void loop() {
  if (digitalRead(PIN_BTN_A) == LOW) onMoodPress();
  if (digitalRead(PIN_BTN_B) == LOW) onModePress();
  if (digitalRead(PIN_BTN_C) == LOW) onFacePress();   // cycles expression
}`,
  },
}

export function Circuit() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [level, setLevel] = useState<Level>(1)
  const [hoverWire, setHoverWire] = useState<string | null>(null)
  const [conn, setConn] = useState<Record<string, Connection>>(() =>
    Object.fromEntries(WIRES.map((w) => [w.id, 'idle' as const])),
  )
  const [drag, setDrag] = useState<Drag | null>(null)
  const [pressedBtn, setPressedBtn] = useState<string | null>(null)

  const activeWires = useMemo(() => WIRES.filter((w) => w.level <= level), [level])
  const connectedCount = useMemo(
    () => activeWires.filter((w) => conn[w.id] === 'connected').length,
    [conn, activeWires],
  )
  const allConnected = connectedCount === activeWires.length

  const oledLit = useMemo(
    () => WIRES.filter((w) => w.level === 1).every((w) => conn[w.id] === 'connected'),
    [conn],
  )
  const buzzerLive =
    level >= 2 && conn['w-buz-sig'] === 'connected' && conn['w-buz-gnd'] === 'connected'
  const buttonsLive =
    level >= 3 &&
    conn['w-rail-gnd'] === 'connected' &&
    (conn['w-btn-a'] === 'connected' || conn['w-btn-b'] === 'connected' || conn['w-btn-c'] === 'connected')

  useEffect(() => {
    if (oledLit) ensureLoop()
  }, [oledLit])

  useEffect(() => {
    if (!buzzerLive) return
    unlockAudio()
    return onExpressionChange((expr) => playJingle(expr))
  }, [buzzerLive])

  // Pointer drag handlers (global so the cursor can leave the SVG)
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
              unlockAudio()
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
    setDrag({ wireId, x: w.dockX, y: w.dockY ?? DOCK_Y })
  }

  const toggleSidebar = (wireId: string) => {
    unlockAudio()
    setConn((c) => ({ ...c, [wireId]: c[wireId] === 'connected' ? 'idle' : 'connected' }))
  }

  const reset = () => setConn(Object.fromEntries(WIRES.map((w) => [w.id, 'idle' as const])))

  const wireFrom = (w: Wire) => {
    if (w.from.c === 'oled') return { x: pinOf(w.from.c, w.from.p)!.cx, y: OLED_PIN_TIP_Y }
    if (w.from.c === 'buzzer' || w.from.c === 'btn' || w.from.c === 'rail') {
      return { x: pinOf(w.from.c, w.from.p)!.cx, y: pinOf(w.from.c, w.from.p)!.cy }
    }
    return { x: pinOf(w.from.c, w.from.p)!.cx, y: pinOf(w.from.c, w.from.p)!.cy }
  }

  function wireGeometry(w: Wire): { tipX: number; tipY: number; connected: boolean; dragging: boolean } {
    if (drag?.wireId === w.id) {
      return { tipX: drag.x, tipY: drag.y, connected: false, dragging: true }
    }
    if (conn[w.id] === 'connected') {
      const t = pinOf(w.to.c, w.to.p)!
      return { tipX: t.cx, tipY: ESP_PIN_TIP_Y, connected: true, dragging: false }
    }
    return { tipX: w.dockX, tipY: w.dockY ?? DOCK_Y, connected: false, dragging: false }
  }

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

  // Visible ESP32 pins are gated on level
  const visibleEspPins = useMemo(() => {
    const oledIds = ['g', '3v3', 'gp6', 'gp5']
    const buzIds = ['gp10', 'g_buz']
    const btnIds = ['g_btn', 'gp2', 'gp3', 'gp4']
    const ids = [...oledIds, ...(level >= 2 ? buzIds : []), ...(level >= 3 ? btnIds : [])]
    return ESP.pins.filter((p) => ids.includes(p.id))
  }, [level])

  const pressButton = (id: string) => {
    if (!buttonsLive) return
    const wireId = `w-btn-${id}`
    if (conn[wireId] !== 'connected') return
    setPressedBtn(id)
    cycleExpression()
    setTimeout(() => setPressedBtn(null), 140)
  }

  return (
    <div className="circuit-page">
      <header className="circuit-top">
        <a href="/" className="circuit-back">← back</a>
        <div className="circuit-title">
          <span className="circuit-eyebrow">wiring · h.m.f #1</span>
          <h1>Circuit Builder</h1>
        </div>
        <a
          href="https://github.com/devfolioco/gochi/blob/main/firmware/src/config.h"
          target="_blank"
          rel="noreferrer"
          className="circuit-source"
        >
          config.h ↗
        </a>
      </header>

      <nav className="circuit-levels" aria-label="level">
        {([1, 2, 3] as Level[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLevel(n)}
            className={`circuit-level ${level === n ? 'is-active' : ''}`}>
            <span className="circuit-level__n">L{n}</span>
            <span className="circuit-level__name">{LEVELS[n].title.split(' · ')[1]}</span>
          </button>
        ))}
      </nav>

      <p className="circuit-hint">{LEVELS[level].subtitle}</p>

      <div className="circuit-grid">
        <section className="circuit-canvas">
          <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} className="circuit-svg">
            <defs>
              <linearGradient id="cb-pcb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d6a40" />
                <stop offset="50%" stopColor="#134a2c" />
                <stop offset="100%" stopColor="#0a3522" />
              </linearGradient>
              <linearGradient id="cb-bb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f0e7c4" />
                <stop offset="100%" stopColor="#d4c896" />
              </linearGradient>
              <pattern id="cb-fine" width={12} height={12} patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" fill="none"
                  stroke="rgba(255,255,255,0.09)" strokeWidth={0.5} />
              </pattern>
              <pattern id="cb-major" width={60} height={60} patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none"
                  stroke="rgba(255,255,255,0.16)" strokeWidth={0.6} />
              </pattern>
              <pattern id="bb-holes" x={0} y={0} width={14} height={14} patternUnits="userSpaceOnUse">
                <circle cx={7} cy={7} r={1.6} fill="#1a1a1f" opacity={0.55} />
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
              <radialGradient id="cb-piezo" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#3a3d45" />
                <stop offset="60%" stopColor="#1a1c22" />
                <stop offset="100%" stopColor="#0a0b0d" />
              </radialGradient>
              <linearGradient id="cb-btn-cap" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3a3d45" />
                <stop offset="100%" stopColor="#1a1c22" />
              </linearGradient>
              <filter id="cb-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>

            {/* ---- breadboard ---- */}
            <g>
              <rect x={BB_X} y={BB_Y} width={BB_W} height={BB_H} rx={8}
                fill="url(#cb-bb)" stroke="#8a7a3e" strokeWidth={1.4} />
              {/* power rails: red (+) and blue (-) along the top */}
              <line x1={BB_X + 14} y1={BB_Y + 14} x2={BB_X + BB_W - 14} y2={BB_Y + 14}
                stroke="#c0392b" strokeWidth={1.2} opacity={0.6} />
              <line x1={BB_X + 14} y1={BB_Y + 28} x2={BB_X + BB_W - 14} y2={BB_Y + 28}
                stroke="#2c5e9e" strokeWidth={1.2} opacity={0.6} />
              {/* hole grid */}
              <rect x={BB_X + 14} y={BB_Y + 40} width={BB_W - 28} height={BB_H - 80}
                fill="url(#bb-holes)" opacity={0.7} />
              {/* center groove */}
              <rect x={BB_X + 14} y={BB_Y + BB_H / 2 - 4} width={BB_W - 28} height={8}
                fill="#b8a878" opacity={0.35} />
              {/* rails at the bottom too */}
              <line x1={BB_X + 14} y1={BB_Y + BB_H - 28} x2={BB_X + BB_W - 14} y2={BB_Y + BB_H - 28}
                stroke="#c0392b" strokeWidth={1.2} opacity={0.6} />
              <line x1={BB_X + 14} y1={BB_Y + BB_H - 14} x2={BB_X + BB_W - 14} y2={BB_Y + BB_H - 14}
                stroke="#2c5e9e" strokeWidth={1.2} opacity={0.6} />

              {/* silkscreen marking on the breadboard */}
              <text x={BB_X + BB_W - 16} y={BB_Y + BB_H - 4}
                textAnchor="end"
                fontFamily="'Pixelify Sans', monospace" fontSize={9}
                fill="#7a6a3a" opacity={0.7}>
                breadboard · 830 tie-points
              </text>
            </g>

            {/* ---- SSD1306 OLED breakout ---- */}
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

              <rect x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H} fill="#04060a" />
              {oledLit ? (
                <foreignObject x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H}>
                  <canvas data-oled-face="" width={128} height={64}
                    style={{
                      width: '100%', height: '100%', display: 'block',
                      background: '#04060a', imageRendering: 'pixelated',
                      filter: 'drop-shadow(0 0 3px rgba(234, 243, 247, 0.35))',
                    }} />
                </foreignObject>
              ) : (
                <text x={SCREEN_X + SCREEN_W / 2} y={SCREEN_Y + SCREEN_H / 2 + 4}
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace" fontSize={9}
                  fill={SILK} opacity={0.2}>
                  awaiting power
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
                    <circle cx={p.cx} cy={OLED_PAD_Y} r={isHot ? 4 : 2.8} fill="url(#cb-pad)" />
                    <circle cx={p.cx} cy={OLED_PAD_Y} r={1.3} fill="#06241a" />
                  </g>
                )
              })}

              <rect x={OLED_PIN_XS[0] - 10} y={OLED_PLASTIC_Y}
                width={OLED_PIN_XS[3] - OLED_PIN_XS[0] + 20} height={14} rx={1.5}
                fill="url(#cb-header-plastic)" stroke="#0a0b0d" strokeWidth={0.5} />
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

            {/* ---- ESP32-C3 SuperMini (plugged into the breadboard) ---- */}
            <g>
              {visibleEspPins.map((p) => {
                const isHot = hoveredPins.has(`esp:${p.id}`)
                const isSnap = snapTargetId === `esp:${p.id}`
                return (
                  <g key={`epin-${p.id}`}>
                    {isSnap && (
                      <circle cx={p.cx} cy={ESP_PIN_TIP_Y} r={14}
                        fill="none" stroke="#22c55e" strokeWidth={2} opacity={0.9}>
                        <animate attributeName="r" values="10;16;10" dur="900ms" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="1;0.4;1" dur="900ms" repeatCount="indefinite" />
                      </circle>
                    )}
                    <rect x={p.cx - 1.8} y={ESP_PIN_TIP_Y}
                      width={3.6} height={ESP_PIN_Y - ESP_PIN_TIP_Y}
                      fill="url(#cb-pin-metal)" />
                    <rect x={p.cx - 1.8} y={ESP_PIN_TIP_Y}
                      width={3.6} height={3}
                      fill={isHot || isSnap ? '#ffeaa3' : '#f6e3a8'} />
                    <rect x={p.cx - 6} y={ESP_PIN_Y}
                      width={12} height={12}
                      fill="url(#cb-header-plastic)"
                      stroke="#0a0b0d" strokeWidth={0.4} />
                    <rect x={p.cx - 1.5} y={ESP_PIN_Y + 2}
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

              {visibleEspPins.map((p) => {
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

              {/* SoC */}
              <g transform={`translate(${ESP_X + ESP_W / 2 - 55} ${ESP_Y + 70})`}>
                <rect width={110} height={80} rx={3}
                  fill="#15171c" stroke="#22252b" strokeWidth={0.8} />
                {Array.from({ length: 11 }).map((_, i) => (
                  <g key={`pp-${i}`}>
                    <rect x={6 + i * 9} y={-3} width={4} height={6} fill="#9c8048" />
                    <rect x={6 + i * 9} y={77} width={4} height={6} fill="#9c8048" />
                  </g>
                ))}
                {Array.from({ length: 8 }).map((_, i) => (
                  <g key={`sp-${i}`}>
                    <rect x={-3} y={6 + i * 8} width={6} height={4} fill="#9c8048" />
                    <rect x={107} y={6 + i * 8} width={6} height={4} fill="#9c8048" />
                  </g>
                ))}
                <text x={55} y={36} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={12}
                  fill="#a8aab2" letterSpacing={1}>ESP32-C3</text>
                <text x={55} y={52} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={10}
                  fill="#74767e" letterSpacing={1}>SuperMini</text>
                <circle cx={8} cy={8} r={1.4} fill="#caa05a" />
              </g>

              {/* USB-C */}
              <g transform={`translate(${ESP_X + ESP_W / 2 - 40} ${ESP_Y + ESP_H - 30})`}>
                <rect width={80} height={26} rx={5} fill="#2a2d35" stroke="#3a3d45" />
                <rect x={8} y={6} width={64} height={14} rx={2} fill="#0a0b0d" />
                <text x={40} y={16} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#7a7c84" letterSpacing={2}>USB-C</text>
              </g>

              {/* power LED */}
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

            {/* ---- piezo buzzer (level 2) ---- */}
            {level >= 2 && (
              <g>
                <circle cx={BUZ_X} cy={BUZ_Y} r={BUZ_R}
                  fill="url(#cb-piezo)" stroke="#0a0b0d" strokeWidth={1.5} />
                <circle cx={BUZ_X} cy={BUZ_Y} r={BUZ_R - 6}
                  fill="none" stroke="#2a2d33" strokeWidth={1} opacity={0.6} />
                <circle cx={BUZ_X} cy={BUZ_Y} r={4}
                  fill="#0a0b0d" stroke="#5a4220" strokeWidth={1} />
                {buzzerLive && [10, 20, 30].map((r, i) => (
                  <circle key={`rip-${i}`} cx={BUZ_X} cy={BUZ_Y} r={r}
                    fill="none" stroke="#f5b941" strokeWidth={1.2} opacity={0.6}>
                    <animate attributeName="r"
                      values={`${r};${r + 14};${r + 28}`}
                      dur="1600ms" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                    <animate attributeName="opacity"
                      values="0.55;0.25;0"
                      dur="1600ms" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                  </circle>
                ))}
                <text x={BUZ_X} y={BUZ_Y + BUZ_R + 14} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={10}
                  fill="#3a3d45" opacity={0.95}>
                  PIEZO
                </text>
                {/* leads to the pin pads */}
                <line x1={BUZ_X - 8} y1={BUZ_Y - 12} x2={BUZ_X - 16} y2={BUZ_Y - 12}
                  stroke="#caa05a" strokeWidth={1.5} />
                <line x1={BUZ_X - 8} y1={BUZ_Y + 12} x2={BUZ_X - 16} y2={BUZ_Y + 12}
                  stroke="#caa05a" strokeWidth={1.5} />
                <circle cx={BUZ_X - 16} cy={BUZ_Y - 12} r={3} fill="url(#cb-pad)" />
                <circle cx={BUZ_X - 16} cy={BUZ_Y + 12} r={3} fill="url(#cb-pad)" />
                <text x={BUZ_X - 24} y={BUZ_Y - 8} textAnchor="end"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#3a3d45" opacity={0.85}>S</text>
                <text x={BUZ_X - 24} y={BUZ_Y + 17} textAnchor="end"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#3a3d45" opacity={0.85}>G</text>
              </g>
            )}

            {/* ---- push buttons (level 3) ---- */}
            {level >= 3 && (
              <g>
                {/* GND rail on the breadboard with a labeled terminal */}
                <line x1={RAIL_X} y1={RAIL_TOP_Y} x2={RAIL_X} y2={RAIL_BOT_Y}
                  stroke="#2c5e9e" strokeWidth={3} opacity={0.7} />
                <circle cx={RAIL_X} cy={RAIL_TERMINAL_Y} r={4.5} fill="url(#cb-pad)" />
                <circle cx={RAIL_X} cy={RAIL_TERMINAL_Y} r={1.8} fill="#06241a" />
                <text x={RAIL_X - 8} y={RAIL_TERMINAL_Y + 3} textAnchor="end"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#3a3d45" opacity={0.85}>GND</text>

                {/* connector traces from each button's GND leg to the rail */}
                {BTN_XS.map((x) => (
                  <line key={`trace-${x}`}
                    x1={x + 4} y1={BTN_Y + BTN_H - 2}
                    x2={x + 4} y2={BB_Y + BB_H - 14}
                    stroke="#caa05a" strokeWidth={1.2} opacity={0.7} />
                ))}
                <line x1={BB_X + 14} y1={BB_Y + BB_H - 14}
                  x2={BTN_XS[BTN_XS.length - 1] + 4} y2={BB_Y + BB_H - 14}
                  stroke="#caa05a" strokeWidth={1.2} opacity={0.7} />

                {/* the buttons themselves */}
                {(['a', 'b', 'c'] as const).map((id, i) => {
                  const x = BTN_XS[i]
                  const isPressed = pressedBtn === id
                  return (
                    <g key={`btn-${id}`}
                      style={{ cursor: buttonsLive ? 'pointer' : 'default' }}
                      onClick={() => pressButton(id)}>
                      {/* body */}
                      <rect x={x} y={BTN_Y} width={BTN_W} height={BTN_H} rx={3}
                        fill="url(#cb-btn-cap)" stroke="#0a0b0d" strokeWidth={0.8} />
                      {/* legs */}
                      <rect x={x - 2} y={BTN_Y + 4} width={3} height={4} fill="url(#cb-pin-metal)" />
                      <rect x={x - 2} y={BTN_Y + BTN_H - 8} width={3} height={4} fill="url(#cb-pin-metal)" />
                      <rect x={x + BTN_W - 1} y={BTN_Y + 4} width={3} height={4} fill="url(#cb-pin-metal)" />
                      <rect x={x + BTN_W - 1} y={BTN_Y + BTN_H - 8} width={3} height={4} fill="url(#cb-pin-metal)" />
                      {/* cap */}
                      <circle cx={x + BTN_W / 2} cy={BTN_Y + BTN_H / 2} r={isPressed ? 12 : 14}
                        fill="#4a4d55" stroke="#0a0b0d" strokeWidth={0.8} />
                      <circle cx={x + BTN_W / 2} cy={BTN_Y + BTN_H / 2} r={isPressed ? 9 : 11}
                        fill="url(#cb-btn-cap)" />
                      {/* label */}
                      <text x={x + BTN_W / 2} y={BTN_Y + BTN_H / 2 + 4} textAnchor="middle"
                        fontFamily="'Pixelify Sans', monospace" fontSize={10}
                        fill={SILK} opacity={0.95}>
                        {id.toUpperCase()}
                      </text>
                      {/* signal pad on top-right (where the wire connects) */}
                      <circle cx={x + BTN_W - 6} cy={BTN_Y + 4} r={3} fill="url(#cb-pad)" />
                    </g>
                  )
                })}
              </g>
            )}

            {/* ---- wires ---- */}
            {activeWires.map((w) => {
              const from = wireFrom(w)
              const g = wireGeometry(w)
              const path = curve(from.x, from.y, g.tipX, g.tipY)
              const isHover = hoverWire === w.id
              return (
                <g key={w.id}
                  onMouseEnter={() => setHoverWire(w.id)}
                  onMouseLeave={() => setHoverWire(null)}>
                  <path d={path} stroke="rgba(0,0,0,0.45)"
                    strokeWidth={5} fill="none" strokeLinecap="round"
                    transform="translate(2 3)" />
                  <path d={path} stroke={w.color}
                    strokeWidth={g.dragging || isHover ? 5 : 3.8}
                    fill="none" strokeLinecap="round"
                    opacity={g.connected ? 1 : 0.95} />
                  <path d={path} stroke="rgba(255,255,255,0.22)"
                    strokeWidth={1} fill="none" strokeLinecap="round" />

                  {!g.connected && (
                    <g style={{ cursor: g.dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
                       onPointerDown={startDrag(w.id)}>
                      <circle cx={g.tipX} cy={g.tipY} r={18} fill="transparent" />
                      <rect x={g.tipX - 4} y={g.tipY - 14}
                        width={8} height={12}
                        fill="url(#cb-pin-metal)"
                        stroke="#5a4220" strokeWidth={0.6} rx={1} />
                      <circle cx={g.tipX} cy={g.tipY} r={6}
                        fill="url(#cb-connector)" stroke="#5a4220" strokeWidth={0.8} />
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
              <span className="circuit-status__d">/ {activeWires.length}</span>
            </div>
            <div className="circuit-status__label">
              {!oledLit
                ? 'wires connected'
                : level === 1
                ? 'powered on'
                : level === 2
                ? buzzerLive ? 'powered on · voice live' : 'powered on'
                : buttonsLive ? 'powered on · all peripherals live' : 'powered on · voice live'}
            </div>
            <button type="button" className="circuit-reset" onClick={reset}>reset</button>
            {level === 1 && allConnected && (
              <button type="button" className="circuit-next" onClick={() => setLevel(2)}>
                next: voice →
              </button>
            )}
            {level === 2 && allConnected && (
              <button type="button" className="circuit-next" onClick={() => setLevel(3)}>
                next: touch →
              </button>
            )}
          </section>

          <section className="circuit-list">
            <h2>Connections</h2>
            <p className="circuit-list__hint">
              Drag a gold tip onto the matching ESP32 pin — or click a row
              to plug / unplug instantly.
            </p>
            <ul>
              {activeWires.map((w) => {
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
            {level === 3 && buttonsLive && (
              <p className="circuit-list__hint" style={{ marginTop: 10 }}>
                Buttons are live — click A / B / C on the breadboard to poke the pet.
              </p>
            )}
          </section>

          <section className="circuit-code">
            <h2>Firmware</h2>
            <p className="circuit-code__hint">
              What this level looks like on the real pet — same config.h.
            </p>
            <pre><code>{LEVELS[level].code}</code></pre>
          </section>
        </aside>
      </div>
    </div>
  )
}
