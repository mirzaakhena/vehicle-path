/**
 * Configuration types for algorithm behavior
 */

/**
 * Tangent calculation mode for bezier curves
 * - proportional-40: 40% of distance for tangent length
 * - magic-55: 55.22% of distance (approximates circular arc)
 */
export type TangentMode = 'proportional-40' | 'magic-55'
