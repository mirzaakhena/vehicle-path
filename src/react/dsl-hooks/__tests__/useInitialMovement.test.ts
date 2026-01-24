import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInitialMovement } from '../useInitialMovement'
import type { Line } from '../../../core/types/geometry'

describe('useInitialMovement', () => {
  const mockLines: Line[] = [
    { id: 'line001', start: { x: 100, y: 100 }, end: { x: 500, y: 100 } },
    { id: 'line002', start: { x: 500, y: 100 }, end: { x: 500, y: 400 } }
  ]

  const wheelbase = 30

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should initialize with empty vehicles', () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      expect(result.current.vehicles).toEqual([])
      expect(result.current.initialMovementText).toBe('')
      expect(result.current.movementError).toBeNull()
      expect(result.current.isDebouncing).toBe(false)
    })
  })

  describe('setInitialMovementText - parsing DSL', () => {
    it('should parse single vehicle start from DSL text immediately', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 0%')
      })

      // Parsing is now immediate (no debounce)
      expect(result.current.isDebouncing).toBe(false)
      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v1')
      expect(result.current.vehicles[0].rear.lineId).toBe('line001')
      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(0)
      expect(result.current.movementError).toBeNull()
    })

    it('should parse multiple vehicle starts', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      act(() => {
        result.current.setInitialMovementText(`
v1 start line001 0%
v2 start line002 50%
        `)
      })

      expect(result.current.vehicles).toHaveLength(2)
      expect(result.current.vehicles[0].id).toBe('v1')
      expect(result.current.vehicles[1].id).toBe('v2')
    })

    it('should parse absolute offset (non-percentage)', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 50')
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(50)
    })

    it('should calculate percentage offset correctly based on effective length', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      // line001 length = 400 (from x:100 to x:500)
      // Effective length = 400 - wheelbase = 400 - 30 = 370
      // 50% of 370 = 185
      act(() => {
        result.current.setInitialMovementText('v1 start line001 50%')
      })

      expect(result.current.vehicles).toHaveLength(1)
      // 50% of effective length (370) = 185
      expect(result.current.vehicles[0].rear.absoluteOffset).toBe(185)
    })

    it('should calculate front axle position based on wheelbase', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 0%')
      })

      expect(result.current.vehicles).toHaveLength(1)
      const vehicle = result.current.vehicles[0]

      // Front axle should be wheelbase distance ahead of rear
      expect(vehicle.front.absoluteOffset).toBe(wheelbase)
    })
  })

  describe('validation errors', () => {
    it('should report error for non-existent line', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start nonexistent 0%')
      })

      expect(result.current.movementError).not.toBeNull()
      expect(result.current.movementError).toContain('nonexistent')
    })

    it('should report error for duplicate vehicle ID', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      act(() => {
        result.current.setInitialMovementText(`
v1 start line001 0%
v1 start line002 50%
        `)
      })

      expect(result.current.movementError).not.toBeNull()
      expect(result.current.movementError?.toLowerCase()).toContain('already exists')
    })
  })

  describe('vehicle structure', () => {
    it('should create vehicle with correct structure', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 50%')
      })

      const vehicle = result.current.vehicles[0]

      // Check vehicle structure
      expect(vehicle).toHaveProperty('id')
      expect(vehicle).toHaveProperty('state')
      expect(vehicle).toHaveProperty('rear')
      expect(vehicle).toHaveProperty('front')

      // Check rear axle
      expect(vehicle.rear).toHaveProperty('lineId')
      expect(vehicle.rear).toHaveProperty('absoluteOffset')
      expect(vehicle.rear).toHaveProperty('position')
      expect(vehicle.rear.position).toHaveProperty('x')
      expect(vehicle.rear.position).toHaveProperty('y')

      // Check front axle
      expect(vehicle.front).toHaveProperty('lineId')
      expect(vehicle.front).toHaveProperty('absoluteOffset')
      expect(vehicle.front).toHaveProperty('position')

      // Vehicle should start in idle state
      expect(vehicle.state).toBe('idle')
    })

    it('should calculate correct position on line', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      // line001: (100,100) -> (500,100), length = 400
      // Effective length = 400 - 30 = 370
      // 50% of 370 = 185
      // Position at offset 185 on line from (100,100) to (500,100):
      // x = 100 + (185/400) * (500-100) = 100 + 185 = 285
      act(() => {
        result.current.setInitialMovementText('v1 start line001 50%')
      })

      const vehicle = result.current.vehicles[0]

      // 50% of effective length puts rear at offset 185
      // position = start + (offset/length) * (end - start)
      // x = 100 + (185/400) * 400 = 100 + 185 = 285
      expect(vehicle.rear.position.x).toBeCloseTo(285, 1)
      expect(vehicle.rear.position.y).toBeCloseTo(100, 1)
    })
  })

  describe('rapid changes behavior', () => {
    it('should handle rapid changes and use final state', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines, wheelbase })
      )

      // First change
      act(() => {
        result.current.setInitialMovementText('v1 start line001 0%')
      })

      // Second change immediately
      act(() => {
        result.current.setInitialMovementText('v2 start line002 50%')
      })

      // Should have parsed the final text immediately
      expect(result.current.isDebouncing).toBe(false)
      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v2')
    })
  })
})
