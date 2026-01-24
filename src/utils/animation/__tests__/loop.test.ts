import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAnimationLoop } from '../loop'

describe('createAnimationLoop', () => {
  let rafCallbacks: Map<number, (timestamp: number) => void> = new Map()
  let rafId = 0
  let cancelledIds: Set<number> = new Set()

  beforeEach(() => {
    rafCallbacks = new Map()
    rafId = 0
    cancelledIds = new Set()

    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      const id = ++rafId
      rafCallbacks.set(id, callback)
      return id
    })

    // Mock cancelAnimationFrame
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelledIds.add(id)
      rafCallbacks.delete(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Helper to simulate animation frames
  const tick = (timestamp: number) => {
    const callbacks = Array.from(rafCallbacks.values())
    rafCallbacks.clear()
    callbacks.forEach(cb => cb(timestamp))
  }

  describe('start', () => {
    it('should start the animation loop', () => {
      const onTick = vi.fn(() => true)
      const { start, isRunning } = createAnimationLoop({ onTick })

      expect(isRunning()).toBe(false)

      start()

      expect(isRunning()).toBe(true)
      expect(rafCallbacks.size).toBe(1)
    })

    it('should call onStart when starting', () => {
      const onStart = vi.fn()
      const { start } = createAnimationLoop({
        onTick: () => true,
        onStart
      })

      start()

      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it('should not start if already running', () => {
      const onStart = vi.fn()
      const { start } = createAnimationLoop({
        onTick: () => true,
        onStart
      })

      start()
      start()

      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it('should call onTick on each frame', () => {
      const onTick = vi.fn(() => true)
      const { start } = createAnimationLoop({ onTick })

      start()
      tick(0)
      tick(16)
      tick(32)

      expect(onTick).toHaveBeenCalledTimes(3)
    })

    it('should provide deltaTime to onTick', () => {
      const deltaTimes: number[] = []
      const onTick = vi.fn((deltaTime: number) => {
        deltaTimes.push(deltaTime)
        return true
      })
      const { start } = createAnimationLoop({ onTick })

      start()
      tick(0)    // First frame, deltaTime = 0
      tick(16)   // Second frame, deltaTime = 16
      tick(33)   // Third frame, deltaTime = 17

      expect(deltaTimes[0]).toBe(0)
      expect(deltaTimes[1]).toBe(16)
      expect(deltaTimes[2]).toBe(17)
    })
  })

  describe('pause', () => {
    it('should pause the animation', () => {
      const onTick = vi.fn(() => true)
      const { start, pause, isRunning, isPaused } = createAnimationLoop({ onTick })

      start()
      expect(isRunning()).toBe(true)

      pause()
      expect(isRunning()).toBe(false)
      expect(isPaused()).toBe(true)
    })

    it('should call onPause when pausing', () => {
      const onPause = vi.fn()
      const { start, pause } = createAnimationLoop({
        onTick: () => true,
        onPause
      })

      start()
      pause()

      expect(onPause).toHaveBeenCalledTimes(1)
    })

    it('should not call onPause if not running', () => {
      const onPause = vi.fn()
      const { pause } = createAnimationLoop({
        onTick: () => true,
        onPause
      })

      pause()

      expect(onPause).not.toHaveBeenCalled()
    })

    it('should allow resume after pause', () => {
      const onTick = vi.fn(() => true)
      const { start, pause, isRunning } = createAnimationLoop({ onTick })

      start()
      tick(0)
      expect(onTick).toHaveBeenCalledTimes(1)

      pause()
      expect(isRunning()).toBe(false)

      start()
      expect(isRunning()).toBe(true)
      tick(100)
      expect(onTick).toHaveBeenCalledTimes(2)
    })
  })

  describe('stop', () => {
    it('should stop the animation', () => {
      const onTick = vi.fn(() => true)
      const { start, stop, isRunning, isPaused } = createAnimationLoop({ onTick })

      start()
      stop()

      expect(isRunning()).toBe(false)
      expect(isPaused()).toBe(false)
    })

    it('should call onStop when stopping', () => {
      const onStop = vi.fn()
      const { start, stop } = createAnimationLoop({
        onTick: () => true,
        onStop
      })

      start()
      stop()

      expect(onStop).toHaveBeenCalledTimes(1)
    })

    it('should reset deltaTime calculation after stop', () => {
      const deltaTimes: number[] = []
      const onTick = vi.fn((deltaTime: number) => {
        deltaTimes.push(deltaTime)
        return true
      })
      const { start, stop } = createAnimationLoop({ onTick })

      start()
      tick(0)
      tick(100)
      stop()

      start()
      tick(200)  // Should have deltaTime = 0, not 100

      expect(deltaTimes[deltaTimes.length - 1]).toBe(0)
    })
  })

  describe('completion', () => {
    it('should complete when onTick returns false', () => {
      let count = 0
      const onTick = vi.fn(() => {
        count++
        return count < 3
      })
      const onComplete = vi.fn()
      const { start, isRunning } = createAnimationLoop({ onTick, onComplete })

      start()
      tick(0)   // count = 1, continue
      tick(16)  // count = 2, continue
      tick(32)  // count = 3, stop

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(isRunning()).toBe(false)
    })

    it('should not schedule more frames after completion', () => {
      const onTick = vi.fn(() => false)
      const { start } = createAnimationLoop({ onTick })

      start()
      tick(0)

      expect(rafCallbacks.size).toBe(0)
    })
  })

  describe('state checks', () => {
    it('isRunning should return correct state', () => {
      const { start, pause, stop, isRunning } = createAnimationLoop({
        onTick: () => true
      })

      expect(isRunning()).toBe(false)

      start()
      expect(isRunning()).toBe(true)

      pause()
      expect(isRunning()).toBe(false)

      start()
      expect(isRunning()).toBe(true)

      stop()
      expect(isRunning()).toBe(false)
    })

    it('isPaused should return correct state', () => {
      const { start, pause, stop, isPaused } = createAnimationLoop({
        onTick: () => true
      })

      expect(isPaused()).toBe(false)

      start()
      expect(isPaused()).toBe(false)

      pause()
      expect(isPaused()).toBe(true)

      start()
      expect(isPaused()).toBe(false)

      stop()
      expect(isPaused()).toBe(false)
    })
  })
})
