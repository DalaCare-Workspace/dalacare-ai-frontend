const API_BASE = import.meta.env.VITE_API_URL || "https://dalainnovation-dalacare-chat-ai.hf.space";

export async function streamChat(message, history, voiceEnabled, onToken, onAudio, onDone, onError) {
  try {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, voice: voiceEnabled }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") { onDone(); return; }
        try {
          const event = JSON.parse(raw);
          if (event.type === "token") onToken(event.data);
          else if (event.type === "audio") onAudio(event.data);
          else if (event.type === "error") onError(event.data);
        } catch {}
      }
    }
    onDone();
  } catch (err) {
    onError(err.message);
  }
}

export async function sendVoice(audioBlob, history) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  formData.append("format", "webm");
  formData.append("history", JSON.stringify(history));

  const res = await fetch(`${API_BASE}/voice`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error(`Voice API error: ${res.status}`);
  return res.json();
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}