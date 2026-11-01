// 開発用の撮影。node shot.mjs [w] [h]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, PORT = 5502
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844), tag = `${W}x${H}`
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', hasTouch: W < 1000, isMobile: W < 1000 }); await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 15000 })
await p.evaluate(() => document.fonts.ready)
const snap = async n => { await p.evaluate(() => TI.dbg.render()); await p.screenshot({ path: `${ROOT}/shots/dev-${tag}-${n}.png` }) }
await snap('title')
await p.evaluate(() => { TI.dbg.start(3); TI.dbg.pause(true); TI.dbg.step(150) })
await snap('arrive')
await p.evaluate(() => { TI.dbg.offer(); TI.dbg.step(20) }); await snap('offer')
await p.evaluate(() => { TI.dbg.reachNow(); TI.dbg.step(8) }); await snap('wind')
await p.evaluate(() => { TI.dbg.step(14) }); await snap('lunge')
for (const [i, n] of [[1, 'kid'], [3, 'yankee'], [6, 'senju'], [11, 'pres']]) {
  await p.evaluate(i => { TI.dbg.skipTo(i); TI.dbg.step(140); TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(30) }, i)
  await snap(n)
}
console.log(JSON.stringify(await p.evaluate(() => TI.state())), errs)
await b.close(); server.kill()
