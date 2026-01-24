import { useCallback, useMemo } from 'react'
import { useScene } from './useScene'
import { useVehicles } from './useVehicles'
import { useMovement } from './useMovement'
import type { SceneConfig, SceneLineInput, SceneConnectionInput, VehicleInput, MovementInput } from '../../core/types/api'
import type { Line, Curve } from '../../core/types/geometry'
import type { Vehicle, GotoCommand } from '../../core/types/vehicle'

/**
 * Warning types for edge case detection
 */
export interface VehiclePathWarning {
  type: 'vehicle_on_removed_line' | 'movement_queue_cleared' | 'orphaned_connection'
  message: string
  details?: {
    lineId?: string
    vehicleId?: string
    vehicleIds?: string[]
    connectionCount?: number
  }
}

/**
 * Result type with warnings for operations that may have side effects
 */
export interface OperationResult {
  success: boolean
  error?: string
  warnings?: VehiclePathWarning[]
}

export interface UseVehiclePathProps {
  wheelbase: number
}

export interface UseVehiclePathResult {
  // State
  lines: Line[]
  curves: Curve[]
  vehicles: Vehicle[]
  vehicleQueues: Map<string, GotoCommand[]>
  error: string | null

  // Scene operations
  setScene: (config: SceneConfig) => OperationResult
  addLine: (line: SceneLineInput) => OperationResult
  removeLine: (lineId: string) => OperationResult
  addConnection: (connection: SceneConnectionInput) => OperationResult
  removeConnection: (fromLineId: string, toLineId: string) => OperationResult
  clearScene: () => void

  // Vehicle operations
  addVehicle: (input: VehicleInput) => OperationResult
  removeVehicle: (vehicleId: string) => OperationResult
  clearVehicles: () => void

  // Movement operations
  queueMovement: (vehicleId: string, input: MovementInput) => OperationResult
  clearQueue: (vehicleId?: string) => OperationResult

  // Utility
  getVehiclesOnLine: (lineId: string) => Vehicle[]
  hasVehiclesOnLine: (lineId: string) => boolean
}

/**
 * Coordinated hook that combines useScene, useVehicles, and useMovement
 * with proper state synchronization and edge case handling.
 *
 * This hook handles scenarios like:
 * - Removing a line that has vehicles on it (warns and optionally removes vehicles)
 * - Removing a vehicle that has queued movements (clears the queue)
 * - Detecting orphaned connections when lines are removed
 *
 * @example
 * ```typescript
 * const {
 *   lines, curves, vehicles, vehicleQueues,
 *   setScene, addVehicle, queueMovement,
 *   removeLine, removeVehicle
 * } = useVehiclePath({ wheelbase: 30 })
 *
 * // Set up scene
 * setScene({
 *   lines: [
 *     { id: 'line001', start: [0, 0], end: [100, 0] },
 *     { id: 'line002', start: [100, 0], end: [100, 100] }
 *   ],
 *   connections: [{ from: 'line001', to: 'line002' }]
 * })
 *
 * // Add vehicle
 * addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
 *
 * // Queue movement
 * queueMovement('v1', { targetLineId: 'line002', targetPosition: 1.0 })
 *
 * // Remove line (will warn about vehicle)
 * const result = removeLine('line001')
 * if (result.warnings) {
 *   console.log('Warnings:', result.warnings)
 * }
 * ```
 */
