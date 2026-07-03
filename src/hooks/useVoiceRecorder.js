import { useRef, useState } from 'react'
import axios from 'axios'
import { API_BASE } from '../api'

const URL = `${API_BASE}/voice`

export function useVoiceRecorder(onResponse, onVoiceSent) {
  const [isRecording, setIsRecording] = useState(false)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    })

    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm',
    })

    chunksRef.current = []

    recorder.ondataavailable = (event) => {
      chunksRef.current.push(event.data)
    }

    recorder.onstop = async () => {
      const audioBlob = new Blob(chunksRef.current, {
        type: 'audio/webm',
      })

      stream.getTracks().forEach((track) => track.stop())

      onVoiceSent?.('Voice note sent')

      await sendVoice(audioBlob)
    }

    mediaRecorderRef.current = recorder
    recorder.start()

    setIsRecording(true)
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)

  }

  const sendVoice = async (audioBlob) => {
    const formData = new FormData()

    formData.append('audio', audioBlob, 'recording.webm')
    formData.append('format', 'webm')

    for (const [key, value] of formData.entries()) {
      console.log(key, value)
    }

    try {
      const { data } = await axios.post(URL, formData)

      onResponse?.(data.response)
      return data
    } catch (error) {
      console.error('Voice upload failed:', error.response?.data || error.message)
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return {
    isRecording,
    toggleRecording,
  }
}