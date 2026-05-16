// Web Audio API Ambient & Sound Effects Synthesizer
// Programmatic audio generation for high-fidelity interactive audio experience

class AudioSynth {
  private ctx: AudioContext | null = null;
  private activeNodes: { [key: string]: AudioNode[] } = {};
  private isPlaying: { [key: string]: boolean } = {};
  private volumeNodes: { [key: string]: GainNode } = {};

  constructor() {
    // Context will be initialized on user interaction
  }

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Sound Effect 1: Bubble Pop
  public playBubblePop(pitchMultiplier = 1.0) {
    try {
      this.initContext();
      if (!this.ctx) return;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      const now = this.ctx.currentTime;
      
      osc.frequency.setValueAtTime(150 * pitchMultiplier, now);
      osc.frequency.exponentialRampToValueAtTime(800 * pitchMultiplier, now + 0.15);
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  // Sound Effect 2: Magic Sparkle / Cosmic Chime
  public playSparkle() {
    try {
      this.initContext();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      const frequencies = [523.25, 659.25, 783.99, 987.77]; // C5, E5, G5, B5
      
      frequencies.forEach((freq, index) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.type = 'triangle';
        const delay = index * 0.05;
        
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.05, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.4);
        
        osc.start(now + delay);
        osc.stop(now + delay + 0.45);
      });
    } catch (e) {
      console.warn(e);
    }
  }

  // Sound Effect 3: Page Turn / Friction
  public playPageTurn() {
    try {
      this.initContext();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      const duration = 0.25;
      
      // Create white noise source
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      // Bandpass filter to make it sound like paper rubbing
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(3, now);
      filter.frequency.exponentialRampToValueAtTime(500, now + duration);
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      noise.start(now);
      noise.stop(now + duration);
    } catch (e) {
      console.warn(e);
    }
  }

