export type PulsePlan = 'free' | 'plus' | 'pro'

export type PulseFeature =
  | 'ai_summary'
  | 'ai_translate'
  | 'ai_voice_transcription'
  | 'message_vault'
  | 'time_capsules'
  | 'moments'
  | 'focus_mode'
  | 'ghost_mode'
  | 'custom_themes'
  | 'large_files'
  | 'advanced_search'
  | 'smart_reminders'
  | 'premium_profile'
  | 'priority_support'

export const PULSE_PLANS: Record<PulsePlan, {
  name: string
  priceMonthly: number
  features: PulseFeature[]
}> = {
  free: {
    name: 'Pulse Free',
    priceMonthly: 0,
    features: ['time_capsules', 'focus_mode'],
  },
  plus: {
    name: 'Pulse Plus',
    priceMonthly: 6.99,
    features: [
      'ai_summary',
      'ai_translate',
      'ai_voice_transcription',
      'message_vault',
      'time_capsules',
      'moments',
      'focus_mode',
      'ghost_mode',
      'custom_themes',
      'large_files',
      'advanced_search',
      'smart_reminders',
    ],
  },
  pro: {
    name: 'Pulse Pro',
    priceMonthly: 14.99,
    features: [
      'ai_summary',
      'ai_translate',
      'ai_voice_transcription',
      'message_vault',
      'time_capsules',
      'moments',
      'focus_mode',
      'ghost_mode',
      'custom_themes',
      'large_files',
      'advanced_search',
      'smart_reminders',
      'premium_profile',
      'priority_support',
    ],
  },
}

export function hasPulseFeature(plan: PulsePlan, feature: PulseFeature): boolean {
  return PULSE_PLANS[plan].features.includes(feature)
}
