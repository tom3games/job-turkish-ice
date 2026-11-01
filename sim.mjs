// 自動プレイで1日通して、手取りの分布を見る。node sim.mjs（SEEDS=1,2,3）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const PORT = 5505
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 844, height: 390 }, locale: 'ja-JP' }); await muteContext(ctx)
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 15000 })
await p.addScriptTag({ path: 'bot.js' })
const out = {}
for (const [name, o] of [['skilled', { rt: [12, 18], give: 'skill' }], ['average', { rt: [12, 30], give: 'random' }], ['quick', { give: 'quick' }], ['greedy', { rt: [12, 18], give: 'greedy' }], ['slow', { rt: [24, 34], give: 'skill' }], ['nothing', { nothing: true }]]) {
  for (const seed of (process.env.SEEDS || '1,2,3').split(',').map(Number)) {
    const r = await p.evaluate(([o, seed]) => { TI.dbg.start(seed); TI.dbg.pause(true); TI.S.tut = -1; const st = TIBot.run(60 * 400, o); TI.dbg.tick(400); const res = TI.calcResult(); return { m: TI.S.money, closed: TI.S.closed, inc: TI.S.incident, net: res.net, stamp: res.rank.st.ja.replace('\n', ''), mode: TI.S.mode, t: Math.round(TI.S.t) } }, [o, seed])
    console.log(name.padEnd(8), seed, 'net', String(r.net).padStart(7), r.stamp.padEnd(5), JSON.stringify(r.m), r.closed ? 'CLOSED' : '', r.inc ? 'INCIDENT' : '', 'mode', r.mode, 't', r.t)
    ;(out[name] ||= []).push(r.net)
  }
}
console.log(Object.entries(out).map(([k, v]) => `${k}: avg ${Math.round(v.reduce((a, b) => a + b, 0) / v.length)}`).join(' / '))
console.log('errors', errs)
await b.close(); server.kill()
