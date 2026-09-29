import { Fragment, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import {
  cadenceForDay, changeCadence, createInvitationState, isInvitationDue,
  markInvitationShown, pauseInvitations, resumeInvitations, settleInvitation,
  shareProactively, type Cadence, type InvitationState,
} from '../../domain/invitations'
import { createJournalState, journalReducer, titleDaysAffectedByEntryChange, type Entry } from '../../domain/journal'
import { classifyChatIntent } from '../../domain/chatIntent'
import { selectAlbum, selectAnsweredQuestions, selectComparison, selectRuleQuestion, type AlbumView } from '../../domain/selectors'
import AlbumPage from '../album/AlbumPage'
import DataInsights, { type BehaviorConsents, type BehaviorSource } from '../data/DataInsights'
import '../../styles/product.css'

const DAYS = [1, 2, 8, 9] as const
const REPLY_DELAY_MS = 2400
const MAX_RECORDING_MS = 30_000
const ALBUM_START_DATE = Date.UTC(2026, 8, 28)
const BOOK_TURN_FALLBACK_MS = 850
const DEMO_WEATHER = [
  { icon: '晴', summary: '晴间薄云', temperature: '24℃', location: '杭州' },
  { icon: '云', summary: '多云', temperature: '22℃', location: '杭州' },
  { icon: '雨', summary: '短时小雨', temperature: '20℃', location: '杭州' },
  { icon: '风', summary: '晴，有微风', temperature: '23℃', location: '杭州' },
] as const
const cadenceLabel: Record<Cadence, string> = {
  daily: '每日两问', weekly: '每周一问', manual: '仅我主动',
}
type EntryChange =
  | { kind: 'editEntry'; id: string; text: string; affectedTitleDays: number[]; preflightUpdated?: boolean }
  | { kind: 'deleteEntry'; id: string; affectedTitleDays: number[]; preflightUpdated?: boolean }
type ProductTab = 'chat' | 'album' | 'data'
type AlbumTool = 'records' | 'comparison' | 'questions'
type BookTurn = { direction: 'next' | 'previous'; fromDay: number; toDay: number }
type ControlPrompt = { kind: 'fixed'; text: string } |
  { kind: 'entry'; id: string; revision: number } |
  { kind: 'observation'; id: string; revision: number }
type ControlExchange = { id: string; day: number; order: number; sentAt: string; text: string; reply: string; prompt?: ControlPrompt }
type PendingMessage = { text: string; sentAt: string; kind: 'record' | 'control'; order: number }
type TimelineItem = { kind: 'entry'; day: number; order: number; sentAt: string; entry: Entry } |
  { kind: 'control'; day: number; order: number; sentAt: string; exchange: ControlExchange }

function localIsoNow(): string {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const local = new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 19)
  const sign = offset >= 0 ? '+' : '-'
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${local}${sign}${hours}:${minutes}`
}

function detailedChatDateTime(iso: string): string {
  const [year, month, date] = iso.slice(0, 10).split('-').map(Number)
  const weekday = '日一二三四五六'[new Date(year, month - 1, date).getDay()]
  return `${year}年${month}月${date}日 星期${weekday} ${iso.slice(11, 16)}`
}

function chatTimeMarker(previous: TimelineItem, current: TimelineItem): string | null {
  if (previous.sentAt.slice(0, 10) !== current.sentAt.slice(0, 10)) return detailedChatDateTime(current.sentAt)
  return new Date(current.sentAt).getTime() - new Date(previous.sentAt).getTime() >= 15 * 60_000
    ? current.sentAt.slice(11, 16) : null
}

function nextDueDay(state: InvitationState, afterDay: number): number | null {
  for (let future = afterDay + 1; future <= afterDay + 28; future++) {
    if (isInvitationDue(state, future)) return future
  }
  return null
}

function albumDate(day: number): Date {
  return new Date(ALBUM_START_DATE + (day - 1) * 86_400_000)
}

function albumDateLabel(day: number): string {
  const date = albumDate(day)
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}

function albumDateShort(day: number): string {
  const date = albumDate(day)
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`
}

function weatherForDay(day: number) {
  return DEMO_WEATHER[(day - 1) % DEMO_WEATHER.length]
}

function AlbumPreviewPage({ album, onOpen, openingDay = 1 }: {
  album: AlbumView | null
  onOpen?: (day: number) => void
  openingDay?: number
}) {
  if (!album) {
    return <div className="album-bookplate">
      <p className="album-bookplate-eyebrow">写给今天的你</p>
      <span className="album-bookplate-mark" aria-hidden="true" />
      <h3>谢谢你，愿意为今天停一停</h3>
      <p>不必把一切都说清楚。愿意留下一句话，就已经是在认真照顾自己。</p>
      <small>这是我们一起装订的第一页 <span>{albumDateShort(openingDay)}</span></small>
    </div>
  }

  return <>
    <div className="album-preview-folio"><span>上一页</span><span>{albumDateShort(album.day)}</span></div>
    <p className="album-preview-date" aria-hidden="true">{albumDateShort(album.day)}</p>
    <p className="album-preview-kicker">第 {album.day} 天 · {album.entries.length} 条原话</p>
    <h3>{album.titleRevision ? album.title : '那天留下的原话'}</h3>
    <blockquote>“{album.entries[0]?.text}”</blockquote>
    <div className="album-preview-weather">
      <span aria-hidden="true">{weatherForDay(album.day).icon}</span>
      {weatherForDay(album.day).summary} · {weatherForDay(album.day).temperature}
    </div>
    {onOpen && <button type="button" onClick={() => onOpen(album.day)}>查看这一天详情 <span>↗</span></button>}
  </>
}

// 只读取地址栏参数，不写任何存储：?tab=album 可直接落在画册页，方便分享与预览。
function readTabFromUrl(): ProductTab {
  const requested = new URLSearchParams(window.location.search).get('tab')
  if (requested === 'album' || requested === 'data') return requested
  return 'chat'
}

