import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter,
  useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Check, ChevronDown, GripVertical, ImagePlus, Languages, MoreHorizontal, Plus,
  RotateCcw, Settings as SettingsIcon, Trash2, X
} from 'lucide-react'
import { BACKGROUNDS, DEFAULT_SETTINGS, hexToRgb } from './defaults'
import { GlassRenderer } from './GlassRenderer'
import { getCopy, type Copy } from './i18n'
import { loadAppData, putSettings, putTasks, removeTask, resizeImage } from './storage'
import { QUADRANTS, type BackgroundMode, type QuadrantId, type Settings, type Task } from './types'

type Removed = { task: Task; label: string }

function createTask(title: string, quadrant: QuadrantId, order: number): Task {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: title.trim(), quadrant, order, createdAt: now, updatedAt: now }
}

function normalizeOrders(tasks: Task[]): Task[] {
  return QUADRANTS.flatMap((quadrant) => tasks
    .filter((task) => task.quadrant === quadrant)
    .sort((a, b) => a.order - b.order)
    .map((task, order) => ({ ...task, order })))
}

function readableInk(hex: string) {
  const channels = hexToRgb(hex).split(',').map((value) => Number(value.trim()) / 255)
  const luminance = channels
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#15181d' : '#f7f8fb'
}

function TaskCard({ task, copy, onComplete, onDelete, onEdit, onMove, overlay = false }: {
  task: Task; copy: Copy; onComplete: () => void; onDelete: () => void
  onEdit: (title: string) => void; onMove: (quadrant: QuadrantId) => void; overlay?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const sortable = useSortable({ id: task.id, disabled: overlay })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    const trimmed = title.trim().slice(0, 160)
    if (trimmed) onEdit(trimmed)
    else setTitle(task.title)
    setEditing(false)
  }

  return (
    <article ref={sortable.setNodeRef} style={style} className={`task-card${sortable.isDragging ? ' dragging' : ''}${overlay ? ' overlay' : ''}`}>
      <button className="check-button" onClick={onComplete} aria-label={`${copy.done}: ${task.title}`}><Check size={15} /></button>
      <button className="drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label={`${copy.move}: ${task.title}`}><GripVertical size={15} /></button>
      {editing ? (
        <input ref={inputRef} className="edit-input" value={title} maxLength={160}
          onChange={(event) => setTitle(event.target.value)} onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { setTitle(task.title); setEditing(false) } }} />
      ) : <button className="task-title" onDoubleClick={() => setEditing(true)} onClick={() => setEditing(true)}>{task.title}</button>}
      <div className="task-menu-wrap">
        <button className="icon-button quiet small" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={`${copy.taskOptions}: ${task.title}`}>
          <MoreHorizontal size={17} />
        </button>
        {menuOpen && (
          <div className="task-menu glass-popover">
            <button onClick={() => { setEditing(true); setMenuOpen(false) }}>{copy.edit}</button>
            <div className="menu-label">{copy.move}</div>
            {QUADRANTS.filter((id) => id !== task.quadrant).map((id) => (
              <button key={id} onClick={() => { onMove(id); setMenuOpen(false) }}><span className={`dot ${id}`} />{copy.quadrants[id][0]}</button>
            ))}
            <button className="danger" onClick={() => { onDelete(); setMenuOpen(false) }}><Trash2 size={14} />{copy.delete}</button>
          </div>
        )}
      </div>
    </article>
  )
}

