# Design: Library Enrichment & Demo Cleanup

**Date:** 2026-03-11
**Status:** Approved
**Scope:** Additive — tidak ada breaking changes

---

## Latar Belakang

Analisis hubungan antara `vehicle-path` (library) dan `vehicle-path-demo` menemukan:

1. Demo memiliki geometry utilities yang **duplikat** dari fungsi library
2. Library **belum memiliki** beberapa fungsi geometry yang general dan berguna untuk aplikasi editor manapun
3. PathEngine cascade update (ketika line diubah) diidentifikasi sebagai enhancement besar — **ditunda ke fase berikutnya (backlog)**

---

## Tujuan

- **Memperkaya API surface library** dengan geometry utilities yang general
- **Membersihkan demo** dari duplicate logic dengan menggantinya ke fungsi library

---

## Out of Scope

- PathEngine cascade update (line changed → auto re-compute curves & vehicle positions) → backlog
- Perubahan breaking pada API yang sudah ada
- Perubahan arsitektur PathEngine

---

## Section 1: Library Additions

### File Baru: `src/core/algorithms/geometry.ts`

Tiga pure functions, semua di-export dari `src/core/index.ts`.

#### `projectPointOnLine`

```typescript
projectPointOnLine(point: Point, line: Line): { offset: number; distance: number }
```

- Proyeksikan `point` secara tegak lurus ke line segment
- `offset`: jarak absolut dari `line.start` sepanjang garis (clamped ke `[0, lineLength]`)
- `distance`: jarak tegak lurus dari `point` ke garis (selalu positif)
- Use case: hit detection, snapping, placement validation di editor manapun

#### `getValidRearOffsetRange`

```typescript
getValidRearOffsetRange(line: Line, axleSpacings: number[]): [number, number]
```

- Hitung range `[min, max]` yang valid untuk offset rear axle pada sebuah line
- `min = 0`, `max = lineLength - sum(axleSpacings)`
- Jika `totalSpacing >= lineLength`, return `[0, 0]`
- Use case: validasi penempatan vehicle multi-axle pada line

#### `computeMinLineLength`

```typescript
computeMinLineLength(lineId: string, curves: Curve[], linesMap: Map<string, Line>): number
```

- Scan semua curves yang `fromLineId` atau `toLineId` === `lineId`
- Resolve offset (handle `isPercentage` via panjang line saat ini dari `linesMap`)
- Return nilai maksimum dari semua resolved offset — ini adalah panjang minimum agar line tidak "mengusir" curve offset keluar batas
- Jika tidak ada curves terkait, return `0`
- Use case: constraint saat user drag/resize sebuah line di editor

### Export

Ketiga fungsi di-export dari `src/core/index.ts` bersama exports yang sudah ada.

---

## Section 2: Demo Cleanup

### `src/geometry.ts` (demo)

| Fungsi Lama | Pengganti dari Library |
|-------------|----------------------|
| `getPointAtOffset(line, offset)` | `getPositionFromOffset(line, offset)` dari library |
| `projectPointOnLine(mouse, line)` | `projectPointOnLine(point, line)` dari library |

File `src/geometry.ts` di demo kemungkinan **dapat dihapus sepenuhnya** setelah kedua fungsinya digantikan import library.

### `src/components/Canvas.tsx` (demo)

| Logic | Sebelum | Sesudah |
|-------|---------|---------|
| Hit detection | local `projectPointOnLine` | library `projectPointOnLine` |
| Offset constraint inline | `Math.max(0, Math.min(offset, lineLen - totalSpacing))` | `getValidRearOffsetRange` dari library |
| Min line length | local `computeMinLineLength()` function | `computeMinLineLength` dari library |

### `src/App.tsx` (demo)

- Pastikan penggunaan `getPositionFromOffset` sudah konsisten (tidak ada sisa local implementation)

---

## Section 3: Testing

### Library — File Baru: `src/core/algorithms/geometry.test.ts`

| Fungsi | Test Cases |
|--------|-----------|
| `projectPointOnLine` | Point tepat di garis; point di luar garis (kiri/kanan); point di luar ujung (clamp ke 0 dan lineLength); point tegak lurus di tengah |
| `getValidRearOffsetRange` | Normal case; spacing = lineLength → `[0,0]`; spacing > lineLength → `[0,0]`; single axle; multiple axles |
| `computeMinLineLength` | Line tanpa curves → `0`; curve dengan absolute offset; curve dengan percentage offset; multiple curves pada satu line |

### Demo

Tidak perlu unit test baru. Cleanup adalah penggantian implementasi — behavior identik. Verifikasi cukup secara visual di browser setelah perubahan.

---

## Urutan Implementasi

1. Tulis `geometry.ts` di library + tests
2. Export dari `src/core/index.ts`
3. Build library (`npm run build`)
4. Update demo: hapus `src/geometry.ts`, update imports di `Canvas.tsx` dan `App.tsx`
5. Verifikasi visual di browser (demo berjalan normal)

---

## Deferred (Backlog)

- **PathEngine cascade update**: ketika line diubah, engine otomatis re-compute curves dan vehicle positions yang terkait. Saat ini logic ini ada manual di `App.tsx` demo. Akan dikerjakan di fase berikutnya.
