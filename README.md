# vehicle-path

A library for simulating dual-axle vehicle movement along paths composed of lines and Bezier curves.

## Features

- Dual-axle vehicle physics simulation (rear axle leads, front axle follows)
- Path finding through connected line segments and curves
- Smooth Bezier curve transitions between lines
- Multiple tangent modes for curve generation
- Event system for movement tracking
- React hooks for easy integration
- DSL for text-based scene definition

## Installation

```bash
npm install vehicle-path
```

## Architecture

The library is organized into three layers, each with its own entry point:

```
vehicle-path
├── core    → Pure algorithms and types (no dependencies)
├── utils   → Optional utilities (DSL parser, event emitter, animation loop)
└── react   → React hooks and providers
```

### Layer 1: Core (`vehicle-path/core`)

**Purpose:** Pure algorithms and TypeScript types with zero external dependencies.

Use this layer if you want to:
- Build your own animation loop
- Integrate with a non-React framework
- Use only the math and path-finding algorithms

```typescript
import {
  buildGraph,
  findPath,
  distance,
  createBezierCurve
} from 'vehicle-path/core'

import type { Point, Line, Vehicle } from 'vehicle-path/core'
```

**What's included:**
- **Types:** `Point`, `Line`, `Curve`, `Vehicle`, `GotoCommand`, etc.
- **Path Finding:** `buildGraph()`, `findPath()`, `canReachTarget()`
- **Math Utilities:** `distance()`, `getPointOnLine()`, `getPointOnBezier()`, `createBezierCurve()`
- **Vehicle Movement:** `updateAxlePosition()`, `prepareCommandPath()`, `handleArrival()`

### Layer 2: Utils (`vehicle-path/utils`)

**Purpose:** Optional utilities that can be replaced with your own implementations.

```typescript
import {
  parseSceneDSL,
  VehicleEventEmitter,
  createAnimationLoop
} from 'vehicle-path/utils'
```

**What's included:**

| Utility | Description |
|---------|-------------|
| `dsl-parser` | Parse/generate DSL text for scenes, vehicles, and movements |
| `event-emitter` | Pub/sub event system for vehicle state changes |
| `animation-loop` | requestAnimationFrame wrapper with start/pause/stop |
| `vehicle-helpers` | Validation and ID generation utilities |

### Layer 3: React (`vehicle-path/react`)

**Purpose:** React hooks and context providers for seamless integration.

```typescript
import {
  useVehiclePath,
  useVehicleMovement,
  VehicleEventProvider
} from 'vehicle-path/react'
```

**What's included:**

| Category | Hooks |
|----------|-------|
| **Core Hooks** | `useScene`, `useVehicles`, `useMovement`, `useVehicleMovement` |
| **Coordinated API** | `useVehiclePath` (combines all above with edge case handling) |
| **DSL Hooks** | `useSceneDefinition`, `useInitialMovement`, `useMovementSequence` |
| **Providers** | `VehicleEventProvider`, `useVehicleEvent` |

## Quick Start

### Using the Main Entry Point

The main entry point re-exports everything from all layers:

```typescript
import {
  // Types
  type Point,
  type Line,
  type Vehicle,

  // React hooks
  useVehiclePath,
  useVehicleMovement,

  // Utils
  parseSceneDSL,
  VehicleEventEmitter
} from 'vehicle-path'
```

### Basic React Example

```tsx
import { useVehiclePath } from 'vehicle-path/react'

function VehicleSimulator() {
  const {
    scene,
    vehicles,
    movement,
    simulation
  } = useVehiclePath({ wheelbase: 30 })

  // Define the scene
  useEffect(() => {
    scene.setScene({
      lines: [
        { id: 'line001', start: [100, 100], end: [500, 100] },
        { id: 'line002', start: [500, 100], end: [500, 400] }
      ],
      connections: [
        { from: 'line001', to: 'line002' }
      ]
    })
  }, [])

  // Add a vehicle
  const handleAddVehicle = () => {
    vehicles.addVehicle({
      id: 'v1',
      lineId: 'line001',
      position: 0  // 0-1 range (0 = start, 1 = end)
    })
  }

  // Queue a movement command
  const handleMove = () => {
    movement.queueMovement('v1', {
      targetLineId: 'line002',
      targetPosition: 1.0  // Move to end of line002
    })
  }

  // Start simulation
  const handleStart = () => {
    if (simulation.prepare()) {
      // Run animation loop
      const animate = () => {
        if (simulation.tick(1)) {
          requestAnimationFrame(animate)
        }
      }
      requestAnimationFrame(animate)
    }
  }

  return (
    <canvas>
      {/* Render vehicles using simulation.movingVehicles */}
    </canvas>
  )
}
```

