const audioContext = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!audioContext) return;
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

export function playCheckinSound() {
  if (!audioContext) return;
  playTone(880, 0.1, 'sine', 0.12);
  setTimeout(() => playTone(1174.66, 0.15, 'sine', 0.12), 100);
}

export function playRevertSound() {
  if (!audioContext) return;
  playTone(440, 0.12, 'sine', 0.1);
  setTimeout(() => playTone(330, 0.18, 'sine', 0.1), 120);
}

export function playErrorSound() {
  if (!audioContext) return;
  playTone(200, 0.25, 'square', 0.06);
}