function FreeSession({ onReset }: { onReset: () => void }) {
  const [journal, dispatch] = useReducer(journalReducer, 'free', createJournalState)
  const [activeTab, setActiveTab] = useState<ProductTab>(readTabFromUrl)
  const [controlExchanges, setControlExchanges] = useState<ControlExchange[]>([])
  const [consents, setConsents] = useState<BehaviorConsents>({ steps: false, spending: false, screenTime: false })
  const [invitation, setInvitation] = useState(() => markInvitationShown(createInvitationState(), 1))
  const [day, setDay] = useState(1)
  const [viewedDay, setViewedDay] = useState(1)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [firstQuestionSkipped, setFirstQuestionSkipped] = useState(false)
  const [answeredInRound, setAnsweredInRound] = useState(false)
  const [extraQuestion, setExtraQuestion] = useState(false)
  const [thirdUsed, setThirdUsed] = useState(false)
  const [questionAnchor, setQuestionAnchor] = useState<ControlPrompt | null>(null)
  const [draft, setDraft] = useState('')
  const [voiceState, setVoiceState] = useState<'idle' | 'requesting' | 'recording' | 'transcribing' | 'failure'>('idle')
  const [voiceMessage, setVoiceMessage] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [choice, setChoice] = useState<Cadence>('daily')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookTurn, setBookTurn] = useState<BookTurn | null>(null)
  const [albumTool, setAlbumTool] = useState<AlbumTool>('records')
  const [status, setStatus] = useState('')
  const [printPending, setPrintPending] = useState(false)
  const [pendingEntryChange, setPendingEntryChange] = useState<EntryChange | null>(null)
  const nextEntryId = useRef(1)
  const dayStartedAtRef = useRef<Record<number, string>>({ 1: localIsoNow() })
  const printDialogRef = useRef<HTMLDialogElement>(null)
  const printOpenerRef = useRef<HTMLElement | null>(null)
  const detailsDialogRef = useRef<HTMLDialogElement>(null)
  const detailsTriggerRef = useRef<HTMLButtonElement>(null)
  const titleConfirmRef = useRef<HTMLDialogElement>(null)
  const titleConfirmOpenerRef = useRef<HTMLElement | null>(null)
  const titleConfirmFocusReturnRef = useRef<'opener' | 'status' | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const replyTimerRef = useRef<number | null>(null)
  const bookTurnTimerRef = useRef<number | null>(null)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const settingsChoiceRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const microphoneRef = useRef<MediaStream | null>(null)
  const voiceWorkerRef = useRef<Worker | null>(null)
  const recordingTimerRef = useRef<number | null>(null)
  const recordingTickerRef = useRef<number | null>(null)
  const voiceFrameRef = useRef<number | null>(null)
  const voiceAudioContextRef = useRef<AudioContext | null>(null)
  const voiceSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const voiceCanvasRef = useRef<HTMLCanvasElement>(null)
  const voiceButtonRef = useRef<HTMLButtonElement>(null)
  const voiceRetryRef = useRef<HTMLButtonElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const recordedAudioRef = useRef<Blob | null>(null)
  const focusDraftAfterVoiceRef = useRef(false)
  const voiceDisposedRef = useRef(false)

  useEffect(() => () => {
    if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current)
    if (bookTurnTimerRef.current !== null) window.clearTimeout(bookTurnTimerRef.current)
  }, [])

  useEffect(() => {
    voiceDisposedRef.current = false
    return () => {
      voiceDisposedRef.current = true
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
      releaseMicrophone()
      voiceWorkerRef.current?.terminate()
    }
  }, [])

  useLayoutEffect(() => {
    if (voiceState === 'failure') voiceRetryRef.current?.focus()
    if (voiceState === 'idle' && focusDraftAfterVoiceRef.current) {
      focusDraftAfterVoiceRef.current = false
      messageInputRef.current?.focus()
      const end = messageInputRef.current?.value.length ?? 0
      messageInputRef.current?.setSelectionRange(end, end)
    }
  }, [voiceState])

  useEffect(() => {
    if (voiceState !== 'recording') return
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelVoiceRecording()
    }
    document.addEventListener('keydown', cancelOnEscape)
    return () => document.removeEventListener('keydown', cancelOnEscape)
  }, [voiceState])

  function startVoiceWave(stream: MediaStream) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    voiceAudioContextRef.current = context
    voiceSourceRef.current = source
    void context.resume().catch(() => {
      // Recording can still work even when a browser suspends visual metering.
    })
    // 波形色取自 design token（canvas 2D 无法直接使用 CSS 变量），兜底值即 --accent 的取值
    const waveColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#c03d2a'
    const samples = new Float32Array(analyser.fftSize)
    const levels = Array<number>(36).fill(0)
    let smoothed = 0
    let lastSampledAt = 0
    function draw(now: number) {
      if (recorderRef.current?.state !== 'recording') return
      const canvas = voiceCanvasRef.current
      const painter = canvas?.getContext('2d')
      if (canvas && painter) {
        const scale = window.devicePixelRatio || 1
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
          canvas.width = Math.round(width * scale)
          canvas.height = Math.round(height * scale)
        }
        painter.setTransform(scale, 0, 0, scale, 0, 0)
        analyser.getFloatTimeDomainData(samples)
        let squareSum = 0
        for (const sample of samples) squareSum += sample * sample
        const volume = Math.min(1, Math.sqrt(squareSum / samples.length) * 5)
        smoothed += (volume - smoothed) * (volume > smoothed ? 0.42 : 0.14)
        if (now - lastSampledAt >= 42) {
          levels.shift()
          levels.push(smoothed)
          lastSampledAt = now
        }
        painter.clearRect(0, 0, width, height)
        const gap = width / levels.length
        painter.fillStyle = waveColor
        levels.forEach((level, index) => {
          const barHeight = 2 + level * (height - 8)
          painter.globalAlpha = 0.45 + index / (levels.length * 1.8)
          painter.fillRect(index * gap + gap * 0.27, (height - barHeight) / 2,
            Math.max(1.5, gap * 0.45), barHeight)
        })
        painter.globalAlpha = 1
      }
      voiceFrameRef.current = window.requestAnimationFrame(draw)
    }
    voiceFrameRef.current = window.requestAnimationFrame(draw)
  }

  function releaseMicrophone() {
    if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current)
    recordingTimerRef.current = null
    if (recordingTickerRef.current !== null) window.clearInterval(recordingTickerRef.current)
    recordingTickerRef.current = null
    if (voiceFrameRef.current !== null) window.cancelAnimationFrame(voiceFrameRef.current)
    voiceFrameRef.current = null
    voiceSourceRef.current?.disconnect()
    voiceSourceRef.current = null
    if (voiceAudioContextRef.current) void voiceAudioContextRef.current.close()
    voiceAudioContextRef.current = null
    microphoneRef.current?.getTracks().forEach((track) => track.stop())
    microphoneRef.current = null
    recorderRef.current = null
  }

  async function transcribeRecording(blob: Blob) {
    if (voiceDisposedRef.current) return
    if (!blob.size) {
      setVoiceMessage('没有录到声音，请重试。')
      setVoiceState('idle')
      return
    }
    recordedAudioRef.current = blob
    setVoiceState('transcribing')
    setVoiceMessage('我在把你刚才说的话写下来，第一次可能要多等一会儿…')
    let context: AudioContext | null = null
    try {
      context = new AudioContext()
      const decoded = await context.decodeAudioData(await blob.arrayBuffer())
      const frames = Math.ceil(decoded.duration * 16_000)
      const offline = new OfflineAudioContext(1, frames, 16_000)
      const source = offline.createBufferSource()
      source.buffer = decoded
      source.connect(offline.destination)
      source.start()
      const samples = (await offline.startRendering()).getChannelData(0)
      if (voiceDisposedRef.current) return
      const meanSquare = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
      if (!samples.length || meanSquare < 0.000009) {
        setVoiceMessage('没有录到清晰声音，请重试。')
        recordedAudioRef.current = null
        setVoiceState('idle')
        return
      }
      const worker = voiceWorkerRef.current ?? new Worker(new URL('./voiceWorker.ts', import.meta.url), { type: 'module' })
      voiceWorkerRef.current = worker
      worker.onmessage = (event: MessageEvent<{ type: string; text?: string; message?: string }>) => {
        if (voiceDisposedRef.current) return
        if (event.data.type === 'loading') setVoiceMessage('我先准备一下，再把刚才的话写下来…')
        if (event.data.type === 'transcribing') setVoiceMessage('我在把你刚才说的话写下来…')
        if (event.data.type === 'result') {
          const text = event.data.text?.trim() ?? ''
          if (text) {
            setDraft((current) => [current.trimEnd(), text].filter(Boolean).join('\n'))
            focusDraftAfterVoiceRef.current = true
            recordedAudioRef.current = null
            setVoiceMessage('已转成文字，可修改后发送。')
            setVoiceState('idle')
          } else {
            setVoiceMessage('没有识别出文字，可以重试。')
            setVoiceState('failure')
          }
        }
        if (event.data.type === 'error') {
          setVoiceMessage('离线识别失败，可以重试或放弃。')
          setVoiceState('failure')
          console.error('Offline voice recognition failed:', event.data.message)
          worker.terminate()
          voiceWorkerRef.current = null
        }
      }
      worker.onerror = (error) => {
        setVoiceMessage('离线识别无法启动，可以重试或放弃。')
        setVoiceState('failure')
        console.error('Offline voice worker failed:', error)
        worker.terminate()
        voiceWorkerRef.current = null
      }
      worker.postMessage({ samples }, [samples.buffer])
    } catch (error) {
      setVoiceMessage('录音处理失败，可以重试或放弃。')
      setVoiceState('failure')
      console.error('Voice recording failed:', error)
    } finally {
      await context?.close()
    }
  }

  async function toggleVoiceRecording() {
    if (voiceState === 'recording') {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      releaseMicrophone()
      setVoiceState('transcribing')
      setVoiceMessage('我在准备把刚才的话写下来…')
      return
    }
    if (voiceState !== 'idle') return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' ||
      typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined' || typeof Worker === 'undefined') {
      setVoiceMessage('当前浏览器不支持离线录音，请使用键盘输入。')
      return
    }
    try {
      setVoiceState('requesting')
      setVoiceMessage('正在请求麦克风权限…')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (voiceDisposedRef.current) { stream.getTracks().forEach((track) => track.stop()); return }
      microphoneRef.current = stream
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => { releaseMicrophone(); void transcribeRecording(new Blob(chunks, { type: recorder.mimeType })) }
      recorder.onerror = () => {
        recorder.onstop = null
        if (recorder.state === 'recording') recorder.stop()
        releaseMicrophone()
        setVoiceState('idle')
        setVoiceMessage('录音出错，请重试。')
      }
      recorderRef.current = recorder
      recorder.start()
      startVoiceWave(stream)
      setVoiceState('recording')
      setRecordingSeconds(0)
      setVoiceMessage('聆听中 · 点麦克风转成文字，最长 30 秒')
      const beganAt = Date.now()
      recordingTickerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.min(30, Math.floor((Date.now() - beganAt) / 1000)))
      }, 250)
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
          releaseMicrophone()
          setVoiceState('transcribing')
          setVoiceMessage('已经听了 30 秒，我来把这段话写下来…')
        }
      }, MAX_RECORDING_MS)
    } catch (error) {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
      releaseMicrophone()
      setVoiceState('idle')
      setVoiceMessage(error instanceof DOMException && error.name === 'NotAllowedError'
        ? '麦克风权限未开启，可在浏览器设置中允许。' : '无法开始录音，请重试。')
    }
  }

  function cancelVoiceRecording() {
    if (voiceState !== 'recording') return
    const recorder = recorderRef.current
    if (recorder) {
      recorder.onstop = null
      if (recorder.state === 'recording') recorder.stop()
    }
    releaseMicrophone()
    setVoiceState('idle')
    setVoiceMessage('已停止聆听，这段语音没有转成文字。草稿还在。')
    voiceButtonRef.current?.focus()
  }

  function abandonVoiceTranscription() {
    recordedAudioRef.current = null
    setVoiceState('idle')
    setVoiceMessage('已放弃本次语音，原有草稿已保留。')
    voiceButtonRef.current?.focus()
  }

  function retryVoiceTranscription() {
    if (recordedAudioRef.current) void transcribeRecording(recordedAudioRef.current)
  }

  useLayoutEffect(() => {
    if (!printPending) {
      if (printOpenerRef.current?.isConnected) printOpenerRef.current.focus()
      printOpenerRef.current = null
      return
    }
    const dialog = printDialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
    buttons[0]?.focus()
    function containTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || buttons.length === 0) return
      const active = document.activeElement
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && (active === first || !dialog!.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog!.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', containTab, true)
    return () => {
      document.removeEventListener('keydown', containTab, true)
      if (dialog.open) dialog.close()
    }
  }, [printPending])

  function closePrintReminder() {
    if (printDialogRef.current?.open) printDialogRef.current.close()
    setPrintPending(false)
  }

  function openPrintReminder() {
    printOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPrintPending(true)
  }

  const titleConfirmationOpen = pendingEntryChange !== null
  useLayoutEffect(() => {
    if (!titleConfirmationOpen) {
      const destination = titleConfirmFocusReturnRef.current
      if (!destination) return
      const opener = titleConfirmOpenerRef.current
      const statusTarget = statusRef.current
      const fallback = document.querySelector<HTMLButtonElement>('.free-day-nav button[aria-current="date"]')
      const target = destination === 'opener' && opener?.isConnected ? opener :
        statusTarget?.isConnected ? statusTarget : fallback
      target?.focus()
      titleConfirmFocusReturnRef.current = null
      titleConfirmOpenerRef.current = null
      return
    }
    const dialog = titleConfirmRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
    buttons[0]?.focus()
    function containTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || buttons.length === 0) return
      const active = document.activeElement
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && (active === first || !dialog!.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog!.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', containTab, true)
    return () => {
      document.removeEventListener('keydown', containTab, true)
      if (dialog.open) dialog.close()
    }
  }, [titleConfirmationOpen])

  function showTitleConfirmation(change: EntryChange) {
    if (!pendingEntryChange) {
      titleConfirmOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    setPendingEntryChange(change)
  }

  function closeTitleConfirmation() {
    titleConfirmFocusReturnRef.current = 'opener'
    setPendingEntryChange(null)
  }

  const cadence = cadenceForDay(invitation, day)
  const roundClosed = invitation.settledDays.includes(day)
  const due = isInvitationDue(invitation, day) && !roundClosed
  const questionCount = cadence === 'weekly' ? 1 : 2
  const question = selectRuleQuestion(journal, day)
  const secondAfterSkipPrompt = '今天有没有一个小瞬间想留在画册里？'
  const useSecondAfterSkipPrompt = !extraQuestion && questionIndex === 1 && firstQuestionSkipped
  const visibleQuestionText = useSecondAfterSkipPrompt ? secondAfterSkipPrompt :
    questionAnchor ? controlPromptText(questionAnchor, day) : question.text
  const recordedDays = [...new Set(journal.entries.map((entry) => entry.day))]
    .sort((first, second) => first - second)
  const albumDay = recordedDays.includes(viewedDay) ? viewedDay : recordedDays.at(-1) ?? day
  const album = selectAlbum(journal, albumDay)
  const selectedDayIndex = recordedDays.indexOf(albumDay)
  const previousAlbumDay = selectedDayIndex > 0 ? recordedDays[selectedDayIndex - 1] : null
  const nextAlbumDay = selectedDayIndex >= 0 && selectedDayIndex < recordedDays.length - 1
    ? recordedDays[selectedDayIndex + 1] : null
  const comparison = selectedDayIndex > 0
    ? selectComparison(journal, recordedDays[selectedDayIndex - 1], albumDay) : null
  const bookTurnTarget = bookTurn ? selectAlbum(journal, bookTurn.toDay) : null
  const bookBaseAlbum = bookTurnTarget ?? album
  const bookBaseIndex = bookBaseAlbum ? recordedDays.indexOf(bookBaseAlbum.day) : -1
  const bookBasePreviousDay = bookTurn
    ? previousAlbumDay
    : bookBaseIndex > 0 ? recordedDays[bookBaseIndex - 1] : null
  const bookBasePreviousAlbum = bookBasePreviousDay === null ? null : selectAlbum(journal, bookBasePreviousDay)
  const nextDay = nextDueDay(invitation, day)
  const dynamicNextDay = nextDay !== null && !DAYS.includes(nextDay as typeof DAYS[number]) &&
    (cadence !== 'daily' || invitation.pendingChange !== null)
  const navigationDays = [...new Set<number>([...DAYS.filter((target) => target > day), ...(dynamicNextDay ? [nextDay] : [])])]
    .sort((first, second) => first - second)
  const answeredQuestions = selectAnsweredQuestions(journal, albumDay)
    .filter((item) => !journal.entries.find((entry) => entry.id === item.answerEntryId)?.topicId.startsWith('proactive-day-'))
  const answeredQuestionsByDay = new Map([...new Set(journal.entries.map((entry) => entry.day))]
    .map((entryDay) => [entryDay, selectAnsweredQuestions(journal, entryDay)] as const))
  const conversationTimeline: TimelineItem[] = [
    ...journal.entries.map((entry) => ({ kind: 'entry' as const, day: entry.day,
      order: Number(entry.id.slice(5)), sentAt: entry.occurredAt, entry })),
    ...controlExchanges.map((exchange) => ({ kind: 'control' as const, day: exchange.day,
      order: exchange.order, sentAt: exchange.sentAt, exchange })),
  ].sort((first, second) => first.order - second.order)
  const conversationDays = [...new Set([...conversationTimeline.map((item) => item.day), day])]
    .sort((first, second) => first - second)
    .map((conversationDay) => ({ day: conversationDay,
      items: conversationTimeline.filter((item) => item.day === conversationDay) }))

  useLayoutEffect(() => {
    if (activeTab !== 'chat' || !chatScrollRef.current) return
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [activeTab, day, journal.entries.length, controlExchanges.length, questionIndex, extraQuestion, pendingMessage])

  useLayoutEffect(() => {
    if (settingsOpen) settingsChoiceRef.current?.focus()
  }, [settingsOpen])

  useEffect(() => {
    if (activeTab !== 'chat') setSettingsOpen(false)
  }, [activeTab])

  function record(text: string, note: boolean, sentAt: string, citationEntryId?: string, fixedPrompt?: string) {
    dispatch({
      type: 'answer', citationEntryId, fixedPrompt,
      entry: {
        id: `free-${nextEntryId.current++}`, day,
        topicId: note ? `proactive-day-${day}` : 'daily-note',
        text: text.trim(),
        occurredAt: sentAt, recordedAt: sentAt, source: '本次页面对话',
      },
    })
  }

  function currentControlPrompt(): ControlPrompt {
    if (useSecondAfterSkipPrompt) return { kind: 'fixed', text: secondAfterSkipPrompt }
    if (questionAnchor) return questionAnchor
    if (question.citationEntryId) return {
      kind: 'entry', id: question.citationEntryId, revision: question.citationEntryRevision ?? 1,
    }
    if (question.citationObservationId) return {
      kind: 'observation', id: question.citationObservationId, revision: question.citationObservationRevision ?? 1,
    }
    return { kind: 'fixed', text: question.text }
  }

  function controlPromptText(prompt: ControlPrompt, promptDay: number): string {
    if (prompt.kind === 'fixed') return prompt.text
    if (prompt.kind === 'entry') {
      const entry = journal.entries.find((candidate) => candidate.id === prompt.id)
      return entry && entry.revision === prompt.revision
        ? selectRuleQuestion(journal, promptDay, entry.id).text : '这道题引用的原话已有变动，旧提问已撤下。'
    }
    const observation = journal.observations.find((candidate) => candidate.id === prompt.id)
    return observation && observation.revision === prompt.revision
      ? `你补充说“${observation.text}”。今天还有什么想记下的？`
      : '这道题引用的观察已有变动，旧提问已撤下。'
  }

  function logControl(text: string, reply: string, prompt?: ControlPrompt, sentAt = localIsoNow()) {
    const order = nextEntryId.current++
    setControlExchanges((current) => [...current, { id: `control-${order}`, day, order, sentAt, text, reply, prompt }])
  }

  function finishRound(answered: boolean) {
    const next = settleInvitation(invitation, day, answered)
    const nextCadence = cadenceForDay(next, day)
    setInvitation(next)
    if (nextCadence !== cadence) setChoice(nextCadence)
    setStatus(nextCadence !== cadence
      ? `节奏已调为${nextCadence === 'weekly' ? '每周' : '仅我主动'}，你想聊随时来`
      : answered ? '今天的记录已写入画册。' : '今天先到这里；你想聊随时来。')
  }

  function answerQuestion(text: string, sentAt: string) {
    const prompt = currentControlPrompt()
    if (prompt.kind === 'fixed') record(text, false, sentAt, undefined, prompt.text)
    else if (prompt.kind === 'entry') {
      const original = journal.entries.find((entry) => entry.id === prompt.id && entry.revision === prompt.revision)
      record(text, false, sentAt, original?.id, original ? undefined : '今天有什么想记下的？')
    } else record(text, false, sentAt, undefined, questionAnchor ? '今天有什么想记下的？' : undefined)
    setQuestionAnchor(null)
    if (extraQuestion) {
      setExtraQuestion(false)
      setThirdUsed(true)
      setInvitation(shareProactively(invitation))
      setStatus('主动补充已写入今天的画册。')
      logControl('', '记下了。今天先聊到这里，想说时随时来。')
      return
    }
    if (questionIndex + 1 < questionCount) {
      if (questionIndex === 0) setFirstQuestionSkipped(false)
      setQuestionIndex((index) => index + 1)
      setAnsweredInRound(true)
    } else {
      finishRound(true)
      logControl('', '记下了。今天先聊到这里，想说时随时来。')
    }
  }

  function skipQuestion() {
    setQuestionAnchor(null)
    if (questionIndex + 1 < questionCount) {
      if (questionIndex === 0) setFirstQuestionSkipped(true)
      setQuestionIndex((index) => index + 1)
    }
    else finishRound(answeredInRound)
  }

  function viewRecordedDay(target: number) {
    if (bookTurnTimerRef.current !== null) {
      window.clearTimeout(bookTurnTimerRef.current)
      bookTurnTimerRef.current = null
    }
    setBookTurn(null)
    setViewedDay(target)
    setEditingId(null)
    setEditDraft('')
    setEditingTitle(false)
    setTitleDraft('')
    setPrintPending(false)
    setPendingEntryChange(null)
  }

  function advanceDay(target: number) {
    if (target <= day) return
    viewRecordedDay(target)
    dayStartedAtRef.current[target] = localIsoNow()
    const settled = settleInvitation(invitation, day, answeredInRound)
    const next = isInvitationDue(settled, target) ? markInvitationShown(settled, target) : settled
    setInvitation(next)
    setDay(target)
    setQuestionIndex(0)
    setFirstQuestionSkipped(false)
    setAnsweredInRound(false)
    setExtraQuestion(false)
    setThirdUsed(false)
    setQuestionAnchor(null)
    setStatus(draft.trim() ? `未发送的消息仍在输入框中；发送后会记入第 ${target} 天。` : '')
  }

  function share(text: string, sentAt: string) {
    if (due || extraQuestion) setQuestionAnchor(currentControlPrompt())
    record(text, true, sentAt)
    setInvitation(shareProactively(invitation))
    setAnsweredInRound(true)
    setStatus('这句话已写入今天的画册；邀请节奏从这里重新计算。')
    logControl('', '已记下。想继续说，我在这里。')
  }

  function turnAlbum(direction: 'next' | 'previous') {
    if (bookTurn || selectedDayIndex < 0) return
    const targetIndex = selectedDayIndex + (direction === 'next' ? 1 : -1)
    const targetDay = recordedDays[targetIndex]
    if (targetDay === undefined) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      viewRecordedDay(targetDay)
      return
    }
    setBookTurn({ direction, fromDay: albumDay, toDay: targetDay })
    bookTurnTimerRef.current = window.setTimeout(() => {
      bookTurnTimerRef.current = null
      viewRecordedDay(targetDay)
    }, BOOK_TURN_FALLBACK_MS)
  }

  function completeBookTurn() {
    if (!bookTurn) return
    viewRecordedDay(bookTurn.toDay)
  }

  function processControlMessage({ text, sentAt }: PendingMessage) {
    const intent = classifyChatIntent(text)
    if (intent === 'skip' || intent === 'decline') {
      if (extraQuestion) {
        const prompt = currentControlPrompt()
        setExtraQuestion(false)
        setQuestionAnchor(null)
        setThirdUsed(true)
        setStatus('主动加问已收起；今天的邀请结算不变。')
        logControl(text, '好，这道加问就停在这里。想记什么仍可以直接说。', prompt, sentAt)
      } else if (due) {
        const prompt = currentControlPrompt()
        const firstSkip = intent === 'skip' && questionIndex + 1 < questionCount
        if (intent === 'skip') skipQuestion()
        else { setQuestionAnchor(null); finishRound(answeredInRound) }
        logControl(text, firstSkip ? '好，换一个轻一点的问题。' : '好，今天先到这里。你想说时随时来。', prompt, sentAt)
      } else {
        logControl(text, '今天没有待答的问题；想记什么可以直接告诉我。', undefined, sentAt)
      }
      return
    }
    if (intent === 'more') {
      const canAskThird = roundClosed && invitation.shownDays.includes(day) && cadence === 'daily' &&
        !thirdUsed && !invitation.paused
      if (canAskThird) {
        setExtraQuestion(true)
        setQuestionAnchor(null)
        logControl(text, '好，再聊一件事。', undefined, sentAt)
      } else {
        logControl(text, due || extraQuestion ? '现在还有一个问题在这里；你可以直接继续说。' :
          '今天没有新的加问；想记什么可以直接告诉我。', undefined, sentAt)
      }
      return
    }
  }

  function sendMessage() {
    const text = draft.trim()
    if (!text || replyTimerRef.current !== null) return
    const intent = classifyChatIntent(text)
    const kind = intent === 'skip' || intent === 'decline' || intent === 'more' ? 'control' : 'record'
    const message: PendingMessage = { text, sentAt: localIsoNow(), kind, order: nextEntryId.current }
    setDraft('')
    setViewedDay(day)
    setPendingMessage(message)
    if (kind === 'record') {
      if (intent === 'share' || (!due && !extraQuestion)) share(text, message.sentAt)
      else answerQuestion(text, message.sentAt)
    }
    replyTimerRef.current = window.setTimeout(() => {
      if (kind === 'control') processControlMessage(message)
      setPendingMessage(null)
      replyTimerRef.current = null
    }, REPLY_DELAY_MS)
  }

  function applyEntryChange(change: EntryChange) {
    const affectedTitleDays = titleDaysAffectedByEntryChange(journal, change.id, change.kind)
    if (affectedTitleDays.length !== change.affectedTitleDays.length ||
      affectedTitleDays.some((target, index) => target !== change.affectedTitleDays[index])) {
      showTitleConfirmation({ ...change, affectedTitleDays, preflightUpdated: true })
      return
    }
    if (!journal.entries.some((entry) => entry.id === change.id)) {
      if (pendingEntryChange) titleConfirmFocusReturnRef.current = 'status'
      setPendingEntryChange(null)
      setStatus('这条原话已不存在，请重新选择。')
      return
    }
    if (change.kind === 'editEntry') {
      dispatch({ type: 'editEntry', id: change.id, text: change.text, recordedAt: localIsoNow() })
    } else dispatch({ type: 'deleteEntry', id: change.id })
    if (pendingEntryChange) titleConfirmFocusReturnRef.current = 'status'
    setPendingEntryChange(null)
    setEditingId(null)
    setEditDraft('')
    if (change.kind === 'deleteEntry') {
      setEditingTitle(false)
      setTitleDraft('')
    }
    const result = change.kind === 'editEntry'
      ? '原话已修订；未回答的问题和对照已按当前记录更新。'
      : '这条记录已删除；相关引用已撤下。'
    const titleResult = affectedTitleDays.length > 0
      ? ` ${affectedTitleDays.length} 个日页标题及其修订历史已撤下，可以重新设置。` : ''
    setStatus(result + titleResult)
  }

  function saveEdit() {
    if (!editingId || !editDraft.trim()) return
    const text = editDraft.trim()
    if (journal.entries.find((entry) => entry.id === editingId)?.text === text) {
      setEditingId(null)
      setEditDraft('')
      return
    }
    const change: EntryChange = {
      kind: 'editEntry', id: editingId, text,
      affectedTitleDays: titleDaysAffectedByEntryChange(journal, editingId, 'editEntry'),
    }
    if (change.affectedTitleDays.length > 0) showTitleConfirmation(change)
    else applyEntryChange(change)
  }

  function saveTitle() {
    if (!titleDraft.trim()) return
    dispatch({ type: 'setTitle', day: albumDay, title: titleDraft.trim(), recordedAt: localIsoNow() })
    setEditingTitle(false)
    setTitleDraft('')
    setStatus('日页标题已修订。')
  }

  function deleteEntry(id: string) {
    const change: EntryChange = {
      kind: 'deleteEntry', id,
      affectedTitleDays: titleDaysAffectedByEntryChange(journal, id, 'deleteEntry'),
    }
    if (change.affectedTitleDays.length > 0) showTitleConfirmation(change)
    else applyEntryChange(change)
  }

  function applyCadence() {
    setInvitation(changeCadence(invitation, choice, day))
    setStatus(`新节奏从第 ${day + 1} 天生效`)
    setSettingsOpen(false)
    settingsTriggerRef.current?.focus()
  }

  function closeSettings() {
    setChoice(invitation.pendingChange?.cadence ?? cadence)
    setSettingsOpen(false)
    settingsTriggerRef.current?.focus()
  }

  function toggleSettings() {
    if (settingsOpen) {
      closeSettings()
      return
    }
    setChoice(invitation.pendingChange?.cadence ?? cadence)
    setSettingsOpen(true)
  }

  function togglePause() {
    if (invitation.paused) {
      const next = resumeInvitations(invitation, day)
      setInvitation(next)
      setStatus(nextDueDay(next, day) === null ? '邀请已恢复；目前只在你主动分享时记录。' :
        `邀请已恢复；下次邀请在第 ${nextDueDay(next, day)} 天。`)
    } else {
      setInvitation(pauseInvitations(invitation))
      setExtraQuestion(false)
      setStatus('邀请已暂停；暂停期间不会补发。')
    }
  }

  function toggleConsent(source: BehaviorSource) {
    setConsents((current) => ({ ...current, [source]: !current[source] }))
  }

  function closeDetails() {
    detailsDialogRef.current?.close()
    detailsTriggerRef.current?.focus()
  }

  return (
    <main className={'product-shell product-tab-' + activeTab} aria-label="心灵画册产品">
      <nav className="product-nav screen-only" aria-label="产品导航">
        <div className="product-brand"><span className="product-brand-mark" aria-hidden="true">●</span>
          <strong>心灵画册</strong><small>把日子慢慢装订起来</small></div>
        <div className="product-nav-links">
          <button type="button" aria-current={activeTab === 'chat' ? 'page' : undefined} onClick={() => setActiveTab('chat')}>对话</button>
          <button type="button" aria-current={activeTab === 'album' ? 'page' : undefined} onClick={() => setActiveTab('album')}>画册</button>
          <button type="button" aria-current={activeTab === 'data' ? 'page' : undefined} onClick={() => setActiveTab('data')}>生活数据</button>
        </div>
        <div className="product-nav-foot">
          <button type="button" className="product-clear" onClick={onReset} aria-label="清除本次内容">清除</button>
          <button type="button" className="product-details-trigger" ref={detailsTriggerRef}
            onClick={() => detailsDialogRef.current?.showModal()}>详情 <span aria-hidden="true">↗</span></button>
        </div>
      </nav>
      <div className="product-workspace">
        {activeTab !== 'data' && <h1 className="product-sr-title">{activeTab === 'chat' ? '聊聊今天' : '翻开画册'}</h1>}
        {status && !pendingMessage && <p ref={statusRef} className="free-status product-status screen-only" role="status" tabIndex={-1}>{status}</p>}
        <div className="product-content">
          <section className="product-chat screen-only" aria-label="对话记录" hidden={activeTab !== 'chat'}>
            <div className="product-chat-scroll" ref={chatScrollRef}>
              {conversationDays.map(({ day: conversationDay, items }) => <section className="product-chat-day"
                aria-label={'第 ' + conversationDay + ' 天对话'} key={conversationDay}>
                <p className="product-day-divider"><span>
                  <time dateTime={items[0]?.sentAt ?? dayStartedAtRef.current[conversationDay]}>
                    {detailedChatDateTime(items[0]?.sentAt ?? dayStartedAtRef.current[conversationDay])}</time>
                  {conversationDay > 1 && <small>演示第 {conversationDay} 天</small>}
                </span></p>
                <div className="product-thread">
                {items.map((item, index) => {
                  if (pendingMessage?.kind === 'record' && item.kind === 'control' &&
                    !item.exchange.text && item.order > pendingMessage.order) return null
                  const marker = index > 0 ? chatTimeMarker(items[index - 1], item) : null
                  if (item.kind === 'control') return <Fragment key={item.exchange.id}>
                    {marker && <p className="product-time-divider"><time dateTime={item.sentAt}>{marker}</time></p>}
                    <div className="product-exchange">
                    {item.exchange.prompt && <div className="product-bubble-row agent">
                      <span className="product-avatar" aria-hidden="true">画</span>
                      <div className="product-bubble"><small>心灵画册 · 当时的问题</small>
                        <p>{controlPromptText(item.exchange.prompt, item.exchange.day)}</p></div>
                    </div>}
                    {item.exchange.text && <div className="product-bubble-row user"><div className="product-bubble">
                      <p>{item.exchange.text}</p><time dateTime={item.exchange.sentAt}>{item.exchange.sentAt.slice(11, 16)}</time>
                    </div></div>}
                    <div className="product-bubble-row agent"><span className="product-avatar" aria-hidden="true">画</span>
                      <div className="product-bubble"><p>{item.exchange.reply}</p></div></div>
                    </div>
                  </Fragment>
                  const entry = item.entry
                  const answered = answeredQuestionsByDay.get(entry.day)
                    ?.find((questionRecord) => questionRecord.answerEntryId === entry.id)
                  const isProactive = entry.topicId.startsWith('proactive-day-')
                  return <Fragment key={entry.id}>
                    {marker && <p className="product-time-divider"><time dateTime={item.sentAt}>{marker}</time></p>}
                    <div className="product-exchange">
                    {answered && !isProactive && <div className="product-bubble-row agent">
                      <span className="product-avatar" aria-hidden="true">画</span>
                      <div className="product-bubble"><small>心灵画册 · 当时的问题</small>
                        <p>{answered.status === 'ready' ? answered.text :
                          answered.status === 'reference-deleted' ? '这题引用的原话已删除。' : '这题引用的原话已有修订。'}</p></div>
                    </div>}
                    <div className="product-bubble-row user"><div className="product-bubble">
                      <p>{entry.text}</p>
                      <time dateTime={entry.occurredAt}>{entry.occurredAt.slice(11, 16)}{entry.revision > 1 && ' · 已修订'}</time>
                    </div></div>
                    </div>
                  </Fragment>
                })}
                {conversationDay === day && <>
                {(!pendingMessage || pendingMessage.kind === 'control') && (due || extraQuestion) && <div className="product-bubble-row agent current">
                  <span className="product-avatar" aria-hidden="true">画</span>
                  <div className="product-bubble"><small>第 {day} 天 · {extraQuestion ? '主动第 3 题' : '第 ' + (questionIndex + 1) + ' 题'}</small>
                    <p>{visibleQuestionText}</p></div>
                </div>}
                {pendingMessage && <>
                  {pendingMessage.kind === 'control' && <div className="product-bubble-row user"><div className="product-bubble">
                    <p>{pendingMessage.text}</p><time dateTime={pendingMessage.sentAt}>{pendingMessage.sentAt.slice(11, 16)}</time>
                  </div></div>}
                  <div className="product-bubble-row agent product-typing" aria-live="polite">
                    <span className="product-avatar" aria-hidden="true">画</span>
                    <div className="product-bubble"><span>画册正在输入</span>
                      <span className="product-typing-dots" aria-hidden="true"><i /><i /><i /></span></div>
                  </div>
                </>}
                {!pendingMessage && !due && !extraQuestion && <div className="product-rest" role="note">
                  <strong>{roundClosed ? '今天的邀请已结束' : '第 ' + day + ' 天不邀请'}</strong>
                  <p>{roundClosed ? '今天可以停在这里，也可以自己再记一句。' :
                    '未展示的日期不会补发问题；想记事时仍可直接留言。'}</p>
                  {!roundClosed && cadence === 'weekly' && nextDay !== null && <p className="product-next-hint">下次邀请在第 {nextDay} 天</p>}
                </div>}
                </>}
                </div>
              </section>)}
            </div>
            <div className="product-chat-controls">
              <div className="product-composer">
                <div className="product-composer-input" aria-busy={voiceState === 'transcribing'}>
                  {voiceState === 'idle' ? <>
                    <label htmlFor="free-message">发送消息</label>
                    <textarea id="free-message" ref={messageInputRef} value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault(); sendMessage()
                        }
                      }} rows={2} placeholder="想到什么，写在这里…" />
                  </> : voiceState === 'recording' ? <div className="product-voice-panel">
                    <div className="product-wave" aria-hidden="true">
                      <canvas ref={voiceCanvasRef} />
                      <span className="product-wave-still" />
                    </div>
                    <div className="product-voice-panel-foot">
                      <span className="product-recording-label"><i aria-hidden="true" />聆听中
                        <time aria-label={`录音时长 ${Math.floor(recordingSeconds / 60)} 分 ${recordingSeconds % 60} 秒`}>
                          {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
                          {String(recordingSeconds % 60).padStart(2, '0')}</time>
                      </span>
                      <button type="button" className="product-voice-text-action" onClick={cancelVoiceRecording}
                        aria-label="停止聆听并放弃本次语音">停止聆听</button>
                    </div>
                  </div> : voiceState === 'failure' ? <div className="product-voice-state product-voice-failure">
                    <p>{voiceMessage}</p><div>
                      <button type="button" ref={voiceRetryRef} onClick={retryVoiceTranscription}>重试转写</button>
                      <button type="button" onClick={abandonVoiceTranscription}>放弃本次语音</button>
                    </div>
                  </div> : <div className="product-voice-state">
                    <span className="product-voice-progress" aria-hidden="true" />
                    <p>{voiceState === 'requesting' ? '等待麦克风授权…' : voiceMessage}</p>
                  </div>}
                </div>
                <div className="product-composer-toolbar">
                  <button type="button" className="product-settings-trigger" ref={settingsTriggerRef}
                    aria-label="邀请节奏与演示日期" aria-expanded={settingsOpen}
                    aria-controls="free-settings-panel" title="邀请节奏与演示日期" onClick={toggleSettings}>
                    <span className="product-settings-plus" aria-hidden="true">+</span>
                    <span className="product-settings-state">邀请节奏，{invitation.paused ? '已暂停' :
                      invitation.pendingChange ? `第 ${invitation.pendingChange.effectiveDay} 天起${cadenceLabel[invitation.pendingChange.cadence]}` : cadenceLabel[cadence]}</span>
                  </button>
                  <section id="free-settings-panel" className="product-settings" hidden={!settingsOpen}
                    aria-label="邀请节奏与演示日期" onKeyDown={(event) => {
                      if (event.key === 'Escape') { event.preventDefault(); closeSettings() }
                    }}>
                    <div className="product-settings-heading"><strong>邀请节奏与演示日期</strong>
                      <button type="button" onClick={closeSettings}>收起</button></div>
                    <fieldset className="product-cadence-fieldset"><legend>手动调整节奏</legend>
                      <div className="product-cadence-options">
                        {(Object.keys(cadenceLabel) as Cadence[]).map((option) => <label key={option}>
                          <input ref={choice === option ? settingsChoiceRef : undefined} type="radio"
                            name="free-cadence" value={option} checked={choice === option}
                            onChange={() => setChoice(option)} disabled={pendingMessage !== null} />
                          <span>{cadenceLabel[option]}</span>
                        </label>)}
                      </div>
                    </fieldset>
                    <p className="product-settings-help">连续两次整轮未回答才会降低频率；回看不计入。</p>
                    <div className="product-settings-actions">
                      <button type="button" className="product-apply-cadence" onClick={applyCadence}
                        disabled={pendingMessage !== null || choice === (invitation.pendingChange?.cadence ?? cadence)}>应用节奏</button>
                      <button type="button" aria-pressed={invitation.paused} onClick={togglePause}
                        disabled={pendingMessage !== null}>{invitation.paused ? '恢复邀请' : '暂停邀请'}</button>
                    </div>
                    <div className="product-advance"><span>演示日期</span><div>
                      {navigationDays.map((target) => <button type="button" key={target}
                        onClick={() => advanceDay(target)} disabled={pendingMessage !== null}>推进到第 {target} 天</button>)}
                    </div></div>
                    {dynamicNextDay && <p>下次邀请在第 {nextDay} 天；中间日期不会补发。</p>}
                  </section>
                  <div className="product-composer-actions">
                    <button type="button" className="product-voice" ref={voiceButtonRef}
                      onClick={() => void toggleVoiceRecording()}
                      disabled={voiceState !== 'idle' && voiceState !== 'recording'}
                      aria-pressed={voiceState === 'recording'} aria-busy={voiceState === 'transcribing'}
                      aria-label={voiceState === 'recording' ? '结束聆听并转成文字' :
                        voiceState === 'transcribing' ? '正在转写' : '开始语音输入'}
                      title={voiceState === 'recording' ? '结束聆听并转成文字' : '语音输入（本机识别）'}>
                      {voiceState === 'recording' ? <span className="product-voice-stop" aria-hidden="true" /> :
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
                        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="3" width="6" height="12" rx="3" />
                        <path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" />
                      </svg>}
                    </button>
                    <button type="button" className="product-send" onClick={sendMessage}
                      disabled={!draft.trim() || pendingMessage !== null || voiceState !== 'idle'}>发送</button>
                  </div>
                </div>
              </div>
              {voiceMessage && <p className="product-composer-note" role="status" aria-live="polite">{voiceMessage}</p>}
            </div>
          </section>

          <section className="product-album" aria-label="过往记录" hidden={activeTab !== 'album'}>
            {recordedDays.length > 0 && <div className="product-album-bar screen-only">
              <nav className="free-day-nav product-album-days" aria-label="有记录日期">
                {recordedDays.map((target) => <button type="button" key={target}
                  aria-label={'查看第 ' + target + ' 天'} aria-current={albumDay === target ? 'date' : undefined}
                  onClick={() => viewRecordedDay(target)}><strong>{albumDateShort(target)}</strong><small>第 {target} 天 · {selectAlbum(journal, target)?.entries.length} 条原话</small></button>)}
              </nav>
              {album && <button type="button" className="guided-print" onClick={openPrintReminder}>打印当前页 ↗</button>}
            </div>}
            {album ? <>
              <div className="product-album-book-wrap">
                <div className={`product-album-book${bookTurn ? ` is-turning-${bookTurn.direction}` : ''}`}
                  role="group" aria-label="双页翻书画册">
                  <span className="album-book-binding" aria-hidden="true" />
                  <section className="album-book-page album-book-page-left"
                    aria-label={bookBasePreviousAlbum ? `第 ${bookBasePreviousAlbum.day} 天画册预览` : '画册扉页'}>
                    <AlbumPreviewPage album={bookBasePreviousAlbum} onOpen={viewRecordedDay}
                      openingDay={bookBaseAlbum?.day ?? albumDay} />
                  </section>
                  <div className="album-book-page album-book-page-right">
                    <AlbumPage mode="private" key={bookBaseAlbum?.day ?? albumDay} album={bookBaseAlbum ?? album} journal={journal}
                      dateForDay={(target) => '第 ' + target + ' 天'}
                      displayDateForDay={(target) => `${albumDateLabel(target)} · 第 ${target} 天`}
                      weather={weatherForDay(bookBaseAlbum?.day ?? albumDay)} />
                  </div>
                  {bookTurn && bookTurnTarget && <div className={`album-turn-sheet album-turn-${bookTurn.direction}`}
                    aria-hidden="true" inert onAnimationEnd={completeBookTurn}>
                    {bookTurn.direction === 'previous'
                      ? <div className="album-turn-face album-turn-front album-turn-preview">
                        <AlbumPreviewPage album={bookBasePreviousAlbum} />
                      </div>
                      : <div className="album-turn-face album-turn-front">
                        <AlbumPage mode="private" album={album} journal={journal}
                          dateForDay={(target) => '第 ' + target + ' 天'}
                          displayDateForDay={(target) => `${albumDateLabel(target)} · 第 ${target} 天`}
                          weather={weatherForDay(album.day)} />
                      </div>}
                    <div className="album-turn-face album-turn-back" />
                  </div>}
                </div>
                <div className="album-book-controls" aria-label="画册翻页控制">
                  <button type="button" disabled={previousAlbumDay === null || bookTurn !== null}
                    onClick={() => turnAlbum('previous')} aria-label="翻到前一个有记录日期"><span>←</span> 前一天</button>
                  <p role="status" aria-live="polite">
                    <strong>{albumDateShort(albumDay)}</strong>
                    <span>第 {String(selectedDayIndex + 1).padStart(2, '0')} / {String(recordedDays.length).padStart(2, '0')} 页</span>
                  </p>
                  <button type="button" disabled={nextAlbumDay === null || bookTurn !== null}
                    onClick={() => turnAlbum('next')} aria-label="翻到后一个有记录日期">后一天 <span>→</span></button>
                </div>
              </div>
              <details className="product-album-foldout product-album-tools screen-only">
                <summary><span>页面工具</span><small>3 项 · 当前：{
                  albumTool === 'records' ? '整理这一页' : albumTool === 'comparison' ? '回望这两天' : '今天聊过的'
                }</small></summary>
                <nav className="product-album-tool-tabs" aria-label="页面工具">
                  <button type="button" aria-pressed={albumTool === 'records'}
                    onClick={() => setAlbumTool('records')}>整理这一页</button>
                  <button type="button" aria-pressed={albumTool === 'comparison'}
                    onClick={() => setAlbumTool('comparison')}>回望这两天</button>
                  <button type="button" aria-pressed={albumTool === 'questions'}
                    onClick={() => setAlbumTool('questions')}>今天聊过的</button>
                </nav>
                {albumTool === 'records' && <section className="free-record-tools product-tool-panel product-record-tools"
                  aria-label="记录管理">
                  <div className="free-title-tools">
                    {editingTitle ? <div className="free-edit-form">
                      <label htmlFor="free-title-edit">日页标题</label>
                      <input id="free-title-edit" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
                      <button type="button" onClick={saveTitle} disabled={!titleDraft.trim()}>保存标题</button>
                      <button type="button" onClick={() => { setEditingTitle(false); setTitleDraft('') }}>取消修改标题</button>
                    </div> : <button type="button" onClick={() => {
                      setEditingTitle(true); setTitleDraft(album.titleRevision > 0 ? album.title : '')
                    }}>修改日页标题</button>}
                  </div>
                  {album.entries.map((entry) => <div className="free-record-row" key={entry.id}>
                    <p>“{entry.text}”</p>
                    {editingId === entry.id ? <div className="free-edit-form">
                      <label htmlFor={'edit-' + entry.id}>修改原话</label>
                      <textarea id={'edit-' + entry.id} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} rows={3} />
                      <button type="button" onClick={saveEdit} disabled={!editDraft.trim()}>保存修改</button>
                      <button type="button" onClick={() => { setEditingId(null); setEditDraft('') }}>取消修改</button>
                    </div> : <div className="free-record-actions">
                      <button type="button" onClick={() => { setEditingId(entry.id); setEditDraft(entry.text) }}>修改这条原话</button>
                      <button type="button" onClick={() => deleteEntry(entry.id)}>删除这条原话</button>
                    </div>}
                  </div>)}
                </section>}
                {albumTool === 'comparison' && <section className="free-comparison guided-comparison product-comparison product-tool-panel"
                  role="region" aria-label="两日对照">
                  <p className="product-foldout-note">规则模式不判断变化原因。</p>
                  {comparison ? <div className="guided-comparison-pages">
                    {comparison.entries.map((entry) => <div key={entry.id}>
                      <span>{albumDateShort(entry.day)} · 第 {entry.day} 天</span><blockquote>“{entry.text}”</blockquote>
                      <small>来源：{entry.source} · {weatherForDay(entry.day).summary} {weatherForDay(entry.day).temperature}</small>
                      <button type="button" onClick={() => viewRecordedDay(entry.day)}>查看当日详情</button>
                    </div>)}
                  </div> : <p className="free-insufficient">资料不足，暂时无法对照两天原话。</p>}
                </section>}
                {albumTool === 'questions' && <section className="free-question-history product-question-history product-tool-panel"
                  role="region" aria-label="已回答问题">
                  {answeredQuestions.length > 0 ? <ol>{answeredQuestions.map((item, index) => <li key={albumDay + '-' + index}>
                    <span>第 {albumDay} 天 · {item.status === 'reference-revised' ? '引用已有修订' :
                      item.status === 'reference-deleted' ? '引用已删除' : '规则问题'}</span>
                    <p>{item.status === 'ready' ? item.text :
                      item.status === 'reference-deleted' ? '这题引用的原话已删除。' : '这题引用的原话已有修订。'}</p>
                  </li>)}</ol> : <p>这一天没有已回答的问题。</p>}
                </section>}
              </details>
            </> : <div className="product-album-empty screen-only" role="status">
              <span aria-hidden="true">○</span><h2>画册还没有第一页</h2>
              <p>回到对话，回答一个问题或主动留下一句，这里就会出现你的日页。</p>
              <button type="button" onClick={() => setActiveTab('chat')}>去对话</button>
            </div>}
          </section>

          <section className="product-data screen-only" aria-label="生活数据" hidden={activeTab !== 'data'}>
            <DataInsights consents={consents} onToggle={toggleConsent} />
          </section>
        </div>
      </div>
      <dialog ref={detailsDialogRef} className="free-print-dialog product-details-dialog screen-only"
        aria-labelledby="product-details-title"
        onCancel={(event) => { event.preventDefault(); closeDetails() }}>
        <p className="guided-section-index">关于这个演示</p>
        <h2 id="product-details-title">详情</h2>
        <dl>
          <div><dt>目前怎样回应你</dt><dd>这是前端演示，对话和提问使用预设规则，并非真实 AI 对话。</dd></div>
          <div><dt>内容保存在哪里</dt><dd>消息和画册只保留在本次页面，不需要账号，也不会长期保存；刷新后会清空。你也可以随时点右上角的「清除」。</dd></div>
          <div><dt>语音与生活数据</dt><dd>语音在你允许麦克风后录制，并在本机转成可修改的文字。生活数据目前是模拟资料，未连接手机或手表。</dd></div>
          <div><dt>关于画册</dt><dd>发送的一般消息会记入画册；你可以修改或删除这些记录。</dd></div>
        </dl>
        <button type="button" className="product-details-close" onClick={closeDetails}>知道了</button>
      </dialog>
      {printPending && <dialog ref={printDialogRef} className="free-print-dialog screen-only" role="dialog"
        aria-modal="true" aria-labelledby="free-print-title"
        onCancel={(event) => { event.preventDefault(); closePrintReminder() }}>
        <p className="guided-section-index">打印前提醒</p><h2 id="free-print-title">打印前提醒</h2>
        <p>打印或另存的 PDF 将离开本次页面内存保护，导出的文件无法由这里删除，请自行妥善保管。</p>
        <div className="free-print-actions">
          <button type="button" autoFocus onClick={closePrintReminder}>取消打印</button>
          <button type="button" onClick={() => { closePrintReminder(); window.print() }}>继续打印</button>
        </div>
      </dialog>}
      {pendingEntryChange && <dialog ref={titleConfirmRef} className="free-print-dialog free-title-dialog screen-only"
        role="dialog" aria-modal="true" aria-labelledby="free-title-confirm-title"
        onCancel={(event) => { event.preventDefault(); closeTitleConfirmation() }}>
        <p className="guided-section-index">记录修改确认</p><h2 id="free-title-confirm-title">确认撤下日页标题</h2>
        {pendingEntryChange.preflightUpdated && <p>关联标题已变化，请按更新后的清单重新确认。</p>}
        {pendingEntryChange.affectedTitleDays.length > 0 ?
          <p>{pendingEntryChange.kind === 'editEntry' ? '修改' : '删除'}这条原话会撤下
            {' '}{pendingEntryChange.affectedTitleDays.length} 个日页标题及其修订历史
            （{pendingEntryChange.affectedTitleDays.map((target) => '第 ' + target + ' 天').join('、')}）。
            标题可能引用已有原话，因此无法安全保留；继续后可以重新设置。</p> :
          <p>现在没有日页标题会被撤下。请再次确认是否继续{pendingEntryChange.kind === 'editEntry' ? '修改' : '删除'}这条原话。</p>}
        <div className="free-print-actions">
          <button type="button" autoFocus onClick={closeTitleConfirmation}>
            取消{pendingEntryChange.kind === 'editEntry' ? '修改' : '删除'}</button>
          <button type="button" onClick={() => applyEntryChange(pendingEntryChange)}>
            继续{pendingEntryChange.kind === 'editEntry' ? '修改' : '删除'}</button>
        </div>
      </dialog>}
    </main>
  )
}

export default function FreeTrial() {
  const [session, setSession] = useState(0)
  return <FreeSession key={session} onReset={() => setSession((value) => value + 1)} />
}
