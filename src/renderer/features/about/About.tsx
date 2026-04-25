import type { CSSProperties, JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UpdateStatus } from '../../../shared/update'
import { useAppStore } from '../../state/store'
import { normalizeTrainingPreset } from '../../state/types'
import AboutMiniGame from './AboutMiniGame'
import {
  EPOCH_RUNNER_COMMAND,
  EPOCH_RUNNER_COMMAND_ALIAS,
  createEpochRunnerRewardPreset,
  isEpochRunnerRewardPreset
} from './aboutRewardPreset'

const snarkyResponses = [
  'Nice try, but this board only answers to people with active SysOp friendships.',
  'You just triggered the polite decline routine. Try again when you bring a modem with soul.',
  "The CRT hissed, then spit out: 'Go back to the lobby before you fry the capacitor.'",
  "Oh look, another would-be hacker. This terminal's got zero patience for that.",
  'Access denied-your baud rate is still stuck in 1984.',
  'We only respond to typed secrets, not whatever fantasy word salad you just entered.',
  'The BBS prefers operators who respect the autoexec.bat hierarchy.',
  "You're typing, but the system is too busy judging your choice of wallpaper.",
  'Your keypresses bounced off the phosphor; the board still wants a real handle.',
  'Autoexec.bat says no, and so do the tape reels.',
  "Your request was routed straight to the SysOp's sarcasm queue.",
  'The terminal let your keystrokes hit the screen, then laughed in green.',
  'You just filed a request to the void. The BBS clerk is rolling their eyes.',
  "Dial-up ghosts leaned over and whispered 'keep dreaming' before the command even hit.",
  'The only thing this board rejects harder than your syntax is your attitude.',
  'This pseudo-terminal runs on VHS energy and disdain-try a different vibe.',
  "You just put a 'print' command where a humble handshake belongs.",
  'Status: waiting for a real node handshake, not whatever that was.',
  "Someone keyed in 'help' and the board replied with a sassy glint of phosphor.",
  "Your input was politely ignored by the SysOp's sarcasm filter.",
  "This isn't a prompt, it's a gatekeeper. Be more interesting if you want a reply.",
  'CMOS just reset itself out of embarrassment for you.',
  'The board only listens to people who respect the floppies.',
  'You rang the BBS bell. The bell told you to get lost.',
  "The monitor flickered, then spat: 'That command is as dead as a busted 5.25-inch.'"
]

type TerminalMode = 'prompt' | 'game-loading' | 'game'

interface TerminalHistoryEntry {
  id: string
  cmd: string
  responses: string[]
}

interface BootSequenceBreak {
  type: 'break'
}

interface BootSequenceLogo {
  type: 'logo'
  content: string
}

interface BootSequenceRow {
  type: 'row' | 'header' | 'text'
  content: string
  color?: 'neon-green' | 'neon-cyan' | 'neon-magenta' | 'neon-gold'
  style?: CSSProperties
}

interface BootSequenceEntry {
  type: 'entry'
  label: string
  value: string
  link?: string
  secondaryLinkLabel?: string
  secondaryLink?: string
  statusText?: string
  statusClassName?: string
}

interface BootSequenceRichTextSegment {
  text: string
  link?: string
}

interface BootSequenceRichText {
  type: 'rich-text'
  segments: BootSequenceRichTextSegment[]
  style?: CSSProperties
}

type BootSequenceItem = BootSequenceBreak | BootSequenceLogo | BootSequenceRow | BootSequenceEntry | BootSequenceRichText

const asciiLogo = `
███╗   ██╗ █████╗ ███╗   ███╗      ██████╗  ██████╗ ████████╗
████╗  ██║██╔══██╗████╗ ████║      ██╔══██╗██╔═══██╗╚══██╔══╝
██╔██╗ ██║███████║██╔████╔██║█████╗██████╔╝██║   ██║   ██║
██║╚██╗██║██╔══██║██║╚██╔╝██║╚════╝██╔══██╗██║   ██║   ██║
██║ ╚████║██║  ██║██║ ╚═╝ ██║      ██████╔╝╚██████╔╝   ██║
╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝      ╚═════╝  ╚═════╝    ╚═╝
`

