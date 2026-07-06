import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { streamChat, sendVoice, checkHealth } from "./api";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import VoiceSettings from "./VoiceSettings";
import "./App.css";

/* ---------- Icons (inline, no external deps) ---------- */

import logo from "./assets/logo.jpeg";
function IconLogo() {
  return <img src={logo} alt="DalaCare AI logo" className="logo-img" />;
}


function IconSpeaker({ muted }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15" />
      {muted ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 13a7.97 7.97 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15 3h-4l-.3 2a8 8 0 0 0-1.7 1l-2.4-1-2 3.5L6.6 11a7.97 7.97 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L11 21h4l.3-2a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMic() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18v4M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 12L21 3L14 21L11 13L3 12Z" />
    </svg>
  );
}

function Spinner({ size = 16 }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function WaveBars({ volume }) {
  const multipliers = [1, 0.75, 1.15, 0.9];
  const live = typeof volume === "number";

  return (
    <span className="wave-bars" aria-hidden="true">
      {multipliers.map((m, i) => {
        const scale = live ? Math.max(0.25, Math.min(1, volume * m * 6)) : undefined;
        return (
          <span
            key={i}
            style={live ? { transform: `scaleY(${scale})`, animation: "none" } : undefined}
          />
        );
      })}
    </span>
  );
}

function VoiceStatusBar({ status, volume }) {
  if (!status) return null;
  return (
    <div className={`voice-status-bar ${status}`}>
      {status === "listening" ? <WaveBars volume={volume} /> : <Spinner size={13} />}
      <span>{status === "listening" ? "Listening..." : "Transcribing your voice..."}</span>
    </div>
  );
}

function IconPulse() {
  return (
    <svg viewBox="0 0 100 30" className="empty-state-icon" fill="none">
      <path
        d="M0 15 H30 L38 3 L46 27 L54 15 H70 L78 6 L86 24 H100"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- Client-side sentence boundary detection ---------- */

function extractSentences(buffer) {
  const sentences = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (['.', '!', '?'].includes(buffer[i])) {
      const next = buffer[i + 1];
      if (!next || next === ' ' || next === '\n') {
        const candidate = buffer.slice(start, i + 1).trim();
        if (candidate.length >= 8) {
          sentences.push(candidate);
          start = i + 1;
        }
      }
    }
  }
  return { sentences, remaining: buffer.slice(start) };
}

const SPEECH_THRESHOLD = 0.02;   // volume level counted as "speaking"
const SILENCE_THRESHOLD = 0.015; // volume level counted as "quiet"
const SILENCE_DURATION = 1200;   // ms of quiet before auto-stop
const MAX_RECORDING_MS = 20000;  // safety cap regardless of silence detection

function getRMS(analyser, buffer) {
  analyser.getFloatTimeDomainData(buffer);
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  return Math.sqrt(sumSquares / buffer.length);
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [micVolume, setMicVolume] = useState(0);

  const bottomRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const sentenceBufferRef = useRef("");
  const voiceSettingsRef = useRef(null);
  const settingsBtnRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const speechDetectedRef = useRef(false);
  const monitorFrameRef = useRef(null);
  const maxDurationTimerRef = useRef(null);
  const lastVolumeUpdateRef = useRef(0);

  const { enqueue, stop, updateSettings } = useSpeechSynthesis();

  function getHistory() {
    return messages
      .filter((m) => m.role === "user" || (m.role === "assistant" && !m.streaming))
      .map((m) => ({ role: m.role, content: m.content }));
  }

  useEffect(() => {
    checkHealth().then((ok) => setApiStatus(ok ? "online" : "offline"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (
        showVoiceSettings &&
        voiceSettingsRef.current &&
        !voiceSettingsRef.current.contains(e.target) &&
        settingsBtnRef.current &&
        !settingsBtnRef.current.contains(e.target)
      ) {
        setShowVoiceSettings(false);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") setShowVoiceSettings(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showVoiceSettings]);

  function handleVoiceSettingsChange(settings) {
    updateSettings(settings);
  }

  async function handleSend() {
    if (!input.trim() || isStreaming) return;

    const userMessage = { role: "user", content: input.trim() };
    const history = getHistory();

    setMessages((prev) => [
      ...prev,
      userMessage,
      { role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setIsStreaming(true);
    stop();
    sentenceBufferRef.current = "";

    await streamChat(
      userMessage.content,
      history,
      false,
      (token) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + token,
            };
          }
          return updated;
        });

        if (voiceEnabled) {
          sentenceBufferRef.current += token;
          const { sentences, remaining } = extractSentences(sentenceBufferRef.current);
          sentenceBufferRef.current = remaining;
          sentences.forEach((s) => enqueue(s));
        }
      },
      () => {},
      () => {
        if (voiceEnabled && sentenceBufferRef.current.trim()) {
          enqueue(sentenceBufferRef.current.trim());
          sentenceBufferRef.current = "";
        }
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, streaming: false };
          }
          return updated;
        });
        setIsStreaming(false);
      },
      (err) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${err}`,
            streaming: false,
            error: true,
          };
          return updated;
        });
        setIsStreaming(false);
      }
    );
  }

async function startRecording() {
  if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunksRef.current = [];
    speechDetectedRef.current = false;

    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      await handleVoiceSubmit(blob);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);

    // --- Voice activity detection setup ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;

    const buffer = new Float32Array(analyser.fftSize);

    function monitor() {
      if (!analyserRef.current) return;
      const rms = getRMS(analyserRef.current, buffer);

      const now = performance.now();
      if (now - lastVolumeUpdateRef.current > 80) {
        setMicVolume(rms);
        lastVolumeUpdateRef.current = now;
      }

      if (rms > SPEECH_THRESHOLD) {
        speechDetectedRef.current = true;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else if (speechDetectedRef.current && rms < SILENCE_THRESHOLD) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            stopRecording();
          }, SILENCE_DURATION);
        }
      }

      monitorFrameRef.current = requestAnimationFrame(monitor);
    }
    monitor();

    // Safety net in case silence is never detected
    maxDurationTimerRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_MS);
  } catch {
    alert("Microphone access denied. Please allow mic access and try again.");
  }
}

function stopRecording() {
  mediaRecorderRef.current?.stop();
  setIsRecording(false);
  setMicVolume(0);

  if (monitorFrameRef.current) {
    cancelAnimationFrame(monitorFrameRef.current);
    monitorFrameRef.current = null;
  }
  if (silenceTimerRef.current) {
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }
  if (maxDurationTimerRef.current) {
    clearTimeout(maxDurationTimerRef.current);
    maxDurationTimerRef.current = null;
  }
  if (audioContextRef.current) {
    audioContextRef.current.close();
    audioContextRef.current = null;
  }
  analyserRef.current = null;
}

async function handleVoiceSubmit(blob) {
  setIsProcessingVoice(true);
  stop();
  const history = getHistory();

  try {
    const result = await sendVoice(blob, history);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: `🎙️ "${result.transcript}"` },
      { role: "assistant", content: result.response, streaming: false },
    ]);

    if (voiceEnabled && result.response) {
      enqueue(result.response);
    }
  } catch (err) {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Voice error: ${err.message}`,
        error: true,
      },
    ]);
  } finally {
    setIsProcessingVoice(false);
  }
}

