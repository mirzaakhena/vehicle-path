/**
 * Re-export all types from a single entry point
 *
 * Usage:
 *   import type { Point, Line, Vehicle } from '../types'
 *   // or
 *   import type { Point } from '../types/core'
 */

// Core geometry types
export type { Point, Line, BezierCurve, Curve } from './core'

// Vehicle types
export type {
  VehicleState,
  VehicleStart,
  Vehicle,
  AxleState,
  GotoCommand,
  GotoCompletionInfo,
  GotoCompletionCallback
} from './vehicle'

// Movement state types
export type {
  CurveData,
  PathExecutionState,
  VehicleMovementState,
  MovementConfig,
  SceneDefinition,
  SceneContext
} from './movement'

// Configuration types
export type { TangentMode } from './config'

// API input types (for programmatic API)
export type {
  CoordinateInput,
  SceneLineInput,
  SceneConnectionInput,
  SceneConfig,
  VehicleInput,
  MovementInput,
  ApiResult
} from './api'
