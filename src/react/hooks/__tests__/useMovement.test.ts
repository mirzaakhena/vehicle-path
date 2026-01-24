import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMovement } from '../useMovement'
import type { Line, Curve } from '../../../core/types/geometry'
import type { Vehicle } from '../../../core/types/vehicle'

const createTestLines = (): Line[] => [
  { id: 'line001', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
  { id: 'line002', start: { x: 400, y: 0 }, end: { x: 400, y: 300 } },
  { id: 'line003', start: { x: 400, y: 300 }, end: { x: 0, y: 300 } }
]

const createTestVehicles = (): Vehicle[] => [
  {
    id: 'v1',
    lineId: 'line001',
    offset: 0,
    isPercentage: false,
    state: 'idle',
    rear: { lineId: 'line001', position: { x: 0, y: 0 }, absoluteOffset: 0 },
    front: { lineId: 'line001', position: { x: 30, y: 0 }, absoluteOffset: 30 }
  },
  {
    id: 'v2',
    lineId: 'line002',
    offset: 0,
    isPercentage: false,
    state: 'idle',
    rear: { lineId: 'line002', position: { x: 400, y: 0 }, absoluteOffset: 0 },
    front: { lineId: 'line002', position: { x: 400, y: 30 }, absoluteOffset: 30 }
  }
]

const createTestCurves = (): Curve[] => [
  { fromLineId: 'line001', toLineId: 'line002' },
  { fromLineId: 'line002', toLineId: 'line003' }
]

describe('useMovement', () => {
  describe('initial state', () => {
    it('should initialize with empty queues', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      expect(result.current.vehicleQueues.size).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('queueMovement', () => {
    it('should queue a movement command with default targetPosition (1.0 = end of line)', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002'
          // targetPosition defaults to 1.0 (100%)
        })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)
      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.vehicleId).toBe('v1')
      expect(command.targetLineId).toBe('line002')
      expect(command.targetOffset).toBe(100) // 1.0 * 100 = end of line
      expect(command.isPercentage).toBe(true)
    })

    it('should queue a movement command with explicit targetPosition', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)
      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.vehicleId).toBe('v1')
      expect(command.targetLineId).toBe('line002')
      expect(command.targetOffset).toBe(50) // 0.5 * 100
      expect(command.isPercentage).toBe(true)
    })

    it('should queue multiple commands for same vehicle', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line003',
          targetPosition: 1.0
        })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(2)
    })

    it('should queue commands for different vehicles', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      act(() => {
        result.current.queueMovement('v2', {
          targetLineId: 'line003',
          targetPosition: 0.5
        })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)
      expect(result.current.vehicleQueues.get('v2')).toHaveLength(1)
    })

    it('should handle wait option', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5,
          wait: true
        })
      })

      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.awaitConfirmation).toBe(true)
    })

    it('should handle payload', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      const testPayload = { orderId: '123', message: 'hello' }

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5,
          payload: testPayload
        })
      })

      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.payload).toEqual(testPayload)
    })

    it('should fail on non-existent vehicle', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('nonexistent', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })

    it('should fail on non-existent line', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'nonexistent',
          targetPosition: 0.5
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })

    it('should fail on invalid percentage position (negative)', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: -0.1
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('Invalid targetPosition')
      expect(response?.error).toContain('must be 0-1 for percentage')
    })

    it('should fail on invalid percentage position (greater than 1)', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 1.5
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('Invalid targetPosition')
      expect(response?.error).toContain('must be 0-1 for percentage')
    })

    it('should queue movement with absolute distance', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002', // length = 300
          targetPosition: 150,
          isPercentage: false
        })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)
      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.targetOffset).toBe(150) // absolute value, no conversion
      expect(command.isPercentage).toBe(false)
    })

    it('should fail on absolute position exceeding line length', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'line002', // length = 300
          targetPosition: 500,
          isPercentage: false
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('exceeds line length')
    })

    it('should fail on negative absolute position', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: -50,
          isPercentage: false
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('must be >= 0 for absolute distance')
    })

    it('should fail when isPercentage is false but targetPosition is not provided', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'line002',
          isPercentage: false  // absolute mode requires explicit targetPosition
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('targetPosition is required when isPercentage is false')
    })

    it('should allow absolute position at exact line length', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'line002', // length = 300
          targetPosition: 300,
          isPercentage: false
        })
      })

      expect(response?.success).toBe(true)
      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.targetOffset).toBe(300)
      expect(command.isPercentage).toBe(false)
    })

    it('should return success on valid command', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      expect(response?.success).toBe(true)
      expect(response?.error).toBeUndefined()
    })
  })

  describe('clearQueue', () => {
    it('should clear queue for specific vehicle', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
        result.current.queueMovement('v2', {
          targetLineId: 'line003',
          targetPosition: 0.5
        })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)
      expect(result.current.vehicleQueues.get('v2')).toHaveLength(1)

      act(() => {
        result.current.clearQueue('v1')
      })

      expect(result.current.vehicleQueues.has('v1')).toBe(false)
      expect(result.current.vehicleQueues.get('v2')).toHaveLength(1)
    })

    it('should clear all queues when no vehicleId provided', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
        result.current.queueMovement('v2', {
          targetLineId: 'line003',
          targetPosition: 0.5
        })
      })

      act(() => {
        result.current.clearQueue()
      })

      expect(result.current.vehicleQueues.size).toBe(0)
    })

    it('should fail on non-existent vehicle when clearing specific queue', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.clearQueue('nonexistent')
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })

    it('should return success on valid clear', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.clearQueue('v1')
      })

      expect(response?.success).toBe(true)
      expect(response?.error).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should clear error on successful operation', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      // Cause an error
      act(() => {
        result.current.queueMovement('nonexistent', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      expect(result.current.error).not.toBeNull()

      // Successful operation should clear error
      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0.5
        })
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('position edge cases', () => {
    it('should handle position at 0', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 0
        })
      })

      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.targetOffset).toBe(0)
    })

    it('should handle position at 1', () => {
      const { result } = renderHook(() =>
        useMovement({
          vehicles: createTestVehicles(),
          lines: createTestLines(),
          curves: createTestCurves()
        })
      )

      act(() => {
        result.current.queueMovement('v1', {
          targetLineId: 'line002',
          targetPosition: 1
        })
      })

      const command = result.current.vehicleQueues.get('v1')![0]
      expect(command.targetOffset).toBe(100)
    })
  })
})
