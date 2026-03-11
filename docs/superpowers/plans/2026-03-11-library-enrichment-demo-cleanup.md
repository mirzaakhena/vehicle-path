# Library Enrichment & Demo Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah tiga geometry utilities ke library (`projectPointOnLine`, `getValidRearOffsetRange`, `computeMinLineLength`), export ke public API, lalu bersihkan demo dari duplicate logic.

**Architecture:** File baru `src/core/algorithms/geometry.ts` berisi tiga pure functions. Export ditambahkan ke `src/core/index.ts`. Demo kemudian menghapus `src/geometry.ts` dan mengganti inline logic di `Canvas.tsx` dengan fungsi library.

**Tech Stack:** TypeScript, Vitest (testing), Vite (build), `vehicle-path2` npm link ke demo.

**Spec:** `docs/superpowers/specs/2026-03-11-library-enrichment-demo-cleanup-design.md`

**Design note:** Spec awal mendefinisikan `computeMinLineLength(lineId, curves, linesMap)`. Setelah analisis lebih lanjut, `linesMap` tidak diperlukan — percentage offsets cukup diabaikan (mereka skala dengan panjang line dan tidak membentuk hard minimum). Signature disederhanakan menjadi `computeMinLineLength(lineId, curves)`. Demo menggunakan `StoredCurve[]` yang secara struktural kompatibel dengan `Curve[]` (field `fromIsPercentage`/`toIsPercentage` tidak ada di StoredCurve → `undefined` → dianggap `false` oleh fungsi library).

---

## File Map

### Library (`C:/Users/Mirza/workspace/vehicle-path`)

| Action | File | Tanggung Jawab |
|--------|------|----------------|
| **Create** | `src/core/algorithms/geometry.test.ts` | Unit tests untuk tiga fungsi baru (tulis DULU sebelum implementasi — TDD) |
| **Create** | `src/core/algorithms/geometry.ts` | Tiga pure functions: `projectPointOnLine`, `getValidRearOffsetRange`, `computeMinLineLength` |
| **Modify** | `src/core/index.ts` | Export ketiga fungsi baru dari public API |

### Demo (`C:/Users/Mirza/workspace/vehicle-path-demo`)

| Action | File | Tanggung jawab |
|--------|------|----------------|
| **Delete** | `src/geometry.ts` | Seluruh file — kedua fungsinya digantikan oleh library |
| **Modify** | `src/components/Canvas.tsx` | Update imports + hapus `computeMinLineLength` local + ganti inline offset constraint |

---

## Chunk 1: Library — tests, implementasi, dan export

### Task 1: Tulis failing tests (TDD — DULU sebelum implementasi)

**Files:**
- Create: `src/core/algorithms/geometry.test.ts`
- Test runner: `npx vitest run src/core/algorithms/geometry.test.ts`

---

- [ ] **Step 1: Buat file test**

