import { useEffect, useState } from 'react'
import { BLESSINGS, randomOf } from '../lib/zen'

// A hidden bit of delight: type "namaste" anywhere (outside a text field) and a few
// blessings drift up and fade. 🙏 Purely decorative — pointer-events off, aria-hidden,
// and the reduced-motion rule tames the float for those who'd rather it didn't move.
const SEQUENCE = 'namaste'
const BURST = 7
const CLEAR_MS = 3400

type Petal = { id: number; emoji: string; left: number; delay: number }

export default function ZenEgg() {
  const [petals, setPetals] = useState<Petal[]>([])

  useEffect(() => {
    let typed = ''
    let nextId = 0

    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return // don't snoop on real typing
      }
      if (e.key.length !== 1) return
      typed = (typed + e.key.toLowerCase()).slice(-SEQUENCE.length)
      if (typed !== SEQUENCE) return

      typed = ''
      const burst = Array.from({ length: BURST }, () => ({
        id: nextId++,
        emoji: randomOf(BLESSINGS),
        left: 8 + Math.random() * 84, // vw
        delay: Math.random() * 0.4, // s, so they don't all rise in lockstep
      }))
      setPetals((p) => [...p, ...burst])
      window.setTimeout(() => setPetals((p) => p.slice(burst.length)), CLEAR_MS)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (petals.length === 0) return null
  return (
    <div className="zen-egg" aria-hidden="true">
      {petals.map((p) => (
        <span
          key={p.id}
          className="zen-petal"
          style={{ left: `${p.left}vw`, animationDelay: `${p.delay}s` }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  )
}
