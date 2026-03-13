import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInitialMovement } from '../useInitialMovement'
import type { Line } from '../../../core/types/geometry'

describe('useInitialMovement', () => {
  const mockLines: Line[] = [
    { id: 'line001', start: { x: 100, y: 100 }, end: { x: 500, y: 100 } },
    { id: 'line002', start: { x: 500, y: 100 }, end: { x: 500, y: 400 } }
  ]

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should initialize with empty vehicles', () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
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
        useInitialMovement({ lines: mockLines })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 0%')
      })

      // Parsing is now immediate (no debounce)
      expect(result.current.isDebouncing).toBe(false)
      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v1')
      const v0 = result.current.vehicles[0]
      expect(v0.axles[v0.axles.length - 1].lineId).toBe('line001')
      expect(v0.axles[v0.axles.length - 1].absoluteOffset).toBe(0)
      expect(result.current.movementError).toBeNull()
    })

    it('should parse multiple vehicle starts', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
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
        useInitialMovement({ lines: mockLines })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 50')
      })

      expect(result.current.vehicles).toHaveLength(1)
      const v = result.current.vehicles[0]
      expect(v.axles[v.axles.length - 1].absoluteOffset).toBe(50)
    })

    it('should calculate percentage offset correctly based on effective length', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
      )

      // line001 length = 400 (from x:100 to x:500)
      // 1 axle, effectiveLength = 400, 50% of 400 = 200
      act(() => {
        result.current.setInitialMovementText('v1 start line001 50%')
      })

      expect(result.current.vehicles).toHaveLength(1)
      // 50% of effective length (400) = 200
      const vp = result.current.vehicles[0]
      expect(vp.axles[vp.axles.length - 1].absoluteOffset).toBe(200)
    })

    it('should place single axle vehicle at the given position', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 0%')
      })

      expect(result.current.vehicles).toHaveLength(1)
      const vehicle = result.current.vehicles[0]

      // 1 axle only, axles[0] is the only axle at position 0
      expect(vehicle.axles[0].absoluteOffset).toBe(0)
    })
  })

  describe('validation errors', () => {
    it('should report error for non-existent line', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start nonexistent 0%')
      })

      expect(result.current.movementError).not.toBeNull()
      expect(result.current.movementError).toContain('nonexistent')
    })

    it('should report error for duplicate vehicle ID', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
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
        useInitialMovement({ lines: mockLines })
      )

      act(() => {
        result.current.setInitialMovementText('v1 start line001 50%')
      })

      const vehicle = result.current.vehicles[0]

      // Check vehicle structure
      expect(vehicle).toHaveProperty('id')
      expect(vehicle).toHaveProperty('state')
      expect(vehicle).toHaveProperty('axles')
      expect(vehicle).toHaveProperty('axleSpacings')
      expect(vehicle.axles.length).toBeGreaterThanOrEqual(1)

      // Check rear axle (axles[N-1])
      const rear = vehicle.axles[vehicle.axles.length - 1]
      expect(rear).toHaveProperty('lineId')
      expect(rear).toHaveProperty('absoluteOffset')
      expect(rear).toHaveProperty('position')
      expect(rear.position).toHaveProperty('x')
      expect(rear.position).toHaveProperty('y')

      // Check front axle (axles[0])
      const front = vehicle.axles[0]
      expect(front).toHaveProperty('lineId')
      expect(front).toHaveProperty('absoluteOffset')
      expect(front).toHaveProperty('position')

      // Vehicle should start in idle state
      expect(vehicle.state).toBe('idle')
    })

    it('should calculate correct position on line', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
      )

      // line001: (100,100) -> (500,100), length = 400
      // 1 axle, effectiveLength = 400, 50% of 400 = 200
      // Position at offset 200 on line from (100,100) to (500,100):
      // x = 100 + (200/400) * (500-100) = 100 + 200 = 300
      act(() => {
        result.current.setInitialMovementText('v1 start line001 50%')
      })

      const vehicle = result.current.vehicles[0]

      // 50% of effective length puts axle at offset 200
      // position = start + (offset/length) * (end - start)
      // x = 100 + (200/400) * 400 = 100 + 200 = 300
      const rearAxle = vehicle.axles[vehicle.axles.length - 1]
      expect(rearAxle.position.x).toBeCloseTo(300, 1)
      expect(rearAxle.position.y).toBeCloseTo(100, 1)
    })
  })

  describe('rapid changes behavior', () => {
    it('should handle rapid changes and use final state', async () => {
      const { result } = renderHook(() =>
        useInitialMovement({ lines: mockLines })
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