Buat file `src/core/algorithms/geometry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { projectPointOnLine, getValidRearOffsetRange, computeMinLineLength } from './geometry'
import type { Line, Curve } from '../types/geometry'

// Helper: buat line horizontal sederhana
const hLine = (id: string, x1: number, x2: number, y = 0): Line => ({
  id,
  start: { x: x1, y },
  end: { x: x2, y }
})

// ─────────────────────────────────────────────
// projectPointOnLine
// ─────────────────────────────────────────────
describe('projectPointOnLine', () => {
  const line = hLine('L1', 0, 100) // horizontal line dari (0,0) ke (100,0)

  it('point tepat di atas tengah garis', () => {
    const result = projectPointOnLine({ x: 50, y: 0 }, line)
    expect(result.offset).toBeCloseTo(50)
    expect(result.distance).toBeCloseTo(0)
  })

  it('point di atas garis dengan jarak tegak lurus', () => {
    const result = projectPointOnLine({ x: 50, y: 30 }, line)
    expect(result.offset).toBeCloseTo(50)
    expect(result.distance).toBeCloseTo(30)
  })

  it('point di bawah garis (jarak selalu positif)', () => {
    const result = projectPointOnLine({ x: 50, y: -20 }, line)
    expect(result.offset).toBeCloseTo(50)
    expect(result.distance).toBeCloseTo(20)
  })

  it('point di luar ujung kiri — clamp ke offset 0', () => {
    const result = projectPointOnLine({ x: -10, y: 0 }, line)
    expect(result.offset).toBeCloseTo(0)
    expect(result.distance).toBeCloseTo(10)
  })

  it('point di luar ujung kanan — clamp ke lineLength', () => {
    const result = projectPointOnLine({ x: 120, y: 0 }, line)
    expect(result.offset).toBeCloseTo(100)
    expect(result.distance).toBeCloseTo(20)
  })

  it('line dengan panjang nol — offset 0, distance ke titik start', () => {
    const zeroLine: Line = { id: 'Z', start: { x: 50, y: 50 }, end: { x: 50, y: 50 } }
    const result = projectPointOnLine({ x: 53, y: 54 }, zeroLine)
    expect(result.offset).toBe(0)
    expect(result.distance).toBeCloseTo(5)
  })

  it('line diagonal — proyeksi tepat di tengah', () => {
    const diagLine: Line = { id: 'D', start: { x: 0, y: 0 }, end: { x: 100, y: 100 } }
    const result = projectPointOnLine({ x: 50, y: 50 }, diagLine)
    expect(result.offset).toBeCloseTo(Math.sqrt(50 * 50 + 50 * 50))
    expect(result.distance).toBeCloseTo(0)
  })
})

// ─────────────────────────────────────────────
// getValidRearOffsetRange
// ─────────────────────────────────────────────
describe('getValidRearOffsetRange', () => {
  const line = hLine('L1', 0, 100) // panjang 100

  it('vehicle 2-axle normal — [0, lineLength - spacing]', () => {
    const [min, max] = getValidRearOffsetRange(line, [40])
    expect(min).toBe(0)
    expect(max).toBeCloseTo(60)
  })

  it('vehicle 3-axle normal', () => {
    const [min, max] = getValidRearOffsetRange(line, [30, 30])
    expect(min).toBe(0)
    expect(max).toBeCloseTo(40)
  })

  it('spacing tepat sama dengan panjang line — max = 0', () => {
    const [min, max] = getValidRearOffsetRange(line, [100])
    expect(min).toBe(0)
    expect(max).toBe(0)
  })

  it('spacing lebih besar dari panjang line — max tetap 0, bukan negatif', () => {
    const [min, max] = getValidRearOffsetRange(line, [150])
    expect(min).toBe(0)
    expect(max).toBe(0)
  })

  it('axleSpacings kosong (single axle) — [0, lineLength]', () => {
    const [min, max] = getValidRearOffsetRange(line, [])
    expect(min).toBe(0)
    expect(max).toBeCloseTo(100)
  })
})

// ─────────────────────────────────────────────
// computeMinLineLength
// ─────────────────────────────────────────────
describe('computeMinLineLength', () => {
  it('tidak ada curves — return 0', () => {
    expect(computeMinLineLength('L1', [])).toBe(0)
  })

  it('curve tidak melibatkan lineId ini — return 0', () => {
    const curves: Curve[] = [
      { fromLineId: 'L2', toLineId: 'L3', fromOffset: 50 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(0)
  })

  it('satu curve sebagai fromLine dengan absolute offset', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 80 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(80)
  })

  it('satu curve sebagai toLine dengan absolute offset', () => {
    const curves: Curve[] = [
      { fromLineId: 'L2', toLineId: 'L1', toOffset: 60 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(60)
  })

  it('multiple curves — return maximum dari semua offset', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 80 },
      { fromLineId: 'L3', toLineId: 'L1', toOffset: 90 },
      { fromLineId: 'L1', toLineId: 'L4', fromOffset: 50 },
    ]
    expect(computeMinLineLength('L1', curves)).toBe(90)
  })

  it('percentage offset diabaikan — tidak berkontribusi ke minimum', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 0.8, fromIsPercentage: true }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(0)
  })

  it('mix absolute dan percentage — hanya absolute yang dihitung', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 0.9, fromIsPercentage: true },
      { fromLineId: 'L3', toLineId: 'L1', toOffset: 70 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(70)
  })

  it('fromOffset undefined — diabaikan', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2' } // tanpa offset
    ]
    expect(computeMinLineLength('L1', curves)).toBe(0)
  })
})
```

- [ ] **Step 2: Jalankan test — pastikan GAGAL (file implementasi belum ada)**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run src/core/algorithms/geometry.test.ts
```

Expected: Error `Cannot find module './geometry'` atau semua tests FAIL. Jika sudah PASS, berarti ada file geometry.ts yang tidak sengaja ada — hapus dulu.

---

### Task 2: Implementasi `geometry.ts`

**Files:**
- Create: `src/core/algorithms/geometry.ts`

---

- [ ] **Step 1: Buat file implementasi**

Buat file `src/core/algorithms/geometry.ts`:

```typescript
import type { Point, Line, Curve } from '../types/geometry'
import { getLineLength } from './vehicleMovement'

