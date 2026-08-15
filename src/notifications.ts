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
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidKey) return 'configuration-required' as const
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) })
  await savePushSubscription(subscription)
  return 'granted' as const
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}
