import { supabase } from './supabase'

const STYLE_ID = 'pulse-username-enhancer-style'

function installStyles() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .pulse-username {
      display: inline-block;
      margin-left: 5px;
      color: #7180b8;
      font-size: .82em;
      font-weight: 600;
      opacity: .9;
      white-space: nowrap;
    }
    .pulse-username--profile {
      display: block;
      margin: 2px 0 0;
      font-size: 11px;
      line-height: 15px;
      color: #7180b8;
    }
    .pulse-public-username {
      color: #7180b8;
      font-weight: 600;
    }
  `
  document.head.appendChild(style)
}

function normalize(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase()
}

async function enhanceUsernames() {
  const { data } = await supabase.from('profiles').select('id, username')
  if (!data?.length) return

  installStyles()

  const usernames = data
    .filter((user) => user.username?.trim())
    .map((user) => ({ username: user.username.trim(), key: normalize(user.username) }))

  const elements = Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .filter((element) => {
      if (element.children.length > 0) return false
      if (['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(element.tagName)) return false
      return element.textContent?.trim()
    })

  for (const element of elements) {
    if (element.querySelector('.pulse-username')) continue

    const text = element.textContent?.trim() || ''
    const match = usernames.find((user) => normalize(text) === user.key)
    if (!match) continue
    if (text.startsWith('@')) continue

    const username = document.createElement('span')
    username.className = 'pulse-username'
    username.textContent = `@${match.username}`
    element.appendChild(username)
  }
}

let timer: number | undefined

function scheduleEnhance() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    void enhanceUsernames()
  }, 120)
}

if (typeof window !== 'undefined') {
  installStyles()
  window.addEventListener('load', scheduleEnhance)
  const observer = new MutationObserver(scheduleEnhance)
  observer.observe(document.body, { childList: true, subtree: true })
  scheduleEnhance()
}
