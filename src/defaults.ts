import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  language: 'de',
  theme: 'system',
  appName: 'Spectre',
  showAppName: true,
  mobileLayout: 'stack',
  backgroundPreset: 'aurora',
  backgroundMode: 'gradient',
  backgroundSolidColor: '#e8eaed',
  backgroundColorA: '#141922',
  backgroundColorB: '#083f59',
  backgroundColorC: '#6a1e4f',
  glassOpacity: 34,
  glassBlur: 22,
  glassReflection: 82,
  glassTint: '#ffffff',
  textColor: null
}

export const BACKGROUNDS = {
  aurora: 'radial-gradient(circle at 12% 16%, #e8cfc4 0, transparent 36%), radial-gradient(circle at 86% 14%, #bedbd2 0, transparent 39%), radial-gradient(circle at 60% 84%, #c8c8df 0, transparent 44%), #d9d9d2',
  linen: 'linear-gradient(145deg, #e9e4dc 0%, #c9d4ce 48%, #d8c9c1 100%)',
  dusk: 'radial-gradient(circle at 20% 20%, #b9c8dc 0, transparent 42%), radial-gradient(circle at 80% 78%, #d6b8bf 0, transparent 45%), #777a91',
  bloom: 'radial-gradient(circle at 14% 74%, #efc5bb 0, transparent 38%), radial-gradient(circle at 78% 18%, #d8c8ed 0, transparent 40%), #d7e1d4',
  midnight: 'radial-gradient(circle at 25% 18%, #3c5a67 0, transparent 42%), radial-gradient(circle at 78% 82%, #514560 0, transparent 46%), #151923'
} as const

export function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`
}