function handleKeyDown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function toggleVoice() {
  const next = !voiceEnabled;
  setVoiceEnabled(next);
  if (!next) stop();
  if (next) setShowVoiceSettings(true);
}

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">
            <IconLogo />
          </span>
          <div>
            <h1>
              <span className="brand-dala">Dala</span>
              <span className="brand-care">Care AI</span>
            </h1>
            <p>Your Intelligent Health Assistant</p>
          </div>
        </div>
        <div className="header-right">
          <div className={`status-dot ${apiStatus}`} title={`Backend: ${apiStatus}`} />
          <button
            className={`voice-toggle-btn ${voiceEnabled ? "active" : ""}`}
            onClick={toggleVoice}
            title="Toggle voice responses"
          >
            <IconSpeaker muted={!voiceEnabled} />
            <span>{voiceEnabled ? "Voice On" : "Voice Off"}</span>
          </button>
          {voiceEnabled && (
            <button
              ref={settingsBtnRef}
              className={`settings-btn ${showVoiceSettings ? "open" : ""}`}
              onClick={() => setShowVoiceSettings((v) => !v)}
              title="Voice settings"
            >
              <IconSettings />
            </button>
          )}
        </div>
      </header>

      <div
        ref={voiceSettingsRef}
        className={`voice-settings-wrapper ${showVoiceSettings && voiceEnabled ? "open" : ""}`}
      >
        <VoiceSettings enabled={voiceEnabled} onSettingsChange={handleVoiceSettingsChange} />
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <IconPulse />
            <p>Ask me about symptoms, conditions, or general health questions.</p>
            <p className="disclaimer">
              I provide health information, not medical diagnoses. Always consult a doctor for
              personal medical advice.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role} ${msg.error ? "error" : ""}`}>
            <div className="bubble">
              {msg.role === "assistant" ? (
                <>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {msg.streaming && <span className="cursor" />}
                </>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <VoiceStatusBar
        status={isRecording ? "listening" : isProcessingVoice ? "processing" : null}
        volume={micVolume}
      />

      <div className="input-area">
        <button
            className={`mic-btn ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isStreaming || isProcessingVoice}
            title={isRecording ? "Tap to stop" : "Tap to speak"}  
        >
          {isProcessingVoice ? <Spinner size={17} /> : isRecording ? <WaveBars /> : <IconMic />}
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about a symptom, condition, or treatment... (Enter to send)"
          disabled={isStreaming || isProcessingVoice}
          rows={1}
        />

        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming || isProcessingVoice}
        >
          {isStreaming ? <Spinner size={16} /> : <IconSend />}
        </button>
      </div>
    </div>
  );
}