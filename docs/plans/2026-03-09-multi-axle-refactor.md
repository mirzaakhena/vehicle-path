# Multi-Axle Vehicle Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor vehicle-path2 dari sistem dual-axle (rear/front) ke sistem multi-axle generik, mengganti `wheelbase` global dengan `maxWheelbase` sebagai batasan scene, dan mengubah arrival detection ke axle terdepan (axles[0]).

**Architecture:**
Path direncanakan dari axle paling belakang (`axles[N-1]`) ke target. Setiap axle menyimpan execution state mandiri, hanya diinisialisasi sekali dengan offset arc-length dari axle terdepan. Arrival = `axles[0].completed` (axle terdepan mencapai ujung path).

**Konvensi array:** `axles[0]` = terdepan (leading/front), `axles[N-1]` = paling belakang (trailing/rear). `axleSpacings[i]` = jarak arc-length antara `axles[i]` dan `axles[i+1]`.

**Tech Stack:** TypeScript, Vitest, React 19

---

## Keputusan Desain Kunci

### `axleSpacings` vs `wheelbase` per vehicle
- Global scene config: `wheelbase` → `maxWheelbase` (batas maksimal panjang vehicle yang bisa navigasi kurva)
- Per vehicle: `axleSpacings: number[]` — array N-1 nilai untuk N axle
  - `totalVehicleLength = axleSpacings.reduce((a, b) => a + b, 0)`
  - Constraint: `totalVehicleLength ≤ maxWheelbase`
- Contoh: truck biasa `axleSpacings: [30]`, truck+trailer `axleSpacings: [20, 45]`

### Arrival semantics
- **Sebelum:** `arrived = rearResult.completed` (rear mencapai target)
- **Sesudah:** `arrived = axles[0].completed` (axle terdepan mencapai ujung path)
- Path direncanakan dari `axles[N-1]` (rearmost). `axles[0]` mulai di arc-position `totalVehicleLength` dalam path dan memiliki `frontMaxOffset` untuk "hang over" di ujung garis.

### `PathExecutionState`
- `rear: AxleExecutionState, front: AxleExecutionState` → `axles: AxleExecutionState[]`
- `axles[0]` diinisialisasi dengan `segmentDistance: totalVehicleLength` (sudah di depan)
- `axles[k]` diinisialisasi dengan `segmentDistance: totalVehicleLength - sum(axleSpacings[0..k-1])`

---

## Task 1: Rename `wheelbase` → `maxWheelbase` di MovementConfig dan UseVehicleSimulationProps

**Files:**
- Modify: `src/core/types/movement.ts`
- Modify: `src/react/hooks/useVehicleSimulation.ts`
- Modify: `src/core/engine.ts` (PathEngineConfig)

**Step 1: Update `MovementConfig`**

Di `src/core/types/movement.ts`:
```typescript
export interface MovementConfig {
  maxWheelbase: number   // was: wheelbase
  tangentMode: TangentMode
}
```

**Step 2: Update `PathEngineConfig`**

Di `src/core/engine.ts`:
```typescript
export interface PathEngineConfig {
  maxWheelbase: number   // was: wheelbase
  tangentMode: TangentMode
}
```

Dalam `constructor`:
```typescript
this.config = {
  maxWheelbase: engineConfig.maxWheelbase,
  tangentMode: engineConfig.tangentMode
}
```

**Step 3: Update `UseVehicleSimulationProps`**

Di `src/react/hooks/useVehicleSimulation.ts`:
```typescript
export interface UseVehicleSimulationProps {
  maxWheelbase: number   // was: wheelbase
  tangentMode?: TangentMode
  eventEmitter?: VehicleEventEmitter
}
```

**Step 4: Fix semua downstream consumers yang pakai `config.wheelbase`**

Cari dengan: `grep -rn "config\.wheelbase\|\.wheelbase" src/`

