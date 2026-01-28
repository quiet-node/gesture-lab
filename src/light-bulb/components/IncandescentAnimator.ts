/**
 * @fileoverview IncandescentAnimator - Physics-based light transition animator.
 *
 * Simulates realistic incandescent bulb behavior:
 * - Non-linear warm-up curve (fast initial rise, gradual plateau)
 * - Color temperature shift (cold → warm white)
 * - Physical luminous power values
 *
 * Based on real incandescent filament thermal characteristics where the
 * tungsten filament heats up over ~50-200ms following an exponential curve.
 *
 * @module light-bulb/components/IncandescentAnimator
 */

import gsap from 'gsap';

/**
 * Callback invoked on each animation frame with current light state.
 */
export interface AnimationUpdateCallback {
  (state: LightAnimationState): void;
}

/**
 * Represents the current state of the light animation.
 */
export interface LightAnimationState {
  /** Normalized intensity (0-1) */
  intensity: number;

  /** Color temperature factor (0 = cold, 1 = warm) */
  colorTemperature: number;

  /** Whether the light is fully on */
  isFullyOn: boolean;

  /** Whether the light is fully off */
  isFullyOff: boolean;

  /** Current animation phase */
  phase: AnimationPhase;
}

/**
 * Animation phases for the light transition.
 */
export enum AnimationPhase {
  /** No animation in progress */
  IDLE = 'idle',
  /** Light is warming up (turning on) */
  WARMING_UP = 'warming_up',
  /** Light is cooling down (turning off) */
  COOLING_DOWN = 'cooling_down',
}

/**
 * Configuration for incandescent animation behavior.
 */
export interface IncandescentConfig {
  /** Duration for warm-up (turn on) animation in seconds */
  warmUpDuration: number;

  /** Duration for cool-down (turn off) animation in seconds */
  coolDownDuration: number;

  /** Target luminous power when fully on (in arbitrary units, scaled 0-1) */
  targetPower: number;

  /** Minimum power when off (for subtle ambient glow) */
  minPower: number;
}

/** Default configuration based on real incandescent bulb behavior */
const DEFAULT_CONFIG: IncandescentConfig = {
  warmUpDuration: 0.18, // ~180ms for realistic filament heating
  coolDownDuration: 0.25, // Slightly slower cooling due to thermal inertia
  targetPower: 1.0,
  minPower: 0,
};

/**
 * Manages physics-based incandescent light transitions.
 *
 * Real incandescent filaments don't turn on/off instantly. The tungsten
 * filament heats up over time, producing a characteristic curve:
 * - Fast initial rise (0-50ms): ~60% intensity
 * - Gradual plateau (50-150ms): Ramps to 100%
 * - Color shift: Dim orange → bright warm white
 *
 * @example
 * ```typescript
 * const animator = new IncandescentAnimator((state) => {
 *   pointLight.intensity = state.intensity * 2.5;
 *   filamentMaterial.emissiveIntensity = state.intensity * 5.0;
 * });
 *
 * animator.turnOn();  // Animates warm-up
 * animator.turnOff(); // Animates cool-down
 * ```
 */
export class IncandescentAnimator {
  private readonly config: IncandescentConfig;
  private readonly onUpdate: AnimationUpdateCallback;

  private currentState: LightAnimationState;
  private activeTween: gsap.core.Tween | null = null;
  private targetOn: boolean = false;

  /**
   * Creates a new incandescent animator.
   *
   * @param onUpdate - Callback invoked on each animation frame
   * @param config - Optional configuration overrides
   */
  constructor(onUpdate: AnimationUpdateCallback, config: Partial<IncandescentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onUpdate = onUpdate;

    this.currentState = {
      intensity: this.config.minPower,
      colorTemperature: 0,
      isFullyOn: false,
      isFullyOff: true,
      phase: AnimationPhase.IDLE,
    };
  }

