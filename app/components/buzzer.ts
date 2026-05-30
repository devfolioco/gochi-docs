// Web Audio version of the firmware's passive-piezo jingles.
// Tone tables are copied verbatim from firmware/src/assets/jingles.cpp —
// {freq Hz, duration ms}, with freq=0 meaning a silent rest.

import type { Expression } from './OledFace'

type Tone = { freq: number; ms: number }

const JINGLES: Record<Expression, Tone[]> = {
  neutral: [{ freq: 587, ms: 90 }],
  happy: [
    { freq: 523, ms: 90 },
    { freq: 659, ms: 90 },
    { freq: 784, ms: 90 },
    { freq: 1047, ms: 150 },
  ],
  sad: [
    { freq: 659, ms: 200 },
    { freq: 587, ms: 200 },
    { freq: 494, ms: 350 },
  ],
  sleepy: [
    { freq: 784, ms: 260 },
    { freq: 587, ms: 260 },
    { freq: 494, ms: 430 },
  ],
  excited: [
    { freq: 880, ms: 60 },
    { freq: 0, ms: 35 },
    { freq: 1047, ms: 60 },
    { freq: 0, ms: 35 },
    { freq: 1175, ms: 60 },
    { freq: 0, ms: 35 },
    { freq: 1319, ms: 110 },
  ],
  surprised: [
    { freq: 784, ms: 60 },
    { freq: 1319, ms: 190 },
  ],
  angry: [
    { freq: 1175, ms: 90 },
    { freq: 988, ms: 90 },
    { freq: 1175, ms: 90 },
    { freq: 988, ms: 90 },
    { freq: 1175, ms: 150 },
  ],
  blink: [{ freq: 659, ms: 55 }],
  love: [
    { freq: 659, ms: 110 },
    { freq: 784, ms: 110 },
    { freq: 880, ms: 150 },
    { freq: 1047, ms: 220 },
  ],
  flirty: [
    { freq: 659, ms: 90 },
    { freq: 988, ms: 90 },
    { freq: 1245, ms: 130 },
    { freq: 988, ms: 100 },
    { freq: 740, ms: 170 },
  ],
  shy: [
    { freq: 587, ms: 90 },
    { freq: 0, ms: 70 },
    { freq: 523, ms: 150 },
  ],
  dead: [
    { freq: 784, ms: 150 },
    { freq: 587, ms: 150 },
    { freq: 440, ms: 170 },
    { freq: 349, ms: 480 },
  ],
}

let ctx: AudioContext | null = null
let muteUntil = 0 // scheduled time after the last note ends — prevents stacking

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

export function unlockAudio() {
  // call once on a user gesture so browsers allow the AudioContext to play
  const c = getCtx()
  if (c && c.state === 'suspended') void c.resume()
}

export function playJingle(expr: Expression, gain = 0.06) {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume()

  const tones = JINGLES[expr]
  let t = Math.max(c.currentTime, muteUntil) + 0.01
  for (const tone of tones) {
    const dur = tone.ms / 1000
    if (tone.freq > 0) {
      const osc = c.createOscillator()
      osc.type = 'square' // piezo buzzer is a square-wave generator
      osc.frequency.value = tone.freq

      const g = c.createGain()
      // 5ms attack / 8ms release to kill the click on either end
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(gain, t + 0.005)
      g.gain.setValueAtTime(gain, t + Math.max(0.01, dur - 0.008))
      g.gain.linearRampToValueAtTime(0, t + dur)

      osc.connect(g).connect(c.destination)
      osc.start(t)
      osc.stop(t + dur)
    }
    t += dur
  }
  muteUntil = t
}