Setiap `config.wheelbase` → `config.maxWheelbase`. File yang terdampak:
- `src/core/algorithms/pathFinding.ts`
- `src/core/algorithms/math.ts`
- `src/core/algorithms/vehicleMovement.ts`
- `src/core/engine.ts`
- `src/react/hooks/useAnimation.ts`
- `src/react/hooks/useScene.ts`
- `src/react/hooks/useVehicles.ts`
- `src/react/hooks/useVehicleSimulation.ts`

**Step 5: Run tests**
```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run
```
Expected: semua tests pass (hanya rename, tidak ada logic change)

**Step 6: Commit**
```bash
git add -A
git commit -m "refactor: rename wheelbase to maxWheelbase in MovementConfig and props"
```

---

## Task 2: Tambah `axleSpacings` ke `VehicleInput` dan tipe Vehicle

**Files:**
- Modify: `src/core/types/vehicle.ts`
- Modify: `src/core/types/api.ts`

**Step 1: Update `Vehicle` type**

Di `src/core/types/vehicle.ts`:
```typescript
export interface Vehicle {
  id: string
  lineId: string
  offset: number
  isPercentage: boolean
  state: VehicleState
  // Multi-axle: axles[0] = terdepan, axles[N-1] = paling belakang
  axles: AxleState[]
  // N-1 jarak antar axle berurutan, axleSpacings[i] = jarak axles[i] ke axles[i+1]
  axleSpacings: number[]
}
```

Hapus `rear: AxleState` dan `front: AxleState`.

**Step 2: Update `VehicleInput`**

Di `src/core/types/api.ts`:
```typescript
export interface VehicleInput {
  id: string
  lineId: string
  position?: number
  isPercentage?: boolean
  /**
   * Jarak arc-length antar axle berurutan.
   * axleSpacings[i] = jarak antara axles[i] dan axles[i+1].
   * axles[0] = terdepan, axles[N-1] = paling belakang.
   * Contoh truk biasa: [30]  →  2 axle, jarak 30px
   * Contoh truck+trailer: [20, 45]  →  3 axle
   * Total panjang vehicle = sum(axleSpacings) harus ≤ maxWheelbase
   */
  axleSpacings: number[]
}
```

**Step 3: Fix TypeScript errors**

Jalankan: `npx tsc --noEmit`

Setiap referensi ke `vehicle.rear` / `vehicle.front` akan error. Catat semua error — akan diperbaiki di task berikutnya.

**Step 4: Commit types saja (meski ada errors di consumers)**
```bash
git add src/core/types/vehicle.ts src/core/types/api.ts
git commit -m "feat: add axleSpacings to Vehicle and VehicleInput types"
```

---

## Task 3: Update `PathExecutionState` ke multi-axle

**Files:**
- Modify: `src/core/types/movement.ts`

**Step 1: Update `PathExecutionState`**

Di `src/core/types/movement.ts`:
```typescript
export interface PathExecutionState {
  path: import('../algorithms/pathFinding').PathResult
  curveDataMap: Map<number, CurveData>
  currentCommandIndex: number
  // Multi-axle: axles[0] = terdepan, sesuai urutan Vehicle.axles
  axles: AxleExecutionState[]
}
```

Hapus `rear: AxleExecutionState` dan `front: AxleExecutionState`.

**Step 2: Run type check**
```bash
npx tsc --noEmit 2>&1 | head -50
```

Catat semua file yang error — akan diperbaiki di task selanjutnya.

**Step 3: Commit**
```bash
git add src/core/types/movement.ts
git commit -m "feat: update PathExecutionState to multi-axle axles array"
```

---

## Task 4: Update fungsi inisialisasi vehicle di `vehicleMovement.ts`

**Files:**
- Modify: `src/core/algorithms/vehicleMovement.ts`
- Modify: `src/core/algorithms/__tests__/vehicleMovement.test.ts`

**Step 1: Tulis test baru untuk `calculateInitialAxlePositions`**

