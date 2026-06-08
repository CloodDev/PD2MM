import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { detectExtractedMod } from '../modDetection.js'
import * as fs from 'node:fs'

afterEach(() => {
  vi.clearAllMocks()
})

describe('detectExtractedMod', () => {
  it('detects map by main.xml containing <level', () => {
    ;(fs.existsSync as any).mockImplementation((path: string) => path.endsWith('/main.xml'))
    ;(fs.readFileSync as any).mockReturnValue('<level name="test" />')

    const r = detectExtractedMod('/some/path', 'whatever')
    expect(r).toEqual({ kind: 'map', destination: 'maps' })
  })

  it('detects weapon by main.xml containing <Weapon', () => {
    ;(fs.existsSync as any).mockImplementation((path: string) => path.endsWith('/main.xml'))
    ;(fs.readFileSync as any).mockReturnValue('<Weapon something/>')

    const r = detectExtractedMod('/p', 'n')
    expect(r).toEqual({ kind: 'weapon', destination: 'mod_overrides', moveContents: false })
  })

  it('detects blt by mod.txt', () => {
    ;(fs.existsSync as any).mockImplementation((path: string) => path.endsWith('/mod.txt'))
    const r = detectExtractedMod('/p', 'n')
    expect(r).toEqual({ kind: 'blt', destination: 'mods' })
  })

  it('detects override-folder by name', () => {
    ;(fs.existsSync as any).mockImplementation(() => false)
    const r = detectExtractedMod('/p', 'mod_overrides')
    expect(r).toEqual({ kind: 'override-folder', destination: 'mod_overrides', moveContents: true })
  })

  it('falls back to override', () => {
    ;(fs.existsSync as any).mockImplementation(() => false)
    const r = detectExtractedMod('/p', 'random')
    expect(r).toEqual({ kind: 'override', destination: 'mod_overrides', moveContents: false })
  })
})
