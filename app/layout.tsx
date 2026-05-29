import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'tamagotchi — build your own desk pet',
  description:
    'Build your own tiny desk pet: wire up an ESP32-C3 and an OLED, flash the firmware, and end up with a pet whose eyes follow you around the room.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
