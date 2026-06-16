import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Shared overlay scaffold: a centered card over a dark, fading `role="dialog"
 * aria-modal` backdrop. Each caller supplies its own body; only the scaffold
 * (overlay + card) is shared.
 *
 * Accessibility (QA finding F2 — fixed once, here):
 *  - focus trap: Tab / Shift+Tab cycle within the card and never escape it,
 *  - Escape closes (when `onClose` is given),
 *  - focus restoration: the element focused before the modal opened is restored
 *    on close.
 *
 * A label is required — pass `ariaLabel` (or `ariaLabelledBy` when a heading in
 * the body already names the dialog) so the dialog is announced.
 */
export default function Modal({
  children,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  className,
  cardClassName,
  closeOnBackdrop = false,
}: {
  children: ReactNode
  // When given, Escape closes the modal and the backdrop becomes focus-restoring.
  // Omit for modals that must be dismissed only via their own actions.
  onClose?: () => void
  ariaLabel?: string
  ariaLabelledBy?: string
  // Extra class on the overlay (e.g. a page-specific variant).
  className?: string
  // Extra class on the card.
  cardClassName?: string
  // Clicking the dark backdrop (outside the card) closes the modal.
  closeOnBackdrop?: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  // The element focused right before the modal opened, restored on unmount.
  const restoreFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    restoreFocusRef.current = document.activeElement

    const card = cardRef.current
    // Focus the first focusable element in the card (falling back to the card),
    // unless the body already moved focus (e.g. an autoFocus input).
    if (card && !card.contains(document.activeElement)) {
      const focusable = getFocusable(card)
      ;(focusable[0] ?? card).focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !card) return
      const focusable = getFocusable(card)
      if (focusable.length === 0) {
        // Nothing focusable — keep focus on the card itself.
        e.preventDefault()
        card.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !card.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const toRestore = restoreFocusRef.current
      if (toRestore instanceof HTMLElement) toRestore.focus()
    }
    // onClose is read through a ref-stable closure each render; re-running on its
    // identity change is harmless and keeps the handler current.
  }, [onClose])

  return (
    <div
      className={`modal-overlay${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={closeOnBackdrop && onClose ? () => onClose() : undefined}
    >
      <div
        ref={cardRef}
        className={`modal-card${cardClassName ? ` ${cardClassName}` : ''}`}
        tabIndex={-1}
        onClick={closeOnBackdrop ? (e) => e.stopPropagation() : undefined}
      >
        {children}
      </div>
    </div>
  )
}

// Tab-order focusable elements within `root` (skips disabled / hidden ones).
function getFocusable(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isVisible)
}

// A best-effort "is this element visible / focusable" check that also works under
// jsdom (which has no layout, so `offsetParent` is unreliable there).
function isVisible(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false
  const style = el.style
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}
