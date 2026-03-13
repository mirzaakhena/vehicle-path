# Vehicle Acceleration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah fitur acceleration/deceleration eksperimental pada vehicle movement, terisolir dalam file baru tanpa mengubah `moveVehicle` atau fungsi yang sudah ada.

**Architecture:** Buat file baru `src/core/algorithms/acceleration.ts` yang mengandung semua logic acceleration sebagai pure functions + satu fungsi top-level `moveVehicleWithAcceleration`. File ini mengimpor `moveVehicle` dan `getCumulativeArcLength` dari `vehicleMovement.ts` tanpa memodifikasinya. PathEngine, vehicleMovement.ts, dan semua file yang sudah ada **tidak diubah sama sekali**.

**Tech Stack:** TypeScript, Vitest (test framework), lib internal `vehicle-path2`

---

## Konteks Penting

### Konvensi array
- `axles[0]` = terdepan (front)
- `axles[N-1]` = paling belakang (rear) — ini adalah titik acuan pergerakan
- `axleExecutions[N-1]` = execution state untuk rear axle

### Struktur tipe kunci

```typescript
// PathResult (dari pathFinding.ts)
interface PathResult {
  segments: PathSegment[]   // array segment 'line' | 'curve'
  totalDistance: number     // total panjang path (px)
  curveCount: number
}

interface PathSegment {
  type: 'line' | 'curve'
  lineId?: string
  curveIndex?: number
  startOffset: number
  endOffset: number
  length: number
}

// PathExecution (dari engine.ts)
interface PathExecution {
  path: PathResult
  curveDataMap: Map<number, CurveData>
  axleExecutions: Array<{ segmentIndex: number; segmentDistance: number }>
  targetLineId: string
  targetOffset: number
}

// VehiclePathState (dari engine.ts)
interface VehiclePathState extends VehicleDefinition {
  axles: Array<{ lineId: string; offset: number; position: Point }>
}
```

### Fungsi yang akan digunakan dari vehicleMovement.ts (tidak dimodifikasi)

```typescript
// Sudah di-export dari vehicleMovement.ts:
getCumulativeArcLength(path, segmentIndex, segmentDistance): number
moveVehicle(axleStates, axleExecs, path, distance, linesMap, curveDataMap): { axles, axleExecutions, arrived }
```

### Konversi tipe (pola yang sama seperti PathEngine.moveVehicle)

```typescript
// VehiclePathState → raw types untuk moveVehicle
const axleStates: AxleState[] = state.axles.map(a => ({
  lineId: a.lineId, position: a.position, absoluteOffset: a.offset
}))
const axleExecs: AxleExecutionState[] = execution.axleExecutions.map(e => ({
  currentSegmentIndex: e.segmentIndex, segmentDistance: e.segmentDistance
}))

// raw types → VehiclePathState kembali
state: {
  axles: result.axles.map(a => ({ lineId: a.lineId, offset: a.absoluteOffset, position: a.position })),
  axleSpacings: state.axleSpacings
}
execution: {
  ...execution,
  axleExecutions: result.axleExecutions.map(e => ({
    segmentIndex: e.currentSegmentIndex, segmentDistance: e.segmentDistance
  }))
}
```

---

## File yang akan dibuat/dimodifikasi

| File | Aksi | Tanggung Jawab |
|------|------|----------------|
| `src/core/algorithms/acceleration.ts` | **Buat baru** | Semua logic acceleration: types, pure functions, `moveVehicleWithAcceleration` |
| `src/core/algorithms/acceleration.test.ts` | **Buat baru** | Unit test + integration test |
| `src/core/index.ts` | **Modifikasi** | Export types dan fungsi baru |

**Tidak dimodifikasi:** `engine.ts`, `vehicleMovement.ts`, `pathFinding.ts`, semua file yang sudah ada lainnya.

---

## Task 1: Types + Pure Utility Functions

