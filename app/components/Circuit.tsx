'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ensureLoop, onExpressionChange, setExpression } from './OledFace'
import { playJingle, unlockAudio } from './buzzer'

// Layout mirrors docs/hardware/wiring.mdx: a half-size breadboard in the
// centre, the ESP32-C3 SuperMini plugged across its centre gap, and the three
// peripherals arranged around it — OLED above, buzzer left, MPU-6050 right.
//
// Level 1 mirrors the Quickstart: the OLED is wired STRAIGHT to the ESP header
// (VDD→5V, GND→G, SCK→GPIO6, SDA→GPIO5) — four jumpers, no rails. The breadboard
// rails only come into play from Level 2, when the buzzer and MPU need a shared
// power/ground. The buzzer still shares the − rail rather than taking its own ESP
// pin, so the header pin count stays exactly what config.h uses.
//
// Pin map (firmware/src/config.h):
//   5V   → OLED VDD (L1, direct) · breadboard + rail (L2+)
//   G    → OLED GND (L1, direct) · breadboard − rail (L2+)
//   GP5  = PIN_SDA      OLED I²C data   (hardware bus)
//   GP6  = PIN_SCL      OLED I²C clock  (hardware bus)
//   GP7  = PIN_IMU_SDA  MPU I²C data    (software bus)
//   GP8  = PIN_IMU_SCL  MPU I²C clock   (software bus)
//   GP10 = PIN_BUZZER   passive piezo PWM

type Pin = { id: string; cx: number; cy: number; label: string }
type Comp = { id: string; pins: Pin[] }
type Wire = {
  id: string
  level: 1 | 2 | 3
  from: { c: string; p: string }
  to: { c: string; p: string }
  dockX: number
  dockY: number
  color: string
  signal: string
  desc: string
}

const VB_W = 920
const VB_H = 740

// ---- Breadboard (centre) ----------------------------------------------
const BB_X = 240
const BB_Y = 250
const BB_W = 440
const BB_H = 240
const BB_CX = BB_X + BB_W / 2 // 460

// power rails run along the top of the board, inside the frame
const RAIL_POS_Y = BB_Y + 22 // red (+)
const RAIL_NEG_Y = BB_Y + 40 // blue (−)
const RAIL_L = BB_X + 16
const RAIL_R = BB_X + BB_W - 16

// ---- ESP32-C3 SuperMini (straddles the breadboard centre gap) ---------
const ESP_X = 310
const ESP_Y = 340
const ESP_W = 300
const ESP_H = 120

// seven header pins along the top edge, ordered to sit closest to the part
// each one serves (buzzer left · power+OLED centre · MPU right)
const ESP_PIN_Y = ESP_Y
const ESP_PIN_TIP_Y = ESP_Y - 30
const ESP_PIN_STEP = 36
const ESP_PIN_LEFT = BB_CX - 3 * ESP_PIN_STEP // centre the 7 pins on the board

function espX(i: number) { return ESP_PIN_LEFT + i * ESP_PIN_STEP }
//  0 GP10 · 1 G · 2 3V3 · 3 GP5 · 4 GP6 · 5 GP7 · 6 GP8

// ---- SSD1306 OLED breakout (above the board) --------------------------
const OLED_X = 310
const OLED_Y = 30
const OLED_W = 300
const OLED_H = 175
const OLED_PIN_XS = [400, 440, 480, 520] // GND VCC SCL SDA
const OLED_HEADER_Y = OLED_Y + OLED_H - 8
const OLED_PAD_Y = OLED_HEADER_Y + 5
const OLED_PLASTIC_Y = OLED_Y + OLED_H - 6
const OLED_PIN_TIP_Y = OLED_PLASTIC_Y + 36

const SCREEN_W = OLED_W * 0.8
const SCREEN_H = SCREEN_W / 2
const SCREEN_X = OLED_X + (OLED_W - SCREEN_W) / 2
const SCREEN_Y = OLED_Y + 16

