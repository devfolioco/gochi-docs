'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ensureLoop, onExpressionChange, setExpression } from './OledFace'
import { playJingle, unlockAudio } from './buzzer'

// Realistic seated breadboard build (landscape). The OLED and the ESP32-C3
// SuperMini are plugged into the board; you wire them up with TWO-ENDED jumpers
// just like real life: each column of holes is one electrical node, so you plug
// one end into a free hole in a part's column and the other into its destination
// — an ESP GPIO column or the + / − power rails on the top bar.
//
// Level 1 (Display): power runs through the rails — OLED VDD + ESP 5V both go to
// the + rail; OLED GND + ESP G both go to the − rail — then the two I²C signals
// (SCK→GPIO6, SDA→GPIO5) run column-to-column.

type NodeId = string // 'T14' (top-strip col 14) | 'B15' (bottom-strip col 15) | 'RPOS' | 'RNEG'

type Pin = { id: string; cx: number; cy: number; label: string }
type Comp = { id: string; pins: Pin[] }
type Wire = {
  id: string
  level: 1 | 2 | 3
  a: NodeId
  b: NodeId
  color: string
  signal: string
  desc: string
}
type Place = { x: number; y: number }

const VB_W = 920
const VB_H = 740

// ---- Breadboard grid --------------------------------------------------
const P = 20 // horizontal hole pitch
const GRID_X = 96
const NCOLS = 30 // half breadboard — terminal columns numbered 1..30
function col(i: number) { return GRID_X + i * P }
const COL_XS = Array.from({ length: NCOLS }, (_, i) => col(i + 1)) // cols 1..30

const BB_X = 96
const BB_Y = 148
const BB_W = col(NCOLS) + 18 - BB_X
const BB_H = 420
const RAIL_L = col(1)
const RAIL_R = col(NCOLS)

// rail rows
const RT_POS = 170
const RT_NEG = 190
const RB_NEG = 520
const RB_POS = 540

// terminal rows: top strip A–E, centre gap, bottom strip F–J
const ROWS_TOP = [232, 254, 276, 298, 320]
const ROWS_BOT = [392, 414, 436, 458, 480]
const ROW_E = ROWS_TOP[4]
const ROW_F = ROWS_BOT[0]
const GAP_TOP = ROW_E + 14
const GAP_BOT = ROW_F - 14
const GAP_MID = (ROW_E + ROW_F) / 2

// ---- ESP32-C3 SuperMini (cols 1–8, straddles rows G ↔ C) --------------
// Power side on row G (upper strip, 5V at g1), GPIO side on row C (lower strip).
const ESP_C0 = 1
const ESP_TOP_Y = ROWS_TOP[3] // row G (power side)
const ESP_BOT_Y = ROWS_BOT[2] // row C (GPIO side)
const ESP_BODY_Y1 = ESP_TOP_Y + 10
const ESP_BODY_Y2 = ESP_BOT_Y - 10
const ESP_BODY_X1 = col(ESP_C0) - 11
const ESP_BODY_X2 = col(ESP_C0 + 7) + 11

const ESP_TOP_IDS = ['5v', 'g', '3v3', 'gp4', 'gp3', 'gp2', 'gp1', 'gp0']
const ESP_TOP_LBL = ['5V', 'G', '3V3', 'GP4', 'GP3', 'GP2', 'GP1', 'GP0']
const ESP_BOT_IDS = ['gp5', 'gp6', 'gp7', 'gp8', 'gp9', 'gp10', 'gp20', 'gp21']
const ESP_BOT_LBL = ['GP5', 'GP6', 'GP7', 'GP8', 'GP9', 'GP10', 'GP20', 'GP21']

// ---- SSD1306 OLED breakout (row A, bottom — stands DOWNWARD) ----------
const OLED_PIN_XS = [col(27), col(28), col(29), col(30)] // SDA SCK VDD GND (27→30)
const OLED_W = 132
const OLED_X = (OLED_PIN_XS[0] + OLED_PIN_XS[3]) / 2 - OLED_W / 2
const OLED_HEAD_Y = ROWS_BOT[4] // row A (bottom-most) — the header row
const OLED_Y = OLED_HEAD_Y + 8 // body top sits just below the header
const OLED_H = 98
const OLED_BODY_Y2 = OLED_Y + OLED_H
const SCREEN_X = OLED_X + 14
const SCREEN_Y = OLED_Y + 14
const SCREEN_W = OLED_W - 28
const SCREEN_H = SCREEN_W / 2

// ---- Piezo buzzer (row F: + at f30, − at f27, disc above) -------------
const BUZ_SIG_X = col(30)
const BUZ_GND_X = col(27)
const BUZ_X = (BUZ_SIG_X + BUZ_GND_X) / 2
const BUZ_PIN_Y = ROWS_TOP[4] // row F (upper strip, near the gap)
const BUZ_Y = 280 // disc sits above its legs
const BUZ_R = 22

// ---- GY-521 / MPU-6050 breakout (row I, cols 16–23, standing up) ------
const MPU_PAD_XS = [col(16), col(17), col(18), col(19)] // VCC GND SCL SDA (XDA/XCL/AD0/INT at 20–23)
const MPU_PAD_Y = ROWS_TOP[1] // row I
const MPU_X1 = col(16) - 9
const MPU_W = col(23) - col(16) + 18
const MPU_Y = 148
const MPU_H = 98

