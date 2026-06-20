import { describe, expect, it } from 'vitest'
import { COLOR_MODE_OPTIONS } from './SettingsPage'

// Guards that the Appearance color-mode picker offers every supported mode,
// including the new clock-driven "Auto (day & night)" option.
describe('color-mode picker options', () => {
  it('offers the "auto" (day & night) option, labelled clearly', () => {
    const auto = COLOR_MODE_OPTIONS.find((o) => o.value === 'auto')
    expect(auto).toBeDefined()
    expect(auto?.label).toMatch(/auto/i)
    expect(auto?.label.toLowerCase()).toContain('night')
  })

  it('keeps all existing modes selectable', () => {
    const values = COLOR_MODE_OPTIONS.map((o) => o.value)
    expect(values).toEqual(expect.arrayContaining(['auto', 'system', 'light', 'dark']))
  })

  it('lists "auto" first so it reads as the default', () => {
    expect(COLOR_MODE_OPTIONS[0].value).toBe('auto')
  })
})
