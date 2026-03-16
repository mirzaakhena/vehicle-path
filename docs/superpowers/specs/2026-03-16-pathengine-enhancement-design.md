# PathEngine Enhancement: Scene Management Fix & API Improvement

**Date:** 2026-03-16
**Status:** Approved
**Scope:** `src/core/` only — no React/Utils layer changes

## Problem

The demo app (`vehicle-path-demo`) reimplements scene management logic that PathEngine already provides, because PathEngine's implementation has issues:

1. **Mutates objects directly** — `updateLine` and `renameLine` mutate line/curve objects in place
2. **Index-based curve operations** — `updateCurve(index)` and `removeCurve(index)` are awkward; demo uses id-based
3. **Bezier computed twice** — `buildGraph()` computes bezier then discards it; `buildCurveDataMap()` recomputes the same bezier later
4. **Graph rebuilt per mutation** — every `addLine`, `updateLine`, etc. triggers `buildGraph()` immediately
5. **No path validation API** — demo calls `findPath()` directly to check reachability
6. **Acceleration not on PathEngine** — demo wires `moveVehicleWithAcceleration()` manually, building `linesMap` from `engine.lines`
7. **Scene management methods have zero test coverage**

## Goal

Fix PathEngine so demo can use it effectively as the single source of truth for scene management. Apply "take the best, drop the worst" from both demo and library implementations.

## Non-Goals

