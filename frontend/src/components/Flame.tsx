import { useEffect, useRef } from 'react'
import { flamePoseAt } from '../lib/flame'

interface FlameProps {
  // 0 = perfectly still (reduced-motion), 1 = normal gentle sway. The page passes a
  // small non-zero value for the reduced-motion fallback so the flame is alive but calm.
  intensity?: number
  // px size of the square canvas (logical). Defaults to a comfortable gazing size.
  size?: number
}

// A single candle flame, drawn procedurally on a <canvas> with a soft glow and an
// organic, non-repeating sway. No image/video assets — the geometry is sampled from
// `flamePoseAt`, so the same code stills the flame when `intensity` is 0. The renderer
// is a thin shell; all the motion math lives in `lib/flame.ts` (unit-tested).
export default function Flame({ intensity = 1, size = 220 }: FlameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const intensityRef = useRef(intensity)
  intensityRef.current = intensity

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    let raf = 0
    const start = performance.now()
    const still = intensityRef.current === 0

    const draw = (now: number) => {
      const t = (now - start) / 1000
      const pose = flamePoseAt(t, intensityRef.current)
      ctx.clearRect(0, 0, size, size)

      const cx = size / 2
      const baseY = size * 0.82 // flame base sits low; it rises toward the top
      const flameH = size * 0.5 * pose.stretch
      const flameW = size * 0.2
      const tipX = cx + pose.sway * flameW * 2
      const tipY = baseY - flameH

      // Outer halo — a soft radial glow that "breathes" with brightness.
      const haloR = size * 0.42
      const halo = ctx.createRadialGradient(cx, baseY - flameH * 0.5, 0, cx, baseY - flameH * 0.5, haloR)
      halo.addColorStop(0, `rgba(255, 176, 80, ${0.28 * pose.brightness})`)
      halo.addColorStop(1, 'rgba(255, 176, 80, 0)')
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, size, size)

      // Flame body — a teardrop from the base up to the (swaying) tip.
      ctx.beginPath()
      ctx.moveTo(cx - flameW / 2, baseY)
      ctx.quadraticCurveTo(cx - flameW * 0.9, baseY - flameH * 0.55, tipX - flameW * 0.1, tipY + flameH * 0.18)
      ctx.quadraticCurveTo(tipX, tipY, tipX + flameW * 0.1, tipY + flameH * 0.18)
      ctx.quadraticCurveTo(cx + flameW * 0.9, baseY - flameH * 0.55, cx + flameW / 2, baseY)
      ctx.closePath()

      const body = ctx.createLinearGradient(0, tipY, 0, baseY)
      body.addColorStop(0, `rgba(255, 244, 214, ${pose.brightness})`)
      body.addColorStop(0.45, `rgba(255, 196, 92, ${pose.brightness})`)
      body.addColorStop(1, `rgba(255, 138, 40, ${0.85 * pose.brightness})`)
      ctx.fillStyle = body
      ctx.fill()

      // Inner blue-white core near the base.
      const coreH = flameH * 0.4
      ctx.beginPath()
      ctx.moveTo(cx - flameW * 0.22, baseY)
      ctx.quadraticCurveTo(cx - flameW * 0.28, baseY - coreH * 0.6, cx, baseY - coreH)
      ctx.quadraticCurveTo(cx + flameW * 0.28, baseY - coreH * 0.6, cx + flameW * 0.22, baseY)
      ctx.closePath()
      ctx.fillStyle = `rgba(180, 210, 255, ${0.55 * pose.brightness})`
      ctx.fill()

      if (!still) raf = requestAnimationFrame(draw)
    }

    if (still) {
      // Draw a single calm frame and stop — no animation loop at all.
      draw(start)
    } else {
      raf = requestAnimationFrame(draw)
    }
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className="trataka-flame"
      // Cap the displayed size to the viewport so the focal flame never overflows
      // narrow phones (e.g. 320px); aspect-ratio keeps it square as it scales down.
      style={{ width: size, maxWidth: '90vw', aspectRatio: '1 / 1', height: 'auto' }}
      role="img"
      aria-label="A softly glowing candle flame to gaze at"
    />
  )
}