Di `src/core/algorithms/__tests__/vehicleMovement.test.ts`, tambah:
```typescript
describe('calculateInitialAxlePositions', () => {
  const line: Line = { id: 'l1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }

  it('should return 2 axles for single spacing', () => {
    // axleSpacings = [30] → 2 axles, spacing 30
    // placement at offset 0 (rearmost axle)
    const axles = calculateInitialAxlePositions('l1', 0, [30], line)
    expect(axles).toHaveLength(2)
    // axles[0] = terdepan = offset 30
    expect(axles[0].absoluteOffset).toBe(30)
    expect(axles[0].position).toEqual({ x: 30, y: 0 })
    // axles[1] = paling belakang = offset 0
    expect(axles[1].absoluteOffset).toBe(0)
    expect(axles[1].position).toEqual({ x: 0, y: 0 })
  })

  it('should return 3 axles for two spacings', () => {
    // axleSpacings = [20, 15] → 3 axles
    const axles = calculateInitialAxlePositions('l1', 0, [20, 15], line)
    expect(axles).toHaveLength(3)
    expect(axles[0].absoluteOffset).toBe(35) // 0 + 15 + 20
    expect(axles[1].absoluteOffset).toBe(15) // 0 + 15
    expect(axles[2].absoluteOffset).toBe(0)
  })

  it('should clamp front axles to line end', () => {
    // rear at offset 80 on 100px line, spacing [30] → front would be 110, clamp to 100
    const axles = calculateInitialAxlePositions('l1', 80, [30], line)
    expect(axles[0].absoluteOffset).toBe(100)
    expect(axles[1].absoluteOffset).toBe(80)
  })
})
```

**Step 2: Run test (harus FAIL — fungsi belum ada)**
```bash
npx vitest run src/core/algorithms/__tests__/vehicleMovement.test.ts
```

**Step 3: Implementasi `calculateInitialAxlePositions`**

Di `src/core/algorithms/vehicleMovement.ts`, ganti `calculateInitialFrontPosition` dengan:
```typescript
/**
 * Hitung posisi awal semua axle dari posisi rearmost axle.
 *
 * @param lineId - Line ID tempat vehicle diinisialisasi
 * @param rearOffset - Absolute offset axle paling belakang (axles[N-1])
 * @param axleSpacings - Jarak antar axle berurutan (N-1 nilai untuk N axle)
 * @param line - Line object untuk kalkulasi posisi
 * @returns Array AxleState, axles[0] = terdepan, axles[N-1] = paling belakang
 */
export function calculateInitialAxlePositions(
  lineId: string,
  rearOffset: number,
  axleSpacings: number[],
  line: Line
): AxleState[] {
  const lineLength = getLineLength(line)
  const n = axleSpacings.length + 1  // jumlah axle = jumlah spacing + 1
  const axles: AxleState[] = new Array(n)

  // axles[N-1] = rearmost, offset = rearOffset
  axles[n - 1] = {
    lineId,
    absoluteOffset: rearOffset,
    position: getPositionFromOffset(line, rearOffset)
  }

  // Hitung dari belakang ke depan
  // axles[i] = axles[i+1] + axleSpacings[i] (lebih depan)
  let cumulativeOffset = rearOffset
  for (let i = n - 2; i >= 0; i--) {
    cumulativeOffset = Math.min(cumulativeOffset + axleSpacings[i], lineLength)
    axles[i] = {
      lineId,
      absoluteOffset: cumulativeOffset,
      position: getPositionFromOffset(line, cumulativeOffset)
    }
  }

  return axles
}
```

**Step 4: Update `initializeMovingVehicle`**

```typescript
export function initializeMovingVehicle(vehicle: Vehicle, _line: Line): Vehicle {
  return { ...vehicle, state: 'idle' }
}
```
(Tidak perlu perubahan — vehicle sudah punya `axles` dari luar)

**Step 5: Update `createInitialMovementState`**

Tidak perlu perubahan — hanya membungkus vehicle.

**Step 6: Update `initializeAllVehicles`**

