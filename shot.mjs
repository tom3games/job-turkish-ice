// 開発用の撮影。node shot.mjs [w] [h]
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
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
await p.evaluate(() => { TI.dbg.start(3); TI.dbg.pause(true); TI.dbg.step(150) }); await snap('arrive')
await p.evaluate(() => { TI.dbg.move('U'); TI.dbg.step(10); TI.dbg.reachNow(); TI.dbg.step(12) }); await snap('wind-up')
await p.evaluate(() => { TI.dbg.toLunge(); TI.dbg.step(10) }); await snap('lunge-up')
await p.evaluate(() => { TI.dbg.move('L'); TI.dbg.step(8) }); await snap('dodge-left')
await p.evaluate(() => { TI.dbg.resolve(); TI.dbg.step(6) }); await snap('whiff')
for (const [i, n] of [[3, 'yankee'], [6, 'senju'], [11, 'pres']]) {
  await p.evaluate(i => { TI.S.tut = -1; TI.dbg.skipTo(i); let n = 0; while (TI.CUR.st !== 'ready' && n++ < 300) TI.dbg.tick(1); TI.dbg.move('R'); TI.dbg.step(10); TI.dbg.reachNow(); TI.dbg.step(10) }, i); await snap(n + '-wind')
  await p.evaluate(() => { TI.dbg.toLunge(); TI.CUR && TI.dbg.step(Math.round(TI.CUR.pdur * 60 * 0.7)) }); await snap(n + '-lunge')
}
console.log(JSON.stringify(await p.evaluate(() => TI.state())), errs)
await b.close(); server.kill()