/**
 * Project a point onto a line segment.
 *
 * Returns:
 * - offset: absolute distance from line.start along the line (clamped to [0, lineLength])
 * - distance: perpendicular distance from point to the nearest point on the line
 */
export function projectPointOnLine(
  point: Point,
  line: Line
): { offset: number; distance: number } {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    const dist = Math.sqrt(
      (point.x - line.start.x) ** 2 + (point.y - line.start.y) ** 2
    )
    return { offset: 0, distance: dist }
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / lenSq
    )
  )

  const projX = line.start.x + t * dx
  const projY = line.start.y + t * dy
  const distance = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)
  const offset = t * Math.sqrt(lenSq)

  return { offset, distance }
}

/**
 * Compute the valid [min, max] offset range for placing the rear axle of a
 * multi-axle vehicle on a line.
 *
 * - min is always 0 (rear axle at line start)
 * - max is lineLength - totalAxleSpacing (so all axles fit on the line)
 * - If the vehicle is too long for the line, returns [0, 0]
 */
export function getValidRearOffsetRange(
  line: Line,
  axleSpacings: number[]
): [number, number] {
  const lineLength = getLineLength(line)
  const totalSpacing = axleSpacings.reduce((a, b) => a + b, 0)
  const max = Math.max(0, lineLength - totalSpacing)
  return [0, max]
}

/**
 * Compute the minimum length a line must have so that all attached curve
 * offsets (fromOffset / toOffset) remain within valid bounds.
 *
 * Only absolute offsets contribute to the minimum — percentage-based offsets
 * scale with the line and therefore impose no hard minimum.
 *
 * Returns 0 if no curves are attached or all offsets are percentage-based.
 */
export function computeMinLineLength(lineId: string, curves: Curve[]): number {
  let min = 0
  for (const curve of curves) {
    if (
      curve.fromLineId === lineId &&
      !curve.fromIsPercentage &&
      curve.fromOffset !== undefined
    ) {
      min = Math.max(min, curve.fromOffset)
    }
    if (
      curve.toLineId === lineId &&
      !curve.toIsPercentage &&
      curve.toOffset !== undefined
    ) {
      min = Math.max(min, curve.toOffset)
    }
  }
  return min
}
```

- [ ] **Step 2: Jalankan tests — pastikan PASS**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run src/core/algorithms/geometry.test.ts
```

Expected: semua tests PASS. Jika ada yang FAIL, perbaiki implementasi sebelum lanjut.

- [ ] **Step 3: Commit kedua file sekaligus**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
git add src/core/algorithms/geometry.ts src/core/algorithms/geometry.test.ts
git commit -m "feat: add geometry utilities (projectPointOnLine, getValidRearOffsetRange, computeMinLineLength)"
```

---

### Task 3: Export dari `src/core/index.ts`

**Files:**
- Modify: `src/core/index.ts`

---

- [ ] **Step 1: Tambah export di akhir file `src/core/index.ts`**

Buka `src/core/index.ts`. Di **bagian paling bawah file**, setelah blok `// Scene Snapshot` (baris terakhir saat ini adalah `} from './snapshot'`), tambahkan:

```typescript

// Geometry Utilities
export {
  projectPointOnLine,
  getValidRearOffsetRange,
  computeMinLineLength
} from './algorithms/geometry'
```