function InlineAdd({ copy, onAdd }: { copy: Copy; onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  const submit = () => {
    const value = title.trim().slice(0, 160)
    if (!value) return
    onAdd(value); setTitle(''); setOpen(false)
  }
  if (!open) return <button className="inline-add" onClick={() => setOpen(true)}><Plus size={16} />{copy.addTask}</button>
  return (
    <div className="inline-form">
      <input ref={inputRef} maxLength={160} placeholder={copy.taskTitle} value={title} onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') setOpen(false) }} />
      <button className="icon-button solid" onClick={submit} disabled={!title.trim()} aria-label={copy.add}><Check size={17} /></button>
      <button className="icon-button quiet" onClick={() => setOpen(false)} aria-label={copy.cancel}><X size={17} /></button>
    </div>
  )
}

function Quadrant({ id, tasks, copy, handlers }: {
  id: QuadrantId; tasks: Task[]; copy: Copy
  handlers: { add: (title: string, quadrant: QuadrantId) => void; complete: (task: Task) => void; delete: (task: Task) => void; edit: (task: Task, title: string) => void; move: (task: Task, id: QuadrantId) => void }
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `quadrant:${id}` })
  const [title, subtitle] = copy.quadrants[id]
  return (
    <section ref={setNodeRef} className={`quadrant quadrant-${id}${isOver ? ' drop-target' : ''}`} aria-labelledby={`heading-${id}`}>
      <header className="quadrant-header">
        <div><h2 id={`heading-${id}`}>{title}</h2><p>{subtitle}</p></div>
        <span className="count">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="task-list">
          {tasks.map((task) => <TaskCard key={task.id} task={task} copy={copy}
            onComplete={() => handlers.complete(task)} onDelete={() => handlers.delete(task)}
            onEdit={(title) => handlers.edit(task, title)} onMove={(id) => handlers.move(task, id)} />)}
          {!tasks.length && <p className="empty-state">{copy.noTasks}</p>}
        </div>
      </SortableContext>
      <InlineAdd copy={copy} onAdd={(title) => handlers.add(title, id)} />
    </section>
  )
}

