// The in-app currency mark — a small, procedurally-drawn gold coin (inline SVG, in the same
// no-asset style as Flame/SanctuaryPlant). It replaces the 🪙 emoji everywhere coins appear
// so the currency renders identically across platforms (emoji glyphs vary a lot by OS/font).
//
// Drawn with its own gradient + a darker rim and an embossed star, so it stays clearly "a coin"
// on every background it sits on: the light level chip, the amber sanctuary wallet (#fffbeb),
// and the green "Buy" button (#047857, white text). The rim keeps it legible even where the
// gold is close to the surface colour. Sizes to its font context by default (`1em`), so it
// lines up with the number/text beside it; pass `size` to override.

interface CoinIconProps {
  // px or any CSS length; defaults to 1em so the coin matches the surrounding text size.
  size?: number | string
  // Extra class for spacing/alignment tweaks at a call site if ever needed.
  className?: string
}

export default function CoinIcon({ size = '1em', className }: CoinIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="coins"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flex: 'none' }}
    >
      <defs>
        <radialGradient id="coin-face" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="45%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
      </defs>
      {/* outer disc + darker rim — the rim gives an edge on warm/gold backgrounds */}
      <circle cx="12" cy="12" r="11" fill="#b45309" />
      <circle cx="12" cy="12" r="9.5" fill="url(#coin-face)" stroke="#a16207" strokeWidth="0.6" />
      {/* inner ring, then an embossed star so it reads unmistakably as a coin */}
      <circle cx="12" cy="12" r="7" fill="none" stroke="#b8860b" strokeWidth="0.8" opacity="0.55" />
      <path
        d="M12 6.3l1.55 3.4 3.7.4-2.75 2.5.78 3.65L12 14.9l-3.26 1.75.78-3.65L6.77 10.5l3.7-.4z"
        fill="#fcefb4"
        stroke="#a16207"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
