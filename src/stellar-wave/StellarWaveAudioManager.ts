/**
 * StellarWaveAudioManager
 *
 * Lightweight audio manager for Stellar Wave ripple sound effects.
 * Uses the Web Audio API directly for efficient concurrent playback
 * without Three.js dependencies.
 */

/** Configuration for synthesized ripple sounds */
interface RippleSoundConfig {
  /** Playback volume (0.0 to 1.0) */
  volume: number;
}

/** Default configuration */
const DEFAULT_CONFIG: RippleSoundConfig = {
  volume: 0.3,
};

/**
 * Manages audio playback for Stellar Wave effects.
 * Uses procedural synthesis for consistent, high-performance "Stellar" sound design.
 */
export class StellarWaveAudioManager {
  private audioContext: AudioContext | null = null;
  private config: RippleSoundConfig;
  private isInitialized: boolean = false;
  private activeNodes: Set<AudioScheduledSourceNode> = new Set();
  private noiseBuffer: AudioBuffer | null = null;

  constructor(config: Partial<RippleSoundConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the audio context.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.audioContext = new AudioContext();

      // Generate 1 second of White Noise for soft textures
      const bufferSize = this.audioContext.sampleRate;
      this.noiseBuffer = this.audioContext.createBuffer(
        1,
        bufferSize,
        this.audioContext.sampleRate
      );
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.isInitialized = true;
      console.log('[StellarWaveAudioManager] Initialized (Procedural Noise Mode)');
    } catch (error) {
      console.error('[StellarWaveAudioManager] Failed to initialize:', error);
    }
  }

  /**
   * Play the synthesized ripple sound effect.
   * "Ethereal Surge" architecture:
   * - Internalized Warm Tones (220Hz - 440Hz range)
   * - Soft Surge Attack (No sharp impact)
   * - Deep Space LowPass (Removes piercing frequencies)
   * - Slow Watery Tremolo (The "Wavy" texture)
   * - Balanced Volume (Quieter and pop-free)
   */
  /**
   * "Ethereal Surge" architecture:
   * - Internalized Warm Tones (220Hz - 440Hz range)
   * - Dual-Gate Architecture (Zero-pop release)
   * - Ultra-low Volume (Calibrated to be very subtle)
   */
  playCosmicPulse(): void {
    if (!this.isInitialized || !this.audioContext) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const duration = 2.5;

      // 1. Create Nodes
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const waveLFO = ctx.createOscillator();

      const lfoGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const modulatedGain = ctx.createGain(); // Node handled by the LFO
      const masterGate = ctx.createGain(); // Node handled by the master envelope

      // 2. Configure Warm Sine Tones
      osc1.frequency.value = 220;
      osc2.frequency.value = 330;
      osc3.frequency.value = 440;
      [osc1, osc2, osc3].forEach((o) => (o.type = 'sine'));

      // 3. Configure the "Wavy" Engine (Slow Watery Tremolo)
      waveLFO.type = 'sine';
      waveLFO.frequency.value = 3;
      lfoGain.gain.value = 0.2;

      // LFO modulates the internal modulatedGain
      modulatedGain.gain.value = 0.5; // Base level for LFO to wiggle
      waveLFO.connect(lfoGain);
      lfoGain.connect(modulatedGain.gain);

      // 4. Configure Filter
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      filter.Q.value = 1;

      // 5. Volume Envelope (Balanced and Zero-Pop)
      // Capped at 9% of global volume for a gentle ambient presence
      const peakVolume = this.config.volume * 0.09;
      masterGate.gain.setValueAtTime(0, now);
      masterGate.gain.linearRampToValueAtTime(peakVolume, now + 0.3);
      // Use setTargetAtTime for the smoothest possible decay to zero
      masterGate.gain.setTargetAtTime(0, now + 0.8, 0.3);

      // 6. Connect Graph
      // Chain: Oscs -> Filter -> LFO Gain -> Master Gate -> Out
      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      filter.connect(modulatedGain);
      modulatedGain.connect(masterGate);
      masterGate.connect(ctx.destination);

      // 7. Fire with Safe Buffer
      // Stop oscillators 1s later to ensure the Master Gate has fully faded out
      const stopTime = now + duration + 1.0;
      [osc1, osc2, osc3, waveLFO].forEach((node) => {
        node.start(now);
        node.stop(stopTime);
      });

      osc1.onended = () => {
        [osc1, osc2, osc3, waveLFO].forEach((n) => n.disconnect());
        lfoGain.disconnect();
        filter.disconnect();
        modulatedGain.disconnect();
        masterGate.disconnect();
      };
    } catch (e) {
      console.error('[StellarWaveAudioManager] Failed to play ethereal ripple', e);
    }
  }

  /**
   * Stop all currently playing sounds.
   */
  stopAll(): void {
    this.activeNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // Node may have already stopped
      }
    });
    this.activeNodes.clear();

    // Stop force field sound if active
    this.stopForceField();

    // Stop vortex sound if active
    this.stopVortex();

    // Stop quasar surge sound if active
    this.stopQuasarSurgeCharge();

    // Stop cosmic strings tension if active
    this.stopCosmicStringTension();
  }

  // --- Nebula Vortex Sound (Left Hand Fist) ---
  // Swirling drone: Mid-range saw/sine + Fast LFO (rotation) + Bandpass
  private vortexOsc1: OscillatorNode | null = null;
  private vortexOsc2: OscillatorNode | null = null;
  private vortexLFO: OscillatorNode | null = null;
  private vortexFilter: BiquadFilterNode | null = null;
  private vortexGain: GainNode | null = null;
  private vortexMasterGain: GainNode | null = null;
  private vortexLFO_Gain: GainNode | null = null;
  private isVortexPlaying: boolean = false;

  /**
   * Start the "Nebula Vortex" sound.
   * A swirling, airy texture that implies rapid rotation.
   */
  startVortex(): void {
    if (!this.isInitialized || !this.audioContext || this.isVortexPlaying) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // 1. Create Nodes
      this.vortexOsc1 = ctx.createOscillator();
      this.vortexOsc2 = ctx.createOscillator();
      this.vortexLFO = ctx.createOscillator();
      this.vortexLFO_Gain = ctx.createGain();
      this.vortexFilter = ctx.createBiquadFilter();
      this.vortexGain = ctx.createGain();
      this.vortexMasterGain = ctx.createGain();

      // 2. Configure Oscillators
      // Airy, higher pitched than gravity
      this.vortexOsc1.type = 'sawtooth';
      this.vortexOsc1.frequency.value = 180;
      this.vortexOsc2.type = 'sine';
      this.vortexOsc2.frequency.value = 182; // Detune

      // 3. Configure LFO
      // Fast rotation (10Hz) to simulate spinning
      this.vortexLFO.type = 'sine';
      this.vortexLFO.frequency.value = 10;
      this.vortexLFO_Gain.gain.value = 0.3;

      // 4. Configure Filter
      // Bandpass to isolate the "windy" frequencies
      this.vortexFilter.type = 'bandpass';
      this.vortexFilter.frequency.value = 400;
      this.vortexFilter.Q.value = 1;

      // 5. Configure Gains
      this.vortexGain.gain.value = 0.3;
      this.vortexMasterGain.gain.setValueAtTime(0, now);
      this.vortexMasterGain.gain.linearRampToValueAtTime(0.2, now + 0.5);

      // 6. Connect Graph
      this.vortexLFO.connect(this.vortexLFO_Gain);
      this.vortexLFO_Gain.connect(this.vortexGain.gain);

      this.vortexOsc1.connect(this.vortexFilter);
      this.vortexOsc2.connect(this.vortexFilter);
      this.vortexFilter.connect(this.vortexGain);
      this.vortexGain.connect(this.vortexMasterGain);
      this.vortexMasterGain.connect(ctx.destination);

      // 7. Start
      this.vortexOsc1.start(now);
      this.vortexOsc2.start(now);
      this.vortexLFO.start(now);

      this.isVortexPlaying = true;
    } catch (e) {
      console.error('[StellarWaveAudioManager] Failed to start vortex sound', e);
      this.stopVortex();
    }
  }

  /**
   * Stop the vortex sound.
   */
  stopVortex(): void {
    if (!this.isVortexPlaying || !this.audioContext || !this.vortexMasterGain) {
      return;
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const timeConstant = 0.1;
    const stopDelay = 0.5;

    this.vortexMasterGain.gain.setTargetAtTime(0, now, timeConstant);

    if (this.vortexLFO_Gain) {
      this.vortexLFO_Gain.gain.setTargetAtTime(0, now, 0.05);
    }

    const stopTime = now + stopDelay;
    [this.vortexOsc1, this.vortexOsc2, this.vortexLFO].forEach((node) => {
      if (node) {
        try {
          node.stop(stopTime);
        } catch {
          /* ignore */
        }
      }
    });

    setTimeout(
      () => {
        if (this.isVortexPlaying) return;

        this.vortexOsc1?.disconnect();
        this.vortexOsc2?.disconnect();
        this.vortexLFO?.disconnect();
        this.vortexLFO_Gain?.disconnect();
        this.vortexFilter?.disconnect();
        this.vortexGain?.disconnect();
        this.vortexMasterGain?.disconnect();

        this.vortexOsc1 = null;
        this.vortexOsc2 = null;
        this.vortexLFO = null;
        this.vortexLFO_Gain = null;
        this.vortexFilter = null;
        this.vortexGain = null;
        this.vortexMasterGain = null;
      },
      stopDelay * 1000 + 100
    );

    this.isVortexPlaying = false;
  }

  // --- Cosmic Strings Sound (Left Hand Pinky + Thumb Pinch) ---

  private stringTensionOsc1: OscillatorNode | null = null;
  private stringTensionOsc2: OscillatorNode | null = null;
  private stringTensionLFO: OscillatorNode | null = null;
  private stringTensionFilter: BiquadFilterNode | null = null;
  private stringTensionGain: GainNode | null = null;
  private stringTensionMasterGain: GainNode | null = null;
  private isStringTensionPlaying: boolean = false;

  /**
   * Start the "Cosmic String" tension drone.
   * A metallic, high-tension hum that builds as the string is pulled.
   */
  startCosmicStringTension(): void {
    if (!this.isInitialized || !this.audioContext || this.isStringTensionPlaying) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // 1. Create Nodes
      this.stringTensionOsc1 = ctx.createOscillator();
      this.stringTensionOsc2 = ctx.createOscillator();
      this.stringTensionLFO = ctx.createOscillator();
      this.stringTensionFilter = ctx.createBiquadFilter();
      this.stringTensionGain = ctx.createGain();
      this.stringTensionMasterGain = ctx.createGain();

      // 2. Configure Oscillators (Metallic/Stringy feel)
      this.stringTensionOsc1.type = 'triangle';
      this.stringTensionOsc1.frequency.value = 165; // ~E3
      this.stringTensionOsc2.type = 'sine';
      this.stringTensionOsc2.frequency.value = 166.5; // Harmonic detune

      // 3. Configure LFO (Subtle vibration)
      this.stringTensionLFO.type = 'sine';
      this.stringTensionLFO.frequency.value = 5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.15;

      // 4. Configure Filter
      this.stringTensionFilter.type = 'lowpass';
      this.stringTensionFilter.frequency.value = 1200;
      this.stringTensionFilter.Q.value = 2;

      // 5. Configure Gains
      this.stringTensionGain.gain.value = 0.2;
      this.stringTensionMasterGain.gain.setValueAtTime(0, now);
      this.stringTensionMasterGain.gain.linearRampToValueAtTime(0.1, now + 0.2);

      // 6. Connect Graph
      this.stringTensionLFO.connect(lfoGain);
      lfoGain.connect(this.stringTensionGain.gain);

      this.stringTensionOsc1.connect(this.stringTensionFilter);
      this.stringTensionOsc2.connect(this.stringTensionFilter);
      this.stringTensionFilter.connect(this.stringTensionGain);
      this.stringTensionGain.connect(this.stringTensionMasterGain);
      this.stringTensionMasterGain.connect(ctx.destination);

      // 7. Start
      this.stringTensionOsc1.start(now);
      this.stringTensionOsc2.start(now);
      this.stringTensionLFO.start(now);

      this.isStringTensionPlaying = true;
    } catch (e) {
      console.error('[StellarWaveAudioManager] Failed to start string tension sound', e);
      this.stopCosmicStringTension();
    }
  }

  /**
   * Stop the cosmic string tension sound.
   */
  stopCosmicStringTension(): void {
    if (!this.isStringTensionPlaying || !this.audioContext || !this.stringTensionMasterGain) {
      this.isStringTensionPlaying = false;
      return;
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const timeConstant = 0.05;
    const stopDelay = 0.2;

    this.stringTensionMasterGain.gain.setTargetAtTime(0, now, timeConstant);

    const stopTime = now + stopDelay;
    [this.stringTensionOsc1, this.stringTensionOsc2, this.stringTensionLFO].forEach((node) => {
      if (node) {
        try {
          node.stop(stopTime);
        } catch {
          /* ignore */
        }
      }
    });

    setTimeout(
      () => {
        if (this.isStringTensionPlaying) return;

        this.stringTensionOsc1?.disconnect();
        this.stringTensionOsc2?.disconnect();
        this.stringTensionLFO?.disconnect();
        this.stringTensionFilter?.disconnect();
        this.stringTensionGain?.disconnect();
        this.stringTensionMasterGain?.disconnect();

        this.stringTensionOsc1 = null;
        this.stringTensionOsc2 = null;
        this.stringTensionLFO = null;
        this.stringTensionFilter = null;
        this.stringTensionGain = null;
        this.stringTensionMasterGain = null;
      },
      stopDelay * 1000 + 50
    );

    this.isStringTensionPlaying = false;
  }

  /**
   * Play the one-shot cosmic string pluck sound (snap back).
   * Creates a percussive, elastic sound with high-frequency initial transient.
   */
  playCosmicStringPluck(): void {
    if (!this.isInitialized || !this.audioContext) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const duration = 0.6; // Slightly shorter for snappier feel

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Sharp triangle wave for the pluck impact
      osc.type = 'triangle';
      // Start higher for more "snap"
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(165, now + 0.15);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, now);
      filter.frequency.exponentialRampToValueAtTime(400, now + 0.25);
      filter.Q.value = 5; // Add some resonance for more "string" character

      gain.gain.setValueAtTime(0, now);
      // Fast attack for percussive hit
      gain.gain.linearRampToValueAtTime(0.3, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);

      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch (e) {
      console.error('[StellarWaveAudioManager] Failed to play pluck sound', e);
    }
  }

  // --- Quasar Surge Sound (Right Hand Middle Finger + Thumb Pinch) ---
  // Charging: Deep, ominous rumble that builds intensity
  // Burst: Powerful explosive release with cosmic overtones

  private quasarSurgeOsc1: OscillatorNode | null = null;
  private quasarSurgeOsc2: OscillatorNode | null = null;
  private quasarSurgeOsc3: OscillatorNode | null = null;
  private quasarSurgeOscHigh: OscillatorNode | null = null;
  private quasarSurgeLFO: OscillatorNode | null = null;
  private quasarSurgeFilter: BiquadFilterNode | null = null;
  private quasarSurgeGain: GainNode | null = null;
  private quasarSurgeMasterGain: GainNode | null = null;
  private quasarSurgeHighGain: GainNode | null = null;
  private quasarSurgeLFO_Gain: GainNode | null = null;
  private isQuasarSurgeCharging: boolean = false;

  /**
   * Start or update the Quasar Surge charging sound.
   * A deep, ominous drone that builds in intensity as charge increases.
   *
   * @param chargeIntensity - Charge level (0-1) affecting pitch and volume
   */
  startQuasarSurgeCharge(chargeIntensity: number): void {
    if (!this.isInitialized || !this.audioContext) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    if (!this.isQuasarSurgeCharging) {
      // Initialize the quasar surge sound
      try {
        this.quasarSurgeOsc1 = ctx.createOscillator();
        this.quasarSurgeOsc2 = ctx.createOscillator();
        this.quasarSurgeOsc3 = ctx.createOscillator();
        this.quasarSurgeOscHigh = ctx.createOscillator();
        this.quasarSurgeLFO = ctx.createOscillator();
        this.quasarSurgeLFO_Gain = ctx.createGain();
        this.quasarSurgeFilter = ctx.createBiquadFilter();
        this.quasarSurgeGain = ctx.createGain();
        this.quasarSurgeHighGain = ctx.createGain();
        this.quasarSurgeMasterGain = ctx.createGain();

        // Configure oscillators - ultra-low frequencies for gravitational feel
        this.quasarSurgeOsc1.type = 'sine';
        this.quasarSurgeOsc1.frequency.value = 35; // Sub-bass foundation
        this.quasarSurgeOsc2.type = 'sawtooth';
        this.quasarSurgeOsc2.frequency.value = 36.5; // Slight detune for unease
        this.quasarSurgeOsc3.type = 'triangle';
        this.quasarSurgeOsc3.frequency.value = 70; // Harmonic

        // High tension oscillator - rising pitch as singularity condenses
        this.quasarSurgeOscHigh.type = 'sine';
        this.quasarSurgeOscHigh.frequency.value = 440;
        this.quasarSurgeHighGain.gain.value = 0; // Starts silent

        // LFO for pulsing, breathing effect
        this.quasarSurgeLFO.type = 'sine';
        this.quasarSurgeLFO.frequency.value = 0.5; // Slow pulse
        this.quasarSurgeLFO_Gain.gain.value = 0.15;

        // Low-pass filter for rumbling texture
        this.quasarSurgeFilter.type = 'lowpass';
        this.quasarSurgeFilter.frequency.value = 80;
        this.quasarSurgeFilter.Q.value = 2;

        // Gains
        this.quasarSurgeGain.gain.value = 0.4;
        this.quasarSurgeMasterGain.gain.setValueAtTime(0, now);
        this.quasarSurgeMasterGain.gain.linearRampToValueAtTime(0.15, now + 0.5);

        // Connect graph
        this.quasarSurgeLFO.connect(this.quasarSurgeLFO_Gain);
        this.quasarSurgeLFO_Gain.connect(this.quasarSurgeGain.gain);

        this.quasarSurgeOsc1.connect(this.quasarSurgeFilter);
        this.quasarSurgeOsc2.connect(this.quasarSurgeFilter);
        this.quasarSurgeOsc3.connect(this.quasarSurgeFilter);
        this.quasarSurgeOscHigh.connect(this.quasarSurgeHighGain);
        this.quasarSurgeHighGain.connect(this.quasarSurgeFilter);

        this.quasarSurgeFilter.connect(this.quasarSurgeGain);
        this.quasarSurgeGain.connect(this.quasarSurgeMasterGain);
        this.quasarSurgeMasterGain.connect(ctx.destination);

        // Start oscillators
        this.quasarSurgeOsc1.start(now);
        this.quasarSurgeOsc2.start(now);
        this.quasarSurgeOsc3.start(now);
        this.quasarSurgeOscHigh.start(now);
        this.quasarSurgeLFO.start(now);

        this.isQuasarSurgeCharging = true;
      } catch (e) {
        console.error('[StellarWaveAudioManager] Failed to start quasar surge charge sound', e);
        this.stopQuasarSurgeCharge();
        return;
      }
    }

    // Update sound based on charge intensity
    if (
      this.quasarSurgeFilter &&
      this.quasarSurgeMasterGain &&
      this.quasarSurgeLFO &&
      this.quasarSurgeOscHigh &&
      this.quasarSurgeHighGain
    ) {
      // Filter opens wide as density increases to let the "tension" through
      const filterFreq = 80 + chargeIntensity * 800;
      this.quasarSurgeFilter.frequency.setTargetAtTime(filterFreq, now, 0.1);

      // LFO speeds up significantly as core condenses
      const lfoFreq = 0.5 + chargeIntensity * 4.5;
      this.quasarSurgeLFO.frequency.setTargetAtTime(lfoFreq, now, 0.1);

      // Rising tension pitch (Gravitational Whine)
      const highFreq = 440 + chargeIntensity * 440; // Rises to 880Hz
      this.quasarSurgeOscHigh.frequency.setTargetAtTime(highFreq, now, 0.1);

      // High tension volume - only kicks in after 40% charge
      const highVolume = Math.max(0, (chargeIntensity - 0.4) * 0.2);
      this.quasarSurgeHighGain.gain.setTargetAtTime(highVolume, now, 0.1);

      // Volume builds with charge
      const volume = 0.15 + chargeIntensity * 0.25;
      this.quasarSurgeMasterGain.gain.setTargetAtTime(volume, now, 0.1);
    }
  }

  /**
   * Stop the quasar surge charging sound.
   */
  stopQuasarSurgeCharge(): void {
    if (!this.isQuasarSurgeCharging || !this.audioContext || !this.quasarSurgeMasterGain) {
      return;
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const timeConstant = 0.08;
    const stopDelay = 0.4;

    this.quasarSurgeMasterGain.gain.setTargetAtTime(0, now, timeConstant);

    if (this.quasarSurgeLFO_Gain) {
      this.quasarSurgeLFO_Gain.gain.setTargetAtTime(0, now, 0.04);
    }

    const stopTime = now + stopDelay;
    [
      this.quasarSurgeOsc1,
      this.quasarSurgeOsc2,
      this.quasarSurgeOsc3,
      this.quasarSurgeOscHigh,
      this.quasarSurgeLFO,
    ].forEach((node) => {
      if (node) {
        try {
          node.stop(stopTime);
        } catch {
          /* ignore */
        }
      }
    });

    setTimeout(
      () => {
        if (this.isQuasarSurgeCharging) return;

        this.quasarSurgeOsc1?.disconnect();
        this.quasarSurgeOsc2?.disconnect();
        this.quasarSurgeOsc3?.disconnect();
        this.quasarSurgeOscHigh?.disconnect();
        this.quasarSurgeLFO?.disconnect();
        this.quasarSurgeLFO_Gain?.disconnect();
        this.quasarSurgeFilter?.disconnect();
        this.quasarSurgeGain?.disconnect();
        this.quasarSurgeHighGain?.disconnect();
        this.quasarSurgeMasterGain?.disconnect();

        this.quasarSurgeOsc1 = null;
        this.quasarSurgeOsc2 = null;
        this.quasarSurgeOsc3 = null;
        this.quasarSurgeOscHigh = null;
        this.quasarSurgeLFO = null;
        this.quasarSurgeLFO_Gain = null;
        this.quasarSurgeFilter = null;
        this.quasarSurgeGain = null;
        this.quasarSurgeHighGain = null;
        this.quasarSurgeMasterGain = null;
      },
      stopDelay * 1000 + 100
    );

    this.isQuasarSurgeCharging = false;
  }

  /**
   * Play the Quasar Surge burst (supernova explosion) sound.
   * A powerful, explosive release with cosmic overtones.
   */
  /**
   * Play the Quasar Surge burst (supernova explosion) sound.
   * A powerful, explosive release with cosmic overtones - "Cosmic Big Bang".
   */
  /**
   * Play the Quasar Surge burst (supernova explosion) sound.
   * A powerful, explosive release with cosmic overtones - "Cosmic Big Bang".
   *
   * @param intensity - Burst intensity (0-1), scales volume, duration, and depth
   */
  playQuasarSurgeBurst(intensity: number = 1.0): void {
    if (!this.isInitialized || !this.audioContext) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Stop charging sound immediately
    this.stopQuasarSurgeCharge();

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // Scale duration and power based on intensity
      // Minimum punch even at low intensity
      const safeIntensity = Math.max(0.2, intensity);
      const duration = 2.0 + safeIntensity * 5.0; // 2s -> 7s tail

      // Master Gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.config.volume * safeIntensity, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      masterGain.connect(ctx.destination);

      // Compressor for "Punch"
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-10, now);
      compressor.knee.setValueAtTime(30, now);
      compressor.ratio.setValueAtTime(12, now);
      compressor.attack.setValueAtTime(0.003, now);
      compressor.release.setValueAtTime(0.25, now);
      compressor.connect(masterGain);

      // 1. The "Crack" (Transient)
      // High-speed pitch drop for immediate impact
      const snapOsc = ctx.createOscillator();
      const snapGain = ctx.createGain();
      const snapFreq = 800 + safeIntensity * 600; // Sharpness scales with intensity

      snapOsc.frequency.setValueAtTime(snapFreq, now);
      snapOsc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
      snapGain.gain.setValueAtTime(1.0, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      snapOsc.connect(snapGain);
      snapGain.connect(compressor);
      snapOsc.start(now);
      snapOsc.stop(now + 0.15);

      // 2. The "Quake" (Sub-Bass)
      // Deep rumble that sustains
      // Only engage full sub-bass for higher intensities
      if (safeIntensity > 0.3) {
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        const dropStart = 100 + safeIntensity * 50;
        const dropEnd = 30;

        subOsc.frequency.setValueAtTime(dropStart, now);
        subOsc.frequency.exponentialRampToValueAtTime(dropEnd, now + duration * 0.6);
        subGain.gain.setValueAtTime(1.2 * safeIntensity, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);

        subOsc.connect(subGain);
        subGain.connect(compressor);
        subOsc.start(now);
        subOsc.stop(now + duration * 0.7);
      }

      // 3. The "Shockwave" (Noise Sweep)
      if (this.noiseBuffer) {
        const noiseSrc = ctx.createBufferSource();
        const noiseFilter = ctx.createBiquadFilter();
        const noiseGain = ctx.createGain();

        noiseSrc.buffer = this.noiseBuffer;
        noiseSrc.loop = true;

        // Bandpass sweep: Low -> High (Expansion) -> Low (Dissipation)
        // Sweep range depends on intensity
        const maxFreq = 2000 + safeIntensity * 9000;

        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(100, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(maxFreq, now + 0.15); // Expands fast
        noiseFilter.frequency.exponentialRampToValueAtTime(100, now + duration * 0.5); // Dissipates

        noiseGain.gain.setValueAtTime(0.8 * safeIntensity, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);

        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(compressor);
        noiseSrc.start(now);
        noiseSrc.stop(now + duration * 0.6);
      }

      // 4. The "Cosmic Dust" (Shimmer)
      // High frequency texture
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmerOsc.type = 'triangle';
      shimmerOsc.frequency.setValueAtTime(300, now);
      shimmerOsc.detune.setValueAtTime(2400, now);

      shimmerGain.gain.setValueAtTime(0.15 * safeIntensity, now);
      shimmerGain.gain.linearRampToValueAtTime(0, now + duration * 0.4);

      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(compressor);
      shimmerOsc.start(now);
      shimmerOsc.stop(now + duration * 0.4);

      // Cleanup
      setTimeout(
        () => {
          masterGain.disconnect();
          compressor.disconnect();
        },
        duration * 1000 + 100
      );
    } catch (e) {
      console.error('[StellarWaveAudioManager] Failed to play burst', e);
    }
  }

  // Refined "Force Field" drone: Sine + Triangle (110Hz) + LFO + LowPass Filter

  private repulsionOsc1: OscillatorNode | null = null;
  private repulsionOsc2: OscillatorNode | null = null;
  private repulsionLFO: OscillatorNode | null = null;
  private repulsionFilter: BiquadFilterNode | null = null;
  private repulsionGain: GainNode | null = null; // Modulated gain
  private repulsionMasterGain: GainNode | null = null; // Clean master gate
  private repulsionLFO_Gain: GainNode | null = null;
  private isRepulsionPlaying: boolean = false;

  /**
   * Start the "Force Field" repulsion hum.
   * A warmer, smoother energy drone that implies active pushing force.
   */
  startForceField(): void {
    if (!this.isInitialized || !this.audioContext || this.isRepulsionPlaying) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // 1. Create Nodes
      this.repulsionOsc1 = ctx.createOscillator();
      this.repulsionOsc2 = ctx.createOscillator();
      this.repulsionLFO = ctx.createOscillator();
      this.repulsionLFO_Gain = ctx.createGain();
      this.repulsionFilter = ctx.createBiquadFilter();
      this.repulsionGain = ctx.createGain();
      this.repulsionMasterGain = ctx.createGain();

      // 2. Configure Oscillators
      // Blend of Sine (Core) and Triangle (Energy)
      this.repulsionOsc1.type = 'sine';
      this.repulsionOsc1.frequency.value = 110;
      this.repulsionOsc2.type = 'triangle';
      this.repulsionOsc2.frequency.value = 111.5; // Slight detune for "shimmer"

      // 3. Configure LFO
      // Faster, lighter wiggling (8Hz) than the gravity well
      this.repulsionLFO.type = 'sine';
      this.repulsionLFO.frequency.value = 8;
      this.repulsionLFO_Gain.gain.value = 0.2; // Subtler 20% modulation

      // 4. Configure Filter
      // LowPass to keep it from being "piercing"
      this.repulsionFilter.type = 'lowpass';
      this.repulsionFilter.frequency.value = 800; // Brighter than gravity, but still warm
      this.repulsionFilter.Q.value = 0.5;

      // 5. Configure Gains
      this.repulsionGain.gain.value = 0.4;
      this.repulsionMasterGain.gain.setValueAtTime(0, now);
      // Fast fade-in for responsive feel
      this.repulsionMasterGain.gain.linearRampToValueAtTime(0.2, now + 0.3);

      // 6. Connect Graph
      this.repulsionLFO.connect(this.repulsionLFO_Gain);
      this.repulsionLFO_Gain.connect(this.repulsionGain.gain);

      this.repulsionOsc1.connect(this.repulsionFilter);
      this.repulsionOsc2.connect(this.repulsionFilter);
      this.repulsionFilter.connect(this.repulsionGain);
      this.repulsionGain.connect(this.repulsionMasterGain);
      this.repulsionMasterGain.connect(ctx.destination);

      // 7. Start
      this.repulsionOsc1.start(now);
      this.repulsionOsc2.start(now);
      this.repulsionLFO.start(now);

      this.isRepulsionPlaying = true;
    } catch (e) {
      console.error('[StellarWaveAudioManager] Failed to start repulsion sound', e);
      this.stopForceField();
    }
  }

  /**
   * Stop the force field sound.
   * Smooth fade-out to prevent pops.
   */
  stopForceField(): void {
    if (!this.isRepulsionPlaying || !this.audioContext || !this.repulsionMasterGain) {
      return;
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const timeConstant = 0.08;
    const stopDelay = 0.4;

    this.repulsionMasterGain.gain.setTargetAtTime(0, now, timeConstant);

    if (this.repulsionLFO_Gain) {
      this.repulsionLFO_Gain.gain.setTargetAtTime(0, now, 0.04);
    }

    const stopTime = now + stopDelay;
    [this.repulsionOsc1, this.repulsionOsc2, this.repulsionLFO].forEach((node) => {
      if (node) {
        try {
          node.stop(stopTime);
        } catch {
          /* ignore */
        }
      }
    });

    setTimeout(
      () => {
        if (this.isRepulsionPlaying) return;

        this.repulsionOsc1?.disconnect();
        this.repulsionOsc2?.disconnect();
        this.repulsionLFO?.disconnect();
        this.repulsionLFO_Gain?.disconnect();
        this.repulsionFilter?.disconnect();
        this.repulsionGain?.disconnect();
        this.repulsionMasterGain?.disconnect();

        this.repulsionOsc1 = null;
        this.repulsionOsc2 = null;
        this.repulsionLFO = null;
        this.repulsionLFO_Gain = null;
        this.repulsionFilter = null;
        this.repulsionGain = null;
        this.repulsionMasterGain = null;
      },
      stopDelay * 1000 + 100
    );

    this.isRepulsionPlaying = false;
  }

  // --- Gravity Well Sound ("The Singularity Drone") ---
  // Procedural dark drone: Sub-bass Sine (50Hz) + Detuned Saw (51Hz) + Tremolo + LowPass Filter

  private attractionOsc1: OscillatorNode | null = null;
  private attractionOsc2: OscillatorNode | null = null;
  private attractionLFO: OscillatorNode | null = null;
  private attractionFilter: BiquadFilterNode | null = null;
  private attractionGain: GainNode | null = null; // Modulated gain
  private attractionMasterGain: GainNode | null = null; // Clean master gain
  private attractionLFO_Gain: GainNode | null = null;
  private isAttractionPlaying: boolean = false;

  /*
   * Start the "Gravity Well" singularity drone.
   * A dark, unstable sub-bass texture that implies high mass and pressure.
   */
  startGravityWell(): void {
    if (!this.isInitialized || !this.audioContext || this.isAttractionPlaying) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // 1. Create Nodes
      this.attractionOsc1 = ctx.createOscillator();
      this.attractionOsc2 = ctx.createOscillator();
      this.attractionLFO = ctx.createOscillator();
      this.attractionLFO_Gain = ctx.createGain();
      this.attractionFilter = ctx.createBiquadFilter();
      this.attractionGain = ctx.createGain();
      this.attractionMasterGain = ctx.createGain();

      // 2. Configure Oscillators
      this.attractionOsc1.type = 'sine';
      this.attractionOsc1.frequency.value = 50;
      this.attractionOsc2.type = 'sawtooth';
      this.attractionOsc2.frequency.value = 51;

      // 3. Configure LFO
      this.attractionLFO.type = 'triangle';
      this.attractionLFO.frequency.value = 6;
      this.attractionLFO_Gain.gain.value = 0.3;

      // 4. Configure Filter
      this.attractionFilter.type = 'lowpass';
      this.attractionFilter.frequency.value = 120;
      this.attractionFilter.Q.value = 1;

      // 5. Configure Gains
      // Base gain level that LFO oscillates around
      this.attractionGain.gain.value = 0.5;

      // Master gain for the actual fade-in/out (The "Gate")
      this.attractionMasterGain.gain.setValueAtTime(0, now);
      // Fade in to 0.25 (Total volume = Base * Master)
      this.attractionMasterGain.gain.linearRampToValueAtTime(0.25, now + 0.8);

      // 6. Connect Graph
      // LFO chain modulates the synth inner gain
      this.attractionLFO.connect(this.attractionLFO_Gain);
      this.attractionLFO_Gain.connect(this.attractionGain.gain);

      // Source chain: Oscs -> Filter -> Modulated Gain -> Master Gate -> Out
      this.attractionOsc1.connect(this.attractionFilter);
      this.attractionOsc2.connect(this.attractionFilter);
      this.attractionFilter.connect(this.attractionGain);
      this.attractionGain.connect(this.attractionMasterGain);
      this.attractionMasterGain.connect(ctx.destination);

      // 7. Start Sources
      this.attractionOsc1.start(now);
      this.attractionOsc2.start(now);
      this.attractionLFO.start(now);

      this.isAttractionPlaying = true;

      // Dynamic movement: Sinking pitch
      this.attractionOsc1.frequency.linearRampToValueAtTime(45, now + 3.0);
      this.attractionOsc2.frequency.linearRampToValueAtTime(46, now + 3.0);
    } catch (e) {
      console.error('[StellarWaveAudioManager] Failed to start attraction sound', e);
      this.stopGravityWell();
    }
  }

  /**
   * Stop the gravity well sound.
   * Uses setTargetAtTime for a pop-free, mathematically smooth release.
   */
  stopGravityWell(): void {
    if (!this.isAttractionPlaying || !this.audioContext || !this.attractionMasterGain) {
      return;
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Time constant for exponential decay (0.1 means ~95% quiet after 0.3s)
    const timeConstant = 0.1;
    const stopDelay = 0.5; // Wait 0.5s before killing oscillators

    // Use setTargetAtTime - it starts exactly from the current (even if modulated) value
    // and decays smoothly without requiring cancelScheduledValues (which causes pops)
    this.attractionMasterGain.gain.setTargetAtTime(0, now, timeConstant);

    // Also fade out LFO depth to reduce signal complexity during release
    if (this.attractionLFO_Gain) {
      this.attractionLFO_Gain.gain.setTargetAtTime(0, now, 0.05);
    }

    // Stop nodes after they are definitely silent
    const stopTime = now + stopDelay;
    [this.attractionOsc1, this.attractionOsc2, this.attractionLFO].forEach((node) => {
      if (node) {
        try {
          node.stop(stopTime);
        } catch {
          /* ignore */
        }
      }
    });

    // Cleanup references
    setTimeout(
      () => {
        // Safety check: is another sound playing now? (avoids race condition cleanup)
        if (this.isAttractionPlaying) return;

        this.attractionOsc1?.disconnect();
        this.attractionOsc2?.disconnect();
        this.attractionLFO?.disconnect();
        this.attractionLFO_Gain?.disconnect();
        this.attractionFilter?.disconnect();
        this.attractionGain?.disconnect();
        this.attractionMasterGain?.disconnect();

        this.attractionOsc1 = null;
        this.attractionOsc2 = null;
        this.attractionLFO = null;
        this.attractionLFO_Gain = null;
        this.attractionFilter = null;
        this.attractionGain = null;
        this.attractionMasterGain = null;
      },
      stopDelay * 1000 + 100
    );

    this.isAttractionPlaying = false;
  }

  /**
   * Clean up resources and close the audio context.
   */
  dispose(): void {
    this.stopAll();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isInitialized = false;

    console.log('[StellarWaveAudioManager] Disposed');
  }
}
