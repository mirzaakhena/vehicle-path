# Vehicle Definition & Snapshot Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `VehicleDefinition` as the library's base vehicle type, update `initializeVehicle` to accept it, and remove vehicles from `serializeScene`/`deserializeScene` so the library is no longer responsible for vehicle state persistence.

**Architecture:** Three targeted changes — (1) add `VehicleDefinition` type and update `VehiclePathState` to extend it, (2) change `initializeVehicle` signature from `axleSpacings: number[]` to `vehicle: VehicleDefinition`, (3) strip vehicles from snapshot entirely. All three are breaking changes → version bump 2.4.0 → 3.0.0. Demo updated accordingly.

**Tech Stack:** TypeScript, Vitest (tests), Vite (demo build).

---

## Context

**Library path:** `C:/Users/Mirza/workspace/vehicle-path`
**Demo path:** `C:/Users/Mirza/workspace/vehicle-path-demo`

**Why this refactor?**
- Library should define *what* a vehicle is (`VehicleDefinition`) but not manage vehicle identity, naming, or persistence.
- Client code extends `VehicleDefinition` with their own fields (id, name, color, etc.) and passes the full object to `initializeVehicle`. TypeScript structural typing makes this seamless.
- `serializeScene` / `deserializeScene` belong to scene infrastructure (lines + curves). Vehicles are the client's persistence concern.

**Breaking changes in this PR (semver major):**
1. `initializeVehicle(lineId, rearOffset, axleSpacings: number[])` → `initializeVehicle(lineId, rearOffset, vehicle: VehicleDefinition)`
2. `serializeScene(lines, curves, vehicles)` → `serializeScene(lines, curves)`
3. `SceneSnapshot.vehicles` field removed
4. `deserializeScene` no longer validates/returns vehicles

**Files involved:**

| File | Change |
|------|--------|
| `src/core/types/vehicle.ts` | Add `VehicleDefinition` interface |
| `src/core/engine.ts` | `VehiclePathState extends VehicleDefinition`, update `initializeVehicle` signature |
| `src/core/snapshot.ts` | Remove vehicles from `SceneSnapshot`, `serializeScene`, `deserializeScene` |
| `src/core/index.ts` | Export `VehicleDefinition` |
| `src/core/__tests__/snapshot.test.ts` | New — tests for simplified snapshot |
| `src/core/__tests__/engine.test.ts` | New — tests for `initializeVehicle` with `VehicleDefinition` |
| `package.json` | Bump version 2.4.0 → 3.0.0 |
| `vehicle-path-demo/src/App.tsx` | Update call sites for new signatures |

---

## Chunk 1: Library Changes

### Task 1: Add `VehicleDefinition` type

**Files:**
- Modify: `src/core/types/vehicle.ts`
- Modify: `src/core/engine.ts` (lines 55–59)
- Modify: `src/core/index.ts` (Vehicle types export block, lines 27–35)

No runtime behavior changes in this task — purely additive type definitions.

- [ ] **Step 1: Add `VehicleDefinition` to `src/core/types/vehicle.ts`**

  Insert after line 4 (after the `import` statement), before `VehicleState`:

  ```typescript
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
  ```

- [ ] **Step 2: Update `VehiclePathState` in `src/core/engine.ts` to extend `VehicleDefinition`**

  Import `VehicleDefinition` at the top of `engine.ts` (add to existing import from `./types/vehicle` — currently there is none, add new import):

  ```typescript
  import type { VehicleDefinition } from './types/vehicle'
  ```

  Then change the `VehiclePathState` interface (currently lines 55–59):

  ```typescript
  // Before:
  export interface VehiclePathState {
    axles: Array<{ lineId: string; offset: number; position: Point }>
    /** N-1 jarak arc-length antar axle berurutan */
    axleSpacings: number[]
  }

  // After:
  export interface VehiclePathState extends VehicleDefinition {
    axles: Array<{ lineId: string; offset: number; position: Point }>
  }
  ```

  Note: `axleSpacings` is now inherited from `VehicleDefinition`. No other logic changes needed — `state.axleSpacings` still works everywhere.

- [ ] **Step 3: Export `VehicleDefinition` from `src/core/index.ts`**

  In the "Vehicle types" export block (lines 27–35), add `VehicleDefinition`:

  ```typescript
  // Vehicle types
  export type {
    VehicleDefinition,
    VehicleState,
    VehicleStart,
    Vehicle,
    AxleState,
    GotoCommand,
    GotoCompletionInfo,
    GotoCompletionCallback
  } from './types/vehicle'
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  Run from `C:/Users/Mirza/workspace/vehicle-path`:
  ```bash
  npm run build
  ```
  Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/core/types/vehicle.ts src/core/engine.ts src/core/index.ts
  git commit -m "feat: add VehicleDefinition base type, VehiclePathState extends it"
  ```

