import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

type User = {
  id: string
  username: string
  avatar_url: string | null
  status: string | null
  last_seen: string | null
}

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  read_at: string | null
}

type Capsule = Message & { unlock_at: string }
type Tab = 'chats' | 'moments' | 'vault' | 'settings'
type Plan = 'free' | 'plus' | 'pro'

type Settings = {
  dark: boolean
  compact: boolean
  notifications: boolean
  sound: boolean
  enterToSend: boolean
  focus: boolean
  ghost: boolean
}

const defaultSettings: Settings = {
  dark: false,
  compact: false,
  notifications: true,
  sound: true,
  enterToSend: true,
  focus: false,
  ghost: false,
}

const plans = {
  free: { name: 'Free', price: '€0', accent: 'Базовый Pulse' },
  plus: { name: 'Pulse Plus', price: '€4.99', accent: 'AI и расширенные возможности' },
  pro: { name: 'Pulse Pro', price: '€9.99', accent: 'Максимум для power users' },
}

function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({})
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [chatSearch, setChatSearch] = useState('')
  const [mobileChat, setMobileChat] = useState(false)
  const [tab, setTab] = useState<Tab>('chats')
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [capsuleOpen, setCapsuleOpen] = useState(false)
  const [capsuleDate, setCapsuleDate] = useState('')
  const [capsuleMessage, setCapsuleMessage] = useState('')
  const [capsules, setCapsules] = useState<Capsule[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [contextMessage, setContextMessage] = useState<Message | null>(null)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [subscription, setSubscription] = useState<Plan>(() => (localStorage.getItem('pulse-plan') as Plan) || 'free')
  const [settings, setSettings] = useState<Settings>(() => {
    try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem('pulse-settings') || '{}') } } catch { return defaultSettings }
  })

  const myId = session?.user?.id

  useEffect(() => {
    checkSession()
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) loadUsers(nextSession.user.id)
    })
    return () => authSubscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.dark ? 'dark' : 'light'
    localStorage.setItem('pulse-settings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    localStorage.setItem('pulse-plan', subscription)
  }, [subscription])

  useEffect(() => {
    if (!session) return
    const channel = supabase.channel('pulse-2-realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const incoming = payload.new as Message
      if (incoming.sender_id !== myId && incoming.receiver_id !== myId) return
      const partner = incoming.sender_id === myId ? incoming.receiver_id : incoming.sender_id
      setLastMessages((current) => ({ ...current, [partner]: incoming }))
      if (selectedUser && ((incoming.sender_id === myId && incoming.receiver_id === selectedUser.id) || (incoming.sender_id === selectedUser.id && incoming.receiver_id === myId))) {
        setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming])
        if (incoming.sender_id === selectedUser.id) markAsRead(selectedUser.id)
      } else if (incoming.sender_id !== myId) {
        setUnread((current) => ({ ...current, [incoming.sender_id]: (current[incoming.sender_id] || 0) + 1 }))
        if (settings.notifications && !settings.focus && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Pulse', { body: incoming.content.slice(0, 120) })
        }
      }
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session, selectedUser, settings.notifications, settings.focus, myId])

  useEffect(() => {
    if (!session) return
    updateLastSeen()
    const timer = setInterval(updateLastSeen, 30000)
    return () => clearInterval(timer)
  }, [session])

  useEffect(() => {
    if (selectedUser && session) loadCapsules(selectedUser.id)
  }, [selectedUser, session])

  useEffect(() => {
    const close = () => { setContextMessage(null); setProfileOpen(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  async function checkSession() {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session) await loadUsers(data.session.user.id)
    setLoading(false)
  }

  async function login() {
    setAuthError(''); setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }

  async function signup() {
    setAuthError('')
    if (!username.trim()) return setAuthError('Введите имя')
    if (password.length < 6) return setAuthError('Пароль должен содержать минимум 6 символов')
    setAuthLoading(true)
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { username: username.trim() } } })
    if (error) setAuthError(error.message)
    else { setAuthError('Аккаунт создан. Проверьте email, если требуется подтверждение.'); setAuthMode('login') }
    setAuthLoading(false)
  }

  async function logout() {
    if (session) await supabase.from('profiles').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', myId)
    await supabase.auth.signOut()
    setSession(null); setSelectedUser(null); setMessages([]); setMobileChat(false)
  }

  async function updateLastSeen() {
    if (!session || settings.ghost) return
    await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', myId)
  }

  async function loadUsers(currentId?: string) {
    const { data, error } = await supabase.from('profiles').select('id, username, avatar_url, status, last_seen').order('username')
    if (error) return console.error(error)
    setUsers(data || [])
    const me = (data || []).find((user) => user.id === (currentId || myId))
    if (me) setProfileName(me.username)
  }

  async function openChat(user: User) {
    setSelectedUser(user); setMessages([]); setReplyTo(null); setChatSearch(''); setMobileChat(true); setNewChatOpen(false); setTab('chats')
    if (!session) return
    const { data, error } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${myId},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${myId})`).order('created_at', { ascending: true })
    if (!error) setMessages(data || [])
    await markAsRead(user.id)
    setUnread((current) => ({ ...current, [user.id]: 0 }))
  }

  async function markAsRead(userId: string) {
    if (!session) return
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('sender_id', userId).eq('receiver_id', myId).is('read_at', null)
  }

  async function sendMessage() {
    if (!message.trim() || !selectedUser || !session) return
    let content = message.trim()
    if (replyTo) content = `↪ ${replyTo.content.slice(0, 140)}\n${content}`
    const { error } = await supabase.from('messages').insert({ sender_id: myId, receiver_id: selectedUser.id, content, created_at: new Date().toISOString() })
    if (error) return alert(error.message)
    setMessage(''); setReplyTo(null)
  }

  async function sendFile(file: File) {
    if (!session || !selectedUser) return
    setUploading(true)
    try {
      const extension = file.name.split('.').pop() || 'file'
      const path = `${myId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('chat-files').upload(path, file)
      if (uploadError) return alert(uploadError.message)
      const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path)
      const content = file.type.startsWith('image/') ? `🖼️ ${file.name}\n${publicUrl}` : `📎 ${file.name}\n${publicUrl}`
      const { error } = await supabase.from('messages').insert({ sender_id: myId, receiver_id: selectedUser.id, content, created_at: new Date().toISOString() })
      if (error) alert(error.message)
    } finally { setUploading(false) }
  }

  async function saveProfile() {
    const name = profileName.trim()
    if (!session || !name) return
    const { error } = await supabase.from('profiles').update({ username: name, last_seen: new Date().toISOString() }).eq('id', myId)
    if (error) return alert(error.message)
    setProfileEditOpen(false); await loadUsers(myId)
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return alert('Браузер не поддерживает уведомления.')
    const permission = await Notification.requestPermission()
    setSettings((current) => ({ ...current, notifications: permission === 'granted' }))
  }

  async function loadCapsules(userId: string) {
    if (!session) return
    const { data } = await supabase.from('time_capsule_messages').select('*').eq('receiver_id', myId).eq('sender_id', userId).lte('unlock_at', new Date().toISOString()).order('created_at', { ascending: true })
    setCapsules((data || []) as Capsule[])
  }

  async function createCapsule() {
    if (!session || !selectedUser || !capsuleMessage.trim() || !capsuleDate) return
    const unlockAt = new Date(capsuleDate).toISOString()
    if (new Date(unlockAt).getTime() <= Date.now()) return alert('Выберите будущее время.')
    if (subscription === 'free' && capsules.length >= 3) return setPremiumOpen(true)
    const { error } = await supabase.from('time_capsule_messages').insert({ sender_id: myId, receiver_id: selectedUser.id, content: capsuleMessage.trim(), unlock_at: unlockAt })
    if (error) return alert(error.message)
    setCapsuleMessage(''); setCapsuleDate(''); setCapsuleOpen(false)
  }

  function copyMessage(msg: Message) {
    navigator.clipboard?.writeText(msg.content)
    setCopied(true); setTimeout(() => setCopied(false), 1000)
  }

  function playSound() {
    if (!settings.sound) return
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const context = new AudioContextClass()
      const oscillator = context.createOscillator(); const gain = context.createGain()
      oscillator.frequency.value = 660; gain.gain.value = 0.03; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.07)
    } catch {}
  }

  function choosePlan(plan: Plan) {
    if (plan === 'free') { setSubscription('free'); return }
    alert('Интерфейс подписки Pulse 2.0 готов. Для реального списания нужно подключить Stripe и его webhook в Supabase.')
  }

  function formatLastSeen(user: User) {
    if (user.status === 'online') return 'в сети'
    if (!user.last_seen) return 'не в сети'
    return `был в ${new Date(user.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  function formatTime(value: string) { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? users.filter((user) => user.username.toLowerCase().includes(query)) : users
  }, [users, search])

  const visibleMessages = useMemo(() => {
    const query = chatSearch.trim().toLowerCase()
    return query ? messages.filter((item) => item.content.toLowerCase().includes(query)) : messages
  }, [messages, chatSearch])

  if (loading) return <div className="screen-center"><div className="brand-orb">P</div><div className="loader"></div><strong>Pulse</strong><span>Загружаем пространство общения…</span></div>

  if (!session) return (
    <div className="auth-page">
      <div className="auth-glow"></div>
      <div className="auth-card">
        <div className="brand-orb large">P</div>
        <span className="eyebrow">PULSE 2.0</span>
        <h1>{authMode === 'login' ? 'Добро пожаловать' : 'Создайте Pulse'}</h1>
        <p>Мессенджер, который ставит человека и его приватность в центр.</p>
        {authMode === 'signup' && <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ваше имя" />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Пароль" onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? login() : signup())} />
        {authError && <div className="auth-error">{authError}</div>}
        <button className="primary-button" disabled={authLoading} onClick={authMode === 'login' ? login : signup}>{authLoading ? 'Подождите…' : authMode === 'login' ? 'Войти в Pulse' : 'Создать аккаунт'}</button>
        <button className="text-button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>{authMode === 'login' ? 'Создать новый аккаунт' : 'У меня уже есть аккаунт'}</button>
      </div>
    </div>
  )

  const me = users.find((user) => user.id === myId)

  return (
    <div className={`app-shell ${mobileChat ? 'mobile-chat-open' : ''} ${settings.compact ? 'compact' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand"><div className="brand-mini">P</div><div><strong>Pulse</strong><span>2.0 · human first</span></div></div>
          <button className="round-button" onClick={(e) => { e.stopPropagation(); setProfileOpen((value) => !value) }}>⋯</button>
        </div>

        <div className="sidebar-nav">
          <button className={tab === 'chats' ? 'active' : ''} onClick={() => setTab('chats')}>💬 <span>Чаты</span>{Object.values(unread).reduce((a, b) => a + b, 0) > 0 && <b>{Object.values(unread).reduce((a, b) => a + b, 0)}</b>}</button>
          <button className={tab === 'moments' ? 'active' : ''} onClick={() => setTab('moments')}>◉ <span>Moments</span></button>
          <button className={tab === 'vault' ? 'active' : ''} onClick={() => setTab('vault')}>◇ <span>Vault</span></button>
        </div>

        {profileOpen && <div className="profile-menu" onClick={(e) => e.stopPropagation()}>
          <div className="profile-menu-head"><div className="avatar big">{me?.username?.charAt(0).toUpperCase() || 'P'}<i></i></div><div><strong>{me?.username || profileName}</strong><span>{subscription === 'free' ? 'Free' : plans[subscription].name}</span></div></div>
          <button onClick={() => { setProfileOpen(false); setProfileEditOpen(true) }}>👤 Мой профиль</button>
          <button onClick={() => { setProfileOpen(false); setPremiumOpen(true) }}>✦ Pulse Premium</button>
          <button onClick={() => { setProfileOpen(false); setSettingsOpen(true) }}>⚙ Настройки</button>
          <button className="danger" onClick={logout}>↪ Выйти</button>
        </div>}

        {tab === 'chats' && <>
          <button className="new-chat-button" onClick={() => setNewChatOpen(true)}>＋ Новый чат</button>
          <div className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск чатов и людей" /></div>
          <div className="section-label">ДИАЛОГИ</div>
          <div className="chat-list">
            {filteredUsers.filter((user) => user.id !== myId).map((user) => {
              const last = lastMessages[user.id]
              return <button key={user.id} className={`chat-item ${selectedUser?.id === user.id ? 'selected' : ''}`} onClick={() => openChat(user)}>
                <div className="avatar">{user.username.charAt(0).toUpperCase()}{user.status === 'online' && <i></i>}</div>
                <div className="chat-item-body"><div><strong>{user.username}</strong><time>{last ? formatTime(last.created_at) : ''}</time></div><span>{last?.content || formatLastSeen(user)}</span></div>
                {unread[user.id] > 0 && <b className="unread">{unread[user.id]}</b>}
              </button>
            })}
            {!filteredUsers.filter((user) => user.id !== myId).length && <div className="empty-list">Пока никого не найдено</div>}
          </div>
        </>}

        {tab === 'moments' && <div className="feature-sidebar"><span>◉</span><strong>Pulse Moments</strong><p>Короткие публикации, настроение и идеи, которые исчезают через 24 часа.</p><button onClick={() => setPremiumOpen(true)}>Открыть возможности</button></div>}
        {tab === 'vault' && <div className="feature-sidebar"><span>◇</span><strong>Message Vault</strong><p>Личные заметки, одноразовые сообщения и важные вещи в отдельном пространстве.</p><button onClick={() => setPremiumOpen(true)}>Подробнее</button></div>}

        <div className="sidebar-bottom">
          <button className="profile-strip" onClick={() => setProfileEditOpen(true)}><div className="avatar">{me?.username?.charAt(0).toUpperCase() || 'P'}<i></i></div><div><strong>{me?.username || profileName}</strong><span>{subscription === 'free' ? 'Free' : plans[subscription].name}</span></div><span>⚙</span></button>
        </div>
      </aside>

      <main className="conversation">
        {!selectedUser ? <div className="welcome"><div className="hero-orb">P</div><span className="eyebrow">PULSE 2.0</span><h1>Общение без лишнего шума.</h1><p>Чаты, приватность, AI-инструменты и функции, которых хочется ждать от нового поколения мессенджеров.</p><div className="hero-actions"><button className="primary-button small" onClick={() => setNewChatOpen(true)}>＋ Новый чат</button><button className="ghost-button" onClick={() => setPremiumOpen(true)}>✦ Посмотреть Premium</button></div><div className="feature-grid"><div><b>⏳</b><strong>Time Capsules</strong><span>Сообщения из будущего</span></div><div><b>◈</b><strong>AI Layer</strong><span>Саммари и умный поиск</span></div><div><b>⌁</b><strong>Focus</strong><span>Общение без шума</span></div></div></div> : <>
          <header className="chat-header">
            <button className="back-button" onClick={() => setMobileChat(false)}>←</button>
            <div className="avatar">{selectedUser.username.charAt(0).toUpperCase()}{selectedUser.status === 'online' && <i></i>}</div>
            <div className="chat-user"><strong>{selectedUser.username}</strong><span>{formatLastSeen(selectedUser)}</span></div>
            <div className="chat-search"><span>⌕</span><input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Поиск" /></div>
            <button className="chat-action" title="AI summary" onClick={() => setPremiumOpen(true)}>✦</button>
            <button className="chat-action" title="Временная капсула" onClick={() => setCapsuleOpen(true)}>⏳</button>
          </header>

          <div className="messages">
            <div className="date-chip">Сегодня · защищённый диалог</div>
            {visibleMessages.map((msg) => {
              const mine = msg.sender_id === myId
              const parts = msg.content.split('\n')
              const url = parts.length > 1 ? parts[parts.length - 1] : ''
              const isUrl = url.startsWith('http')
              const isImage = parts[0].startsWith('🖼️')
              return <div key={msg.id} className={`message-row ${mine ? 'mine' : 'theirs'}`} onContextMenu={(e) => { e.preventDefault(); setContextMessage(msg) }}>
                <div className="message-bubble">
                  {!mine && <div className="message-author">{selectedUser.username}</div>}
                  {isUrl ? isImage ? <a href={url} target="_blank" rel="noreferrer"><img className="message-image" src={url} alt="Фото" /></a> : <a className="file-card" href={url} target="_blank" rel="noreferrer">📎 <span>{parts[0].replace('📎 ', '')}</span></a> : <div className="message-text">{msg.content}</div>}
                  <span className="message-meta">{formatTime(msg.created_at)} {mine && <b>{msg.read_at ? '✓✓' : '✓'}</b>}</span>
                </div>
              </div>
            })}
            {capsules.map((capsule) => <div key={capsule.id} className="message-row theirs"><div className="message-bubble capsule"><span>⏳ ВРЕМЕННАЯ КАПСУЛА</span><div>{capsule.content}</div><small>{formatTime(capsule.created_at)}</small></div></div>)}
            {!visibleMessages.length && !capsules.length && <div className="start-chat"><div>👋</div><strong>{chatSearch ? 'Ничего не найдено' : 'Начните разговор'}</strong><span>{chatSearch ? 'Попробуйте другой запрос' : 'Первое сообщение — за вами'}</span></div>}
          </div>

          {replyTo && <div className="reply-bar"><div><strong>Ответ</strong><span>{replyTo.content.slice(0, 120)}</span></div><button onClick={() => setReplyTo(null)}>×</button></div>}
          <div className="composer">
            <input id="pulse-file" type="file" hidden accept="image/*,.pdf,.doc,.docx,.txt,.zip,.mp4" onChange={(e) => { const file = e.target.files?.[0]; if (file) sendFile(file); e.currentTarget.value = '' }} />
            <button className="composer-button" disabled={uploading} onClick={() => document.getElementById('pulse-file')?.click()}>{uploading ? '…' : '＋'}</button>
            <input className="message-input" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (settings.enterToSend || e.ctrlKey)) { e.preventDefault(); playSound(); sendMessage() } }} placeholder={replyTo ? 'Написать ответ…' : 'Сообщение…'} />
            <button className="composer-button" onClick={() => setMessage((value) => `${value} 😊`)}>☺</button>
            <button className="send-button" disabled={!message.trim()} onClick={() => { playSound(); sendMessage() }}>➤</button>
          </div>
        </>}
      </main>

      {contextMessage && <div className="context-menu" onClick={(e) => e.stopPropagation()}><button onClick={() => { setReplyTo(contextMessage); setContextMessage(null) }}>↩ <span>Ответить</span></button><button onClick={() => copyMessage(contextMessage)}>⧉ <span>{copied ? 'Скопировано' : 'Копировать'}</span></button><button onClick={() => { setMessage(`Цитата: ${contextMessage.content.slice(0, 100)} `); setContextMessage(null) }}>⌁ <span>Цитировать</span></button><button onClick={() => setPremiumOpen(true)}>✦ <span>AI для сообщения</span></button></div>}

      {newChatOpen && <div className="modal-backdrop" onClick={() => setNewChatOpen(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">PULSE</span><h2>Новый чат</h2></div><button onClick={() => setNewChatOpen(false)}>×</button></div><div className="modal-search">⌕<input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти пользователя" /></div><div className="modal-users">{filteredUsers.filter((user) => user.id !== myId).map((user) => <button key={user.id} onClick={() => openChat(user)}><div className="avatar">{user.username.charAt(0).toUpperCase()}</div><div><strong>{user.username}</strong><span>{formatLastSeen(user)}</span></div></button>)}</div></div></div>}

      {premiumOpen && <div className="modal-backdrop" onClick={() => setPremiumOpen(false)}><div className="premium-modal" onClick={(e) => e.stopPropagation()}><div className="premium-head"><div><span className="eyebrow">PULSE MEMBERSHIP</span><h2>Больше возможностей.</h2><p>Выберите уровень Pulse и откройте функции нового поколения.</p></div><button onClick={() => setPremiumOpen(false)}>×</button></div><div className="plan-grid">{(['free', 'plus', 'pro'] as Plan[]).map((plan) => <div key={plan} className={`plan ${subscription === plan ? 'current' : ''} ${plan === 'pro' ? 'featured' : ''}`}><div className="plan-top"><span>{plan === 'pro' ? 'PRO' : plan === 'plus' ? 'PLUS' : 'FREE'}</span>{plan === 'pro' && <b>BEST</b>}</div><h3>{plans[plan].name}</h3><strong className="price">{plans[plan].price}<small>{plan === 'free' ? '' : ' / месяц'}</small></strong><p>{plans[plan].accent}</p><ul><li>✓ Безлимитные личные чаты</li><li>✓ Реакции и расширенные темы</li><li>{plan === 'free' ? '—' : '✓'} AI-саммари диалогов</li><li>{plan === 'pro' ? '✓ AI-перевод и транскрибация' : '—'}</li><li>{plan === 'pro' ? '✓ Расширенный Vault' : plan === 'plus' ? '✓ Vault' : '—'}</li><li>{plan === 'pro' ? '✓ Приоритетные функции' : '—'}</li></ul><button className={subscription === plan ? 'plan-button selected' : 'plan-button'} onClick={() => choosePlan(plan)}>{subscription === plan ? 'Текущий план' : plan === 'free' ? 'Выбрать Free' : 'Подключить'}</button></div>)}</div><div className="premium-note">Оплата подключается через Stripe. Сейчас интерфейс тарифов работает как preview и не списывает деньги.</div></div></div>}

      {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="modal-card settings-card" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">PULSE</span><h2>Настройки</h2></div><button onClick={() => setSettingsOpen(false)}>×</button></div><div className="settings-section"><div className="section-title">Интерфейс</div><SettingRow icon="◐" title="Тёмная тема" hint="Мягкая ночная палитра" on={settings.dark} onClick={() => setSettings((s) => ({ ...s, dark: !s.dark }))}/><SettingRow icon="≡" title="Компактный режим" hint="Больше контента на экране" on={settings.compact} onClick={() => setSettings((s) => ({ ...s, compact: !s.compact }))}/></div><div className="settings-section"><div className="section-title">Приватность</div><SettingRow icon="◌" title="Ghost Mode" hint="Скрыть online и last seen" on={settings.ghost} onClick={() => setSettings((s) => ({ ...s, ghost: !s.ghost }))}/><SettingRow icon="⌁" title="Focus Mode" hint="Не тревожить во время работы" on={settings.focus} onClick={() => setSettings((s) => ({ ...s, focus: !s.focus }))}/></div><div className="settings-section"><div className="section-title">Уведомления</div><SettingRow icon="♢" title="Уведомления" hint="Новые сообщения" on={settings.notifications} onClick={requestNotifications}/><SettingRow icon="♪" title="Звук" hint="Звуковой сигнал" on={settings.sound} onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}/><SettingRow icon="↵" title="Enter — отправка" hint="Ctrl + Enter всегда отправляет" on={settings.enterToSend} onClick={() => setSettings((s) => ({ ...s, enterToSend: !s.enterToSend }))}/></div><button className="settings-premium" onClick={() => { setSettingsOpen(false); setPremiumOpen(true) }}>✦ Открыть Pulse Premium</button></div></div>}

      {profileEditOpen && <div className="modal-backdrop" onClick={() => setProfileEditOpen(false)}><div className="modal-card profile-card" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">ПРОФИЛЬ</span><h2>Мой профиль</h2></div><button onClick={() => setProfileEditOpen(false)}>×</button></div><div className="profile-hero"><div className="avatar huge">{profileName.charAt(0).toUpperCase()}<i></i></div><div><strong>{plans[subscription].name}</strong><span>{session.user.email}</span></div></div><label>Имя</label><input className="modal-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveProfile()}/><button className="primary-modal-button" onClick={saveProfile}>Сохранить</button><button className="secondary-modal-button" onClick={() => { setProfileEditOpen(false); setPremiumOpen(true) }}>✦ Управлять подпиской</button></div></div>}

      {capsuleOpen && <div className="modal-backdrop" onClick={() => setCapsuleOpen(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">PULSE ORIGINAL</span><h2>Временная капсула</h2></div><button onClick={() => setCapsuleOpen(false)}>×</button></div><p className="modal-description">Напишите сообщение сейчас — собеседник увидит его только в выбранный момент.</p><label>Дата и время</label><input className="modal-input" type="datetime-local" value={capsuleDate} onChange={(e) => setCapsuleDate(e.target.value)}/><label>Послание</label><textarea className="modal-textarea" value={capsuleMessage} onChange={(e) => setCapsuleMessage(e.target.value)} placeholder="Послание из будущего…"/><button className="primary-modal-button" onClick={createCapsule}>⏳ Запланировать</button></div></div>}
    </div>
  )
}

function SettingRow({ icon, title, hint, on, onClick }: { icon: string; title: string; hint: string; on: boolean; onClick: () => void }) {
  return <button className="setting-row" onClick={onClick}><span className="setting-icon">{icon}</span><span><strong>{title}</strong><small>{hint}</small></span><i className={`toggle ${on ? 'on' : ''}`}><b></b></i></button>
}

export default App
