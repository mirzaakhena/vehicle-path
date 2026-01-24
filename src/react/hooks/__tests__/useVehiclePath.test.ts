import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVehiclePath } from '../useVehiclePath'

describe('useVehiclePath', () => {
  describe('initial state', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      expect(result.current.lines).toEqual([])
      expect(result.current.curves).toEqual([])
      expect(result.current.vehicles).toEqual([])
      expect(result.current.vehicleQueues.size).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('scene operations', () => {
    it('should set scene and clear vehicles/movements', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      // Initial setup
      act(() => {
        result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [400, 0] }]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      expect(result.current.vehicles).toHaveLength(1)

      // Replace scene - should clear vehicles
      act(() => {
        result.current.setScene({
          lines: [{ id: 'line002', start: [0, 0], end: [300, 0] }]
        })
      })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].id).toBe('line002')
      expect(result.current.vehicles).toHaveLength(0)
    })
  })

  describe('Edge Case: Line removed while vehicle is on it', () => {
    it('should warn when removing line with vehicles', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      let response: ReturnType<typeof result.current.removeLine>
      act(() => {
        response = result.current.removeLine('line001')
      })

      expect(response!.success).toBe(true)
      expect(response!.warnings).toBeDefined()
      expect(response!.warnings).toHaveLength(1)
      expect(response!.warnings![0].type).toBe('vehicle_on_removed_line')
      expect(response!.warnings![0].details?.vehicleIds).toContain('v1')
    })

    it('should remove vehicles when their line is removed', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicle({ id: 'v2', lineId: 'line002', position: 0 })
      })

      expect(result.current.vehicles).toHaveLength(2)

      act(() => {
        result.current.removeLine('line001')
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v2')
    })

    it('should clear movement queue when line with vehicle is removed', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.queueMovement('v1', { targetLineId: 'line002', targetPosition: 1.0 })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)

      act(() => {
        result.current.removeLine('line001')
      })

      // Vehicle removed, so queue should not exist
      expect(result.current.vehicleQueues.has('v1')).toBe(false)
    })

    it('should warn about orphaned connections', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      let response: ReturnType<typeof result.current.removeLine>
      act(() => {
        response = result.current.removeLine('line001')
      })

      expect(response!.warnings).toBeDefined()
      const orphanWarning = response!.warnings!.find(w => w.type === 'orphaned_connection')
      expect(orphanWarning).toBeDefined()
      expect(orphanWarning!.details?.connectionCount).toBe(1)
    })
  })

  describe('Edge Case: Vehicle removed while movement in progress', () => {
    it('should warn and clear queue when removing vehicle with queued movements', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.queueMovement('v1', { targetLineId: 'line002', targetPosition: 0.5 })
        result.current.queueMovement('v1', { targetLineId: 'line002', targetPosition: 1.0 })
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(2)

      let response: ReturnType<typeof result.current.removeVehicle>
      act(() => {
        response = result.current.removeVehicle('v1')
      })

      expect(response!.success).toBe(true)
      expect(response!.warnings).toBeDefined()
      expect(response!.warnings).toHaveLength(1)
      expect(response!.warnings![0].type).toBe('movement_queue_cleared')
      expect(response!.warnings![0].message).toContain('2 queued movement(s)')
    })

    it('should not warn when removing vehicle without queued movements', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [400, 0] }]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      let response: ReturnType<typeof result.current.removeVehicle>
      act(() => {
        response = result.current.removeVehicle('v1')
      })

      expect(response!.success).toBe(true)
      expect(response!.warnings).toBeUndefined()
    })
  })

  describe('Edge Case: Movement queued for non-existent vehicle/line', () => {
    it('should fail when queuing movement for non-existent vehicle', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [400, 0] }]
        })
      })

      let response: ReturnType<typeof result.current.queueMovement>
      act(() => {
        response = result.current.queueMovement('nonexistent', {
          targetLineId: 'line001',
          targetPosition: 0.5
        })
      })

      expect(response!.success).toBe(false)
      expect(response!.error).toContain('not found')
    })

    it('should fail when queuing movement for non-existent line', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [400, 0] }]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      let response: ReturnType<typeof result.current.queueMovement>
      act(() => {
        response = result.current.queueMovement('v1', {
          targetLineId: 'nonexistent',
          targetPosition: 0.5
        })
      })

      expect(response!.success).toBe(false)
      expect(response!.error).toContain('not found')
    })
  })

  describe('utility functions', () => {
    it('getVehiclesOnLine should return vehicles on specified line', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicle({ id: 'v2', lineId: 'line001', position: 100, isPercentage: false })
        result.current.addVehicle({ id: 'v3', lineId: 'line002', position: 0 })
      })

      const vehiclesOnLine001 = result.current.getVehiclesOnLine('line001')
      expect(vehiclesOnLine001).toHaveLength(2)
      expect(vehiclesOnLine001.map(v => v.id)).toContain('v1')
      expect(vehiclesOnLine001.map(v => v.id)).toContain('v2')

      const vehiclesOnLine002 = result.current.getVehiclesOnLine('line002')
      expect(vehiclesOnLine002).toHaveLength(1)
      expect(vehiclesOnLine002[0].id).toBe('v3')
    })

    it('hasVehiclesOnLine should return correct boolean', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ]
        })
      })

      expect(result.current.hasVehiclesOnLine('line001')).toBe(false)

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      expect(result.current.hasVehiclesOnLine('line001')).toBe(true)
      expect(result.current.hasVehiclesOnLine('line002')).toBe(false)
    })
  })

  describe('clearScene', () => {
    it('should clear everything', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
      })

      // Queue movement in separate act to ensure vehicle is registered
      act(() => {
        result.current.queueMovement('v1', { targetLineId: 'line002', targetPosition: 1.0 })
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.curves).toHaveLength(1)
      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicleQueues.size).toBe(1)

      act(() => {
        result.current.clearScene()
      })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.curves).toHaveLength(0)
      expect(result.current.vehicles).toHaveLength(0)
      expect(result.current.vehicleQueues.size).toBe(0)
    })
  })

  describe('clearVehicles', () => {
    it('should clear vehicles and their queues', () => {
      const { result } = renderHook(() => useVehiclePath({ wheelbase: 30 }))

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [400, 0] },
            { id: 'line002', start: [400, 0], end: [400, 300] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      act(() => {
        result.current.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicle({ id: 'v2', lineId: 'line002', position: 0 })
      })

      // Queue movement in separate act to ensure vehicle is registered
      act(() => {
        result.current.queueMovement('v1', { targetLineId: 'line002', targetPosition: 1.0 })
      })

      expect(result.current.vehicles).toHaveLength(2)
      expect(result.current.vehicleQueues.size).toBe(1)

      act(() => {
        result.current.clearVehicles()
      })

      expect(result.current.vehicles).toHaveLength(0)
      expect(result.current.vehicleQueues.size).toBe(0)
      // Lines should still exist
      expect(result.current.lines).toHaveLength(2)
    })
  })
})
