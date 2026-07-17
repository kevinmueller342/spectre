import type { Language, QuadrantId } from './types'

const messages = {
  de: {
    settings: 'Einstellungen', close: 'Schließen', addTask: 'Aufgabe hinzufügen', newTask: 'Neue Aufgabe',
    taskTitle: 'Was möchtest du erledigen?', chooseQuadrant: 'Quadrant auswählen', add: 'Hinzufügen', cancel: 'Abbrechen',
    edit: 'Bearbeiten', delete: 'Löschen', move: 'Verschieben', done: 'Erledigt', save: 'Speichern', taskOptions: 'Aufgabenoptionen',
    undone: 'Aufgabe entfernt', undo: 'Rückgängig', noTasks: 'Alles klar.', taskCount: (n: number) => `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}`,
    appearance: 'Erscheinungsbild', general: 'Allgemein', appName: 'App-Name', showName: 'Namen anzeigen', language: 'Sprache',
    theme: 'Farbschema', system: 'System', light: 'Hell', dark: 'Dunkel', mobileLayout: 'Handy-Layout',
    stack: 'Untereinander', focus: 'Fokus', grid: '2 × 2', background: 'Hintergrund', ownImage: 'Eigenes Bild', customColors: 'Eigene Farben',
    colorOne: 'Grundfarbe', colorTwo: 'Lichtfarbe', colorThree: 'Akzentfarbe',
    glass: 'Glas & Schrift', transparency: 'Transparenz', blur: 'Unschärfe', reflection: 'Glasreflexionen', tint: 'Glastönung', textColor: 'Schriftfarbe', automatic: 'Auto', reset: 'Standard wiederherstellen',
    resetConfirm: 'Alle Design-Einstellungen zurücksetzen?', titleLimit: 'Maximal 160 Zeichen', uploadError: 'Das Bild konnte nicht verarbeitet werden.',
    quadrants: {
      do: ['Jetzt erledigen', 'Wichtig · Dringend'], schedule: ['Einplanen', 'Wichtig · Nicht dringend'],
      delegate: ['Delegieren', 'Nicht wichtig · Dringend'], eliminate: ['Loslassen', 'Nicht wichtig · Nicht dringend']
    } satisfies Record<QuadrantId, [string, string]>
  },
  en: {
    settings: 'Settings', close: 'Close', addTask: 'Add task', newTask: 'New task',
    taskTitle: 'What needs to get done?', chooseQuadrant: 'Choose quadrant', add: 'Add', cancel: 'Cancel',
    edit: 'Edit', delete: 'Delete', move: 'Move', done: 'Done', save: 'Save', taskOptions: 'Task options',
    undone: 'Task removed', undo: 'Undo', noTasks: 'All clear.', taskCount: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`,
    appearance: 'Appearance', general: 'General', appName: 'App name', showName: 'Show name', language: 'Language',
    theme: 'Color scheme', system: 'System', light: 'Light', dark: 'Dark', mobileLayout: 'Phone layout',
    stack: 'Stacked', focus: 'Focus', grid: '2 × 2', background: 'Background', ownImage: 'Own image', customColors: 'Custom colors',
    colorOne: 'Base color', colorTwo: 'Light color', colorThree: 'Accent color',
    glass: 'Glass & type', transparency: 'Transparency', blur: 'Blur', reflection: 'Glass reflections', tint: 'Glass tint', textColor: 'Text color', automatic: 'Auto', reset: 'Restore defaults',
    resetConfirm: 'Reset all appearance settings?', titleLimit: 'Maximum 160 characters', uploadError: 'The image could not be processed.',
    quadrants: {
      do: ['Do now', 'Important · Urgent'], schedule: ['Schedule', 'Important · Not urgent'],
      delegate: ['Delegate', 'Not important · Urgent'], eliminate: ['Let go', 'Not important · Not urgent']
    } satisfies Record<QuadrantId, [string, string]>
  }
}

export type Copy = (typeof messages)['de']
export const getCopy = (language: Language): Copy => messages[language] as Copy
