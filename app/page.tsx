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
        <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-label="Toggle menu" />
        <label htmlFor="nav-toggle" className="nav-burger" aria-hidden="true">
          <span />
          <span />
          <span />
        </label>
        <nav>
          <a href="/playground">playground</a>
          <a href="/docs">docs</a>
          <a href="https://github.com/devfolioco/gochi" target="_blank" rel="noreferrer">
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
            Wire an ESP32-C3 to a tiny OLED on a breadboard, flash the firmware,
            and a pixel face blinks back. Add a buzzer for sound and a motion
            sensor so it reacts when you pick it up — then poke it over USB or let
            an AI coding agent run it. From a bag of parts to a pet on your desk
            in one evening.
          </p>

          <div className="cta">
            <a className="btn primary" href="/docs">
              read the docs →
            </a>
            <a
              className="btn ghost"
              href="https://github.com/devfolioco/gochi"
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
