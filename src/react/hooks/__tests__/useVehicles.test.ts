import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVehicles } from '../useVehicles'
import type { Line } from '../../../core/types/geometry'

const createTestLines = (): Line[] => [
  { id: 'line001', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
  { id: 'line002', start: { x: 400, y: 0 }, end: { x: 400, y: 300 } }
]

describe('useVehicles', () => {
  describe('initial state', () => {
    it('should initialize with empty vehicles', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      expect(result.current.vehicles).toEqual([])
      expect(result.current.error).toBeNull()
    })
  })

  describe('addVehicles', () => {
    it('should add a vehicle with default position (0) and isPercentage (true)', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001' })
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v1')
      expect(result.current.vehicles[0].lineId).toBe('line001')
      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(0) // default position 0
    })

    it('should add a vehicle with percentage position (default mode)', () => {
      const lines = createTestLines()
      const wheelbase = 30
      const { result } = renderHook(() =>
        useVehicles({ lines, wheelbase })
      )

      act(() => {
        result.current.addVehicles({
          id: 'v1',
          lineId: 'line001',
          position: 0.5  // isPercentage defaults to true
        })
      })

      expect(result.current.vehicles).toHaveLength(1)
      // Line length is 400, effective length = 400 - 30 = 370
      // 50% of 370 = 185
      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(185)
    })

    it('should add a vehicle with absolute position', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({
          id: 'v1',
          lineId: 'line001',
          position: 100,
          isPercentage: false
        })
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v1')
      expect(result.current.vehicles[0].lineId).toBe('line001')
      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(100)
    })

    it('should add multiple vehicles', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.addVehicles({ id: 'v2', lineId: 'line002', position: 0 })
      })

      expect(result.current.vehicles).toHaveLength(2)
      expect(result.current.vehicles[0].id).toBe('v1')
      expect(result.current.vehicles[1].id).toBe('v2')
    })

    it('should fail on duplicate vehicle ID', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.addVehicles({ id: 'v1', lineId: 'line002', position: 0 })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors?.some(e => e.includes('already exists'))).toBe(true)
      expect(result.current.vehicles).toHaveLength(1)
    })

    it('should fail on non-existent line', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.addVehicles({ id: 'v1', lineId: 'nonexistent', position: 0 })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors?.some(e => e.includes('not found'))).toBe(true)
      expect(result.current.vehicles).toHaveLength(0)
    })

    it('should fail on invalid absolute offset', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.addVehicles({
          id: 'v1',
          lineId: 'line001',
          position: 500, // exceeds line length of 400
          isPercentage: false
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors?.some(e => e.includes('exceeds'))).toBe(true)
    })

    it('should return success on valid vehicle', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      expect(response?.success).toBe(true)
      expect(response?.errors).toBeUndefined()
    })

    it('should calculate front axle position based on wheelbase', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      const vehicle = result.current.vehicles[0]
      expect(vehicle.rear.absoluteOffset).toBe(0)
      // Front should be wheelbase ahead of rear
      expect(vehicle.front.absoluteOffset).toBe(30)
    })
  })

  describe('removeVehicle', () => {
    it('should remove a vehicle', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicles({ id: 'v2', lineId: 'line002', position: 0 })
      })

      expect(result.current.vehicles).toHaveLength(2)

      act(() => {
        result.current.removeVehicle('v1')
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v2')
    })

    it('should fail on non-existent vehicle', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      let response: { success: boolean; errors?: string[] } | { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.removeVehicle('nonexistent')
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })

    it('should return success on valid removal', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      let response: { success: boolean; errors?: string[] } | { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.removeVehicle('v1')
      })

      expect(response?.success).toBe(true)
      expect(response?.error).toBeUndefined()
    })
  })

  describe('clear', () => {
    it('should clear all vehicles', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicles({ id: 'v2', lineId: 'line002', position: 0 })
      })

      expect(result.current.vehicles).toHaveLength(2)

      act(() => {
        result.current.clear()
      })

      expect(result.current.vehicles).toHaveLength(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should clear error on successful operation', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      // Cause an error
      act(() => {
        result.current.removeVehicle('nonexistent')
      })

      expect(result.current.error).not.toBeNull()

      // Successful operation should clear error
      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('with zero wheelbase', () => {
    it('should handle vehicles with zero wheelbase', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 0 })
      )

      act(() => {
        result.current.addVehicles({
          id: 'v1',
          lineId: 'line001',
          position: 100,
          isPercentage: false
        })
      })

      const vehicle = result.current.vehicles[0]
      expect(vehicle.rear.absoluteOffset).toBe(100)
      expect(vehicle.front.absoluteOffset).toBe(100) // Same as rear when wheelbase is 0
    })
  })

  describe('position calculations', () => {
    it('should handle position at start of line', () => {
      const { result } = renderHook(() =>
        useVehicles({ lines: createTestLines(), wheelbase: 30 })
      )

      act(() => {
        result.current.addVehicles({
          id: 'v1',
          lineId: 'line001',
          position: 0,
          isPercentage: true
        })
      })

      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(0)
    })

    it('should handle position at end of line (percentage)', () => {
      const lines = createTestLines()
      const wheelbase = 30
      const { result } = renderHook(() =>
        useVehicles({ lines, wheelbase })
      )

      act(() => {
        result.current.addVehicles({
          id: 'v1',
          lineId: 'line001',
          position: 1.0, // 100%
          isPercentage: true
        })
      })

      // Line length is 400, effective length = 400 - 30 = 370
      // 100% of 370 = 370
      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(370)
    })
  })
})
