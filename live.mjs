import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/job-turkish-ice/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(bt === chromium ? MUTE_LAUNCH : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  await muteContext(ctx)
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 20000 })
  await p.click('#bStart'); await p.waitForTimeout(300)
  const flow = await p.evaluate(() => { TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.step(150); TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(20); TI.dbg.give(); TI.dbg.step(30); const c = TI.dbg.cust(); TI.dbg.skipTo(11); TI.dbg.step(160); TI.dbg.give(); TI.dbg.step(60 * 8); return { c: c && { done: c.done, teases: c.teases, tip: c.tip }, closed: TI.S.closed } })
  await p.waitForFunction(() => TI.S.mode === 'result', null, { timeout: 5000 }).catch(() => {})
  await p.evaluate(() => { TI.dbg.reveal(); TI.dbg.step(5) })
  const res = await p.evaluate(() => ({ mode: TI.S.mode, net: TI.S.result && TI.S.result.net, stamp: TI.S.result && TI.S.result.rank.st.ja }))
  out.push(`${name}: flow=${JSON.stringify(flow)} result=${JSON.stringify(res)}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(MUTE_LAUNCH), p = await b.newPage()
for (const u of ['https://github.com/tom3games/job-turkish-ice', 'https://github.com/tom3games/job-turkish-ice/commits/main', 'https://github.com/tom3games/job-turkish-ice/activity']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner-id=${new RegExp(['tmk', '4men'].join(''), 'i').test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
