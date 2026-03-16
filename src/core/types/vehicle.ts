/**
 * Vehicle-related types
 */

import type { Point } from './geometry'

/**
 * Base definition of a vehicle's physical structure.
 * Client code is free to extend this with additional fields (id, name, color, etc).
 *
 * @example
 * interface MyVehicle extends VehicleDefinition { id: string; name: string }
 */
export interface VehicleDefinition {
  /** N-1 arc-length spacings between consecutive axles. axleSpacings[i] = distance from axles[i] to axles[i+1]. */
  axleSpacings: number[]
}

/**
 * Animation state for a vehicle
 */
export type VehicleState = 'idle' | 'moving' | 'waiting'

/**
 * Vehicle start position (input from text parsing)
 */
export interface VehicleStart {
  vehicleId: string
  lineId: string
  offset: number
  isPercentage: boolean
  /** axleSpacings[i] = arc-length antara axles[i] dan axles[i+1]. Default: [] (1 axle) */
  axleSpacings?: number[]
}

/**
 * State for a single axle (Front or Rear)
 */
export interface AxleState {
  lineId: string
  position: Point
  absoluteOffset: number
}

/**
 * Vehicle with runtime state (used during animation)
 */
export interface Vehicle extends VehicleDefinition {
  id: string
  // Initial configuration (for rearmost axle)
  lineId: string
  offset: number
  isPercentage: boolean
  // Runtime state
  state: VehicleState
  // Multi-axle: axles[0] = terdepan, axles[N-1] = paling belakang
  axles: AxleState[]
}

/**
 * Command to move a vehicle to a target position
 */
export interface GotoCommand {
  vehicleId: string
  targetLineId: string
  targetOffset: number
  isPercentage: boolean
  payload?: unknown
}

/**
 * Information provided when a goto command completes
 */
export interface GotoCompletionInfo {
  vehicleId: string
  command: GotoCommand
  finalPosition: {
    lineId: string
    absoluteOffset: number
    position: Point
  }
  payload?: unknown
}

/**
 * Callback type for goto command completion
 */
export type GotoCompletionCallback = (info: GotoCompletionInfo) => void

/**
 * Info when a command starts execution
 */
export interface CommandStartInfo {
  vehicleId: string
  command: GotoCommand
  commandIndex: number
  startPosition: {
    lineId: string
    absoluteOffset: number
    position: Point
  }
}