Empat pure functions yang bisa ditest secara unit tanpa real engine.

**Files:**
- Create: `src/core/algorithms/acceleration.ts`
- Create: `src/core/algorithms/acceleration.test.ts`

### Step 1.1: Tulis failing tests untuk utility functions

Buat file `src/core/algorithms/acceleration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { PathResult } from './pathFinding'
import type { PathExecution } from '../engine'
import {
  computeRemainingToArrival,
  computeDistToNextCurve,
  computeTargetSpeed,
  approachSpeed
} from './acceleration'

// ─── Mock helpers ─────────────────────────────────────────────────────────

function makePath(segments: Array<{ type: 'line' | 'curve'; length: number }>): PathResult {
  let total = 0
  const segs = segments.map((s, i) => {
    const seg = {
      type: s.type,
      lineId: s.type === 'line' ? `L${i}` : undefined,
      curveIndex: s.type === 'curve' ? i : undefined,
      startOffset: 0,
      endOffset: s.length,
      length: s.length,
    }
    total += s.length
    return seg
  })
  return { segments: segs, totalDistance: total, curveCount: segs.filter(s => s.type === 'curve').length }
}

function makeExecution(path: PathResult, segIdx: number, segDist: number): PathExecution {
  return {
    path,
    curveDataMap: new Map(),
    // Single entry = rear axle (axleExecutions[N-1])
    axleExecutions: [{ segmentIndex: segIdx, segmentDistance: segDist }],
    targetLineId: 'L_target',
    targetOffset: 0,
  }
}

// ─── computeRemainingToArrival ─────────────────────────────────────────────

describe('computeRemainingToArrival', () => {
  const path = makePath([{ type: 'line', length: 100 }, { type: 'line', length: 100 }]) // total 200

  it('returns totalDistance when rear axle belum bergerak (segIdx=0, dist=0)', () => {
    const exec = makeExecution(path, 0, 0)
    expect(computeRemainingToArrival(exec)).toBeCloseTo(200)
  })

  it('returns 0 ketika rear axle sudah di ujung path', () => {
    const exec = makeExecution(path, 1, 100) // segIdx=1, dist=100 → sudah di akhir
    expect(computeRemainingToArrival(exec)).toBeCloseTo(0)
  })

  it('returns sisa jarak ketika rear axle di tengah', () => {
    // segIdx=0, dist=50 → traveled=50, remaining=150
    const exec = makeExecution(path, 0, 50)
    expect(computeRemainingToArrival(exec)).toBeCloseTo(150)
  })

  it('returns sisa jarak ketika rear axle di segment kedua', () => {
    // segIdx=1, dist=30 → traveled=130, remaining=70
    const exec = makeExecution(path, 1, 30)
    expect(computeRemainingToArrival(exec)).toBeCloseTo(70)
  })
})

// ─── computeDistToNextCurve ────────────────────────────────────────────────

describe('computeDistToNextCurve', () => {
  it('returns null jika tidak ada curve dalam path', () => {
    const path = makePath([{ type: 'line', length: 100 }, { type: 'line', length: 100 }])
    const exec = makeExecution(path, 0, 0)
    expect(computeDistToNextCurve(exec)).toBeNull()
  })

  it('returns 0 jika rear axle sedang berada di dalam curve', () => {
    // path: line(100) → curve(50) → line(100)
    const path = makePath([
      { type: 'line', length: 100 },
      { type: 'curve', length: 50 },
      { type: 'line', length: 100 },
    ])
    // Rear axle di segIdx=1 (curve), sudah masuk 10px
    const exec = makeExecution(path, 1, 10)
    expect(computeDistToNextCurve(exec)).toBe(0)
  })

  it('returns jarak dari posisi saat ini ke awal curve berikutnya', () => {
    // path: line(100) → curve(50) → line(100)
    const path = makePath([
      { type: 'line', length: 100 },
      { type: 'curve', length: 50 },
      { type: 'line', length: 100 },
    ])
    // Rear axle di segIdx=0 (line), sudah 60px → sisa di line ini = 40px ke kurva
    const exec = makeExecution(path, 0, 60)
    expect(computeDistToNextCurve(exec)).toBeCloseTo(40)
  })

  it('returns 0 jika rear axle tepat di awal curve', () => {
    const path = makePath([
      { type: 'line', length: 100 },
      { type: 'curve', length: 50 },
    ])
    // Rear axle tepat di segIdx=1, dist=0
    const exec = makeExecution(path, 1, 0)
    expect(computeDistToNextCurve(exec)).toBe(0)
  })

  it('returns null jika curve sudah terlewati (hanya ada line setelah posisi saat ini)', () => {
    // path: curve(50) → line(100)
    const path = makePath([
      { type: 'curve', length: 50 },
      { type: 'line', length: 100 },
    ])
    // Rear axle sudah di segIdx=1 (line setelah curve)
    const exec = makeExecution(path, 1, 20)
    expect(computeDistToNextCurve(exec)).toBeNull()
  })
})

// ─── computeTargetSpeed ────────────────────────────────────────────────────

describe('computeTargetSpeed', () => {
  const config = {
    acceleration: 50,
    deceleration: 100,
    maxSpeed: 200,
    minCurveSpeed: 50,
  }

  it('returns maxSpeed ketika jauh dari arrival dan tidak ada curve', () => {
    // Braking distance dari 200 px/s ke 0: v²/(2a) = 200²/(2*100) = 200px
    // Jika distToArrival > 200, target = maxSpeed
    expect(computeTargetSpeed(500, null, config)).toBeCloseTo(config.maxSpeed)
  })

  it('returns 0 ketika distToArrival = 0', () => {
    expect(computeTargetSpeed(0, null, config)).toBeCloseTo(0)
  })

  it('returns nilai antara 0 dan maxSpeed saat mendekati arrival', () => {
    // distToArrival = 50px (kurang dari braking distance 200px)
    const target = computeTargetSpeed(50, null, config)
    expect(target).toBeGreaterThan(0)
    expect(target).toBeLessThan(config.maxSpeed)
  })

  it('physics: target speed = sqrt(2 * decel * distToArrival) saat approaching arrival', () => {
    const distToArrival = 50
    const expected = Math.sqrt(2 * config.deceleration * distToArrival)
    expect(computeTargetSpeed(distToArrival, null, config)).toBeCloseTo(expected)
  })

  it('returns maxSpeed ketika distToNextCurve besar', () => {
    // Curve braking distance dari 200 ke 50: (200²-50²)/(2*100) = (40000-2500)/200 = 187.5px
    // Jika distToNextCurve > 187.5, curve tidak mempengaruhi
    expect(computeTargetSpeed(10000, 300, config)).toBeCloseTo(config.maxSpeed)
  })

  it('returns minCurveSpeed ketika distToNextCurve = 0 (sudah di curve)', () => {
    // distToNextCurve=0 → target = sqrt(minCurveSpeed² + 2*decel*0) = minCurveSpeed
    expect(computeTargetSpeed(10000, 0, config)).toBeCloseTo(config.minCurveSpeed)
  })

  it('arrival deceleration lebih prioritas dari curve jika lebih ketat', () => {
    // distToArrival kecil banget (target hampir 0) vs distToNextCurve besar
    const target = computeTargetSpeed(1, 200, config)
    expect(target).toBeLessThan(config.minCurveSpeed)
  })
})

// ─── approachSpeed ─────────────────────────────────────────────────────────

describe('approachSpeed', () => {
  it('accelerates toward target', () => {
    // current=0, target=200, accel=50/s, dt=1s → new = min(200, 0+50) = 50
    expect(approachSpeed(0, 200, 50, 100, 1)).toBeCloseTo(50)
  })

  it('decelerates toward target', () => {
    // current=200, target=50, decel=100/s, dt=1s → new = max(50, 200-100) = 100
    expect(approachSpeed(200, 50, 50, 100, 1)).toBeCloseTo(100)
  })

  it('does not overshoot target when accelerating', () => {
    // current=190, target=200, accel=50/s, dt=1s → should clamp at 200
    expect(approachSpeed(190, 200, 50, 100, 1)).toBeCloseTo(200)
  })

  it('does not overshoot target when decelerating', () => {
    // current=60, target=50, decel=100/s, dt=1s → should clamp at 50
    expect(approachSpeed(60, 50, 50, 100, 1)).toBeCloseTo(50)
  })

  it('returns same speed when already at target', () => {
    expect(approachSpeed(100, 100, 50, 100, 1)).toBe(100)
  })

  it('scales with deltaTime', () => {
    // dt=0.5s: current=0, accel=50 → new = 25
    expect(approachSpeed(0, 200, 50, 100, 0.5)).toBeCloseTo(25)
  })
})
```

