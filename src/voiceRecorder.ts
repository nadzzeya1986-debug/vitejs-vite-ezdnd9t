export class PulseVoiceRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    this.chunks = []; this.recorder = new MediaRecorder(stream, { mimeType: mime })
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data) }
    this.recorder.start(250)
    return stream
  }

  stop() {
    return new Promise<Blob>((resolve, reject) => {
      if (!this.recorder) return reject(new Error('Recorder is not running'))
      const recorder = this.recorder
      recorder.onstop = () => { recorder.stream.getTracks().forEach(track => track.stop()); resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' })); this.recorder = null }
      recorder.stop()
    })
  }

  cancel() { this.recorder?.stream.getTracks().forEach(track => track.stop()); this.recorder?.stop(); this.recorder = null; this.chunks = [] }
}

export function downloadVoice(blob: Blob, filename = `pulse-voice-${Date.now()}.webm`) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}
