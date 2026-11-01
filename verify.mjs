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
await t('タイトル: 文言とマスター', async () => { const r = await ev(p, () => ({ logo: document.querySelector('.logo .main').textContent, lead: document.querySelector('[data-t=lead]').textContent })); expect(r.logo.includes('トルコ') && r.lead.includes('大統領'), r); return r.logo })
await t('ゲージ（バー・メーター）が無い', async () => { const n = await ev(p, () => document.querySelectorAll('progress,meter,[class*=bar],[class*=gauge],[class*=meter]').length); expect(n === 0, n) })
await t('遊び方: 3つの手順に 差し出す/引っ込める・泣く/キレる・大統領 が書いてある', async () => { await p.click('#bHow'); const r = await ev(p, () => document.querySelector('#vHow').textContent); await p.click('#bHowBack'); expect(/差し出す/.test(r) && /引っ込める/.test(r) && /泣く/.test(r) && /大統領/.test(r) && /閉店/.test(r), r.slice(0, 80)) })
await t('出勤: 遊ぶ画面・3つのボタン（44px 以上）・時計と人数', async () => {
  await p.click('#bStart'); await p.waitForTimeout(200)
  const r = await ev(p, () => ({ mode: TI.S.mode, play: !document.querySelector('#vPlay').hidden, clock: document.querySelector('#hClock').textContent, n: document.querySelector('#hCust').textContent + document.querySelector('#hOf').textContent, btn: ['#bOffer', '#bPull', '#bGive'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().width)) }))
  expect(r.mode === 'play' && r.play && r.btn.every(w => w >= 44) && r.n === '1/12', r); return r
})
await t('1人目が歩いてきて注文を言う。チュートリアルは「差し出す」を指す', async () => {
  const r = await ev(p, () => { TI.dbg.pause(true); TI.dbg.step(150); return { c: TI.dbg.cust(), hint: document.querySelector('#hint').textContent, hid: document.querySelector('#hint').hidden, flash: document.querySelector('#bOffer').classList.contains('flash') } })
  expect(r.c.st === 'ready' && r.c.line && !r.hid && /差し出す/.test(r.hint) && r.flash, r); return { line: r.c.line, hint: r.hint }
})
await t('差し出す → 棒が出る。手が来る前に引っ込めても数えない', async () => {
  const r = await ev(p, () => { TI.dbg.offer(); TI.dbg.step(20); const ext = TI.S.ext, ph = TI.CUR.ph; TI.dbg.pull(); TI.dbg.step(30); return { ext, ph, after: TI.dbg.cust() } })
  expect(r.ext === 1 && r.ph === 'wait' && r.after.teases === 0 && r.after.ph === 'idle', r); return { ph: r.ph, teases: r.after.teases }
})
await t('手を構えた時（チュートリアルは赤で「今！引っ込める」）に引っ込めるとかわして +チップ・鐘', async () => {
  const r = await ev(p, () => { const b0 = TI.Snd.played.bell || 0; TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(4); const hint = document.querySelector('#hint').textContent, red = document.querySelector('#hint').classList.contains('now'); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30); return { hint, red, c: TI.dbg.cust(), bell: (TI.Snd.played.bell || 0) - b0, teases: TI.S.money.teases } })
  expect(/今/.test(r.hint) && r.red && r.c.teases === 1 && r.c.tip === 150 && r.bell === 1 && r.teases === 1, r); return { line: r.c.line, tip: r.c.tip }
})
await t('手が伸びてくる途中で引っ込めると「ギリギリ」で1.5倍', async () => {
  const r = await ev(p, () => { TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(2); while (TI.CUR.ph === 'wind') TI.dbg.step(1); TI.dbg.step(2); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30); return { c: TI.dbg.cust(), close: TI.S.money.close } })
  expect(r.c.teases === 2 && r.close === 1 && r.c.tip === 150 + 225, r); return r.c.tip
})
await t('限界の手前で顔（マーク）と一言が変わり、そこで渡すと「ちょうどいい」手当', async () => {
  const r = await ev(p, () => {
    const c = TI.CUR; while (c.left > 0) { TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30) }
    const warn = { emo: TI.dbg.cust().emo, line: TI.dbg.cust().line, hint: document.querySelector('#hint').textContent, flash: document.querySelector('#bGive').classList.contains('flash') }
    const just0 = TI.S.money.just; TI.dbg.give(); TI.dbg.step(40)
    return { warn, done: TI.dbg.cust() && TI.dbg.cust().done, just: TI.S.money.just - just0, tips: TI.S.money.tips, tut: TI.S.tut }
  })
  expect(r.warn.emo === 'anger' && /もうええって|そろそろ/.test(r.warn.line) && /渡す/.test(r.warn.hint) && r.warn.flash && r.done === 'given' && r.just === 1 && r.tut === -1, r); return r
})
await t('次の客が並びから前へ来る（2人目=子ども）', async () => { const r = await ev(p, () => { TI.dbg.step(200); return TI.dbg.cust() }); expect(r && r.i === 1 && r.k === 'kid' && r.st === 'ready', r); return r.line })
await t('子どもは2回目で限界のマーク（涙）、超えるとギャン泣き・チップ0・おわびのアイス', async () => {
  const r = await ev(p, () => {
    const c = TI.CUR; c.pat = c.left = 1
    TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30); const warn = TI.dbg.cust().emo
    const b0 = TI.S.money.broke, cry0 = TI.Snd.played.cry || 0
    TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(20)
    return { warn, c: TI.dbg.cust(), broke: TI.S.money.broke - b0, cry: (TI.Snd.played.cry || 0) - cry0, ono: [...document.querySelectorAll('#fx .ono')].map(e => e.textContent).join('|') }
  })
  expect(r.warn === 'tear' && r.c.done === 'broke' && r.c.tip === 0 && r.broke === 1 && r.cry >= 1 && /ギャン泣き/.test(r.ono), r); return { line: r.c.line }
})
await t('引っ込めないと取られる（アイス代を引く）', async () => {
  const r = await ev(p, () => { TI.dbg.step(200); const s0 = TI.S.money.stolen; TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.resolve(); TI.dbg.step(5); return { c: TI.dbg.cust(), stolen: TI.S.money.stolen - s0 } })
  expect(r.c.k === 'granny' && r.c.done === 'stolen' && r.stolen === 1, r); return r.c.line
})
await t('おばあちゃんは何回遊んでも笑う（7回で満足して帰る・ちょうどいい手当）', async () => {
  const r = await ev(p, () => { TI.dbg.skipTo(2); TI.dbg.step(150); const lines = []; for (let k = 0; k < 7 && TI.CUR.st === 'ready'; k++) { TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30); lines.push(TI.dbg.cust().line) } return { c: TI.dbg.cust(), lines } })
  expect(r.c.done === 'cap' && r.c.teases === 7 && r.c.tip === 7 * 70 + 300, r); return r.lines.slice(-2)
})
await t('何もしないと「まだ？」→ 限界で帰る（ヤンキーは2回でキレる）', async () => {
  const r = await ev(p, () => { TI.dbg.skipTo(3); TI.dbg.step(150); const lines = []; for (let i = 0; i < 60 * 14 && TI.CUR && TI.CUR.st === 'ready'; i++) { TI.dbg.tick(1); if (TI.CUR.lastLine !== lines.at(-1)) lines.push(TI.CUR.lastLine) } return { c: TI.dbg.cust(), lines } })
  expect(r.c.done === 'broke' && r.c.idles === 2 && r.lines.length >= 3, r); return r.lines
})
await t('千手観音は金色で腕が12本、手を出すのが速い', async () => {
  const r = await ev(p, () => { TI.dbg.skipTo(6); TI.dbg.step(150); const c = TI.CUR; return { k: c.k, arms: c.c.arms.length, wind: c.def.wind, normal: TI.D.KINDS.normal.wind, gold: c.c.root.getObjectByProperty('isSkinnedMesh', true).material.metalness } })
  expect(r.k === 'senju' && r.arms === 12 && r.wind < r.normal && r.gold > 0.5, r); return r
})
await t('大統領: ボディガードが「すぐ渡せよ？」→ 1回で渡すと閉店（シャッター・明細のハンコも閉店）', async () => {
  const r = await ev(p, () => { TI.dbg.skipTo(11); TI.dbg.step(160); const b = [...document.querySelectorAll('#fx .sb.guard')].map(e => e.textContent).join('|'); const boss = document.querySelector('#vignette').classList.contains('boss'); TI.dbg.give(); TI.dbg.step(60 * 3); const shutter = document.querySelector('#shutter').style.height; TI.dbg.step(60 * 5); return { b, boss, closed: TI.S.closed, shutter, mode: TI.S.mode } })
  await p.waitForFunction(() => TI.S.mode === 'result', null, { timeout: 5000 }).catch(() => {})
  const r2 = await ev(p, () => ({ mode: TI.S.mode, stamp: TI.S.result && TI.S.result.rank.st.ja, ded: TI.S.result && TI.S.result.slip.ded.map(d => d.label + d.note + d.yen) }))
  expect(/すぐ渡せよ/.test(r.b) && r.boss && r.closed && r.shutter === '100%' && r2.mode === 'result' && r2.stamp === '閉店' && r2.ded.some(d => /閉店30000/.test(d)), { r, r2 }); return r2
})
await t('大統領: 3回以上遊んでから渡すと大統領チップ。ガードの脅しは回数で変わる', async () => {
  const r = await ev(p, () => { TI.dbg.start(2); TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.skipTo(11); TI.dbg.step(160); const g = []; for (let k = 0; k < 4; k++) { TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30); g.push([...document.querySelectorAll('#fx .sb.guard')].map(e => e.textContent).join('')) } TI.dbg.give(); TI.dbg.step(30); return { g, pres: TI.S.money.pres, closed: TI.S.closed } })
  expect(r.pres === 5000 && !r.closed && new Set(r.g).size >= 3, r); return r
})
await t('大統領: 遊びすぎると国際問題', async () => {
  const r = await ev(p, () => { TI.dbg.start(2); TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.skipTo(11); TI.dbg.step(160); for (let k = 0; k < 8 && TI.CUR.st === 'ready'; k++) { TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30) } TI.dbg.step(60 * 6); return { inc: TI.S.incident, closed: TI.S.closed, mode: TI.S.mode } })
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
await t('自動プレイ: 上手い人（手が来たら0.2〜0.3秒で引っ込め、限界の合図で渡す）', async () => { const r = D.skill = await day({ rt: [12, 18], give: 'skill' }, 7); expect(r.stamp === '看板職人' && r.m.stolen <= 1 && r.m.broke === 0, r); return r })
await t('自動プレイ: すぐ渡す人は大統領で閉店', async () => { const r = D.quick = await day({ give: 'quick' }, 7); expect(r.stamp === '閉店' && r.net < 0, r); return r })
await t('自動プレイ: 遊びすぎる人は泣かせまくってクビ', async () => { const r = D.greedy = await day({ rt: [12, 18], give: 'greedy' }, 7); expect(r.stamp === 'クビ' && r.m.broke >= 8, r); return r })
await t('自動プレイ: 何もしない通しは最低のハンコ（クビ）', async () => { const r = D.nothing = await day({ nothing: true }, 7); expect(r.stamp === 'クビ' && r.m.teases === 0, r); return r })
await t('手取りが 上手い > ふつう > 遊びすぎ・何もしない・すぐ渡す で分かれる', async () => { const avg = D.avg = await day({ rt: [12, 30], give: 'random' }, 8); const ok = D.skill.net > avg.net && avg.net > D.greedy.net && D.skill.net - D.greedy.net > 15000; expect(ok, { skill: D.skill.net, avg: avg.net, greedy: D.greedy.net, nothing: D.nothing.net, quick: D.quick.net }); return { skill: D.skill.net, avg: avg.net, greedy: D.greedy.net, nothing: D.nothing.net, quick: D.quick.net } })
await t('画面タップでも 差し出す⇔引っ込める', async () => { const r = await ev(p, () => { TI.dbg.start(3); TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.step(150); const c = document.querySelector('#gl'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); TI.dbg.step(20); const a = TI.S.want; c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); TI.dbg.step(5); return [a, TI.S.want] }); expect(r[0] === 1 && r[1] === 0, r); return r })
await t('キーボード: ↑で差し出す・↓で引っ込める・Spaceで渡す', async () => { await p.keyboard.press('ArrowUp'); const a = await ev(p, () => { TI.dbg.step(5); return TI.S.want }); await p.keyboard.press('ArrowDown'); const b = await ev(p, () => { TI.dbg.step(5); return TI.S.want }); await p.keyboard.press('Space'); const c = await ev(p, () => { TI.dbg.step(30); return TI.dbg.cust().done }); const dbg = await ev(p, () => ({ giving: TI.S.giving, cust: TI.dbg.cust(), focus: document.activeElement.id, mode: TI.S.mode })); expect(a === 1 && b === 0 && c === 'given', [a, b, c, dbg]); return [a, b, c] })
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
  await q.evaluate(() => { TI.dbg.pause(true); TI.dbg.step(150); TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(10) })
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await t(`チュートリアルの案内とボタンが重ならない ${name}`, async () => { const r = await q.evaluate(() => { const a = document.querySelector('#hint').getBoundingClientRect(), o = []; if (document.querySelector('#hint').hidden) return ['hidden']; for (const s of ['#bOffer', '#bPull', '#bGive', '#corner']) { const b = document.querySelector(s).getBoundingClientRect(); if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) o.push(s) } return o }); expect(!r.length, r.join()) })
  await q.evaluate(() => { TI.S.tut = -1; TI.dbg.skipTo(11); TI.dbg.step(170); TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(20) })
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
await t('WebKit: タップで出勤→かわす→渡す→明細まで', async () => {
  await wp.tap('#bStart'); await wp.waitForTimeout(200)
  const r = await wp.evaluate(() => { TI.dbg.pause(true); TI.S.tut = -1; TI.dbg.step(150); TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.resolve(); TI.dbg.step(30); TI.dbg.give(); TI.dbg.step(30); const c = TI.dbg.cust(); TI.dbg.end(); TI.dbg.step(200); return c })
  await wp.waitForFunction(() => TI.S.mode === 'result', null, { timeout: 5000 }).catch(() => {})
  const m = await wp.evaluate(() => TI.S.mode)
  expect(r.done === 'given' && r.teases === 1 && m === 'result', { r, m }); return m
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
