import { useMemo, useState } from 'react'
import App from './App'
import './pulse2.css'

type Plan = 'Free' | 'Plus' | 'Pro'

type Feature = {
  icon: string
  title: string
  text: string
  premium?: Plan
}

const features: Feature[] = [
  { icon: '✦', title: 'AI Copilot', text: 'Summarize chats, translate messages and draft replies.', premium: 'Plus' },
  { icon: '◈', title: 'Message Vault', text: 'Keep sensitive notes and one-time messages in a private vault.', premium: 'Plus' },
  { icon: '◉', title: 'Moments', text: 'Share short updates that disappear automatically.', premium: 'Plus' },
  { icon: '◌', title: 'Ghost Mode', text: 'Reduce your visible activity and presence.', premium: 'Pro' },
  { icon: '⌁', title: 'Focus Mode', text: 'Mute distractions while keeping important chats available.', premium: 'Free' },
  { icon: '∞', title: 'Smart Search', text: 'Search people, messages, files and links from one place.', premium: 'Plus' },
]

const plans: Array<{ name: Plan; price: string; description: string; items: string[] }> = [
  { name: 'Free', price: '€0', description: 'Everything needed for everyday messaging.', items: ['Unlimited 1:1 chats', 'Realtime messages', 'Files and images', 'Basic privacy controls'] },
  { name: 'Plus', price: '€4.99', description: 'More power for people who live in their chats.', items: ['AI Copilot', 'Message Vault', 'Moments', 'Advanced search', 'Custom themes'] },
  { name: 'Pro', price: '€9.99', description: 'The complete Pulse experience.', items: ['Everything in Plus', 'Ghost Mode', 'Priority AI', 'Expanded storage', 'Premium profile effects'] },
]

