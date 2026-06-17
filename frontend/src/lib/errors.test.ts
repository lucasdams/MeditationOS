import { describe, it, expect } from 'vitest'
import { isNetworkError, messageForError, NETWORK_MESSAGE, SERVER_MESSAGE } from './errors'
import { ApiError, TimeoutError } from '../services/api'

describe('isNetworkError', () => {
  it('treats a fetch TypeError ("Failed to fetch") as a network error', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('treats a request timeout as a network error', () => {
    expect(isNetworkError(new TimeoutError())).toBe(true)
  })

  it('does not treat a server ApiError as a network error', () => {
    expect(isNetworkError(new ApiError(500, 'boom'))).toBe(false)
  })

  it('does not treat an unknown error as a network error', () => {
    expect(isNetworkError(new Error('something'))).toBe(false)
  })
})

describe('messageForError', () => {
  it('returns the network message for connectivity failures', () => {
    expect(messageForError(new TypeError('Failed to fetch'))).toBe(NETWORK_MESSAGE)
  })

  it('returns the default server message for a server error', () => {
    expect(messageForError(new ApiError(500))).toBe(SERVER_MESSAGE)
  })

  it('uses the provided fallback for non-network errors', () => {
    expect(messageForError(new ApiError(500), 'Could not load your stats.')).toBe(
      'Could not load your stats.',
    )
  })

  it('still returns the network message even when a fallback is given', () => {
    expect(messageForError(new TypeError('Failed to fetch'), 'Could not load your stats.')).toBe(
      NETWORK_MESSAGE,
    )
  })
})
