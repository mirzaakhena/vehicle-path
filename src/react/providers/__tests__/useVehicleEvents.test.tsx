import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import {
  useCreateVehicleEventEmitter,
  useVehicleEventEmitter,
  useVehicleEvent,
  VehicleEventContext,
  VehicleEventProvider
} from '../useVehicleEvents'
import { VehicleEventEmitter } from '../../../utils/events/emitter'

describe('useVehicleEvents', () => {
  describe('useCreateVehicleEventEmitter', () => {
    it('should create a VehicleEventEmitter instance', () => {
      const { result } = renderHook(() => useCreateVehicleEventEmitter())

      expect(result.current).toBeInstanceOf(VehicleEventEmitter)
    })

    it('should return the same instance across re-renders', () => {
      const { result, rerender } = renderHook(() => useCreateVehicleEventEmitter())

      const firstInstance = result.current

      rerender()

      expect(result.current).toBe(firstInstance)
    })
  })

  describe('useVehicleEventEmitter', () => {
    it('should return emitter from context', () => {
      const emitter = new VehicleEventEmitter()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      const { result } = renderHook(() => useVehicleEventEmitter(), { wrapper })

      expect(result.current).toBe(emitter)
    })

    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useVehicleEventEmitter())
      }).toThrow('useVehicleEventEmitter must be used within a VehicleEventProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('useVehicleEvent', () => {
    it('should subscribe to events', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      renderHook(() => useVehicleEvent('stateChange', callback), { wrapper })

      act(() => {
        emitter.emit('stateChange', {
          vehicleId: 'v1',
          from: 'idle',
          to: 'moving'
        })
      })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith({
        vehicleId: 'v1',
        from: 'idle',
        to: 'moving'
      })
    })

    it('should unsubscribe on unmount', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      const { unmount } = renderHook(() => useVehicleEvent('stateChange', callback), { wrapper })

      // Unmount the hook
      unmount()

      // Emit event after unmount
      act(() => {
        emitter.emit('stateChange', {
          vehicleId: 'v1',
          from: 'idle',
          to: 'moving'
        })
      })

      // Callback should not be called after unmount
      expect(callback).not.toHaveBeenCalled()
    })

    it('should handle commandComplete event', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      renderHook(() => useVehicleEvent('commandComplete', callback), { wrapper })

      act(() => {
        emitter.emit('commandComplete', {
          vehicleId: 'v1',
          command: {
            vehicleId: 'v1',
            targetLineId: 'line001',
            targetOffset: 100,
            isPercentage: true
          },
          finalPosition: { lineId: 'line001', absoluteOffset: 100, position: { x: 100, y: 100 } }
        })
      })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: 'v1'
        })
      )
    })

    it('should handle positionUpdate event', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      renderHook(() => useVehicleEvent('positionUpdate', callback), { wrapper })

      act(() => {
        emitter.emit('positionUpdate', {
          vehicleId: 'v1',
          rear: { x: 100, y: 100 },
          front: { x: 130, y: 100 },
          center: { x: 115, y: 100 },
          angle: 0
        })
      })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: 'v1',
          rear: { x: 100, y: 100 },
          front: { x: 130, y: 100 }
        })
      )
    })

    it('should handle commandStart event', () => {
      const emitter = new VehicleEventEmitter()
      const callback = vi.fn()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      renderHook(() => useVehicleEvent('commandStart', callback), { wrapper })

      act(() => {
        emitter.emit('commandStart', {
          vehicleId: 'v1',
          command: {
            vehicleId: 'v1',
            targetLineId: 'line001',
            targetOffset: 100,
            isPercentage: true
          },
          commandIndex: 0,
          startPosition: {
            lineId: 'line001',
            absoluteOffset: 0,
            position: { x: 100, y: 100 }
          }
        })
      })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: 'v1',
          commandIndex: 0
        })
      )
    })

    it('should update callback when deps change', () => {
      const emitter = new VehicleEventEmitter()
      let callbackValue = 'first'
      const callback = vi.fn(() => callbackValue)

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      const { rerender } = renderHook(
        ({ deps }) => useVehicleEvent('stateChange', callback, deps),
        { wrapper, initialProps: { deps: ['first'] as React.DependencyList } }
      )

      // Change the callback behavior
      callbackValue = 'second'

      // Rerender with new deps
      rerender({ deps: ['second'] })

      act(() => {
        emitter.emit('stateChange', {
          vehicleId: 'v1',
          from: 'idle',
          to: 'moving'
        })
      })

      expect(callback).toHaveBeenCalled()
    })
  })

  describe('VehicleEventContext', () => {
    it('should provide null by default', () => {
      const { result } = renderHook(() => React.useContext(VehicleEventContext))

      expect(result.current).toBeNull()
    })

    it('should provide the emitter when set', () => {
      const emitter = new VehicleEventEmitter()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventContext.Provider value={emitter}>
          {children}
        </VehicleEventContext.Provider>
      )

      const { result } = renderHook(() => React.useContext(VehicleEventContext), { wrapper })

      expect(result.current).toBe(emitter)
    })
  })

  describe('VehicleEventProvider', () => {
    it('should provide a VehicleEventEmitter to children', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventProvider>
          {children}
        </VehicleEventProvider>
      )

      const { result } = renderHook(() => useVehicleEventEmitter(), { wrapper })

      expect(result.current).toBeInstanceOf(VehicleEventEmitter)
    })

    it('should provide stable emitter across re-renders', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventProvider>
          {children}
        </VehicleEventProvider>
      )

      const { result, rerender } = renderHook(() => useVehicleEventEmitter(), { wrapper })

      const firstEmitter = result.current

      rerender()

      expect(result.current).toBe(firstEmitter)
    })

    it('should work with useVehicleEvent hook', () => {
      const callback = vi.fn()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventProvider>
          {children}
        </VehicleEventProvider>
      )

      // Get the emitter and set up the event listener
      const { result } = renderHook(
        () => {
          const emitter = useVehicleEventEmitter()
          useVehicleEvent('stateChange', callback)
          return emitter
        },
        { wrapper }
      )

      // Emit an event
      act(() => {
        result.current.emit('stateChange', {
          vehicleId: 'v1',
          from: 'idle',
          to: 'moving'
        })
      })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith({
        vehicleId: 'v1',
        from: 'idle',
        to: 'moving'
      })
    })

    it('should allow multiple subscriptions within the same provider', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <VehicleEventProvider>
          {children}
        </VehicleEventProvider>
      )

      // Single hook that subscribes twice
      const { result } = renderHook(
        () => {
          const emitter = useVehicleEventEmitter()
          useVehicleEvent('stateChange', callback1)
          useVehicleEvent('stateChange', callback2)
          return emitter
        },
        { wrapper }
      )

      // Emit an event
      act(() => {
        result.current.emit('stateChange', {
          vehicleId: 'v1',
          from: 'idle',
          to: 'moving'
        })
      })

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })
})
