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

type Capsule = Message & {
  unlock_at: string
}

type Settings = {
  dark: boolean
  notifications: boolean
  sound: boolean
  enterToSend: boolean
  compact: boolean
}

const defaultSettings: Settings = {
  dark: false,
  notifications: true,
  sound: true,
  enterToSend: true,
  compact: false,
}

function App() {
  const [session, setSession] = useState<any>(null)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [chatSearch, setChatSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [mobileChat, setMobileChat] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [capsuleOpen, setCapsuleOpen] = useState(false)
  const [capsuleDate, setCapsuleDate] = useState('')
  const [capsuleMessage, setCapsuleMessage] = useState('')
  const [capsules, setCapsules] = useState<Capsule[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [contextMessage, setContextMessage] = useState<Message | null>(null)
  const [contextCopied, setContextCopied] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return { ...defaultSettings, ...JSON.parse(localStorage.getItem('pulse-settings') || '{}') }
    } catch {
      return defaultSettings
    }
  })

  useEffect(() => {
    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadUsers(newSession.user.id)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.dark ? 'dark' : 'light'
    localStorage.setItem('pulse-settings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel('pulse-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessage = payload.new as Message
        const myId = session.user.id

        if (newMessage.sender_id !== myId && newMessage.receiver_id !== myId) return

        const partnerId = newMessage.sender_id === myId ? newMessage.receiver_id : newMessage.sender_id

        setLastMessages((current) => ({ ...current, [partnerId]: newMessage }))

        if (selectedUser && (
          (newMessage.sender_id === myId && newMessage.receiver_id === selectedUser.id) ||
          (newMessage.sender_id === selectedUser.id && newMessage.receiver_id === myId)
        )) {
          setMessages((current) => current.some((item) => item.id === newMessage.id) ? current : [...current, newMessage])

          if (newMessage.sender_id === selectedUser.id) {
            markAsRead(selectedUser.id)
          }
          return
        }

        if (newMessage.sender_id !== myId) {
          setUnread((current) => ({
            ...current,
            [newMessage.sender_id]: (current[newMessage.sender_id] || 0) + 1,
          }))

          if (settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Pulse', {
              body: newMessage.content.slice(0, 100),
            })
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, selectedUser, settings.notifications])

  useEffect(() => {
    if (!session) return

    updateLastSeen()
    const interval = setInterval(updateLastSeen, 30000)

    return () => clearInterval(interval)
  }, [session])

  useEffect(() => {
    if (!selectedUser || !session) return
    loadCapsules(selectedUser.id)
  }, [selectedUser, session])

  useEffect(() => {
    const close = () => {
      setContextMessage(null)
      setProfileOpen(false)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  async function checkSession() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    setSession(currentSession)

    if (currentSession) {
      await loadUsers(currentSession.user.id)
    }

    setLoading(false)
  }

  async function updateLastSeen() {
    if (!session) return
    await supabase.from('profiles').update({
      status: 'online',
      last_seen: new Date().toISOString(),
    }).eq('id', session.user.id)
  }

  async function login() {
    setAuthError('')
    setAuthLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }

  async function signup() {
    setAuthError('')

    if (!username.trim()) {
      setAuthError('Введите имя')
      return
    }

    if (password.length < 6) {
      setAuthError('Пароль должен содержать минимум 6 символов')
      return
    }

    setAuthLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    })

    if (error) {
      setAuthError(error.message)
    } else {
      setAuthError('Аккаунт создан. Проверьте email, если требуется подтверждение.')
      setAuthMode('login')
    }

    setAuthLoading(false)
  }

  async function logout() {
    if (session) {
      await supabase.from('profiles').update({
        status: 'offline',
        last_seen: new Date().toISOString(),
      }).eq('id', session.user.id)
    }

    await supabase.auth.signOut()
    setSession(null)
    setSelectedUser(null)
    setMessages([])
    setMobileChat(false)
  }

  async function loadUsers(currentUserId?: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, status, last_seen')
      .order('username')

    if (error) {
      console.error(error)
      return
    }

    setUsers(data || [])

    const myId = currentUserId || session?.user?.id
    const me = data?.find((user) => user.id === myId)

    if (me) setProfileName(me.username)
  }

  async function openChat(user: User) {
    setSelectedUser(user)
    setMessages([])
    setReplyTo(null)
    setChatSearch('')
    setMobileChat(true)
    setNewChatOpen(false)

    if (!session) return

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${session.user.id})`)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    setMessages(data || [])
    await markAsRead(user.id)
    setUnread((current) => ({ ...current, [user.id]: 0 }))
  }

  async function markAsRead(userId: string) {
    if (!session) return

    await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', userId)
      .eq('receiver_id', session.user.id)
      .is('read_at', null)
  }

  async function sendMessage() {
    if (!message.trim() || !selectedUser || !session) return

    let text = message.trim()

    if (replyTo) {
      text = `↪ ${replyTo.content.slice(0, 140)}\n${text}`
    }

    const { error } = await supabase.from('messages').insert({
      sender_id: session.user.id,
      receiver_id: selectedUser.id,
      content: text,
      created_at: new Date().toISOString(),
    })

    if (error) {
      alert(error.message)
      return
    }

    setMessage('')
    setReplyTo(null)
  }

  async function sendFile(file: File) {
    if (!session || !selectedUser) return

    setUploading(true)

    try {
      const extension = file.name.split('.').pop() || 'file'
      const filePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage.from('chat-files').upload(filePath, file)

      if (uploadError) {
        alert(uploadError.message)
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(filePath)
      const isImage = file.type.startsWith('image/')
      const content = isImage ? `🖼️ ${file.name}\n${publicUrl}` : `📎 ${file.name}\n${publicUrl}`

      const { error } = await supabase.from('messages').insert({
        sender_id: session.user.id,
        receiver_id: selectedUser.id,
        content,
        created_at: new Date().toISOString(),
      })

      if (error) alert(error.message)
    } finally {
      setUploading(false)
    }
  }

  async function saveProfile() {
    if (!session) return

    const name = profileName.trim()
    if (!name) return

    const { error } = await supabase.from('profiles').update({
      username: name,
      last_seen: new Date().toISOString(),
    }).eq('id', session.user.id)

    if (error) {
      alert(error.message)
      return
    }

    setEditingProfile(false)
    await loadUsers(session.user.id)
  }

  async function requestNotifications() {
    if (!('Notification' in window)) {
      alert('Ваш браузер не поддерживает уведомления.')
      return
    }

    const permission = await Notification.requestPermission()

    if (permission !== 'granted') {
      setSettings((current) => ({ ...current, notifications: false }))
    }
  }

  async function loadCapsules(userId: string) {
    if (!session) return

    const { data, error } = await supabase
      .from('time_capsule_messages')
      .select('*')
      .eq('receiver_id', session.user.id)
      .eq('sender_id', userId)
      .lte('unlock_at', new Date().toISOString())
      .order('created_at', { ascending: true })

    if (error) return
    setCapsules((data || []) as Capsule[])
  }

  async function createCapsule() {
    if (!session || !selectedUser || !capsuleMessage.trim() || !capsuleDate) return

    const unlockAt = new Date(capsuleDate).toISOString()

    if (new Date(unlockAt).getTime() <= Date.now()) {
      alert('Выберите дату и время в будущем.')
      return
    }

    const { error } = await supabase.from('time_capsule_messages').insert({
      sender_id: session.user.id,
      receiver_id: selectedUser.id,
      content: capsuleMessage.trim(),
      unlock_at: unlockAt,
    })

    if (error) {
      alert(error.message)
      return
    }

    setCapsuleMessage('')
    setCapsuleDate('')
    setCapsuleOpen(false)
  }

  function formatLastSeen(user: User) {
    if (user.status === 'online') return 'в сети'
    if (!user.last_seen) return 'не в сети'

    const time = new Date(user.last_seen).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    return `был в ${time}`
  }

  function formatMessageTime(value: string) {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function playMessageSound() {
    if (!settings.sound) return

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const context = new AudioContextClass()
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.frequency.value = 660
      gain.gain.value = 0.035
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.08)
    } catch {
      // Sound is optional and should never break messaging.
    }
  }

  function copyMessage(msg: Message) {
    navigator.clipboard?.writeText(msg.content)
    setContextCopied(true)
    setTimeout(() => setContextCopied(false), 1200)
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return users

    return users.filter((user) => user.username.toLowerCase().includes(query))
  }, [users, search])

  const visibleMessages = useMemo(() => {
    const query = chatSearch.trim().toLowerCase()
    if (!query) return messages

    return messages.filter((item) => item.content.toLowerCase().includes(query))
  }, [messages, chatSearch])

  const myId = session?.user?.id

  if (loading) {
    return (
      <div className="screen-center pulse-loading">
        <div className="pulse-mark">P</div>
        <div className="loader"></div>
        <strong>Pulse</strong>
        <p>Загрузка мессенджера...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="login-page">
        <div className="login-decoration login-decoration-one"></div>
        <div className="login-decoration login-decoration-two"></div>

        <div className="login-card">
          <div className="login-icon">➤</div>
          <div className="login-brand">Pulse</div>
          <h1>{authMode === 'login' ? 'С возвращением' : 'Создайте аккаунт'}</h1>
          <p>
            {authMode === 'login'
              ? 'Общайтесь, делитесь файлами и оставайтесь на связи.'
              : 'Ваше новое пространство для общения.'}
          </p>

          {authMode === 'signup' && (
            <label>
              Имя
              <input
                type="text"
                placeholder="Как вас зовут?"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              placeholder="Минимум 6 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') authMode === 'login' ? login() : signup()
              }}
            />
          </label>

          {authError && <div className="login-error">{authError}</div>}

          <button className="login-button" disabled={authLoading} onClick={authMode === 'login' ? login : signup}>
            {authLoading ? 'Подождите...' : authMode === 'login' ? 'Войти в Pulse' : 'Создать аккаунт'}
          </button>

          <button className="auth-switch" onClick={() => {
            setAuthError('')
            setAuthMode(authMode === 'login' ? 'signup' : 'login')
          }}>
            {authMode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`messenger ${settings.compact ? 'compact' : ''}`}>
      <aside className={`sidebar ${mobileChat ? 'mobile-hidden' : ''}`}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-logo">➤</div>
            <div>
              <strong>Pulse</strong>
              <span>Личные сообщения</span>
            </div>
          </div>

          <button className="top-icon-button" onClick={() => setNewChatOpen(true)} title="Новый чат">
            +
          </button>
        </div>

        <div className="search">
          <span>⌕</span>
          <input
            placeholder="Поиск пользователей"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
        </div>

        <div className="sidebar-tabs">
          <button className="active">Все</button>
          <button>Непрочитанные {Object.values(unread).reduce((sum, count) => sum + count, 0) > 0 && <b>•</b>}</button>
        </div>

        <div className="section-title">ЧАТЫ</div>

        <div className="users">
          {filteredUsers.length === 0 ? (
            <div className="no-users">
              <div>⌕</div>
              <strong>Ничего не найдено</strong>
              <span>Попробуйте другое имя</span>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const last = lastMessages[user.id]
              const unreadCount = unread[user.id] || 0

              return (
                <button
                  key={user.id}
                  className={`user ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => openChat(user)}
                >
                  <div className="avatar">
                    {user.username.charAt(0).toUpperCase()}
                    {user.status === 'online' && <span className="online-dot"></span>}
                  </div>

                  <div className="user-info">
                    <div className="user-name-line">
                      <strong>{user.username}</strong>
                      {last && <time>{formatMessageTime(last.created_at)}</time>}
                    </div>
                    <span>{last ? last.content.replace(/^🖼️ |^📎 /, '') : formatLastSeen(user)}</span>
                  </div>

                  {unreadCount > 0 && <div className="unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</div>}
                </button>
              )
            })
          )}
        </div>

        <div className="profile">
          <button className="profile-main" onClick={(e) => {
            e.stopPropagation()
            setProfileOpen((current) => !current)
          }}>
            <div className="avatar small">
              {profileName.charAt(0).toUpperCase()}
              <span className="online-dot"></span>
            </div>
            <div className="profile-info">
              <strong>{profileName || session.user.email}</strong>
              <span>В сети</span>
            </div>
            <span className="profile-chevron">⌄</span>
          </button>

          {profileOpen && (
            <div className="profile-menu" onClick={(e) => e.stopPropagation()}>
              <div className="profile-menu-head">
                <div className="avatar profile-menu-avatar">{profileName.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{profileName || 'Пользователь'}</strong>
                  <span>{session.user.email}</span>
                </div>
              </div>

              <button onClick={() => {
                setProfileOpen(false)
                setEditingProfile(true)
              }}>✎ <span>Редактировать профиль</span></button>

              <button onClick={() => {
                setProfileOpen(false)
                setSettingsOpen(true)
              }}>⚙ <span>Настройки</span></button>

              <button onClick={() => {
                setProfileOpen(false)
                setAboutOpen(true)
              }}>ⓘ <span>О Pulse</span></button>

              <div className="menu-divider"></div>

              <button className="danger" onClick={logout}>↪ <span>Выйти</span></button>
            </div>
          )}
        </div>
      </aside>

      <main className={`chat ${!mobileChat ? 'mobile-hidden' : ''}`}>
        {!selectedUser ? (
          <div className="empty-chat">
            <div className="empty-icon pulse-empty-icon">➤</div>
            <h1>Добро пожаловать в Pulse</h1>
            <p>Выберите пользователя слева или начните новый чат.</p>
            <button className="empty-action" onClick={() => setNewChatOpen(true)}>＋ Новый чат</button>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <button className="back-button" onClick={() => setMobileChat(false)}>←</button>

              <div className="avatar">
                {selectedUser.username.charAt(0).toUpperCase()}
                {selectedUser.status === 'online' && <span className="online-dot"></span>}
              </div>

              <div className="chat-user">
                <strong>{selectedUser.username}</strong>
                <span>{formatLastSeen(selectedUser)}</span>
              </div>

              <div className="chat-search-wrap">
                <span>⌕</span>
                <input
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Поиск"
                />
              </div>

              <div className="chat-actions">
                <button title="Поиск" onClick={() => document.querySelector<HTMLInputElement>('.chat-search-wrap input')?.focus()}>⌕</button>
                <button title="Голосовой звонок">☎</button>
                <button title="Ещё" onClick={() => setCapsuleOpen(true)}>⏳</button>
              </div>
            </header>

            <div className="messages">
              <div className="chat-date">Сегодня</div>

              {visibleMessages.length === 0 && capsules.length === 0 ? (
                <div className="start-chat">
                  <div>👋</div>
                  <strong>{chatSearch ? 'Ничего не найдено' : 'Начните разговор'}</strong>
                  <span>{chatSearch ? 'Попробуйте другой запрос' : 'Напишите первое сообщение'}</span>
                </div>
              ) : (
                <>
                  {visibleMessages.map((msg) => {
                    const mine = msg.sender_id === myId
                    const parts = msg.content.split('\n')
                    const possibleUrl = parts.length > 1 ? parts[parts.length - 1] : ''
                    const isFile = possibleUrl.startsWith('http')
                    const isImage = parts[0].startsWith('🖼️')

                    return (
                      <div
                        key={msg.id}
                        className={`message-row ${mine ? 'mine' : 'theirs'}`}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setContextMessage(msg)
                        }}
                      >
                        <div className="message-bubble">
                          {!mine && <div className="message-author">{selectedUser.username}</div>}

                          {isFile ? (
                            <>
                              {isImage ? (
                                <a href={possibleUrl} target="_blank" rel="noreferrer" className="image-message">
                                  <img src={possibleUrl} alt="Фото" />
                                </a>
                              ) : (
                                <a href={possibleUrl} target="_blank" rel="noreferrer" className="file-message">
                                  <span>📎</span>
                                  <span>{parts[0].replace('📎 ', '')}</span>
                                </a>
                              )}
                            </>
                          ) : (
                            <div className="message-text">{msg.content}</div>
                          )}

                          <span className="message-meta">
                            {formatMessageTime(msg.created_at)}
                            {mine && <b>{msg.read_at ? '✓✓' : '✓'}</b>}
                          </span>
                        </div>
                      </div>
                    )
                  })}

                  {capsules.map((capsule) => (
                    <div key={`capsule-${capsule.id}`} className="message-row theirs">
                      <div className="message-bubble capsule-bubble">
                        <div className="capsule-label">⏳ Временная капсула</div>
                        <div className="message-text">{capsule.content}</div>
                        <span className="message-meta">{formatMessageTime(capsule.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {replyTo && (
              <div className="reply-bar">
                <div>
                  <strong>Ответ на сообщение</strong>
                  <span>{replyTo.content.slice(0, 100)}</span>
                </div>
                <button onClick={() => setReplyTo(null)}>×</button>
              </div>
            )}

            <div className="composer">
              <input
                id="file-upload"
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) sendFile(file)
                  e.currentTarget.value = ''
                }}
              />

              <button className="composer-icon" disabled={uploading} onClick={() => document.getElementById('file-upload')?.click()} title="Прикрепить файл">
                {uploading ? '…' : '＋'}
              </button>

              <input
                className="message-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (settings.enterToSend || e.ctrlKey)) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder={replyTo ? 'Написать ответ...' : 'Написать сообщение...'}
              />

              <button className="composer-icon" onClick={() => setMessage((current) => `${current} 😊`)} title="Эмодзи">☺</button>

              <button className="send" onClick={() => {
                playMessageSound()
                sendMessage()
              }} disabled={!message.trim()} title="Отправить">
                ➤
              </button>
            </div>
          </>
        )}
      </main>

      {contextMessage && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => {
            setReplyTo(contextMessage)
            setContextMessage(null)
          }}>↩ <span>Ответить</span></button>
          <button onClick={() => copyMessage(contextMessage)}>⧉ <span>{contextCopied ? 'Скопировано' : 'Копировать'}</span></button>
        </div>
      )}

      {newChatOpen && (
        <div className="modal-backdrop" onClick={() => setNewChatOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">PULSE</span>
                <h2>Новый чат</h2>
              </div>
              <button onClick={() => setNewChatOpen(false)}>×</button>
            </div>
            <div className="modal-search">
              <span>⌕</span>
              <input autoFocus placeholder="Найти пользователя" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="modal-users">
              {filteredUsers.filter((user) => user.id !== myId).map((user) => (
                <button key={user.id} onClick={() => openChat(user)}>
                  <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>
                  <div><strong>{user.username}</strong><span>{formatLastSeen(user)}</span></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card settings-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="eyebrow">PULSE</span><h2>Настройки</h2></div>
              <button onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <section className="settings-section">
              <div className="settings-section-title">Внешний вид</div>
              <button className="setting-row" onClick={() => setSettings((current) => ({ ...current, dark: !current.dark }))}>
                <span className="setting-icon">◐</span>
                <span><strong>Тёмная тема</strong><small>Меняет оформление Pulse</small></span>
                <i className={`toggle ${settings.dark ? 'on' : ''}`}><b></b></i>
              </button>
              <button className="setting-row" onClick={() => setSettings((current) => ({ ...current, compact: !current.compact }))}>
                <span className="setting-icon">≡</span>
                <span><strong>Компактный режим</strong><small>Больше чатов на экране</small></span>
                <i className={`toggle ${settings.compact ? 'on' : ''}`}><b></b></i>
              </button>
            </section>

            <section className="settings-section">
              <div className="settings-section-title">Уведомления</div>
              <button className="setting-row" onClick={() => {
                if (!settings.notifications) requestNotifications()
                setSettings((current) => ({ ...current, notifications: !current.notifications }))
              }}>
                <span className="setting-icon">♢</span>
                <span><strong>Уведомления</strong><small>Новые сообщения</small></span>
                <i className={`toggle ${settings.notifications ? 'on' : ''}`}><b></b></i>
              </button>
              <button className="setting-row" onClick={() => setSettings((current) => ({ ...current, sound: !current.sound }))}>
                <span className="setting-icon">♪</span>
                <span><strong>Звук</strong><small>Звуковой сигнал отправки</small></span>
                <i className={`toggle ${settings.sound ? 'on' : ''}`}><b></b></i>
              </button>
            </section>

            <section className="settings-section">
              <div className="settings-section-title">Чаты</div>
              <button className="setting-row" onClick={() => setSettings((current) => ({ ...current, enterToSend: !current.enterToSend }))}>
                <span className="setting-icon">↵</span>
                <span><strong>Enter — отправка</strong><small>Ctrl + Enter всегда отправляет</small></span>
                <i className={`toggle ${settings.enterToSend ? 'on' : ''}`}><b></b></i>
              </button>
            </section>

            <button className="settings-profile-button" onClick={() => {
              setSettingsOpen(false)
              setEditingProfile(true)
            }}>✎ Редактировать профиль</button>
          </div>
        </div>
      )}

      {editingProfile && (
        <div className="modal-backdrop" onClick={() => setEditingProfile(false)}>
          <div className="modal-card profile-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="eyebrow">ПРОФИЛЬ</span><h2>Ваш профиль</h2></div>
              <button onClick={() => setEditingProfile(false)}>×</button>
            </div>
            <div className="profile-large-avatar">{profileName.charAt(0).toUpperCase()}</div>
            <label className="modal-label">Имя</label>
            <input className="modal-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && saveProfile()} />
            <div className="profile-email">{session.user.email}</div>
            <button className="primary-modal-button" onClick={saveProfile}>Сохранить изменения</button>
          </div>
        </div>
      )}

      {capsuleOpen && (
        <div className="modal-backdrop" onClick={() => setCapsuleOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="eyebrow">УНИКАЛЬНАЯ ФУНКЦИЯ</span><h2>Временная капсула</h2></div>
              <button onClick={() => setCapsuleOpen(false)}>×</button>
            </div>
            <p className="modal-description">Напишите сообщение сейчас — собеседник увидит его только в выбранный момент.</p>
            <label className="modal-label">Дата и время открытия</label>
            <input className="modal-input" type="datetime-local" value={capsuleDate} onChange={(e) => setCapsuleDate(e.target.value)} />
            <label className="modal-label">Сообщение</label>
            <textarea className="modal-textarea" value={capsuleMessage} onChange={(e) => setCapsuleMessage(e.target.value)} placeholder="Послание из будущего..." />
            <button className="primary-modal-button" onClick={createCapsule}>⏳ Запланировать сообщение</button>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
          <div className="modal-card about-card" onClick={(e) => e.stopPropagation()}>
            <div className="about-logo">➤</div>
            <h2>Pulse</h2>
            <p>Современный мессенджер для личного общения.</p>
            <div className="about-pills"><span>Realtime</span><span>Files</span><span>Supabase</span><span>Private</span></div>
            <small>Версия 1.0 RC</small>
            <button className="primary-modal-button" onClick={() => setAboutOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
