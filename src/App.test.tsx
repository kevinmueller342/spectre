import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Spectre', () => {
  it('renders the four localized quadrants', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Jetzt erledigen' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Einplanen' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Delegieren' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Loslassen' })).toBeVisible()
  })

  it('adds a task directly inside a quadrant', async () => {
    const user = userEvent.setup()
    render(<App />)
    const quadrant = (await screen.findByRole('heading', { name: 'Jetzt erledigen' })).closest('section')!
    await user.click(within(quadrant).getByRole('button', { name: 'Aufgabe hinzufügen' }))
    const input = within(quadrant).getByPlaceholderText('Was möchtest du erledigen?')
    await user.type(input, 'Konzept fertigstellen{Enter}')
    expect(within(quadrant).getByText('Konzept fertigstellen')).toBeVisible()
    expect(screen.getByText('1 Aufgabe')).toBeVisible()
  })

  it('adds globally and switches the interface to English', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Jetzt erledigen' })
    await user.click(screen.getAllByRole('button', { name: 'Aufgabe hinzufügen' })[0])
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Was möchtest du erledigen?'), 'Call Alex')
    await user.click(within(dialog).getByRole('button', { name: 'Delegieren' }))
    await user.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }))
    expect(screen.getByText('Call Alex')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading', { name: 'Do now' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Delegate' })).toBeVisible()
  })

  it('removes a completed task and restores it with undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    const quadrant = (await screen.findByRole('heading', { name: 'Jetzt erledigen' })).closest('section')!
    await user.click(within(quadrant).getByRole('button', { name: 'Aufgabe hinzufügen' }))
    await user.type(within(quadrant).getByPlaceholderText('Was möchtest du erledigen?'), 'Wichtige Aufgabe{Enter}')
    await user.click(within(quadrant).getByRole('button', { name: 'Erledigt: Wichtige Aufgabe' }))
    expect(screen.queryByText('Wichtige Aufgabe')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }))
    expect(screen.getByText('Wichtige Aufgabe')).toBeVisible()
  })

  it('applies a custom text color from appearance settings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Jetzt erledigen' })
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    fireEvent.change(screen.getByLabelText('Schriftfarbe'), { target: { value: '#174a6b' } })
    expect(screen.getByRole('main')).toHaveStyle({ '--user-ink': '#174a6b' })
  })

  it('supports 90 percent transparency and independent glass reflections', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Jetzt erledigen' })
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    fireEvent.change(screen.getByLabelText('Transparenz'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Glasreflexionen'), { target: { value: '25' } })
    const main = screen.getByRole('main')
    expect(main.style.getPropertyValue('--glass-opacity')).toBe('0.1')
    expect(main.style.getPropertyValue('--glass-refraction')).toBe('0.25')
  })

  it('builds a background from three custom colors', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Jetzt erledigen' })
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    fireEvent.change(screen.getByLabelText('Grundfarbe'), { target: { value: '#112233' } })
    fireEvent.change(screen.getByLabelText('Lichtfarbe'), { target: { value: '#44aacc' } })
    fireEvent.change(screen.getByLabelText('Akzentfarbe'), { target: { value: '#bb3366' } })
    const background = screen.getByRole('main').style.getPropertyValue('--app-background')
    expect(background).toContain('#112233')
    expect(background).toContain('#44aacc')
    expect(background).toContain('#bb3366')
  })
})
