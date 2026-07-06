import { useState, useEffect } from "react";

export default function VoiceSettings({ onSettingsChange, enabled }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);


  // Add near the top of the file, above the component:
function IconPlay() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l14 8-14 8V4Z" />
    </svg>
  );
}

  useEffect(() => {
    function loadVoices() {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) {
        setVoices(available);
        // Default to first English voice
        const englishVoice = available.find((v) => v.lang.startsWith("en"));
        if (englishVoice) {
          setSelectedVoice(englishVoice.name);
          onSettingsChange({
            voice: englishVoice,
            rate,
            pitch,
          });
        }
      }
    }

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  function handleVoiceChange(e) {
    const name = e.target.value;
    setSelectedVoice(name);
    const voice = voices.find((v) => v.name === name) || null;
    onSettingsChange({ voice, rate, pitch });
  }

  function handleRate(e) {
    const val = parseFloat(e.target.value);
    setRate(val);
    const voice = voices.find((v) => v.name === selectedVoice) || null;
    onSettingsChange({ voice, rate: val, pitch });
  }

  function handlePitch(e) {
    const val = parseFloat(e.target.value);
    setPitch(val);
    const voice = voices.find((v) => v.name === selectedVoice) || null;
    onSettingsChange({ voice, rate, pitch: val });
  }

  function previewVoice() {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      "Hello, I am DalaCare AI, your health assistant."
    );
    utterance.voice = voices.find((v) => v.name === selectedVoice) || null;
    utterance.rate = rate;
    utterance.pitch = pitch;
    window.speechSynthesis.speak(utterance);
  }

  if (!enabled) return null;

  return (
    <div className="voice-settings">
      <p className="voice-settings-title">🎙️ Voice Settings</p>

      <div className="voice-setting-row">
        <label>Voice</label>
        <select value={selectedVoice} onChange={handleVoiceChange}>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </div>

      <div className="voice-setting-row">
        <label>Speed — {rate.toFixed(1)}x</label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={rate}
          onChange={handleRate}
        />
      </div>

      <div className="voice-setting-row">
        <label>Pitch — {pitch.toFixed(1)}</label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={pitch}
          onChange={handlePitch}
        />
      </div>

      <button className="preview-btn" onClick={previewVoice}>
        <IconPlay />
        <span>Preview voice</span>
      </button>
    </div>
  );
}