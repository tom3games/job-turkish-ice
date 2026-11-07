import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 全部の検証。node verify.mjs（約2分）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5501
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|tom3games\.github\.io\/.*og\.png/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 15000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) canvas,#moreBox:not([hidden]) a')) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
const variance = (p, sel) => p.evaluate(sel => {
  const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 13) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
}, sel)
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]
const ev = (q, f, a) => q.evaluate(f, a)
const down = (q, sel) => q.evaluate(sel => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 })), sel)

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await ev(p, () => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r); return r
})
await t('OGP 一式がある（og:image は og.png）', async () => {
  const r = await ev(p, () => ({ ok: ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].every(k => !!document.querySelector(`meta[property="${k}"]`)) && !!document.querySelector('meta[name="twitter:card"]'), img: document.querySelector('meta[property="og:image"]').content }))
  expect(r.ok && /job-turkish-ice\/og\.png/.test(r.img), r)
})
await t('og.png が 1200x630 で置いてある', async () => { const r = await ev(p, async () => { const i = new Image(); i.src = 'og.png'; await i.decode(); return [i.naturalWidth, i.naturalHeight] }); expect(r[0] === 1200 && r[1] === 630, r); return r })
await t('タイトル: 文言とマスター', async () => { const r = await ev(p, () => ({ logo: document.querySelector('.logo .main').textContent, lead: document.querySelector('[data-t=lead]').textContent })); expect(r.logo.includes('トルコ') && r.lead.includes('からかって') && !r.lead.includes('大統領'), r); return r.logo })
await t('タイトル・遊び方・ページの説明（meta/OGP）に大統領の文字が無い（初見で驚かせる）', async () => { const r = await ev(p, () => { const T = TI.D.T; const txt = [document.querySelector('#vTitle').textContent, document.querySelector('#vHow').textContent, ...[...document.querySelectorAll('meta[name=description],meta[property^="og:"],meta[name^="twitter:"]')].map(m => m.content), T.ja.lead, T.ja.how1, T.ja.how2, T.ja.how3, T.en.lead, T.en.how1, T.en.how2, T.en.how3, ...Object.keys(T.ja).filter(k => /^tut/.test(k)).map(k => T.ja[k] + T.en[k])].join('|'); return /大統領|President/i.test(txt) ? txt.match(/.{0,20}(大統領|President).{0,20}/i)[0] : '' }); expect(!r, r) })
await t('ゲージ（バー・メーター）が無い', async () => { const n = await ev(p, () => document.querySelectorAll('progress,meter,[class*=bar],[class*=gauge],[class*=meter]').length); expect(n === 0, n) })
await t('遊び方: 3つの手順に 十字キー・泣く/キレる。大統領のネタバレ（大統領・閉店）は書かない', async () => { await p.click('#bHow'); const r = await ev(p, () => document.querySelector('#vHow').textContent); await p.click('#bHowBack'); expect(/十字キー/.test(r) && /伸びてきた瞬間/.test(r) && /泣く/.test(r) && !/大統領|閉店/.test(r), r.slice(0, 200)) })
await t('出勤: 遊ぶ画面・十字キー5つと渡す（44px 以上）・時計と人数', async () => {
  await p.click('#bStart'); await p.waitForTimeout(200)
  const r = await ev(p, () => ({ mode: TI.S.mode, play: !document.querySelector('#vPlay').hidden, n: document.querySelector('#hCust').textContent + document.querySelector('#hOf').textContent, btn: ['#dU', '#dD', '#dL', '#dR', '#dC', '#bGive'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().width)), old: !!document.querySelector('#bOffer,#bPull') }))
  expect(r.mode === 'play' && r.play && r.btn.every(w => w >= 44) && r.n === '1/12' && !r.old, r); return r
})
await t('1人目が歩いてきて注文を言う。アイスは真ん中、案内は「客の手をよく見る」', async () => {
  const r = await ev(p, () => { TI.dbg.pause(true); let n = 0; while (TI.CUR.st !== 'ready' && n++ < 300) TI.dbg.step(1); TI.dbg.step(5); return { c: TI.dbg.cust(), hint: document.querySelector('#hint').textContent } })
  expect(r.c.st === 'ready' && r.c.spot === 'C' && r.c.line && /手をよく見る/.test(r.hint), r); return { line: r.c.line, hint: r.hint }
})
await t('十字キー: 上で上へ、反対の下で真ん中へ戻る、上から左は左へ', async () => {
  const r = await ev(p, () => { const out = []; for (const d of ['U', 'D', 'U', 'L', 'C']) { TI.dbg.move(d); TI.dbg.step(14); out.push(TI.S.spot) } TI.CUR.irk = 0; TI.CUR.idles = 0; return out })
  expect(JSON.stringify(r) === '["U","C","U","L","C"]', r); return r
})
await t('手を構えたら狙いを決め、伸び始めた瞬間に十字キーで逃がすと「スカッ」+150円・鐘（赤の「今！」案内）', async () => {
  const r = await ev(p, () => { const b0 = TI.Snd.played.bell || 0; TI.dbg.toLunge(); TI.dbg.step(1); const hint = document.querySelector('#hint').textContent, red = document.querySelector('#hint').classList.contains('now'); TI.dbg.move(TI.dbg.dodgeDir()); TI.dbg.resolve(); TI.dbg.step(30); return { hint, red, c: TI.dbg.cust(), bell: (TI.Snd.played.bell || 0) - b0 } })
  expect(/今/.test(r.hint) && r.red && r.c.teases === 1 && r.c.tip === 150 && r.bell === 1, r); return { line: r.c.line, tip: r.c.tip }
})
await t('手が伸びきる寸前に逃がすと「ギリギリ」で1.5倍', async () => {
  const r = await ev(p, () => { TI.dbg.dodge(true); return { c: TI.dbg.cust(), close: TI.S.money.close } })
  expect(r.c.teases === 2 && r.close === 1 && r.c.tip === 150 + 225, r); return r.c.tip
})
await t('限界の手前で顔（マーク）と一言が変わり、そこで渡すと「ちょうどいい」手当', async () => {
  const r = await ev(p, () => {
    const c = TI.CUR; while (c.left > 0) TI.dbg.dodge(false)
    TI.dbg.step(100)
    const warn = { emo: TI.dbg.cust().emo, line: TI.dbg.cust().line, hint: document.querySelector('#hint').textContent, flash: document.querySelector('#bGive').classList.contains('flash') }
    const just0 = TI.S.money.just; TI.dbg.give(); TI.dbg.step(40)
    return { warn, done: TI.dbg.cust() && TI.dbg.cust().done, just: TI.S.money.just - just0, tut: TI.S.tut }
  })
  expect(r.warn.emo === 'anger' && /もうええって|そろそろ/.test(r.warn.line) && /渡す/.test(r.warn.hint) && r.warn.flash && r.done === 'given' && r.just === 1 && r.tut === -1, r); return r
})
await t('次の客が並びから前へ来る（2人目=子ども）', async () => { const r = await ev(p, () => { TI.dbg.step(120); let n = 0; while (TI.CUR.st !== 'ready' && n++ < 300) TI.dbg.step(1); return TI.dbg.cust() }); expect(r && r.i === 1 && r.k === 'kid' && r.st === 'ready', r); return r.line })
await t('子どもは2回目で限界のマーク（涙）、超えるとギャン泣き・チップ0・おわびのアイス', async () => {
  const r = await ev(p, () => {
    const c = TI.CUR; c.pat = c.left = 1
    TI.dbg.dodge(false); const warn = TI.dbg.cust().emo
    const b0 = TI.S.money.broke, cry0 = TI.Snd.played.cry || 0
    TI.dbg.toLunge(); TI.dbg.move(TI.dbg.dodgeDir()); TI.dbg.resolve(); TI.dbg.step(10)
    return { warn, c: TI.dbg.cust(), broke: TI.S.money.broke - b0, cry: (TI.Snd.played.cry || 0) - cry0, ono: [...document.querySelectorAll('#fx .ono')].map(e => e.textContent).join('|') }
  })
  expect(r.warn === 'tear' && r.c.done === 'broke' && r.c.tip === 0 && r.broke === 1 && r.cry >= 1 && /ギャン泣き/.test(r.ono), r); return { line: r.c.line }
})
const READY = `let n = 0; while (TI.CUR.st !== 'ready' && n++ < 400) TI.dbg.tick(1)`
await t('【本人の指摘】手を構えてから同じ場所に置いたままだと、避けた判定にならず取られる', async () => {
  const r = await ev(p, R => {
    const out = []
    TI.dbg.skipTo(4); eval(R)
    TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.move('U'); TI.dbg.resolve(); TI.dbg.step(5); out.push(TI.dbg.cust())
    TI.dbg.skipTo(8); eval(R)
    TI.dbg.resolve(); TI.dbg.step(5); out.push(TI.dbg.cust())
    return out
  }, READY)
  expect(r.every(c => c.done === 'stolen' && c.teases === 0), r); return r.map(c => c.done + '@' + c.spot)
})
await t('構えの間に連打しても稼げない（狙い直して手が遅れ、イライラでヤンキーは2回でキレる）', async () => {
  const r = await ev(p, R => {
    TI.dbg.skipTo(3); eval(R)
    const lines = [], dirs = ['U', 'L', 'R', 'D']; let k = 0
    for (let i = 0; i < 60 * 12 && TI.CUR && TI.CUR.st === 'ready'; i++) { if (i % 6 === 0) TI.dbg.move(dirs[k++ % 4]); TI.dbg.tick(1); if (TI.CUR.lastLine !== lines.at(-1)) lines.push(TI.CUR.lastLine) }
    return { c: TI.dbg.cust(), lines }
  }, READY)
  expect(r.c.done === 'broke' && r.c.teases === 0 && r.c.tip === 0 && r.c.idles === 2 && r.lines.length >= 3, r); return r.lines
})
await t('動かさないと取られる（アイス代を引く）', async () => {
  const r = await ev(p, R => { TI.dbg.skipTo(2); eval(R); const s0 = TI.S.money.stolen; TI.dbg.resolve(); TI.dbg.step(5); return { c: TI.dbg.cust(), stolen: TI.S.money.stolen - s0 } }, READY)
  expect(r.c.k === 'granny' && r.c.done === 'stolen' && r.stolen === 1, r); return r.c.line
})
await t('おばあちゃんは何回遊んでも笑う（7回で満足して帰る・ちょうどいい手当）', async () => {
  const r = await ev(p, R => { TI.dbg.skipTo(2); eval(R); const lines = []; for (let k = 0; k < 7 && TI.CUR.st === 'ready'; k++) { TI.dbg.dodge(false); lines.push(TI.dbg.cust().line) } return { c: TI.dbg.cust(), lines } }, READY)
  expect(r.c.done === 'cap' && r.c.teases === 7 && r.c.tip === 7 * 70 + 300, r); return r.lines.slice(-2)
})
await t('千手観音: 金色で腕12本。2〜3か所を同時に狙い、空いている場所が必ず残る（60回）', async () => {
  const r = await ev(p, R => {
    TI.dbg.skipTo(6); eval(R)
    const c = TI.CUR, sizes = {}, frees = []
    for (let i = 0; i < 60; i++) { TI.dbg.set({ spot: ['C', 'U', 'D', 'L', 'R'][i % 5], spotT: 1 }); TI.dbg.reachNow(); TI.dbg.toLunge(); sizes[c.aim.length] = (sizes[c.aim.length] || 0) + 1; frees.push(TI.dbg.free().length); c.ph = 'idle'; c.irk = 0; c.idles = 0 }
    return { arms: c.c.arms.length, gold: c.c.root.getObjectByProperty('isSkinnedMesh', true).material.metalness, sizes, minFree: Math.min(...frees), hands: c.c.grab.length }
  }, READY)
  expect(r.arms === 12 && r.gold > 0.5 && r.minFree >= 2 && Object.keys(r.sizes).every(s => s === '2' || s === '3') && r.hands === 4, r); return r
})
await t('千手観音: 空いている場所へ逃げればかわせる、狙われている別の場所へ動くと取られる', async () => {
  const r = await ev(p, () => {
    const c = TI.CUR; TI.dbg.dodge(false); const t1 = c.teases
    TI.dbg.toLunge(); const aimed = c.aim.find(x => x !== TI.S.spot); TI.dbg.set({ spot: aimed, spotT: 1 }); TI.dbg.resolve(); TI.dbg.step(5)
    return { t1, done: c.done, aim: c.aim, spot: TI.S.spot }
  })
  expect(r.t1 === 1 && r.done === 'stolen', r); return r
})
const FRESH = `TI.dbg.start(4); TI.dbg.pause(true); TI.S.tut = -1`
const RDY = `{ let n = 0; while (TI.CUR.st !== 'ready' && n++ < 400) TI.dbg.step(1) }`
await t('見物の人だかり: かわすほど増え、チップに倍率。渡すと明細に「見物客ボーナス」', async () => {
  const r = await ev(p, ([F, R]) => { eval(F); TI.dbg.skipTo(4); eval(R); const n0 = TI.dbg.crowd(); for (let k = 0; k < 3; k++) TI.dbg.dodge(false); TI.dbg.step(120); const n3 = TI.dbg.crowd(), mult = TI.dbg.crowdMult(), cb = TI.CUR.crowdBonus; TI.dbg.give(); TI.dbg.step(30); const row = TI.calcResult().slip.pay.find(x => /見物客/.test(x.label)); return { n0, n3, mult, cb, crowd: TI.S.money.crowd, row } }, [FRESH, RDY])
  expect(r.n0 === 0 && r.n3 >= 3 && r.mult > 1.25 && r.cb > 0 && r.crowd === r.cb && r.row && r.row.yen === r.crowd, r); return r
})
await t('見物の人だかり: 次の客にも残り、取られるとサッと散る（ブーイング）', async () => {
  const r = await ev(p, R => { TI.dbg.step(200); eval(R); const keep = TI.dbg.crowd(); const b0 = TI.Snd.played.boo || 0; TI.dbg.resolve(); TI.dbg.step(5); const done = TI.dbg.cust().done; TI.dbg.step(240); return { keep, done, after: TI.dbg.crowd(), boo: (TI.Snd.played.boo || 0) - b0 } }, RDY)
  expect(r.keep >= 3 && r.done === 'stolen' && r.after === 0 && r.boo === 1, r); return r
})
await t('見物人が10人いても fps が落ちすぎない（GPU を使うヘッドレス・0人の85%以上か50以上）', async () => {
  const gb = await chromium.launch({ channel: 'chromium', args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
  const gc = await gb.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await muteContext(gc); const gp = await gc.newPage()
  await gp.goto(URL0); await gp.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 15000 })
  const fps = () => gp.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(Math.round(n / 2.5)) }; requestAnimationFrame(f) }))
  await gp.evaluate(() => { TI.dbg.start(4); TI.S.tut = -1; TI.dbg.skipTo(4); TI.CUR.ph = 'wait'; TI.CUR.pt = 999 }); await gp.waitForTimeout(1200)
  const a = await fps()
  await gp.evaluate(() => { TI.dbg.addCrowd(10); TI.CUR.pt = 999 }); await gp.waitForTimeout(3000)
  const b2 = await fps(), n = await gp.evaluate(() => TI.dbg.crowd()); await gb.close()
  expect(n === 10 && (b2 >= a * 0.85 || b2 >= 50), { a, b: b2, n }); return { fps0: a, fps10: b2, n }
})
await t('フェイント: 最初の伸びに釣られると本物が速くなって取られやすい。合図（肩が沈む・よっ）を待てばかわせる', async () => {
  const run = (react) => ev(p, ([F, R, react]) => {
    eval(F); TI.dbg.skipTo(4); eval(R); const c = TI.CUR
    const r0 = TI.S.rand; TI.S.rand = () => 0; c.ph = 'wind'; c.pt = 0.01; c.feinted = false; c.aim = ['C']; TI.dbg.step(2); TI.S.rand = r0
    const feint = c.ph === 'feint', tellAtFeint = c.tell
    if (react) { TI.dbg.step(4); TI.dbg.move('U') }
    let n = 0; while (c.ph !== 'lunge' && n++ < 300) TI.dbg.step(1)
    const tell = c.tell > 0, pdur = c.pdur, hup0 = TI.Snd.played.hup
    for (let i = 0; i < 16; i++) TI.dbg.step(1)          // 0.27秒で反応
    if (c.ph === 'lunge') TI.dbg.move(TI.dbg.dodgeDir())
    TI.dbg.resolve(); TI.dbg.step(5)
    return { feint, tellAtFeint, tell, pdur: +pdur.toFixed(2), fooled: c.fooled, done: c.done || 'dodged', teases: c.teases }
  }, [FRESH, RDY, react])
  const a = await run(true), b = await run(false)
  expect(a.feint && b.feint && !a.tellAtFeint && a.tell && b.tell && a.fooled && !b.fooled && a.pdur < b.pdur * 0.7 && a.done === 'stolen' && b.teases === 1, { a, b }); return { reacted: a.done, waited: b.done + ' teases=' + b.teases }
})
await t('フェイントは前半ほぼ無く、後半ほど増える', async () => { const r = await ev(p, () => { const K = TI.D.FEINT; return K }); expect(r.from >= 3 && r.p1 > r.p0, r); return r })
await t('両手で来るヤンキー（後半）: 1本目だけかわすと2本目に取られる。両方かわすと「両手かわし」1.5倍', async () => {
  const run = (both) => ev(p, ([F, R, both]) => {
    eval(F); TI.dbg.skipTo(7); eval(R); const c = TI.CUR
    const r0 = TI.S.rand; TI.S.rand = () => 0.99; TI.dbg.toLunge(); TI.S.rand = r0
    c.dbl = true; c.second = false
    TI.dbg.move(TI.dbg.dodgeDir()); let n = 0; while (!c.second && c.ph === 'lunge' && n++ < 200) TI.dbg.step(1)
    const second = c.second
    if (both) TI.dbg.move(TI.dbg.dodgeDir())
    TI.dbg.resolve(); TI.dbg.step(5)
    return { second, done: c.done || 'dodged', tip: c.tip }
  }, [FRESH, RDY, both])
  const a = await run(false), b = await run(true)
  expect(a.second && a.done === 'stolen' && b.done === 'dodged' && b.tip === Math.round(230 * 1.5), { a, b }); return { one: a.done, both: b.tip }
})
await t('カップル: 彼女は笑い、彼氏のイライラが先に限界（合図→胸ぐら・クリーニング代）', async () => {
  const r = await ev(p, ([F, R]) => { eval(F); TI.dbg.skipTo(8); eval(R); const c = TI.CUR; c.bfLeft = c.bfPat = 2; c.left = c.pat = 5; const seen = []; while (c.st === 'ready' && c.teases < 6) { TI.dbg.dodge(false); seen.push([c.lastLine, c.bf.lastLine, c.bf.emoK]) } return { seen, done: c.done, pen: TI.S.money.pen.clean, kick: !!TI.S.kick, ded: TI.calcResult().slip.ded.filter(d => d.yen > 0).map(d => d.label) } }, [FRESH, RDY])
  const warn = r.seen.find(s => s[2] === 'anger')
  expect(r.done === 'broke' && r.pen === 1 && warn && /次やったら/.test(warn[1]) && /彼女/.test(r.seen.at(-1)[1]) && r.ded.includes('クリーニング代'), r); return r.seen.map(s => s[1])
})
await t('カップル: 彼氏の限界の合図で渡すと二人分のチップ（ちょうどいい手当も二人分）', async () => {
  const r = await ev(p, ([F, R]) => { eval(F); TI.dbg.skipTo(8); eval(R); const c = TI.CUR; c.bfLeft = c.bfPat = 2; c.left = c.pat = 5; TI.dbg.dodge(false); TI.dbg.dodge(false); const one = c.tip, cb = c.crowdBonus; TI.dbg.give(); TI.dbg.step(30); return { one, cb, tip: c.tip, done: c.done, just: TI.S.money.just, crowd: TI.S.money.crowd } }, [FRESH, RDY])
  expect(r.done === 'given' && r.tip === (r.one + 300) * 2 && r.just === 2 && r.crowd === r.cb * 2, r); return r
})
const breakAt = (i, setup = '') => ev(p, ([F, R, i, setup]) => { eval(F); TI.dbg.skipTo(i); eval(R); const c = TI.CUR; eval(setup); c.left = 0; if (c.bf) c.bfLeft = 9; const sign0 = 0; TI.dbg.dodge(false); TI.dbg.step(60); return { k: c.k, done: c.done, pen: { ...TI.S.money.pen }, kick: TI.S.lastKick, sign: TI.S.mode && document.querySelector('canvas') && 0, ded: TI.calcResult().slip.ded.filter(d => d.yen > 0).map(d => d.label + d.yen) } }, [FRESH, RDY, i, setup])
await t('キレた時のマイナス: ヤンキーは屋台を蹴って看板が落ちる「看板の修理代」', async () => { const r = await breakAt(3); const fell = await ev(p, () => TI.signVisible()); expect(r.done === 'broke' && r.pen.sign === 1 && fell && r.ded.some(d => /看板の修理代2000/.test(d)), { r, fell }); return r.ded })
await t('キレた時のマイナス: 子どもが泣くとお母さんが来てクレーム「おわびのアイスもう1個」', async () => { const r = await breakAt(1); const mom = await ev(p, () => !!(TI.CUR && TI.CUR.mom) || TI.LINE.length >= 0 && [...document.querySelectorAll('#fx .sb')].some(e => /うちの子/.test(e.textContent))); expect(r.done === 'broke' && r.pen.mom === 1 && mom && r.ded.some(d => /お母さんのクレーム500/.test(d)), { r, mom }); return r.ded })
await t('キレた時のマイナス: ふつうの客は★1の口コミ。次の客の我慢が1減る', async () => {
  const r = await breakAt(8); const nx = await ev(p, () => { TI.dbg.step(200); let n = 0; while ((!TI.CUR || TI.CUR.st !== 'ready') && n++ < 400) TI.dbg.step(1); TI.CUR.ph = 'wait'; TI.CUR.pt = 99; TI.dbg.step(90); return { k: TI.CUR.k, pat: TI.CUR.pat, base: TI.D.KINDS[TI.CUR.k].pat, wary: !!TI.CUR.wary, line: TI.D.T.ja.wary } })
  expect(r.pen.review === 1 && r.ded.some(d => /口コミ★1300/.test(d)) && nx.k === 'granny' && nx.pat === nx.base - 1 && nx.wary, { r, nx }); return { ded: r.ded, next: nx }
})
await t('キレた時のマイナス: 千手観音は千手ビンタで店員が吹っ飛ぶ「治療費」', async () => { const r = await breakAt(6); expect(r.done === 'broke' && r.pen.heal === 1 && r.kick === 'fly' && r.ded.some(d => /治療費3000/.test(d)), r); return r.ded })
await t('控除の行が多すぎる時は「そのほかの弁償」にまとめて紙に収める', async () => { const r = await ev(p, () => { Object.assign(TI.S.money, { stolen: 2, broke: 5, pen: { sign: 1, mom: 1, review: 1, heal: 1, clean: 1 } }); TI.S.closed = true; const d = TI.calcResult().slip.ded.filter(x => x.yen > 0); TI.S.closed = false; return d.map(x => x.label) }); expect(r.length <= 6 && r.includes('そのほかの弁償'), r); return r })
await t('大統領は手が速い（構え・伸ばす・手を出すまでがふつうの客より短い）', async () => { const r = await ev(p, () => { const K = TI.D.KINDS; return [K.president.wind < K.normal.wind, K.president.lunge < K.normal.lunge, K.president.reach[1] < K.normal.reach[1]] }); expect(r.every(Boolean), r) })
await t('大統領: ボディガードが「すぐ渡せよ？」→ 1回で渡すと閉店（シャッター・明細のハンコも閉店）', async () => {
  const r = await ev(p, () => { TI.dbg.skipTo(11); let n = 0; while (TI.CUR.st !== 'ready' && n++ < 400) TI.dbg.step(1); n = 0; while (!document.querySelector('#fx .sb.guard') && n++ < 240) TI.dbg.step(1); const b = [...document.querySelectorAll('#fx .sb.guard')].map(e => e.textContent).join('|'); const boss = document.querySelector('#vignette').classList.contains('boss'); TI.dbg.give(); TI.dbg.step(60 * 3); const shutter = document.querySelector('#shutter').style.height; TI.dbg.step(60 * 5); return { b, boss, closed: TI.S.closed, shutter, mode: TI.S.mode } })
  await p.waitForFunction(() => TI.S.mode === 'result', null, { timeout: 5000 }).catch(() => {})
  const r2 = await ev(p, () => ({ mode: TI.S.mode, stamp: TI.S.result && TI.S.result.rank.st.ja, ded: TI.S.result && TI.S.result.slip.ded.map(d => d.label + d.note + d.yen) }))
  expect(/すぐ渡せよ/.test(r.b) && r.boss && r.closed && r.shutter === '100%' && r2.mode === 'result' && r2.stamp === '閉店' && r2.ded.some(d => /閉店30000/.test(d)), { r, r2 }); return r2
})
const presReady = `TI.dbg.start(2); TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.skipTo(11); let n = 0; while (TI.CUR.st !== 'ready' && n++ < 400) TI.dbg.step(1)`
await t('大統領: 3回以上かわしてから渡すと大統領チップ。ガードの脅しは回数で変わる', async () => {
  const r = await ev(p, js => { eval(js); const g = []; for (let k = 0; k < 4; k++) { TI.dbg.dodge(false); g.push([...document.querySelectorAll('#fx .sb.guard')].map(e => e.textContent).join('')) } TI.dbg.give(); TI.dbg.step(30); return { g, pres: TI.S.money.pres, closed: TI.S.closed } }, presReady)
  expect(r.pres === 5000 && !r.closed && new Set(r.g).size >= 3, r); return r
})
await t('大統領: 遊びすぎると国際問題', async () => {
  const r = await ev(p, js => { eval(js); for (let k = 0; k < 8 && TI.CUR.st === 'ready'; k++) TI.dbg.dodge(false); TI.dbg.step(60 * 6); return { inc: TI.S.incident, closed: TI.S.closed, mode: TI.S.mode } }, presReady)
  await p.waitForFunction(() => TI.S.mode === 'result', null, { timeout: 5000 }).catch(() => {})
  const r2 = await ev(p, () => TI.S.result && TI.S.result.slip.ded.map(d => d.label + d.note))
  expect(r.inc && !r.closed && r2 && r2.some(d => /国際問題/.test(d)), { r, r2 }); return r2
})
await t('音: BGM（通常・大統領）と効果音が呼ばれている（鳴らさず回数で）', async () => { const r = await ev(p, () => ({ calls: window.__soundCalls || 0, played: TI.Snd.played })); expect(r.calls > 0 && r.played.bell > 0 && r.played.whiff > 0 && r.played.grab > 0 && r.played.fanfare > 0 && r.played.shutter > 0, r); return Object.keys(r.played).length })
await t('明細: ハンコ・手取り・Xの本文（#1日だけ職場体験・公開URL）', async () => {
  await ev(p, () => { TI.dbg.reveal(); TI.dbg.step(10) })
  const r = await ev(p, () => ({ mode: TI.S.mode, vis: !document.querySelector('#vResult').hidden, x: TI.xPost(), btn: document.querySelector('#rBtns2').classList.contains('on'), net: TI.S.result.net }))
  expect(r.mode === 'result' && r.vis && r.btn && /x\.com\/intent\/post/.test(r.x.href) && r.x.text.includes('手取り') && r.x.text.includes('#1日だけ職場体験') && r.x.url === 'https://tom3games.github.io/job-turkish-ice/', r); return r.x.text
})
await t('明細の絵が描けている（輝度の散らばり）', async () => { const v = await variance(p, '#slip'); expect(v > 500, v); return v })
await t('明細を保存（ダウンロード）', async () => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#bSave')]); expect(/job-turkish-ice-.*\.png/.test(dl.suggestedFilename()), dl.suggestedFilename()); return dl.suggestedFilename() })
await t('ほかのバカゲー: 4本（居酒屋・交通誘導・おなら・袋詰め）', async () => { await p.click('#bMore'); const r = await ev(p, () => [...document.querySelectorAll('#moreL a')].map(a => a.href.split('/').at(-2))); await p.click('#bMoreX'); expect(r.length === 4 && ['job-izakaya', 'job-traffic', 'elevator-fart', 'bag-it-up'].every(s => r.includes(s)), r); return r })
await t('英語に切り替え: 明細・ボタン・Xの本文が英語', async () => { await p.click('#bLang'); const r = await ev(p, () => ({ again: document.querySelector('#bAgain').textContent, share: TI.xPost().text, ded: TI.S.result.slip.ded.map(d => d.label)[0] })); await p.click('#bLang'); expect(r.again === 'Again' && /Take-home/.test(r.share) && r.ded === 'Snatched cones', r); return r })
await t('もう一回: 状態が初期化される', async () => { await p.click('#bAgain'); const r = await ev(p, () => ({ mode: TI.S.mode, ci: TI.S.ci, m: TI.S.money, closed: TI.S.closed, inc: TI.S.incident, line: TI.LINE.length, shut: document.querySelector('#shutter').style.height })); expect(r.mode === 'play' && r.ci === 0 && r.m.tips === 0 && !r.closed && !r.inc && r.line === 3 && (r.shut === '0px' || r.shut === '0'), r); return r })
await p.addScriptTag({ path: ROOT + '/bot.js' })
const day = (o, seed) => ev(p, ([o, seed]) => { TI.dbg.start(seed); TI.dbg.pause(true); TI.S.tut = -1; TIBot.run(60 * 400, o); TI.dbg.tick(500); const r = TI.calcResult(); return { net: r.net, stamp: r.rank.st.ja.replace('\n', ''), m: TI.S.money, mode: TI.S.mode } }, [o, seed])
const D = {}
await t('自動プレイ: 上手い人（手が伸びたら0.2〜0.27秒で空いた場所へ、限界の合図で渡す）', async () => { const r = D.skill = await day({ rt: [12, 16], give: 'skill' }, 7); expect(r.stamp === '看板職人' && r.m.stolen <= 1 && r.m.broke === 0, r); return r })
await t('自動プレイ: すぐ渡す人は大統領で閉店', async () => { const r = D.quick = await day({ give: 'quick' }, 7); expect(r.stamp === '閉店' && r.net < 0, r); return r })
await t('自動プレイ: 遊びすぎる人は泣かせまくってクビ', async () => { const r = D.greedy = await day({ rt: [12, 16], give: 'greedy' }, 7); expect(r.stamp === 'クビ' && r.m.broke >= 8, r); return r })
await t('自動プレイ: 十字キーを連打し続ける人はチップ0でクビ', async () => { const r = D.spam = await day({ spam: 5 }, 7); expect(r.stamp === 'クビ' && r.m.tips === 0, r); return r })
await t('自動プレイ: 何もしない通しは最低のハンコ（クビ）', async () => { const r = D.nothing = await day({ nothing: true }, 7); expect(r.stamp === 'クビ' && r.m.teases === 0 && r.m.stolen === 12, r); return r })
await t('手取りが 上手い > ふつう > 遊びすぎ・連打・何もしない・すぐ渡す で分かれる', async () => { const avg = D.avg = await day({ rt: [12, 24], give: 'random' }, 8); const o = { skill: D.skill.net, avg: avg.net, greedy: D.greedy.net, spam: D.spam.net, nothing: D.nothing.net, quick: D.quick.net }; expect(D.skill.net > avg.net && avg.net > Math.max(D.greedy.net, D.spam.net, D.nothing.net, D.quick.net) && D.skill.net - Math.max(D.greedy.net, D.nothing.net, D.spam.net) > 15000, o); return o })
for (const [name, o] of [['上手い人', { rt: [12, 16], give: 'skill' }], ['遊びすぎ', { rt: [12, 16], give: 'greedy' }], ['ふつう', { rt: [12, 24], give: 'random' }]]) {
  await t(`文字は同時に2つまで・読める時間（0.9秒＋1字0.09秒）以上・一言は12字前後まで（${name}の1日）`, async () => {
    const r = await ev(p, o => {
      TI.dbg.start(7); TI.dbg.pause(true); store: { try { localStorage.removeItem('ti.tut') } catch (e) {} } TI.S.tut = 0
      let max = 0, at = null, perCust = {}
      for (let i = 0; i < 60 * 400 && TI.S.mode === 'play'; i++) { TIBot.tick(o); TI.dbg.tick(1); const n = TI.dbg.texts(); if (n > max) { max = n; at = [...document.querySelectorAll('#fx > *')].map(e => e.textContent).concat(document.querySelector('#hint').hidden ? [] : [document.querySelector('#hint').textContent]) } const k = TI.S.ci; perCust[k] = Math.max(perCust[k] || 0, n) }
      const log = TI.dbg.txtLog(), short = log.filter(x => x.shown != null && x.shown < x.min - 0.02), long = log.filter(x => x.ch === 'sb' && [...x.text].length > 13)
      return { max, at, perCust, n: log.length, short: short.map(x => x.text + ':' + x.shown + '/' + x.min + ' p' + x.prio), long: long.map(x => x.text) }
    }, o)
    expect(r.max <= 2 && r.short.length <= Math.ceil(r.n * 0.05) && !r.long.length && r.n > 20, r); return { max: r.max, items: r.n, cutShort: r.short.length, perCust: Object.values(r.perCust).join('') }
  })
}
await t('画面をスワイプしても動かせる（上・左）', async () => { const r = await ev(p, () => { TI.dbg.start(3); TI.dbg.pause(true); TI.S.tut = -1; let n = 0; while (TI.CUR.st !== 'ready' && n++ < 300) TI.dbg.step(1); const c = document.querySelector('#gl'), sw = (x0, y0, x1, y1) => { c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x0, clientY: y0 })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x1, clientY: y1 })) }; sw(200, 400, 200, 330); const a = TI.S.spot; sw(200, 400, 120, 405); return [a, TI.S.spot] }); expect(r[0] === 'U' && r[1] === 'L', r); return r })
await t('キーボード: 左にある時に→で真ん中、↑で上、Spaceで渡す', async () => { await p.keyboard.press('ArrowRight'); const a = await ev(p, () => { TI.dbg.step(5); return TI.S.spot }); await p.keyboard.press('ArrowUp'); const b = await ev(p, () => { TI.dbg.step(5); return TI.S.spot }); await p.keyboard.press('Space'); const c = await ev(p, () => { TI.dbg.step(30); return TI.dbg.cust().done }); expect(a === 'C' && b === 'U' && c === 'given', [a, b, c]); return [a, b, c] })
await t('ここまでエラーなし', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- 6サイズ × 全画面で一画面に収まる
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h }, hasTouch: w < 1000, isMobile: w < 1000 })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('#bHowBack')
  await q.click('#bMoreT'); views.more = await fit(q); await q.click('#bMoreX')
  await q.click('#bStart'); await q.waitForTimeout(150)
  await q.evaluate(() => { TI.dbg.pause(true); let n = 0; while (TI.CUR.st !== 'ready' && n++ < 300) TI.dbg.step(1); TI.dbg.toLunge(); TI.dbg.step(2) })
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await t(`チュートリアルの案内とボタンが重ならない ${name}`, async () => { const r = await q.evaluate(() => { const a = document.querySelector('#hint').getBoundingClientRect(), o = []; if (document.querySelector('#hint').hidden) return ['hidden']; for (const s of ['#dpad', '#bGive', '#corner']) { const b = document.querySelector(s).getBoundingClientRect(); if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) o.push(s) } return o }); expect(!r.length, r.join()) })
  await t(`十字キーと渡すボタンが重ならず、画面の内側 ${name}`, async () => { const r = await q.evaluate(() => { const a = document.querySelector('#dpad').getBoundingClientRect(), b = document.querySelector('#bGive').getBoundingClientRect(); return { hit: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, gap: Math.round(b.left - a.right), inside: a.left >= 0 && b.right <= innerWidth && a.bottom <= innerHeight && b.bottom <= innerHeight } }); expect(!r.hit && r.inside && r.gap >= 12, r); return r.gap })
  await q.evaluate(() => { TI.S.tut = -1; TI.dbg.skipTo(11); let n = 0; while (TI.CUR.st !== 'ready' && n++ < 400) TI.dbg.step(1); TI.dbg.dodge(false); TI.dbg.toLunge(); TI.dbg.step(3) })
  views.pres = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-pres.png` })
  await q.evaluate(() => { TI.dbg.give(); TI.dbg.step(60 * 8) }); await q.waitForFunction(() => TI.S.mode === 'result', null, { timeout: 5000 }).catch(() => {}); await q.evaluate(() => { TI.dbg.reveal(); TI.dbg.step(5) })
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  await t(`明細が画面内に収まり小さすぎない ${name}`, async () => { const r = await q.evaluate(() => { const b = document.querySelector('#slip').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), H: innerHeight, mode: TI.S.mode } }); expect(r.mode === 'result' && r.h >= 220 && r.top >= 0 && r.bottom <= r.H, r); return r })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()
// ---- WebKit（iPhone 相当）
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで出勤→十字キーでかわす→渡す→明細まで', async () => {
  await wp.tap('#bStart'); await wp.waitForTimeout(200)
  const d = await wp.evaluate(() => { TI.dbg.pause(true); TI.S.tut = -1; let n = 0; while (TI.CUR.st !== 'ready' && n++ < 300) TI.dbg.step(1); TI.dbg.toLunge(); TI.dbg.step(1); return TI.dbg.dodgeDir() })
  await wp.tap('#d' + d)
  const r = await wp.evaluate(() => { TI.dbg.resolve(); TI.dbg.step(20); TI.dbg.give(); TI.dbg.step(30); const c = TI.dbg.cust(); TI.dbg.end(); TI.dbg.step(200); return c })
  await wp.waitForFunction(() => TI.S.mode === 'result', null, { timeout: 5000 }).catch(() => {})
  const m = await wp.evaluate(() => TI.S.mode)
  expect(r.done === 'given' && r.teases === 1 && m === 'result', { r, m, d }); return m
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
