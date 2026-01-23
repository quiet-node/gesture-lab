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
   * Play the synthesized ripple sound effect.
   * "Ethereal Surge" architecture:
   * - Internalized Warm Tones (220Hz - 440Hz range)
   * - Dual-Gate Architecture (Zero-pop release)
   * - Ultra-low Volume (Calibrated to be very subtle)
   */
  playRipple(): void {
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

    // Stop repulsion sound if active
    this.stopRepulsion();
  }

  // --- Repulsion Sound (Left Hand Interaction) ---
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
  startRepulsion(): void {
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
      this.stopRepulsion();
    }
  }

  /**
   * Stop the repulsion sound.
   * Smooth fade-out to prevent pops.
   */
  stopRepulsion(): void {
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