- [ ] **Step 2: Verifikasi TypeScript tidak ada error**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx tsc -p tsconfig.build.json --noEmit
```

Expected: tidak ada output (tidak ada error).

- [ ] **Step 3: Build library**

```bash
npm run build
```

Expected: `dist/` ter-update, tidak ada error.

- [ ] **Step 4: Pastikan semua tests masih hijau**

```bash
npm test -- --run
```

Expected: semua 672+ tests PASS (tests baru menambah jumlah total).

- [ ] **Step 5: Commit**

```bash
git add src/core/index.ts
git commit -m "feat: export geometry utilities from core public API"
```

---

## Chunk 2: Demo Cleanup

> **Prasyarat:** Chunk 1 harus selesai dan `npm run build` sudah dijalankan di library.
> Demo menggunakan `vehicle-path2` via `npm link` — setelah build di library, perubahan langsung tersedia.

### Task 4: Verifikasi App.tsx + hapus `geometry.ts` demo + update imports Canvas.tsx

**Files:**
- Verify: `src/App.tsx` (baca saja, konfirmasi tidak ada local geometry impl)
- Delete: `src/geometry.ts`
- Modify: `src/components/Canvas.tsx`

---

- [ ] **Step 1: Verifikasi App.tsx sudah pakai library (tidak ada local duplicate)**

```bash
grep -n "getPositionFromOffset\|getPointAtOffset\|projectPointOnLine" /c/Users/Mirza/workspace/vehicle-path-demo/src/App.tsx
```

Expected: hanya `getPositionFromOffset` dari import library. Tidak ada `getPointAtOffset` atau local version. Jika ada — ganti dengan `getPositionFromOffset` dari `vehicle-path2/core` sebelum lanjut.

- [ ] **Step 2: Identifikasi semua file yang mengimport dari `geometry.ts` demo**

```bash
grep -rn "from.*geometry\|from '../geometry'\|from './geometry'" /c/Users/Mirza/workspace/vehicle-path-demo/src/
```

Expected: hanya `Canvas.tsx` yang mengimport dari `../geometry`.

- [ ] **Step 3: Update import di `Canvas.tsx`**

Di `src/components/Canvas.tsx`, cari baris import dari `'../geometry'`:

```typescript
// SEBELUM — import dari local geometry.ts
import { projectPointOnLine, getPointAtOffset } from '../geometry'
```

Ganti dengan (gabung ke import yang sudah ada dari `vehicle-path2/core`, atau tambah baris baru):

```typescript
// SESUDAH — import dari library
import { projectPointOnLine, getPositionFromOffset } from 'vehicle-path2/core'
```

> `getPointAtOffset` (demo) → `getPositionFromOffset` (library): keduanya identik — return `Point` dari absolute offset pada line, clamped ke bounds.

- [ ] **Step 4: Cari dan ganti semua penggunaan `getPointAtOffset` di Canvas.tsx**

```bash
grep -n "getPointAtOffset" /c/Users/Mirza/workspace/vehicle-path-demo/src/components/Canvas.tsx
```

Untuk setiap kemunculan, ganti:
```typescript
getPointAtOffset(line, offset)
// menjadi:
getPositionFromOffset(line, offset)
```

- [ ] **Step 5: Hapus file `geometry.ts` dari demo**

```bash
rm /c/Users/Mirza/workspace/vehicle-path-demo/src/geometry.ts
```

- [ ] **Step 6: Verifikasi TypeScript tidak ada error**

```bash
cd /c/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```

Expected: tidak ada error. Jika ada `Cannot find module '../geometry'`, berarti ada import yang terlewat di Step 3/4.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Mirza/workspace/vehicle-path-demo
git add -A
git commit -m "refactor: remove local geometry.ts, use library's projectPointOnLine and getPositionFromOffset"
```

---

### Task 5: Ganti `computeMinLineLength` local di Canvas.tsx

**Files:**
- Modify: `src/components/Canvas.tsx`

---

- [ ] **Step 1: Tambah `computeMinLineLength` ke import library di Canvas.tsx**

Di baris import `from 'vehicle-path2/core'` yang sudah ada, tambahkan `computeMinLineLength`:

```typescript
import { ..., computeMinLineLength } from 'vehicle-path2/core'
```

- [ ] **Step 2: Hapus fungsi `computeMinLineLength` lokal (baris 228–239)**

Hapus seluruh fungsi berikut dari Canvas.tsx:

```typescript
function computeMinLineLength(lineId: string): number {
  let min = 5  // always allow at least 5px
  for (const curve of curvesRef.current) {
    if (curve.fromLineId === lineId) {
      min = Math.max(min, curve.fromOffset)
    }
    if (curve.toLineId === lineId) {
      min = Math.max(min, curve.toOffset)
    }
  }
  return min
}
```

- [ ] **Step 3: Ganti semua pemanggilan `computeMinLineLength` — ada 2 lokasi**

Cek lokasi pastinya dulu:

```bash
grep -n "computeMinLineLength" /c/Users/Mirza/workspace/vehicle-path-demo/src/components/Canvas.tsx
```

Untuk setiap kemunculan (sekitar baris 325 dan 331), ganti:

```typescript
// SEBELUM
minLength: computeMinLineLength(target.lineId),
```

```typescript
// SESUDAH
// Math.max(5, ...) mempertahankan floor 5px yang sebelumnya di-hardcode di fungsi lokal
minLength: Math.max(5, computeMinLineLength(target.lineId, curvesRef.current)),
```

> **Catatan TypeScript:** `curvesRef.current` bertipe `StoredCurve[]`. `StoredCurve` secara struktural kompatibel dengan `Curve[]` dari library karena memiliki semua field required dari `Curve` (`fromLineId`, `toLineId`). Field `fromIsPercentage`/`toIsPercentage` tidak ada di `StoredCurve` → `undefined` → dievaluasi sebagai `false` oleh fungsi library → semua offset diperlakukan sebagai absolute. Behavior identik dengan fungsi lokal sebelumnya.