function createBootSequence(updateStatus: UpdateStatus): BootSequenceItem[] {
  const hasUpdateAvailable = updateStatus.state === 'update-available'

  return [
    { type: 'logo', content: asciiLogo },
    { type: 'row', color: 'neon-green', content: 'WELCOME TO NAM-BOT BBS' },
    { type: 'row', color: 'neon-green', content: 'NODE 1 - ONLINE 2400-56KBPS' },
    { type: 'break' },
    { type: 'header', color: 'neon-cyan', content: '[ PROJECT INFO ]' },
    { type: 'entry', label: 'REPO:', value: 'github.com/daveotero/nam-bot', link: 'https://github.com/daveotero/nam-bot' },
    { type: 'entry', label: 'REPORTS:', value: 'github.com/daveotero/nam-bot/issues', link: 'https://github.com/daveotero/nam-bot/issues' },
    {
      type: 'entry',
      label: 'VERSION:',
      value: updateStatus.currentVersion,
      statusText: hasUpdateAvailable ? 'UPDATE AVAILABLE' : undefined,
      statusClassName: hasUpdateAvailable ? 'terminal-entry-status-update' : undefined
    },
    ...(hasUpdateAvailable && updateStatus.latestVersion ? [
      {
        type: 'entry',
        label: 'LATEST:',
        value: updateStatus.latestVersion,
        link: updateStatus.releaseUrl ?? undefined,
        secondaryLinkLabel: 'CHANGELOG',
        secondaryLink: updateStatus.changelogUrl ?? undefined
      } as BootSequenceEntry
    ] : []),
    { type: 'break' },
    { type: 'header', color: 'neon-magenta', content: '[ CREATOR ]' },
    { type: 'entry', label: 'SYSOP:', value: 'daveotero.com', link: 'https://daveotero.com' },
    { type: 'entry', label: 'STUDIO:', value: 'flatlineaudio.com', link: 'https://flatlineaudio.com' },
    { type: 'entry', label: 'SUPPORT:', value: 'ko-fi.com/daveotero', link: 'https://ko-fi.com/daveotero' },
    { type: 'break' },
    { type: 'header', color: 'neon-gold', content: '[ LEGAL & NOTICES ]' },
    {
      type: 'rich-text',
      segments: [
        { text: 'Neural Amp Modeler', link: 'https://github.com/sdatkinson/neural-amp-modeler' },
        { text: ' core created by ' },
        { text: 'Steven Atkinson', link: 'https://github.com/sdatkinson' },
        { text: '.' }
      ]
    },
    { type: 'text', content: 'NAM-BOT is licensed under MIT. © 2026 Dave Otero.' },
    {
      type: 'text',
      content: 'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY.',
      style: { fontSize: '11px', marginTop: '12px', opacity: 0.7 }
    },
    { type: 'break' }
  ]
}

const epochRunnerLoaderLines = [
  'Launching EPOCHRUNNER.EXE',
  'Staging five training runs',
  'Allocating waveform terrain',
  'Calibrating jump physics',
  'Loading NAM-BOT recovery buffer',
  'Indexing +1 and +5 epoch packets',
  'Loading reward preset manifest',
  'Ready. Press SPACE.'
]

const fakeDirectoryListing = [
  ' Volume in drive C is NAM_BOT_NODE',
  ' Directory of C:\\NAM-BOT',
  '03/13/2026  09:14 PM         2,048 BOOT.LOG',
  '03/13/2026  09:14 PM         8,192 CAPTURE.LOG',
  '03/13/2026  09:14 PM       131,072 EPOCHRUNNER.EXE',
  '03/13/2026  09:14 PM        16,384 HANDSHAKE.LOG',
  '03/13/2026  09:14 PM        32,768 PHOSPHOR.LOG',
  '03/13/2026  09:14 PM        64,512 TRAINING.LOG',
  '               6 File(s)        254,976 bytes'
]

function getItemLength(item: BootSequenceItem): number {
  if (item.type === 'break') {
    return 1
  }

  if (item.type === 'entry') {
    return (
      item.label.length
      + item.value.length
      + (item.secondaryLinkLabel?.length ?? 0)
      + (item.statusText?.length ?? 0)
    )
  }

  if (item.type === 'rich-text') {
    return item.segments.reduce((total, segment) => total + segment.text.length, 0)
  }

  return item.content.length
}