- [ ] **Step 1.2: Jalankan tests untuk verifikasi gagal**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run src/core/algorithms/acceleration.test.ts
```

Expected: ERROR — `Cannot find module './acceleration'`

- [ ] **Step 1.3: Implementasi types + pure functions**

Buat file `src/core/algorithms/acceleration.ts`:

```typescript
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
 *
 * Menggunakan rear axle (axleExecutions[N-1]) sebagai titik acuan,
 * konsisten dengan konvensi library: arrived = rear axle mencapai targetOffset.
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
 *
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
      // Jarak dari posisi saat ini ke awal segment curve ini
      // Jika i === segmentIndex (sudah di dalam curve), hasilnya <= 0 → dikembalikan sebagai 0
      return Math.max(0, segStartArcLength - currentArcLength)
    }

    segStartArcLength += seg.length
  }

  return null // Tidak ada curve di depan
}

/**
 * Hitung target speed berdasarkan lookahead jarak ke arrival dan curve.
 *
 * Menggunakan formula fisika: v = sqrt(2 * a * d) untuk menentukan
 * kecepatan yang tepat agar kendaraan bisa berhenti/melambat di waktu yang tepat.
 *
 * Target speed = minimum dari:
 * - Arrival deceleration: sqrt(2 * decel * distToArrival) → berhenti di tujuan
 * - Curve deceleration: sqrt(minCurveSpeed² + 2 * decel * distToNextCurve) → capai minCurveSpeed di curve
 * - maxSpeed (batas atas)
 */
