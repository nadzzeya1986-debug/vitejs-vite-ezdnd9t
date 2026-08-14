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

function App() {
  const [session, setSession] = useState<any>(null)

  const [authMode, setAuthMode] =
    useState<'login' | 'signup'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] =
    useState<User | null>(null)

  const [messages, setMessages] =
    useState<Message[]>([])

  const [lastMessages, setLastMessages] =
    useState<Record<string, Message>>({})

  const [unread, setUnread] =
    useState<Record<string, number>>({})

  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const [mobileChat, setMobileChat] =
    useState(false)

  const [editingProfile, setEditingProfile] =
    useState(false)

  const [profileName, setProfileName] =
    useState('')

  /*
   * SESSION
   */

  useEffect(() => {
    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)

        if (newSession) {
          loadUsers(newSession.user.id)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  /*
   * REALTIME
   */

  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel('messenger-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMessage =
            payload.new as Message

          const myId = session.user.id

          if (
            newMessage.sender_id !== myId &&
            newMessage.receiver_id !== myId
          ) {
            return
          }

          const partnerId =
            newMessage.sender_id === myId
              ? newMessage.receiver_id
              : newMessage.sender_id

          setLastMessages((current) => ({
            ...current,
            [partnerId]: newMessage,
          }))

          if (
            selectedUser &&
            (
              (
                newMessage.sender_id === myId &&
                newMessage.receiver_id ===
                  selectedUser.id
              ) ||
              (
                newMessage.sender_id ===
                  selectedUser.id &&
                newMessage.receiver_id === myId
              )
            )
          ) {
            setMessages((current) => {
              if (
                current.some(
                  (item) =>
                    item.id === newMessage.id
                )
              ) {
                return current
              }

              return [...current, newMessage]
            })

            if (
              newMessage.sender_id ===
              selectedUser.id
            ) {
              markAsRead(selectedUser.id)
            }

            return
          }

          if (
            newMessage.sender_id !== myId
          ) {
            setUnread((current) => ({
              ...current,
              [newMessage.sender_id]:
                (current[
                  newMessage.sender_id
                ] || 0) + 1,
            }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, selectedUser])

  /*
   * ONLINE
   */

  useEffect(() => {
    if (!session) return

    updateLastSeen()

    const interval =
      setInterval(updateLastSeen, 30000)

    return () => {
      clearInterval(interval)
    }
  }, [session])

  async function updateLastSeen() {
    if (!session) return

    await supabase
      .from('profiles')
      .update({
        status: 'online',
        last_seen: new Date().toISOString(),
      })
      .eq('id', session.user.id)
  }

  /*
   * SESSION
   */

  async function checkSession() {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession()

    setSession(currentSession)

    if (currentSession) {
      await loadUsers(currentSession.user.id)
    }

    setLoading(false)
  }

  /*
   * AUTH
   */

  async function login() {
    setAuthError('')
    setAuthLoading(true)

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (error) {
      setAuthError(error.message)
    }

    setAuthLoading(false)
  }

  async function signup() {
    setAuthError('')

    if (!username.trim()) {
      setAuthError('Введите имя')
      return
    }

    if (password.length < 6) {
      setAuthError(
        'Пароль должен содержать минимум 6 символов'
      )
      return
    }

    setAuthLoading(true)

    const { error } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim(),
          },
        },
      })

    if (error) {
      setAuthError(error.message)
    } else {
      setAuthError(
        'Аккаунт создан. Проверьте email, если требуется подтверждение.'
      )

      setAuthMode('login')
    }

    setAuthLoading(false)
  }

  async function logout() {
    if (session) {
      await supabase
        .from('profiles')
        .update({
          status: 'offline',
          last_seen:
            new Date().toISOString(),
        })
        .eq('id', session.user.id)
    }

    await supabase.auth.signOut()

    setSession(null)
    setSelectedUser(null)
    setMessages([])
    setMobileChat(false)
  }

  /*
   * USERS
   */

  async function loadUsers(
    currentUserId?: string
  ) {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, username, avatar_url, status, last_seen'
      )
      .order('username')

    if (error) {
      console.error(error)
      return
    }

    setUsers(data || [])

    const myId =
      currentUserId || session?.user?.id

    if (myId) {
      const me = data?.find(
        (user) => user.id === myId
      )

      if (me) {
        setProfileName(me.username)
      }
    }
  }

  /*
   * CHAT
   */

  async function openChat(user: User) {
    setSelectedUser(user)
    setMessages([])
    setMobileChat(true)

    if (!session) return

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${session.user.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${session.user.id})`
      )
      .order('created_at', {
        ascending: true,
      })

    if (error) {
      console.error(error)
      return
    }

    setMessages(data || [])

    await markAsRead(user.id)

    setUnread((current) => ({
      ...current,
      [user.id]: 0,
    }))
  }

  async function markAsRead(userId: string) {
    if (!session) return

    await supabase
      .from('messages')
      .update({
        read_at: new Date().toISOString(),
      })
      .eq('sender_id', userId)
      .eq('receiver_id', session.user.id)
      .is('read_at', null)
  }

  /*
   * SEND TEXT
   */

  async function sendMessage() {
    if (!message.trim()) return
    if (!selectedUser) return
    if (!session) return

    const text = message.trim()

    const { error } = await supabase
      .from('messages')
      .insert({
        sender_id: session.user.id,
        receiver_id: selectedUser.id,
        content: text,
        created_at:
          new Date().toISOString(),
      })

    if (error) {
      alert(error.message)
      return
    }

    setMessage('')
  }

  /*
   * SEND FILE
   */

  async function sendFile(file: File) {
    if (!session || !selectedUser) {
      return
    }

    setUploading(true)

    try {
      const extension =
        file.name.split('.').pop() || 'file'

      const filePath =
        `${session.user.id}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } =
        await supabase.storage
          .from('chat-files')
          .upload(filePath, file)

      if (uploadError) {
        alert(uploadError.message)
        return
      }

      const {
        data: { publicUrl },
      } = supabase.storage
        .from('chat-files')
        .getPublicUrl(filePath)

      const isImage =
        file.type.startsWith('image/')

      const content =
        isImage
          ? `🖼️ ${file.name}\n${publicUrl}`
          : `📎 ${file.name}\n${publicUrl}`

      const { error } =
        await supabase
          .from('messages')
          .insert({
            sender_id: session.user.id,
            receiver_id: selectedUser.id,
            content,
            created_at:
              new Date().toISOString(),
          })

      if (error) {
        alert(error.message)
      }
    } finally {
      setUploading(false)
    }
  }

  /*
   * PROFILE
   */

  async function saveProfile() {
    if (!session) return

    const name = profileName.trim()

    if (!name) return

    const { error } = await supabase
      .from('profiles')
      .update({
        username: name,
        last_seen:
          new Date().toISOString(),
      })
      .eq('id', session.user.id)

    if (error) {
      alert(error.message)
      return
    }

    setEditingProfile(false)
    await loadUsers(session.user.id)
  }

  /*
   * HELPERS
   */

  function formatLastSeen(
    user: User
  ) {
    if (user.status === 'online') {
      return 'в сети'
    }

    if (!user.last_seen) {
      return 'не в сети'
    }

    const time = new Date(
      user.last_seen
    ).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    return `был в ${time}`
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) =>
      user.username
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [users, search])

  /*
   * LOADING
   */

  if (loading) {
    return (
      <div className="screen-center">
        <div className="loader"></div>
        <p>Загрузка Messenger...</p>
      </div>
    )
  }

  /*
   * AUTH
   */

  if (!session) {
    return (
      <div className="login-page">

        <div className="login-card">

          <div className="login-icon">
            💬
          </div>

          <h1>Messenger</h1>

          <p>
            {authMode === 'login'
              ? 'Войдите, чтобы начать общение'
              : 'Создайте аккаунт'}
          </p>

          {authMode === 'signup' && (
            <input
              type="text"
              placeholder="Ваше имя"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
          />

          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                authMode === 'login'
                  ? login()
                  : signup()
              }
            }}
          />

          {authError && (
            <div className="login-error">
              {authError}
            </div>
          )}

          <button
            className="login-button"
            disabled={authLoading}
            onClick={
              authMode === 'login'
                ? login
                : signup
            }
          >
            {authLoading
              ? 'Подождите...'
              : authMode === 'login'
              ? 'Войти'
              : 'Создать аккаунт'}
          </button>

          <button
            style={{
              marginTop: 15,
              background: 'transparent',
              color: '#5066c8',
              fontSize: 13,
            }}
            onClick={() => {
              setAuthError('')
              setAuthMode(
                authMode === 'login'
                  ? 'signup'
                  : 'login'
              )
            }}
          >
            {authMode === 'login'
              ? 'Нет аккаунта? Создать аккаунт'
              : 'Уже есть аккаунт? Войти'}
          </button>

        </div>

      </div>
    )
  }

  /*
   * MAIN
   */

  return (
    <div className="messenger">

      {/* SIDEBAR */}

      <aside
        className={`sidebar ${
          mobileChat
            ? 'mobile-hidden'
            : ''
        }`}
      >

        <div className="sidebar-top">

          <div className="brand">

            <div className="brand-logo">
              💬
            </div>

            <div>
              <strong>
                Messenger
              </strong>

              <span>
                Личные сообщения
              </span>
            </div>

          </div>

          <button
            className="logout-button"
            onClick={logout}
          >
            ↪
          </button>

        </div>

        <div className="search">

          <span>⌕</span>

          <input
            placeholder="Поиск пользователей"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />

        </div>

        <div className="section-title">
          ЧАТЫ
        </div>

        <div className="users">

          {filteredUsers.length === 0 ? (

            <div className="no-users">
              Пользователей пока нет
            </div>

          ) : (

            filteredUsers.map((user) => {

              const last =
                lastMessages[user.id]

              return (
                <button
                  key={user.id}
                  className={`user ${
                    selectedUser?.id === user.id
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    openChat(user)
                  }
                >

                  <div className="avatar">

                    {user.username
                      .charAt(0)
                      .toUpperCase()}

                    <span className="online-dot"></span>

                  </div>

                  <div className="user-info">

                    <strong>
                      {user.username}
                    </strong>

                    <span>
                      {last
                        ? last.content
                        : formatLastSeen(user)}
                    </span>

                  </div>

                  {unread[user.id] > 0 && (
                    <div
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        background: '#5066c8',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {unread[user.id]}
                    </div>
                  )}

                </button>
              )
            })

          )}

        </div>

        {/* PROFILE */}

        <div className="profile">

          <div className="avatar small">
            {profileName
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="profile-info">

            {editingProfile ? (

              <input
                value={profileName}
                onChange={(e) =>
                  setProfileName(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveProfile()
                  }
                }}
                autoFocus
                style={{
                  width: '100%',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  padding: 4,
                }}
              />

            ) : (

              <strong>
                {profileName ||
                  session.user.email}
              </strong>

            )}

            <span>В сети</span>

          </div>

          <button
            onClick={() => {
              if (editingProfile) {
                saveProfile()
              } else {
                setEditingProfile(true)
              }
            }}
            style={{
              background: 'transparent',
              fontSize: 15,
            }}
          >
            {editingProfile
              ? '✓'
              : '✏️'}
          </button>

        </div>

      </aside>

      {/* CHAT */}

      <main
        className={`chat ${
          !mobileChat
            ? 'mobile-hidden'
            : ''
        }`}
      >

        {!selectedUser ? (

          <div className="empty-chat">

            <div className="empty-icon">
              💬
            </div>

            <h1>
              Добро пожаловать
            </h1>

            <p>
              Выберите пользователя слева,
              чтобы начать разговор
            </p>

          </div>

        ) : (

          <>

            <header className="chat-header">

              <button
                className="back-button"
                onClick={() =>
                  setMobileChat(false)
                }
              >
                ←
              </button>

              <div className="avatar">

                {selectedUser.username
                  .charAt(0)
                  .toUpperCase()}

                <span className="online-dot"></span>

              </div>

              <div className="chat-user">

                <strong>
                  {selectedUser.username}
                </strong>

                <span>
                  {formatLastSeen(
                    selectedUser
                  )}
                </span>

              </div>

              <div className="chat-actions">

                <button>📞</button>
                <button>🎥</button>
                <button>⋮</button>

              </div>

            </header>

            <div className="messages">

              <div className="chat-date">
                Сегодня
              </div>

              {messages.length === 0 ? (

                <div className="start-chat">

                  <div>👋</div>

                  <strong>
                    Начните разговор
                  </strong>

                  <span>
                    Напишите первое сообщение
                  </span>

                </div>

              ) : (

                messages.map((msg) => {

                  const mine =
                    msg.sender_id ===
                    session.user.id

                  const parts =
                    msg.content.split('\n')

                  const possibleUrl =
                    parts.length > 1
                      ? parts[parts.length - 1]
                      : ''

                  const isFile =
                    possibleUrl.startsWith(
                      'http'
                    )

                  const isImage =
                    parts[0].startsWith('🖼️')

                  return (
                    <div
                      key={msg.id}
                      className={`message-row ${
                        mine
                          ? 'mine'
                          : 'theirs'
                      }`}
                    >

                      <div className="message-bubble">

                        {isFile ? (

                          <>
                            {isImage && (
                              <img
                                src={possibleUrl}
                                alt="Фото"
                                style={{
                                  maxWidth:
                                    '260px',
                                  maxHeight:
                                    '260px',
                                  borderRadius:
                                    '10px',
                                  display:
                                    'block',
                                  marginBottom:
                                    '6px',
                                }}
                              />
                            )}

                            {!isImage && (
                              <a
                                href={possibleUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                📎{' '}
                                {parts[0]
                                  .replace(
                                    '📎 ',
                                    ''
                                  )}
                              </a>
                            )}
                          </>

                        ) : (

                          <div>
                            {msg.content}
                          </div>

                        )}

                        <span>

                          {new Date(
                            msg.created_at
                          ).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}

                          {mine &&
                            (
                              msg.read_at
                                ? ' ✓✓'
                                : ' ✓'
                            )}

                        </span>

                      </div>

                    </div>
                  )
                })

              )}

            </div>

            {/* COMPOSER */}

            <div className="composer">

              <input
                id="file-upload"
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                style={{
                  display: 'none',
                }}
                onChange={(e) => {

                  const file =
                    e.target.files?.[0]

                  if (file) {
                    sendFile(file)
                  }

                  e.currentTarget.value = ''
                }}
              />

              <button
                className="attach"
                disabled={uploading}
                onClick={() =>
                  document
                    .getElementById(
                      'file-upload'
                    )
                    ?.click()
                }
              >
                {uploading
                  ? '...'
                  : '📎'}
              </button>

              <input
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    sendMessage()
                  }
                }}
                placeholder="Написать сообщение..."
              />

              <button className="emoji">
                😊
              </button>

              <button
                className="send"
                onClick={sendMessage}
              >
                ➤
              </button>

            </div>

          </>

        )}

      </main>

    </div>
  )
}

export default App