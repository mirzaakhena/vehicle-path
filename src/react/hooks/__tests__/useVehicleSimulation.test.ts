import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVehicleSimulation } from '../useVehicleSimulation'

describe('useVehicleSimulation', () => {
  describe('initial state', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      expect(result.current.lines).toEqual([])
      expect(result.current.curves).toEqual([])
      expect(result.current.vehicles).toEqual([])
      expect(result.current.movingVehicles).toEqual([])
      expect(result.current.vehicleQueues.size).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('scene operations', () => {
    it('should add and remove lines', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
      })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].id).toBe('line001')

      act(() => {
        result.current.removeLine('line001')
      })

      expect(result.current.lines).toHaveLength(0)
    })

    it('should update line coordinates', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
      })

      expect(result.current.lines[0].end).toEqual({ x: 400, y: 0 })

      act(() => {
        result.current.updateLine('line001', { end: [500, 100] })
      })

      expect(result.current.lines[0].end).toEqual({ x: 500, y: 100 })
      expect(result.current.lines[0].start).toEqual({ x: 0, y: 0 }) // unchanged
    })

    it('should fail to update non-existent line', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      let response: ReturnType<typeof result.current.updateLine>
      act(() => {
        response = result.current.updateLine('nonexistent', { end: [500, 100] })
      })

      expect(response!.success).toBe(false)
      expect(response!.error).toContain('not found')
    })
  })

  describe('connection operations (connect/disconnect)', () => {
    it('should connect two lines', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.connect('line001', 'line002')
      })

      expect(result.current.curves).toHaveLength(1)
      expect(result.current.curves[0].fromLineId).toBe('line001')
      expect(result.current.curves[0].toLineId).toBe('line002')
    })

    it('should connect with from/to positions', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.connect('line001', 'line002', { from: 0.8, to: 0.2 })
      })

      expect(result.current.curves).toHaveLength(1)
      // Internal uses 0-100 scale
      expect(result.current.curves[0].fromOffset).toBe(80)
      expect(result.current.curves[0].toOffset).toBe(20)
    })

    it('should disconnect two lines', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.connect('line001', 'line002')
      })

      expect(result.current.curves).toHaveLength(1)

      act(() => {
        result.current.disconnect('line001', 'line002')
      })

      expect(result.current.curves).toHaveLength(0)
    })
  })

  describe('vehicle operations', () => {
    it('should add and remove vehicles', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v1')

      act(() => {
        result.current.removeVehicle('v1')
      })

      expect(result.current.vehicles).toHaveLength(0)
    })
  })

  describe('movement operations (goto)', () => {
    it('should queue movements with goto', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
        result.current.connect('line001', 'line002')
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.goto('v1', 'line002', 1.0)
      })

      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)
      expect(result.current.vehicleQueues.get('v1')![0].targetLineId).toBe('line002')
    })

    it('should use default targetPosition of 1.0', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.goto('v1', 'line001') // no targetPosition
      })

      const queue = result.current.vehicleQueues.get('v1')
      expect(queue).toHaveLength(1)
      expect(queue![0].targetOffset).toBe(100) // 1.0 * 100 = 100%
    })
  })

  describe('DSL loading', () => {
    it('should load scene from DSL', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.loadFromDSL(`
          line001 : (0, 0) -> (400, 0)
          line002 : (400, 0) -> (400, 300)
          line001 -> line002
        `)
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.curves).toHaveLength(1)
    })

    it('should load vehicles after scene is loaded', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      // First load scene
      act(() => {
        result.current.loadFromDSL(`
          line001 : (0, 0) -> (400, 0)
          line002 : (400, 0) -> (400, 300)
          line001 -> line002
        `)
      })

      expect(result.current.lines).toHaveLength(2)

      // Then add vehicles via DSL or addVehicle
      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.goto('v1', 'line002', 1.0)
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicleQueues.get('v1')).toHaveLength(1)
    })

    it('should warn on DSL parse errors', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      let response: ReturnType<typeof result.current.loadFromDSL>
      act(() => {
        response = result.current.loadFromDSL(`
          line001 : (0, 0) -> (400, 0)
          invalid line format here
        `)
      })

      expect(response!.success).toBe(true)
      expect(response!.warnings).toBeDefined()
      expect(response!.warnings![0].type).toBe('dsl_parse_error')
      // Scene should still load
      expect(result.current.lines).toHaveLength(1)
    })

    it('should clear existing scene when loading DSL', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      // Initial setup
      act(() => {
        result.current.addLine({ id: 'old', start: [0, 0], end: [100, 0] })
      })

      expect(result.current.lines).toHaveLength(1)

      // Load new DSL
      act(() => {
        result.current.loadFromDSL(`
          line001 : (0, 0) -> (400, 0)
        `)
      })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].id).toBe('line001')
    })
  })

  describe('edge cases: line removal', () => {
    it('should warn when removing line with vehicles', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
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
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicles({ id: 'v2', lineId: 'line002', position: 0 })
      })

      expect(result.current.vehicles).toHaveLength(2)

      act(() => {
        result.current.removeLine('line001')
      })

      expect(result.current.vehicles).toHaveLength(1)
      expect(result.current.vehicles[0].id).toBe('v2')
    })

    it('should warn about orphaned connections', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.connect('line001', 'line002')
      })

      expect(result.current.curves).toHaveLength(1)

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

  describe('edge cases: vehicle removal', () => {
    it('should warn and clear queue when removing vehicle with queued movements', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
        result.current.connect('line001', 'line002')
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.goto('v1', 'line002', 0.5)
        result.current.goto('v1', 'line002', 1.0)
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
  })

  describe('utility functions', () => {
    it('getVehiclesOnLine should return vehicles on specified line', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicles({ id: 'v2', lineId: 'line001', position: 100, isPercentage: false })
        result.current.addVehicles({ id: 'v3', lineId: 'line002', position: 0 })
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
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      expect(result.current.hasVehiclesOnLine('line001')).toBe(false)

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      expect(result.current.hasVehiclesOnLine('line001')).toBe(true)
      expect(result.current.hasVehiclesOnLine('line002')).toBe(false)
    })
  })

  describe('clearScene', () => {
    it('should clear everything', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
      })

      act(() => {
        result.current.connect('line001', 'line002')
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
      })

      act(() => {
        result.current.goto('v1', 'line002', 1.0)
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
    it('should clear vehicles and their queues but keep lines', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [400, 0] })
        result.current.addLine({ id: 'line002', start: [400, 0], end: [400, 300] })
        result.current.connect('line001', 'line002')
      })

      act(() => {
        result.current.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
        result.current.addVehicles({ id: 'v2', lineId: 'line002', position: 0 })
      })

      act(() => {
        result.current.goto('v1', 'line002', 1.0)
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

  describe('animation functions', () => {
    it('should have prepare, tick, reset, continueVehicle, isMoving', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      expect(typeof result.current.prepare).toBe('function')
      expect(typeof result.current.tick).toBe('function')
      expect(typeof result.current.reset).toBe('function')
      expect(typeof result.current.continueVehicle).toBe('function')
      expect(typeof result.current.isMoving).toBe('function')
    })

    it('isMoving should return false when no vehicles moving', () => {
      const { result } = renderHook(() => useVehicleSimulation({ wheelbase: 30 }))

      expect(result.current.isMoving()).toBe(false)
    })
  })
})
