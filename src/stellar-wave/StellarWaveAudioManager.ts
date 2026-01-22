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
