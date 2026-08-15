import { supabase } from './supabase'

export async function savePushSubscription(subscription: PushSubscription) {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('You must be signed in')
  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id: user.user.id, endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }, { onConflict: 'user_id,endpoint' })
  if (error) throw error
}

export async function requestPulseNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported' as const
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: undefined })
  await savePushSubscription(subscription)
  return 'granted' as const
}
