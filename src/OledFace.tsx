import { useCallback, useEffect, useRef } from 'react'

// Faithful web port of firmware/src/views/procedural_face.cpp — same 128x64
// canvas, same primitives, same per-expression logic. CSS scales it up with
// image-rendering: pixelated so it stays crunchy.

const OLED_W = 128
const OLED_H = 64
const EYE_CY = 27
const EYE_DX = 25

const BLINK_CLOSE_MS = 70
const BLINK_OPEN_MS = 115
const GAZE_TICK_MS = 16
const GAZE_EASE_DIV = 16
const GAZE_MIN_HOLD_MS = 1500
const GAZE_MAX_HOLD_MS = 3400

export const EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'sleepy',
  'excited',
  'surprised',
  'angry',
  'blink',
  'love',
  'horny',
  'shy',
  'dead',
] as const
export type Expression = (typeof EXPRESSIONS)[number]

function exprBlinks(e: Expression) {
  return e === 'neutral' || e === 'sad' || e === 'excited' || e === 'angry' || e === 'shy'
}

function gazeAmpFor(e: Expression) {
  switch (e) {
    case 'neutral': return 13
    case 'happy': return 10
    case 'love': return 8
    case 'sad': return 6
    case 'sleepy': return 4
    case 'blink': return 3
    case 'horny': return 5
    case 'shy': return 7
    default: return 0
  }
}

function randRange(lo: number, hi: number) {
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

function wave(now: number, period: number, amp: number) {
  if (period === 0) return 0
  const half = (period / 2) | 0
  const x = now % period | 0
  if (x < half) return -amp + (2 * amp * x) / half
  return amp - (2 * amp * (x - half)) / half
}

// Pixel renderer — exactly mirrors the firmware Renderer. Every primitive
// rasterises to integer pixels so the output is genuine 128×64 pixel art.
// CSS scales it up with image-rendering: pixelated for the OLED look.
class R {
  ctx: CanvasRenderingContext2D
  // tinted near-white, leans slightly cyan like a real SSD1306 "white" panel
  fg = '#eaf3f7'
  bg = '#04060a'

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
    ctx.imageSmoothingEnabled = false
  }

  clear() {
    this.ctx.fillStyle = this.bg
    this.ctx.fillRect(0, 0, OLED_W, OLED_H)
    this.ctx.fillStyle = this.fg
  }

  px(x: number, y: number) {
    x |= 0; y |= 0
    if (x < 0 || y < 0 || x >= OLED_W || y >= OLED_H) return
    this.ctx.fillRect(x, y, 1, 1)
  }
  drawPixel(x: number, y: number) { this.px(x, y) }

  drawLine(x0: number, y0: number, x1: number, y1: number) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
    const dx = Math.abs(x1 - x0); const sx = x0 < x1 ? 1 : -1
    const dy = -Math.abs(y1 - y0); const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    while (true) {
      this.px(x0, y0)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }

  fillCircle(cx: number, cy: number, r: number) {
    cx |= 0; cy |= 0; r |= 0
    if (r < 0) return
    const r2 = r * r
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r2) this.px(cx + x, cy + y)
      }
    }
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number) {
    x |= 0; y |= 0; w |= 0; h |= 0; r |= 0
    if (w <= 0 || h <= 0) return
    const rw = (w / 2) | 0
    const rh = (h / 2) | 0
    if (r > rw) r = rw
    if (r > rh) r = rh
    if (r < 0) r = 0
    this.ctx.fillStyle = this.fg
    this.ctx.fillRect(x, y + r, w, h - 2 * r)
    this.ctx.fillRect(x + r, y, w - 2 * r, r)
    this.ctx.fillRect(x + r, y + h - r, w - 2 * r, r)
    const r2 = r * r
    for (let yy = 0; yy < r; yy++) {
      for (let xx = 0; xx < r; xx++) {
        const dx = r - xx - 1, dy = r - yy - 1
        if (dx * dx + dy * dy <= r2) {
          this.px(x + xx, y + yy)
          this.px(x + w - 1 - xx, y + yy)
          this.px(x + xx, y + h - 1 - yy)
          this.px(x + w - 1 - xx, y + h - 1 - yy)
        }
      }
    }
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    const pts: Array<[number, number]> = [
      [x0 | 0, y0 | 0], [x1 | 0, y1 | 0], [x2 | 0, y2 | 0],
    ]
    pts.sort((a, b) => a[1] - b[1])
    const [a, b, c] = pts
    for (let y = a[1]; y <= c[1]; y++) {
      const xs: number[] = []
      const ix = (p: [number, number], q: [number, number]) => {
        if (p[1] === q[1]) return
        if (y < Math.min(p[1], q[1]) || y > Math.max(p[1], q[1])) return
        xs.push(p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]))
      }
      ix(a, b); ix(b, c); ix(a, c)
      if (xs.length < 2) continue
      const xl = Math.floor(Math.min(...xs))
      const xr = Math.ceil(Math.max(...xs))
      for (let x = xl; x <= xr; x++) this.px(x, y)
    }
  }

  clearRect(x: number, y: number, w: number, h: number) {
    this.ctx.fillStyle = this.bg
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0)
    this.ctx.fillStyle = this.fg
  }
}