function renderBootItem(
  item: BootSequenceItem,
  index: number,
  visibleChars: number,
  charOffsetRef: { current: number }
): JSX.Element | null {
  if (charOffsetRef.current >= visibleChars) {
    return null
  }

  const itemLength = getItemLength(item)
  const visibleInItem = Math.max(0, visibleChars - charOffsetRef.current)
  charOffsetRef.current += itemLength

  if (visibleInItem === 0) {
    return null
  }

  switch (item.type) {
    case 'logo':
      return <pre key={index} className="terminal-logo">{item.content.slice(0, visibleInItem)}</pre>
    case 'row':
      return <p key={index} className={`terminal-row ${item.color ?? ''}`}>{item.content.slice(0, visibleInItem)}</p>
    case 'header':
      return <h2 key={index} className={`terminal-header ${item.color ?? ''}`}>{item.content.slice(0, visibleInItem)}</h2>
    case 'entry': {
      const labelVisible = Math.min(item.label.length, visibleInItem)
      const remainingAfterLabel = Math.max(0, visibleInItem - item.label.length)
      const valueVisible = Math.min(item.value.length, remainingAfterLabel)
      const remainingAfterValue = Math.max(0, remainingAfterLabel - item.value.length)
      const secondaryLinkVisible = Math.min(item.secondaryLinkLabel?.length ?? 0, remainingAfterValue)
      const statusVisible = Math.max(0, remainingAfterValue - (item.secondaryLinkLabel?.length ?? 0))

      return (
        <div key={index} className="terminal-entry">
          <span className="terminal-label">{item.label.slice(0, labelVisible)}</span>
          {item.link ? (
            <a href={item.link} target="_blank" rel="noreferrer" className="terminal-link">
              {item.value.slice(0, valueVisible)}
            </a>
          ) : (
            <span className="terminal-field-value">{item.value.slice(0, valueVisible)}</span>
          )}
          {item.secondaryLink && item.secondaryLinkLabel && secondaryLinkVisible > 0 && (
            <a href={item.secondaryLink} target="_blank" rel="noreferrer" className="terminal-link terminal-secondary-link">
              {item.secondaryLinkLabel.slice(0, secondaryLinkVisible)}
            </a>
          )}
          {item.statusText && statusVisible > 0 && (
            <span className={`terminal-entry-status ${item.statusClassName ?? ''}`}>
              {item.statusText.slice(0, statusVisible)}
            </span>
          )}
        </div>
      )
    }
    case 'text':
      return <p key={index} className="terminal-text" style={item.style}>{item.content.slice(0, visibleInItem)}</p>
    case 'rich-text': {
      let remainingChars = visibleInItem

      return (
        <p key={index} className="terminal-text" style={item.style}>
          {item.segments.map((segment, segmentIndex) => {
            if (remainingChars <= 0) {
              return null
            }

            const visibleSegmentChars = Math.min(segment.text.length, remainingChars)
            remainingChars -= visibleSegmentChars
            const visibleText = segment.text.slice(0, visibleSegmentChars)

            if (segment.link) {
              return (
                <a key={`${index}-${segmentIndex}`} href={segment.link} target="_blank" rel="noreferrer" className="terminal-link">
                  {visibleText}
                </a>
              )
            }

            return <span key={`${index}-${segmentIndex}`}>{visibleText}</span>
          })}
        </p>
      )
    }
    case 'break':
      return <br key={index} />
    default:
      return null
  }
}

