/**
 * Procedural Lo-Fi Sound Synthesizer (Web Audio API)
 * Generates footsteps, sword whooshes, wood impacts, metal rings, and armor clinks dynamically.
 */

import { HitZone } from '../physics/combatMath.ts';

export class RetroSoundEngine {
  private ctx: AudioContext | null = null;
  private whooshGain: GainNode | null = null;
  private whooshFilter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private initialized = false;
  private isMuted = false;

  public init(): void {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0.0 : 1.0;
      this.masterGain.connect(this.ctx.destination);

      this.setupContinuousWhoosh();
      this.initialized = true;
    } catch {
      // Audio context policy fallback
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0.0 : 1.0, this.ctx.currentTime);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private setupContinuousWhoosh(): void {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.whooshFilter = this.ctx.createBiquadFilter();
    this.whooshFilter.type = 'bandpass';
    this.whooshFilter.frequency.value = 300;
    this.whooshFilter.Q.value = 2.2;

    this.whooshGain = this.ctx.createGain();
    this.whooshGain.gain.value = 0.0;

    whiteNoise.connect(this.whooshFilter);
    this.whooshFilter.connect(this.whooshGain);
    this.whooshGain.connect(this.masterGain);
    whiteNoise.start(0);
  }

  public updateSwordWhoosh(tipSpeed: number): void {
    if (!this.initialized || !this.whooshGain || !this.whooshFilter || !this.ctx || this.isMuted) return;
    // Map speed 3.5 m/s .. 17.5 m/s to [0..1]
    const normalized = Math.min(1.0, Math.max(0, (tipSpeed - 3.5) / 14.0));
    const now = this.ctx.currentTime;
    this.whooshGain.gain.setTargetAtTime(normalized * 0.22, now, 0.03);
    this.whooshFilter.frequency.setTargetAtTime(180 + normalized * 620, now, 0.03);
  }

  public playHit(
    intensity: number,
    isMetal = false,
    zoneType: HitZone = 'sweetspot',
    isFlat = false
  ): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1.0, Math.max(0.12, intensity));

    let baseFreq = isMetal ? 260 : 120;
    let decayTime = 0.18;
    if (isFlat) {
      baseFreq = 310;
      decayTime = 0.14;
    } else if (zoneType === 'forte') {
      baseFreq = isMetal ? 180 : 82;
      decayTime = 0.12;
    } else if (zoneType === 'point') {
      baseFreq = isMetal ? 340 : 155;
      decayTime = 0.22;
    }

    // Low fundamental punch oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = isFlat
      ? 'square'
      : isMetal
      ? 'triangle'
      : zoneType === 'sweetspot'
      ? 'sawtooth'
      : 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(isFlat ? 95 : 26, now + decayTime);

    oscGain.gain.setValueAtTime(vol * (isFlat ? 0.38 : 0.68), now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime + 0.02);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + decayTime + 0.03);

    // Crunchy noise burst (wood splinter / metal clink / flat slap)
    const bufferSize = Math.floor(
      this.ctx.sampleRate * (zoneType === 'sweetspot' && !isFlat ? 0.15 : 0.11)
    );
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const filterFreq = isFlat
      ? 1580
      : isMetal
      ? 1220
      : zoneType === 'point'
      ? 760
      : zoneType === 'forte'
      ? 310
      : 520;
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(isFlat ? 6.5 : isMetal ? 4.5 : 1.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * (zoneType === 'forte' ? 0.32 : 0.55), now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
  }

  public playStep(isDash = false): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime((isDash ? 110 : 75) + Math.random() * 15, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + (isDash ? 0.11 : 0.07));

    gain.gain.setValueAtTime(isDash ? 0.24 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isDash ? 0.12 : 0.075));

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isDash ? 0.13 : 0.08));
  }

  public dispose(): void {
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch {
        // ignore
      }
      this.ctx = null;
      this.initialized = false;
    }
  }
}