// --- drawing helpers ported from procedural_face.cpp ---------------------

function thickLine(r: R, x0: number, y0: number, x1: number, y1: number, rad: number) {
  const dx = x1 - x0
  const dy = y1 - y0
  let steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps < 1) steps = 1
  for (let i = 0; i <= steps; i++) {
    r.fillCircle(x0 + (dx * i) / steps, y0 + (dy * i) / steps, rad)
  }
}

function roundEye(r: R, ex: number, ey: number, w: number, hMax: number, rad: number, open: number) {
  let h = ((hMax * open) / 256) | 0
  if (h < 3) h = 3
  let rr = rad
  if (rr > h / 2) rr = (h / 2) | 0
  if (rr > w / 2) rr = (w / 2) | 0
  if (rr < 1) rr = 1
  r.fillRoundRect(ex - (w / 2) | 0, ey - (h / 2) | 0, w, h, rr)
}

function curveEye(r: R, ex: number, ey: number, halfW: number, depth: number, thick: number, open: number) {
  const d = ((depth * open) / 256) | 0
  let th = ((thick * open) / 256) | 0
  if (open > 0 && th < 2) th = 2
  if (th < 1 || halfW < 1) return
  const hw2 = halfW * halfW
  for (let dx = -halfW; dx <= halfW; dx++) {
    const yc = ey - ((d / 2) | 0) + (((d * (hw2 - dx * dx)) / hw2) | 0)
    for (let t = 0; t < th; t++) r.drawPixel(ex + dx, yc - ((th / 2) | 0) + t)
  }
}

function xEye(r: R, ex: number, ey: number, size: number, open: number) {
  const s = ((size * open) / 256) | 0
  if (s < 2) return
  thickLine(r, ex - s, ey - s, ex + s, ey + s, 1)
  thickLine(r, ex - s, ey + s, ex + s, ey - s, 1)
}

function heart(r: R, hx: number, hy: number, size: number, open: number) {
  const s = ((size * open) / 256) | 0
  if (s < 5) return
  let lobeR = ((s * 28) / 100) | 0
  const lobeDX = ((s * 32) / 100) | 0
  const lobeDY = ((s * 14) / 100) | 0
  if (lobeR < 1) lobeR = 1
  r.fillCircle(hx - lobeDX, hy - lobeDY, lobeR)
  r.fillCircle(hx + lobeDX, hy - lobeDY, lobeR)
  const topY = hy - lobeDY
  r.fillTriangle(
    hx - ((s * 56) / 100 | 0), topY,
    hx + ((s * 56) / 100 | 0), topY,
    hx, hy + ((s * 58) / 100 | 0),
  )
}

function mouthCurve(r: R, mx: number, baseY: number, halfW: number, depth: number, thick: number) {
  if (halfW < 1) return
  const hw2 = halfW * halfW
  for (let dx = -halfW; dx <= halfW; dx++) {
    const y = baseY + (((depth * (hw2 - dx * dx)) / hw2) | 0)
    for (let t = 0; t < thick; t++) r.drawPixel(mx + dx, y + t)
  }
}

