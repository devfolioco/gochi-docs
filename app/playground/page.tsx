import type { Metadata } from 'next'
import { Circuit } from '../components/Circuit'
import './playground.css'

export const metadata: Metadata = {
  title: 'playground · tamagotchi',
  description:
    'Interactive breadboard playground for the tamagotchi build — drag jumpers into the holes to wire up the OLED, buzzer, and motion sensor level by level.',
}

export default function PlaygroundPage() {
  return <Circuit />
}
