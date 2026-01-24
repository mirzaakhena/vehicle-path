import { describe, it, expect, vi } from 'vitest'
import { VehicleEventEmitter } from '../event-emitter'
import type { GotoCompletionInfo } from '../../core/types/vehicle'

describe('VehicleEventEmitter', () => {
  describe('on/emit', () => {
    it('should call subscriber when event is emitted', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      emitter.on('commandComplete', callback)

      const info: GotoCompletionInfo = {
        vehicleId: 'v1',
        command: {
          vehicleId: 'v1',
          targetLineId: 'line001',
          targetOffset: 100,
          isPercentage: true
        },
        finalPosition: {
          lineId: 'line001',
          absoluteOffset: 100,
          position: { x: 500, y: 200 }
        },
        payload: { orderId: '123' }
      }

      emitter.emit('commandComplete', info)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(info)
    })

    it('should support multiple subscribers for same event', () => {
      const emitter = new VehicleEventEmitter()
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      emitter.on('commandComplete', callback1)
      emitter.on('commandComplete', callback2)
      emitter.on('commandComplete', callback3)

      const info: GotoCompletionInfo = {
        vehicleId: 'v1',
        command: {
          vehicleId: 'v1',
          targetLineId: 'line001',
          targetOffset: 100,
          isPercentage: true
        },
        finalPosition: {
          lineId: 'line001',
          absoluteOffset: 100,
          position: { x: 500, y: 200 }
        }
      }

      emitter.emit('commandComplete', info)

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('should support different event types', () => {
      const emitter = new VehicleEventEmitter()
      const commandCallback = vi.fn()
      const stateCallback = vi.fn()

      emitter.on('commandComplete', commandCallback)
      emitter.on('stateChange', stateCallback)

      emitter.emit('stateChange', {
        vehicleId: 'v1',
        from: 'idle',
        to: 'moving'
      })

      expect(commandCallback).not.toHaveBeenCalled()
      expect(stateCallback).toHaveBeenCalledTimes(1)
      expect(stateCallback).toHaveBeenCalledWith({
        vehicleId: 'v1',
        from: 'idle',
        to: 'moving'
      })
    })
  })

  describe('unsubscribe', () => {
    it('should return unsubscribe function that removes listener', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      const unsubscribe = emitter.on('commandComplete', callback)

      const info: GotoCompletionInfo = {
        vehicleId: 'v1',
        command: {
          vehicleId: 'v1',
          targetLineId: 'line001',
          targetOffset: 100,
          isPercentage: true
        },
        finalPosition: {
          lineId: 'line001',
          absoluteOffset: 100,
          position: { x: 500, y: 200 }
        }
      }

      // First emit - should call callback
      emitter.emit('commandComplete', info)
      expect(callback).toHaveBeenCalledTimes(1)

      // Unsubscribe
      unsubscribe()

      // Second emit - should NOT call callback
      emitter.emit('commandComplete', info)
      expect(callback).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('should only remove specific subscriber', () => {
      const emitter = new VehicleEventEmitter()
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const unsubscribe1 = emitter.on('commandComplete', callback1)
      emitter.on('commandComplete', callback2)

      unsubscribe1()

      const info: GotoCompletionInfo = {
        vehicleId: 'v1',
        command: {
          vehicleId: 'v1',
          targetLineId: 'line001',
          targetOffset: 100,
          isPercentage: true
        },
        finalPosition: {
          lineId: 'line001',
          absoluteOffset: 100,
          position: { x: 500, y: 200 }
        }
      }

      emitter.emit('commandComplete', info)

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })

  describe('off', () => {
    it('should remove all listeners for specific event', () => {
      const emitter = new VehicleEventEmitter()
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      emitter.on('commandComplete', callback1)
      emitter.on('commandComplete', callback2)

      emitter.off('commandComplete')

      const info: GotoCompletionInfo = {
        vehicleId: 'v1',
        command: {
          vehicleId: 'v1',
          targetLineId: 'line001',
          targetOffset: 100,
          isPercentage: true
        },
        finalPosition: {
          lineId: 'line001',
          absoluteOffset: 100,
          position: { x: 500, y: 200 }
        }
      }

      emitter.emit('commandComplete', info)

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
    })

    it('should remove all listeners when called without event type', () => {
      const emitter = new VehicleEventEmitter()
      const commandCallback = vi.fn()
      const stateCallback = vi.fn()

      emitter.on('commandComplete', commandCallback)
      emitter.on('stateChange', stateCallback)

      emitter.off()

      emitter.emit('commandComplete', {
        vehicleId: 'v1',
        command: {
          vehicleId: 'v1',
          targetLineId: 'line001',
          targetOffset: 100,
          isPercentage: true
        },
        finalPosition: {
          lineId: 'line001',
          absoluteOffset: 100,
          position: { x: 500, y: 200 }
        }
      })

      emitter.emit('stateChange', {
        vehicleId: 'v1',
        from: 'idle',
        to: 'moving'
      })

      expect(commandCallback).not.toHaveBeenCalled()
      expect(stateCallback).not.toHaveBeenCalled()
    })
  })

  describe('listenerCount', () => {
    it('should return correct count of listeners', () => {
      const emitter = new VehicleEventEmitter()

      expect(emitter.listenerCount('commandComplete')).toBe(0)

      const unsub1 = emitter.on('commandComplete', vi.fn())
      expect(emitter.listenerCount('commandComplete')).toBe(1)

      const unsub2 = emitter.on('commandComplete', vi.fn())
      expect(emitter.listenerCount('commandComplete')).toBe(2)

      unsub1()
      expect(emitter.listenerCount('commandComplete')).toBe(1)

      unsub2()
      expect(emitter.listenerCount('commandComplete')).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should continue calling other listeners if one throws', () => {
      const emitter = new VehicleEventEmitter()
      const errorCallback = vi.fn(() => {
        throw new Error('Test error')
      })
      const normalCallback = vi.fn()

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      emitter.on('commandComplete', errorCallback)
      emitter.on('commandComplete', normalCallback)

      const info: GotoCompletionInfo = {
        vehicleId: 'v1',
        command: {
          vehicleId: 'v1',
          targetLineId: 'line001',
          targetOffset: 100,
          isPercentage: true
        },
        finalPosition: {
          lineId: 'line001',
          absoluteOffset: 100,
          position: { x: 500, y: 200 }
        }
      }

      emitter.emit('commandComplete', info)

      expect(errorCallback).toHaveBeenCalledTimes(1)
      expect(normalCallback).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('positionUpdate event', () => {
    it('should emit positionUpdate with center and angle', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      emitter.on('positionUpdate', callback)

      const positionData = {
        vehicleId: 'v1',
        rear: { x: 100, y: 100 },
        front: { x: 200, y: 100 },
        center: { x: 150, y: 100 },
        angle: 0 // horizontal, pointing right
      }

      emitter.emit('positionUpdate', positionData)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(positionData)
    })

    it('should calculate correct angle for different orientations', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      emitter.on('positionUpdate', callback)

      // Vehicle pointing up (90 degrees = PI/2)
      emitter.emit('positionUpdate', {
        vehicleId: 'v1',
        rear: { x: 100, y: 200 },
        front: { x: 100, y: 100 },
        center: { x: 100, y: 150 },
        angle: -Math.PI / 2
      })

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          angle: -Math.PI / 2
        })
      )
    })

    it('should support multiple subscribers for positionUpdate', () => {
      const emitter = new VehicleEventEmitter()
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      emitter.on('positionUpdate', callback1)
      emitter.on('positionUpdate', callback2)

      emitter.emit('positionUpdate', {
        vehicleId: 'v1',
        rear: { x: 0, y: 0 },
        front: { x: 50, y: 0 },
        center: { x: 25, y: 0 },
        angle: 0
      })

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })
})