export function useVehiclePath({ wheelbase }: UseVehiclePathProps): UseVehiclePathResult {
  const scene = useScene()
  const vehicleHook = useVehicles({ lines: scene.lines, wheelbase })
  const movement = useMovement({
    vehicles: vehicleHook.vehicles,
    lines: scene.lines,
    curves: scene.curves
  })

  // Utility: Get vehicles on a specific line
  const getVehiclesOnLine = useCallback((lineId: string): Vehicle[] => {
    return vehicleHook.vehicles.filter(v => v.lineId === lineId || v.rear.lineId === lineId)
  }, [vehicleHook.vehicles])

  // Utility: Check if any vehicles are on a line
  const hasVehiclesOnLine = useCallback((lineId: string): boolean => {
    return getVehiclesOnLine(lineId).length > 0
  }, [getVehiclesOnLine])

  // Coordinated setScene
  const setScene = useCallback((config: SceneConfig): OperationResult => {
    const result = scene.setScene(config)
    if (!result.success) {
      return { success: false, error: result.errors?.join('; ') }
    }

    // Clear vehicles and movements when scene is replaced
    vehicleHook.clear()
    movement.clearQueue()

    return { success: true }
  }, [scene, vehicleHook, movement])

  // Coordinated addLine
  const addLine = useCallback((line: SceneLineInput): OperationResult => {
    const result = scene.addLine(line)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Coordinated removeLine with warnings
  const removeLine = useCallback((lineId: string): OperationResult => {
    const warnings: VehiclePathWarning[] = []

    // Check for vehicles on this line
    const vehiclesOnLine = getVehiclesOnLine(lineId)
    if (vehiclesOnLine.length > 0) {
      warnings.push({
        type: 'vehicle_on_removed_line',
        message: `${vehiclesOnLine.length} vehicle(s) are on line '${lineId}'`,
        details: {
          lineId,
          vehicleIds: vehiclesOnLine.map(v => v.id)
        }
      })

      // Remove affected vehicles
      vehiclesOnLine.forEach(v => {
        vehicleHook.removeVehicle(v.id)
        movement.clearQueue(v.id)
      })
    }

    // Check for connections that reference this line
    const affectedConnections = scene.curves.filter(
      c => c.fromLineId === lineId || c.toLineId === lineId
    )
    if (affectedConnections.length > 0) {
      warnings.push({
        type: 'orphaned_connection',
        message: `${affectedConnections.length} connection(s) will be removed`,
        details: {
          lineId,
          connectionCount: affectedConnections.length
        }
      })
    }

    const result = scene.removeLine(lineId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [scene, getVehiclesOnLine, vehicleHook, movement])

  // Coordinated addConnection
  const addConnection = useCallback((connection: SceneConnectionInput): OperationResult => {
    const result = scene.addConnection(connection)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Coordinated removeConnection
  const removeConnection = useCallback((fromLineId: string, toLineId: string): OperationResult => {
    const result = scene.removeConnection(fromLineId, toLineId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Coordinated clearScene
  const clearScene = useCallback(() => {
    scene.clear()
    vehicleHook.clear()
    movement.clearQueue()
  }, [scene, vehicleHook, movement])

  // Coordinated addVehicle
  const addVehicle = useCallback((input: VehicleInput): OperationResult => {
    const result = vehicleHook.addVehicle(input)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [vehicleHook])

  // Coordinated removeVehicle with queue cleanup
  const removeVehicle = useCallback((vehicleId: string): OperationResult => {
    const warnings: VehiclePathWarning[] = []

    // Check if vehicle has queued movements
    const queue = movement.vehicleQueues.get(vehicleId)
    if (queue && queue.length > 0) {
      warnings.push({
        type: 'movement_queue_cleared',
        message: `${queue.length} queued movement(s) will be cleared for vehicle '${vehicleId}'`,
        details: {
          vehicleId
        }
      })

      // Clear the queue
      movement.clearQueue(vehicleId)
    }

    const result = vehicleHook.removeVehicle(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [vehicleHook, movement])

  // Coordinated clearVehicles
  const clearVehicles = useCallback(() => {
    vehicleHook.clear()
    movement.clearQueue()
  }, [vehicleHook, movement])

  // Coordinated queueMovement
  const queueMovement = useCallback((vehicleId: string, input: MovementInput): OperationResult => {
    const result = movement.queueMovement(vehicleId, input)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movement])

  // Coordinated clearQueue
  const clearQueue = useCallback((vehicleId?: string): OperationResult => {
    const result = movement.clearQueue(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movement])

  // Combined error state
  const error = useMemo(() => {
    return scene.error || vehicleHook.error || movement.error
  }, [scene.error, vehicleHook.error, movement.error])

  return {
    // State
    lines: scene.lines,
    curves: scene.curves,
    vehicles: vehicleHook.vehicles,
    vehicleQueues: movement.vehicleQueues,
    error,

    // Scene operations
    setScene,
    addLine,
    removeLine,
    addConnection,
    removeConnection,
    clearScene,

    // Vehicle operations
    addVehicle,
    removeVehicle,
    clearVehicles,

    // Movement operations
    queueMovement,
    clearQueue,

    // Utility
    getVehiclesOnLine,
    hasVehiclesOnLine
  }
}
