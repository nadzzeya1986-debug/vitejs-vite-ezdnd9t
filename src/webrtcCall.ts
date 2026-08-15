import { supabase } from './supabase'
import { sendCallSignal, updateCall, type CallKind, type CallSignal } from './callService'

export class PulseWebRTCCall {
  private pc: RTCPeerConnection
  private localStream: MediaStream | null = null
  private remoteStream = new MediaStream()
  private callId: string
  private remoteUserId: string
  private kind: CallKind
  private unsubscribeSignals: (() => void) | null = null
  onRemoteStream?: (stream: MediaStream) => void
  onState?: (state: RTCPeerConnectionState) => void

  constructor(callId: string, remoteUserId: string, kind: CallKind) {
    this.callId = callId; this.remoteUserId = remoteUserId; this.kind = kind
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] })
    this.pc.onicecandidate = e => { if (e.candidate) void sendCallSignal(this.callId, this.remoteUserId, 'ice-candidate', e.candidate.toJSON()) }
    this.pc.ontrack = e => { e.streams[0]?.getTracks().forEach(track => this.remoteStream.addTrack(track)); this.onRemoteStream?.(this.remoteStream) }
    this.pc.onconnectionstatechange = () => this.onState?.(this.pc.connectionState)
  }

  async openLocalMedia() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.kind === 'video' })
    this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream!))
    return this.localStream
  }

  async makeOffer() {
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: this.kind === 'video' })
    await this.pc.setLocalDescription(offer)
    await sendCallSignal(this.callId, this.remoteUserId, 'offer', { sdp: offer.sdp, type: offer.type })
    await updateCall(this.callId, 'ringing')
  }

  async handleSignal(signal: CallSignal) {
    if (signal.call_id !== this.callId) return
    if (signal.type === 'offer') {
      await this.pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit)
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      await sendCallSignal(this.callId, this.remoteUserId, 'answer', { sdp: answer.sdp, type: answer.type })
      await updateCall(this.callId, 'accepted')
    } else if (signal.type === 'answer') {
      await this.pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit)
      await updateCall(this.callId, 'accepted')
    } else if (signal.type === 'ice-candidate') {
      try { await this.pc.addIceCandidate(signal.payload as RTCIceCandidateInit) } catch { /* peer may not be ready yet */ }
    }
  }

  async subscribe() {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) throw new Error('You must be signed in')
    const channel = supabase.channel(`pulse-webrtc:${this.callId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `call_id=eq.${this.callId}` }, payload => void this.handleSignal(payload.new as CallSignal))
      .subscribe()
    this.unsubscribeSignals = () => { void supabase.removeChannel(channel) }
  }

  async hangup() { await updateCall(this.callId, 'ended'); this.close() }
  mute(muted: boolean) { this.localStream?.getAudioTracks().forEach(track => track.enabled = !muted) }
  camera(enabled: boolean) { this.localStream?.getVideoTracks().forEach(track => track.enabled = enabled) }
  getRemoteStream() { return this.remoteStream }
  close() { this.unsubscribeSignals?.(); this.pc.close(); this.localStream?.getTracks().forEach(track => track.stop()) }
}
