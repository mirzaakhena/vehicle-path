# vehicle-path

Library untuk simulasi pergerakan kendaraan dual-axle sepanjang jalur.

## Instalasi

```bash
npm install vehicle-path
```

## Quick Start

```tsx
import { useVehicleSimulation } from 'vehicle-path/react'

function App() {
  const sim = useVehicleSimulation({ wheelbase: 30 })

  // Buat jalur
  sim.addLine({ id: 'line1', start: [0, 0], end: [400, 0] })
  sim.addLine({ id: 'line2', start: [400, 0], end: [400, 300] })
  sim.connect('line1', 'line2')

  // Tambah kendaraan
  sim.addVehicle({ id: 'v1', lineId: 'line1', position: 0 })

  // Gerakkan ke tujuan
  sim.goto('v1', 'line2', 1.0)

  // Jalankan animasi
  sim.prepare()
  sim.tick(5) // panggil di animation loop
}
```

## API

### Setup

```ts
const sim = useVehicleSimulation({
  wheelbase: 30,                    // jarak antar roda
  tangentMode: 'proportional-40'    // mode kurva (opsional)
})
```

### Scene

```ts
sim.addLine({ id: 'line1', start: [0, 0], end: [400, 0] })
sim.updateLine('line1', { end: [500, 100] })
sim.removeLine('line1')
sim.clearScene()
```

### Koneksi

```ts
sim.connect('line1', 'line2')
sim.connect('line1', 'line2', { fromOffset: 0.8, toOffset: 0.2 })
sim.connect('line1', 'line2', { fromOffset: 150, fromIsPercentage: false, toOffset: 50, toIsPercentage: false })
sim.disconnect('line1', 'line2')
```

### Kendaraan

```ts
sim.addVehicle({ id: 'v1', lineId: 'line1', position: 0 })
sim.removeVehicle('v1')
sim.clearVehicles()
```

### Pergerakan

```ts
sim.goto('v1', 'line2', 1.0)  // 1.0 = ujung line
sim.goto('v1', 'line2', 0.5)  // 0.5 = tengah line
sim.clearQueue('v1')
```

### Animasi

```ts
sim.prepare()              // siapkan sebelum animasi
sim.tick(5)                // gerakkan 5 pixel per tick
sim.reset()                // kembali ke posisi awal
sim.isMoving()             // cek ada yang bergerak
```

### Load dari DSL

```ts
sim.loadFromDSL(`
  line1 : (0, 0) -> (400, 0)
  line2 : (400, 0) -> (400, 300)
  line1 -> line2
`)
```

### State

```ts
sim.lines          // semua line
sim.curves         // semua koneksi
sim.vehicles       // kendaraan (posisi awal)
sim.movingVehicles // kendaraan (posisi saat animasi)
```

## Contoh Lengkap

```tsx
import { useVehicleSimulation } from 'vehicle-path/react'
import { useEffect } from 'react'

function AnimatedVehicle() {
  const sim = useVehicleSimulation({ wheelbase: 30 })

  useEffect(() => {
    sim.addLine({ id: 'line1', start: [100, 100], end: [500, 100] })
    sim.addVehicle({ id: 'v1', lineId: 'line1', position: 0 })
    sim.goto('v1', 'line1', 1.0)
    sim.prepare()

    const animate = () => {
      if (sim.tick(3)) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [])

  return (
    <svg width={600} height={200}>
      {sim.movingVehicles.map(v => (
        <circle
          key={v.id}
          cx={v.rear.position.x}
          cy={v.rear.position.y}
          r={10}
          fill="blue"
        />
      ))}
    </svg>
  )
}
```

## License

MIT
