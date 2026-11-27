/**
 * 零外部音频依赖的书桌氛围声引擎（纯浏览器原生 Web Audio API 实时合成）：
 * - waves：潮汐海浪（低频布朗噪声 + 慢周期正弦 LFO 潮起潮落）
 * - rain：细雨敲窗（柔化粉红噪声 + 细腻中高频微雨滤镜）
 * - breeze：夜空微风（极轻暖低频风声底噪，专注阅读零打扰）
 */
export type AmbientSoundKind = 'off' | 'waves' | 'rain' | 'breeze';

class DeskAmbientEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeMode: AmbientSoundKind = 'off';

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext, color: 'pink' | 'brown'): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 4;
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch += 1) {
      const data = buffer.getChannelData(ch);
      if (color === 'brown') {
        let lastOut = 0;
        for (let i = 0; i < length; i += 1) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.02 * white) / 1.02;
          data[i] = lastOut * 3.1;
        }
      } else {
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let b3 = 0;
        let b4 = 0;
        let b5 = 0;
        let b6 = 0;
        for (let i = 0; i < length; i += 1) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
          b6 = white * 0.115926;
        }
      }
    }
    return buffer;
  }

  stop(): void {
    const now = this.ctx?.currentTime ?? 0;
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
      } catch {
        // ignore
      }
    }
    const toStop = [...this.activeNodes];
    this.activeNodes = [];
    this.activeMode = 'off';
    setTimeout(() => {
      for (const n of toStop) {
        try {
          if ('stop' in n && typeof (n as AudioScheduledSourceNode).stop === 'function') {
            (n as AudioScheduledSourceNode).stop();
          }
          n.disconnect();
        } catch {
          // ignore
        }
      }
    }, 220);
  }

  play(mode: AmbientSoundKind, volume = 0.32): void {
    this.stop();
    if (mode === 'off') return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.02, Math.min(0.6, volume)), now + 0.6);
    master.connect(ctx.destination);
    this.masterGain = master;

    const src = ctx.createBufferSource();
    src.buffer = this.createNoiseBuffer(ctx, mode === 'rain' ? 'pink' : 'brown');
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    if (mode === 'waves') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, now);
      filter.Q.setValueAtTime(0.7, now);

      const waveGain = ctx.createGain();
      waveGain.gain.setValueAtTime(0.62, now);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.11, now); // 约 9 秒一轮温柔海浪涨落

      const lfoDepth = ctx.createGain();
      lfoDepth.gain.setValueAtTime(0.32, now);

      const lfoFreqDepth = ctx.createGain();
      lfoFreqDepth.gain.setValueAtTime(220, now);

      lfo.connect(lfoDepth);
      lfoDepth.connect(waveGain.gain);
      lfo.connect(lfoFreqDepth);
      lfoFreqDepth.connect(filter.frequency);

      src.connect(filter);
      filter.connect(waveGain);
      waveGain.connect(master);

      lfo.start(now);
      src.start(now);
      this.activeNodes = [src, filter, waveGain, lfo, lfoDepth, lfoFreqDepth, master];
    } else if (mode === 'rain') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1150, now);
      filter.Q.setValueAtTime(0.45, now);

      const warmth = ctx.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.setValueAtTime(2800, now);

      src.connect(filter);
      filter.connect(warmth);
      warmth.connect(master);
      src.start(now);
      this.activeNodes = [src, filter, warmth, master];
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, now);
      filter.Q.setValueAtTime(0.5, now);
      src.connect(filter);
      filter.connect(master);
      src.start(now);
      this.activeNodes = [src, filter, master];
    }

    this.activeMode = mode;
  }

  getMode(): AmbientSoundKind {
    return this.activeMode;
  }
}

export const deskAmbientEngine = new DeskAmbientEngine();
