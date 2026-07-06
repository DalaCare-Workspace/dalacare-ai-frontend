import { useRef, useCallback } from "react";

export function useSpeechSynthesis() {
  const utteranceRef = useRef(null);
  const queueRef = useRef([]);
  const speakingRef = useRef(false);
  const settingsRef = useRef({ voice: null, rate: 1, pitch: 1 });
  const unlockedRef = useRef(false);

  function playNext() {
    if (speakingRef.current || queueRef.current.length === 0) return;
    const text = queueRef.current.shift();
    if (!text.trim()) { playNext(); return; }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = settingsRef.current.voice;
    utterance.rate = settingsRef.current.rate;
    utterance.pitch = settingsRef.current.pitch;

    utterance.onend = () => {
      speakingRef.current = false;
      playNext();
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      playNext();
    };

    speakingRef.current = true;
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  const enqueue = useCallback((text) => {
    // Split on sentence boundaries before enqueuing
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    sentences.forEach((s) => {
      if (s.trim()) queueRef.current.push(s.trim());
    });
    playNext();
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    queueRef.current = [];
    speakingRef.current = false;
  }, []);

  // Must be called directly inside a user click/tap handler (not after an
  // await) — this "unlocks" speechSynthesis in browsers that block audio
  // until a synchronous user gesture has triggered it at least once.
  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    const unlockUtterance = new SpeechSynthesisUtterance(" ");
    unlockUtterance.volume = 0;
    window.speechSynthesis.speak(unlockUtterance);
  }, []);
  const updateSettings = useCallback((settings) => {
    settingsRef.current = { ...settingsRef.current, ...settings };
  }, []);

  const getVoices = useCallback(() => {
    return window.speechSynthesis.getVoices();
  }, []);

  return { enqueue, stop, updateSettings, getVoices, unlock };
}