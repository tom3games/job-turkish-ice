// SNS用サムネ og.png（1200x630）。node og.mjs
// 大統領が手を伸ばした瞬間にアイスを上へ逃がす。後ろのボディガードが「すぐ渡せよ？」。右にタイトルと一言
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5508' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' }); await muteContext(ctx)
const p = await ctx.newPage(); p.on('pageerror', e => console.log(e.message))
await p.goto('http://localhost:5508/'); await p.waitForFunction(() => window.__tiReady && TI.charsReady, null, { timeout: 15000 })
await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => {
  TI.dbg.start(5); TI.dbg.pause(true); TI.S.tut = -1
  TI.dbg.skipTo(11); TI.dbg.step(170)
  for (let k = 0; k < 2; k++) { TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(3); TI.dbg.pull(); TI.dbg.step(60) }
  TI.dbg.offer(); TI.dbg.step(20); TI.dbg.reachNow(); TI.dbg.step(1); while (TI.CUR.ph === 'wind') TI.dbg.step(1); TI.dbg.step(Math.max(0, Math.round(TI.CUR.pdur * 60) - 6)); TI.dbg.pull(); TI.dbg.step(3)
  TI.S.camO = [[0.3, 1.62, -2.2], [-0.62, 1.42, 1.0]]; TI.dbg.step(1); TI.P.c.g.visible = false
  document.querySelectorAll('#fx > *').forEach(e => e.remove())
})
await p.addStyleTag({ content: `#corner,.hudTop,.hint,#finger,#loading,#ctl{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(43,20,22,0),rgba(43,20,22,.94) 26%);z-index:30}` })
await p.evaluate(() => {
  const V = TI.P.tip.constructor
  const ono = (t, x, y, size, rot, col) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:20;font-family:'Dela Gothic One';font-size:${size}px;color:${col};-webkit-text-stroke:4px #1d1a16;paint-order:stroke fill;text-shadow:0 6px 0 #1d1a16;transform:rotate(${rot}deg);white-space:nowrap`; document.body.appendChild(d) }
  const bub = (t, x, y, size, bg = '#fff', col = '#1d1a16', bd = '#1d1a16') => { const d = document.createElement('div'); d.innerHTML = t; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:21;background:${bg};color:${col};border:4px solid ${bd};border-radius:18px;padding:8px 16px;font-family:'Zen Maru Gothic';font-weight:900;font-size:${size}px;line-height:1.3;white-space:nowrap`; document.body.appendChild(d) }
  const tip = TI.toScreen(TI.P.tip.clone())
  ono('スカッ', Math.max(20, tip.x - 40), Math.max(20, tip.y + 30), 56, -10, '#ff9fb6')
  const g = TI.CUR.guards, hp = g.map(x => { const v = new V(); x.head.getWorldPosition(v); return TI.toScreen(v) })
  const L = hp[0].x < hp[1].x ? 0 : 1
  bub('すぐ渡せよ？', Math.max(16, hp[L].x - 110), Math.max(16, hp[L].y - 150), 34, '#111', '#fff', '#fff')
  const ph = new V(); TI.CUR.c.head.getWorldPosition(ph); const pp = TI.toScreen(ph)
  bub('ハッハッハ', Math.min(560, pp.x - 60), Math.max(16, pp.y - 210), 28, '#ffe08a')
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:20px;top:0;bottom:0;width:520px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Zen Maru Gothic';font-weight:900;font-size:28px;letter-spacing:.08em;color:#1d1a16;background:#e9b44c;padding:6px 16px 5px;border:4px solid #1d1a16;transform:rotate(-3deg);box-shadow:4px 4px 0 #1d1a16">1日だけ職場体験 #3</div>
  <div style="font-family:'Zen Maru Gothic';font-weight:900;font-size:80px;line-height:1.05;white-space:nowrap;-webkit-text-stroke:4px #1d1a16;paint-order:stroke fill;text-shadow:0 7px 0 #1d1a16">トルコ<span style="font-family:'Dela Gothic One';font-weight:400;color:#ff9fb6">アイス屋</span></div>
  <div style="font-weight:900;font-size:30px;line-height:1.55;font-family:'Zen Maru Gothic'">差し出して、<span style="color:#ff9fb6">引っ込める</span>。<br>遊びすぎると泣かれる。<br>大統領に<span style="color:#ff6b5e">1回で渡したら閉店</span>。</div>`
  document.body.appendChild(d)
  TI.dbg.render()
})
await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
