// Vertical hookup: OLED breakout (with a real pin header) on top, ESP32-C3
// SuperMini on the bottom, four jumper wires going pin-to-pin.

const W = 480
const H = 670

const SILK = '#e6efd9' // bone-white silkscreen on green solder mask

// shared X positions for the four signal pins, used at both ends
const PIN_X = [180, 220, 260, 300]
const WIRE_COLORS = ['#2a2d33', '#c0392b', '#d9b14a', '#3b86b8'] // GND, VCC, SCL, SDA
const LABELS = ['GND', 'VCC', 'SCL', 'SDA']

// vertical anchors
const BREAKOUT_X = 70
const BREAKOUT_W = W - 2 * BREAKOUT_X // 340 SVG units
const BREAKOUT_Y = 30
const BREAKOUT_H = 200
// OLED is 80% wide × the matching 2:1 height (272×136 SVG units); the silk
// footprint frame uses the OLED's exact size and sits near the top, leaving
// the bottom of the breakout for the pin silk labels and pads.
const OLED_W = BREAKOUT_W * 0.8
const OLED_H = OLED_W / 2
const OLED_X = BREAKOUT_X + (BREAKOUT_W - OLED_W) / 2
const OLED_Y = BREAKOUT_Y + 17 // top-aligned with a small top margin

// silk labels and pads live INSIDE the breakout (bottom margin under the OLED);
// the plastic header sits just below the PCB and the metal pins poke further down.
const HEADER_Y = BREAKOUT_Y + BREAKOUT_H - 8 // silk pin labels, inside breakout
const PAD_Y = HEADER_Y + 5 // gold solder pads, inside breakout
const PLASTIC_Y = BREAKOUT_Y + BREAKOUT_H - 6 // plastic strip overlaps the PCB edge so it reads as mounted
const PIN_TIP_Y = PLASTIC_Y + 40 // metal pin tabs end here

const ESP_Y = 390
const ESP_H = 230
const ESP_HEADER_Y = ESP_Y - 4 // top edge of the ESP32 header pins
const ESP_PIN_TIP_Y = ESP_HEADER_Y - 28 // wires attach to ESP pin tops