function flatMouth(r: R, mx: number, y: number, halfW: number) {
  for (let dx = -halfW; dx <= halfW; dx++) {
    r.drawPixel(mx + dx, y)
    r.drawPixel(mx + dx, y + 1)
  }
}

function openMouth(r: R, mx: number, my: number, w: number, h: number) {
  let rr = (Math.min(w, h) / 2) | 0
  if (rr < 1) rr = 1
  r.fillRoundRect(mx - (w / 2 | 0), my - (h / 2 | 0), w, h, rr)
}

function drawZ(r: R, x: number, y: number, sz: number) {
  thickLine(r, x, y, x + sz, y, 1)
  thickLine(r, x + sz, y, x, y + sz, 1)
  thickLine(r, x, y + sz, x + sz, y + sz, 1)
}

function drawTear(r: R, x: number, y: number, s: number) {
  r.fillCircle(x, y, s)
  r.fillTriangle(x - s, y, x + s, y, x, y - s * 2)
}

function drawBlush(r: R, x: number, y: number) {
  for (let i = 0; i < 3; i++) {
    const xx = x + i * 3
    r.drawLine(xx, y + 2, xx + 3, y - 2)
  }
}

// --- the component -------------------------------------------------------

type Props = {
  expression: Expression
  onClick?: () => void
}