export default function About() {
  const presets = useAppStore((state) => state.presets)
  const updateStatus = useAppStore((state) => state.updateStatus)
  const loadPresets = useAppStore((state) => state.loadPresets)
  const [history, setHistory] = useState<TerminalHistoryEntry[]>([])
  const [currentInput, setCurrentInput] = useState<string>('')
  const [visibleChars, setVisibleChars] = useState<number>(0)
  const [isBootComplete, setIsBootComplete] = useState<boolean>(false)
  const [mode, setMode] = useState<TerminalMode>('prompt')
  const [loaderLineIndex, setLoaderLineIndex] = useState<number>(0)
  const [loaderVisibleChars, setLoaderVisibleChars] = useState<number>(0)
  const [aboutMessage, setAboutMessage] = useState<string | null>(null)
  const [responseVisibleChars, setResponseVisibleChars] = useState<Record<string, number>>({})
  const terminalEndRef = useRef<HTMLDivElement | null>(null)
  const gameContainerRef = useRef<HTMLDivElement | null>(null)
  const nextHistoryEntryIdRef = useRef<number>(1)
  const bootSequence = useMemo<BootSequenceItem[]>(() => createBootSequence(updateStatus), [updateStatus])
  const hasUpdateAvailable = updateStatus.state === 'update-available'

  const totalLength = useMemo<number>(
    () => bootSequence.reduce((accumulator, item) => accumulator + getItemLength(item), 0),
    [bootSequence]
  )
  const rewardPreset = presets.find((preset) => isEpochRunnerRewardPreset(preset))
  const isRewardUnlocked = rewardPreset != null
  const unfinishedResponseKeys = useMemo<string[]>(
    () => history.flatMap((historyEntry) => (
      historyEntry.responses.flatMap((response, responseIndex) => {
        const responseKey = `${historyEntry.id}-${responseIndex}`
        return (responseVisibleChars[responseKey] ?? 0) < response.length ? [responseKey] : []
      })
    )),
    [history, responseVisibleChars]
  )

  useEffect(() => {
    if (presets.length === 0) {
      void loadPresets()
    }
  }, [loadPresets, presets.length])

  useEffect(() => {
    if (visibleChars < totalLength) {
      const timer = window.setTimeout(() => {
        const burst = Math.floor(Math.random() * 30) + 20
        setVisibleChars((previous) => Math.min(previous + burst, totalLength))
      }, 25)
      return () => window.clearTimeout(timer)
    }

    setIsBootComplete(true)
    return undefined
  }, [totalLength, visibleChars])

  useEffect(() => {
    if (mode !== 'game-loading') {
      return
    }

    const currentLine = epochRunnerLoaderLines[loaderLineIndex]
    if (!currentLine) {
      const finishTimer = window.setTimeout(() => {
        setMode('game')
        setLoaderLineIndex(0)
        setLoaderVisibleChars(0)
      }, 260)
      return () => window.clearTimeout(finishTimer)
    }

    if (loaderVisibleChars < currentLine.length) {
      const timer = window.setTimeout(() => {
        const burst = Math.floor(Math.random() * 18) + 8
        setLoaderVisibleChars((previous) => Math.min(previous + burst, currentLine.length))
      }, 30)
      return () => window.clearTimeout(timer)
    }

    const lineAdvanceTimer = window.setTimeout(() => {
      setLoaderLineIndex((previous) => previous + 1)
      setLoaderVisibleChars(0)
    }, 140)
    return () => window.clearTimeout(lineAdvanceTimer)
  }, [loaderLineIndex, loaderVisibleChars, mode])

  useEffect(() => {
    if (unfinishedResponseKeys.length === 0) {
      return
    }

    const timer = window.setTimeout(() => {
      setResponseVisibleChars((previous) => {
        const nextState = { ...previous }

        for (const responseKey of unfinishedResponseKeys) {
          const separatorIndex = responseKey.lastIndexOf('-')
          if (separatorIndex === -1) {
            continue
          }

          const historyEntryId = responseKey.slice(0, separatorIndex)
          const responseIndexText = responseKey.slice(separatorIndex + 1)
          const responseIndex = Number.parseInt(responseIndexText, 10)
          const historyEntry = history.find((entry) => entry.id === historyEntryId)
          const response = historyEntry?.responses[responseIndex]
          if (!response) {
            continue
          }

          const burst = Math.floor(Math.random() * 4) + 3
          nextState[responseKey] = Math.min((nextState[responseKey] ?? 0) + burst, response.length)
        }

        return nextState
      })
    }, 55)

    return () => window.clearTimeout(timer)
  }, [history, unfinishedResponseKeys])

  useEffect(() => {
    if (!isBootComplete) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (document.activeElement?.tagName === 'A') {
        return
      }

      if (mode !== 'prompt') {
        if (
          event.key === ' '
          || event.key === 'Backspace'
          || event.key === 'ArrowUp'
          || event.key === 'ArrowDown'
          || event.key === 'ArrowLeft'
          || event.key === 'ArrowRight'
        ) {
          event.preventDefault()
        }
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const trimmedInput = currentInput.trim()
        if (!trimmedInput) {
          return
        }

        const historyEntry: TerminalHistoryEntry = {
          id: `history-${nextHistoryEntryIdRef.current}`,
          cmd: currentInput,
          responses: []
        }
        nextHistoryEntryIdRef.current += 1

        const normalizedCommand = trimmedInput.toLowerCase()

        if (
          normalizedCommand === EPOCH_RUNNER_COMMAND
          || normalizedCommand === EPOCH_RUNNER_COMMAND_ALIAS
        ) {
          setHistory((previous) => [...previous, historyEntry])
          setCurrentInput('')
          setMode('game-loading')
          setLoaderLineIndex(0)
          setLoaderVisibleChars(0)
          setAboutMessage(null)
          return
        }

        if (normalizedCommand === 'dir') {
          setHistory((previous) => [...previous, { ...historyEntry, responses: fakeDirectoryListing }])
          setCurrentInput('')
          return
        }

        const randomResp = snarkyResponses[Math.floor(Math.random() * snarkyResponses.length)]
        setHistory((previous) => [...previous, { ...historyEntry, responses: [randomResp] }])
        setCurrentInput('')
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        setCurrentInput((previous) => previous.slice(0, -1))
        return
      }

      if (event.key.length === 1) {
        event.preventDefault()
        setCurrentInput((previous) => previous + event.key)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentInput, isBootComplete, mode])

  useEffect(() => {
    if (mode === 'game') {
      gameContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [currentInput, history, isBootComplete, loaderLineIndex, loaderVisibleChars, mode, unfinishedResponseKeys, visibleChars])

  const handleSkip = (): void => {
    if (!isBootComplete) {
      setVisibleChars(totalLength)
      setIsBootComplete(true)
    }
  }

  const handleExitGame = (): void => {
    setMode('prompt')
    setAboutMessage('EPOCHRUNNER.EXE returned control to the terminal.')
  }

  const handleUnlockReward = async (): Promise<void> => {
    const existingPresets = (await window.namBot.presets.list()).map((preset) => normalizeTrainingPreset(preset))
    const existingRewardPreset = existingPresets.find((preset) => isEpochRunnerRewardPreset(preset))

    if (existingRewardPreset) {
      await loadPresets()
      setAboutMessage(`Reward preset "${existingRewardPreset.name}" is already in your library.`)
      return
    }

    const saved = normalizeTrainingPreset(await window.namBot.presets.save(createEpochRunnerRewardPreset()))
    await loadPresets()
    setAboutMessage(`Unlocked preset "${saved.name}". Check Presets or Jobs to use it right away.`)
  }

  const charOffsetRef = { current: 0 }

  return (
    <div className="layout-main terminal-container" onClick={handleSkip}>
      <div className="terminal-screen">
        <div className="terminal-scroll-area">
          <div className="terminal-content">
            {bootSequence.map((item, index) => renderBootItem(item, index, visibleChars, charOffsetRef))}

            {isBootComplete && (
              <>
                {history.map((item) => (
                  <div key={item.id} className="terminal-history-item">
                    <div className="terminal-prompt">
                      <span className="neon-green">C:\NAM-BOT&gt;</span>
                      <span className="terminal-input">{item.cmd}</span>
                    </div>
                    {item.responses.map((response, responseIndex) => (
                      <div key={`${item.id}-${responseIndex}`} className="terminal-output-line">
                        <span className="terminal-output-prefix neon-green">&gt;</span>
                        <span className="terminal-output-text">
                          {response.slice(0, responseVisibleChars[`${item.id}-${responseIndex}`] ?? 0)}
                          {unfinishedResponseKeys.includes(`${item.id}-${responseIndex}`) && <span className="terminal-cursor">█</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}

                {mode === 'game-loading' && (
                  <div className="terminal-loader">
                    {epochRunnerLoaderLines.slice(0, loaderLineIndex).map((line) => (
                      <p key={line} className="terminal-loader-line neon-cyan">{line}</p>
                    ))}
                    {epochRunnerLoaderLines[loaderLineIndex] && (
                      <p className="terminal-loader-line neon-cyan">
                        {epochRunnerLoaderLines[loaderLineIndex].slice(0, loaderVisibleChars)}
                        <span className="terminal-cursor">█</span>
                      </p>
                    )}
                  </div>
                )}

                {mode === 'game' ? (
                  <div ref={gameContainerRef}>
                    <AboutMiniGame
                      isRewardUnlocked={isRewardUnlocked}
                      onExit={handleExitGame}
                      onUnlockReward={handleUnlockReward}
                    />
                  </div>
                ) : (
                  <div className="terminal-prompt" ref={terminalEndRef}>
                    <span className="neon-green">C:\NAM-BOT&gt;</span>
                    <span className="terminal-input">{currentInput}</span>
                    <span className="terminal-cursor">█</span>
                  </div>
                )}

                {aboutMessage && <p className="terminal-status-message neon-green">{aboutMessage}</p>}
              </>
            )}
            {!isBootComplete && <div ref={terminalEndRef} />}
          </div>
        </div>
      </div>

      <style>{`
        .terminal-container {
          background-color: var(--bg-void);
          padding: 24px;
          color: var(--neon-green);
          font-family: var(--font-arcade);
          font-size: 18px;
          min-height: 100%;
          max-height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          cursor: pointer;
        }

        .terminal-screen {
          border: 2px solid var(--border-dim);
          background: rgba(0, 0, 0, 0.8);
          flex: 1;
          box-shadow: inset 0 0 100px rgba(0, 255, 0, 0.05);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .terminal-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 40px;
          display: flex;
          flex-direction: column;
        }

        .terminal-screen::after {
          content: " ";
          display: block;
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
          z-index: 2;
          background-size: 100% 2px, 3px 100%;
          pointer-events: none;
        }

        .terminal-content {
          position: relative;
          z-index: 3;
        }

        .terminal-logo {
          color: var(--neon-cyan);
          line-height: 1.1;
          margin-bottom: 30px;
          text-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
          white-space: pre;
          font-size: 12px;
          flex-shrink: 0;
        }

        .terminal-row {
          margin: 8px 0;
          letter-spacing: 1px;
          font-size: 20px;
        }

        .terminal-header {
          font-size: 20px;
          font-weight: bold;
          margin-top: 32px;
          margin-bottom: 8px;
          letter-spacing: 2px;
        }

        .terminal-entry {
          margin: 8px 0;
          display: flex;
          gap: 16px;
        }

        .terminal-label {
          color: var(--text-steel);
          min-width: 140px;
          font-size: 20px;
        }

        .terminal-field-value {
          color: var(--neon-green);
          font-size: 20px;
        }

        .terminal-entry-status {
          color: var(--neon-gold);
          font-size: 18px;
          text-shadow: 0 0 10px rgba(255, 204, 0, 0.75);
        }

        .terminal-entry-status-update {
          animation: terminalCrtFlash 1.1s steps(2, end) infinite;
        }

        .terminal-secondary-link {
          color: var(--neon-cyan);
          text-transform: uppercase;
          font-size: 18px;
        }

        .terminal-link {
          color: var(--neon-green);
          text-decoration: underline;
          cursor: pointer;
          position: relative;
          z-index: 5;
          font-size: 20px;
        }

        .terminal-link:hover {
          color: var(--text-ash);
        }

        .terminal-text {
          font-size: 20px;
          color: var(--text-steel);
          line-height: 1.4;
          margin-top: 8px;
        }

        .terminal-history-item {
          margin-bottom: 12px;
        }

        .terminal-loader-line,
        .terminal-status-message {
          margin-top: 4px;
          margin-left: 20px;
        }

        .terminal-output-line {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-top: 4px;
          margin-left: 20px;
          color: var(--text-steel);
          line-height: 1.4;
        }

        .terminal-output-prefix {
          flex-shrink: 0;
        }

        .terminal-output-text {
          color: var(--text-steel);
        }

        .terminal-loader {
          margin-top: 12px;
          margin-bottom: 6px;
        }

        .terminal-prompt {
          margin-top: 8px;
          font-size: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .terminal-cursor {
          margin-left: -4px;
          animation: blink 1s step-end infinite;
        }

        @keyframes terminalCrtFlash {
          0%, 100% {
            opacity: 1;
            text-shadow: 0 0 6px currentColor, 0 0 18px currentColor;
          }
          45% {
            opacity: 0.35;
            text-shadow: 0 0 2px currentColor;
          }
          55% {
            opacity: 0.9;
            text-shadow: 0 0 12px currentColor, 0 0 24px currentColor;
          }
        }

        .neon-green { color: var(--neon-green); }
        .neon-cyan { color: var(--neon-cyan); }
        .neon-magenta { color: var(--neon-magenta); }
        .neon-gold { color: var(--neon-gold); }

        @media (max-width: 900px) {
          .terminal-scroll-area {
            padding: 24px;
          }

          .terminal-row,
          .terminal-header,
          .terminal-label,
          .terminal-field-value,
          .terminal-link,
          .terminal-text,
          .terminal-prompt,
          .terminal-entry-status,
          .terminal-secondary-link {
            font-size: 16px;
          }

          .terminal-entry {
            flex-direction: column;
            gap: 4px;
          }

          .terminal-label {
            min-width: 0;
          }
        }
      `}</style>
    </div>
  )
}
