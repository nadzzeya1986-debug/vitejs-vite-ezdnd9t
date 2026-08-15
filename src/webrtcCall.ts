import { sendSignal, subscribeToCall, updateCall, type CallKind, type SignalType } from './callService'

export type PulseCallState = RTCPeerConnectionState | 'idle'

export class PulseWebRTCCall {
  private pc: RTCPeerConnection
  private localStream: MediaStream | null = null
  private remoteStream = new MediaStream()
  private callId: string
  private remoteUserId: string
  private kind: CallKind
  private unsubscribeSignals: (() => void) | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private remoteDescriptionReady = false

  onRemoteStream?: (stream: MediaStream) => void
  onLocalStream?: (stream: MediaStream) => void
  onState?: (state: PulseCallState) => void
  onError?: (error: unknown) => void

  constructor(callId: string, remoteUserId: string, kind: CallKind) {
    this.callId = callId
    this.remoteUserId = remoteUserId
    this.kind = kind
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
    })
    this.pc.onicecandidate = event => {
      if (!event.candidate) return
      void sendSignal(this.callId, this.remoteUserId, 'ice', event.candidate.toJSON()).catch(error => this.onError?.(error))
    }
    this.pc.ontrack = event => {
      const stream = event.streams[0]
      if (stream) {
        stream.getTracks().forEach(track => {
          if (!this.remoteStream.getTracks().some(existing => existing.id === track.id)) this.remoteStream.addTrack(track)
        })
      } else if (!this.remoteStream.getTracks().some(track => track.id === event.track.id)) {
        this.remoteStream.addTrack(event.track)
      }
      this.onRemoteStream?.(this.remoteStream)
    }
    this.pc.onconnectionstatechange = () => this.onState?.(this.pc.connectionState)
  }

  async subscribe() {
    this.unsubscribeSignals = subscribeToCall(this.callId, signal => {
      if (signal.sender_id === this.remoteUserId) void this.handleSignal(signal.type, signal.payload).catch(error => this.onError?.(error))
    })
  }

  async openLocalMedia() {
    if (this.localStream) return this.localStream
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.kind === 'video' })
    this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream!))
    this.onLocalStream?.(this.localStream)
    return this.localStream
  }

  async makeOffer() {
    await this.openLocalMedia()
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: this.kind === 'video' })
    await this.pc.setLocalDescription(offer)
    await sendSignal(this.callId, this.remoteUserId, 'offer', { type: offer.type, sdp: offer.sdp })
  }

  async acceptOffer() {
    await this.openLocalMedia()
  }

  private async handleSignal(type: SignalType, payload: Record<string, unknown>) {
    if (type === 'offer') {
      await this.openLocalMedia()
      await this.pc.setRemoteDescription(payload as RTCSessionDescriptionInit)
      this.remoteDescriptionReady = true
      await this.flushCandidates()
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      await sendSignal(this.callId, this.remoteUserId, 'answer', { type: answer.type, sdp: answer.sdp })
      await updateCall(this.callId, 'accepted')
      return
    }
    if (type === 'answer') {
      await this.pc.setRemoteDescription(payload as RTCSessionDescriptionInit)
      this.remoteDescriptionReady = true
      await this.flushCandidates()
      await updateCall(this.callId, 'accepted')
      return
    }
    if (type === 'ice') {
      const candidate = payload as RTCIceCandidateInit
      if (!this.remoteDescriptionReady) this.pendingCandidates.push(candidate)
      else await this.pc.addIceCandidate(candidate)
    }
    if (type === 'hangup' || type === 'busy') this.close()
  }

  private async flushCandidates() {
    const candidates = this.pendingCandidates.splice(0)
    for (const candidate of candidates) await this.pc.addIceCandidate(candidate)
  }

  async hangup() {
    try { await sendSignal(this.callId, this.remoteUserId, 'hangup', {}) } catch { /* call may already be gone */ }
    try { await updateCall(this.callId, 'ended') } catch { /* call may already be ended */ }
    this.close()
  }

  mute(muted: boolean) { this.localStream?.getAudioTracks().forEach(track => { track.enabled = !muted }) }
  camera(enabled: boolean) { this.localStream?.getVideoTracks().forEach(track => { track.enabled = enabled }) }
  getRemoteStream() { return this.remoteStream }
  getLocalStream() { return this.localStream }
  getConnectionState() { return this.pc.connectionState }

  close() {
    this.unsubscribeSignals?.()
    this.unsubscribeSignals = null
    this.pc.close()
    this.localStream?.getTracks().forEach(track => track.stop())
    this.localStream = null
    this.remoteStream.getTracks().forEach(track => track.stop())
  }
}
