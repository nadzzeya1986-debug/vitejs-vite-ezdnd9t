import { supabase } from './supabase'

export type CallKind = 'voice' | 'video'
export type SignalType = 'offer' | 'answer' | 'ice' | 'hangup' | 'busy'

export async function createCall(calleeId: string, kind: CallKind) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to call someone.')
  const { data, error } = await supabase.from('call_sessions').insert({ caller_id: user.id, callee_id: calleeId, kind, status: 'ringing' }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function updateCall(callId: string, status: 'accepted' | 'declined' | 'ended' | 'missed') {
  const patch: Record<string, string> = { status }
  if (status === 'accepted') patch.accepted_at = new Date().toISOString()
  if (status === 'ended' || status === 'declined' || status === 'missed') patch.ended_at = new Date().toISOString()
  const { error } = await supabase.from('call_sessions').update(patch).eq('id', callId)
  if (error) throw error
}

export async function sendSignal(callId: string, recipientId: string, type: SignalType, payload: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to send a call signal.')
  const { error } = await supabase.from('call_signals').insert({ call_id: callId, sender_id: user.id, recipient_id: recipientId, type, payload })
  if (error) throw error
}

export function subscribeToCall(callId: string, onSignal: (signal: { type: SignalType; payload: Record<string, unknown>; sender_id: string }) => void) {
  const channel = supabase.channel(`pulse-call:${callId}`).on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'call_signals', filter: `call_id=eq.${callId}`,
  }, (event) => onSignal(event.new as { type: SignalType; payload: Record<string, unknown>; sender_id: string })).subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function subscribeToIncomingCalls(userId: string, onCall: (call: Record<string, unknown>) => void) {
  const channel = supabase.channel(`pulse-incoming-calls:${userId}`).on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${userId}`,
  }, (event) => onCall(event.new as Record<string, unknown>)).subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export async function savePushSubscription(subscription: PushSubscription) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, updated_at: new Date().toISOString() }, { onConflict: 'user_id,endpoint' })
  if (error) throw error
}