// ---- jumper tray (loose wires) ----------------------------------------
const TRAY_X = 786
const TRAY_W = 130
const TRAY_AX = 802
const TRAY_BX = 826
const TRAY_Y0 = 220
const TRAY_STEP = 30

const SNAP_HOLE = 13

// ---- breadboard holes + electrical nodes ------------------------------
const HOLES: { x: number; y: number; node: NodeId }[] = []
for (let c = 1; c <= NCOLS; c++) {
  for (const ry of ROWS_TOP) HOLES.push({ x: col(c), y: ry, node: `T${c}` })
  for (const ry of ROWS_BOT) HOLES.push({ x: col(c), y: ry, node: `B${c}` })
}
for (let c = 1; c <= NCOLS; c++) {
  if (c % 6 === 0) continue
  HOLES.push({ x: col(c), y: RT_POS, node: 'RPOS' })
  HOLES.push({ x: col(c), y: RB_POS, node: 'RPOS' })
  HOLES.push({ x: col(c), y: RT_NEG, node: 'RNEG' })
  HOLES.push({ x: col(c), y: RB_NEG, node: 'RNEG' })
}
const holeKey = (x: number, y: number) => `${x},${y}`
// nearest hole of the required node that isn't blocked (under a part body or
// already taken by a part's pin) — so you can't wire to a hole behind a board.
function nearestFreeHole(x: number, y: number, need: NodeId, blocked: Set<string>) {
  let best: (typeof HOLES)[number] | null = null
  let bd = Infinity
  for (const h of HOLES) {
    if (h.node !== need) continue
    if (blocked.has(holeKey(h.x, h.y))) continue
    const d = Math.hypot(h.x - x, h.y - y)
    if (d < bd) { bd = d; best = h }
  }
  return best && bd < SNAP_HOLE ? best : null
}
function parseNode(n: NodeId): { kind: 'T' | 'B' | 'rail'; col: number } {
  if (n === 'RPOS' || n === 'RNEG') return { kind: 'rail', col: 20 }
  return { kind: n[0] === 'T' ? 'T' : 'B', col: parseInt(n.slice(1), 10) }
}
// a representative hole for a node, used by the sidebar's click-to-connect.
// rails snap to the column above/below the partner end so the jumper is short.
function holeForNode(node: NodeId, partner: NodeId): Place {
  const pn = parseNode(node)
  if (pn.kind === 'rail') {
    const pp = parseNode(partner)
    const bottom = pp.kind === 'B' // use the rail on the partner's half
    const y = node === 'RPOS' ? (bottom ? RB_POS : RT_POS) : (bottom ? RB_NEG : RT_NEG)
    return { x: col(pp.kind === 'rail' ? 20 : pp.col), y }
  }
  return { x: col(pn.col), y: pn.kind === 'T' ? ROWS_TOP[2] : ROWS_BOT[3] }
}

// seated parts (drawing geometry + the basis for node mapping)
const ESP: Comp = {
  id: 'esp',
  pins: [
    ...ESP_TOP_IDS.map((id, i) => ({ id, cx: col(ESP_C0 + i), cy: ESP_TOP_Y, label: ESP_TOP_LBL[i] })),
    ...ESP_BOT_IDS.map((id, i) => ({ id, cx: col(ESP_C0 + i), cy: ESP_BOT_Y, label: ESP_BOT_LBL[i] })),
  ],
}
const OLED: Comp = {
  id: 'oled',
  pins: [
    { id: 'sda', cx: OLED_PIN_XS[0], cy: OLED_HEAD_Y, label: 'SDA' }, // a27
    { id: 'scl', cx: OLED_PIN_XS[1], cy: OLED_HEAD_Y, label: 'SCK' }, // a28
    { id: 'vcc', cx: OLED_PIN_XS[2], cy: OLED_HEAD_Y, label: 'VDD' }, // a29
    { id: 'gnd', cx: OLED_PIN_XS[3], cy: OLED_HEAD_Y, label: 'GND' }, // a30
  ],
}
const BUZZER: Comp = {
  id: 'buzzer',
  pins: [
    { id: 'sig', cx: BUZ_SIG_X, cy: BUZ_PIN_Y, label: '+' },
    { id: 'gnd', cx: BUZ_GND_X, cy: BUZ_PIN_Y, label: '−' },
  ],
}
const MPU: Comp = {
  id: 'mpu',
  pins: [
    { id: 'vcc', cx: MPU_PAD_XS[0], cy: MPU_PAD_Y, label: 'VCC' },
    { id: 'gnd', cx: MPU_PAD_XS[1], cy: MPU_PAD_Y, label: 'GND' },
    { id: 'scl', cx: MPU_PAD_XS[2], cy: MPU_PAD_Y, label: 'SCL' },
    { id: 'sda', cx: MPU_PAD_XS[3], cy: MPU_PAD_Y, label: 'SDA' },
  ],
}
const COMPS: Record<string, Comp> = { esp: ESP, oled: OLED, buzzer: BUZZER, mpu: MPU }

function pinOf(compId: string, pinId: string): Pin {
  return COMPS[compId].pins.find((p) => p.id === pinId)!
}
function colOf(cx: number) { return Math.round((cx - GRID_X) / P) }
function nodeOfPin(p: Pin): NodeId { return `${p.cy < GAP_MID ? 'T' : 'B'}${colOf(p.cx)}` }
function nodeOf(compId: string, pinId: string): NodeId { return nodeOfPin(pinOf(compId, pinId)) }