export function computeTargetSpeed(
  distToArrival: number,
  distToNextCurve: number | null,
  config: AccelerationConfig
): number {
  // Batas atas: maxSpeed
  let target = config.maxSpeed

  // Arrival: decelerate to 0
  // Pada jarak distToArrival, kecepatan aman = sqrt(2 * decel * dist)
  const arrivalTarget = Math.sqrt(2 * config.deceleration * Math.max(0, distToArrival))
  target = Math.min(target, arrivalTarget)

  // Curve: decelerate to minCurveSpeed
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
 *
 * @param current - Kecepatan saat ini (px/s)
 * @param target  - Kecepatan target (px/s)
 * @param acceleration - Laju percepatan positif (px/s²)
 * @param deceleration - Laju perlambatan positif (px/s²)
 * @param deltaTime - Waktu frame dalam detik
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
```

- [ ] **Step 1.4: Jalankan tests**

```bash
npx vitest run src/core/algorithms/acceleration.test.ts
```

Expected: Semua tests PASS.

- [ ] **Step 1.5: Commit**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
git add src/core/algorithms/acceleration.ts src/core/algorithms/acceleration.test.ts
git commit -m "feat: add acceleration utility types and pure functions"
```

---

## Task 2: `moveVehicleWithAcceleration` Function + Integration Test

**Files:**
- Modify: `src/core/algorithms/acceleration.ts` (tambah fungsi baru di bawah)
- Modify: `src/core/algorithms/acceleration.test.ts` (tambah integration test di bawah)

### Step 2.1: Tambah integration test di `acceleration.test.ts`

Tambahkan di bagian bawah file test (setelah semua describe yang ada):

```typescript
// ─── Imports tambahan untuk integration test ──────────────────────────────
// PathExecution sudah diimport di Task 1. Cukup tambahkan:
import { PathEngine } from '../engine'
import type { VehiclePathState } from '../engine'
import { moveVehicleWithAcceleration } from './acceleration'

// ─── moveVehicleWithAcceleration (integration) ─────────────────────────────

describe('moveVehicleWithAcceleration', () => {
  // Setup scene: L1(400px) → curve → L2(400px)
  // Kendaraan dimulai di L1, tujuan di ujung L2
  function makeScene() {
    const engine = new PathEngine({ maxWheelbase: 200, tangentMode: 'proportional-40' })
    engine.setScene(
      [
        { id: 'L1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
        { id: 'L2', start: { x: 400, y: 0 }, end: { x: 800, y: 0 } },
      ],
      [
        {
          fromLineId: 'L1', toLineId: 'L2',
          fromOffset: 1.0, fromIsPercentage: true,
          toOffset: 0.0, toIsPercentage: true,
        },
      ]
    )
    return engine
  }

  const vehicle = { axleSpacings: [40] } // 2 axle, jarak 40px

  const accelConfig: import('./acceleration').AccelerationConfig = {
    acceleration: 200,   // px/s²
    deceleration: 300,   // px/s²
    maxSpeed: 300,       // px/s
    minCurveSpeed: 60,   // px/s
  }

  // Helper: buat linesMap dari engine (diperlukan oleh moveVehicleWithAcceleration)
  function makeLinesMap(engine: ReturnType<typeof makeScene>) {
    return new Map(engine.lines.map(l => [l.id, l]))
  }

  it('kendaraan akhirnya tiba di tujuan', () => {
    const engine = makeScene()
    const linesMap = makeLinesMap(engine)
    let state = engine.initializeVehicle('L1', 0, vehicle)!
    let execution = engine.preparePath(state, 'L2', 1.0, true)!
    let accelState: import('./acceleration').AccelerationState = { currentSpeed: 0 }

    let arrived = false
    for (let i = 0; i < 5000 && !arrived; i++) {
      const result = moveVehicleWithAcceleration(state, execution, accelState, accelConfig, 1 / 60, linesMap)
      state = result.state
      execution = result.execution
      accelState = result.accelState
      arrived = result.arrived
    }

    expect(arrived).toBe(true)
  })

  it('kecepatan dimulai dari 0 dan bertambah di tick pertama', () => {
    const engine = makeScene()
    const linesMap = makeLinesMap(engine)
    const state = engine.initializeVehicle('L1', 0, vehicle)!
    const execution = engine.preparePath(state, 'L2', 1.0, true)!
    const accelState: import('./acceleration').AccelerationState = { currentSpeed: 0 }

    const result = moveVehicleWithAcceleration(state, execution, accelState, accelConfig, 1 / 60, linesMap)

    // Setelah tick pertama, kecepatan harus > 0
    expect(result.accelState.currentSpeed).toBeGreaterThan(0)
    // Belum arrived (path masih panjang)
    expect(result.arrived).toBe(false)
  })

  it('kecepatan tidak pernah melebihi maxSpeed', () => {
    const engine = makeScene()
    const linesMap = makeLinesMap(engine)
    let state = engine.initializeVehicle('L1', 0, vehicle)!
    let execution = engine.preparePath(state, 'L2', 1.0, true)!
    let accelState: import('./acceleration').AccelerationState = { currentSpeed: 0 }

    let arrived = false
    for (let i = 0; i < 5000 && !arrived; i++) {
      const result = moveVehicleWithAcceleration(state, execution, accelState, accelConfig, 1 / 60, linesMap)
      state = result.state
      execution = result.execution
      accelState = result.accelState
      arrived = result.arrived
      // Kecepatan tidak boleh melebihi maxSpeed
      expect(accelState.currentSpeed).toBeLessThanOrEqual(accelConfig.maxSpeed + 0.01)
    }
  })

  it('kecepatan melambat saat mendekati tujuan', () => {
    const engine = makeScene()
    const linesMap = makeLinesMap(engine)
    let state = engine.initializeVehicle('L1', 0, vehicle)!
    let execution = engine.preparePath(state, 'L2', 1.0, true)!
    let accelState: import('./acceleration').AccelerationState = { currentSpeed: 0 }

    const speedHistory: number[] = []
    let arrived = false
    for (let i = 0; i < 5000 && !arrived; i++) {
      const result = moveVehicleWithAcceleration(state, execution, accelState, accelConfig, 1 / 60, linesMap)
      state = result.state
      execution = result.execution
      accelState = result.accelState
      arrived = result.arrived
      speedHistory.push(accelState.currentSpeed)
    }

    // Kecepatan di 10 tick terakhir harus lebih kecil dari kecepatan maksimum yang pernah dicapai
    const maxSpeedAchieved = Math.max(...speedHistory)
    const avgLastSpeeds = speedHistory.slice(-10).reduce((a, b) => a + b, 0) / 10
    expect(avgLastSpeeds).toBeLessThan(maxSpeedAchieved)
  })
})
```

- [ ] **Step 2.2: Jalankan tests untuk verifikasi gagal**

```bash
npx vitest run src/core/algorithms/acceleration.test.ts
```

Expected: FAIL — `moveVehicleWithAcceleration is not exported from './acceleration'`

- [ ] **Step 2.3: Implementasi `moveVehicleWithAcceleration`**

**Penting:** `moveVehicle` memerlukan `linesMap` untuk kalkulasi posisi di line segments. Karena ini standalone function (bukan method PathEngine), kita tambahkan `linesMap` sebagai parameter eksplisit.

Tambahkan import-import berikut ke **bagian atas** `src/core/algorithms/acceleration.ts` (setelah imports yang sudah ada dari Task 1):

```typescript
import type { VehiclePathState, PathExecution } from '../engine'
import type { Line } from '../types/geometry'
import type { AxleState } from '../types/vehicle'
import type { AxleExecutionState } from '../types/movement'
import { moveVehicle } from './vehicleMovement'
```

Kemudian tambahkan fungsi berikut di **bagian bawah** file, setelah `approachSpeed`:

```typescript
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
 * @param state     - Posisi vehicle saat ini (dari initializeVehicle atau tick sebelumnya)
 * @param execution - Rencana rute (dari preparePath atau tick sebelumnya)
 * @param accelState  - State kecepatan saat ini (simpan antar tick)
 * @param config    - Parameter acceleration/deceleration
 * @param deltaTime - Durasi frame dalam detik (misal: 1/60 untuk 60fps)
 * @param linesMap  - Map dari line ID ke Line object (gunakan engine.linesMap atau buat dari engine.lines)
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
  // 1. Hitung lookahead
  const distToArrival = computeRemainingToArrival(execution)
  const distToNextCurve = computeDistToNextCurve(execution)

  // 2. Hitung target speed berdasarkan posisi di path
  const targetSpeed = computeTargetSpeed(distToArrival, distToNextCurve, config)

  // 3. Update kecepatan saat ini menuju target
  const newSpeed = approachSpeed(
    accelState.currentSpeed,
    targetSpeed,
    config.acceleration,
    config.deceleration,
    deltaTime
  )

  // 4. Hitung jarak yang ditempuh frame ini
  const distance = newSpeed * deltaTime

  // 5. Konversi ke raw types yang dibutuhkan moveVehicle
  const axleStates: AxleState[] = state.axles.map(a => ({
    lineId: a.lineId,
    position: a.position,
    absoluteOffset: a.offset,
  }))
  const axleExecs: AxleExecutionState[] = execution.axleExecutions.map(e => ({
    currentSegmentIndex: e.segmentIndex,
    segmentDistance: e.segmentDistance,
  }))

  // 6. Jalankan moveVehicle (tidak dimodifikasi)
  const result = moveVehicle(axleStates, axleExecs, execution.path, distance, linesMap, execution.curveDataMap)

  // 7. Konversi kembali ke engine-level types
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
```

- [ ] **Step 2.4: Jalankan tests**

```bash
npx vitest run src/core/algorithms/acceleration.test.ts
```

Expected: Semua tests PASS. Jika ada kegagalan karena `linesMap`, apply fix di atas.

- [ ] **Step 2.5: Commit**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
git add src/core/algorithms/acceleration.ts src/core/algorithms/acceleration.test.ts
git commit -m "feat: add moveVehicleWithAcceleration experimental function"
```

---

## Task 3: Export dari `index.ts`

**Files:**
- Modify: `src/core/index.ts`

- [ ] **Step 3.1: Tambah export di `src/core/index.ts`**

Buka `src/core/index.ts` dan tambahkan blok export baru setelah blok "Scene Snapshot" (sekitar baris 148):

```typescript
// Acceleration (Experimental)
export {
  moveVehicleWithAcceleration,
  type AccelerationConfig,
  type AccelerationState,
  computeRemainingToArrival,
  computeDistToNextCurve,
  computeTargetSpeed,
  approachSpeed
} from './algorithms/acceleration'
```

- [ ] **Step 3.2: Jalankan full test suite untuk verifikasi tidak ada regresi**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run
```

Expected: Semua tests PASS (tidak ada test yang sebelumnya pass menjadi fail).

- [ ] **Step 3.3: Build untuk verifikasi TypeScript types bersih**

```bash
npm run build
```

Expected: Build sukses tanpa TypeScript errors.

- [ ] **Step 3.4: Commit**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
git add src/core/index.ts
git commit -m "feat: export moveVehicleWithAcceleration and types from core index"
```

---

## Cara Pakai (Usage Example untuk Client)

Setelah implementasi selesai, client menggunakannya seperti ini:

```typescript
import { PathEngine, moveVehicleWithAcceleration } from 'vehicle-path2/core'
import type { VehiclePathState, PathExecution, AccelerationConfig, AccelerationState } from 'vehicle-path2/core'

const engine = new PathEngine({ maxWheelbase: 100, tangentMode: 'proportional-40' })
engine.setScene(lines, curves)

const vehicle = { axleSpacings: [40] }
let state: VehiclePathState = engine.initializeVehicle('L1', 0, vehicle)!
let execution: PathExecution = engine.preparePath(state, 'L3', 1.0, true)!

// Buat linesMap dari engine (diperlukan oleh moveVehicleWithAcceleration)
const linesMap = new Map(engine.lines.map(l => [l.id, l]))

// State acceleration disimpan di luar
let accelState: AccelerationState = { currentSpeed: 0 }

const config: AccelerationConfig = {
  acceleration: 200,   // px/s² — laju percepatan
  deceleration: 300,   // px/s² — laju perlambatan
  maxSpeed: 300,       // px/s — kecepatan maksimum
  minCurveSpeed: 60,   // px/s — kecepatan minimum saat berbelok
}

function animate(deltaTime: number) {
  const result = moveVehicleWithAcceleration(state, execution, accelState, config, deltaTime, linesMap)
  state = result.state
  execution = result.execution
  accelState = result.accelState

  if (result.arrived) {
    // Kendaraan sudah sampai, berhenti total
  }
}
```
