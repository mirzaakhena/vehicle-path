import type { VehiclePathState, PathExecution } from '../engine'
import type { Line } from '../types/geometry'
import type { AxleState } from '../types/vehicle'
import type { AxleExecutionState } from '../types/movement'
import { getCumulativeArcLength, moveVehicle } from './vehicleMovement'

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

// =============================================================================
// moveVehicleWithAcceleration — Top-level function (Experimental)
// =============================================================================

/**
 * Gerakkan vehicle per tick dengan efek acceleration dan deceleration.
 *
 * Versi eksperimental dari PathEngine.moveVehicle yang menambahkan:
 * - Startup acceleration: kendaraan mulai dari berhenti dan mempercepat
 * - Pre-curve deceleration: melambat sebelum memasuki curve
 * - Arrival deceleration: melambat hingga berhenti total di tujuan
 *
 * Tidak memodifikasi PathEngine atau moveVehicle yang sudah ada.
 *
 * @param state      - Posisi vehicle saat ini
 * @param execution  - Rencana rute (dari preparePath atau tick sebelumnya)
 * @param accelState - State kecepatan saat ini (simpan antar tick)
 * @param config     - Parameter acceleration/deceleration
 * @param deltaTime  - Durasi frame dalam detik (misal: 1/60 untuk 60fps)
 * @param linesMap   - Map dari line ID ke Line object (buat dari engine.lines)
 */
export function moveVehicleWithAcceleration(
  state: VehiclePathState,
  execution: PathExecution,
  accelState: AccelerationState,
  config: AccelerationConfig,
  deltaTime: number,
  linesMap: Map<string, Line>
): {
  state: VehiclePathState
  execution: PathExecution
  accelState: AccelerationState
  arrived: boolean
} {
  const distToArrival = computeRemainingToArrival(execution)
  const distToNextCurve = computeDistToNextCurve(execution)
  const targetSpeed = computeTargetSpeed(distToArrival, distToNextCurve, config)
  const newSpeed = approachSpeed(
    accelState.currentSpeed,
    targetSpeed,
    config.acceleration,
    config.deceleration,
    deltaTime
  )
  const distance = newSpeed * deltaTime

  const axleStates: AxleState[] = state.axles.map(a => ({
    lineId: a.lineId,
    position: a.position,
    absoluteOffset: a.offset,
  }))
  const axleExecs: AxleExecutionState[] = execution.axleExecutions.map(e => ({
    currentSegmentIndex: e.segmentIndex,
    segmentDistance: e.segmentDistance,
  }))

  const result = moveVehicle(axleStates, axleExecs, execution.path, distance, linesMap, execution.curveDataMap)

  return {
    state: {
      axles: result.axles.map(a => ({ lineId: a.lineId, offset: a.absoluteOffset, position: a.position })),
      axleSpacings: state.axleSpacings,
    },
    execution: {
      ...execution,
      axleExecutions: result.axleExecutions.map(e => ({
        segmentIndex: e.currentSegmentIndex,
        segmentDistance: e.segmentDistance,
      })),
    },
    accelState: { currentSpeed: newSpeed },
    arrived: result.arrived,
  }
}
