import { useState } from 'react'
import { CircuitBoard } from './CircuitBoard'
import { EXPRESSIONS, OledFace, type Expression } from './OledFace'
import './App.css'

function App() {
  const [expr, setExpr] = useState<Expression>('neutral')

  const cycle = () => {
    const i = EXPRESSIONS.indexOf(expr)
    setExpr(EXPRESSIONS[(i + 1) % EXPRESSIONS.length])
  }

  return (
    <main className="page">
      <header className="topbar">
        <span className="brand">tamagotchi</span>
        <nav>
          <a href="/docs/">docs</a>
          <a href="https://github.com/" target="_blank" rel="noreferrer">
            github
          </a>
        </nav>
      </header>

      <section className="hero">
        <div className="workbench">
          <div className="board">
            <CircuitBoard />
            <div className="board-center">
              <OledFace expression={expr} onClick={cycle} />
            </div>
          </div>
        </div>

        <div className="copy">
          <p className="eyebrow">H.M.F #1 · build your own</p>
          <h1>
            Mr. Mini
            <br />
            Tamagotchi
          </h1>
          <p className="lede">
            Solder an ESP32-C3 onto a tiny OLED, flash the firmware, and walk
            out with a tamagotchi whose eyes blink and drift around the room.
            One evening, from parts on the table to a pet on your desk.
          </p>

          <ul className="tags">
            <li className="tag tag-date">30 May, 2026</li>
            <li className="tag tag-place">@ 2586 Labs</li>
          </ul>

          <div className="cta">
            <a className="btn primary" href="/docs/">
              read the docs →
            </a>
            <a
              className="btn ghost"
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
            >
              source
            </a>
          </div>
        </div>
      </section>

      <footer className="foot">
        <span>built at 2586 labs</span>
        <span>·</span>
        <a href="/docs/">docs</a>
      </footer>
    </main>
  )
}

export default App
