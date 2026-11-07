// 開発用の撮影（人だかり・フェイント・カップル・キレた時）。node shot3.mjs [w] [h]
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, PORT = 5503
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844), tag = `${W}x${H}`
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', hasTouch: W < 1000, isMobile: W < 1000 }); await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 15000 })
await p.evaluate(() => document.fonts.ready)
const snap = async n => { await p.evaluate(() => TI.dbg.render()); await p.screenshot({ path: `${ROOT}/shots/d3-${tag}-${n}.png` }) }
const R = `let n = 0; while (TI.CUR.st !== 'ready' && n++ < 400) TI.dbg.step(1)`
await p.evaluate(R => { TI.dbg.start(3); TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.skipTo(4); eval(R); for (let k = 0; k < 3; k++) TI.dbg.dodge(false); TI.dbg.addCrowd(7); TI.CUR.ph = 'wait'; TI.CUR.pt = 99; TI.dbg.step(200) }, R); await snap('crowd')
await p.evaluate(R => { TI.dbg.skipTo(8); eval(R); TI.dbg.dodge(false); TI.dbg.dodge(false); TI.dbg.step(10) }, R); await snap('couple-warn')
await p.evaluate(() => { const c = TI.CUR; while (c.bfLeft >= 0 && c.st === 'ready') TI.dbg.dodge(false); TI.dbg.step(-1); }); await p.evaluate(() => TI.dbg.step(1)); await snap('couple-collar')
await p.evaluate(R => { TI.dbg.skipTo(7); eval(R); TI.CUR.left = 0; TI.dbg.dodge(false); TI.dbg.step(30) }, R); await snap('yankee-sign')
await p.evaluate(R => { TI.dbg.skipTo(5); eval(R); TI.CUR.left = 0; TI.dbg.dodge(false); TI.dbg.step(40) }, R); await snap('kid-mom')
await p.evaluate(R => { TI.dbg.skipTo(10); eval(R); TI.CUR.left = 0; TI.dbg.dodge(false); TI.dbg.toLunge && 0 }, R); await p.evaluate(() => { TI.dbg.step(-25) }); await snap('senju-fly')
await p.evaluate(R => { TI.dbg.skipTo(9); eval(R); TI.CUR.ph = 'wind'; TI.CUR.pt = 0.01; TI.CUR.feinted = false; const r0 = Math.random; TI.S.rand = () => 0; TI.dbg.step(2); TI.S.rand = r0; TI.dbg.step(10) }, R); await snap('feint')
console.log(JSON.stringify(await p.evaluate(() => TI.state())), errs)
await b.close(); server.kill()
