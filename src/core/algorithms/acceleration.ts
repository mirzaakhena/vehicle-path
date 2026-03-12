import type { PathExecution } from '../engine'
import { getCumulativeArcLength } from './vehicleMovement'

// =============================================================================
// Types
// =============================================================================

/**
 * Konfigurasi acceleration/deceleration untuk vehicle.
 * Nilai-nilai ini bersifat global (sama untuk semua segmen path).
 */
export interface AccelerationConfig {
  /** px/s² — laju percepatan dari berhenti menuju maxSpeed */
  acceleration: number
  /** px/s² — laju perlambatan (digunakan untuk curve dan arrival) */
  deceleration: number
  /** px/s — kecepatan maksimum di garis lurus */
  maxSpeed: number
  /** px/s — kecepatan minimum saat memasuki curve (tidak berhenti total) */
  minCurveSpeed: number
}

/**
 * State kecepatan kendaraan saat ini.
 * Caller menyimpan ini di luar dan meneruskan ke setiap tick.
 */
export interface AccelerationState {
  /** Kecepatan kendaraan saat ini dalam px/s */
  currentSpeed: number
}

// =============================================================================
// Utility Functions (Pure)
// =============================================================================

/**
 * Hitung jarak tersisa dari posisi rear axle ke akhir path (tujuan).
 */
export function computeRemainingToArrival(execution: PathExecution): number {
  const rearExec = execution.axleExecutions[execution.axleExecutions.length - 1]
  const traveled = getCumulativeArcLength(
    execution.path,
    rearExec.segmentIndex,
    rearExec.segmentDistance
  )
  return Math.max(0, execution.path.totalDistance - traveled)
}

/**
 * Hitung jarak dari posisi rear axle ke awal segment curve berikutnya di path.
 * Return 0 jika rear axle sudah berada di dalam curve.
 * Return null jika tidak ada curve lagi di depan.
 */
export function computeDistToNextCurve(execution: PathExecution): number | null {
  const rearExec = execution.axleExecutions[execution.axleExecutions.length - 1]
  const currentArcLength = getCumulativeArcLength(
    execution.path,
    rearExec.segmentIndex,
    rearExec.segmentDistance
  )

  let segStartArcLength = 0
  for (let i = 0; i < execution.path.segments.length; i++) {
    const seg = execution.path.segments[i]

    if (i >= rearExec.segmentIndex && seg.type === 'curve') {
      return Math.max(0, segStartArcLength - currentArcLength)
    }

    segStartArcLength += seg.length
  }

  return null
}

/**
 * Hitung target speed berdasarkan lookahead jarak ke arrival dan curve.
 *
 * Menggunakan formula fisika: v = sqrt(2 * a * d)
 * - Arrival: target = sqrt(2 * decel * distToArrival) → berhenti di tujuan
 * - Curve: target = sqrt(minCurveSpeed² + 2 * decel * distToNextCurve) → capai minCurveSpeed di curve
 * - Batas atas: maxSpeed
 */
export function computeTargetSpeed(
  distToArrival: number,
  distToNextCurve: number | null,
  config: AccelerationConfig
): number {
  let target = config.maxSpeed

  const arrivalTarget = Math.sqrt(2 * config.deceleration * Math.max(0, distToArrival))
  target = Math.min(target, arrivalTarget)

  if (distToNextCurve !== null) {
    const curveTarget = Math.sqrt(
      config.minCurveSpeed ** 2 + 2 * config.deceleration * distToNextCurve
    )
    target = Math.min(target, curveTarget)
  }

  return Math.max(0, target)
}

/**
 * Sesuaikan kecepatan saat ini menuju target dengan laju acceleration/deceleration.
 */
export function approachSpeed(
  current: number,
  target: number,
  acceleration: number,
  deceleration: number,
  deltaTime: number
): number {
  if (current < target) return Math.min(target, current + acceleration * deltaTime)
  if (current > target) return Math.max(target, current - deceleration * deltaTime)
  return current
}
