import type { Metadata } from 'next'
import { Circuit } from '../components/Circuit'
import './circuit.css'

export const metadata: Metadata = {
  title: 'circuit · tamagotchi',
  description:
    'Interactive wiring diagram for the H.M.F #1 tamagotchi build — hover any wire for its signal, click to mark it verified as you solder.',
}

export default function CircuitPage() {
  return <Circuit />
}