export function CircuitBoard() {
  return (
    <svg
      className="circuit"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pcb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d6a40" />
          <stop offset="50%" stopColor="#134a2c" />
          <stop offset="100%" stopColor="#0a3522" />
        </linearGradient>
        <radialGradient id="pad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#f4d28a" />
          <stop offset="60%" stopColor="#caa05a" />
          <stop offset="100%" stopColor="#5a4220" />
        </radialGradient>
        <linearGradient id="pin-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6e3a8" />
          <stop offset="50%" stopColor="#c79a3a" />
          <stop offset="100%" stopColor="#8a6a20" />
        </linearGradient>
        <linearGradient id="header-plastic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b2d33" />
          <stop offset="100%" stopColor="#15161a" />
        </linearGradient>
        {/* blueprint grid overlay — faint white lines tiled across the PCB
            so the boards echo the page background while staying green */}
        <pattern id="pcb-grid" width={12} height={12} patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none"
            stroke="rgba(255,255,255,0.09)" strokeWidth={0.5} />
        </pattern>
        <pattern id="pcb-grid-major" width={60} height={60} patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none"
            stroke="rgba(255,255,255,0.16)" strokeWidth={0.6} />
        </pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* OLED breakout PCB */}
      <g>
        <rect
          x={BREAKOUT_X} y={BREAKOUT_Y}
          width={BREAKOUT_W} height={BREAKOUT_H}
          rx={8}
          fill="url(#pcb)" stroke="#0a3522" strokeWidth={1.2}
        />
        <rect
          x={BREAKOUT_X} y={BREAKOUT_Y}
          width={BREAKOUT_W} height={BREAKOUT_H}
          rx={8}
          fill="url(#pcb-grid)" pointerEvents="none"
        />
        <rect
          x={BREAKOUT_X} y={BREAKOUT_Y}
          width={BREAKOUT_W} height={BREAKOUT_H}
          rx={8}
          fill="url(#pcb-grid-major)" pointerEvents="none"
        />
        {/* silkscreen footprint for the OLED module — exactly the OLED's
            rectangle so the screen sits flush inside the white silk box,
            like a real designed component placement */}
        <rect
          x={OLED_X} y={OLED_Y}
          width={OLED_W} height={OLED_H}
          fill="none"
          stroke={SILK} strokeWidth={0.8} opacity={0.6}
        />
        {/* solid silk corner brackets at the OLED corners */}
        {[
          [OLED_X, OLED_Y, 1, 1],
          [OLED_X + OLED_W, OLED_Y, -1, 1],
          [OLED_X, OLED_Y + OLED_H, 1, -1],
          [OLED_X + OLED_W, OLED_Y + OLED_H, -1, -1],
        ].map(([cx, cy, sx, sy], i) => (
          <path key={`bracket-${i}`}
            d={`M ${cx + sx * 6} ${cy} L ${cx} ${cy} L ${cx} ${cy + sy * 6}`}
            fill="none" stroke={SILK} strokeWidth={1.4} opacity={0.85}
          />
        ))}

        {/* mounting holes — pulled in to the corners of the silk footprint */}
        {[
          [BREAKOUT_X + 14, BREAKOUT_Y + 8],
          [BREAKOUT_X + BREAKOUT_W - 14, BREAKOUT_Y + 8],
        ].map(([cx, cy], i) => (
          <g key={`mh-${i}`}>
            <circle cx={cx} cy={cy} r={3} fill="#caa05a" />
            <circle cx={cx} cy={cy} r={1.3} fill="#06241a" />
          </g>
        ))}

        {/* pin silk labels — inside breakout bottom margin */}
        {PIN_X.map((x, i) => (
          <text key={`lbl-${i}`} x={x} y={HEADER_Y}
            textAnchor="middle"
            fontFamily="'Pixelify Sans', ui-monospace, monospace" fontSize={7}
            fill={SILK} opacity={0.9} letterSpacing={0.4}>
            {LABELS[i]}
          </text>
        ))}

        {/* gold solder pads — inside breakout, smaller to fit the margin */}
        {PIN_X.map((x, i) => (
          <g key={`pad-${i}`}>
            <circle cx={x} cy={PAD_Y} r={2.8} fill="url(#pad)" />
            <circle cx={x} cy={PAD_Y} r={1.3} fill="#06241a" />
          </g>
        ))}

        {/* black plastic pin header — the strip that sits on top of the PCB
            with metal pins poking out the bottom */}
        <rect
          x={PIN_X[0] - 10} y={PLASTIC_Y}
          width={PIN_X[3] - PIN_X[0] + 20} height={14}
          rx={1.5}
          fill="url(#header-plastic)"
          stroke="#0a0b0d" strokeWidth={0.5}
        />
        {/* tiny rectangular wells where each pin emerges through the plastic */}
        {PIN_X.map((x) => (
          <rect key={`well-${x}`}
            x={x - 1.5} y={PLASTIC_Y + 2}
            width={3} height={10}
            fill="#0a0b0d"
          />
        ))}

        {/* metal pin tabs sticking down past the plastic */}
        {PIN_X.map((x) => (
          <g key={`pin-${x}`}>
            <rect
              x={x - 1.8} y={PLASTIC_Y + 14}
              width={3.6} height={PIN_TIP_Y - PLASTIC_Y - 14}
              fill="url(#pin-metal)"
            />
            {/* shiny tip */}
            <rect
              x={x - 1.8} y={PIN_TIP_Y - 4}
              width={3.6} height={4}
              fill="#f6e3a8"
            />
          </g>
        ))}
      </g>

      {/* jumper wires from breakout pin tips → ESP32 header pin tops.
          Slight horizontal wander so it looks hand-routed. */}
      {PIN_X.map((x0, i) => {
        const x1 = x0 - 18 + i * 6
        const yA = PIN_TIP_Y + 1
        const yB = ESP_PIN_TIP_Y - 1
        const yMid = (yA + yB) / 2
        const d = `M ${x0} ${yA}
                   C ${x0} ${yMid}, ${x1} ${yMid}, ${x1} ${yB}`
        return (
          <g key={`wire-${i}`}>
            <path d={d} fill="none" stroke="rgba(0,0,0,0.5)"
              strokeWidth={5} strokeLinecap="round"
              transform="translate(2 3)" />
            <path d={d} fill="none" stroke={WIRE_COLORS[i]}
              strokeWidth={3.6} strokeLinecap="round" />
            <path d={d} fill="none" stroke="rgba(255,255,255,0.18)"
              strokeWidth={1} strokeLinecap="round" />
          </g>
        )
      })}

      {/* ESP32-C3 SuperMini PCB */}
      <g>
        <rect
          x={90} y={ESP_Y} width={W - 180} height={ESP_H}
          rx={10}
          fill="url(#pcb)" stroke="#0a3522" strokeWidth={1.2}
        />
        <rect
          x={90} y={ESP_Y} width={W - 180} height={ESP_H}
          rx={10}
          fill="url(#pcb-grid)" pointerEvents="none"
        />
        <rect
          x={90} y={ESP_Y} width={W - 180} height={ESP_H}
          rx={10}
          fill="url(#pcb-grid-major)" pointerEvents="none"
        />
        {/* silk border */}
        <rect
          x={100} y={ESP_Y + 10} width={W - 200} height={ESP_H - 20}
          rx={6} fill="none"
          stroke={SILK} strokeWidth={0.4} strokeDasharray="3 3" opacity={0.4}
        />

        {/* mounting holes */}
        {[
          [104, ESP_Y + 16], [W - 104, ESP_Y + 16],
          [104, ESP_Y + ESP_H - 16], [W - 104, ESP_Y + ESP_H - 16],
        ].map(([cx, cy], i) => (
          <g key={`emh-${i}`}>
            <circle cx={cx} cy={cy} r={4.5} fill="#caa05a" />
            <circle cx={cx} cy={cy} r={2} fill="#06241a" />
          </g>
        ))}

        {/* ESP32 header pins — black plastic strip with gold pin tops the wires plug into */}
        {PIN_X.map((x0, i) => {
          const x = x0 - 18 + i * 6
          return (
            <g key={`epin-${i}`}>
              {/* pin metal above the plastic — wires plug onto this */}
              <rect
                x={x - 1.8} y={ESP_PIN_TIP_Y}
                width={3.6} height={ESP_HEADER_Y - ESP_PIN_TIP_Y}
                fill="url(#pin-metal)"
              />
              <rect
                x={x - 1.8} y={ESP_PIN_TIP_Y}
                width={3.6} height={3}
                fill="#f6e3a8"
              />
              {/* plastic strip */}
              <rect
                x={x - 6} y={ESP_HEADER_Y}
                width={12} height={12}
                fill="url(#header-plastic)"
                stroke="#0a0b0d" strokeWidth={0.4}
              />
              <rect
                x={x - 1.5} y={ESP_HEADER_Y + 2}
                width={3} height={8}
                fill="#0a0b0d"
              />
              {/* silk label below */}
              <text x={x} y={ESP_HEADER_Y + 24}
                textAnchor="middle"
                fontFamily="'Pixelify Sans', ui-monospace, monospace" fontSize={9}
                fill={SILK} opacity={0.85}>
                {['G', '3V3', 'GP5', 'GP4'][i]}
              </text>
            </g>
          )
        })}

        {/* ESP32-C3 SoC */}
        <g transform={`translate(${W / 2 - 55} ${ESP_Y + 80})`}>
          <rect width={110} height={80} rx={3}
            fill="#15171c" stroke="#22252b" strokeWidth={0.8} />
          {Array.from({ length: 12 }).map((_, i) => (
            <g key={`p-${i}`}>
              <rect x={6 + i * 8.2} y={-3} width={4} height={6} fill="#9c8048" />
              <rect x={6 + i * 8.2} y={77} width={4} height={6} fill="#9c8048" />
            </g>
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <g key={`s-${i}`}>
              <rect x={-3} y={8 + i * 7} width={6} height={4} fill="#9c8048" />
              <rect x={107} y={8 + i * 7} width={6} height={4} fill="#9c8048" />
            </g>
          ))}
          <text x={55} y={38} textAnchor="middle"
            fontFamily="'Pixelify Sans', ui-monospace, monospace" fontSize={11}
            fill="#a8aab2" letterSpacing={1}>ESP32-C3</text>
          <text x={55} y={52} textAnchor="middle"
            fontFamily="'Pixelify Sans', ui-monospace, monospace" fontSize={9}
            fill="#74767e" letterSpacing={1}>SuperMini</text>
          <circle cx={8} cy={8} r={1.4} fill="#caa05a" />
        </g>

        {/* USB-C on the bottom edge */}
        <g transform={`translate(${W / 2 - 40} ${ESP_Y + ESP_H - 36})`}>
          <rect width={80} height={26} rx={5} fill="#2a2d35" stroke="#3a3d45" />
          <rect x={8} y={6} width={64} height={13} rx={2} fill="#0a0b0d" />
          <text x={40} y={16} textAnchor="middle"
            fontFamily="'Pixelify Sans', ui-monospace, monospace" fontSize={8}
            fill="#7a7c84" letterSpacing={2}>USB-C</text>
        </g>

        {/* power LED — the one cyan accent */}
        <g transform={`translate(${W - 130} ${ESP_Y + 70})`}>
          <circle r={5} fill="#08211a" stroke="#041511" />
          <circle r={2.5} fill="#f5b941" filter="url(#glow)" opacity={0.95} />
        </g>

        {/* passives */}
        {[
          [W / 2 - 80, ESP_Y + 50],
          [W / 2 + 60, ESP_Y + 50],
          [W / 2 - 80, ESP_Y + 175],
          [W / 2 + 60, ESP_Y + 175],
        ].map(([x, y], i) => (
          <g key={`pas-${i}`} transform={`translate(${x} ${y})`}>
            <rect width={12} height={5} rx={0.6} fill="#1a1a1f" />
            <rect x={-1} y={0} width={2} height={5} fill="#9c8048" />
            <rect x={11} y={0} width={2} height={5} fill="#9c8048" />
          </g>
        ))}

        <text x={W / 2} y={ESP_Y + ESP_H + 14} textAnchor="middle"
          fontFamily="'Pixelify Sans', ui-monospace, monospace" fontSize={9}
          fill={SILK} opacity={0.55} letterSpacing={1.2}>
          tamagotchi · v1.0 · 2026
        </text>
      </g>
    </svg>
  )
}
