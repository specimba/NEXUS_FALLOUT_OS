'use client'

// ============================================================
// NEXUS OS — Settings app
//
// 4 tabs:
//   APPEARANCE  theme picker, CRT quality, scanline intensity,
//               CRT on/off, wallpaper picker
//   SYSTEM      username, sound, reset filesystem, clear chat
//   ABOUT       NEXUS OS v3.1 info, ASCII logo, quick-launch
//   POWER       Lock / Restart / Shutdown
//
// Wired to useSettingsStore. Theme changes propagate via the
// ThemeApplier in layout (it subscribes to the same store).
// ============================================================

import { useState } from 'react'
import {
  Settings as SettingsIcon,
  Palette,
  Cpu,
  Info,
  Power,
  Lock,
  RotateCw,
  PowerOff,
  Trash2,
  MessageSquare,
  Volume2,
  User,
  Terminal,
  Bot,
  Radar,
  Folder,
  Code2,
  StickyNote,
} from 'lucide-react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useSettingsStore,
  PHOSPHOR_THEME_LIST,
  WALLPAPER_LIST,
} from '@/stores/settings-store'
import { useFsStore } from '@/stores/fs-store'
import { useOsStore } from '@/stores/os-store'
import { registerApp, openApp } from '@/apps/registry'
import type { CrtQuality, ThemeId, WallpaperId } from '@/lib/os/types'
import type { WindowComponentProps } from '@/lib/os/types'

const ASCII_LOGO = ` _   _ _____ __  ___   _
| \\ | | ____|\\ \\/ / | | |
|  \\| |  _|   \\  /| | | |
| |\\  | |___  /  \\| |_| |
|_| \\_|_____|_/\\_\\\\___/`

const CRT_QUALITIES: Array<{ id: CrtQuality; label: string; hint: string }> = [
  { id: 'static', label: 'STATIC', hint: 'scanlines + vignette only' },
  { id: 'subtle', label: 'SUBTLE', hint: '+ slow flicker' },
  { id: 'full', label: 'FULL', hint: '+ beam sweep' },
]

