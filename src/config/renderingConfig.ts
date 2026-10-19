/**
 * Rendering and Visual Settings
 * Eliminates magic numbers for viewport, shaders, lighting, and textures.
 */

export const RENDERING_CONFIG = {
  /** PS1 internal low resolution height (240p/256p classic mode) */
  INTERNAL_RES_HEIGHT: 256,
  /** Minimum render width to prevent division by zero or extreme aspect collapses */
  MIN_RENDER_WIDTH: 160,
  /** PS1 vertex snapping grid resolution in screen-space */
  PS1_SNAP_RESOLUTION: {
    X: 160.0,
    Y: 120.0,
  },
  /** Quantization step for 15-bit color channel (PS1 color depth = 32 discrete shades) */
  COLOR_QUANTIZE_LEVELS: 32,
  /** Camera field of view and clipping planes */
  CAMERA: {
    FOV: 42,
    NEAR: 0.1,
    FAR: 55.0,
    DEFAULT_HEIGHT: 6.6,
    DEFAULT_DISTANCE: 5.6,
    LOOK_AT_HEIGHT: 0.75,
    LOOK_AT_OFFSET_Z: -0.2,
    LERP_SPEED: 6.0,
  },
  /**
   * Balanced PS1 Dungeon Lighting:
   * Ambient and directional lighting provide clear geometry visibility,
   * while the 7 warm torches cast dramatic amber/gold illumination and dithered falloffs.
   */
  LIGHTING: {
    AMBIENT_COLOR: 0x3d3a52,     // Atmospheric cool stone tint (brightened for visibility)
    AMBIENT_INTENSITY: 0.85,     // Generous ambient fill to eliminate pitch-black dead zones
    DIR_LIGHT_COLOR: 0xbed0ec,   // Moonlit overhead directional key light
    DIR_LIGHT_INTENSITY: 0.95,   // Crisp definition on armor and geometry
    DIR_LIGHT_POS: { x: 3.5, y: 12.0, z: 4.5 },
    HEMI_SKY_COLOR: 0x484c68,
    HEMI_GROUND_COLOR: 0x302822,
    HEMI_INTENSITY: 0.65,
    FOG_COLOR: 0x181724,        // Soft horizon fog that blends into the background
    FOG_DENSITY: 0.024,         // Eased from 0.042 so the torches easily illuminate the whole room
  },
  /** Dynamic spark burst point light (sparks momentarily illuminate knight and dummy) */
  SPARK_LIGHT: {
    COLOR: 0xffeedd,
    INTENSITY: 5.5,
    DISTANCE: 4.5,
    DURATION: 0.08, // 80ms flash
  },
  /** Background clear color matching dungeon horizon */
  CLEAR_COLOR: 0x181724,
  /** Tone mapping exposure for vibrant, high-readability PS1 visuals */
  TONE_MAPPING_EXPOSURE: 1.30,
} as const;

/** Bayer 4x4 matrix for ordered color dithering */
export const BAYER_MATRIX_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;