```typescript
export function initializeAllVehicles(
  vehicles: Vehicle[],
  linesMap: Map<string, Line>
): InitializationResult {
  const movingVehicles: Vehicle[] = []
  const stateMap = new Map<string, VehicleMovementState>()

  for (const vehicle of vehicles) {
    const line = linesMap.get(vehicle.lineId)
    if (!line) continue
    const movingVehicle = initializeMovingVehicle(vehicle, line)
    movingVehicles.push(movingVehicle)
    stateMap.set(vehicle.id, createInitialMovementState(movingVehicle))
  }

  return { movingVehicles, stateMap }
}
```

**Step 7: Run tests**
```bash
npx vitest run src/core/algorithms/__tests__/vehicleMovement.test.ts
```
Expected: test baru PASS, test lama yang tidak bergantung `rear/front` masih PASS.

**Step 8: Commit**
```bash
git add src/core/algorithms/vehicleMovement.ts src/core/algorithms/__tests__/vehicleMovement.test.ts
git commit -m "feat: add calculateInitialAxlePositions for N-axle initialization"
```

---

## Task 5: Update `moveVehicle` primitive ke N-axle

**Files:**
- Modify: `src/core/algorithms/vehicleMovement.ts`
- Modify: `src/core/algorithms/__tests__/vehicleMovement.test.ts`

**Step 1: Tulis failing tests untuk `moveVehicle` N-axle**

```typescript
describe('moveVehicle (multi-axle)', () => {
  // Setup: line 200px, vehicle dengan 3 axles, spacings [30, 25]
  // Rear (axles[2]) di offset 0, axles[1] di 25, front (axles[0]) di 55
  it('should move all axles by same distance', () => {
    // ... setup path, axleExecutions, linesMap ...
    const result = moveVehicle(axleStates, axleExecutions, path, 10, linesMap, curveDataMap)
    expect(result.axles[2].absoluteOffset).toBeCloseTo(10)   // rear moved
    expect(result.axles[1].absoluteOffset).toBeCloseTo(35)   // mid moved
    expect(result.axles[0].absoluteOffset).toBeCloseTo(65)   // front moved
    expect(result.arrived).toBe(false)
  })

  it('arrived = true when axles[0] (front) completes path', () => {
    // front sudah hampir di ujung path
    const result = moveVehicle(axleStates, axleExecutions, path, 999, linesMap, curveDataMap)
    expect(result.arrived).toBe(true)
  })
})
```

**Step 2: Run (FAIL)**
```bash
npx vitest run src/core/algorithms/__tests__/vehicleMovement.test.ts
```

**Step 3: Ganti signature `moveVehicle`**

```typescript
export function moveVehicle(
  axleStates: AxleState[],
  axleExecutions: AxleExecutionState[],
  path: PathResult,
  distance: number,
  linesMap: Map<string, Line>,
  curveDataMap: Map<number, CurveData>
): {
  axles: AxleState[]
  axleExecutions: AxleExecutionState[]
  arrived: boolean
} {
  // axles[0] = terdepan. Berikan frontMaxOffset hanya ke axles[0].
  let frontMaxOffset: number | undefined
  const frontExec = axleExecutions[0]
  if (frontExec.currentSegmentIndex < path.segments.length) {
    const seg = path.segments[frontExec.currentSegmentIndex]
    if (seg.type === 'line') {
      const line = linesMap.get(seg.lineId!)
      if (line) frontMaxOffset = getLineLength(line)
    }
  }

  const results = axleStates.map((axle, i) => {
    const maxOffset = i === 0 ? frontMaxOffset : undefined
    return updateAxlePosition(axle, axleExecutions[i], path, distance, linesMap, curveDataMap, maxOffset)
  })

  return {
    axles: results.map(r => r.axleState),
    axleExecutions: results.map(r => r.execution),
    arrived: results[0].completed  // axles[0] = terdepan menentukan arrived
  }
}
```

**Step 4: Run tests**
```bash
npx vitest run
```

**Step 5: Commit**
```bash
git add src/core/algorithms/vehicleMovement.ts src/core/algorithms/__tests__/vehicleMovement.test.ts
git commit -m "feat: generalize moveVehicle to N-axle, arrived = axles[0].completed"
```

---

