/**
 * API Input Types
 *
 * These types define the simplified input format for the programmatic API.
 * They are designed to be more ergonomic than the internal types.
 */

// =============================================================================
// Scene API Types
// =============================================================================

/**
 * Simple coordinate input - can be [x, y] tuple or {x, y} object
 */
export type CoordinateInput = [number, number] | { x: number; y: number }

/**
 * Line definition for Scene API
 *
 * @example
 * { id: 'line001', start: [100, 100], end: [500, 100] }
 * { id: 'line002', start: { x: 500, y: 100 }, end: { x: 500, y: 400 } }
 */
export interface SceneLineInput {
  id: string
  start: CoordinateInput
  end: CoordinateInput
}

/**
 * Connection (curve) definition for Scene API
 *
 * @example
 * { from: 'line001', to: 'line002' }
 * { from: 'line001', fromPosition: 0.8, to: 'line002', toPosition: 0.2 }
 * { from: 'line001', fromPosition: 150, fromIsPercentage: false, to: 'line002', toPosition: 50, toIsPercentage: false }
 */
export interface SceneConnectionInput {
  from: string
  fromPosition?: number       // position value, defaults to end of line
  fromIsPercentage?: boolean  // if true, fromPosition is 0-1 percentage; if false, absolute distance. Defaults to true
  to: string
  toPosition?: number         // position value, defaults to start of line
  toIsPercentage?: boolean    // if true, toPosition is 0-1 percentage; if false, absolute distance. Defaults to true
}

/**
 * Full scene configuration for setScene()
 *
 * @example
 * setScene({
 *   lines: [
 *     { id: 'line001', start: [100, 100], end: [500, 100] },
 *     { id: 'line002', start: [500, 100], end: [500, 400] }
 *   ],
 *   connections: [
 *     { from: 'line001', to: 'line002' }
 *   ]
 * })
 */
export interface SceneConfig {
  lines: SceneLineInput[]
  connections?: SceneConnectionInput[]
}

// =============================================================================
// Vehicle API Types
// =============================================================================

/**
 * Vehicle creation input for addVehicle()
 *
 * @example
 * addVehicle({ id: 'v1', lineId: 'line001' })  // position defaults to 0 (start)
 * addVehicle({ id: 'v2', lineId: 'line002', position: 0.5 })  // 50% of line
 * addVehicle({ id: 'v3', lineId: 'line003', position: 150, isPercentage: false })  // absolute 150
 */
export interface VehicleInput {
  id: string
  lineId: string
  position?: number      // position value, defaults to 0 (start of line)
  isPercentage?: boolean // if true, position is 0-1 percentage; if false, absolute distance. Defaults to true
}

// =============================================================================
// Movement API Types
// =============================================================================

/**
 * Input for goto/queueMovement commands (API-friendly version of GotoCommand)
 *
 * @example
 * queueMovement('v1', { targetLineId: 'line002' })  // targetPosition defaults to 1.0 (end)
 * queueMovement('v1', { targetLineId: 'line002', targetPosition: 0.5 })  // 50% of line
 * queueMovement('v1', {
 *   targetLineId: 'line002',
 *   targetPosition: 0.5,
 *   wait: true,
 *   payload: { orderId: '123' }
 * })
 * queueMovement('v1', { targetLineId: 'line002', targetPosition: 150, isPercentage: false })
 */
export interface GotoCommandInput {
  targetLineId: string
  targetPosition?: number    // position value on target line, defaults to 1.0 (end of line)
  isPercentage?: boolean     // if true, targetPosition is 0-1 percentage; if false, absolute distance. Defaults to true
  wait?: boolean             // pause after reaching destination
  payload?: unknown          // custom data to pass through
}

