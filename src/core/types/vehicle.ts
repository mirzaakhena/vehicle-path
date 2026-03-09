/**
 * Vehicle-related types
 */

import type { Point } from './geometry'

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
  /** Optional: defaults to [maxWheelbase] jika tidak disediakan */
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
export interface Vehicle {
  id: string
  // Initial configuration (for rearmost axle)
  lineId: string
  offset: number
  isPercentage: boolean
  // Runtime state
  state: VehicleState
  // Multi-axle: axles[0] = terdepan, axles[N-1] = paling belakang
  axles: AxleState[]
  // N-1 jarak antar axle berurutan, axleSpacings[i] = jarak axles[i] ke axles[i+1]
  axleSpacings: number[]
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
