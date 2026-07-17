export const QUADRANTS = ['do', 'schedule', 'delegate', 'eliminate'] as const
export type QuadrantId = (typeof QUADRANTS)[number]

export type Task = {
  id: string
  title: string
  quadrant: QuadrantId
  order: number
  createdAt: number
  updatedAt: number
}

export type Language = 'de' | 'en'
export type Theme = 'system' | 'light' | 'dark'
export type MobileLayout = 'stack' | 'focus' | 'grid'
export type BackgroundPreset = 'aurora' | 'linen' | 'dusk' | 'bloom' | 'midnight' | 'custom'

export type Settings = {
  language: Language
  theme: Theme
  appName: string
  showAppName: boolean
  mobileLayout: MobileLayout
  backgroundPreset: BackgroundPreset
  customBackground?: string
  glassOpacity: number
  glassBlur: number
  glassTint: string
  textColor: string | null
}