## Task 6: Update `prepareCommandPath` untuk multi-axle

**Files:**
- Modify: `src/core/algorithms/vehicleMovement.ts`

**Step 1: Update `prepareCommandPath`**

```typescript
export function prepareCommandPath(
  vehicle: Vehicle,
  command: GotoCommand,
  ctx: SceneContext
): PreparedPath | null {
  const { graph, linesMap, curves, config } = ctx
  const targetLine = linesMap.get(command.targetLineId)
  if (!targetLine) return null

  const totalVehicleLength = vehicle.axleSpacings.reduce((a, b) => a + b, 0)
  const targetLineLength = getLineLength(targetLine)
  // effectiveLineLength: front (axles[0]) akan "hang over" sampai lineLength,
  // rear berhenti di targetOffset. Constraint sama seperti sebelumnya tapi
  // menggunakan totalVehicleLength sebagai ganti maxWheelbase.
  const effectiveLineLength = targetLineLength - totalVehicleLength
  if (effectiveLineLength <= 0) return null

  const targetOffset = command.isPercentage
    ? command.targetOffset * effectiveLineLength
    : Math.min(command.targetOffset, effectiveLineLength)

  // Path dari rearmost axle (axles[N-1]) ke target
  const rearmost = vehicle.axles[vehicle.axles.length - 1]
  const path = findPath(
    graph,
    { lineId: rearmost.lineId, offset: rearmost.absoluteOffset },
    command.targetLineId,
    targetOffset,
    false
  )

  if (!path) return null

  const curveDataMap = buildCurveDataMap(path, curves, linesMap, config)
  return { path, curveDataMap }
}
```

**Step 2: Run tests**
```bash
npx vitest run
```

**Step 3: Commit**
```bash
git add src/core/algorithms/vehicleMovement.ts
git commit -m "feat: update prepareCommandPath to use rearmost axle and per-vehicle totalVehicleLength"
```

---

## Task 7: Update `PathEngine` dan `VehiclePathState`

**Files:**
- Modify: `src/core/engine.ts`

**Step 1: Update `VehiclePathState`**

```typescript
export interface VehiclePathState {
  axles: Array<{ lineId: string; offset: number; position: Point }>
  axleSpacings: number[]
}
```

**Step 2: Update `PathExecution`**

```typescript
export interface PathExecution {
  path: PathResult
  curveDataMap: Map<number, CurveData>
  axleExecutions: Array<{ segmentIndex: number; segmentDistance: number }>
  targetLineId: string
  targetOffset: number
}
```

**Step 3: Update `initializeVehicle`**

```typescript
initializeVehicle(lineId: string, rearOffset: number, axleSpacings: number[]): VehiclePathState | null {
  const line = this.linesMap.get(lineId)
  if (!line) return null

  const totalVehicleLength = axleSpacings.reduce((a, b) => a + b, 0)
  const lineLen = getLineLength(line)
  const clampedRear = Math.min(rearOffset, lineLen - totalVehicleLength)
  const axleStates = calculateInitialAxlePositions(lineId, clampedRear, axleSpacings, line)

  return {
    axles: axleStates.map(a => ({ lineId: a.lineId, offset: a.absoluteOffset, position: a.position })),
    axleSpacings
  }
}
```

**Step 4: Update `preparePath`**