function Pulse2App() {
  const [hubOpen, setHubOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan>('Plus')
  const [aiOpen, setAiOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [ghostMode, setGhostMode] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [momentsOpen, setMomentsOpen] = useState(false)

  const activePlan = useMemo(() => plans.find((plan) => plan.name === selectedPlan)!, [selectedPlan])

  return (
    <div className={`pulse2-shell ${focusMode ? 'pulse2-focus' : ''}`}>
      <App />

      <button className="pulse2-launcher" onClick={() => setHubOpen(true)} aria-label="Open Pulse 2 command center">
        <span className="pulse2-launcher-mark">P</span>
        <span className="pulse2-launcher-label">Pulse 2</span>
      </button>

      {ghostMode && <div className="pulse2-ghost-badge">◌ Ghost</div>}
      {focusMode && <div className="pulse2-focus-badge">⌁ Focus</div>}

      {hubOpen && (
        <div className="pulse2-backdrop" onMouseDown={() => setHubOpen(false)}>
          <section className="pulse2-hub" onMouseDown={(event) => event.stopPropagation()}>
            <header className="pulse2-hub-header">
              <div>
                <div className="pulse2-eyebrow">PULSE 2.0</div>
                <h2>Your communication command center</h2>
                <p>One place for smarter conversations, privacy and premium tools.</p>
              </div>
              <button className="pulse2-close" onClick={() => setHubOpen(false)}>×</button>
            </header>

            <div className="pulse2-feature-grid">
              {features.map((feature) => (
                <button className="pulse2-feature" key={feature.title} onClick={() => {
                  if (feature.title === 'AI Copilot') setAiOpen(true)
                  if (feature.title === 'Message Vault') setVaultOpen(true)
                  if (feature.title === 'Moments') setMomentsOpen(true)
                  if (feature.title === 'Ghost Mode') setGhostMode((value) => !value)
                  if (feature.title === 'Focus Mode') setFocusMode((value) => !value)
                  if (feature.title === 'Smart Search') setHubOpen(false)
                }}>
                  <span className="pulse2-feature-icon">{feature.icon}</span>
                  <span className="pulse2-feature-copy">
                    <strong>{feature.title}</strong>
                    <small>{feature.text}</small>
                  </span>
                  {feature.premium && feature.premium !== 'Free' && <span className="pulse2-pill">{feature.premium}</span>}
                </button>
              ))}
            </div>

            <div className="pulse2-hub-actions">
              <button className="pulse2-action primary" onClick={() => setPremiumOpen(true)}>
                <span>✦</span><span><strong>Pulse Premium</strong><small>Free · Plus · Pro</small></span>
              </button>
              <button className="pulse2-action" onClick={() => setPrivacyOpen(true)}>
                <span>◌</span><span><strong>Privacy Center</strong><small>Ghost, focus and activity controls</small></span>
              </button>
            </div>
          </section>
        </div>
      )}

      {premiumOpen && (
        <div className="pulse2-backdrop" onMouseDown={() => setPremiumOpen(false)}>
          <section className="pulse2-modal pulse2-premium" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pulse2-close" onClick={() => setPremiumOpen(false)}>×</button>
            <div className="pulse2-eyebrow">PULSE PREMIUM</div>
            <h2>Choose how powerful Pulse should be.</h2>
            <p className="pulse2-muted">Premium UI is ready. Real payments can be connected to Stripe later without changing the product experience.</p>
            <div className="pulse2-plans">
              {plans.map((plan) => (
                <button key={plan.name} className={`pulse2-plan ${selectedPlan === plan.name ? 'selected' : ''}`} onClick={() => setSelectedPlan(plan.name)}>
                  <div className="pulse2-plan-top"><strong>{plan.name}</strong><b>{plan.price}<small>{plan.name === 'Free' ? '' : ' / month'}</small></b></div>
                  <p>{plan.description}</p>
                  <ul>{plan.items.map((item) => <li key={item}>✓ {item}</li>)}</ul>
                </button>
              ))}
            </div>
            <div className="pulse2-selected">
              <span>Selected plan: <strong>{activePlan.name}</strong></span>
              <button onClick={() => setPremiumOpen(false)}>Continue with {activePlan.name}</button>
            </div>
          </section>
        </div>
      )}

      {aiOpen && (
        <div className="pulse2-backdrop" onMouseDown={() => setAiOpen(false)}>
          <section className="pulse2-modal pulse2-ai" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pulse2-close" onClick={() => setAiOpen(false)}>×</button>
            <div className="pulse2-ai-orb">✦</div>
            <div className="pulse2-eyebrow">AI COPILOT</div>
            <h2>Make every conversation easier.</h2>
            <div className="pulse2-ai-grid">
              <button onClick={() => setAiOpen(false)}>Summarize this chat</button>
              <button onClick={() => setAiOpen(false)}>What did I miss?</button>
              <button onClick={() => setAiOpen(false)}>Translate</button>
              <button onClick={() => setAiOpen(false)}>Draft a reply</button>
              <button onClick={() => setAiOpen(false)}>Make it shorter</button>
              <button onClick={() => setAiOpen(false)}>Make it friendlier</button>
            </div>
            <p className="pulse2-muted">The interface is prepared for an AI provider. Connect your preferred model endpoint to make these actions live.</p>
          </section>
        </div>
      )}

      {privacyOpen && (
        <div className="pulse2-backdrop" onMouseDown={() => setPrivacyOpen(false)}>
          <section className="pulse2-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pulse2-close" onClick={() => setPrivacyOpen(false)}>×</button>
            <div className="pulse2-eyebrow">PRIVACY CENTER</div>
            <h2>You decide what Pulse reveals.</h2>
            <div className="pulse2-switch-row"><span><strong>Ghost Mode</strong><small>Hide activity indicators where supported.</small></span><button className={`pulse2-switch ${ghostMode ? 'on' : ''}`} onClick={() => setGhostMode((value) => !value)}><i /></button></div>
            <div className="pulse2-switch-row"><span><strong>Focus Mode</strong><small>Reduce interruptions while you work.</small></span><button className={`pulse2-switch ${focusMode ? 'on' : ''}`} onClick={() => setFocusMode((value) => !value)}><i /></button></div>
            <div className="pulse2-privacy-note">Privacy controls are local UI controls until corresponding server-side policies are enabled in Supabase.</div>
          </section>
        </div>
      )}

      {vaultOpen && (
        <div className="pulse2-backdrop" onMouseDown={() => setVaultOpen(false)}>
          <section className="pulse2-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pulse2-close" onClick={() => setVaultOpen(false)}>×</button>
            <div className="pulse2-eyebrow">MESSAGE VAULT</div>
            <h2>Your private corner.</h2>
            <p className="pulse2-muted">A dedicated place for sensitive notes, one-time messages and private reminders.</p>
            <textarea className="pulse2-textarea" placeholder="Write something private…" />
            <button className="pulse2-big-button" onClick={() => setVaultOpen(false)}>Lock in Vault</button>
          </section>
        </div>
      )}

      {momentsOpen && (
        <div className="pulse2-backdrop" onMouseDown={() => setMomentsOpen(false)}>
          <section className="pulse2-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pulse2-close" onClick={() => setMomentsOpen(false)}>×</button>
            <div className="pulse2-eyebrow">MOMENTS</div>
            <h2>Say it now. Let it disappear later.</h2>
            <textarea className="pulse2-textarea" placeholder="What is happening right now?" />
            <div className="pulse2-moment-times"><button>1 hour</button><button>24 hours</button><button>7 days</button></div>
            <button className="pulse2-big-button" onClick={() => setMomentsOpen(false)}>Publish Moment</button>
          </section>
        </div>
      )}
    </div>
  )
}

export default Pulse2App