### Using DSL for Scene Definition

```typescript
import { parseSceneDSL, parseVehiclesDSL, parseMovementDSL } from 'vehicle-path/utils'

// Define scene with DSL
const sceneDSL = `
  # Lines
  line001 : (100, 100) -> (500, 100)
  line002 : (500, 100) -> (500, 400)

  # Connections (curves)
  line001 -> line002
`

const vehiclesDSL = `
  v1 start line001 0%
  v2 start line002 50%
`

const movementDSL = `
  v1 goto line002 100%
  v2 goto line001 0% --wait
`

const scene = parseSceneDSL(sceneDSL)
const vehicles = parseVehiclesDSL(vehiclesDSL)
const movements = parseMovementDSL(movementDSL)
```

### Event Handling

```tsx
import { VehicleEventProvider, useVehicleEvent } from 'vehicle-path/react'

function App() {
  return (
    <VehicleEventProvider>
      <VehicleSimulator />
    </VehicleEventProvider>
  )
}

function VehicleSimulator() {
  // Subscribe to vehicle events
  useVehicleEvent('commandComplete', (info) => {
    console.log(`Vehicle ${info.vehicleId} arrived at destination`)
    console.log('Payload:', info.payload)
  })

  useVehicleEvent('stateChange', (info) => {
    console.log(`Vehicle ${info.vehicleId}: ${info.from} -> ${info.to}`)
  })

  // ...
}
```

## Concepts

### Dual-Axle Vehicle Model

Vehicles have two axles:
- **Rear axle (R):** Leads the movement, follows the path directly
- **Front axle (F):** Follows the rear axle at a fixed distance (wheelbase)

This creates realistic turning behavior where the front of the vehicle "swings out" when navigating curves.

### Path Segments

A path consists of:
- **Lines:** Straight segments defined by start and end points
- **Curves:** Bezier curves that connect lines (auto-generated based on tangent mode)

### Tangent Modes

When generating curves between lines:
- `proportional-40`: Tangent length is 40% of the shorter line
- `magic-55`: Tangent length is 55% of the shorter line (smoother curves)

### Vehicle States

| State | Description |
|-------|-------------|
| `idle` | Not moving, no commands queued |
| `moving` | Currently executing a goto command |
| `waiting` | Paused at destination (when `--wait` flag is used) |
| `arrived` | Completed all commands |

## Project Structure

```
src/
├── core/                    # Layer 1: Pure algorithms
│   ├── algorithms/
│   │   ├── math.ts          # Geometry and Bezier math
│   │   ├── pathFinding.ts   # Graph building and path search
│   │   └── vehicleMovement.ts
│   ├── types/
│   │   ├── geometry.ts      # Point, Line, Curve
│   │   ├── vehicle.ts       # Vehicle, GotoCommand
│   │   ├── movement.ts      # Movement state types
│   │   └── api.ts           # Input types for APIs
│   └── index.ts
│
├── utils/                   # Layer 2: Optional utilities
│   ├── __tests__/
│   ├── animation-loop.ts
│   ├── dsl-parser.ts
│   ├── event-emitter.ts
│   ├── vehicle-helpers.ts
│   └── index.ts
│
├── react/                   # Layer 3: React integration
│   ├── hooks/               # Core programmatic hooks
│   │   ├── useScene.ts
│   │   ├── useVehicles.ts
│   │   ├── useMovement.ts
│   │   ├── useVehicleMovement.ts
│   │   └── useVehiclePath.ts
│   ├── dsl-hooks/           # DSL wrapper hooks
│   │   ├── useSceneDefinition.ts
│   │   ├── useInitialMovement.ts
│   │   └── useMovementSequence.ts
│   ├── providers/
│   │   └── useVehicleEvents.tsx
│   └── index.ts
│
└── index.ts                 # Main entry (re-exports all)
```

## License

MIT