function AddDialog({ copy, initial, onClose, onAdd }: { copy: Copy; initial: QuadrantId; onClose: () => void; onAdd: (title: string, quadrant: QuadrantId) => void }) {
  const [title, setTitle] = useState('')
  const [quadrant, setQuadrant] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
  }, [])
  const submit = () => { const value = title.trim().slice(0, 160); if (value) { onAdd(value, quadrant); onClose() } }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="add-heading">
        <div className="dialog-head"><h2 id="add-heading">{copy.newTask}</h2><button className="icon-button quiet" onClick={onClose} aria-label={copy.close}><X size={19} /></button></div>
        <input ref={inputRef} className="large-input" maxLength={160} placeholder={copy.taskTitle} value={title}
          onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') onClose() }} />
        <label>{copy.chooseQuadrant}</label>
        <div className="quadrant-picker">
          {QUADRANTS.map((id) => <button key={id} className={quadrant === id ? 'selected' : ''} onClick={() => setQuadrant(id)}><span className={`dot ${id}`} />{copy.quadrants[id][0]}</button>)}
        </div>
        <div className="dialog-actions"><button className="button quiet-button" onClick={onClose}>{copy.cancel}</button><button className="button primary" disabled={!title.trim()} onClick={submit}>{copy.add}</button></div>
      </section>
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <div className="segmented">{options.map(([id, label]) => <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>
}

function SettingsPanel({ settings, copy, onChange, onClose }: { settings: Settings; copy: Copy; onChange: (next: Settings) => void; onClose: () => void }) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value })
  const updatePalette = (key: 'backgroundColorA' | 'backgroundColorB' | 'backgroundColorC', value: string) => onChange({ ...settings, backgroundPreset: 'palette', [key]: value })
  const updateBackgroundMode = (backgroundMode: BackgroundMode) => onChange({ ...settings, backgroundMode, backgroundPreset: 'palette' })
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = async (file?: File) => {
    if (!file) return
    try { onChange({ ...settings, customBackground: await resizeImage(file), backgroundPreset: 'custom' }) }
    catch { window.alert(copy.uploadError) }
  }
  return (
    <div className="settings-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="settings-panel glass-panel" aria-labelledby="settings-heading">
        <div className="settings-head"><div><span>{copy.appearance}</span><h2 id="settings-heading">{copy.settings}</h2></div><button className="icon-button quiet" onClick={onClose} aria-label={copy.close}><X /></button></div>
        <div className="settings-scroll">
          <section className="settings-section"><h3>{copy.general}</h3>
            <label className="field"><span>{copy.appName}</span><input maxLength={32} value={settings.appName} disabled={!settings.showAppName} onChange={(event) => update('appName', event.target.value)} /></label>
            <label className="toggle-row"><span>{copy.showName}</span><input type="checkbox" checked={settings.showAppName} onChange={(event) => update('showAppName', event.target.checked)} /><i /></label>
            <div className="field"><span>{copy.language}</span><Segmented value={settings.language} options={[["de", 'Deutsch'], ["en", 'English']]} onChange={(value) => update('language', value)} /></div>
            <div className="field"><span>{copy.theme}</span><Segmented value={settings.theme} options={[["system", copy.system], ["light", copy.light], ["dark", copy.dark]]} onChange={(value) => update('theme', value)} /></div>
            <div className="field"><span>{copy.mobileLayout}</span><Segmented value={settings.mobileLayout} options={[["stack", copy.stack], ["focus", copy.focus], ["grid", copy.grid]]} onChange={(value) => update('mobileLayout', value)} /></div>
          </section>
          <section className="settings-section"><h3>{copy.background}</h3>
            <div className="background-grid">
              {(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map((id) => <button key={id} aria-label={id} className={settings.backgroundPreset === id ? 'selected' : ''} style={{ background: BACKGROUNDS[id] }} onClick={() => update('backgroundPreset', id)} />)}
              <button className={`upload-background${settings.backgroundPreset === 'custom' ? ' selected' : ''}`} style={settings.customBackground ? { backgroundImage: `url(${settings.customBackground})` } : undefined} onClick={() => settings.customBackground && settings.backgroundPreset !== 'custom' ? update('backgroundPreset', 'custom') : fileRef.current?.click()}><ImagePlus size={20} /><span>{copy.ownImage}</span></button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => upload(event.target.files?.[0])} />
            </div>
            <div className={`palette-editor${settings.backgroundPreset === 'palette' ? ' selected' : ''}`}>
              <Segmented value={settings.backgroundMode} options={[["gradient", copy.gradient], ["solid", copy.solid]]} onChange={updateBackgroundMode} />
              <button className="palette-preview" style={{ background: settings.backgroundMode === 'solid' ? settings.backgroundSolidColor : `radial-gradient(circle at 18% 12%, ${settings.backgroundColorB}, transparent 45%), radial-gradient(circle at 82% 82%, ${settings.backgroundColorC}, transparent 48%), ${settings.backgroundColorA}` }} onClick={() => update('backgroundPreset', 'palette')}>
                <span>{settings.backgroundMode === 'solid' ? copy.backgroundColor : copy.customColors}</span>
              </button>
              {settings.backgroundMode === 'solid' ? <label className="solid-color-field"><span>{copy.backgroundColor}</span><input aria-label={copy.backgroundColor} type="color" value={settings.backgroundSolidColor} onChange={(event) => onChange({ ...settings, backgroundPreset: 'palette', backgroundSolidColor: event.target.value })} /></label> : <div className="palette-colors">
                <label><span>{copy.colorOne}</span><input aria-label={copy.colorOne} type="color" value={settings.backgroundColorA} onChange={(event) => updatePalette('backgroundColorA', event.target.value)} /></label>
                <label><span>{copy.colorTwo}</span><input aria-label={copy.colorTwo} type="color" value={settings.backgroundColorB} onChange={(event) => updatePalette('backgroundColorB', event.target.value)} /></label>
                <label><span>{copy.colorThree}</span><input aria-label={copy.colorThree} type="color" value={settings.backgroundColorC} onChange={(event) => updatePalette('backgroundColorC', event.target.value)} /></label>
              </div>}
            </div>
          </section>
          <section className="settings-section"><h3>{copy.glass}</h3>
            <label className="range-field"><span>{copy.transparency}<b>{100 - settings.glassOpacity}%</b></span><input aria-label={copy.transparency} type="range" min="10" max="90" value={100 - settings.glassOpacity} onChange={(event) => update('glassOpacity', 100 - Number(event.target.value))} /></label>
            <label className="range-field"><span>{copy.blur}<b>{settings.glassBlur}px</b></span><input type="range" min="6" max="42" value={settings.glassBlur} onChange={(event) => update('glassBlur', Number(event.target.value))} /></label>
            <label className="range-field"><span>{copy.reflection}<b>{settings.glassReflection}%</b></span><input aria-label={copy.reflection} type="range" min="0" max="100" value={settings.glassReflection} onChange={(event) => update('glassReflection', Number(event.target.value))} /></label>
            <label className="color-field"><span>{copy.tint}</span><input type="color" value={settings.glassTint} onChange={(event) => update('glassTint', event.target.value)} /></label>
            <div className="color-field"><span>{copy.textColor}</span><div className="color-actions"><button className={!settings.textColor ? 'active' : ''} onClick={() => update('textColor', null)}>{copy.automatic}</button><input aria-label={copy.textColor} type="color" value={settings.textColor ?? (settings.theme === 'dark' ? '#f5f4f1' : '#171918')} onChange={(event) => update('textColor', event.target.value)} /></div></div>
          </section>
          <button className="reset-button" onClick={() => { if (window.confirm(copy.resetConfirm)) onChange({ ...DEFAULT_SETTINGS, language: settings.language }) }}><RotateCcw size={16} />{copy.reset}</button>
        </div>
      </aside>
    </div>
  )
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [opticalGlass, setOpticalGlass] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [focusQuadrant, setFocusQuadrant] = useState<QuadrantId>('do')
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [removed, setRemoved] = useState<Removed | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)
  const copy = getCopy(settings.language)

  useEffect(() => { loadAppData().then((data) => { setTasks(normalizeOrders(data.tasks)); setSettings(data.settings); setReady(true) }) }, [])
  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => { void putSettings(settings) }, 140)
    return () => window.clearTimeout(timer)
  }, [settings, ready])
  useEffect(() => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.dataset.theme = settings.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : settings.theme
    apply(); systemDark.addEventListener('change', apply); return () => systemDark.removeEventListener('change', apply)
  }, [settings.theme])
  useEffect(() => { document.documentElement.lang = settings.language; document.title = settings.showAppName && settings.appName.trim() ? settings.appName.trim() : 'Spectre' }, [settings])
  useEffect(() => {
    if (!ready) return
    const name = settings.showAppName && settings.appName.trim() ? settings.appName.trim() : 'Spectre'
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return
    const manifest = {
      name, short_name: name.slice(0, 12), start_url: './', display: 'standalone', orientation: 'any',
      theme_color: settings.theme === 'dark' ? '#151923' : '#f0eee9', background_color: '#d6d8d2',
      icons: [
        { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))
    link.href = url
    return () => URL.revokeObjectURL(url)
  }, [settings, ready])

  useEffect(() => {
    if (!settingsOpen && !addOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [settingsOpen, addOpen])

  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const sorted = useMemo(() => normalizeOrders(tasks), [tasks])
  const paletteBackground = `radial-gradient(circle at 15% 8%, ${settings.backgroundColorB} 0, transparent 43%), radial-gradient(circle at 88% 86%, ${settings.backgroundColorC} 0, transparent 48%), linear-gradient(145deg, ${settings.backgroundColorA}, ${settings.backgroundColorA})`
  const background = settings.backgroundPreset === 'custom' && settings.customBackground
    ? `url(${settings.customBackground}) center / cover`
    : settings.backgroundPreset === 'palette' ? (settings.backgroundMode === 'solid' ? settings.backgroundSolidColor : paletteBackground) : BACKGROUNDS[settings.backgroundPreset as keyof typeof BACKGROUNDS] || BACKGROUNDS.aurora
  const presetBaseColors = { aurora: '#d9d9d2', linen: '#d8c9c1', dusk: '#777a91', bloom: '#d7e1d4', midnight: '#151923' }
  const backgroundBaseColor = settings.backgroundPreset === 'palette'
    ? (settings.backgroundMode === 'solid' ? settings.backgroundSolidColor : settings.backgroundColorA)
    : presetBaseColors[settings.backgroundPreset as keyof typeof presetBaseColors]
  const pageInk = settings.backgroundPreset === 'custom' ? '#f7f8fb' : readableInk(backgroundBaseColor || '#d9d9d2')
  const surfaceInk = readableInk(settings.glassTint)
  const transparency = (100 - settings.glassOpacity) / 100
  const reflection = settings.glassReflection / 100
  const style = {
    '--app-background': background, '--glass-rgb': hexToRgb(settings.glassTint),
    '--glass-opacity': settings.glassOpacity / 100, '--glass-blur': `${settings.glassBlur}px`,
    '--glass-transparency': transparency, '--glass-refraction': reflection,
    '--glass-edge-opacity': 0.36 + reflection * 0.38, '--glass-glow-opacity': 0.006 + reflection * 0.028,
    '--glass-saturation': `${100 + reflection * 20}%`, '--glass-shadow-size': `${16 + reflection * 18}px`,
    '--auto-page-ink': pageInk, '--auto-surface-ink': surfaceInk,
    ...(settings.textColor ? { '--user-ink': settings.textColor } : {})
  } as React.CSSProperties

  const persist = (next: Task[]) => { const normalized = normalizeOrders(next); setTasks(normalized); void putTasks(normalized) }
  const add = (title: string, quadrant: QuadrantId) => persist([...tasks, createTask(title, quadrant, tasks.filter((task) => task.quadrant === quadrant).length)])
  const edit = (task: Task, title: string) => persist(tasks.map((item) => item.id === task.id ? { ...item, title, updatedAt: Date.now() } : item))
  const move = (task: Task, quadrant: QuadrantId) => persist(tasks.map((item) => item.id === task.id ? { ...item, quadrant, order: tasks.filter((other) => other.quadrant === quadrant).length, updatedAt: Date.now() } : item))
  const discard = (task: Task) => {
    window.clearTimeout(undoTimer.current); setTasks(tasks.filter((item) => item.id !== task.id)); void removeTask(task.id)
    setRemoved({ task, label: copy.undone }); undoTimer.current = window.setTimeout(() => setRemoved(null), 5000)
  }
  const undo = () => { if (!removed) return; window.clearTimeout(undoTimer.current); persist([...tasks, removed.task]); setRemoved(null) }
  const onDragStart = ({ active }: DragStartEvent) => setActiveTask(tasks.find((task) => task.id === active.id) ?? null)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTask(null); if (!over || active.id === over.id) return
    const moving = tasks.find((task) => task.id === active.id); if (!moving) return
    const overTask = tasks.find((task) => task.id === over.id)
    const targetQuadrant = overTask?.quadrant ?? (String(over.id).startsWith('quadrant:') ? String(over.id).split(':')[1] as QuadrantId : moving.quadrant)
    const without = tasks.filter((task) => task.id !== moving.id)
    const target = without.filter((task) => task.quadrant === targetQuadrant).sort((a, b) => a.order - b.order)
    const index = overTask ? Math.max(0, target.findIndex((task) => task.id === overTask.id)) : target.length
    target.splice(index, 0, { ...moving, quadrant: targetQuadrant, updatedAt: Date.now() })
    persist([...without.filter((task) => task.quadrant !== targetQuadrant), ...target])
  }
  const handlers = { add, complete: discard, delete: discard, edit, move }

  if (!ready) return <main className="loading" style={style}><div className="loading-mark" /></main>
  return (
    <main className={`app mobile-${settings.mobileLayout}${opticalGlass ? ' optical-glass' : ''}`} style={style}>
      <div className="background" />
      <GlassRenderer settings={settings} onReady={setOpticalGlass} />
      <header className="app-header">
        <div className="brand">{settings.showAppName && <h1>{settings.appName || 'Spectre'}</h1>}<p>{copy.taskCount(tasks.length)}</p></div>
        <div className="header-actions">
          <button className="header-button" onClick={() => setSettings({ ...settings, language: settings.language === 'de' ? 'en' : 'de' })} aria-label={copy.language}><Languages size={18} /><span>{settings.language.toUpperCase()}</span></button>
          <button className="header-button" aria-label={copy.settings} onClick={() => setSettingsOpen(true)}><SettingsIcon size={18} /><span>{copy.settings}</span></button>
          <button className="header-button primary-header" onClick={() => setAddOpen(true)}><Plus size={18} /><span>{copy.addTask}</span></button>
        </div>
      </header>

      <div className="focus-tabs" aria-label={copy.mobileLayout}>
        {QUADRANTS.map((id) => <button key={id} className={focusQuadrant === id ? 'active' : ''} onClick={() => setFocusQuadrant(id)}><span className={`dot ${id}`} />{copy.quadrants[id][0]}</button>)}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTask(null)}>
        <div className="matrix">
          {QUADRANTS.map((id) => <div key={id} className={`quadrant-slot${settings.mobileLayout === 'focus' && focusQuadrant !== id ? ' not-focused' : ''}`}>
            <Quadrant id={id} tasks={sorted.filter((task) => task.quadrant === id)} copy={copy} handlers={handlers} />
          </div>)}
        </div>
        <DragOverlay>{activeTask ? <TaskCard task={activeTask} copy={copy} overlay onComplete={() => {}} onDelete={() => {}} onEdit={() => {}} onMove={() => {}} /> : null}</DragOverlay>
      </DndContext>

      <button className="mobile-fab" onClick={() => setAddOpen(true)} aria-label={copy.addTask}><Plus size={23} /></button>
      {addOpen && <AddDialog copy={copy} initial={focusQuadrant} onClose={() => setAddOpen(false)} onAdd={add} />}
      {settingsOpen && <SettingsPanel settings={settings} copy={copy} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
      {removed && <div className="toast" role="status"><span>{removed.label}</span><button onClick={undo}>{copy.undo}</button><button className="icon-button quiet small" onClick={() => setRemoved(null)} aria-label={copy.close}><X size={15} /></button></div>}
    </main>
  )
}