const QUICK_APPS: Array<{
  id: Parameters<typeof openApp>[0]
  label: string
  icon: React.ReactNode
}> = [
  { id: 'terminal', label: 'Terminal', icon: <Terminal className="h-4 w-4" /> },
  { id: 'nexus-ai', label: 'NEXUS AI', icon: <Bot className="h-4 w-4" /> },
  { id: 'command-center', label: 'Command', icon: <Radar className="h-4 w-4" /> },
  { id: 'web-agent', label: 'Web Agent', icon: <Bot className="h-4 w-4" /> },
  { id: 'files', label: 'Files', icon: <Folder className="h-4 w-4" /> },
  { id: 'code-editor', label: 'Code', icon: <Code2 className="h-4 w-4" /> },
  { id: 'notepad', label: 'Notepad', icon: <StickyNote className="h-4 w-4" /> },
]

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      className="border p-3"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-deep)',
      }}
    >
      <h3
        className="mb-3 text-[10px] uppercase tracking-[0.25em]"
        style={{ color: 'var(--phosphor-dim)' }}
      >
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div
          className="text-[11px] uppercase tracking-widest"
          style={{ color: 'var(--phosphor-bright)' }}
        >
          {label}
        </div>
        {hint && (
          <div
            className="mt-0.5 text-[10px] opacity-70"
            style={{ color: 'var(--phosphor-dim)' }}
          >
            {hint}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SettingsApp(_props: WindowComponentProps) {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const crt = useSettingsStore((s) => s.crt)
  const setCrt = useSettingsStore((s) => s.setCrt)
  const crtQuality = useSettingsStore((s) => s.crtQuality)
  const setCrtQuality = useSettingsStore((s) => s.setCrtQuality)
  const scanlines = useSettingsStore((s) => s.scanlines)
  const setScanlines = useSettingsStore((s) => s.setScanlines)
  const wallpaper = useSettingsStore((s) => s.wallpaper)
  const setWallpaper = useSettingsStore((s) => s.setWallpaper)
  const username = useSettingsStore((s) => s.username)
  const setUsername = useSettingsStore((s) => s.setUsername)
  const sound = useSettingsStore((s) => s.sound)
  const setSound = useSettingsStore((s) => s.setSound)

  const resetFs = useFsStore((s) => s.reset)
  const osLock = useOsStore((s) => s.lock)
  const osReboot = useOsStore((s) => s.reboot)
  const osShutdown = useOsStore((s) => s.shutdown)

  const [usernameDraft, setUsernameDraft] = useState(username)
  const [chatCleared, setChatCleared] = useState(false)

  const onClearChat = () => {
    try {
      window.localStorage.removeItem('nexus:chat:v1')
      window.localStorage.removeItem('nexus:ai-chat:v1')
    } catch {
      /* ignore */
    }
    setChatCleared(true)
    window.setTimeout(() => setChatCleared(false), 2500)
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'var(--bg-deep)', color: 'var(--phosphor)' }}
    >
      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-2 border-b px-4 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <SettingsIcon className="h-4 w-4" style={{ color: 'var(--phosphor-bright)' }} />
        <span
          className="text-xs uppercase tracking-[0.3em]"
          style={{
            color: 'var(--phosphor-bright)',
            fontFamily: 'var(--font-display), ui-monospace, monospace',
          }}
        >
          NEXUS // Settings
        </span>
      </header>

      <Tabs defaultValue="appearance" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <TabsList
          className="self-start"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <TabsTrigger value="appearance" className="gap-1 text-[10px] uppercase tracking-widest">
            <Palette className="h-3 w-3" /> Appearance
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1 text-[10px] uppercase tracking-widest">
            <Cpu className="h-3 w-3" /> System
          </TabsTrigger>
          <TabsTrigger value="about" className="gap-1 text-[10px] uppercase tracking-widest">
            <Info className="h-3 w-3" /> About
          </TabsTrigger>
          <TabsTrigger value="power" className="gap-1 text-[10px] uppercase tracking-widest">
            <Power className="h-3 w-3" /> Power
          </TabsTrigger>
        </TabsList>

        {/* APPEARANCE */}
        <TabsContent value="appearance" className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title="Phosphor Theme">
              <div className="grid grid-cols-2 gap-2">
                {PHOSPHOR_THEME_LIST.map((t) => {
                  const active = theme === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id as ThemeId)}
                      className="flex items-center gap-2 border p-2 text-left transition"
                      style={{
                        borderColor: active ? t.fg : 'var(--border)',
                        background: active ? t.bg : 'var(--card)',
                        boxShadow: active ? `0 0 0 1px ${t.fg}, 0 0 14px ${t.glow}` : 'none',
                      }}
                      aria-pressed={active}
                      aria-label={`Switch to ${t.name}`}
                    >
                      <span
                        className="h-6 w-6 shrink-0 border"
                        style={{
                          background: t.bg,
                          borderColor: t.fg,
                          boxShadow: `inset 0 0 8px ${t.glow}`,
                        }}
                      >
                        <span
                          className="block h-full w-full"
                          style={{ background: `linear-gradient(135deg, ${t.fg} 0%, ${t.dim} 100%)` }}
                        />
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block text-[10px] uppercase tracking-widest"
                          style={{ color: active ? t.fg : 'var(--phosphor-bright)' }}
                        >
                          {t.name}
                        </span>
                        <span
                          className="block font-mono text-[9px] opacity-70"
                          style={{ color: active ? t.fg : 'var(--phosphor-dim)' }}
                        >
                          {t.fg}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </Panel>

            <Panel title="CRT Overlay">
              <Row label="CRT" hint="enable scanline + vignette overlay">
                <Switch checked={crt} onCheckedChange={setCrt} aria-label="Toggle CRT" />
              </Row>
              <div className="space-y-1.5">
                <Label
                  htmlFor="crt-quality"
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: 'var(--phosphor-bright)' }}
                >
                  Quality
                </Label>
                <div className="grid grid-cols-3 gap-1">
                  {CRT_QUALITIES.map((q) => {
                    const active = crtQuality === q.id
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCrtQuality(q.id)}
                        className="border px-2 py-1.5 text-[10px] uppercase tracking-widest transition"
                        style={{
                          borderColor: active ? 'var(--phosphor)' : 'var(--border)',
                          color: active ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
                          background: active ? 'var(--card)' : 'transparent',
                        }}
                        aria-pressed={active}
                      >
                        {q.label}
                      </button>
                    )
                  })}
                </div>
                <p
                  className="text-[9px] opacity-70"
                  style={{ color: 'var(--phosphor-dim)' }}
                >
                  {CRT_QUALITIES.find((q) => q.id === crtQuality)?.hint}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="scanlines"
                    className="text-[10px] uppercase tracking-widest"
                    style={{ color: 'var(--phosphor-bright)' }}
                  >
                    Scanline Intensity
                  </Label>
                  <span
                    className="font-mono text-[10px] tabular-nums"
                    style={{ color: 'var(--phosphor)' }}
                  >
                    {scanlines}%
                  </span>
                </div>
                <Slider
                  id="scanlines"
                  value={[scanlines]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setScanlines(v[0] ?? 0)}
                  disabled={!crt}
                  aria-label="Scanline intensity"
                />
              </div>
            </Panel>

            <Panel title="Wallpaper">
              <div className="grid grid-cols-5 gap-1.5">
                {WALLPAPER_LIST.map((w) => {
                  const active = wallpaper === w.id
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setWallpaper(w.id as WallpaperId)}
                      title={w.name}
                      aria-label={`Use ${w.name} wallpaper`}
                      aria-pressed={active}
                      className="group relative aspect-square overflow-hidden border transition"
                      style={{
                        borderColor: active ? 'var(--phosphor)' : 'var(--border)',
                        background: w.css,
                        boxShadow: active ? '0 0 0 1px var(--phosphor), 0 0 12px var(--phosphor-glow)' : 'none',
                      }}
                    >
                      <span
                        className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[8px] uppercase tracking-widest"
                        style={{
                          background: 'rgba(0,0,0,0.55)',
                          color: active ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
                        }}
                      >
                        {w.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* SYSTEM */}
        <TabsContent value="system" className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title="User">
              <div className="space-y-1.5">
                <Label
                  htmlFor="username"
                  className="flex items-center gap-1 text-[10px] uppercase tracking-widest"
                  style={{ color: 'var(--phosphor-bright)' }}
                >
                  <User className="h-3 w-3" /> Username
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="username"
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    className="font-mono text-xs"
                    style={{
                      background: 'var(--card)',
                      borderColor: 'var(--border)',
                      color: 'var(--phosphor-bright)',
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setUsername(usernameDraft.trim() || 'nexus')}
                    className="text-[10px] uppercase tracking-widest"
                  >
                    Save
                  </Button>
                </div>
              </div>
              <Row label="Sound" hint="key click + beep synthesis">
                <Switch checked={sound} onCheckedChange={setSound} aria-label="Toggle sound" />
              </Row>
            </Panel>

            <Panel title="Maintenance">
              <Row label="Reset filesystem" hint="restore default NEXUS VFS tree">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-[10px] uppercase tracking-widest"
                    >
                      <Trash2 className="h-3 w-3" /> Reset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent
                    style={{
                      background: 'var(--card)',
                      borderColor: 'var(--phosphor-dim)',
                      color: 'var(--phosphor)',
                    }}
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle
                        style={{ color: 'var(--phosphor-bright)' }}
                      >
                        Reset filesystem?
                      </AlertDialogTitle>
                      <AlertDialogDescription
                        style={{ color: 'var(--phosphor-dim)' }}
                      >
                        This wipes every file you have created and restores the
                        default NEXUS virtual filesystem. Cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => resetFs()}
                        style={{
                          background: 'var(--cyber-magenta)',
                          color: '#fff',
                        }}
                      >
                        Reset
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Row>
              <Row
                label="Clear chat history"
                hint={chatCleared ? 'cleared.' : 'wipes saved NEXUS AI transcripts'}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClearChat}
                  className="gap-1 text-[10px] uppercase tracking-widest"
                >
                  <MessageSquare className="h-3 w-3" /> Clear
                </Button>
              </Row>
              <Row label="Sound engine" hint={sound ? 'synth armed' : 'muted'}>
                <Volume2
                  className="h-4 w-4"
                  style={{ color: sound ? 'var(--phosphor)' : 'var(--phosphor-dim)' }}
                />
              </Row>
            </Panel>
          </div>
        </TabsContent>

        {/* ABOUT */}
        <TabsContent value="about" className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title="NEXUS OS">
              <pre
                className="overflow-x-auto text-[9px] leading-tight"
                style={{
                  color: 'var(--phosphor-bright)',
                  textShadow: '0 0 6px var(--phosphor-glow)',
                  fontFamily: 'var(--font-display), ui-monospace, monospace',
                }}
              >
                {ASCII_LOGO}
              </pre>
              <div className="space-y-1 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--phosphor-dim)' }}>version</span>
                  <span style={{ color: 'var(--phosphor-bright)' }}>v3.1.0-rebuild</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--phosphor-dim)' }}>build</span>
                  <span style={{ color: 'var(--phosphor)' }}>wave-3E · 2026.07</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--phosphor-dim)' }}>kernel</span>
                  <span style={{ color: 'var(--phosphor)' }}>nexus-shell/x86_64</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--phosphor-dim)' }}>render</span>
                  <span style={{ color: 'var(--phosphor)' }}>phosphor-crt</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--phosphor-dim)' }}>llm</span>
                  <span style={{ color: 'var(--phosphor)' }}>zai · 11 providers</span>
                </div>
              </div>
            </Panel>

            <Panel title="Quick Launch">
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_APPS.map((qa) => (
                  <Button
                    key={qa.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openApp(qa.id)}
                    className="justify-start gap-2 text-[10px] uppercase tracking-widest"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--phosphor-bright)',
                      background: 'var(--card)',
                    }}
                  >
                    {qa.icon}
                    {qa.label}
                  </Button>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* POWER */}
        <TabsContent value="power" className="min-h-0 flex-1 overflow-y-auto">
          <Panel title="Power Management">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={osLock}
                className="flex flex-col items-center gap-2 border p-4 transition hover:bg-[var(--card)]"
                style={{ borderColor: 'var(--border)', color: 'var(--phosphor-bright)' }}
              >
                <Lock className="h-6 w-6" />
                <span className="text-[10px] uppercase tracking-widest">Lock</span>
                <span className="text-[9px] opacity-70" style={{ color: 'var(--phosphor-dim)' }}>
                  return to lock screen
                </span>
              </button>
              <button
                type="button"
                onClick={osReboot}
                className="flex flex-col items-center gap-2 border p-4 transition hover:bg-[var(--card)]"
                style={{ borderColor: 'var(--border)', color: 'var(--phosphor-bright)' }}
              >
                <RotateCw className="h-6 w-6" />
                <span className="text-[10px] uppercase tracking-widest">Restart</span>
                <span className="text-[9px] opacity-70" style={{ color: 'var(--phosphor-dim)' }}>
                  warm reboot to boot phase
                </span>
              </button>
              <button
                type="button"
                onClick={osShutdown}
                className="flex flex-col items-center gap-2 border p-4 transition hover:bg-[var(--card)]"
                style={{
                  borderColor: 'var(--cyber-magenta)',
                  color: 'var(--cyber-magenta)',
                }}
              >
                <PowerOff className="h-6 w-6" />
                <span className="text-[10px] uppercase tracking-widest">Shutdown</span>
                <span className="text-[9px] opacity-70" style={{ color: 'var(--phosphor-dim)' }}>
                  power cycle the OS
                </span>
              </button>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  )
}

registerApp({
  id: 'settings',
  name: 'Settings',
  icon: <SettingsIcon className="h-5 w-5" />,
  component: SettingsApp,
  defaultSize: { x: 160, y: 80, w: 640, h: 520 },
  minSize: { x: 0, y: 0, w: 380, h: 320 },
  singleton: true,
  pinned: true,
  category: 'system',
  title: 'Settings',
})

export { SettingsApp }