// human + short labels for every node a wire can land on — derived from the
// seated parts so they stay correct if a part is repositioned
const COMP_PREFIX: Record<string, string> = { esp: '', oled: 'OLED ', buzzer: 'buzzer ', mpu: 'MPU ' }
const NODE_LABEL: Record<string, string> = { RPOS: '+ rail', RNEG: '− rail' }
const SHORT: Record<string, string> = { RPOS: '+ rail', RNEG: '− rail' }
const ESP_NODE_TO_ID: Record<string, string> = {}
for (const c of [ESP, OLED, BUZZER, MPU]) {
  for (const p of c.pins) {
    const node = nodeOfPin(p)
    NODE_LABEL[node] = (COMP_PREFIX[c.id] + p.label).trim()
    SHORT[node] = p.label
    if (c.id === 'esp') ESP_NODE_TO_ID[node] = p.id
  }
}

const C_GND = '#2a2d33'
const C_VCC = '#c0392b'
const C_SCL = '#d9b14a'
const C_SDA = '#3b86b8'
const C_SIG = '#e5e7eb'

const WIRES: Wire[] = [
  // Level 1 — power via the rails, then the two I²C signals
  { id: 'w-oled-vdd', level: 1, a: nodeOf('oled', 'vcc'), b: 'RPOS', color: C_VCC, signal: 'OLED VDD → + rail', desc: 'OLED power off the + rail' },
  { id: 'w-esp-5v', level: 1, a: nodeOf('esp', '5v'), b: 'RPOS', color: C_VCC, signal: '5V → + rail', desc: 'ESP feeds the + rail' },
  { id: 'w-oled-gnd', level: 1, a: nodeOf('oled', 'gnd'), b: 'RNEG', color: C_GND, signal: 'OLED GND → − rail', desc: 'OLED ground' },
  { id: 'w-esp-g', level: 1, a: nodeOf('esp', 'g'), b: 'RNEG', color: C_GND, signal: 'G → − rail', desc: 'ESP feeds the − rail' },
  { id: 'w-oled-sck', level: 1, a: nodeOf('oled', 'scl'), b: nodeOf('esp', 'gp6'), color: C_SCL, signal: 'OLED SCK → GPIO6', desc: 'I²C clock — PIN_SCL' },
  { id: 'w-oled-sda', level: 1, a: nodeOf('oled', 'sda'), b: nodeOf('esp', 'gp5'), color: C_SDA, signal: 'OLED SDA → GPIO5', desc: 'I²C data — PIN_SDA' },
  // Level 2 — passive piezo
  { id: 'w-buz-sig', level: 2, a: nodeOf('buzzer', 'sig'), b: nodeOf('esp', 'gp10'), color: C_SIG, signal: 'buzzer S → GPIO10', desc: 'LEDC tone, PIN_BUZZER' },
  { id: 'w-buz-gnd', level: 2, a: nodeOf('buzzer', 'gnd'), b: 'RNEG', color: C_GND, signal: 'buzzer − → − rail', desc: 'shares the ground rail' },
  // Level 3 — MPU-6050 IMU (software I²C bus)
  { id: 'w-mpu-vcc', level: 3, a: nodeOf('mpu', 'vcc'), b: 'RPOS', color: C_VCC, signal: 'MPU VCC → + rail', desc: 'IMU power' },
  { id: 'w-mpu-gnd', level: 3, a: nodeOf('mpu', 'gnd'), b: 'RNEG', color: C_GND, signal: 'MPU GND → − rail', desc: 'IMU ground' },
  { id: 'w-mpu-scl', level: 3, a: nodeOf('mpu', 'scl'), b: nodeOf('esp', 'gp8'), color: C_SCL, signal: 'MPU SCL → GPIO8', desc: 'PIN_IMU_SCL' },
  { id: 'w-mpu-sda', level: 3, a: nodeOf('mpu', 'sda'), b: nodeOf('esp', 'gp7'), color: C_SDA, signal: 'MPU SDA → GPIO7', desc: 'PIN_IMU_SDA' },
]

function curve(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax
  const sag = Math.min(70, Math.max(24, Math.abs(dx) * 0.32))
  return `M ${ax} ${ay} C ${ax + dx * 0.25} ${Math.max(ay, by) + sag}, ${ax + dx * 0.75} ${Math.max(ay, by) + sag}, ${bx} ${by}`
}

const SILK = '#e6efd9'

type Level = 1 | 2 | 3

