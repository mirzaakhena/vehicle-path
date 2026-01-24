import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVehicleMovement } from '../useVehicleMovement'
import { VehicleEventEmitter } from '../../../utils/events/emitter'
import type { Line, Curve } from '../../../core/types/geometry'
import type { Vehicle } from '../../../core/types/vehicle'

/**
 * Note: useVehicleMovement is a complex hook that orchestrates many internal utilities.
 * The internal utilities (updateAxlePosition, prepareCommandPath, handleArrival, etc.)
 * are thoroughly tested in the vehicleMovement/__tests__/ folder with 100% coverage.
 *
 * These tests focus on the hook's public API surface and basic behavior.
 */

describe('useVehicleMovement', () => {
  // Test fixtures
  const mockLines: Line[] = [
    { id: 'line001', start: { x: 100, y: 100 }, end: { x: 500, y: 100 } },
    { id: 'line002', start: { x: 500, y: 100 }, end: { x: 500, y: 400 } }
  ]

  const mockCurves: Curve[] = []
  const wheelbase = 30

  const createMockVehicle = (id: string, lineId: string, offset: number): Vehicle => ({
    id,
    lineId,
    offset,
    isPercentage: false,
    state: 'idle',
    rear: {
      lineId,
      absoluteOffset: offset,
      position: { x: 100 + offset, y: 100 }
    },
    front: {
      lineId,
      absoluteOffset: offset + wheelbase,
      position: { x: 100 + offset + wheelbase, y: 100 }
    }
  })

  describe('API surface', () => {
    it('should return required control functions and state', () => {
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves
        })
      )

      // Check API shape
      expect(result.current).toHaveProperty('movingVehicles')
      expect(result.current).toHaveProperty('prepare')
      expect(result.current).toHaveProperty('tick')
      expect(result.current).toHaveProperty('reset')
      expect(result.current).toHaveProperty('continueVehicle')
      expect(result.current).toHaveProperty('isMoving')
      expect(result.current).toHaveProperty('isPrepared')

      // Check function types
      expect(typeof result.current.prepare).toBe('function')
      expect(typeof result.current.tick).toBe('function')
      expect(typeof result.current.reset).toBe('function')
      expect(typeof result.current.continueVehicle).toBe('function')
      expect(typeof result.current.isMoving).toBe('function')

      // Check initial values
      expect(Array.isArray(result.current.movingVehicles)).toBe(true)
      expect(typeof result.current.isPrepared).toBe('boolean')
    })
  })

  describe('tick without prepare', () => {
    it('should return false when tick is called without prepare', () => {
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves
        })
      )

      let stillMoving: boolean | undefined
      act(() => {
        stillMoving = result.current.tick(10)
      })

      expect(stillMoving).toBe(false)
    })
  })

  describe('isMoving without movement', () => {
    it('should return false when no movement is in progress', () => {
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves
        })
      )

      expect(result.current.isMoving()).toBe(false)
    })
  })

  describe('continueVehicle edge cases', () => {
    it('should return false for non-existent vehicle', () => {
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves
        })
      )

      let continued: boolean | undefined
      act(() => {
        continued = result.current.continueVehicle('nonexistent')
      })

      expect(continued).toBe(false)
    })
  })

  describe('isPrepared flag', () => {
    it('should be false initially', () => {
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves
        })
      )

      expect(result.current.isPrepared).toBe(false)
    })
  })

  describe('with eventEmitter', () => {
    it('should accept eventEmitter prop', () => {
      const emitter = new VehicleEventEmitter()
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves,
          eventEmitter: emitter
        })
      )

      // Hook should work without errors
      expect(result.current).toBeDefined()
      expect(result.current.movingVehicles).toBeDefined()
    })
  })

  describe('reset behavior', () => {
    it('should be callable and not throw', () => {
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves
        })
      )

      expect(() => {
        act(() => {
          result.current.reset()
        })
      }).not.toThrow()
    })
  })

  describe('prepare without commands', () => {
    it('should return false when no commands in queue', () => {
      const vehicles = [createMockVehicle('v1', 'line001', 0)]

      const { result } = renderHook(() =>
        useVehicleMovement({
          vehicles,
          lines: mockLines,
          vehicleQueues: new Map(),
          wheelbase,
          tangentMode: 'proportional-40',
          curves: mockCurves
        })
      )

      let prepared: boolean | undefined
      act(() => {
        prepared = result.current.prepare()
      })

      expect(prepared).toBe(false)
    })
  })
})