// ---- Piezo buzzer (left of the board) ---------------------------------
const BUZ_X = 150
const BUZ_Y = 372
const BUZ_R = 42
const BUZ_PAD_X = 212

// ---- GY-521 / MPU-6050 breakout (right of the board) ------------------
const MPU_X = 730
const MPU_Y = 300
const MPU_W = 120
const MPU_H = 160
const MPU_PAD_X = MPU_X - 4
const MPU_PAD_YS = [MPU_Y + 30, MPU_Y + 60, MPU_Y + 90, MPU_Y + 120] // VCC GND SCL SDA

const SNAP_RADIUS = 28

const ESP: Comp = {
  id: 'esp',
  pins: [
    { id: 'gp10', cx: espX(0), cy: ESP_PIN_Y, label: 'GP10' },
    { id: 'g', cx: espX(1), cy: ESP_PIN_Y, label: 'G' },
    { id: '5v', cx: espX(2), cy: ESP_PIN_Y, label: '5V' },
    { id: 'gp5', cx: espX(3), cy: ESP_PIN_Y, label: 'GP5' },
    { id: 'gp6', cx: espX(4), cy: ESP_PIN_Y, label: 'GP6' },
    { id: 'gp7', cx: espX(5), cy: ESP_PIN_Y, label: 'GP7' },
    { id: 'gp8', cx: espX(6), cy: ESP_PIN_Y, label: 'GP8' },
  ],
}

const OLED: Comp = {
  id: 'oled',
  pins: [
    { id: 'gnd', cx: OLED_PIN_XS[0], cy: OLED_PIN_TIP_Y, label: 'GND' },
    { id: 'vcc', cx: OLED_PIN_XS[1], cy: OLED_PIN_TIP_Y, label: 'VDD' },
    { id: 'scl', cx: OLED_PIN_XS[2], cy: OLED_PIN_TIP_Y, label: 'SCK' },
    { id: 'sda', cx: OLED_PIN_XS[3], cy: OLED_PIN_TIP_Y, label: 'SDA' },
  ],
}

const BUZZER: Comp = {
  id: 'buzzer',
  pins: [
    { id: 'sig', cx: BUZ_PAD_X, cy: BUZ_Y - 12, label: 'S' },
    { id: 'gnd', cx: BUZ_PAD_X, cy: BUZ_Y + 12, label: '−' },
  ],
}

const MPU: Comp = {
  id: 'mpu',
  pins: [
    { id: 'vcc', cx: MPU_PAD_X, cy: MPU_PAD_YS[0], label: 'VCC' },
    { id: 'gnd', cx: MPU_PAD_X, cy: MPU_PAD_YS[1], label: 'GND' },
    { id: 'scl', cx: MPU_PAD_X, cy: MPU_PAD_YS[2], label: 'SCL' },
    { id: 'sda', cx: MPU_PAD_X, cy: MPU_PAD_YS[3], label: 'SDA' },
  ],
}

// breadboard power-rail terminals — the holes wires actually land on
const RAIL_POS: Comp = {
  id: 'railPos',
  pins: [
    { id: 'p_esp', cx: 430, cy: RAIL_POS_Y, label: '+' },
    { id: 'p_oled', cx: 450, cy: RAIL_POS_Y, label: '+' },
    { id: 'p_mpu', cx: 600, cy: RAIL_POS_Y, label: '+' },
  ],
}
const RAIL_NEG: Comp = {
  id: 'railNeg',
  pins: [
    { id: 'n_buz', cx: 300, cy: RAIL_NEG_Y, label: '−' },
    { id: 'n_esp', cx: 388, cy: RAIL_NEG_Y, label: '−' },
    { id: 'n_oled', cx: 410, cy: RAIL_NEG_Y, label: '−' },
    { id: 'n_mpu', cx: 620, cy: RAIL_NEG_Y, label: '−' },
  ],
}

const COMPS: Record<string, Comp> = {
  esp: ESP, oled: OLED, buzzer: BUZZER, mpu: MPU, railPos: RAIL_POS, railNeg: RAIL_NEG,
}