```typescript
preparePath(vehicleState: VehiclePathState, targetLineId: string, targetOffset: number, isPercentage = false): PathExecution | null {
  if (!this.graph) return null

  const totalVehicleLength = vehicleState.axleSpacings.reduce((a, b) => a + b, 0)
  const rearmost = vehicleState.axles[vehicleState.axles.length - 1]

  // Build minimal Vehicle for prepareCommandPath
  const vehicle: Vehicle = {
    id: '_engine_temp',
    lineId: rearmost.lineId,
    offset: rearmost.offset,
    isPercentage: false,
    state: 'idle',
    axles: vehicleState.axles.map(a => ({ lineId: a.lineId, position: a.position, absoluteOffset: a.offset })),
    axleSpacings: vehicleState.axleSpacings
  }

  const result = prepareCommandPath(vehicle, { vehicleId: '_engine_temp', targetLineId, targetOffset, isPercentage }, {
    graph: this.graph, linesMap: this.linesMap, curves: this.curves, config: this.config
  })
  if (!result) return null

  // Resolve actual target offset
  let actualTargetOffset = targetOffset
  const targetLine = this.linesMap.get(targetLineId)
  if (targetLine) {
    const effectiveLen = Math.max(0, getLineLength(targetLine) - totalVehicleLength)
    actualTargetOffset = isPercentage ? targetOffset * effectiveLen : Math.min(targetOffset, effectiveLen)
  }

  // axles[0] (front) mulai di totalVehicleLength dalam path
  // axles[k] mulai di totalVehicleLength - sum(axleSpacings[0..k-1])
  let cumulative = 0
  const axleExecutions = vehicleState.axleSpacings.map((_, i) => {
    cumulative += vehicleState.axleSpacings[i]
    return { segmentIndex: 0, segmentDistance: totalVehicleLength - cumulative }
  })
  // axles[0] (front)
  axleExecutions.unshift({ segmentIndex: 0, segmentDistance: totalVehicleLength })

  return {
    path: result.path,
    curveDataMap: result.curveDataMap,
    axleExecutions,
    targetLineId,
    targetOffset: actualTargetOffset
  }
}
```

**Step 5: Update `moveVehicle` di PathEngine**

```typescript
moveVehicle(state: VehiclePathState, execution: PathExecution, distance: number) {
  const axleStates: AxleState[] = state.axles.map(a => ({
    lineId: a.lineId, position: a.position, absoluteOffset: a.offset
  }))
  const axleExecs: AxleExecutionState[] = execution.axleExecutions.map(e => ({
    currentSegmentIndex: e.segmentIndex, segmentDistance: e.segmentDistance
  }))

  const result = moveVehicle(axleStates, axleExecs, execution.path, distance, this.linesMap, execution.curveDataMap)

  return {
    state: {
      axles: result.axles.map(a => ({ lineId: a.lineId, offset: a.absoluteOffset, position: a.position })),
      axleSpacings: state.axleSpacings
    },
    execution: {
      ...execution,
      axleExecutions: result.axleExecutions.map(e => ({ segmentIndex: e.currentSegmentIndex, segmentDistance: e.segmentDistance }))
    },
    arrived: result.arrived
  }
}
```

**Step 6: Run tests**
```bash
npx vitest run
```

**Step 7: Commit**
```bash
git add src/core/engine.ts
git commit -m "feat: update PathEngine for multi-axle VehiclePathState and PathExecution"
```

---

## Task 8: Update `VehiclePositionUpdate` event dan `useAnimation`

**Files:**
- Modify: `src/utils/event-emitter.ts`
- Modify: `src/react/hooks/useAnimation.ts`

**Step 1: Update `VehiclePositionUpdate`**

Di `src/utils/event-emitter.ts`:
```typescript
export interface VehiclePositionUpdate {
  vehicleId: string
  /** Posisi semua axle, axles[0] = terdepan */
  axles: Point[]
  /** Center vehicle (rata-rata semua axle) */
  center: Point
  /** Angle dari axle paling belakang ke terdepan */
  angle: number
}
```

**Step 2: Update position update di `useAnimation.ts:232-245`**

```typescript
// Ganti blok rear/front/center dengan:
const axlePositions = arrivalResult.vehicle.axles.map(a => a.position)
const front = axlePositions[0]
const rear  = axlePositions[axlePositions.length - 1]
const center = {
  x: axlePositions.reduce((s, p) => s + p.x, 0) / axlePositions.length,
  y: axlePositions.reduce((s, p) => s + p.y, 0) / axlePositions.length
}
eventsToEmit.push({
  type: 'positionUpdate',
  data: {
    vehicleId,
    axles: axlePositions,
    center,
    angle: Math.atan2(front.y - rear.y, front.x - rear.x)
  }
})
```