---

### Task 2: Update `initializeVehicle` to accept `VehicleDefinition`

**Files:**
- Modify: `src/core/engine.ts` (lines 241–254)
- Create: `src/core/__tests__/engine.test.ts`

**Context:** `initializeVehicle` currently accepts `axleSpacings: number[]` as the third parameter. After this task it accepts `vehicle: VehicleDefinition`. Client code passes their own vehicle object (which extends `VehicleDefinition`) directly — TypeScript structural typing ensures `{ id: 'v1', axleSpacings: [40] }` satisfies `VehicleDefinition`.

- [ ] **Step 1: Create test file `src/core/__tests__/engine.test.ts` with failing test**

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { PathEngine } from '../engine'
  import type { VehicleDefinition } from '../types/vehicle'

  const line = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }

  function makeEngine() {
    const engine = new PathEngine({ maxWheelbase: 100, tangentMode: 'proportional-40' })
    engine.setScene([line], [])
    return engine
  }

  describe('PathEngine.initializeVehicle', () => {
    it('accepts a VehicleDefinition object', () => {
      const engine = makeEngine()
      const def: VehicleDefinition = { axleSpacings: [40] }
      const state = engine.initializeVehicle('L1', 0, def)
      expect(state).not.toBeNull()
      expect(state!.axleSpacings).toEqual([40])
      expect(state!.axles).toHaveLength(2) // 1 spacing → 2 axles
    })

    it('client-extended VehicleDefinition is accepted (structural typing)', () => {
      const engine = makeEngine()
      // MyVehicle extends VehicleDefinition with extra fields
      const myVehicle = { id: 'v1', name: 'Truck A', axleSpacings: [30, 30] }
      const state = engine.initializeVehicle('L1', 0, myVehicle)
      expect(state).not.toBeNull()
      expect(state!.axleSpacings).toEqual([30, 30])
      expect(state!.axles).toHaveLength(3) // 2 spacings → 3 axles
    })

    it('returns null for unknown lineId', () => {
      const engine = makeEngine()
      const state = engine.initializeVehicle('UNKNOWN', 0, { axleSpacings: [40] })
      expect(state).toBeNull()
    })

    it('clamps rearOffset so all axles fit on line', () => {
      const engine = makeEngine()
      // Line length = 200, total spacing = 150. Max rearOffset = 50.
      const state = engine.initializeVehicle('L1', 999, { axleSpacings: [150] })
      expect(state).not.toBeNull()
      // Rear axle (axles[1]) offset should be clamped to 50
      expect(state!.axles[1].offset).toBeCloseTo(50)
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/core/__tests__/engine.test.ts
  ```
  Expected: FAIL — TypeScript error: `vehicle: VehicleDefinition` parameter not yet in signature.

- [ ] **Step 3: Update `initializeVehicle` signature in `src/core/engine.ts`**

  Also update the class-level `@example` block at the top of `engine.ts` (around line 16) — the example currently passes only 2 args and is already stale. Replace it with:
  ```typescript
  * const state = engine.initializeVehicle('line-1', 0, { axleSpacings: [40] })
  ```

  Find the method (currently lines 241–254):

  Also update the JSDoc `@param` above the method — replace `@param axleSpacings` with `@param vehicle`.

  ```typescript
  // Before:
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

  // After:
  initializeVehicle(lineId: string, rearOffset: number, vehicle: VehicleDefinition): VehiclePathState | null {
    const line = this.linesMap.get(lineId)
    if (!line) return null

    const { axleSpacings } = vehicle
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

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npx vitest run src/core/__tests__/engine.test.ts
  ```
  Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

  ```bash
  npm test
  ```
  Expected: all tests pass (the only call to `initializeVehicle` inside library tests should be via `VehicleDefinition`-compatible objects; demo is not part of library tests).

- [ ] **Step 6: Commit**

  ```bash
  git add src/core/engine.ts src/core/__tests__/engine.test.ts
  git commit -m "feat!: initializeVehicle now accepts VehicleDefinition instead of axleSpacings array"
  ```

---

### Task 3: Simplify `serializeScene` / `deserializeScene` — remove vehicles

**Files:**
- Modify: `src/core/snapshot.ts`
- Create: `src/core/__tests__/snapshot.test.ts`

**Context:**
- `SceneSnapshot` currently has a `vehicles` field. Remove it.
- `serializeScene(lines, curves, vehicles)` becomes `serializeScene(lines, curves)`.
- `deserializeScene` currently throws if `vehicles` is missing. After this change it only validates `lines` and `curves`. Old JSON that contains a `vehicles` field will deserialize silently (field is ignored).

- [ ] **Step 1: Create test file `src/core/__tests__/snapshot.test.ts` with failing tests**

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { serializeScene, deserializeScene } from '../snapshot'
  import type { SceneSnapshot } from '../snapshot'
  import type { Line } from '../types/geometry'

  const lines: Line[] = [
    { id: 'L1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }
  ]
  const curves = [
    {
      id: 'C1',
      fromLineId: 'L1',
      toLineId: 'L1',
      fromOffset: 10,
      toOffset: 90,
      fromIsPercentage: false,
      toIsPercentage: false,
    }
  ]

  describe('serializeScene', () => {
    it('serializes lines and curves to JSON string', () => {
      const json = serializeScene(lines, curves)
      const parsed = JSON.parse(json)
      expect(parsed.lines).toHaveLength(1)
      expect(parsed.curves).toHaveLength(1)
    })

    it('serialized JSON does not contain vehicles field', () => {
      const json = serializeScene(lines, curves)
      const parsed = JSON.parse(json)
      expect(parsed).not.toHaveProperty('vehicles')
    })

    it('serializes empty scene', () => {
      const json = serializeScene([], [])
      const parsed = JSON.parse(json)
      expect(parsed.lines).toEqual([])
      expect(parsed.curves).toEqual([])
    })

    it('defaults fromIsPercentage and toIsPercentage to false if not provided', () => {
      const curveNoFlags = [{ id: 'C1', fromLineId: 'L1', toLineId: 'L1', fromOffset: 10, toOffset: 90 }]
      const json = serializeScene(lines, curveNoFlags)
      const parsed = JSON.parse(json)
      expect(parsed.curves[0].fromIsPercentage).toBe(false)
      expect(parsed.curves[0].toIsPercentage).toBe(false)
    })
  })

  describe('deserializeScene', () => {
    it('deserializes valid JSON into SceneSnapshot', () => {
      const json = serializeScene(lines, curves)
      const snapshot = deserializeScene(json)
      expect(snapshot.lines).toHaveLength(1)
      expect(snapshot.curves).toHaveLength(1)
    })

    it('snapshot type does not have vehicles field', () => {
      const json = serializeScene(lines, [])
      const snapshot: SceneSnapshot = deserializeScene(json)
      // TypeScript: if 'vehicles' existed on SceneSnapshot, this line would compile
      // This test is a compile-time contract check — at runtime we just verify the shape
      expect(Object.keys(snapshot)).not.toContain('vehicles')
    })

    it('old JSON with vehicles field deserializes without error (vehicles ignored)', () => {
      const oldJson = JSON.stringify({ lines, curves: [], vehicles: [{ id: 'v1' }] })
      expect(() => deserializeScene(oldJson)).not.toThrow()
      const snapshot = deserializeScene(oldJson)
      expect(snapshot.lines).toHaveLength(1)
    })

    it('throws on invalid JSON', () => {
      expect(() => deserializeScene('not json')).toThrow('invalid JSON')
    })

    it('throws when lines field is missing', () => {
      expect(() => deserializeScene(JSON.stringify({ curves: [] }))).toThrow('missing "lines"')
    })

    it('throws when curves field is missing', () => {
      expect(() => deserializeScene(JSON.stringify({ lines: [] }))).toThrow('missing "curves"')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/core/__tests__/snapshot.test.ts
  ```
  Expected: multiple FAIL — `serializeScene` still requires 3 params, `SceneSnapshot` still has vehicles.

- [ ] **Step 3: Rewrite `src/core/snapshot.ts`**

  Replace the entire file with:

  ```typescript
  import type { Line } from './types/geometry'

  export interface SceneSnapshot {
    lines: Line[]
    curves: Array<{
      id: string
      fromLineId: string
      toLineId: string
      fromOffset: number
      fromIsPercentage: boolean
      toOffset: number
      toIsPercentage: boolean
    }>
  }

  /**
   * Serialize scene state (lines + curves) to a JSON string.
   * Vehicles are NOT included — vehicle persistence is the client's responsibility.
   */
  export function serializeScene(
    lines: Line[],
    curves: Array<{
      id: string
      fromLineId: string
      toLineId: string
      fromOffset: number
      fromIsPercentage?: boolean
      toOffset: number
      toIsPercentage?: boolean
    }>
  ): string {
    const snapshot: SceneSnapshot = {
      lines,
      curves: curves.map(c => ({
        id: c.id,
        fromLineId: c.fromLineId,
        toLineId: c.toLineId,
        fromOffset: c.fromOffset,
        fromIsPercentage: c.fromIsPercentage ?? false,
        toOffset: c.toOffset,
        toIsPercentage: c.toIsPercentage ?? false,
      })),
    }
    return JSON.stringify(snapshot, null, 2)
  }

  /**
   * Deserialize a JSON string back into a SceneSnapshot.
   * Throws if the string is not valid JSON or missing required fields (lines, curves).
   * Extra fields in the JSON (e.g. legacy "vehicles") are silently ignored.
   */
  export function deserializeScene(json: string): SceneSnapshot {
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      throw new Error('deserializeScene: invalid JSON')
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('deserializeScene: expected a JSON object')
    }

    const obj = raw as Record<string, unknown>

    if (!Array.isArray(obj.lines)) throw new Error('deserializeScene: missing "lines"')
    if (!Array.isArray(obj.curves)) throw new Error('deserializeScene: missing "curves"')

    return {
      lines: obj.lines as SceneSnapshot['lines'],
      curves: obj.curves as SceneSnapshot['curves'],
    }
  }
  ```

- [ ] **Step 4: Run snapshot tests to verify they pass**

  ```bash
  npx vitest run src/core/__tests__/snapshot.test.ts
  ```
  Expected: all 10 tests pass.

- [ ] **Step 5: Run full test suite**

  ```bash
  npm test
  ```
  Expected: all tests pass.

- [ ] **Step 6: Verify TypeScript build**

  ```bash
  npm run build
  ```
  Expected: build succeeds. Note: demo will have TypeScript errors at this point (will be fixed in Task 4).

- [ ] **Step 7: Commit**

  ```bash
  git add src/core/snapshot.ts src/core/__tests__/snapshot.test.ts
  git commit -m "feat!: remove vehicles from serializeScene/deserializeScene/SceneSnapshot"
  ```

---

### Task 4: Version bump to 3.0.0

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update version in `package.json`**

  Change:
  ```json
  "version": "2.4.0",
  ```
  To:
  ```json
  "version": "3.0.0",
  ```

- [ ] **Step 2: Verify build still clean**

  ```bash
  npm run build
  ```
  Expected: success.

- [ ] **Step 3: Commit**

  ```bash
  git add package.json
  git commit -m "chore: bump version to 3.0.0 (breaking API changes)"
  ```

---

## Chunk 2: Demo Update

### Task 5: Update demo to use new API signatures

**Files:**
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/App.tsx`

**Context:** Two call sites in `App.tsx` need updating after the library's breaking changes:
1. `engine.initializeVehicle(rearAxle.lineId, rearAxle.offset, vehicle.axleSpacings)` → pass `vehicle` directly
2. `serializeScene(lines, curves, vehicles)` → `serializeScene(lines, curves)`

After removing vehicles from `serializeScene`, the demo's export/clipboard feature will no longer include vehicle data. This is acceptable per the design decision — vehicle persistence is the client's responsibility. No new serialization code is needed in the demo for this plan.

**Note:** Before making these changes, the demo must have `vehicle-path2@3.0.0` installed. This will be done after the library is published (user handles npm publish). For local development, use `npm link` to point to the local library build.

- [ ] **Step 1: Update `initializeVehicle` call (App.tsx line 169)**

  Find:
  ```typescript
  const state = engine.initializeVehicle(rearAxle.lineId, rearAxle.offset, vehicle.axleSpacings)
  ```

  Replace with:
  ```typescript
  const state = engine.initializeVehicle(rearAxle.lineId, rearAxle.offset, vehicle)
  ```

  This works because `PlacedVehicle` (demo type) has `axleSpacings: number[]`, which structurally satisfies `VehicleDefinition`.

- [ ] **Step 2: Update `serializeScene` call (App.tsx line 242)**

  Find:
  ```typescript
  const json = serializeScene(lines, curves, vehicles)
  ```

  Replace with:
  ```typescript
  const json = serializeScene(lines, curves)
  ```

- [ ] **Step 3: Verify demo builds without TypeScript errors**

  Run from `C:/Users/Mirza/workspace/vehicle-path-demo`:
  ```bash
  npm run build
  ```
  Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

  Run from `C:/Users/Mirza/workspace/vehicle-path-demo`:
  ```bash
  git add src/App.tsx
  git commit -m "chore: update to vehicle-path2 v3.0.0 API (VehicleDefinition, serializeScene sans vehicles)"
  ```

---

## Summary of Breaking Changes (for release notes)

| What changed | Before | After |
|---|---|---|
| `initializeVehicle` 3rd param | `axleSpacings: number[]` | `vehicle: VehicleDefinition` |
| `serializeScene` params | `(lines, curves, vehicles)` | `(lines, curves)` |
| `SceneSnapshot` | has `vehicles` field | no `vehicles` field |
| `deserializeScene` | validates `vehicles` presence | only validates `lines` + `curves` |

**Migration guide:**
- `engine.initializeVehicle('L1', 0, [40])` → `engine.initializeVehicle('L1', 0, { axleSpacings: [40] })`
- `serializeScene(lines, curves, vehicles)` → `serializeScene(lines, curves)` (serialize vehicles separately if needed)
