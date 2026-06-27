import { useRef, useCallback } from "react";

export function useAudioQueue() {
  const queue = useRef([]);
  const playing = useRef(false);
  const audioCtx = useRef(null);

  function getCtx() {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx.current;
  }

  async function playNext() {
    if (playing.current || queue.current.length === 0) return;
    playing.current = true;

    const b64 = queue.current.shift();
    try {
      const ctx = getCtx();
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        playing.current = false;
        playNext();
      };
      source.start(0);
    } catch (err) {
      console.error("Audio playback error:", err);
      playing.current = false;
      playNext();
    }
  }

  const enqueue = useCallback((b64) => {
    queue.current.push(b64);
    playNext();
  }, []);

  const clearQueue = useCallback(() => {
    queue.current = [];
    playing.current = false;
    if (audioCtx.current) {
      audioCtx.current.close();
      audioCtx.current = null;
    }
  }, []);

  return { enqueue, clearQueue };
}