**Step 3: Update completion check di `useAnimation.ts:205-206`**

```typescript
// Ganti:
// if (rearResult.completed)
// Dengan menggunakan result dari moveVehicle baru:
const mvResult = moveVehicle(vehicle.axles, exec.axles, ...)
if (mvResult.arrived) {
  // ... handleArrival
}
```

**Step 4: Update internal tick loop untuk pakai `vehicle.axles` bukan `rear/front`**

Cari dan ganti semua referensi `vehicle.rear` dan `vehicle.front` di `useAnimation.ts`.

**Step 5: Run tests**
```bash
npx vitest run
```

**Step 6: Commit**
```bash
git add src/utils/event-emitter.ts src/react/hooks/useAnimation.ts
git commit -m "feat: update VehiclePositionUpdate and useAnimation for multi-axle"
```

---

## Task 9: Update React hooks lainnya

**Files:**
- Modify: `src/react/hooks/useVehicles.ts`
- Modify: `src/react/hooks/useVehicleSimulation.ts`
- Modify: `src/utils/vehicle-helpers.ts`
- Modify: `src/utils/type-converters.ts`

**Step 1: Update `useVehicles.ts`**

Cari semua referensi `rear`/`front` dalam vehicle initialization. Update agar memakai `axles` dan `axleSpacings`.

**Step 2: Update `useVehicleSimulation.ts` props**

```typescript
export interface UseVehicleSimulationProps {
  maxWheelbase: number
  tangentMode?: TangentMode
  eventEmitter?: VehicleEventEmitter
}
```

Pastikan `maxWheelbase` diteruskan ke `useScene` (config), bukan ke per-vehicle.

**Step 3: Update `vehicle-helpers.ts`**

Fungsi `validateAndCreateVehicles` perlu meng-handle `axleSpacings` dari `VehicleInput`.

**Step 4: Update `type-converters.ts`**

Fungsi `toVehicleStart` dan converter lainnya — update agar compatible dengan `axleSpacings`.

**Step 5: Run tests**
```bash
npx vitest run
```

**Step 6: Commit**
```bash
git add src/react/hooks/ src/utils/vehicle-helpers.ts src/utils/type-converters.ts
git commit -m "feat: update React hooks and helpers for multi-axle vehicle"
```

---

## Task 10: Update dan fix semua tests yang rusak

**Files:**
- Modify: `src/core/algorithms/__tests__/vehicleMovement.test.ts`
- Modify: `src/react/hooks/__tests__/*.test.ts`

**Step 1: Run semua tests dan lihat failures**
```bash
npx vitest run 2>&1 | grep -E "FAIL|Error"
```

**Step 2: Update `vehicleMovement.test.ts`**

Test-test yang referensikan `rear`/`front` langsung:
- `it('should position F at line endpoint when R reaches (length - wheelbase)')` → update ke semantik baru: front (axles[0]) "hang over", rear (axles[N-1]) berhenti di target
- Semua test `moveVehicle` → update ke signature baru `(axleStates[], axleExecutions[], ...)`
- Semua test `completed` → pastikan testing `arrived = axles[0].completed`

**Step 3: Update hook tests**

```bash
npx vitest run src/react/hooks/__tests__/
```

Fix setiap test yang failing dengan semantik baru.

**Step 4: Run semua tests — harus 100% pass**
```bash
npx vitest run
```
Expected: semua PASS

**Step 5: Commit**
```bash
git add -A
git commit -m "test: update all tests for multi-axle refactor"
```

---

## Task 11: Update `vehicle-path-demo`

**Files:**
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/types.ts`
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/App.tsx`
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/components/Canvas.tsx`
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/components/Panel.tsx`

**Step 1: Build library dulu**
```bash
cd C:/Users/Mirza/workspace/vehicle-path
npm run build
```

**Step 2: Update `PlacedVehicle` di demo**

Di `src/types.ts`:
```typescript
export interface PlacedVehicle {
  id: string
  axles: Array<{ lineId: string; offset: number; position: Point }>
  axleSpacings: number[]
}
```