export function OledFace({ expression, onClick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  // mutable state held across frames without re-rendering
  const stateRef = useRef({
    expr: expression,
    pending: expression,
    initialized: false,
    changing: false,
    blink: 'idle' as 'idle' | 'closing' | 'opening',
    blinkPhase: 0,
    eyeOpen: 256,
    nextBlinkAt: 0,
    gaze16: 0,
    gazeTarget16: 0,
    gazeAmp: gazeAmpFor(expression),
    gazeTick: 0,
    nextGazeAt: 0,
  })

  const scheduleBlink = useCallback((now: number) => {
    const s = stateRef.current
    let lo = 2600, hi = 5200
    if (s.expr === 'excited') { lo = 900; hi = 2100 }
    s.nextBlinkAt = now + randRange(lo, hi)
  }, [])

  const pickGaze = useCallback((now: number) => {
    const s = stateRef.current
    if (s.gazeAmp <= 0) {
      s.gazeTarget16 = 0
      s.nextGazeAt = now + 2000
      return
    }
    const spots = [-s.gazeAmp, -(s.gazeAmp / 2 | 0), 0, 0, 0, (s.gazeAmp / 2 | 0), s.gazeAmp]
    const prev = (s.gazeTarget16 / 16) | 0
    let spot = prev
    for (let tries = 0; tries < 6 && spot === prev; tries++) {
      spot = spots[randRange(0, 6)]
    }
    s.gazeTarget16 = spot * 16
    s.nextGazeAt = now + randRange(GAZE_MIN_HOLD_MS, GAZE_MAX_HOLD_MS)
  }, [])

  const onExpressionChanged = useCallback(
    (now: number) => {
      const s = stateRef.current
      s.gazeAmp = gazeAmpFor(s.expr)
      pickGaze(now)
      scheduleBlink(now)
    },
    [pickGaze, scheduleBlink],
  )

  // react to prop changes (clicks from parent change `expression`)
  useEffect(() => {
    const now = performance.now()
    const s = stateRef.current
    if (!s.initialized) {
      s.initialized = true
      s.expr = expression
      s.pending = expression
      s.eyeOpen = 256
      s.gaze16 = 0
      s.gazeTick = now
      onExpressionChanged(now)
      return
    }
    if (expression === s.expr && !s.changing) return
    s.pending = expression
    s.changing = true
    s.blink = 'closing'
    s.blinkPhase = now
  }, [expression, onExpressionChanged])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const r = new R(ctx)

    let raf = 0
    const loop = (now: number) => {
      const s = stateRef.current

      // blink / swap state machine
      if (s.blink === 'idle') {
        if (exprBlinks(s.expr) && now >= s.nextBlinkAt) {
          s.blink = 'closing'
          s.blinkPhase = now
        }
      } else if (s.blink === 'closing') {
        const t = now - s.blinkPhase
        if (t >= BLINK_CLOSE_MS) {
          s.eyeOpen = 0
          s.blink = 'opening'
          s.blinkPhase = now
          if (s.changing) {
            s.expr = s.pending
            s.changing = false
            onExpressionChanged(now)
          }
        } else {
          s.eyeOpen = 256 - ((t * 256) / BLINK_CLOSE_MS) | 0
        }
      } else if (s.blink === 'opening') {
        const t = now - s.blinkPhase
        if (t >= BLINK_OPEN_MS) {
          s.eyeOpen = 256
          s.blink = 'idle'
          scheduleBlink(now)
        } else {
          s.eyeOpen = ((t * 256) / BLINK_OPEN_MS) | 0
        }
      }

      // gaze drift
      if (now >= s.nextGazeAt) pickGaze(now)
      if (now - s.gazeTick > 500) s.gazeTick = now - GAZE_TICK_MS
      while (now - s.gazeTick >= GAZE_TICK_MS) {
        s.gazeTick += GAZE_TICK_MS
        s.gaze16 += ((s.gazeTarget16 - s.gaze16) / GAZE_EASE_DIV) | 0
      }

      // render
      r.clear()
      const cx = OLED_W / 2 | 0
      const gx = ((s.gaze16 >= 0 ? s.gaze16 + 8 : s.gaze16 - 8) / 16) | 0
      const t = now
      const elx = cx - EYE_DX + gx
      const erx = cx + EYE_DX + gx
      const mx = cx + gx
      const eo = s.eyeOpen

      switch (s.expr) {
        case 'neutral':
          roundEye(r, elx, EYE_CY, 20, 28, 9, eo)
          roundEye(r, erx, EYE_CY, 20, 28, 9, eo)
          mouthCurve(r, mx, 41, 11, 4, 2)
          break
        case 'happy': {
          const bob = wave(t, 1500, 2) | 0
          const ey = EYE_CY + bob
          curveEye(r, elx, ey, 11, 8, 5, eo)
          curveEye(r, erx, ey, 11, 8, 5, eo)
          mouthCurve(r, mx, 43 + bob, 12, 5, 2)
          break
        }
        case 'sad': {
          const ey = EYE_CY + 3
          roundEye(r, elx, ey, 18, 21, 8, eo)
          roundEye(r, erx, ey, 18, 21, 8, eo)
          thickLine(r, elx - 11, ey - 8, elx + 8, ey - 13, 1)
          thickLine(r, erx - 8, ey - 13, erx + 11, ey - 8, 1)
          mouthCurve(r, mx, 52, 11, -5, 2)
          const tp = t % 4200
          if (tp > 500 && tp < 3400) {
            const ty = ey + 7 + (((tp - 500) * 20) / 2900 | 0)
            drawTear(r, elx - 8, ty, 2)
          }
          break
        }
        case 'sleepy': {
          const bob = wave(t, 3400, 2) | 0
          const ey = EYE_CY + 3 + bob
          curveEye(r, elx, ey, 11, -3, 4, 256)
          curveEye(r, erx, ey, 11, -3, 4, 256)
          flatMouth(r, mx, 47 + bob, 5)
          for (let k = 0; k < 2; k++) {
            const ph = (t + k * 1400) % 2800
            if (ph > 2300) continue
            const prog = ((ph * 100) / 2800) | 0
            drawZ(r, 86 + (prog * 10) / 100 | 0, 24 - (prog * 20) / 100 | 0, 5 + (prog * 5) / 100 | 0)
          }
          break
        }
        case 'excited': {
          const bob = wave(t, 240, 3) | 0
          const ey = EYE_CY - 1 + bob
          roundEye(r, elx, ey, 22, 28, 10, eo)
          roundEye(r, erx, ey, 22, 28, 10, eo)
          openMouth(r, mx, 48 + bob, 15, 13)
          break
        }
        case 'surprised': {
          const ey = EYE_CY - 2
          roundEye(r, elx, ey, 24, 32, 11, eo)
          roundEye(r, erx, ey, 24, 32, 11, eo)
          openMouth(r, mx, 50, 9, 9)
          break
        }
        case 'angry': {
          const shake = wave(t, 130, 1) | 0
          const el = elx + shake
          const er = erx + shake
          const ey = EYE_CY + 2
          roundEye(r, el, ey, 20, 24, 8, eo)
          roundEye(r, er, ey, 20, 24, 8, eo)
          thickLine(r, el - 11, ey - 14, el + 9, ey - 7, 2)
          thickLine(r, er - 9, ey - 7, er + 11, ey - 14, 2)
          mouthCurve(r, mx + shake, 52, 10, -4, 2)
          break
        }
        case 'blink': {
          const bob = wave(t, 3800, 1) | 0
          const ey = EYE_CY + bob
          curveEye(r, elx, ey, 10, 5, 4, 256)
          curveEye(r, erx, ey, 10, 5, 4, 256)
          mouthCurve(r, mx, 42 + bob, 7, 2, 2)
          break
        }
        case 'love': {
          const bob = wave(t, 1500, 1) | 0
          const pulse = wave(t, 820, 3) | 0
          const sz = 18 + pulse
          const ey = EYE_CY - 1 + bob
          heart(r, elx, ey, sz, eo)
          heart(r, erx, ey, sz, eo)
          mouthCurve(r, mx, 46 + bob, 10, 4, 2)
          drawBlush(r, elx - 16, ey + 13)
          drawBlush(r, erx + 7, ey + 13)
          break
        }
        case 'horny': {
          const bob = wave(t, 1100, 1) | 0
          const wig = wave(t, 320, 2) | 0
          const lid = wave(t, 2600, 2) | 0
          const ey = EYE_CY + bob
          roundEye(r, elx, ey, 20, 24, 8, eo)
          roundEye(r, erx, ey, 20, 24, 8, eo)
          const lidH = 11 + lid
          r.clearRect(elx - 11, ey - 13, 22, lidH)
          r.clearRect(erx - 11, ey - 13, 22, lidH)
          const ly = ey - 13 + lidH
          thickLine(r, elx - 9, ly, elx + 9, ly, 1)
          thickLine(r, erx - 9, ly, erx + 9, ly, 1)
          mouthCurve(r, mx, 43 + bob, 9, 3, 2)
          openMouth(r, mx + wig, 50 + bob, 8, 9)
          drawBlush(r, elx - 16, ey + 16)
          drawBlush(r, erx + 7, ey + 16)
          break
        }
        case 'shy': {
          const bob = wave(t, 1700, 1) | 0
          const flush = wave(t, 1900, 1) | 0
          const ey = EYE_CY + 1 + bob
          roundEye(r, elx, ey, 15, 17, 6, eo)
          roundEye(r, erx, ey, 15, 17, 6, eo)
          mouthCurve(r, mx, 42 + bob, 6, 2, 2)
          const by = ey + 12
          for (let i = 0; i < 4; i++) {
            const xl = elx - 19 + i * 4
            const xr = erx + 7 + i * 4
            r.drawLine(xl, by + 3 + flush, xl + 5, by - 3 - flush)
            r.drawLine(xr, by + 3 + flush, xr + 5, by - 3 - flush)
          }
          break
        }
        case 'dead':
          xEye(r, elx, EYE_CY, 9, eo)
          xEye(r, erx, EYE_CY, 9, eo)
          flatMouth(r, mx, 49, 7)
          break
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [onExpressionChanged, pickGaze, scheduleBlink])

  return (
    <div
      className="oled"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      title="click to change expression"
    >
      <canvas
        ref={ref}
        width={OLED_W}
        height={OLED_H}
        aria-label="Animated tamagotchi face on a tiny OLED screen"
      />
      <span className="scanlines" aria-hidden="true" />
    </div>
  )
}
