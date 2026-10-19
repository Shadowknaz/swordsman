/**
 * Combat & Kinematics Configuration
 * Replaces all magic numbers from the original monolithic script.
 */

export const ARENA_CONFIG = {
  RADIUS: 5.4,
  MAX_PLAYER_RADIUS: 4.75, // Radius - 0.65 margin
  FLOOR_HEIGHT_OFFSET: -0.12,
  BASE_HEIGHT_OFFSET: -0.92,
  CURB_COUNT: 16,
  CURB_SIZE: { width: 1.75, height: 0.26, depth: 0.42 },
  PILLAR_POSITIONS: [
    // 1. Back-Center High Altar Torch (illuminates the back center & dais)
    { x: 0.0, z: -4.5, height: 3.3, hasTorch: true, torchColor: 0xffaa44, haloSize: 1.9 },
    // 2. Back-Left Pillar Torch (crimson flame)
    { x: -3.8, z: -2.6, height: 2.8, hasTorch: true, torchColor: 0xff6622, haloSize: 1.7 },
    // 3. Back-Right Pillar Torch (warm amber)
    { x: 3.8, z: -2.6, height: 2.8, hasTorch: true, torchColor: 0xffaa33, haloSize: 1.7 },
    // 4. Mid-Left Brazier (golden fire)
    { x: -4.4, z: 0.4, height: 2.3, hasTorch: true, torchColor: 0xff8833, haloSize: 1.6 },
    // 5. Mid-Right Brazier (rich flame)
    { x: 4.4, z: 0.4, height: 2.3, hasTorch: true, torchColor: 0xff9933, haloSize: 1.6 },
    // 6. Front-Left Torch (illuminates hero and dummy from the front-left)
    { x: -3.1, z: 3.2, height: 2.0, hasTorch: true, torchColor: 0xffaa44, haloSize: 1.6 },
    // 7. Front-Right Torch (illuminates hero and dummy from the front-right)
    { x: 3.1, z: 3.2, height: 2.0, hasTorch: true, torchColor: 0xffbb55, haloSize: 1.6 },
  ],
  TORCH: {
    LIGHT_COLOR: 0xff9933,
    LIGHT_INTENSITY: 6.8, // Enhanced brightness so torches clearly illuminate the entire chamber
    LIGHT_DISTANCE: 28.0, // Long-range light reach across floor and characters
    LIGHT_DECAY: 1.05,    // Gentle attenuation for rich ambient bleed
  },
} as const;

export const HERO_CONFIG = {
  INITIAL_POSITION: { x: 0, y: 0, z: 2.3 },
  INITIAL_ANGLE: Math.PI,
  MIN_SEPARATION_FROM_DUMMY: 0.85,

  // Speeds in m/s
  SPEED: {
    FORWARD: 2.45,
    BACKPEDAL: 1.25,
    STRAFE: 1.18,
    DIAGONAL_PENALTY: 0.78,
    DASH_FORWARD: 5.2,
    DASH_BACKWARD: 4.6,
  },

  // Turn speed limits in rad/s
  ROTATION: {
    MAX_TURN_SPEED_IDLE: 2.85,
    MAX_TURN_SPEED_ATTACK: 2.35,
    TURN_RESPONSE_LERP: 10.0,
    SWING_BODY_TORQUE_FACTOR: 0.065,
    HEAD_TRACKING_RATIO: 0.6,
    MAX_HEAD_YAW: 0.45,
  },

  // Center of Mass & Balance Springs
  BALANCE: {
    SPRING_K: 38.0,
    DAMPING: 6.2,
    MAX_TILT_RAD: 0.55,
    GROUND_TRACTION_NORMAL: 9.0,
    GROUND_TRACTION_STUMBLED: 4.2,
  },

  // Timers & Cooldowns in seconds
  TIMERS: {
    DASH_COOLDOWN: 0.65,
    DASH_DURATION: 0.18,
    PARRY_WINDOW: 0.22,
    COMBO_RESET: 0.55,
  },

  // Longsword physical model
  SWORD_GEOMETRY: {
    BLADE_LENGTH: 1.18,
    SWEETSPOT_START: 0.62,
    SWEETSPOT_END: 0.95,
    BASE_LOCAL: { x: 0, y: 0.08, z: 0 },
    MID_LOCAL: { x: 0, y: 0.65, z: 0 },
    TIP_LOCAL: { x: 0, y: 1.22, z: 0 },
  },
} as const;

