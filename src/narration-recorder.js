import { MAX_AUDIO_BYTES } from './narration.js';

// The host supplies browser APIs so recorder lifecycle can be tested without
// touching a person's microphone. Nothing requests permission until start().
export function createAudioRecorder({ mediaDevices = globalThis.navigator?.mediaDevices, Recorder = globalThis.MediaRecorder, maxBytes = MAX_AUDIO_BYTES, maxMs = 180000, onState = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_AUDIO_BYTES || !Number.isSafeInteger(maxMs) || maxMs < 1 || maxMs > 180000) throw new Error('Invalid recording limits');
  let state = 'idle', recorder, stream, timer, chunks = [], total = 0, generation = 0, result, resolveResult, rejectResult, failure;
  const update = value => { state = value; onState(value); };
  const cleanup = () => { if (timer) clearTimer(timer); timer = null; stream?.getTracks().forEach(track => track.stop()); stream = null; };
  const end = () => {
    cleanup();
    if (failure) { chunks = []; update(failure.message === 'Recording cancelled' ? 'cancelled' : 'error'); rejectResult?.(failure); }
    else {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }); chunks = [];
      update('stopped'); resolveResult?.(blob);
    }
  };
  const stop = () => {
    if (!recorder || !['recording', 'paused'].includes(state)) throw new Error('There is no active recording');
    update('stopping'); recorder.stop(); return result;
  };
  return {
    get state() { return state; },
    async start({ consent = false } = {}) {
      if (consent !== true) throw new Error('Recording consent is required');
      if (!mediaDevices?.getUserMedia || !Recorder) throw new Error('Recording is unavailable; upload audio or type a story instead');
      if (['requesting', 'recording', 'paused', 'stopping', 'cancelling'].includes(state)) throw new Error('A recording is already active');
      const request = ++generation; failure = null; chunks = []; total = 0; update('requesting');
      try {
        const incoming = await mediaDevices.getUserMedia({ audio: true, video: false });
        if (request !== generation) { incoming.getTracks().forEach(t => t.stop()); throw new Error('Recording cancelled'); }
        stream = incoming;
        const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => Recorder.isTypeSupported?.(t));
        recorder = new Recorder(stream, mimeType ? { mimeType } : {});
        result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
        // Consumers may stop later. Keep rejection observed until they do.
        result.catch(() => {});
        recorder.addEventListener('dataavailable', event => {
          if (!event.data?.size || failure) return;
          total += event.data.size;
          if (total > maxBytes) { failure = new Error('Recording exceeded the size limit; retry a shorter segment'); if (recorder.state !== 'inactive') recorder.stop(); return; }
          chunks.push(event.data);
        });
        recorder.addEventListener('error', event => {
          failure = new Error(event.error?.message || 'Recording failed');
          if (recorder.state !== 'inactive') recorder.stop(); else end();
        });
        recorder.addEventListener('stop', end, { once: true });
        recorder.start(1000); update('recording');
        timer = setTimer(() => { if (['recording', 'paused'].includes(state)) stop(); }, maxMs);
        return { finished: result };
      } catch (error) { if (request === generation) { cleanup(); update('error'); } throw error; }
    },
    pause() { if (state !== 'recording') throw new Error('Recording is not running'); recorder.pause(); update('paused'); },
    resume() { if (state !== 'paused') throw new Error('Recording is not paused'); recorder.resume(); update('recording'); },
    stop,
    cancel() {
      generation++;
      failure = new Error('Recording cancelled');
      if (recorder && recorder.state !== 'inactive') { update('cancelling'); recorder.stop(); }
      else { cleanup(); update('cancelled'); }
    },
  };
}
