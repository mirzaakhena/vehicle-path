import { useRef, useEffect } from 'react'

/**
 * Animation Loop Utility
 *
 * A simple utility for creating animation loops with start/pause/stop controls.
 * Uses requestAnimationFrame for smooth animations.
 *
 * @example
 * ```typescript
 * import { createAnimationLoop } from 'vehicle-path/utils'
 *
 * const { start, pause, stop, isRunning } = createAnimationLoop({
 *   onTick: (deltaTime) => {
 *     // Update animation state
 *     tick(velocity)
 *   },
 *   onComplete: () => {
 *     console.log('Animation complete!')
 *   }
 * })
 *
 * // Start the animation
 * start()
 *
 * // Pause (can resume with start())
 * pause()
 *
 * // Stop completely (resets state)
 * stop()
 * ```
 */

export interface AnimationLoopOptions {
  /**
   * Called on each animation frame
   * @param deltaTime - Time elapsed since last frame in milliseconds
   * @returns true to continue, false to complete the animation
   */
  onTick: (deltaTime: number) => boolean | void

  /**
   * Called when the animation completes (onTick returns false)
   */
  onComplete?: () => void

  /**
   * Called when the animation starts
   */
  onStart?: () => void

  /**
   * Called when the animation pauses
   */
  onPause?: () => void

  /**
   * Called when the animation stops
   */
  onStop?: () => void
}

export interface AnimationLoopControls {
  /**
   * Start or resume the animation
   */
  start: () => void

  /**
   * Pause the animation (can be resumed with start())
   */
  pause: () => void

  /**
   * Stop the animation completely
   */
  stop: () => void

  /**
   * Check if the animation is currently running
   */
  isRunning: () => boolean

  /**
   * Check if the animation is paused
   */
  isPaused: () => boolean
}

/**
 * Create an animation loop with start/pause/stop controls
 *
 * @param options - Animation loop configuration
 * @returns Control functions for the animation loop
 */
export function createAnimationLoop(options: AnimationLoopOptions): AnimationLoopControls {
  const { onTick, onComplete, onStart, onPause, onStop } = options

  let animationFrameId: number | null = null
  let lastTimestamp: number | null = null
  let running = false
  let paused = false

  const loop = (timestamp: number) => {
    if (!running) return

    // Calculate delta time
    const deltaTime = lastTimestamp !== null ? timestamp - lastTimestamp : 0
    lastTimestamp = timestamp

    // Call onTick and check if we should continue
    const shouldContinue = onTick(deltaTime)

    if (shouldContinue === false) {
      // Animation complete
      running = false
      animationFrameId = null
      lastTimestamp = null
      onComplete?.()
      return
    }

    // Schedule next frame
    animationFrameId = requestAnimationFrame(loop)
  }

  const start = () => {
    if (running) return

    running = true
    paused = false
    lastTimestamp = null
    onStart?.()
    animationFrameId = requestAnimationFrame(loop)
  }

  const pause = () => {
    if (!running || paused) return

    running = false
    paused = true

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }

    onPause?.()
  }

  const stop = () => {
    running = false
    paused = false
    lastTimestamp = null

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }

    onStop?.()
  }

  const isRunning = () => running
  const isPaused = () => paused

  return {
    start,
    pause,
    stop,
    isRunning,
    isPaused
  }
}

/**
 * React hook for using animation loop with automatic cleanup
 *
 * @example
 * ```typescript
 * import { useAnimationLoop } from 'vehicle-path/utils'
 *
 * function MyComponent() {
 *   const { start, pause, stop, isRunning } = useAnimationLoop({
 *     onTick: (deltaTime) => tick(velocity),
 *     onComplete: () => setFinished(true)
 *   })
 *
 *   return (
 *     <button onClick={isRunning() ? pause : start}>
 *       {isRunning() ? 'Pause' : 'Start'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useAnimationLoop(options: AnimationLoopOptions): AnimationLoopControls {
  const controlsRef = useRef<AnimationLoopControls | null>(null)

  if (!controlsRef.current) {
    controlsRef.current = createAnimationLoop(options)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
    }
  }, [])

  return controlsRef.current
}
