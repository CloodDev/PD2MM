import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { name: 'test-app' } }))

import { createModuleRunner } from '../ModuleRunner.js'

describe('ModuleRunner', () => {
  it('calls enable on module and returns this', () => {
    const runner = createModuleRunner()
    const module = { enable: vi.fn() }
    const ret = runner.init(module as any)
    expect(module.enable).toHaveBeenCalled()
    expect(ret).toBe(runner)
  })

  it('waits for promise returned by enable', async () => {
    const runner = createModuleRunner()
    let side = false
    const module = { enable: () => Promise.resolve().then(() => { side = true }) }
    runner.init(module as any)
    await runner
    expect(side).toBe(true)
  })
})