- PathEngine does NOT manage vehicles (demo's responsibility)
- React & Utils layers are not modified (future deprecation scope)
- No breaking changes to standalone functions (`buildGraph`, `findPath`, etc.)

## Design

### 1. Core Type Changes

#### 1a. `Curve` gets optional `id`

```typescript
// src/core/types/geometry.ts
export interface Curve {
  id?: string          // NEW — optional, backward-compatible
  fromLineId: string
  toLineId: string
  fromOffset?: number
  fromIsPercentage?: boolean
  toOffset?: number
  toIsPercentage?: boolean
}
```

#### 1b. `GraphEdge` caches computed bezier

```typescript
// src/core/algorithms/pathFinding.ts
export interface GraphEdge {
  curveIndex: number
  curveId?: string       // NEW — from Curve.id
  fromLineId: string
  toLineId: string
  fromOffset: number
  toOffset: number
  curveLength: number
  bezier: BezierCurve    // NEW — cached, eliminates double computation
}
```

### 2. PathEngine Scene Management Fixes

#### 2a. Immutable updates

All mutation methods create new objects instead of mutating:

```typescript
// BEFORE (bad): line.start = updates.start
// AFTER (good): const updated = { ...line, ...updates }; this.linesMap.set(lineId, updated)
```

Same for `renameLine` — create new line object with new id.

#### 2b. Lazy graph rebuild

```typescript
private graphDirty = true

private ensureGraph(): Graph {
  if (this.graphDirty || !this.graph) {
    this.graph = buildGraph(
      Array.from(this.linesMap.values()),
      Array.from(this.curvesMap.values()),
      this.config
    )
    this.graphDirty = false
  }
  return this.graph
}
```

All mutation methods set `this.graphDirty = true` instead of calling `buildGraph()`.

#### 2c. ID-based curve operations

Internal storage changes from `Curve[]` to `Map<string, Curve>`.

| Before | After |
|--------|-------|
| `addCurve(curve: Curve): void` | `addCurve(curve: Curve): string` — returns id (auto-gen if absent) |
| `updateCurve(index, updates): boolean` | `updateCurve(curveId: string, updates): boolean` |
| `removeCurve(index): boolean` | `removeCurve(curveId: string): boolean` |

Auto-generate: `curve.id ?? \`curve-${++this.curveSeq}\``

#### 2d. Enhanced return values

```typescript
renameLine(oldId: string, newId: string): {
  success: boolean
  error?: string
  renamedCurveIds?: string[]  // NEW — which curves were affected
}

removeLine(lineId: string): {
  success: boolean
  removedCurveIds: string[]   // NEW — which curves were deleted
}
```

### 3. New PathEngine Methods

#### 3a. `getCurveBeziers()`

```typescript
getCurveBeziers(): Map<string, BezierCurve>
```

Returns computed bezier for each curve by id. Demo uses this for rendering instead of calling `createBezierCurve()` manually.

#### 3b. `canReach()`

```typescript
canReach(fromLineId: string, fromOffset: number, toLineId: string, toOffset: number): boolean
```

Wraps `findPath()` with PathEngine's internal graph.

#### 3c. `moveVehicleWithAcceleration()`

```typescript
moveVehicleWithAcceleration(
  state: VehiclePathState,
  execution: PathExecution,
  accelState: AccelerationState,
  config: AccelerationConfig,
  deltaTime: number
): { state: VehiclePathState; execution: PathExecution; accelState: AccelerationState; arrived: boolean }
```

Thin wrapper — injects PathEngine's internal `linesMap` into the standalone `moveVehicleWithAcceleration()` function.

#### 3d. `getGraph()`

```typescript
getGraph(): Graph
```

Exposes the graph (lazily built) for consumers that need it (e.g., scene stats, custom pathfinding).

### 4. `buildCurveDataMap` Optimization

`buildCurveDataMap()` in vehicleMovement.ts changes to read bezier from GraphEdge instead of recomputing:

```typescript
// BEFORE: const bezier = createBezierCurve(fromLine, toLine, config, ...)
// AFTER:  const bezier = edge.bezier  (from graph)
const arcLengthTable = buildArcLengthTable(bezier)
curveDataMap.set(segment.curveIndex, { bezier, arcLengthTable })
```

`buildCurveDataMap` gains a `graph` parameter. This is internal — `PathEngine.preparePath()` signature does not change.

### 5. Test Plan

All tests in `src/core/__tests__/engine.test.ts` unless noted.

#### Scene management (~14 tests)

- **updateLine** (5): update start/end, immutability, not-found, bezier updates after ensureGraph
- **renameLine** (5): success + cascade, renamedCurveIds, empty name, duplicate, not-found, immutability
- **removeLine** (3): success + cascade, removedCurveIds, not-found
- **addCurve** (2): auto-gen id, use provided id

#### Curve operations (~4 tests)

- **updateCurve by id** (2): success, not-found
- **removeCurve by id** (2): success, not-found

#### New methods (~9 tests)

- **getCurveBeziers** (3): returns correct beziers, matches manual createBezierCurve, empty scene
- **canReach** (3): connected → true, disconnected → false, same line → true
- **moveVehicleWithAcceleration** (3): basic movement, arrival, matches standalone function

#### Lazy graph rebuild (~3 tests)

- Multiple mutations → 1 rebuild on access
- Access after mutation → fresh graph
- Access without mutation → cached (no rebuild)

#### buildCurveDataMap optimization (~2 tests in vehicleMovement.test.ts)

- CurveData bezier matches GraphEdge bezier
- Arc length table computed from cached bezier

**Total: ~33 new tests. Existing 813 tests must remain passing.**

### 6. What Does NOT Change

- PathEngine does not manage vehicles
- React & Utils layers untouched
- `buildGraph()` external signature unchanged (GraphEdge gaining `bezier` is additive)
- `moveVehicle()` (constant speed) remains alongside acceleration variant
- All standalone functions remain available
- No breaking changes to public API (only additions)
- The only "breaking" change: `updateCurve(index)` / `removeCurve(index)` on PathEngine become id-based — but these have zero external consumers and zero tests

### 7. Files Modified

| File | Change |
|------|--------|
| `src/core/types/geometry.ts` | Add `id?: string` to `Curve` |
| `src/core/algorithms/pathFinding.ts` | `GraphEdge` gets `bezier` + `curveId`, `buildGraph` caches bezier |
| `src/core/engine.ts` | Immutable updates, lazy rebuild, id-based curves, new methods |
| `src/core/algorithms/vehicleMovement.ts` | `buildCurveDataMap` uses cached bezier from graph |
| `src/core/__tests__/engine.test.ts` | ~31 new tests |
| `src/core/algorithms/__tests__/vehicleMovement.test.ts` | ~2 new tests |
| `src/core/index.ts` | Export new types if any |
