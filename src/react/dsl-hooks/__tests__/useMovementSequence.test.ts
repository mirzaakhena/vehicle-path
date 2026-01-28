import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMovementSequence } from '../useMovementSequence'
import type { Line } from '../../../core/types/geometry'
import type { Vehicle } from '../../../core/types/vehicle'

describe('useMovementSequence', () => {
  const mockLines: Line[] = [
    { id: 'line001', start: { x: 100, y: 100 }, end: { x: 500, y: 100 } },
    { id: 'line002', start: { x: 500, y: 100 }, end: { x: 500, y: 400 } }
  ]

  const mockVehicles: Vehicle[] = [
    {
      id: 'v1',
      lineId: 'line001',
      offset: 0,
      isPercentage: false,
      state: 'idle',
      rear: { lineId: 'line001', absoluteOffset: 0, position: { x: 100, y: 100 } },
      front: { lineId: 'line001', absoluteOffset: 30, position: { x: 130, y: 100 } }
    },
    {
      id: 'v2',
      lineId: 'line002',
      offset: 0,
      isPercentage: false,
      state: 'idle',
      rear: { lineId: 'line002', absoluteOffset: 0, position: { x: 500, y: 100 } },
      front: { lineId: 'line002', absoluteOffset: 30, position: { x: 500, y: 130 } }
    }
  ]

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should initialize with empty commands and queues', () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      expect(result.current.gotoCommands).toEqual([])
      expect(result.current.vehicleQueues).toEqual(new Map())
      expect(result.current.movementSequenceText).toBe('')
      expect(result.current.sequenceError).toBeNull()
      expect(result.current.isDebouncing).toBe(false)
    })
  })

  describe('setMovementSequenceText - parsing DSL', () => {
    it('should parse single goto command immediately', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText('v1 goto line001 100%')
      })

      // Parsing is now immediate (no debounce)
      expect(result.current.isDebouncing).toBe(false)
      expect(result.current.gotoCommands).toHaveLength(1)
      expect(result.current.gotoCommands[0]).toMatchObject({
        vehicleId: 'v1',
        targetLineId: 'line001',
        isPercentage: true
      })
      expect(result.current.sequenceError).toBeNull()
    })

    it('should parse multiple goto commands', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText(`
v1 goto line001 100%
v2 goto line002 50%
v1 goto line002 100%
        `)
      })

      expect(result.current.gotoCommands).toHaveLength(3)
    })


    it('should parse goto command with --payload', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText('v1 goto line001 100% --payload {"orderId": "123", "priority": 1}')
      })

      expect(result.current.gotoCommands).toHaveLength(1)
      expect(result.current.gotoCommands[0].payload).toEqual({
        orderId: '123',
        priority: 1
      })
    })


    it('should parse absolute offset (non-percentage)', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText('v1 goto line001 200')
      })

      expect(result.current.gotoCommands).toHaveLength(1)
      expect(result.current.gotoCommands[0].isPercentage).toBe(false)
      // Absolute offsets are kept as raw values
      expect(result.current.gotoCommands[0].targetPosition).toBe(200)
    })
  })

  describe('vehicleQueues', () => {
    it('should organize commands into per-vehicle queues', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText(`
v1 goto line001 100%
v2 goto line002 50%
v1 goto line002 100%
        `)
      })

      const v1Queue = result.current.vehicleQueues.get('v1')
      const v2Queue = result.current.vehicleQueues.get('v2')

      expect(v1Queue).toHaveLength(2)
      expect(v2Queue).toHaveLength(1)

      expect(v1Queue![0].targetLineId).toBe('line001')
      expect(v1Queue![1].targetLineId).toBe('line002')
      expect(v2Queue![0].targetLineId).toBe('line002')
    })
  })

  describe('validation errors', () => {
    it('should report error for non-existent vehicle', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText('v99 goto line001 100%')
      })

      expect(result.current.sequenceError).not.toBeNull()
      expect(result.current.sequenceError?.toLowerCase()).toContain('vehicle')
    })

    it('should report error for non-existent line', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText('v1 goto nonexistent 100%')
      })

      expect(result.current.sequenceError).not.toBeNull()
      expect(result.current.sequenceError?.toLowerCase()).toContain('line')
    })
  })

  describe('command structure', () => {
    it('should create command with correct structure', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      act(() => {
        result.current.setMovementSequenceText('v1 goto line002 75% --payload {"key": "value"}')
      })

      const command = result.current.gotoCommands[0]

      // MovementCommand structure (from dslParser)
      expect(command).toHaveProperty('vehicleId')
      expect(command).toHaveProperty('targetLineId')
      expect(command).toHaveProperty('targetPosition')
      expect(command).toHaveProperty('isPercentage')
      expect(command).toHaveProperty('payload')

      expect(command.vehicleId).toBe('v1')
      expect(command.targetLineId).toBe('line002')
      expect(command.targetPosition).toBe(0.75)  // 75% converted to 0.75
      expect(command.isPercentage).toBe(true)
      expect(command.payload).toEqual({ key: 'value' })
    })
  })

  describe('rapid changes behavior', () => {
    it('should handle rapid changes and use final state', async () => {
      const { result } = renderHook(() =>
        useMovementSequence({ lines: mockLines, vehicles: mockVehicles })
      )

      // First change
      act(() => {
        result.current.setMovementSequenceText('v1 goto line001 100%')
      })

      // Second change immediately
      act(() => {
        result.current.setMovementSequenceText('v2 goto line002 50%')
      })

      // Should have parsed the final text immediately
      expect(result.current.isDebouncing).toBe(false)
      expect(result.current.gotoCommands).toHaveLength(1)
      expect(result.current.gotoCommands[0].vehicleId).toBe('v2')
    })
  })
})