**Step 3: Update vehicle placement di `Canvas.tsx`**

`vehicleHover` sekarang berisi array axles:
```typescript
interface VehicleHover {
  lineId: string
  axles: Array<{ offset: number; position: Point }>
}
```

Placement logic: gunakan `calculateInitialAxlePositions` dari library.

**Step 4: Update rendering vehicle di `Canvas.tsx`**

```tsx
{vehicles.map(v => (
  <g key={v.id}>
    {/* Body segments antar axle berurutan */}
    {v.axles.slice(0, -1).map((axle, i) => (
      <line key={i}
        x1={axle.position.x} y1={axle.position.y}
        x2={v.axles[i + 1].position.x} y2={v.axles[i + 1].position.y}
        stroke="#fb923c" strokeWidth={2.5} strokeLinecap="round"
      />
    ))}
    {/* Tiap axle sebagai donut */}
    {v.axles.map((axle, i) => (
      <g key={i}>
        <circle cx={axle.position.x} cy={axle.position.y} r={5}
          fill="#06080c"
          stroke={i === 0 ? '#fbbf24' : i === v.axles.length - 1 ? '#f87171' : '#94a3b8'}
          strokeWidth={1.8}
        />
        <circle cx={axle.position.x} cy={axle.position.y} r={2}
          fill={i === 0 ? '#fbbf24' : i === v.axles.length - 1 ? '#f87171' : '#94a3b8'}
        />
      </g>
    ))}
  </g>
))}
```

**Step 5: Update `App.tsx` — `wheelbase` slider jadi `maxWheelbase`**

```tsx
const [maxWheelbase, setMaxWheelbase] = useState(80)
// Pass ke Canvas dan Panel sebagai maxWheelbase
```

**Step 6: Update `Panel.tsx` — label slider**

Ganti label "Wheelbase" → "Max Wheelbase".

**Step 7: Test di browser**
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npm run dev
```

Verifikasi:
- Vehicle mode masih bisa place vehicle
- Rendering menampilkan body segments dengan benar
- Slider maxWheelbase masih bekerja

**Step 8: Commit demo**
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
git add -A
git commit -m "feat: update demo for multi-axle PlacedVehicle"
```

---

## Task 12: Build, bump versi, dan final check

**Files:**
- Modify: `C:/Users/Mirza/workspace/vehicle-path/package.json`

**Step 1: Run full test suite**
```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run
```
Expected: semua PASS

**Step 2: Build library**
```bash
npm run build
```
Expected: build sukses, tidak ada TypeScript error

**Step 3: Bump versi**

Di `package.json`: `"version": "1.0.15"` → `"version": "2.0.0"` (major bump karena breaking change)

**Step 4: Commit final**
```bash
git add package.json
git commit -m "chore: bump to v2.0.0 — multi-axle refactor (breaking)"
```

---

## Ringkasan Breaking Changes untuk Consumers (yard-planning, dll)

| Sebelum | Sesudah |
|---------|---------|
| `config.wheelbase` | `config.maxWheelbase` |
| `vehicle.rear` / `vehicle.front` | `vehicle.axles[N-1]` / `vehicle.axles[0]` |
| `vehicle.axleSpacings` tidak ada | `vehicle.axleSpacings: number[]` (required) |
| `VehicleInput` tanpa axle config | `VehicleInput.axleSpacings: number[]` (required) |
| `PathExecution.rear/frontSegmentIndex` | `PathExecution.axleExecutions[]` |
| `VehiclePathState.rear/front` | `VehiclePathState.axles[]` + `.axleSpacings` |
| `VehiclePositionUpdate.rear/front` | `VehiclePositionUpdate.axles: Point[]` |
| `arrived = rear.completed` | `arrived = axles[0].completed` |
| `UseVehicleSimulationProps.wheelbase` | `.maxWheelbase` |
| `moveVehicle(rear, front, rearExec, frontExec, ...)` | `moveVehicle(axleStates[], axleExecutions[], ...)` |
