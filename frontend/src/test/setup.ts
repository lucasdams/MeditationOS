// Registers @testing-library/jest-dom matchers (e.g. toBeInTheDocument) on Vitest's
// expect, and wires up automatic DOM cleanup between tests.
import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement ResizeObserver; stub it so components that observe element size
// (e.g. AppHeader publishing --app-header-h for sticky offsets) mount cleanly in tests.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub
}
