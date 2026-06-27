import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { streamChat, sendVoice, checkHealth } from "./api";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import VoiceSettings from "./VoiceSettings";
import "./App.css";

// Client-side sentence boundary detection
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

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");

  const bottomRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const sentenceBufferRef = useRef("");

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
      false, // always false — we do TTS client-side now
      // onToken
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

        // Client-side sentence detection for instant TTS
        if (voiceEnabled) {
          sentenceBufferRef.current += token;
          const { sentences, remaining } = extractSentences(
            sentenceBufferRef.current
          );
          sentenceBufferRef.current = remaining;
          sentences.forEach((s) => enqueue(s));
        }
      },
      // onAudio — not used anymore
      () => {},
      // onDone
      () => {
        // Flush remaining buffer
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
      // onError
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
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
    } catch {
      alert("Microphone access denied. Please allow mic access and try again.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
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

      // Speak the voice response using browser TTS
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
          <span className="logo">💊</span>
          <div>
            <h1>DalaCare AI</h1>
            <p>Your Intelligent Health Assistant</p>
          </div>
        </div>
        <div className="header-right">
          <div
            className={`status-dot ${apiStatus}`}
            title={`Backend: ${apiStatus}`}
          />
          <button
            className={`voice-toggle-btn ${voiceEnabled ? "active" : ""}`}
            onClick={toggleVoice}
            title="Toggle voice responses"
          >
            🔊 {voiceEnabled ? "Voice On" : "Voice Off"}
          </button>
          {voiceEnabled && (
            <button
              className="settings-btn"
              onClick={() => setShowVoiceSettings((v) => !v)}
              title="Voice settings"
            >
              ⚙️
            </button>
          )}
        </div>
      </header>

      {showVoiceSettings && voiceEnabled && (
        <VoiceSettings
          enabled={voiceEnabled}
          onSettingsChange={handleVoiceSettingsChange}
        />
      )}

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>👋 Ask me about symptoms, conditions, or general health questions.</p>
            <p className="disclaimer">
              I provide health information, not medical diagnoses. Always consult
              a doctor for personal medical advice.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`message ${msg.role} ${msg.error ? "error" : ""}`}
          >
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

      <div className="input-area">
        <button
          className={`mic-btn ${isRecording ? "recording" : ""}`}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          disabled={isStreaming || isProcessingVoice}
          title="Hold to record"
        >
          {isProcessingVoice ? "⏳" : isRecording ? "🔴" : "🎙️"}
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
          {isStreaming ? "⏳" : "➤"}
        </button>
      </div>
    </div>
  );
}