  /**
   * Animates the light turning on with realistic warm-up curve.
   *
   * @returns Promise that resolves when animation completes
   */
  turnOn(): Promise<void> {
    return new Promise((resolve) => {
      this.killActiveTween();
      this.targetOn = true;

      this.currentState.phase = AnimationPhase.WARMING_UP;
      this.currentState.isFullyOff = false;

      const animState = { value: this.currentState.intensity };

      this.activeTween = gsap.to(animState, {
        value: this.config.targetPower,
        duration: this.config.warmUpDuration,
        // Ease-out-expo: Fast initial rise, gradual plateau
        // Mimics tungsten filament thermal characteristics
        ease: 'power3.out',
        onUpdate: () => {
          this.currentState.intensity = animState.value;
          this.currentState.colorTemperature = this.calculateColorTemperature(animState.value);
          this.currentState.isFullyOn = animState.value >= this.config.targetPower - 0.001;
          this.onUpdate(this.currentState);
        },
        onComplete: () => {
          this.currentState.intensity = this.config.targetPower;
          this.currentState.colorTemperature = 1;
          this.currentState.isFullyOn = true;
          this.currentState.phase = AnimationPhase.IDLE;
          this.onUpdate(this.currentState);
          resolve();
        },
      });
    });
  }

  /**
   * Animates the light turning off with realistic cool-down curve.
   *
   * @returns Promise that resolves when animation completes
   */
  turnOff(): Promise<void> {
    return new Promise((resolve) => {
      this.killActiveTween();
      this.targetOn = false;

      this.currentState.phase = AnimationPhase.COOLING_DOWN;
      this.currentState.isFullyOn = false;

      const animState = { value: this.currentState.intensity };

      this.activeTween = gsap.to(animState, {
        value: this.config.minPower,
        duration: this.config.coolDownDuration,
        // Ease-in-cubic: Natural cooling curve (thermal inertia)
        ease: 'power2.in',
        onUpdate: () => {
          this.currentState.intensity = animState.value;
          this.currentState.colorTemperature = this.calculateColorTemperature(animState.value);
          this.currentState.isFullyOff = animState.value <= this.config.minPower + 0.001;
          this.onUpdate(this.currentState);
        },
        onComplete: () => {
          this.currentState.intensity = this.config.minPower;
          this.currentState.colorTemperature = 0;
          this.currentState.isFullyOff = true;
          this.currentState.phase = AnimationPhase.IDLE;
          this.onUpdate(this.currentState);
          resolve();
        },
      });
    });
  }

  /**
   * Toggles the light state.
   *
   * @returns Promise that resolves when animation completes
   */
  toggle(): Promise<void> {
    return this.targetOn ? this.turnOff() : this.turnOn();
  }

  /**
   * Immediately sets the light state without animation.
   *
   * @param on - Whether the light should be on
   */
  setImmediate(on: boolean): void {
    this.killActiveTween();
    this.targetOn = on;

    const intensity = on ? this.config.targetPower : this.config.minPower;

    this.currentState = {
      intensity,
      colorTemperature: on ? 1 : 0,
      isFullyOn: on,
      isFullyOff: !on,
      phase: AnimationPhase.IDLE,
    };

    this.onUpdate(this.currentState);
  }

  /**
   * Gets the current animation state.
   *
   * @returns Current light animation state
   */
  getState(): Readonly<LightAnimationState> {
    return this.currentState;
  }

  /**
   * Checks if the light is currently on or transitioning to on.
   *
   * @returns True if target state is ON
   */
  isOn(): boolean {
    return this.targetOn;
  }

  /**
   * Calculates color temperature factor based on intensity.
   * Simulates black-body radiation color shift during filament heating.
   *
   * @param intensity - Current intensity (0-1)
   * @returns Color temperature factor (0 = cold, 1 = warm)
   */
  private calculateColorTemperature(intensity: number): number {
    // Non-linear curve: color shifts faster than intensity rises
    // Based on Wien's displacement law approximation
    return Math.pow(intensity, 0.6);
  }

  /**
   * Kills any active animation tween.
   */
  private killActiveTween(): void {
    if (this.activeTween) {
      this.activeTween.kill();
      this.activeTween = null;
    }
  }

  /**
   * Cleans up resources.
   */
  dispose(): void {
    this.killActiveTween();
  }
}
