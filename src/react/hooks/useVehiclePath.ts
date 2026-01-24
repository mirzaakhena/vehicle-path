import { useCallback, useMemo } from 'react'
import { useScene } from './useScene'
import { useVehicles } from './useVehicles'
import { useMovementQueue } from './useMovementQueue'
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
 * @deprecated Use `useVehicleSimulation` instead. This hook will be removed in a future version.
 * The new hook provides a cleaner API with simplified methods like `connect()`, `goto()`,
 * and `loadFromDSL()` for loading DSL definitions.
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
  const movementQueue = useMovementQueue({
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
    movementQueue.clearQueue()

    return { success: true }
  }, [scene, vehicleHook, movementQueue])

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
        movementQueue.clearQueue(v.id)
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
  }, [scene, getVehiclesOnLine, vehicleHook, movementQueue])

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
    movementQueue.clearQueue()
  }, [scene, vehicleHook, movementQueue])

  // Coordinated addVehicle
  const addVehicle = useCallback((input: VehicleInput): OperationResult => {
    const result = vehicleHook.addVehicles(input)
    if (!result.success) {
      return { success: false, error: result.errors?.join('; ') }
    }
    return { success: true }
  }, [vehicleHook])

  // Coordinated removeVehicle with queue cleanup
  const removeVehicle = useCallback((vehicleId: string): OperationResult => {
    const warnings: VehiclePathWarning[] = []

    // Check if vehicle has queued movements
    const queue = movementQueue.vehicleQueues.get(vehicleId)
    if (queue && queue.length > 0) {
      warnings.push({
        type: 'movement_queue_cleared',
        message: `${queue.length} queued movement(s) will be cleared for vehicle '${vehicleId}'`,
        details: {
          vehicleId
        }
      })

      // Clear the queue
      movementQueue.clearQueue(vehicleId)
    }

    const result = vehicleHook.removeVehicle(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [vehicleHook, movementQueue])

  // Coordinated clearVehicles
  const clearVehicles = useCallback(() => {
    vehicleHook.clear()
    movementQueue.clearQueue()
  }, [vehicleHook, movementQueue])

  // Coordinated queueMovement
  const queueMovement = useCallback((vehicleId: string, input: MovementInput): OperationResult => {
    const result = movementQueue.queueMovement(vehicleId, input)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movementQueue])

  // Coordinated clearQueue
  const clearQueue = useCallback((vehicleId?: string): OperationResult => {
    const result = movementQueue.clearQueue(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movementQueue])

  // Combined error state
  const error = useMemo(() => {
    return scene.error || vehicleHook.error || movementQueue.error
  }, [scene.error, vehicleHook.error, movementQueue.error])

  return {
    // State
    lines: scene.lines,
    curves: scene.curves,
    vehicles: vehicleHook.vehicles,
    vehicleQueues: movementQueue.vehicleQueues,
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
