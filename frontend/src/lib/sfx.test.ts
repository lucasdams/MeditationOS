import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the shared audio context so we can observe whether playClick() actually tried to
// make a sound, without a real Web Audio implementation (jsdom has none). A "running"
// context means playClick() reaches the oscillator-creation path.
const createOscillator = vi.fn()
const fakeCtx = {
  state: 'running' as AudioContextState,
  currentTime: 0,
  createOscillator: () => {
    createOscillator()
    return {
      type: '',
      frequency: { value: 0 },
      connect: () => ({ connect: () => {} }),
      start: () => {},
      stop: () => {},
    }
  },
  createGain: () => ({
    gain: {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
    },
    connect: () => ({ connect: () => {} }),
  }),
  resume: () => Promise.resolve(),
}

vi.mock('./audioContext', () => ({
  getAudioContext: () => fakeCtx,
  getMasterBus: () => ({ connect: () => {} }),
}))

import { installButtonClickSfx, setInterfaceSounds } from './sfx'

describe('installButtonClickSfx — one consistent click tick for every button', () => {
  let teardown: () => void

  beforeEach(() => {
    createOscillator.mockClear()
    setInterfaceSounds(true)
    document.body.innerHTML = ''
    teardown = installButtonClickSfx()
  })

  afterEach(() => {
    teardown()
    setInterfaceSounds(true)
  })

  function clickNew(html: string): Element {
    document.body.innerHTML = html
    const el = document.body.firstElementChild!
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return el
  }

  it('ticks when a native <button> is clicked', () => {
    clickNew('<button>Start</button>')
    expect(createOscillator).toHaveBeenCalled()
  })

  it('ticks for role="button" elements', () => {
    clickNew('<div role="button">Tap</div>')
    expect(createOscillator).toHaveBeenCalled()
  })

  it('ticks when an inner icon inside a button is the click target', () => {
    document.body.innerHTML = '<button><span class="icon">x</span></button>'
    const icon = document.querySelector('.icon')!
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(createOscillator).toHaveBeenCalled()
  })

  it('stays silent for plain links', () => {
    document.body.innerHTML = '<a href="/somewhere">Go</a>'
    const link = document.body.firstElementChild!
    // preventDefault so jsdom doesn't log a benign "navigation not implemented" warning.
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    ev.preventDefault()
    link.dispatchEvent(ev)
    expect(createOscillator).not.toHaveBeenCalled()
  })

  it('stays silent for form inputs (checkbox)', () => {
    clickNew('<input type="checkbox" />')
    expect(createOscillator).not.toHaveBeenCalled()
  })

  it('stays silent for disabled buttons', () => {
    clickNew('<button disabled>Nope</button>')
    expect(createOscillator).not.toHaveBeenCalled()
  })

  it('stays silent for aria-disabled role="button"', () => {
    clickNew('<div role="button" aria-disabled="true">Nope</div>')
    expect(createOscillator).not.toHaveBeenCalled()
  })

  it('honours the interface-sounds preference (off = silent)', () => {
    setInterfaceSounds(false)
    clickNew('<button>Start</button>')
    expect(createOscillator).not.toHaveBeenCalled()
  })

  it('is idempotent — installing twice does not double-tick', () => {
    const second = installButtonClickSfx()
    clickNew('<button>Start</button>')
    // Still a single tick (one oscillator) despite two install calls.
    expect(createOscillator).toHaveBeenCalledTimes(1)
    second()
  })
})
