// 開発用の撮影2（反応と結果）。node shot2.mjs [w] [h]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, PORT = 5506
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844), tag = `${W}x${H}`
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', hasTouch: W < 1000, isMobile: W < 1000 }); await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 15000 })
await p.evaluate(() => document.fonts.ready)
const snap = async n => { await p.evaluate(() => TI.dbg.render()); await p.screenshot({ path: `${ROOT}/shots/dev2-${tag}-${n}.png` }) }
await p.addScriptTag({ path: ROOT + '/bot.js' })
const tease = n => p.evaluate(n => { for (let k = 0; k < n; k++) { TI.dbg.offer(); TI.dbg.step(14); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(10) } }, n)
await p.evaluate(() => { TI.dbg.start(3); TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.skipTo(1); TI.dbg.step(130) })
await tease(1); await snap('kid1')
await tease(1); await p.evaluate(() => TI.dbg.step(25)); await snap('kidcry')
await p.evaluate(() => { TI.dbg.skipTo(3); TI.dbg.step(130) }); await tease(2); await snap('yankwarn')
await tease(1); await p.evaluate(() => TI.dbg.step(20)); await snap('yankrage')
await p.evaluate(() => { TI.dbg.skipTo(2); TI.dbg.step(130) }); await tease(3); await snap('granny')
await p.evaluate(() => { TI.dbg.skipTo(6); TI.dbg.step(130); TI.dbg.offer(); TI.dbg.step(14); TI.dbg.reachNow(); TI.dbg.step(16) }); await snap('senjureach')
await p.evaluate(() => { TI.dbg.skipTo(11); TI.dbg.step(160) }); await snap('presin')
await tease(2); await snap('pres2')
await p.evaluate(() => { TI.dbg.skipTo(11); TI.dbg.step(160); TI.dbg.give(); TI.dbg.step(200) }); await snap('closed')
await p.evaluate(() => { TI.dbg.step(150) }); await p.waitForTimeout(300); await p.evaluate(() => { TI.dbg.reveal(); TI.dbg.step(10) }); await snap('result')
console.log(JSON.stringify(await p.evaluate(() => TI.state())), errs)
await b.close(); server.kill()