export const DUMMY_CONFIG = {
  INITIAL_POSITION: { x: 0, y: 0, z: -0.4 },
  COLLISION_RADIUS: 0.38,
  SPRING_K: 44.0,
  SPRING_DAMPING: 5.2,
  ROTATIONAL_FRICTION: 1.6,
  MAX_TILT_RAD: 0.48,

  // Counterweight flail
  FLAIL_TRIGGER_SPIN_VELOCITY: 3.2,
  FLAIL_BLADE_PARRY_RADIUS: 0.42,
  FLAIL_HERO_HIT_RADIUS: 0.58,
} as const;

export type AttackPhase = 'idle' | 'startup' | 'active' | 'recovery';

export interface StrikePhaseTiming {
  startup: number;   // Wind-up chamber, cannot be canceled, deals no damage
  active: number;    // Swept blade damage window, collision active
  recovery: number;  // Follow-through return to stance, CAN BE CANCELED by dodge or block!
  total: number;
}

export const STRIKE_PHASES: Record<string, StrikePhaseTiming> = {
  cleave: { startup: 0.08, active: 0.16, recovery: 0.22, total: 0.46 },
  overhead: { startup: 0.12, active: 0.18, recovery: 0.26, total: 0.56 },
  undercut: { startup: 0.09, active: 0.16, recovery: 0.24, total: 0.49 },
  thrust: { startup: 0.07, active: 0.15, recovery: 0.20, total: 0.42 },
  none: { startup: 0, active: 0, recovery: 0, total: 0 },
};

export const INPUT_BUFFER_CONFIG = {
  WINDOW_MS: 150, // 100-150ms buffering queue window
} as const;

export const TARGET_LOCK_CONFIG = {
  CAM_DISTANCE_OFFSET: 3.2,
  CAM_HEIGHT: 3.9,
  CAM_LERP_SPEED: 7.5,
  RETICLE_Y_OFFSET: 2.15,
  RETICLE_PULSE_SPEED: 6.0,
} as const;

export const COMBAT_CONFIG = {
  COLLISION: {
    SWEETSPOT_MASS_KG: 1.45,
    COB_MASS_KG: 1.25,
    FORTE_MASS_KG: 1.85,
    POINT_MASS_KG: 1.35,
    FLAT_HIT_DAMAGE_MULTIPLIER: 0.32,
    FLAT_HIT_EDGE_ALIGN_THRESHOLD: 0.35,
    HIT_COOLDOWN_SEC: 0.22,
    FORTE_MIN_VELOCITY: 0.45,
    MIN_STRIKE_VELOCITY: 0.85,
  },
  GUARD_ZONES: {
    HIGH_RADIUS_MAX: 1.45,
    HIGH_ANGLE_LIMIT_RAD: 0.55,
    LOW_RADIUS_MIN: 2.45,
  },
  GESTURES: {
    DRAG_THRESHOLD_MIN: 0.25,
    OVERHEAD_DRAG_FORWARD_MAX: -0.22,
    OVERHEAD_DRAG_RIGHT_MAX: 0.45,
    UNDERCUT_DRAG_FORWARD_MIN: 0.18,
    UNDERCUT_DRAG_RIGHT_MIN: 0.22,
    THRUST_DRAG_FORWARD_MIN: 0.35,
    THRUST_DRAG_RIGHT_MAX: 0.32,
    LATERAL_CLEAVE_DRAG_MIN: 0.32,
    QUICK_CLICK_TIME_MS: 260,
  },
  SWORD_SPRINGS: {
    IDLE: { stiffness: 42.0, damping: 7.2 },
    DUAL_MOUSE_VERTICAL: { stiffness: 58.0, damping: 8.5 },
    ACTIVE_STRIKE_COMMIT: { stiffness: 72.0, damping: 9.2 },
    ACTIVE_SWING: { stiffness: 52.0, damping: 7.8 },
    RMB_THRUST: { stiffness: 56.0, damping: 8.0 },
  },
} as const;

export const VFX_CONFIG = {
  PARTICLE_POOL_SIZE: 36,
  DECAL_POOL_SIZE: 16,
  TRAIL_SEGMENTS: 12,
  MIN_TRAIL_SPEED: 4.5,
} as const;
