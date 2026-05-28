import { CircuitBoard } from './components/CircuitBoard'
import { OledFace } from './components/OledFace'
import './landing.css'

// Server component — everything renders on the server. The OledFace is the
// only client island (canvas + click handler) and hydrates in place.
export default function Page() {
  return (
    <main className="page">
      <header className="topbar">
        <span className="brand">tamagotchi</span>
        <nav>
          <a href="/circuit">circuit</a>
          <a href="/docs">docs</a>
          <a href="https://github.com/prathamVaidya/gochi" target="_blank" rel="noreferrer">
            github
          </a>
        </nav>
      </header>

      <section className="hero">
        <div className="workbench">
          <div className="board">
            <CircuitBoard />
            <div className="board-center">
              <OledFace />
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
            <a className="btn primary" href="/docs">
              read the docs →
            </a>
            <a
              className="btn ghost"
              href="https://github.com/prathamVaidya/gochi"
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
        <a href="/docs">docs</a>
      </footer>
    </main>
  )
}
