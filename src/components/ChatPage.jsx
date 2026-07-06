import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import { FiSend, FiLoader, FiVolume2, FiSquare } from 'react-icons/fi'
import { API_BASE } from '../api'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'

const TEXT_ENDPOINT = `${API_BASE}/chat`

const welcomeMessage = {
  role: 'assistant',
  content: 'Hello, I am DalaCare AI. Ask a **health-related** question and I will help you.',
}

const markdownComponents = {
  p: ({ children }) => <p className="my-1.5 text-sm leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="my-2 text-base font-bold text-(--deep-charcoal) first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="my-2 text-sm font-bold text-(--deep-charcoal) first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="my-2 text-sm font-bold text-(--deep-charcoal) first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="text-sm leading-relaxed marker:text-(--electric-blue)">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-(--electric-blue) pl-3 text-sm italic opacity-90 first:mt-0">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-semibold text-(--deep-charcoal)">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 text-[0.85em] text-(--electric-blue)">{children}</code>
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-(--electric-blue) underline underline-offset-2" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

const ChatPage = () => {
  const [messages, setMessages] = useState([welcomeMessage])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [activeAudioIndex, setActiveAudioIndex] = useState(null)
  const bottomRef = useRef(null)

  const { isRecording, toggleRecording } = useVoiceRecorder(
    (response) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response,
        },
      ])
    },
    (note) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'note',
          content: note,
        },
      ])
    }
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
    }
  }, [])

  const handleSpeak = (text, index) => {
    if (activeAudioIndex === index) {
      window.speechSynthesis.cancel()
      setActiveAudioIndex(null)
      return
    }

    window.speechSynthesis.cancel()

    const cleanText = text.replace(/[*_#`~>]/g, '')
    const utterance = new SpeechSynthesisUtterance(cleanText)

    utterance.onend = () => {
      setActiveAudioIndex(null)
    }

    utterance.onerror = () => {
      setActiveAudioIndex(null)
    }

    setActiveAudioIndex(index)
    window.speechSynthesis.speak(utterance)
  }

  const sendMessage = async (message) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return

    const userMessage = { role: 'user', content: trimmedMessage }
    setMessages((prev) => [...prev, userMessage])
    setIsSending(true)
    setInput('')

    try {
      const response = await axios.post(TEXT_ENDPOINT, { message: trimmedMessage })
      const assistantReply = response.data?.response || ''
      
      setMessages((currentMessages) => [
        ...currentMessages,
        { role: 'assistant', content: assistantReply },
      ])
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: 'assistant',
          content: 'The backend endpoint is not connected yet.',
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!input.trim() || isSending) return
    await sendMessage(input)
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-50 text-(--deep-charcoal)">
      {/* Header */}
      <header className="border-b border-(--deep-charcoal) bg-(--deep-charcoal) px-4 py-3 text-(--white) sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 rounded-full border border-(--golden-yellow) px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-(--golden-yellow)">
              <span className="h-2 w-2 rounded-full bg-(--golden-yellow)" />
              DalaCare Health Assistant
            </p>
            <h1 className="text-base font-bold text-(--white) sm:text-lg">Health Conversation</h1>
          </div>
          <div className="h-2.5 w-2.5 rounded-full bg-(--golden-yellow)" />
        </div>
      </header>

      <div className="border-b border-(--deep-charcoal) bg-(--golden-yellow) px-4 py-1.5 text-xs font-medium text-(--deep-charcoal) sm:px-6">
        Ask about symptoms, medication, wellness, or lifestyle concerns. The assistant responds in a clear medical style.
      </div>

      {/* Message Feed Container */}
      <main className="flex-1 overflow-y-auto bg-neutral-50 px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col space-y-3">
          {messages.map((message, index) => {
            const isUser = message.role === 'user'
            const isNote = message.role === 'note'
            return (
              <div
                key={index}
                className={`flex w-full ${isUser ? 'justify-end' : isNote ? 'justify-center' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
                    isUser
                      ? 'border border-(--golden-yellow) bg-(--deep-charcoal) text-(--white) rounded-tr-none'
                      : isNote
                        ? 'border border-(--golden-yellow)/40 bg-(--golden-yellow)/10 text-(--deep-charcoal) rounded-full text-xs font-medium'
                        : 'border border-(--electric-blue)/25 bg-(--white) text-(--deep-charcoal) rounded-tl-none'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm leading-relaxed text-(--white)">{message.content}</p>
                  ) : isNote ? (
                    <p className="text-xs leading-relaxed text-(--deep-charcoal)">{message.content}</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-(--deep-charcoal)">
                        <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
                      </div>
                      
                      {/* Visible Audio Button Panel at the Bottom */}
                      <div className="flex justify-end border-t border-neutral-100 pt-2">
                        <button
                          type="button"
                          onClick={() => handleSpeak(message.content, index)}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            activeAudioIndex === index
                              ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                              : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 hover:text-(--electric-blue)'
                          }`}
                        >
                          {activeAudioIndex === index ? (
                            <>
                              <FiSquare className="text-[10px]" />
                              <span>Stop Audio</span>
                            </>
                          ) : (
                            <>
                              <FiVolume2 className="text-xs" />
                              <span>Play Audio</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input Action Panel */}
      <footer className="border-t border-(--deep-charcoal)/15 bg-(--white) px-3 py-2 sm:px-4 sm:py-3">
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          <div className="flex items-end gap-2 rounded-lg border border-(--deep-charcoal)/15 bg-(--white) px-2 py-1.5 transition-all focus-within:border-(--electric-blue)">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={1}
              style={{ minHeight: '34px' }}
              placeholder="Describe your symptoms or ask a medical question..."
              className="min-h-8.5 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-5 outline-none placeholder:text-neutral-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />

            <button
              onClick={toggleRecording}
              type="button"
              aria-label="Voice recording"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-(--deep-charcoal)/15 bg-(--white)"
            >
              {isRecording ? "⏹" : "🎤"}
            </button>

            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="flex h-8 items-center rounded-md border border-(--golden-yellow) bg-(--golden-yellow) px-2.5 text-[11px] font-semibold text-(--deep-charcoal) transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
            >
              {isSending ? <FiLoader className="animate-spin text-xs" /> : <FiSend className="text-xs" />}
              <span className="ml-1">{isSending ? 'Sending' : 'Send'}</span>
            </button>
          </div>
        </form>
      </footer>
    </div>
  )
}

export default ChatPage