  // Sound Effect 4: Heavy Tank/Dragon growl low rumble
  public playLowRumble() {
    try {
      this.initContext();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.linearRampToValueAtTime(30, now + 0.6);
      
      // Low pass filter to make it muffled
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, now);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      
      osc.start(now);
      osc.stop(now + 0.6);
    } catch (e) {
      console.warn(e);
    }
  }

  // Ambient 1: Ocean Depths (Low rumble wave & simulated bubbles)
  public startOceanAmbient() {
    try {
      this.initContext();
      if (!this.ctx || this.isPlaying['ocean']) return;
      this.isPlaying['ocean'] = true;
      
      const now = this.ctx.currentTime;
      
      // Create noise for waves
      const bufferSize = this.ctx.sampleRate * 4; // 4 second loop
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, now);
      
      // Modulate filter frequency for wave movement
      const oscMod = this.ctx.createOscillator();
      const gainMod = this.ctx.createGain();
      oscMod.frequency.value = 0.15; // 0.15 Hz (slow)
      gainMod.gain.value = 80; // Modulate filter by 80Hz
      
      oscMod.connect(gainMod);
      gainMod.connect(filter.frequency);
      oscMod.start();
      
      const mainGain = this.ctx.createGain();
      mainGain.gain.setValueAtTime(0, now);
      mainGain.gain.linearRampToValueAtTime(0.15, now + 1.0); // Fade in
      
      noise.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(this.ctx.destination);
      
      this.activeNodes['ocean'] = [noise, oscMod, gainMod, filter, mainGain];
      this.volumeNodes['ocean'] = mainGain;
      
      // Spawn random bubbles periodically while playing
      const bubbleInterval = setInterval(() => {
        if (!this.isPlaying['ocean']) {
          clearInterval(bubbleInterval);
          return;
        }
        if (Math.random() > 0.4) {
          this.playBubblePop(0.6 + Math.random() * 0.8);
        }
      }, 600);
    } catch (e) {
      console.warn(e);
    }
  }

  public stopOceanAmbient() {
    this.stopNode('ocean');
  }

  // Ambient 2: Cosy Fireplace & Soft Rain
  public startFireplaceAmbient() {
    try {
      this.initContext();
      if (!this.ctx || this.isPlaying['fireplace']) return;
      this.isPlaying['fireplace'] = true;
      
      const now = this.ctx.currentTime;
      
      // Create Rain (Pink/Brown noise)
      const bufferSize = this.ctx.sampleRate * 3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Brown noise filter approximation
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; // Compensate loss of gain
      }
      
      const rainSource = this.ctx.createBufferSource();
      rainSource.buffer = buffer;
      rainSource.loop = true;
      
      const rainFilter = this.ctx.createBiquadFilter();
      rainFilter.type = 'lowpass';
      rainFilter.frequency.value = 1000;
      
      const mainGain = this.ctx.createGain();
      mainGain.gain.setValueAtTime(0, now);
      mainGain.gain.linearRampToValueAtTime(0.12, now + 1.0);
      
      rainSource.connect(rainFilter);
      rainFilter.connect(mainGain);
      mainGain.connect(this.ctx.destination);
      
      this.activeNodes['fireplace'] = [rainSource, rainFilter, mainGain];
      this.volumeNodes['fireplace'] = mainGain;
      
      // Spawn crackles
      const crackleInterval = setInterval(() => {
        if (!this.isPlaying['fireplace']) {
          clearInterval(crackleInterval);
          return;
        }
        if (Math.random() > 0.3) {
          this.playCrackle();
        }
      }, 300);
    } catch (e) {
      console.warn(e);
    }
  }

  private playCrackle() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800 + Math.random() * 1200, now);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, now);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    gain.gain.setValueAtTime(0.01 + Math.random() * 0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public stopFireplaceAmbient() {
    this.stopNode('fireplace');
  }

  // Ambient 3: Cosmic Synth Pad
  public startCosmicAmbient() {
    try {
      this.initContext();
      if (!this.ctx || this.isPlaying['cosmic']) return;
      this.isPlaying['cosmic'] = true;
      
      const now = this.ctx.currentTime;
      
      // Oscillator 1: Drone
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.value = 110; // A2
      
      // Oscillator 2: Fifth
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 165; // E3
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      
      // Modulate filter for cosmic sweep
      const sweepOsc = this.ctx.createOscillator();
      const sweepGain = this.ctx.createGain();
      sweepOsc.frequency.value = 0.08; // Super slow sweep
      sweepGain.gain.value = 250;
      
      sweepOsc.connect(sweepGain);
      sweepGain.connect(filter.frequency);
      sweepOsc.start();
      
      const mainGain = this.ctx.createGain();
      mainGain.gain.setValueAtTime(0, now);
      mainGain.gain.linearRampToValueAtTime(0.08, now + 1.0);
      
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(this.ctx.destination);
      
      osc1.start();
      osc2.start();
      
      this.activeNodes['cosmic'] = [osc1, osc2, sweepOsc, sweepGain, filter, mainGain];
      this.volumeNodes['cosmic'] = mainGain;
    } catch (e) {
      console.warn(e);
    }
  }

  public stopCosmicAmbient() {
    this.stopNode('cosmic');
  }

  // Stop individual ambient sound with clean fade-out
  private stopNode(key: string) {
    try {
      if (!this.isPlaying[key]) return;
      this.isPlaying[key] = false;
      
      const nodes = this.activeNodes[key];
      const gainNode = this.volumeNodes[key];
      
      if (this.ctx && gainNode) {
        const now = this.ctx.currentTime;
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        setTimeout(() => {
          nodes.forEach(node => {
            try {
              (node as any).stop?.();
              node.disconnect();
            } catch (e) {}
          });
          delete this.activeNodes[key];
          delete this.volumeNodes[key];
        }, 550);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  public setVolume(key: string, volume: number) {
    const gainNode = this.volumeNodes[key];
    if (gainNode && this.ctx) {
      gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
    }
  }

  public isSoundPlaying(key: string): boolean {
    return !!this.isPlaying[key];
  }
}

export const synth = new AudioSynth();
