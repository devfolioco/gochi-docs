import { ImageResponse } from 'next/og'

// Shared Open Graph / Twitter card renderer. Mirrors the landing page palette
// (blue board + dark OLED + light pixels) so the social card reads as the same
// product. Used by both app/opengraph-image.tsx and app/twitter-image.tsx.

export const ogSize = { width: 1200, height: 630 }
export const ogContentType = 'image/png'
export const ogAlt = 'Mr. Mini Tamagotchi — build your own tiny desk pet'

// Fetch a Google font as a raw ttf/otf buffer Satori can parse. A desktop
// User-Agent is required, otherwise Google serves woff2 (unsupported by Satori).
async function loadGoogleFont(family: string, weight: number, text: string) {
  const query = `family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    })
  ).text()
  const url = css.match(/src: url\((.+?)\) format\(/)?.[1]
  if (!url) throw new Error(`Failed to resolve ${family} ${weight} font URL`)
  return (await fetch(url)).arrayBuffer()
}

export async function renderOgImage() {
  const eyebrow = 'H.M.F #1 / BUILD YOUR OWN'
  const title = 'Mr. Mini Tamagotchi'
  const tagline =
    'Wire an ESP32-C3 to a tiny OLED, flash the firmware, and a pixel face blinks back at you on your desk.'
  const glyphs = eyebrow + title + tagline + 'tamagotchi  2586 labs  gochi'

  const [bold, regular] = await Promise.all([
    loadGoogleFont('Pixelify Sans', 700, glyphs),
    loadGoogleFont('Pixelify Sans', 400, glyphs),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: '#f5f8ff',
          fontFamily: 'Pixelify Sans',
          backgroundColor: '#1f5eff',
          backgroundImage: 'linear-gradient(135deg, #1f5eff 0%, #0a3bcc 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 64, flex: 1 }}>
          {/* OLED panel */}
          <div
            style={{
              width: 430,
              height: 250,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#04060a',
              borderRadius: 24,
              border: '5px solid rgba(255,255,255,0.28)',
              boxShadow: '14px 14px 0 0 #0a3bcc',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 50 }}>
                <div style={{ width: 58, height: 80, borderRadius: 26, backgroundColor: '#eaf3f7' }} />
                <div style={{ width: 58, height: 80, borderRadius: 26, backgroundColor: '#eaf3f7' }} />
              </div>
              <div
                style={{
                  marginTop: 26,
                  width: 116,
                  height: 56,
                  border: '11px solid transparent',
                  borderBottomColor: '#eaf3f7',
                  borderRadius: '0 0 120px 120px',
                }}
              />
            </div>
          </div>

          {/* Copy */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 26, letterSpacing: 2, color: '#cfe0ff' }}>{eyebrow}</div>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 80, fontWeight: 700, lineHeight: 1.0, marginTop: 12 }}>
              <span>Mr. Mini</span>
              <span>Tamagotchi</span>
            </div>
            <div style={{ fontSize: 30, lineHeight: 1.35, color: '#d6e2ff', marginTop: 22 }}>
              {tagline}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 26,
            color: '#cfe0ff',
            borderTop: '2px solid rgba(255,255,255,0.28)',
            paddingTop: 22,
          }}
        >
          <span style={{ fontWeight: 700, color: '#f5f8ff' }}>tamagotchi</span>
          <span>built at 2586 labs</span>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: 'Pixelify Sans', data: bold, weight: 700, style: 'normal' },
        { name: 'Pixelify Sans', data: regular, weight: 400, style: 'normal' },
      ],
    },
  )
}