- [ ] **Step 4: Verifikasi TypeScript tidak ada error**

```bash
cd /c/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```

Expected: tidak ada error.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Mirza/workspace/vehicle-path-demo
git add src/components/Canvas.tsx
git commit -m "refactor: replace local computeMinLineLength with library function"
```

---

### Task 6: Ganti inline offset constraint dengan `getValidRearOffsetRange`

**Files:**
- Modify: `src/components/Canvas.tsx`

---

- [ ] **Step 1: Tambah `getValidRearOffsetRange` ke import library di Canvas.tsx**

Update import dari `vehicle-path2/core` — tambahkan `getValidRearOffsetRange`.

- [ ] **Step 2: Cek semua lokasi inline constraint yang akan diganti**

```bash
grep -n "totalSpacing\|axleSpacings.reduce" /c/Users/Mirza/workspace/vehicle-path-demo/src/components/Canvas.tsx
```

Expected: 3 lokasi di sekitar baris 485, 498, dan 558.

- [ ] **Step 3: Ganti Pola A — drag vehicle body (sekitar baris 485)**

```typescript
// SEBELUM
const totalSpacing = vehicle.axleSpacings.reduce((a, b) => a + b, 0)
const rearOffset = Math.max(0, Math.min(offset, lineLen - totalSpacing))
```

```typescript
// SESUDAH
const [, maxOffset] = getValidRearOffsetRange(line, vehicle.axleSpacings)
const rearOffset = Math.max(0, Math.min(offset, maxOffset))
```

> Cek apakah `lineLen` masih digunakan di bawahnya dalam blok yang sama. Jika tidak digunakan lagi, hapus baris `const lineLen = getLineLength(line)` juga.

- [ ] **Step 4: Ganti Pola B — drag vehicle-end (sekitar baris 498)**

```typescript
// SEBELUM
const totalSpacing = vehicle.axleSpacings.reduce((a, b) => a + b, 0)
const lineLen = getLineLength(hit.line)
const rearOffset = hit.offset
if (rearOffset < 0 || rearOffset > lineLen - totalSpacing) {
  setVehicleEndHover(null); return
}
```

```typescript
// SESUDAH
const [, maxOffset] = getValidRearOffsetRange(hit.line, vehicle.axleSpacings)
const rearOffset = hit.offset
if (rearOffset < 0 || rearOffset > maxOffset) {
  setVehicleEndHover(null); return
}
```

- [ ] **Step 5: Ganti Pola B kedua — hover vehicle-end (sekitar baris 558)**

Pola identik dengan Step 4, di blok `mode === 'vehicle-end'`:

```typescript
// SEBELUM
const totalSpacing = vehicle.axleSpacings.reduce((a, b) => a + b, 0)
const lineLen = getLineLength(hit.line)
const rearOffset = hit.offset
if (rearOffset < 0 || rearOffset > lineLen - totalSpacing) {
  setVehicleEndHover(null); return
}
```

```typescript
// SESUDAH
const [, maxOffset] = getValidRearOffsetRange(hit.line, vehicle.axleSpacings)
const rearOffset = hit.offset
if (rearOffset < 0 || rearOffset > maxOffset) {
  setVehicleEndHover(null); return
}
```

- [ ] **Step 6: Verifikasi TypeScript tidak ada error**

```bash
cd /c/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```

Expected: tidak ada error.

- [ ] **Step 7: Verifikasi visual di browser**

```bash
cd /c/Users/Mirza/workspace/vehicle-path-demo
npm run dev
```

Buka demo di browser. Pastikan:
- [ ] Drag vehicle body berjalan normal (vehicle mengikuti kursor, tidak keluar dari line)
- [ ] Set vehicle endpoint menampilkan preview hijau (valid) dan merah (no path / out of range)
- [ ] Curve attachment drag berjalan normal
- [ ] Animasi play/stop berjalan normal

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Mirza/workspace/vehicle-path-demo
git add src/components/Canvas.tsx
git commit -m "refactor: replace inline offset constraint with getValidRearOffsetRange from library"
```

---

## Ringkasan Perubahan

| Repo | File | Action |
|------|------|--------|
| library | `src/core/algorithms/geometry.test.ts` | **Create** — unit tests (tulis pertama, TDD) |
| library | `src/core/algorithms/geometry.ts` | **Create** — 3 fungsi baru |
| library | `src/core/index.ts` | **Modify** — tambah 3 exports di akhir file |
| demo | `src/geometry.ts` | **Delete** — seluruh file |
| demo | `src/components/Canvas.tsx` | **Modify** — update imports + hapus local function + ganti 3 lokasi inline logic |