const LEVELS: Record<Level, { title: string; subtitle: string; code: string }> = {
  1: {
    title: 'Level 1 · Display',
    subtitle: 'Wire power through the + / − rails, then the two I²C lines — plug both ends of each jumper into the holes.',
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
    title: 'Level 2 · Buzzer',
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
  const [placements, setPlacements] = useState<Record<string, { a: Place | null; b: Place | null }>>(
    () => Object.fromEntries(WIRES.map((w) => [w.id, { a: null, b: null }])),
  )
  const [drag, setDrag] = useState<{ wireId: string; end: 'a' | 'b'; x: number; y: number } | null>(null)
  const [gesture, setGesture] = useState<string | null>(null)

  const activeWires = useMemo(() => WIRES.filter((w) => w.level <= level), [level])
  const isConn = (id: string) => {
    const p = placements[id]
    return !!(p && p.a && p.b)
  }
  const connectedCount = useMemo(
    () => activeWires.filter((w) => isConn(w.id)).length,
    [placements, activeWires],
  )
  const allConnected = connectedCount === activeWires.length

  const oledLit = useMemo(
    () => WIRES.filter((w) => w.level === 1).every((w) => isConn(w.id)),
    [placements],
  )
  const powered = isConn('w-esp-5v') && isConn('w-esp-g')
  const buzzerLive = level >= 2 && isConn('w-buz-sig') && isConn('w-buz-gnd')
  const motionLive =
    level >= 3 && isConn('w-mpu-vcc') && isConn('w-mpu-gnd') && isConn('w-mpu-scl') && isConn('w-mpu-sda')

  // a tray slot (two tips) per active wire
  const parked = useMemo(() => {
    const m: Record<string, { a: Place; b: Place }> = {}
    activeWires.forEach((w, i) => {
      const y = TRAY_Y0 + i * TRAY_STEP
      m[w.id] = { a: { x: TRAY_AX, y }, b: { x: TRAY_BX, y } }
    })
    return m
  }, [activeWires])

  // holes you can't drop a jumper into — covered by a part body, or already
  // taken by a part's own pin (one wire per hole, like a real breadboard)
  const blocked = useMemo(() => {
    const s = new Set<string>()
    const rects = [
      { x1: ESP_BODY_X1, y1: ESP_BODY_Y1, x2: ESP_BODY_X2, y2: ESP_BODY_Y2 },
      { x1: OLED_X, y1: OLED_Y, x2: OLED_X + OLED_W, y2: OLED_BODY_Y2 },
    ]
    if (level >= 2) rects.push({ x1: BUZ_X - BUZ_R, y1: BUZ_Y - BUZ_R, x2: BUZ_X + BUZ_R, y2: BUZ_Y + BUZ_R })
    if (level >= 3) rects.push({ x1: MPU_X1, y1: MPU_Y, x2: MPU_X1 + MPU_W, y2: MPU_Y + MPU_H })
    for (const h of HOLES) {
      for (const r of rects) {
        if (h.x >= r.x1 && h.x <= r.x2 && h.y >= r.y1 && h.y <= r.y2) { s.add(holeKey(h.x, h.y)); break }
      }
    }
    const pinParts = [ESP, OLED, ...(level >= 2 ? [BUZZER] : []), ...(level >= 3 ? [MPU] : [])]
    for (const c of pinParts) for (const p of c.pins) s.add(holeKey(p.cx, p.cy))
    return s
  }, [level])

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
          const need = d.end === 'a' ? w.a : w.b
          const h = nearestFreeHole(d.x, d.y, need, blocked)
          if (h) {
            unlockAudio()
            setPlacements((p) => ({ ...p, [d.wireId]: { ...p[d.wireId], [d.end]: { x: h.x, y: h.y } } }))
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
  }, [drag, blocked])

  // grabbing an end unplugs it (if it was placed) and starts dragging
  const startDrag = (wireId: string, end: 'a' | 'b') => (e: React.PointerEvent) => {
    e.preventDefault()
    const cur = placements[wireId]?.[end] ?? parked[wireId]?.[end] ?? { x: 0, y: 0 }
    setPlacements((p) => ({ ...p, [wireId]: { ...p[wireId], [end]: null } }))
    setDrag({ wireId, end, x: cur.x, y: cur.y })
  }

  // sidebar shortcut — auto-plug both ends into their columns, or unplug
  const toggleSidebar = (id: string) => {
    unlockAudio()
    const w = WIRES.find((x) => x.id === id)!
    setPlacements((p) => {
      if (p[id].a && p[id].b) return { ...p, [id]: { a: null, b: null } }
      return { ...p, [id]: { a: holeForNode(w.a, w.b), b: holeForNode(w.b, w.a) } }
    })
  }

  const reset = () => setPlacements(Object.fromEntries(WIRES.map((w) => [w.id, { a: null, b: null }])))

  const endPos = (w: Wire, end: 'a' | 'b'): Place => {
    if (drag && drag.wireId === w.id && drag.end === end) return { x: drag.x, y: drag.y }
    const pl = placements[w.id]?.[end]
    if (pl) return pl
    return parked[w.id]?.[end] ?? { x: 0, y: 0 }
  }

  // ESP header pins carrying a wire at this level get a label
  const usedEspPins = useMemo(() => {
    const s = new Set<string>()
    activeWires.forEach((w) => {
      ;[w.a, w.b].forEach((n) => { if (ESP_NODE_TO_ID[n]) s.add(ESP_NODE_TO_ID[n]) })
    })
    return s
  }, [activeWires])

  const triggerGesture = (kind: 'lift' | 'shake') => {
    if (!motionLive) return
    unlockAudio()
    setExpression(kind === 'lift' ? 'surprised' : 'angry')
    setGesture(kind)
    setTimeout(() => setGesture(null), 220)
  }

  // highlight geometry for the column / rail the dragged end must land in
  const dragNeed = drag ? (() => {
    const w = WIRES.find((x) => x.id === drag.wireId)
    if (!w) return null
    return drag.end === 'a' ? w.a : w.b
  })() : null

  return (
    <div className="circuit-page">
      <header className="circuit-top">
        <a href="/" className="circuit-back">← back</a>
        <div className="circuit-title">
          <span className="circuit-eyebrow">wiring · h.m.f #1</span>
          <h1>Playground</h1>
        </div>
        <a href="/docs" className="circuit-source">
          docs →
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
                <stop offset="0%" stopColor="#f3eccf" />
                <stop offset="100%" stopColor="#ddd0a0" />
              </linearGradient>
              <pattern id="cb-fine" width={12} height={12} patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" fill="none"
                  stroke="rgba(255,255,255,0.09)" strokeWidth={0.5} />
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
              <rect x={BB_X} y={BB_Y} width={BB_W} height={BB_H} rx={10}
                fill="url(#cb-bb)" stroke="#a8975a" strokeWidth={1.6} />
              {[[RT_POS, '#c0392b'], [RT_NEG, '#2c5e9e'], [RB_NEG, '#2c5e9e'], [RB_POS, '#c0392b']].map(
                ([ry, c], i) => (
                  <g key={`rail-${i}`}>
                    <line x1={RAIL_L} y1={ry as number} x2={RAIL_R} y2={ry as number}
                      stroke={c as string} strokeWidth={1.4} opacity={0.5} />
                    {COL_XS.filter((_, k) => k % 6 !== 0).map((cx) => (
                      <circle key={`rh-${i}-${cx}`} cx={cx} cy={ry as number} r={1.5}
                        fill="#1a1a1f" opacity={0.4} />
                    ))}
                  </g>
                ),
              )}
              {[...ROWS_TOP, ...ROWS_BOT].map((ry) =>
                COL_XS.map((cx) => (
                  <circle key={`h-${ry}-${cx}`} cx={cx} cy={ry} r={1.7} fill="#1a1a1f" opacity={0.5} />
                )),
              )}
              <rect x={BB_X + 10} y={GAP_TOP + 2} width={BB_W - 20} height={GAP_BOT - GAP_TOP - 4}
                fill="#c8b988" opacity={0.5} />
              <line x1={BB_X + 10} y1={GAP_MID} x2={BB_X + BB_W - 10} y2={GAP_MID}
                stroke="#9c8a52" strokeWidth={1} opacity={0.5} />
              {[ROWS_TOP[0] - 12, GAP_MID + 3, ROWS_BOT[ROWS_BOT.length - 1] + 22].map((ny, row) =>
                COL_XS.map((cx, i) => (
                  <text key={`cn-${row}-${i}`} x={cx} y={ny} textAnchor="middle"
                    fontFamily="ui-monospace, monospace" fontSize={8}
                    fill="#6f5f2c" opacity={(i + 1) % 5 === 0 ? 1 : 0.65}>{i + 1}</text>
                )),
              )}

              {/* row letters down both edges — A–E (top strip), F–J (bottom) */}
              {[...ROWS_TOP.map((ry, i) => [ry, 'JIHGF'[i]] as const),
                ...ROWS_BOT.map((ry, i) => [ry, 'EDCBA'[i]] as const)].map(([ry, ltr]) =>
                [BB_X + 7, col(NCOLS) + 13].map((lx, k) => (
                  <text key={`rl-${ltr}-${k}`} x={lx} y={ry + 3} textAnchor="middle"
                    fontFamily="ui-monospace, monospace" fontSize={8}
                    fill="#8a7a3e" opacity={0.75}>{ltr}</text>
                )),
              )}

              {/* + / − markers at both ends of every power rail */}
              {([[RT_POS, '+', '#c0392b'], [RT_NEG, '−', '#2c5e9e'],
                 [RB_NEG, '−', '#2c5e9e'], [RB_POS, '+', '#c0392b']] as const).map(([ry, sym, c]) =>
                [BB_X + 7, col(NCOLS) + 13].map((lx, k) => (
                  <text key={`rm-${ry}-${k}`} x={lx} y={ry + 3.5} textAnchor="middle"
                    fontFamily="ui-monospace, monospace" fontSize={10} fontWeight={700}
                    fill={c} opacity={0.85}>{sym}</text>
                )),
              )}

              <text x={BB_X + BB_W - 16} y={BB_Y + BB_H - 8} textAnchor="end"
                fontFamily="'Pixelify Sans', monospace" fontSize={9}
                fill="#7a6a3a" opacity={0.7}>half breadboard · cols 1–30</text>
            </g>

            {/* ---- ESP32-C3 SuperMini (seated, straddling the gap) ---- */}
            <g>
              {ESP.pins.map((p) => {
                const isTop = p.cy < GAP_MID
                const used = usedEspPins.has(p.id)
                const tabY1 = isTop ? p.cy : ESP_BODY_Y2
                const tabY2 = isTop ? ESP_BODY_Y1 : p.cy
                return (
                  <g key={`epin-${p.id}`}>
                    <circle cx={p.cx} cy={p.cy} r={2.4} fill="#0a0b0d" opacity={0.6} />
                    <rect x={p.cx - 2} y={tabY1} width={4} height={tabY2 - tabY1}
                      fill="url(#cb-pin-metal)" opacity={used ? 1 : 0.55} />
                    <circle cx={p.cx} cy={p.cy} r={3} fill="url(#cb-pad)" opacity={used ? 1 : 0.6} />
                    <text x={p.cx} y={isTop ? p.cy - 9 : p.cy + 16} textAnchor="middle"
                      fontFamily="'Pixelify Sans', monospace" fontSize={8} fontWeight={700}
                      fill="#43370f" opacity={used ? 1 : 0.55}>
                      {p.label}
                    </text>
                  </g>
                )
              })}
              <rect x={ESP_BODY_X1} y={ESP_BODY_Y1} width={ESP_BODY_X2 - ESP_BODY_X1}
                height={ESP_BODY_Y2 - ESP_BODY_Y1} rx={7}
                fill="url(#cb-pcb)" stroke="#0a3522" strokeWidth={1.2} />
              <rect x={ESP_BODY_X1} y={ESP_BODY_Y1} width={ESP_BODY_X2 - ESP_BODY_X1}
                height={ESP_BODY_Y2 - ESP_BODY_Y1} rx={7}
                fill="url(#cb-fine)" pointerEvents="none" />
              <g transform={`translate(${(ESP_BODY_X1 + ESP_BODY_X2) / 2 - 26} ${(ESP_BODY_Y1 + ESP_BODY_Y2) / 2 - 12})`}>
                <rect width={52} height={24} rx={2} fill="#15171c" stroke="#22252b" strokeWidth={0.7} />
                <text x={26} y={16} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#a8aab2" letterSpacing={0.5}>ESP32-C3</text>
              </g>
              {/* USB-C — on the left short edge, plugged in facing OUTSIDE the board */}
              <g pointerEvents="none">
                {(() => {
                  const py = (ESP_BODY_Y1 + ESP_BODY_Y2) / 2
                  const px = ESP_BODY_X1 - 18
                  const d = `M ${px} ${py} C ${px - 40} ${py}, 60 540, 46 ${VB_H - 18}`
                  return (
                    <>
                      <path d={d} fill="none" stroke="#15161a" strokeWidth={9} strokeLinecap="round" />
                      <path d={d} fill="none" stroke="#34373f" strokeWidth={4} strokeLinecap="round" opacity={0.7} />
                    </>
                  )
                })()}
                <rect x={ESP_BODY_X1 - 18} y={(ESP_BODY_Y1 + ESP_BODY_Y2) / 2 - 9} width={20} height={18} rx={3}
                  fill="#2a2d35" stroke="#3a3d45" />
                <rect x={ESP_BODY_X1 - 16} y={(ESP_BODY_Y1 + ESP_BODY_Y2) / 2 - 6} width={8} height={12} rx={2} fill="#15161a" />
                <text x={ESP_BODY_X1 - 22} y={(ESP_BODY_Y1 + ESP_BODY_Y2) / 2 - 12} textAnchor="end"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill={SILK} opacity={0.6}>USB-C</text>
              </g>
              <circle cx={ESP_BODY_X2 - 12} cy={ESP_BODY_Y1 + 12} r={3.4} fill="#08211a" stroke="#041511" />
              {powered && (
                <circle cx={ESP_BODY_X2 - 12} cy={ESP_BODY_Y1 + 12} r={2.2} fill="#22c55e"
                  filter="url(#cb-glow)" opacity={0.95} />
              )}
            </g>

            {/* ---- SSD1306 OLED (seated, header in row E) ---- */}
            <g>
              {OLED.pins.map((p) => (
                <g key={`opin-tab-${p.id}`}>
                  <circle cx={p.cx} cy={p.cy} r={2.4} fill="#0a0b0d" opacity={0.6} />
                  <rect x={p.cx - 2} y={p.cy} width={4} height={OLED_Y - p.cy}
                    fill="url(#cb-pin-metal)" />
                  <circle cx={p.cx} cy={p.cy} r={3} fill="url(#cb-pad)" />
                </g>
              ))}
              <rect x={OLED_X} y={OLED_Y} width={OLED_W} height={OLED_H} rx={7}
                fill="url(#cb-pcb)" stroke="#0a3522" strokeWidth={1.2} />
              <rect x={OLED_X} y={OLED_Y} width={OLED_W} height={OLED_H} rx={7}
                fill="url(#cb-fine)" pointerEvents="none" />
              <rect x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H} fill="#04060a"
                stroke={SILK} strokeWidth={0.6} opacity={0.95} />
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
                  textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={9}
                  fill={SILK} opacity={0.25}>awaiting power</text>
              )}
              {OLED.pins.map((p) => (
                <text key={`olbl-${p.id}`} x={p.cx} y={OLED_HEAD_Y - 6} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8}
                  fill="#43370f" opacity={0.85}>{p.label}</text>
              ))}
            </g>

            {/* ---- piezo buzzer (seated right, level 2) ---- */}
            {level >= 2 && (
              <g>
                <circle cx={BUZ_X} cy={BUZ_Y} r={BUZ_R} fill="url(#cb-piezo)" stroke="#0a0b0d" strokeWidth={1.5} />
                <circle cx={BUZ_X} cy={BUZ_Y} r={BUZ_R - 6} fill="none" stroke="#2a2d33" strokeWidth={1} opacity={0.6} />
                <circle cx={BUZ_X} cy={BUZ_Y} r={4} fill="#0a0b0d" stroke="#5a4220" strokeWidth={1} />
                {buzzerLive && [10, 22, 34].map((r, i) => (
                  <circle key={`rip-${i}`} cx={BUZ_X} cy={BUZ_Y} r={r}
                    fill="none" stroke="#f5b941" strokeWidth={1.2} opacity={0.6}>
                    <animate attributeName="r" values={`${r};${r + 14};${r + 28}`}
                      dur="1600ms" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.55;0.25;0"
                      dur="1600ms" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                  </circle>
                ))}
                <text x={BUZ_X} y={BUZ_Y + 3} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={9} fill={SILK} opacity={0.55}>PIEZO</text>
                {BUZZER.pins.map((p) => (
                  <g key={`bpin-${p.id}`}>
                    <line x1={BUZ_X + (p.cx - BUZ_X) * 0.5} y1={BUZ_Y + BUZ_R - 8}
                      x2={p.cx} y2={p.cy} stroke="#caa05a" strokeWidth={1.5} />
                    <circle cx={p.cx} cy={p.cy} r={2.4} fill="#0a0b0d" opacity={0.6} />
                    <circle cx={p.cx} cy={p.cy} r={3} fill="url(#cb-pad)" />
                    <text x={p.cx} y={p.cy + 14} textAnchor="middle"
                      fontFamily="'Pixelify Sans', monospace" fontSize={9} fontWeight={700}
                      fill="#43370f" opacity={0.85}>{p.label}</text>
                  </g>
                ))}
              </g>
            )}

            {/* ---- MPU-6050 IMU (seated right, level 3) ---- */}
            {level >= 3 && (
              <g>
                {/* unconnected pins (XDA XCL AD0 INT) at cols 20–23 */}
                {[['XDA', 20], ['XCL', 21], ['AD0', 22], ['INT', 23]].map(([lbl, c]) => (
                  <g key={`mx-${c}`}>
                    <circle cx={col(c as number)} cy={MPU_PAD_Y} r={2.4} fill="#0a0b0d" opacity={0.5} />
                    <rect x={col(c as number) - 2} y={MPU_Y + MPU_H} width={4} height={MPU_PAD_Y - (MPU_Y + MPU_H)}
                      fill="url(#cb-pin-metal)" opacity={0.55} />
                    <circle cx={col(c as number)} cy={MPU_PAD_Y} r={3} fill="url(#cb-pad)" opacity={0.6} />
                    <text x={col(c as number)} y={MPU_PAD_Y + 14} textAnchor="middle"
                      fontFamily="'Pixelify Sans', monospace" fontSize={8} fontWeight={700}
                      fill="#43370f" opacity={0.5}>{lbl}</text>
                  </g>
                ))}
                {MPU.pins.map((p) => (
                  <g key={`mpin-${p.id}`}>
                    <circle cx={p.cx} cy={p.cy} r={2.4} fill="#0a0b0d" opacity={0.6} />
                    <rect x={p.cx - 2} y={MPU_Y + MPU_H} width={4} height={p.cy - (MPU_Y + MPU_H)}
                      fill="url(#cb-pin-metal)" />
                    <circle cx={p.cx} cy={p.cy} r={3} fill="url(#cb-pad)" />
                    <text x={p.cx} y={p.cy + 14} textAnchor="middle"
                      fontFamily="'Pixelify Sans', monospace" fontSize={8} fontWeight={700}
                      fill="#43370f" opacity={1}>{p.label}</text>
                  </g>
                ))}
                <rect x={MPU_X1} y={MPU_Y} width={MPU_W} height={MPU_H} rx={6}
                  fill="url(#cb-pcb)" stroke="#0a3522" strokeWidth={1.2} />
                <rect x={MPU_X1} y={MPU_Y} width={MPU_W} height={MPU_H} rx={6}
                  fill="url(#cb-fine)" pointerEvents="none" />
                <rect x={MPU_X1 + MPU_W / 2 - 12} y={MPU_Y + MPU_H / 2 - 12}
                  width={24} height={24} rx={2} fill="#15171c" stroke="#22252b" strokeWidth={0.7} />
                <text x={MPU_X1 + MPU_W - 8} y={MPU_Y + 14} textAnchor="end"
                  fontFamily="'Pixelify Sans', monospace" fontSize={8} fill={SILK} opacity={0.7}>GY-521</text>
              </g>
            )}

            {/* ---- column / rail highlight for the end being dragged ---- */}
            {dragNeed && (() => {
              if (dragNeed === 'RPOS' || dragNeed === 'RNEG') {
                const y = dragNeed === 'RPOS' ? RT_POS : RT_NEG
                return (
                  <rect x={RAIL_L - 7} y={y - 8} width={RAIL_R - RAIL_L + 14} height={16} rx={5}
                    fill="rgba(34,197,94,0.16)" stroke="#22c55e" strokeWidth={1.4}
                    strokeDasharray="5 3" pointerEvents="none" />
                )
              }
              const pn = parseNode(dragNeed)
              if (pn.kind === 'rail') return null
              const rows = pn.kind === 'T' ? ROWS_TOP : ROWS_BOT
              return (
                <rect x={col(pn.col) - 8} y={rows[0] - 8} width={16}
                  height={rows[rows.length - 1] - rows[0] + 16} rx={5}
                  fill="rgba(34,197,94,0.16)" stroke="#22c55e" strokeWidth={1.4}
                  strokeDasharray="5 3" pointerEvents="none" />
              )
            })()}

            {/* ---- jumper tray ---- */}
            {activeWires.some((w) => !isConn(w.id)) && (
              <g pointerEvents="none">
                <rect x={TRAY_X} y={TRAY_Y0 - 30} width={TRAY_W}
                  height={activeWires.length * TRAY_STEP + 16} rx={8}
                  fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                <text x={TRAY_X + TRAY_W / 2} y={TRAY_Y0 - 14} textAnchor="middle"
                  fontFamily="'Pixelify Sans', monospace" fontSize={9}
                  fill={SILK} opacity={0.6}>jumper wires</text>
              </g>
            )}

            {/* ---- wires (two ends each) ---- */}
            {activeWires.map((w) => {
              const pa = endPos(w, 'a')
              const pb = endPos(w, 'b')
              const connected = isConn(w.id)
              const isHover = hoverWire === w.id
              const dragging = drag?.wireId === w.id
              const fullyParked = !connected && !dragging
                && placements[w.id].a === null && placements[w.id].b === null
              const path = curve(pa.x, pa.y, pb.x, pb.y)
              const tip = (pt: Place, end: 'a' | 'b') => (
                <g style={{ cursor: 'grab', touchAction: 'none' }} onPointerDown={startDrag(w.id, end)}>
                  <circle cx={pt.x} cy={pt.y} r={15} fill="transparent" />
                  <circle cx={pt.x} cy={pt.y} r={6} fill="url(#cb-connector)" stroke="#5a4220" strokeWidth={0.8} />
                  <circle cx={pt.x - 1.5} cy={pt.y - 1.5} r={1.4} fill="rgba(255,255,255,0.65)" />
                </g>
              )
              return (
                <g key={w.id}
                  onMouseEnter={() => setHoverWire(w.id)}
                  onMouseLeave={() => setHoverWire(null)}>
                  <path d={path} stroke="rgba(0,0,0,0.45)" strokeWidth={5} fill="none"
                    strokeLinecap="round" transform="translate(2 3)" />
                  <path d={path} stroke={w.color}
                    strokeWidth={dragging || isHover ? 5 : 3.8} fill="none"
                    strokeLinecap="round" opacity={connected ? 1 : 0.95} />
                  <path d={path} stroke="rgba(255,255,255,0.22)" strokeWidth={1} fill="none"
                    strokeLinecap="round" />
                  {fullyParked && (
                    <text x={TRAY_BX + 16} y={pa.y + 3.5} textAnchor="start"
                      fontFamily="'Pixelify Sans', monospace" fontSize={9}
                      fill={SILK} opacity={isHover ? 1 : 0.8}>{SHORT[w.a]} → {SHORT[w.b]}</text>
                  )}
                  {tip(pa, 'a')}
                  {tip(pb, 'b')}
                </g>
              )
            })}

            {/* ---- "plug into …" hint while dragging ---- */}
            {drag && dragNeed && (() => {
              const lbl = NODE_LABEL[dragNeed] ?? dragNeed
              const isRail = dragNeed === 'RPOS' || dragNeed === 'RNEG'
              const text = `plug into ${lbl}${isRail ? '' : ' column'}`
              const bw = text.length * 5.6 + 18
              return (
                <g pointerEvents="none" transform={`translate(${drag.x} ${drag.y - 24})`}>
                  <rect x={-bw / 2} y={-10} width={bw} height={20} rx={5}
                    fill="#0b2e1c" stroke="#22c55e" strokeWidth={1} opacity={0.97} />
                  <text x={0} y={4} textAnchor="middle"
                    fontFamily="'Pixelify Sans', monospace" fontSize={9} fill="#d7f5e3">{text}</text>
                </g>
              )
            })()}

            {/* ---- IMU gesture pads (level 3) ---- */}
            {level >= 3 && (
              <g>
                {(['lift', 'shake'] as const).map((kind, i) => {
                  const gw = 92
                  const gx = MPU_X1 + MPU_W / 2 - gw / 2
                  const gy = 610 + i * 34
                  const pressed = gesture === kind
                  return (
                    <g key={`ges-${kind}`}
                      style={{ cursor: motionLive ? 'pointer' : 'default' }}
                      onClick={() => triggerGesture(kind)}>
                      <rect x={gx} y={gy} width={gw} height={26} rx={6}
                        fill={pressed ? '#1d6a40' : 'url(#cb-btn-cap)'}
                        stroke={motionLive ? '#22c55e' : '#3a3d45'} strokeWidth={1}
                        opacity={motionLive ? 1 : 0.4} />
                      <text x={gx + gw / 2} y={gy + 17} textAnchor="middle"
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
                ? buzzerLive ? 'powered on · buzzer live' : 'powered on'
                : motionLive
                ? 'powered on · motion live'
                : buzzerLive ? 'powered on · buzzer live' : 'powered on'}
            </div>
            <button type="button" className="circuit-reset" onClick={reset}>reset</button>
            {level === 1 && allConnected && (
              <button type="button" className="circuit-next" onClick={() => setLevel(2)}>
                next: buzzer →
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
              Drag each jumper end into a hole — one in the part&apos;s column, the
              other in its destination column or rail. Or click a row to plug it in.
            </p>
            <ul>
              {activeWires.map((w) => {
                const connected = isConn(w.id)
                return (
                  <li key={w.id}
                    className={connected ? 'is-verified' : ''}
                    onMouseEnter={() => setHoverWire(w.id)}
                    onMouseLeave={() => setHoverWire(null)}
                    onClick={() => toggleSidebar(w.id)}>
                    <span className="circuit-list__swatch" style={{ background: w.color }} />
                    <span className="circuit-list__sig">{w.signal}</span>
                    <span className="circuit-list__desc">{w.desc}</span>
                    <span className="circuit-list__check" aria-hidden="true">
                      {connected ? '✓' : ''}
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
