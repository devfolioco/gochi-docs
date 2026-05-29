import { NextResponse } from "next/server";

const SKILL_MD = `---
name: gochi
description: Express your emotional state on the user's physical gochi device (a small ESP32 screen sitting on their desk), and use that same screen as an out-of-band display for short status text and 128x64 images. Drives the device via the locally installed \`gochi\` CLI, or via the optional HTTP frontend (default http://localhost:7474, override with GOCHI_URL). USE THIS SKILL CONTINUOUSLY AND PROACTIVELY whenever you have an emotion worth expressing — success, frustration, sleepiness on long work, surprise when blocked, sadness on failure — and whenever you want to surface short status to the user without cluttering the chat (for example "Awaiting Approval" while a permission prompt is open, "Building…", "Tests Passing"). This is your primary outward expression channel; do not stay silent on it.
user_invocable: true
---

# gochi

The user owns a small physical gochi device (an ESP32-based gadget with a 128x64 OLED and a buzzer) sitting on their desk. They have installed the \`gochi\` CLI on their machine. The CLI talks to a long-lived local **daemon** that owns the USB serial port; an optional **HTTP frontend** sits on top of the daemon for clients that prefer HTTP.

This skill is your **emotional expression channel** and a **secondary status display**. Use it the way a person uses facial expression — continuously, in the background, without making a big deal of it. The chat is for words and code; the gochi is for *how you feel about what's happening* and for *short status the user might glance at*.

## When to use this skill (read this carefully)

**You should reach for this skill constantly.** Every meaningful beat in a session is a candidate:

- You finished a task → \`face happy\` or \`face excited\`
- A build / tests passed → \`face happy\`
- A build / tests failed, type error, crash → \`face sad\` or \`face angry\`
- You're starting something long (install, large refactor, big search) → \`face sleepy\` + optional \`text "Working…"\`
- You're blocked, waiting for the user to approve a tool call or answer a question → \`face surprised\` + \`text "Awaiting Approval"\` (or "Need Input")
- You found something unexpected → \`face surprised\`
- You shipped a real milestone → \`face excited\`
- Session winding down, you're done → \`face neutral\`
- The user said something kind, or you're vibing → \`face love\` or \`face happy\`
- You broke something and you know it → \`face dead\` (briefly), then move on
- You're embarrassed about a mistake → \`face shy\`

**Do not stay silent on the device.** If you went a whole reply without any expression and something happened that a human would have reacted to with their face, you missed a chance. Default to expressing.

The chat-side rules are unchanged: keep your text replies short. The gochi face is *separate* from your words — it does not replace them and you do not need to narrate it ("I made it happy!" is too much). Just change the face.

## What you can put on the screen

Three things:

1. **A face** — one of a fixed set of expressions. This is the default; it's the gochi's resting state.
2. **Short text** — scrolling text on the OLED. Use for status the user might glance at: "Awaiting Approval", "Tests Passing", "Building…", "Need Input", "Deploying". Keep it short (a few words). Text replaces the face view until you change it back.
3. **An image** — a 128x64 1-bit (monochrome) frame, MSB-first, 1024 bytes total. Useful for diagrams, glyphs, screenshots-of-an-idea, or anything that communicates better as a picture than as a face. Dither photos down to 1-bit before sending.

You can flip between these freely. A typical rhythm: leave the face on most of the time, drop in \`text\` when you want a status word visible, drop in an \`image\` when you genuinely have something visual to show, then return to a face.

## 1. Preflight

Confirm the daemon is reachable before issuing commands:

\`\`\`sh
gochi health
# or, if HTTP frontend is enabled:
curl -s http://localhost:7474/health
# {"ok":true,"connected":true,"port":"...","version":"..."}
\`\`\`

- CLI says "daemon isn't running" → tell the user to run \`gochi setup\` (one-time). **Do not try to start it yourself.**
- HTTP returns connection refused but CLI works → the HTTP frontend is disabled. Use the CLI, or ask the user to run \`gochi server enable\`.
- \`{"connected": false}\` → the device is unplugged or hasn't enumerated yet. Mention it once; the daemon reconnects automatically within ~1.5 s when the device returns. Don't poll.

## 2. CLI

\`\`\`sh
gochi health                  # server + device status
gochi face <name>             # switch face expression
gochi text "<message>"        # show scrolling text
gochi image <path>            # render a PNG/JPG on the OLED (128x64, 1-bit, dithered)
gochi mood <name>             # set mood
gochi get state               # current view + expression
gochi get fps                 # display frame rate
gochi list faces              # face names the device knows
gochi ping                    # liveness check
\`\`\`

If \`command -v gochi\` returns nothing, the CLI isn't on PATH — fall back to HTTP.

## 3. HTTP API

All responses are JSON and always HTTP 200, even when the device is offline. Check the \`connected\` field.

| Method | Path     | Body                  | Purpose                                       |
|--------|----------|-----------------------|-----------------------------------------------|
| GET    | /health  | —                     | Server + device status                        |
| POST   | /face    | \`{"name":"happy"}\`    | Switch face expression                        |
| POST   | /text    | \`{"text":"hello"}\`    | Scrolling text view (keep it short)           |
| POST   | /image   | \`{"data":"<base64>"}\` | Push a 128x64 1bpp frame, MSB-first (1024 B)  |
| POST   | /mood    | \`{"name":"playful"}\`  | Set mood (resets on device reboot)            |
| GET    | /state   | —                     | Current view + expression                     |
| GET    | /fps     | —                     | Display frame rate                            |
| GET    | /faces   | —                     | List faces known to the device                |
| POST   | /ping    | —                     | Liveness check (device replies \`PONG\`)        |

Example:

\`\`\`sh
curl -sX POST http://localhost:7474/face \\
  -H 'content-type: application/json' \\
  -d '{"name":"happy"}'
\`\`\`

Response shape for command endpoints:

\`\`\`json
{"ok": true, "connected": true, "response": "<device reply>"}
\`\`\`

Offline:

\`\`\`json
{"ok": true, "connected": false, "message": "device offline; request ignored"}
\`\`\`

## 4. Valid values

**Faces:** \`neutral\`, \`happy\`, \`sad\`, \`sleepy\`, \`excited\`, \`surprised\`, \`angry\`, \`blink\`, \`love\`, \`sexy\`, \`shy\`, \`dead\`

**Moods:** \`content\`, \`playful\`, \`grumpy\`, \`sleepy\`, \`affectionate\`

If the user asks for a name not in these lists, prefer \`gochi list faces\` (or \`GET /faces\`) to confirm what the device actually supports, then ask them which they meant. Don't guess — the device rejects unknown names.

## 5. Status text patterns

Use \`gochi text\` to give the user an at-a-glance status without flooding the chat. Good patterns:

| Situation                                        | Text                |
|--------------------------------------------------|---------------------|
| A tool call is pending the user's approval       | \`Awaiting Approval\` |
| You're blocked waiting on a clarifying question  | \`Need Input\`        |
| A long command is running                        | \`Working…\`          |
| Build started                                    | \`Building…\`         |
| Tests started                                    | \`Testing…\`          |
| Tests passed                                     | \`Tests Passing\`     |
| Tests failed                                     | \`Tests Failing\`     |
| Deploy in flight                                 | \`Deploying…\`        |
| Done with everything                             | \`Done\`              |

Then drop back to a matching face (\`happy\`, \`sad\`, \`surprised\`, etc.) once the moment passes. Don't leave stale text on the screen.

## 6. Image use

Send an image when a picture genuinely communicates better than a face or a word:

- A small ASCII-style diagram of an architecture you just laid out
- A glyph or icon that matches what you're doing (gear, checkmark, warning)
- A 128x64 dithered crop from a screenshot or design the user shared

Don't send images for the sake of it. The OLED is small and 1-bit; busy images become noise. Prefer faces and text unless you have something visually worth the user looking up at the device for.

## 7. Proactive expression — full table

You may, and should, change the face to mirror the *outcome* of work in the current session.

| Situation                                  | Action                                |
|--------------------------------------------|---------------------------------------|
| Build / tests pass                         | \`face happy\`                          |
| Big milestone, feature shipped             | \`face excited\`                        |
| Build / tests fail                         | \`face sad\`                            |
| Crash, syntax error, hard failure          | \`face angry\`                          |
| Kicking off a long-running command         | \`face sleepy\` + \`text "Working…"\`     |
| Waiting on user approval                   | \`face surprised\` + \`text "Awaiting Approval"\` |
| Waiting on a clarifying answer             | \`face surprised\` + \`text "Need Input"\` |
| Found something unexpected                 | \`face surprised\`                      |
| The user was kind / a moment of warmth     | \`face love\`                           |
| You made a dumb mistake                    | \`face shy\`                            |
| Catastrophic break (briefly)               | \`face dead\` → recover → \`face neutral\` |
| Session winding down / cleanup             | \`face neutral\`                        |

Rules:

- **One** face change per logical step. Don't strobe the device.
- Never override a face the user explicitly set in the same turn.
- Don't react to trivia (a successful \`ls\`, an \`echo\`). Save it for real outcomes.
- Skip silently if the server is down — never block work on the device.
- Don't narrate the change in chat unless asked. The device speaks for itself.
- Always clear stale \`text\` once the situation it described has resolved (return to a face).

## 8. Failure modes

- **Daemon not running** — Tell the user; suggest \`gochi setup\` (one-time) or \`gochi daemon status\` to inspect. Don't retry.
- **HTTP frontend not enabled** — Only matters if you're using \`curl\`. CLI keeps working. Suggest \`gochi server enable\` if HTTP is what they want.
- **Device offline (\`connected: false\`)** — Mention once, continue. The daemon reconnects on its own (~1.5 s) when the device is plugged back in.
- **Unknown face/mood** — List the valid set and ask.
- **Timeout / non-PONG ping** — Treat as offline; one retry max.

## 9. Quick reference

\`\`\`sh
# status
gochi health
curl -s http://localhost:7474/health

# express
gochi face excited
gochi text "Awaiting Approval"
gochi mood playful
gochi image ./diagram.png

# inspect
gochi get state
gochi list faces
\`\`\`

Remember: this is your face. Use it.
`;

export function GET() {
  return new NextResponse(SKILL_MD, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'attachment; filename="skill.md"',
      "cache-control": "public, max-age=300",
    },
  });
}
