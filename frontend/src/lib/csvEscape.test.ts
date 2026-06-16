import { describe, it, expect } from 'vitest'
import { csvEscape } from './csvEscape'

describe('csvEscape', () => {
  it('passes through plain text unchanged', () => {
    expect(csvEscape('hello world')).toBe('hello world')
  })

  it('quotes fields containing a double-quote', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes fields containing a comma', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('quotes fields containing a newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
  })

  it('prefixes = to prevent formula injection', () => {
    // Contains commas/quotes so the whole thing is RFC-4180-quoted; ' prefix is inside the quotes.
    expect(csvEscape('=HYPERLINK("http://evil","x")')).toMatch(/^"'=/)
  })

  it('prefixes + to prevent formula injection', () => {
    expect(csvEscape('+1')).toBe("'+1")
  })

  it('prefixes - to prevent formula injection', () => {
    expect(csvEscape('-1')).toBe("'-1")
  })

  it('prefixes @ to prevent formula injection', () => {
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('prefixes tab char to prevent injection', () => {
    expect(csvEscape('\tcmd')).toBe("'\tcmd")
  })

  it('quotes an injection-prefixed field that also contains a comma', () => {
    // '=cmd,arg  → after prefix becomes '=cmd,arg → must be quoted
    const result = csvEscape('=cmd,arg')
    expect(result).toBe(`"'=cmd,arg"`)
  })

  it('does not alter a field starting with a safe char', () => {
    expect(csvEscape('normal text')).toBe('normal text')
    expect(csvEscape('123')).toBe('123')
  })
})