const C_GND = '#2a2d33'
const C_VCC = '#c0392b'
const C_SCL = '#d9b14a'
const C_SDA = '#3b86b8'
const C_SIG = '#e5e7eb'

const WIRES: Wire[] = [
  // Level 1 — OLED wired STRAIGHT to the ESP header (the Quickstart hookup)
  { id: 'w-oled-vdd', level: 1, from: { c: 'oled', p: 'vcc' }, to: { c: 'esp', p: '5v' }, dockX: 430, dockY: 258, color: C_VCC, signal: 'OLED VDD → 5V', desc: '5 V power straight from the board' },
  { id: 'w-oled-gnd', level: 1, from: { c: 'oled', p: 'gnd' }, to: { c: 'esp', p: 'g' }, dockX: 388, dockY: 262, color: C_GND, signal: 'OLED GND → G', desc: 'OLED ground' },
  { id: 'w-oled-sck', level: 1, from: { c: 'oled', p: 'scl' }, to: { c: 'esp', p: 'gp6' }, dockX: 508, dockY: 272, color: C_SCL, signal: 'OLED SCK → GPIO6', desc: 'I²C clock — PIN_SCL in config.h' },
  { id: 'w-oled-sda', level: 1, from: { c: 'oled', p: 'sda' }, to: { c: 'esp', p: 'gp5' }, dockX: 548, dockY: 272, color: C_SDA, signal: 'OLED SDA → GPIO5', desc: 'I²C data — PIN_SDA in config.h' },
  // Level 2 — set up the breadboard rails, then add the passive piezo
  { id: 'w-pwr-pos', level: 2, from: { c: 'esp', p: '5v' }, to: { c: 'railPos', p: 'p_esp' }, dockX: 300, dockY: 232, color: C_VCC, signal: '5V → + rail', desc: 'powers the breadboard + rail' },
  { id: 'w-pwr-neg', level: 2, from: { c: 'esp', p: 'g' }, to: { c: 'railNeg', p: 'n_esp' }, dockX: 340, dockY: 244, color: C_GND, signal: 'GND → − rail', desc: 'one common ground for the rest of the build' },
  { id: 'w-buz-sig', level: 2, from: { c: 'buzzer', p: 'sig' }, to: { c: 'esp', p: 'gp10' }, dockX: 296, dockY: 330, color: C_SIG, signal: 'PWM → GPIO10', desc: 'LEDC non-blocking tone, PIN_BUZZER' },
  { id: 'w-buz-gnd', level: 2, from: { c: 'buzzer', p: 'gnd' }, to: { c: 'railNeg', p: 'n_buz' }, dockX: 290, dockY: 360, color: C_GND, signal: 'buzzer − → − rail', desc: 'shares the common ground — no dedicated ESP pin' },
  // Level 3 — MPU-6050 IMU on a second, software I²C bus
  { id: 'w-mpu-vcc', level: 3, from: { c: 'mpu', p: 'vcc' }, to: { c: 'railPos', p: 'p_mpu' }, dockX: 662, dockY: 300, color: C_VCC, signal: 'MPU VCC → + rail', desc: 'IMU power' },
  { id: 'w-mpu-gnd', level: 3, from: { c: 'mpu', p: 'gnd' }, to: { c: 'railNeg', p: 'n_mpu' }, dockX: 666, dockY: 330, color: C_GND, signal: 'MPU GND → − rail', desc: 'IMU ground' },
  { id: 'w-mpu-scl', level: 3, from: { c: 'mpu', p: 'scl' }, to: { c: 'esp', p: 'gp8' }, dockX: 656, dockY: 386, color: C_SCL, signal: 'I²C SCL → GPIO8', desc: 'PIN_IMU_SCL — software I²C bus' },
  { id: 'w-mpu-sda', level: 3, from: { c: 'mpu', p: 'sda' }, to: { c: 'esp', p: 'gp7' }, dockX: 660, dockY: 416, color: C_SDA, signal: 'I²C SDA → GPIO7', desc: 'PIN_IMU_SDA — software I²C bus' },
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
    subtitle: 'Four jumpers straight from the OLED to the board — no rails yet — and the face wakes up.',
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
    subtitle: 'Add a passive piezo — its − leg shares the breadboard ground rail.',
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
    title: 'Level 3 · Motion',
    subtitle: 'Add the MPU-6050 on a second I²C bus so the pet feels how you handle it.',
    code: `#include "imu/imu.h"
#include "config.h"

void setup() {
  // The MPU runs on a separate SOFTWARE I²C bus (GPIO7/8) so it never
  // fights the OLED for the hardware bus or drops the pull-ups too low.
  imu::begin(PIN_IMU_SDA, PIN_IMU_SCL);   // GPIO7 / GPIO8
}

void loop() {
  imu::update();                          // read accel, run gesture filter

  if (imu::lifted()) face.set(SURPRISED); // sudden +Z acceleration
  if (imu::shaken()) face.set(ANGRY);     // jerk past the threshold
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
  const [gesture, setGesture] = useState<string | null>(null)

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
  const powered = conn['w-oled-vdd'] === 'connected' && conn['w-oled-gnd'] === 'connected'
  const buzzerLive =
    level >= 2 && conn['w-buz-sig'] === 'connected' && conn['w-buz-gnd'] === 'connected'
  const motionLive =
    level >= 3 &&
    conn['w-mpu-vcc'] === 'connected' &&
    conn['w-mpu-gnd'] === 'connected' &&
    conn['w-mpu-scl'] === 'connected' &&
    conn['w-mpu-sda'] === 'connected'

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
    setDrag({ wireId, x: w.dockX, y: w.dockY })
  }

  const toggleSidebar = (wireId: string) => {
    unlockAudio()
    setConn((c) => ({ ...c, [wireId]: c[wireId] === 'connected' ? 'idle' : 'connected' }))
  }

  const reset = () => setConn(Object.fromEntries(WIRES.map((w) => [w.id, 'idle' as const])))

  function wireGeometry(w: Wire): { tipX: number; tipY: number; connected: boolean; dragging: boolean } {
    if (drag?.wireId === w.id) {
      return { tipX: drag.x, tipY: drag.y, connected: false, dragging: true }
    }
    if (conn[w.id] === 'connected') {
      const t = pinOf(w.to.c, w.to.p)!
      return { tipX: t.cx, tipY: t.cy, connected: true, dragging: false }
    }
    return { tipX: w.dockX, tipY: w.dockY, connected: false, dragging: false }
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

  // ESP pins and rail terminals that are actually used at this level
  const visibleEspPins = useMemo(() => {
    const inPlay = new Set<string>()
    activeWires.forEach((w) => {
      if (w.from.c === 'esp') inPlay.add(w.from.p)
      if (w.to.c === 'esp') inPlay.add(w.to.p)
    })
    return ESP.pins.filter((p) => inPlay.has(p.id))
  }, [activeWires])

  const visibleRailTerminals = useMemo(() => {
    const pos = new Set<string>()
    const neg = new Set<string>()
    activeWires.forEach((w) => {
      if (w.to.c === 'railPos') pos.add(w.to.p)
      if (w.to.c === 'railNeg') neg.add(w.to.p)
    })
    return {
      pos: RAIL_POS.pins.filter((p) => pos.has(p.id)),
      neg: RAIL_NEG.pins.filter((p) => neg.has(p.id)),
    }
  }, [activeWires])

  const triggerGesture = (kind: 'lift' | 'shake') => {
    if (!motionLive) return
    unlockAudio()
    setExpression(kind === 'lift' ? 'surprised' : 'angry')
    setGesture(kind)
    setTimeout(() => setGesture(null), 220)
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
              <filter id="cb-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>

            {/* ---- breadboard ---- */}
            <g>
              <rect x={BB_X} y={BB_Y} width={BB_W} height={BB_H} rx={8}
                fill="url(#cb-bb)" stroke="#8a7a3e" strokeWidth={1.4} />
              {/* top power rails */}
              <line x1={RAIL_L} y1={RAIL_POS_Y} x2={RAIL_R} y2={RAIL_POS_Y}
                stroke="#c0392b" strokeWidth={1.4} opacity={0.55} />
              <line x1={RAIL_L} y1={RAIL_NEG_Y} x2={RAIL_R} y2={RAIL_NEG_Y}
                stroke="#2c5e9e" strokeWidth={1.4} opacity={0.55} />
              {/* hole grid between the rails and the bottom rails */}
              <rect x={BB_X + 14} y={BB_Y + 54} width={BB_W - 28} height={BB_H - 96}
                fill="url(#bb-holes)" opacity={0.7} />
              {/* centre groove where the ESP straddles */}
              <rect x={BB_X + 14} y={BB_Y + BB_H / 2 - 4} width={BB_W - 28} height={8}
                fill="#b8a878" opacity={0.35} />
              {/* bottom power rails */}
              <line x1={RAIL_L} y1={BB_Y + BB_H - 40} x2={RAIL_R} y2={BB_Y + BB_H - 40}
                stroke="#c0392b" strokeWidth={1.4} opacity={0.55} />
              <line x1={RAIL_L} y1={BB_Y + BB_H - 22} x2={RAIL_R} y2={BB_Y + BB_H - 22}
                stroke="#2c5e9e" strokeWidth={1.4} opacity={0.55} />

              <text x={BB_X + BB_W - 16} y={BB_Y + BB_H - 6}
                textAnchor="end"
                fontFamily="'Pixelify Sans', monospace" fontSize={9}
                fill="#7a6a3a" opacity={0.7}>
                breadboard · 400 tie-points
              </text>

              {/* rail terminals the wires land on */}
              {visibleRailTerminals.pos.map((p) => {
                const isHot = hoveredPins.has(`railPos:${p.id}`)
                const isSnap = snapTargetId === `railPos:${p.id}`
                return (
                  <g key={`rp-${p.id}`}>
                    {isSnap && (
                      <circle cx={p.cx} cy={p.cy} r={12} fill="none" stroke="#22c55e" strokeWidth={2}>
                        <animate attributeName="r" values="9;14;9" dur="900ms" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="1;0.4;1" dur="900ms" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle cx={p.cx} cy={p.cy} r={isHot || isSnap ? 4.5 : 3.2} fill="url(#cb-pad)" />
                    <circle cx={p.cx} cy={p.cy} r={1.3} fill="#5a1410" />
                  </g>
                )
              })}
              {visibleRailTerminals.neg.map((p) => {
                const isHot = hoveredPins.has(`railNeg:${p.id}`)
                const isSnap = snapTargetId === `railNeg:${p.id}`
                return (
                  <g key={`rn-${p.id}`}>
                    {isSnap && (
                      <circle cx={p.cx} cy={p.cy} r={12} fill="none" stroke="#22c55e" strokeWidth={2}>
                        <animate attributeName="r" values="9;14;9" dur="900ms" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="1;0.4;1" dur="900ms" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle cx={p.cx} cy={p.cy} r={isHot || isSnap ? 4.5 : 3.2} fill="url(#cb-pad)" />
                    <circle cx={p.cx} cy={p.cy} r={1.3} fill="#0a2540" />
                  </g>
                )
              })}
            </g>

            {/* ---- SSD1306 OLED breakout (above) ---- */}
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

            {/* ---- piezo buzzer (left, level 2) ---- */}
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
                <text x={BUZ_X} y={BUZ_Y + BUZ_R + 16} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={10}
                  fill={SILK} opacity={0.7}>
                  PIEZO
                </text>
                {/* leads to the pin pads (facing the board) */}
                <line x1={BUZ_X + 8} y1={BUZ_Y - 12} x2={BUZ_PAD_X} y2={BUZ_Y - 12}
                  stroke="#caa05a" strokeWidth={1.5} />
                <line x1={BUZ_X + 8} y1={BUZ_Y + 12} x2={BUZ_PAD_X} y2={BUZ_Y + 12}
                  stroke="#caa05a" strokeWidth={1.5} />
                {BUZZER.pins.map((p) => {
                  const isHot = hoveredPins.has(`buzzer:${p.id}`)
                  return (
                    <g key={`bpin-${p.id}`}>
                      <circle cx={p.cx} cy={p.cy} r={isHot ? 4 : 3} fill="url(#cb-pad)" />
                      <circle cx={p.cx} cy={p.cy} r={1.3} fill="#06241a" />
                      <text x={p.cx + 8} y={p.cy + 3} textAnchor="start"
                        fontFamily="'Pixelify Sans', monospace" fontSize={8}
                        fill={SILK} opacity={0.75}>{p.label}</text>
                    </g>
                  )
                })}
              </g>
            )}

            {/* ---- MPU-6050 IMU breakout (right, level 3) ---- */}
            {level >= 3 && (
              <g>
                <rect x={MPU_X} y={MPU_Y} width={MPU_W} height={MPU_H} rx={8}
                  fill="url(#cb-pcb)" stroke="#0a3522" strokeWidth={1.2} />
                <rect x={MPU_X} y={MPU_Y} width={MPU_W} height={MPU_H} rx={8}
                  fill="url(#cb-fine)" pointerEvents="none" />
                {/* the IMU chip */}
                <rect x={MPU_X + MPU_W / 2 - 16} y={MPU_Y + MPU_H / 2 - 16}
                  width={32} height={32} rx={2}
                  fill="#15171c" stroke="#22252b" strokeWidth={0.8} />
                <circle cx={MPU_X + MPU_W / 2 - 11} cy={MPU_Y + MPU_H / 2 - 11} r={1.4} fill="#caa05a" />
                <text x={MPU_X + MPU_W - 10} y={MPU_Y + 16} textAnchor="end"
                  fontFamily="'Pixelify Sans', monospace" fontSize={9}
                  fill={SILK} opacity={0.8}>GY-521</text>
                <text x={MPU_X + MPU_W - 10} y={MPU_Y + MPU_H - 8} textAnchor="end"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill={SILK} opacity={0.55}>MPU-6050</text>
                {/* pads on the left edge, facing the board */}
                {MPU.pins.map((p) => {
                  const isHot = hoveredPins.has(`mpu:${p.id}`)
                  return (
                    <g key={`mpin-${p.id}`}>
                      <line x1={MPU_X} y1={p.cy} x2={p.cx} y2={p.cy}
                        stroke="#caa05a" strokeWidth={1.4} />
                      <circle cx={p.cx} cy={p.cy} r={isHot ? 4 : 3} fill="url(#cb-pad)" />
                      <circle cx={p.cx} cy={p.cy} r={1.3} fill="#06241a" />
                      <text x={MPU_X + 6} y={p.cy + 3} textAnchor="start"
                        fontFamily="'Pixelify Sans', monospace" fontSize={8}
                        fill={SILK} opacity={isHot ? 1 : 0.75}>{p.label}</text>
                    </g>
                  )
                })}
              </g>
            )}

            {/* ---- ESP32-C3 SuperMini (plugged across the centre gap) ---- */}
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
                  <text key={`elbl-${p.id}`} x={p.cx} y={ESP_Y + 28}
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
              <g transform={`translate(${ESP_X + ESP_W / 2 - 50} ${ESP_Y + 40})`}>
                <rect width={100} height={56} rx={3}
                  fill="#15171c" stroke="#22252b" strokeWidth={0.8} />
                {Array.from({ length: 10 }).map((_, i) => (
                  <g key={`pp-${i}`}>
                    <rect x={6 + i * 9} y={-3} width={4} height={6} fill="#9c8048" />
                    <rect x={6 + i * 9} y={53} width={4} height={6} fill="#9c8048" />
                  </g>
                ))}
                <text x={50} y={26} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={12}
                  fill="#a8aab2" letterSpacing={1}>ESP32-C3</text>
                <text x={50} y={42} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={10}
                  fill="#74767e" letterSpacing={1}>SuperMini</text>
              </g>

              {/* USB-C on the bottom edge */}
              <g transform={`translate(${ESP_X + ESP_W / 2 - 40} ${ESP_Y + ESP_H - 22})`}>
                <rect width={80} height={22} rx={5} fill="#2a2d35" stroke="#3a3d45" />
                <rect x={8} y={5} width={64} height={12} rx={2} fill="#0a0b0d" />
                <text x={40} y={14} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#7a7c84" letterSpacing={2}>USB-C</text>
              </g>

              {/* power LED — lights once both power-rail jumpers are in */}
              <g transform={`translate(${ESP_X + ESP_W - 28} ${ESP_Y + 30})`}>
                <circle r={5} fill="#08211a" stroke="#041511" />
                {powered && (
                  <circle r={2.8} fill="#22c55e" filter="url(#cb-glow)" opacity={0.95} />
                )}
              </g>

              <text x={ESP_X + ESP_W / 2} y={ESP_Y + ESP_H - 4}
                textAnchor="middle"
                fontFamily="'Pixelify Sans', monospace" fontSize={9}
                fill={SILK} opacity={0.55} letterSpacing={1.2}>
                tamagotchi · v1.0
              </text>
            </g>

            {/* ---- wires ---- */}
            {activeWires.map((w) => {
              const from = pinOf(w.from.c, w.from.p)!
              const g = wireGeometry(w)
              const path = curve(from.cx, from.cy, g.tipX, g.tipY)
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

            {/* ---- IMU gesture pads (level 3, once the MPU is live) ---- */}
            {level >= 3 && (
              <g>
                {(['lift', 'shake'] as const).map((kind, i) => {
                  const gx = MPU_X
                  const gy = MPU_Y + MPU_H + 18 + i * 34
                  const pressed = gesture === kind
                  return (
                    <g key={`ges-${kind}`}
                      style={{ cursor: motionLive ? 'pointer' : 'default' }}
                      onClick={() => triggerGesture(kind)}>
                      <rect x={gx} y={gy} width={MPU_W} height={26} rx={6}
                        fill={pressed ? '#1d6a40' : 'url(#cb-header-plastic)'}
                        stroke={motionLive ? '#22c55e' : '#3a3d45'}
                        strokeWidth={1}
                        opacity={motionLive ? 1 : 0.4} />
                      <text x={gx + MPU_W / 2} y={gy + 17} textAnchor="middle"
                        fontFamily="'Pixelify Sans', monospace" fontSize={11}
                        fill={SILK} opacity={motionLive ? 0.95 : 0.5}>
                        {kind === 'lift' ? '↑ lift' : '↯ shake'}
                      </text>
                    </g>
                  )
                })}
              </g>
            )}
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
                : motionLive
                ? 'powered on · motion live'
                : buzzerLive ? 'powered on · voice live' : 'powered on'}
            </div>
            <button type="button" className="circuit-reset" onClick={reset}>reset</button>
            {level === 1 && allConnected && (
              <button type="button" className="circuit-next" onClick={() => setLevel(2)}>
                next: voice →
              </button>
            )}
            {level === 2 && allConnected && (
              <button type="button" className="circuit-next" onClick={() => setLevel(3)}>
                next: motion →
              </button>
            )}
          </section>

          <section className="circuit-list">
            <h2>Connections</h2>
            <p className="circuit-list__hint">
              Drag a gold tip onto the matching ESP32 pin or breadboard rail —
              or click a row to plug / unplug instantly.
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
            {level === 3 && motionLive && (
              <p className="circuit-list__hint" style={{ marginTop: 10 }}>
                IMU is live — tap <strong>lift</strong> or <strong>shake</strong>{' '}
                under the MPU to trigger a reaction.
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
