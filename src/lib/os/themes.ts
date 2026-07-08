import type { Theme, ThemeId } from './types'

export const THEMES: Record<ThemeId, Theme> = {
  amber: {
    id: 'amber',
    name: 'Amber Phosphor',
    bg: '#0b0700',
    fg: '#ffb000',
    glow: 'rgba(255,176,0,0.55)',
    dim: '#6b4a00',
  },
  green: {
    id: 'green',
    name: 'Green Phosphor',
    bg: '#020a02',
    fg: '#33ff66',
    glow: 'rgba(51,255,102,0.5)',
    dim: '#1f6b33',
  },
  white: {
    id: 'white',
    name: 'White Monochrome',
    bg: '#050505',
    fg: '#d8d8d8',
    glow: 'rgba(216,216,216,0.35)',
    dim: '#5a5a5a',
  },
}

export const THEME_LIST: ThemeId[] = ['amber', 'green', 'white']

export function getTheme(id: ThemeId): Theme {
  return THEMES[id] ?? THEMES.amber
}
