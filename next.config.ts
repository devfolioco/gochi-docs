import type { NextConfig } from 'next'
import path from 'node:path'
import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

const config: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [{ source: '/circuit', destination: '/playground', permanent: true }]
  },
}

export default withMDX(config)
