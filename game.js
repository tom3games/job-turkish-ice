// 1日だけ職場体験 #3 トルコアイス屋 / ONE-DAY JOB: TURKISH ICE CREAM
// 屋台の内側（店員の肩越し）から客を見る。差し出す→客が手を伸ばす→引っ込める、でからかうたびにチップ。
// 遊びすぎると泣く/キレる（顔のマークと一言で見せる。ゲージは置かない）。最後は大統領とボディガード。1回で渡すと閉店。
// 時間は固定60Hz（performance.now で数える）
import * as THREE from 'three'
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js'
import { clone as skClone } from './vendor/jsm/utils/SkeletonUtils.js'
import { setupLook, castShadow, addBlobShadow, surfaceTex, createFx, look } from './look.js'
import { drawPayslip, totals } from './payslip.js'

const D = window.TI_DATA
const $ = s => document.querySelector(s)
const STEP = 1 / 60
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k) }
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const store = { get(k) { try { return localStorage.getItem('ti.' + k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem('ti.' + k, v) } catch (e) {} } }
const CH = 1.5

// ---------- 状態
const S = {
  lang: store.get('lang') || ((navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  mode: 'title', time: 0, rand: Math.random, dbgPause: false,
  t: 0, ci: 0, spot: 'C', spotT: 1, moves: 0, tutIrk: 0, giving: 0, spin: 0, coneOn: true, coneT: 1,
  money: { tips: 0, teases: 0, close: 0, just: 0, stolen: 0, broke: 0, pres: 0, crowd: 0, crowdMax: 0, pen: { sign: 0, mom: 0, review: 0, heal: 0, clean: 0 } }, closed: false, incident: false,
  tut: store.get('tut') === '1' ? -1 : 0, tutMsg: '', resT: 0, result: null, photo: null, photoScore: 0,
  endT: 0, ended: false, bossT: 0,
}
const TT = () => D.T[S.lang]
const R = () => S.rand()
const pick = a => a[Math.floor(R() * a.length) % a.length]

// ---------- 音（WebAudio だけ）
const Snd = {
  ctx: null, muted: store.get('mute') === '1', next: 0, step: 0, track: null, want: null, switchAt: 0, played: {},
  TEMPO: { title: 96, play: 118, boss: 100, end: 84 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      const c = this.ctx = new AC()
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(c.destination)
      this.bgm = c.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; store.set('mute', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.8 },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(Math.max(0.0002, vol), t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.02)
  },
  voice(f, t0, dur, vol, formant = 900, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    bp.type = 'bandpass'; bp.frequency.value = formant; bp.Q.value = 3
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.3, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  // ウード風のはじく音、ダルブッカ（ドゥム＝低い、テク＝高い）
  oud(n, t, dur = 0.3, vol = 0.08) { const f = this.mtof(n); this.tone(f, t, dur, 'triangle', vol, this.bgm); this.tone(f * 2.003, t, dur * 0.35, 'sawtooth', vol * 0.16, this.bgm); this.tone(f * 0.998, t, dur * 0.8, 'square', vol * 0.08, this.bgm) },
  doum(t, v = 0.3) { this.tone(95, t, 0.24, 'sine', v, this.bgm, 52); this.noise(t, 0.05, v * 0.2, 400, 'lowpass', this.bgm) },
  tek(t, v = 0.08) { this.noise(t, 0.045, v, 3800, 'highpass', this.bgm); this.tone(820, t, 0.03, 'square', v * 0.25, this.bgm) },
  // ヒジャーズ（レ ミ♭ ファ# ソ ラ シ♭ ド）
  p_title(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s === 0 || s === 8) this.doum(t, 0.22); if (s === 4 || s === 12) this.tek(t, 0.06); if (s === 14) this.tek(t, 0.03)
    const m = [[74, -1, 72, -1, 70, -1, 69, -1, 70, 69, 66, -1, 67, -1, -1, -1], [66, -1, 67, -1, 69, -1, 70, -1, 69, -1, 67, 66, 63, -1, 62, -1],
      [62, -1, 63, -1, 66, -1, 67, -1, 69, -1, 70, -1, 72, -1, 74, -1], [72, 70, 69, -1, 67, -1, 66, -1, 63, -1, 62, -1, -1, -1, -1, -1]][bar]
    if (m[s] > 0) this.oud(m[s], t, 0.4, 0.075)
    if (s % 8 === 0) this.oud([38, 45, 38, 45][bar] + (s ? 7 : 0), t, 0.7, 0.1)
  },
  p_play(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    // マクスーム: ドゥム テク - テク ドゥム - テク -
    if (s === 0 || s === 8) this.doum(t, 0.26); if (s === 2 || s === 6 || s === 12) this.tek(t, 0.07); if (s % 2 === 1) this.tek(t, 0.015)
    const m = [[62, 63, 66, 67, 69, -1, 67, 66, 69, -1, 70, 69, 67, -1, 66, -1], [67, 69, 70, 72, 74, -1, 72, 70, 69, -1, 67, -1, 66, -1, -1, -1],
      [74, -1, 72, 70, 69, 70, 69, 67, 66, -1, 67, 66, 63, -1, 62, -1], [62, -1, 66, -1, 69, -1, 66, -1, 63, 62, 63, 66, 62, -1, -1, -1]][bar]
    if (m[s] > 0) this.oud(m[s], t, 0.22, 0.065)
    if (s % 4 === 0) this.oud([38, 38, 45, 38][bar] + (s === 8 ? 7 : 0), t, 0.3, 0.09)
  },
  p_boss(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if ([0, 3, 6, 8, 11, 14].includes(s)) this.tone(this.mtof([38, 38, 37, 38][bar]), t, 0.18, 'sawtooth', 0.07, this.bgm)
    if (s === 4 || s === 12) { this.noise(t, 0.12, 0.09, 1800, 'bandpass', this.bgm, 1.2); this.tone(180, t, 0.08, 'triangle', 0.05, this.bgm) }
    if (s === 0) this.doum(t, 0.3)
    if (s === 0 && bar % 2 === 0) for (const n of [62, 65, 69]) this.tone(this.mtof(n), t, 0.5, 'sawtooth', 0.025, this.bgm)
    if (s === 10 && bar === 3) for (const n of [63, 66, 70]) this.tone(this.mtof(n), t, 0.4, 'sawtooth', 0.025, this.bgm)
  },
  p_end(i, t) {
    const s = i % 16
    if (s === 0) this.doum(t, 0.18)
    const m = [74, -1, -1, 72, -1, -1, 70, -1, 69, -1, -1, -1, 66, -1, 62, -1]
    if (m[s] > 0 && Math.floor(i / 16) % 2 === 0) this.oud(m[s], t, 0.7, 0.07)
  },
  sfx(n, o = {}) {
    if (!this.ctx) return; this.mark(n)
    const t = this.ctx.currentTime + 0.01
    switch (n) {
      case 'tap': this.tone(900, t, 0.05, 'square', 0.06); break
      case 'offer': this.noise(t, 0.16, 0.08, 900, 'bandpass', null, 1.5); this.tone(380, t, 0.14, 'sine', 0.06, null, 640); break
      case 'pull': this.noise(t, 0.12, 0.1, 2400, 'bandpass', null, 1.5); this.tone(700, t, 0.12, 'sine', 0.07, null, 1500); break
      case 'bell': for (const [f, d, v] of [[1760, 0.9, 0.12], [2637, 0.6, 0.06], [3520, 0.35, 0.04], [4400, 0.2, 0.03]]) this.tone(f * (o.p || 1), t, d, 'sine', v); break
      case 'wind': this.tone(520, t, 0.08, 'triangle', 0.035, null, 780); break
      case 'whiff': this.noise(t, 0.14, 0.12, 1600, 'highpass'); this.tone(320, t, 0.14, 'square', 0.03, null, 140); break
      case 'close': for (let k = 0; k < 4; k++) this.tone(1568 * Math.pow(1.26, k), t + k * 0.05, 0.25, 'sine', 0.06); break
      case 'coin': this.tone(1318, t, 0.08, 'triangle', 0.13); this.tone(1760, t + 0.08, 0.25, 'triangle', 0.13); break
      case 'grab': this.noise(t, 0.08, 0.3, 700, 'lowpass'); this.tone(140, t, 0.1, 'square', 0.09, null, 80); break
      case 'laugh': { const p = o.p || 1; for (let k = 0; k < 3; k++) this.voice(260 * p + k * 10, t + k * 0.13, 0.1, 0.1, 1100); break }
      case 'cry': { const p = o.p || 1; for (let k = 0; k < 5; k++) this.voice((520 + (k % 2) * 60) * p, t + k * 0.22, 0.24, 0.1, 1500, (470 + (k % 2) * 50) * p); break }
      case 'rage': this.voice(110, t, 0.5, 0.18, 600, 85); this.noise(t, 0.4, 0.12, 500, 'lowpass'); break
      case 'bang': this.noise(t, 0.12, 0.45, 260, 'lowpass'); this.tone(70, t, 0.18, 'sine', 0.35, null, 40); break
      case 'gong': this.tone(110, t, 2.2, 'sine', 0.2); this.tone(166, t, 1.8, 'sine', 0.1); this.tone(247, t, 1.2, 'sine', 0.05); break
      case 'fanfare': { const s = [[62, 0], [62, 0.12], [62, 0.24], [69, 0.36]]; for (const [n2, d] of s) { this.tone(this.mtof(n2), t + d, d === 0.36 ? 0.7 : 0.1, 'sawtooth', 0.07); this.tone(this.mtof(n2 + 4), t + d, d === 0.36 ? 0.7 : 0.1, 'sawtooth', 0.04) } break }
      case 'shutter': for (let k = 0; k < 14; k++) this.noise(t + k * 0.05, 0.06, 0.18, 1200 - k * 50, 'bandpass', null, 2); this.noise(t + 0.75, 0.5, 0.5, 300, 'lowpass'); this.tone(60, t + 0.75, 0.5, 'sine', 0.4, null, 30); break
      case 'guard': this.voice(95, t, 0.4, 0.17, 520, 80); break
      case 'boss': this.voice(130, t, 0.32, 0.14, 700, 100); break
      case 'end': this.tone(587, t, 0.15, 'square', 0.1); this.tone(740, t + 0.15, 0.15, 'square', 0.1); this.tone(880, t + 0.3, 0.4, 'square', 0.1); break
      case 'stamp': this.noise(t, 0.15, 0.5, 300, 'lowpass'); this.tone(80, t, 0.2, 'sine', 0.4); break
      case 'pop': this.tone(600, t, 0.08, 'sine', 0.08, null, 1200); break
      case 'ooh': { const n = Math.min(6, 2 + (o.n || 1)); for (let k = 0; k < n; k++) this.voice(180 + k * 37, t + k * 0.03, 0.6, 0.05, 700 + k * 90, 260 + k * 30); break }
      case 'clap': { const n = 6 + Math.min(18, (o.n || 1) * 2); for (let k = 0; k < n; k++) this.noise(t + Math.random() * 0.7, 0.03, 0.08, 1800 + Math.random() * 1500, 'bandpass', null, 1.2); break }
      case 'boo': for (let k = 0; k < 4; k++) this.voice(120 + k * 15, t + k * 0.05, 0.7, 0.05, 450, 95 + k * 10); break
      case 'hup': this.voice(300, t, 0.12, 0.12, 1000, 360); break
      case 'kick': this.noise(t, 0.15, 0.5, 220, 'lowpass'); this.tone(65, t, 0.2, 'sine', 0.4, null, 35); for (let k = 0; k < 5; k++) this.noise(t + 0.35 + k * 0.07, 0.08, 0.2, 2500 - k * 300, 'bandpass', null, 3); break
      case 'slap': this.noise(t, 0.09, 0.6, 2600, 'highpass'); this.tone(900, t, 0.06, 'square', 0.12, null, 300); this.noise(t + 0.08, 0.5, 0.15, 800, 'bandpass', null, 1); break
      case 'collar': this.noise(t, 0.18, 0.25, 1200, 'bandpass', null, 2); this.voice(140, t + 0.05, 0.4, 0.15, 600, 110); break
    }
  },
}

// ---------- 描画の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.6 : 2))
const scene = new THREE.Scene()
const SKY0 = new THREE.Color(0x9fd0f0), SKY1 = new THREE.Color(0xf09a6a)
scene.background = SKY0.clone()
scene.fog = new THREE.Fog(SKY0.getHex(), 14, 34)
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 80)
const lk = setupLook(renderer, scene, { env: true, envIntensity: 0.5, exposure: 1.05, sun: 2.1, sunPos: [-4, 9, 6], hemi: 0.8, sky: 0xdff0ff, ground: 0x6a5040, sunColor: 0xfff0d8 })
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
{ const sun = lk.sun; sun.castShadow = true; const sz = isTouch ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz); const c = sun.shadow.camera; c.left = -6; c.right = 6; c.top = 6; c.bottom = -6; c.near = 1; c.far = 30; c.updateProjectionMatrix(); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03 }
const fx = createFx(scene, camera, renderer)
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...o })
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m }
function canvasTex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  if (o.rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...o.rep) }
  return t
}
const FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif'

// ---------- 寸法（世界の単位）
// 屋台のカウンターは x 方向。店員は z の負（内側）、客は z の正（通り側）
const CTR_Y = 0.78, CTR_Z0 = -0.45, CTR_Z1 = 0.15
const VEND = new THREE.Vector3(0.34, 0, -1.0)       // 店員の立ち位置
const PIV = new THREE.Vector3(0.3, 0.98, -0.72)     // 棒の握り
const SL = 1.18                                       // 棒の長さ
const CUST_Z = 0.86
const _qa = new THREE.Quaternion(), _qe = new THREE.Euler(), _pq = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0)
// 腕の骨をアニメの姿勢から目標の向きへ寄せる（Kenney の腕は T ポーズで横向き。y で前へ、z で上下）
function poseArm(bone, k, x, y, z) { if (!bone || k <= 0.001) return; _qa.setFromEuler(_qe.set(x, y, z)); bone.quaternion.slerp(_qa, clamp(k, 0, 1)) }                                      // 腕を前へ出す回転の向き（Kenney の骨）
const QUEUE = [[0.95, 2.1], [1.65, 3.0], [2.4, 3.9]]

// ---------- 街と屋台
const world = new THREE.Group(); scene.add(world)
const lanterns = [], swayers = []
{
  // 石畳
  const gt = surfaceTex({ w: 512, h: 512, base: '#b9ab98', noise: 0.06, grime: 0.1, repeat: [12, 10], draw: (x, w, h) => { x.strokeStyle = 'rgba(70,55,40,.35)'; x.lineWidth = 3; const n = 4; for (let r = 0; r < n; r++) { x.beginPath(); x.moveTo(0, r * h / n); x.lineTo(w, r * h / n); x.stroke(); for (let c = 0; c < n; c++) { const o = (r % 2) * w / n / 2; x.beginPath(); x.moveTo(o + c * w / n, r * h / n); x.lineTo(o + c * w / n, (r + 1) * h / n); x.stroke() } } } })
  const ground = mesh(new THREE.PlaneGeometry(60, 50), std(0xffffff, { map: gt, roughness: 0.85 }), 0, 0, 12, world); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true
  // 向かいの屋台と店（看板は一般名だけ）
  const fronts = [['たこ焼', '#d23b2a'], ['わたあめ', '#e889b0'], ['金魚すくい', '#2f6fb3'], ['ケバブ', '#c87a1a'], ['射的', '#3a7a3a'], ['かき氷', '#3aa0c8'], ['焼きそば', '#b5281c'], ['りんご飴', '#c8102e']]
  for (let i = 0; i < fronts.length; i++) {
    const [name, col] = fronts[i], x0 = -10.5 + i * 3.0, z0 = 8.2 + (i % 2) * 0.6
    const g = new THREE.Group(); g.position.set(x0, 0, z0); world.add(g)
    mesh(new THREE.BoxGeometry(2.6, 1.0, 0.9), std(0x7a5236, { roughness: 0.6 }), 0, 0.5, 0, g)
    for (const sx of [-1.2, 1.2]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), std(0x5a3a22), sx, 1.2, 0.4, g)
    const st = canvasTex(256, 64, (x, w, h) => { for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#fff' : col; x.fillRect(k * w / 8, 0, w / 8, h) } })
    const roof = mesh(new THREE.BoxGeometry(2.9, 0.06, 1.3), std(0xffffff, { map: st, roughness: 0.8 }), 0, 2.35, 0.1, g); roof.rotation.x = -0.18
    const sg = canvasTex(512, 128, (x, w, h) => { x.fillStyle = col; x.fillRect(0, 0, w, h); x.fillStyle = '#fff8e8'; x.font = `900 84px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, w / 2, h / 2 + 4) })
    mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: sg, roughness: 0.8 }), 0, 1.75, -0.47, g).rotation.y = Math.PI
    // 店の奥の建物
    const bh = 4 + (i % 3) * 1.2
    mesh(new THREE.BoxGeometry(3.0, bh, 2.0), std([0xe8dcc6, 0xd9c7a8, 0xc9b49a, 0xe2d2bb][i % 4], { roughness: 0.9 }), 0, bh / 2, 1.8, g)
    for (let k = 0; k < 3; k++) mesh(new THREE.PlaneGeometry(0.6, 0.7), std(0x4a5a6a, { roughness: 0.2, metalness: 0.3 }), -0.9 + k * 0.9, bh - 1.1, 0.79, g).rotation.y = Math.PI
    castShadow(g)
  }
  // 遠くの山なみ
  const hills = mesh(new THREE.PlaneGeometry(80, 10), new THREE.MeshBasicMaterial({ color: 0x8fb0c8, fog: true }), 0, 4, 30, world); hills.rotation.y = Math.PI
  // 提灯の綱（通りの上）
  const lanMat = new THREE.MeshStandardMaterial({ color: 0xf6e7c0, emissive: 0xffb050, emissiveIntensity: 0.35, roughness: 0.7 })
  const lanRed = new THREE.MeshStandardMaterial({ color: 0xd8382a, emissive: 0xff4a2a, emissiveIntensity: 0.4, roughness: 0.6 })
  for (let row = 0; row < 2; row++) {
    const z = 3.4 + row * 3.2, y = 3.3 + row * 0.3
    mesh(new THREE.CylinderGeometry(0.01, 0.01, 22, 4), std(0x222222), 0, y + 0.2, z, world).rotation.z = Math.PI / 2
    for (let k = 0; k < 14; k++) {
      const g = new THREE.Group(); g.position.set(-9 + k * 1.4, y, z); world.add(g)
      const b = mesh(new THREE.SphereGeometry(0.17, 14, 10), k % 2 ? lanRed : lanMat, 0, 0, 0, g); b.scale.y = 1.3
      lanterns.push(g)
    }
  }
}
// 屋台（自分の店）
const stall = new THREE.Group(); scene.add(stall)
const bell = new THREE.Group()
const iceMounds = []
let shutterMesh = null
{
  const wood = std(0x8a5a32, { roughness: 0.5 }), woodD = std(0x5a3a1e, { roughness: 0.5 })
  const ctt = surfaceTex({ w: 256, h: 256, base: '#e9e2d4', noise: 0.03, grime: 0.05, repeat: [3, 1] })
  // カウンター（天板とトルコっぽい模様の前板）
  mesh(new THREE.BoxGeometry(2.8, 0.08, CTR_Z1 - CTR_Z0 + 0.1), std(0xffffff, { map: ctt, roughness: 0.3 }), 0, CTR_Y, (CTR_Z0 + CTR_Z1) / 2, stall)
  const tile = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#1f4f8a'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      const cx = i * 64 + 32, cy = j * 64 + 32
      x.fillStyle = '#f4ecd8'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? 14 : 28; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) } x.closePath(); x.fill()
      x.fillStyle = '#c8102e'; x.beginPath(); x.arc(cx, cy, 8, 0, 7); x.fill()
      x.fillStyle = '#2f8a8a'; x.fillRect(i * 64 - 3, j * 64 + 28, 6, 8)
    }
  })
  const front = mesh(new THREE.BoxGeometry(2.8, CTR_Y, 0.06), std(0xffffff, { map: tile, roughness: 0.4 }), 0, CTR_Y / 2, CTR_Z1 + 0.02, stall)
  mesh(new THREE.BoxGeometry(2.8, CTR_Y - 0.05, 0.06), woodD, 0, CTR_Y / 2, CTR_Z0 - 0.02, stall)
  for (const sx of [-1.38, 1.38]) mesh(new THREE.BoxGeometry(0.06, CTR_Y, 0.66), woodD, sx, CTR_Y / 2, (CTR_Z0 + CTR_Z1) / 2, stall)
  // 柱
  for (const [sx, sz] of [[-1.42, CTR_Z1], [1.42, CTR_Z1], [-1.42, -1.8], [1.42, -1.8]]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), std(0xd8c39a, { roughness: 0.4, metalness: 0.3 }), sx, 1.35, sz, stall)
  // 日よけ（赤白のしま）。下から見える面にもしま
  const awn = canvasTex(512, 128, (x, w, h) => { for (let k = 0; k < 12; k++) { x.fillStyle = k % 2 ? '#fbf3e4' : '#c8102e'; x.fillRect(k * w / 12, 0, w / 12, h) } })
  const roof = mesh(new THREE.BoxGeometry(3.2, 0.05, 2.5), std(0xffffff, { map: awn, roughness: 0.85 }), 0, 2.62, -0.75, stall); roof.rotation.x = 0.16
  // 垂れ幕（波形）
  const val = canvasTex(512, 96, (x, w, h) => {
    for (let k = 0; k < 12; k++) { x.fillStyle = k % 2 ? '#fbf3e4' : '#c8102e'; x.fillRect(k * w / 12, 0, w / 12, h * 0.6) }
    x.fillStyle = '#e9b44c'; x.fillRect(0, h * 0.6 - 6, w, 6)
    x.globalCompositeOperation = 'destination-out'; for (let k = 0; k <= 12; k++) { x.beginPath(); x.arc(k * w / 12, h, h * 0.42, 0, 7); x.fill() }
  })
  const vm = new THREE.MeshStandardMaterial({ map: val, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 })
  mesh(new THREE.PlaneGeometry(3.2, 0.42), vm, 0, 2.62, 0.45, stall)
  // 看板（通り向き）
  const sgn = canvasTex(512, 160, (x, w, h) => { x.fillStyle = '#c8102e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#e9b44c'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#fff'; x.font = `900 76px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('トルコアイス', w / 2, h / 2 + 4) })
  const sgm = mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshStandardMaterial({ map: sgn, roughness: 0.6 }), 0, 3.05, 0.42, stall); sgm.visible = false
  // アイスのケース（左）。ふた付きの丸い穴に色ちがいの山
  const caseM = std(0xd0d6dc, { roughness: 0.25, metalness: 0.7 })
  const cg = new THREE.Group(); cg.position.set(-0.86, CTR_Y + 0.04, -0.2); stall.add(cg)
  mesh(new THREE.BoxGeometry(1.0, 0.16, 0.55), caseM, 0, 0.08, 0, cg)
  const iceCols = [0xfff6e6, 0xff9fb6, 0x9ccf6a, 0x6b3a1e]
  for (let k = 0; k < 4; k++) {
    const x0 = -0.36 + k * 0.24
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), std(0x9aa3ab, { metalness: 0.8, roughness: 0.3 }), x0, 0.165, 0, cg)
    const mnd = mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(iceCols[k], { roughness: 0.55 }), x0, 0.16, 0, cg); mnd.scale.y = 1.1
    iceMounds.push(mnd)
  }
  // 円すいのコーン立て（右）
  const cone = new THREE.ConeGeometry(0.045, 0.16, 12); cone.rotateX(Math.PI)
  const coneM = std(0xd9a35a, { roughness: 0.75 })
  for (let k = 0; k < 6; k++) mesh(cone, coneM, 0.95 + (k % 3) * 0.1, CTR_Y + 0.13, -0.2 + Math.floor(k / 3) * 0.11, stall)
  // 鐘（遊ぶたびに鳴らす）
  bell.position.set(1.1, 2.3, -0.1); stall.add(bell)
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4), std(0x222222), 0, 0.12, 0, bell)
  const bb = mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.16, 16, 1, true), std(0xd8a838, { metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }), 0, -0.07, 0, bell)
  mesh(new THREE.SphereGeometry(0.03, 8, 6), std(0x8a6a28, { metalness: 0.8, roughness: 0.3 }), 0, -0.16, 0, bell)
  // 吊るした飾り（トルコの目玉）
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group(); g.position.set(-1.1 + k * 0.28, 2.4, 0.25); stall.add(g)
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 4), std(0x222222), 0, -0.15, 0, g)
    const e = canvasTex(64, 64, (x, w) => { for (const [r, c] of [[30, '#1f4fb0'], [21, '#fff'], [14, '#7fc8f0'], [7, '#111']]) { x.fillStyle = c; x.beginPath(); x.arc(w / 2, w / 2, r, 0, 7); x.fill() } })
    const ev = mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshStandardMaterial({ map: e, side: THREE.DoubleSide, roughness: 0.3 }), 0, -0.36, 0, g)
    swayers.push(g)
  }
  // 中の棚
  mesh(new THREE.BoxGeometry(2.6, 0.9, 0.4), wood, 0, 0.45, -1.75, stall)
  castShadow(stall)
  // 閉店のシャッター（大統領の件）
  shutterMesh = new THREE.Group(); shutterMesh.visible = false; stall.add(shutterMesh)
  const sh = canvasTex(256, 256, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#8e959b' : '#b4bac0'; x.fillRect(0, i * h / 16, w, h / 16) } x.fillStyle = '#c8102e'; x.font = `900 64px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.save(); x.translate(w / 2, h / 2); x.rotate(-0.08); x.fillText('閉店', 0, 0); x.restore() })
  mesh(new THREE.PlaneGeometry(2.9, 2.5), new THREE.MeshStandardMaterial({ map: sh, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }), 0, 1.25, 0.5, shutterMesh)
}

// ---------- 人（Kenney Mini Characters, CC0）
const MODELS = {}
let charsReady = false
const loader = new GLTFLoader()
const CHAR_FILES = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f']
function loadChars() { return Promise.all(CHAR_FILES.map(n => new Promise(res => loader.load(`chars/character-${n}.glb`, g => { MODELS[n] = g; res() }, undefined, () => res())))).then(() => { charsReady = true }) }
// 服の色を塗り替えた材質（黒服＝ボディガード、金＝千手観音）。colormap の区画で肌と白を見分ける
const _recol = {}
function recolorMat(src, mode) {
  const key = mode + src.uuid; if (_recol[key]) return _recol[key]
  const m = src.clone(), img = src.map && src.map.image
  if (img) {
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, w, h)
    // 上の区画が黒なら上下そのまま。黒でなければ上下が反転している
    const topBlack = d.data[(Math.floor(h * 0.05) * w + Math.floor(w * 0.5)) * 4] < 10
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4, u = px / w, v = topBlack ? py / h : 1 - py / h
      const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2], lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255
      if (mode === 'gold') { d.data[i] = 120 + lum * 135; d.data[i + 1] = 80 + lum * 130; d.data[i + 2] = 20 + lum * 60; continue }
      const skin = (v >= 0.5 && v < 0.75 && u < 0.125) || (v >= 0.75 && u >= 0.625)
      const white = v >= 0.75 && u >= 0.5 && u < 0.625
      if (!skin && !white) { d.data[i] = 26 + lum * 18; d.data[i + 1] = 28 + lum * 18; d.data[i + 2] = 34 + lum * 22 }
    }
    x.putImageData(d, 0, 0)
    const t = new THREE.CanvasTexture(c); t.flipY = src.map.flipY; t.colorSpace = src.map.colorSpace; t.magFilter = src.map.magFilter; t.minFilter = src.map.minFilter
    m.map = t
  }
  if (mode === 'gold') { m.metalness = 0.65; m.roughness = 0.32; m.emissive = new THREE.Color(0x3a2400) }
  return (_recol[key] = m)
}
const _tex = {}
function emoTex(kind) {
  return _tex[kind] || (_tex[kind] = canvasTex(128, 128, (x, w) => {
    x.lineCap = 'round'; x.lineJoin = 'round'
    if (kind === 'anger') { x.strokeStyle = '#e63946'; x.lineWidth = 12; for (const [a, b, c2, d] of [[28, 44, 52, 52], [44, 28, 52, 52], [100, 44, 76, 52], [84, 28, 76, 52], [28, 84, 52, 76], [44, 100, 52, 76], [100, 84, 76, 76], [84, 100, 76, 76]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke() } }
    else if (kind === 'tear') { x.fillStyle = '#7fc8ff'; x.strokeStyle = '#1d4a7a'; x.lineWidth = 5; for (const [cx, cy, s] of [[40, 50, 1], [88, 64, 0.8], [62, 96, 0.6]]) { x.beginPath(); x.moveTo(cx, cy - 26 * s); x.quadraticCurveTo(cx + 20 * s, cy + 6 * s, cx, cy + 16 * s); x.quadraticCurveTo(cx - 20 * s, cy + 6 * s, cx, cy - 26 * s); x.fill(); x.stroke() } }
    else if (kind === 'sweat') { x.fillStyle = '#9edcff'; x.strokeStyle = '#1d4a7a'; x.lineWidth = 5; x.beginPath(); x.moveTo(64, 20); x.quadraticCurveTo(96, 72, 64, 96); x.quadraticCurveTo(32, 72, 64, 20); x.fill(); x.stroke() }
    else if (kind === 'note') { x.fillStyle = '#ffd166'; x.strokeStyle = '#1d1a16'; x.lineWidth = 5; x.beginPath(); x.ellipse(44, 92, 18, 13, -0.4, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.moveTo(60, 88); x.lineTo(60, 26); x.lineTo(96, 36); x.lineTo(96, 52); x.lineTo(60, 44); x.stroke(); x.fillRect(56, 26, 6, 64) }
    else if (kind === 'heart') { x.fillStyle = '#ff6b8a'; x.strokeStyle = '#1d1a16'; x.lineWidth = 6; x.beginPath(); x.moveTo(64, 104); x.bezierCurveTo(10, 66, 22, 18, 64, 44); x.bezierCurveTo(106, 18, 118, 66, 64, 104); x.fill(); x.stroke() }
    else if (kind === 'bang2') { x.fillStyle = '#ff5a4e'; x.strokeStyle = '#1d1a16'; x.lineWidth = 6; for (const ox of [-22, 22]) { x.beginPath(); x.moveTo(52 + ox, 14); x.lineTo(78 + ox, 14); x.lineTo(70 + ox, 82); x.lineTo(58 + ox, 82); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.arc(64 + ox, 104, 10, 0, 7); x.fill(); x.stroke() } }
    else if (kind === 'flash') { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,240,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128) }
    else if (kind === 'zzz') { x.fillStyle = '#fff'; x.strokeStyle = '#1d1a16'; x.lineWidth = 6; x.font = `900 52px ${FONT}`; x.strokeText('Z', 30, 96); x.fillText('Z', 30, 96); x.font = `900 36px ${FONT}`; x.strokeText('z', 74, 52); x.fillText('z', 74, 52) }
    else if (kind === 'bang') { x.fillStyle = '#ffd166'; x.strokeStyle = '#1d1a16'; x.lineWidth = 6; x.beginPath(); x.moveTo(52, 16); x.lineTo(78, 16); x.lineTo(70, 82); x.lineTo(58, 82); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.arc(64, 104, 10, 0, 7); x.fill(); x.stroke() }
  }))
}
function makeChar(name, o = {}) {
  const src = MODELS[name]; if (!src) return null
  const root = skClone(src.scene), g = new THREE.Group(); g.add(root)
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.material = o.recolor ? recolorMat(m.material, o.recolor) : m.material.clone(); if (!o.recolor) m.material.roughness = 0.75 } })
  const box = new THREE.Box3().setFromObject(root), hgt = box.max.y - box.min.y
  const h = o.h ?? CH
  g.scale.setScalar(h / hgt)
  const mixer = new THREE.AnimationMixer(root), acts = {}
  for (const c of src.animations) acts[c.name] = mixer.clipAction(c)
  const c = { g, root, mixer, acts, cur: null, h, head: root.getObjectByName('head'), armL: root.getObjectByName('arm-left'), armR: root.getObjectByName('arm-right'), torso: root.getObjectByName('torso'), name, bub: null }
  c.emo = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoTex('anger'), transparent: true, depthTest: false, toneMapped: false })); c.emo.scale.setScalar(0.32); c.emo.visible = false; c.emo.renderOrder = 9; scene.add(c.emo)
  play(c, o.anim ?? 'idle')
  return c
}
function freeChar(c) { if (!c) return; c.g.removeFromParent(); c.emo.removeFromParent(); if (c.grab) for (const gr of c.grab) { gr.hand.removeFromParent(); gr.rod.removeFromParent() } if (c.bub) { c.bub.remove(); c.bub = null } }
function play(c, name, fade = 0.2, speed = 1, once = false) {
  const a = c.acts[name]; if (!a) return
  a.timeScale = speed
  if (c.cur === name) return
  const prev = c.cur ? c.acts[c.cur] : null
  a.reset(); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true } else a.setLoop(THREE.LoopRepeat, Infinity)
  a.play(); if (prev) a.crossFadeFrom(prev, fade, false)
  c.cur = name
}
// 頭の骨に付ける（キャラの縮尺を打ち消して、背丈に比例した大きさにする）
function onHead(c, obj, x, y, z) {
  if (!c.head) { obj.position.set(x, c.h * 0.85 + y, z); c.g.add(obj); return obj }
  const s = (1 / c.g.scale.x) * (c.h / CH); obj.scale.multiplyScalar(s); obj.position.set(x * s, y * s, z * s); c.head.add(obj); return obj
}
function onTorso(c, obj, x, y, z) {
  const b = c.root; const s = (1 / c.g.scale.x) * (c.h / CH); obj.scale.multiplyScalar(s); obj.position.set(x * s, y * s, z * s); b.add(obj); return obj
}
const _hp = new THREE.Vector3(), _q = new THREE.Vector3(), _w = new THREE.Vector3(), _v2 = new THREE.Vector3()
function headPos(c, out) { if (c.head) c.head.getWorldPosition(out); else out.copy(c.g.position).setY(c.h); return out.add(_q.set(0, 0.55 * c.h / CH, 0)) }

// 小物
const M = {
  fez: std(0xc8102e, { roughness: 0.7 }), black: std(0x111111, { roughness: 0.3 }), shades: std(0x050505, { roughness: 0.1, metalness: 0.6 }),
  gold: std(0xf2c14e, { roughness: 0.3, metalness: 0.75, emissive: 0x4a3000 }), yellow: std(0xf6d23a, { roughness: 0.6 }), hair: std(0x2a1c14, { roughness: 0.25 }),
  sashR: std(0xc8102e, { roughness: 0.6 }), white: std(0xf4f0e6, { roughness: 0.7 }), cone: std(0xd9a35a, { roughness: 0.75 }),
}
function addFez(c) {
  const g = new THREE.Group()
  mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.28, 20), M.fez, 0, 0, 0, g)
  mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 4), M.black, 0.1, 0.08, 0, g).rotation.z = -0.7
  mesh(new THREE.SphereGeometry(0.04, 6, 5), M.black, 0.17, 0.0, 0, g)
  return onHead(c, g, 0, 0.84, -0.02)
}
function addShades(c) { const g = new THREE.Group(); for (const sx of [-0.15, 0.15]) mesh(new THREE.BoxGeometry(0.24, 0.13, 0.04), M.shades, sx, 0, 0, g); mesh(new THREE.BoxGeometry(0.66, 0.035, 0.03), M.shades, 0, 0.05, -0.01, g); return onHead(c, g, 0, 0.36, 0.37) }
function addPompadour(c) { const g = new THREE.Group(); const p = mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 14), M.hair, 0, 0, 0, g); p.rotation.x = Math.PI / 2 - 0.45; p.scale.x = 1.5; return onHead(c, g, 0, 0.74, 0.22) }
function addKidHat(c) { const g = new THREE.Group(); const d = mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.yellow, 0, 0, 0, g); d.scale.y = 0.6; mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.025, 22), M.yellow, 0, 0, 0.04, g); return onHead(c, g, 0, 0.66, 0) }
function addSash(c) { const g = new THREE.Group(); const s = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.03), M.sashR, 0, 0, 0, g); s.rotation.z = 0.8; mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 14), M.gold, 0.07, 0.06, 0.02, g).rotation.x = Math.PI / 2; return onTorso(c, g, 0, 0.5, 0.19) }
function addMustache(c) { const g = new THREE.Group(); for (const s of [-1, 1]) { const m = mesh(new THREE.CapsuleGeometry(0.04, 0.14, 4, 8), M.black, s * 0.09, 0, 0, g); m.rotation.z = s * 1.2 } return onHead(c, g, 0, 0.2, 0.37) }
function addEarpiece(c) { const g = new THREE.Group(); mesh(new THREE.SphereGeometry(0.04, 6, 5), M.black, 0, 0, 0, g); const w = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), std(0xd8d8d8), 0, -0.16, -0.02, g); return onHead(c, g, 0.41, 0.3, 0) }
// 千手観音: 背中に扇のように並んだ金の腕と光背
function addSenju(c, n) {
  const g = new THREE.Group(); c.arms = []
  const halo = mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb020, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5 }), 0, 1.18, -0.2, g)
  for (let k = 0; k < 8; k++) { const r = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), M.gold, 0, 1.18, -0.21, g); r.rotation.z = k * Math.PI / 8; r.material = halo.material }
  c.halo = halo
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.42, 4, 8); armGeo.translate(0, 0.25, 0)
  const handGeo = new THREE.SphereGeometry(0.075, 10, 8)
  for (let k = 0; k < n; k++) {
    const side = k % 2 ? 1 : -1, j = Math.floor(k / 2), m = n / 2
    const a = side * (0.35 + j / (m - 1 || 1) * 1.9)   // 胴からの角度（0=真上）
    const p = new THREE.Group(); p.position.set(side * 0.12, 0.78 + (j % 2) * 0.06, -0.08 - j * 0.012); g.add(p)
    const arm = mesh(armGeo, M.gold, 0, 0, 0, p); mesh(handGeo, M.gold, 0, 0.52, 0, arm)
    p.rotation.z = -a; p.userData = { a, side, rest: -a, reach: 0, ph: k * 0.7 }
    c.arms.push(p)
  }
  g.scale.setScalar((c.h / 1.6) / c.g.scale.x); c.g.add(g); c.senjuG = g
  const rodGeo = new THREE.CylinderGeometry(0.04, 0.05, 1, 8); rodGeo.translate(0, 0.5, 0)
  c.grab = [0, 1, 2, 3].map(() => { const hand = mesh(new THREE.SphereGeometry(0.085, 12, 10), M.gold, 0, 0, 0, scene), rod = mesh(rodGeo, M.gold, 0, 0, 0, scene); hand.visible = rod.visible = false; return { hand, rod } })
}

// ---------- 店員（自分）・マスター・棒とアイス
const P = { c: null, stick: new THREE.Group(), cone: new THREE.Group(), tip: new THREE.Vector3() }
scene.add(P.stick); scene.add(P.cone)
{
  const steel = std(0xd8dde2, { roughness: 0.2, metalness: 0.9 })
  const rod = mesh(new THREE.CylinderGeometry(0.014, 0.014, SL, 8), steel, 0, 0, SL / 2, P.stick); rod.rotation.x = Math.PI / 2
  const grip = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.22, 10), std(0x3a2414, { roughness: 0.5 }), 0, 0, 0.02, P.stick); grip.rotation.x = Math.PI / 2
  mesh(new THREE.BoxGeometry(0.07, 0.012, 0.09), steel, 0, 0, SL, P.stick)
  P.stick.position.copy(PIV)
  // アイス（ピンクと白の2段）とコーン。棒の先がアイスに刺さっている
  const cone = new THREE.ConeGeometry(0.075, 0.24, 16); cone.rotateX(Math.PI)
  const waffle = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#d9a35a'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(120,70,20,.6)'; x.lineWidth = 4; for (let i = -w; i < w * 2; i += 18) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i + h, 0); x.lineTo(i, h); x.stroke() } })
  const cm = std(0xffffff, { map: waffle, roughness: 0.8 })
  mesh(cone, cm, 0, -0.17, 0, P.cone)
  const i1 = mesh(new THREE.SphereGeometry(0.085, 18, 14), std(0xfff4e2, { roughness: 0.5 }), 0, -0.04, 0, P.cone); i1.scale.y = 0.9
  const i2 = mesh(new THREE.SphereGeometry(0.075, 18, 14), std(0xff9fb6, { roughness: 0.5 }), 0, 0.06, 0, P.cone)
  const pist = mesh(new THREE.SphereGeometry(0.02, 8, 6), std(0x9ccf6a), 0.03, 0.13, 0.02, P.cone)
  castShadow(P.stick); castShadow(P.cone)
}
function setupVendor() {
  const c = makeChar('male-e', { anim: 'holding-right', h: 1.62 }); if (!c) return
  c.g.position.copy(VEND); c.g.rotation.y = 0; scene.add(c.g); P.c = c; addFez(c)
  c.emo.visible = false
}
const MASTER = { c: null }
function setupMaster() {
  const c = makeChar('male-b', { anim: 'idle' }); if (!c) return
  c.g.position.set(-1.15, 0, -0.95); c.g.rotation.y = 0.75; scene.add(c.g); MASTER.c = c; addFez(c); addMustache(c)
}
// 通りを歩く人
const walkers = []
function setupWalkers() {
  const rnd = mulberry(5)
  for (let i = 0; i < 7; i++) {
    const c = makeChar(CHAR_FILES[Math.floor(rnd() * 12)], { anim: 'walk' }); if (!c) continue
    const dir = i % 2 ? 1 : -1; c.dir = dir; c.sp = 0.9 + rnd() * 0.5
    c.g.position.set(-12 + rnd() * 24, 0, 5.2 + (i % 3) * 0.9); c.g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
    c.mixer.update(rnd() * 3); scene.add(c.g); walkers.push(c)
  }
}

// ---------- 吹き出し（DOM）
function toScreen(p) { _w.copy(p).project(camera); return { x: (_w.x + 1) / 2 * innerWidth, y: (1 - _w.y) / 2 * innerHeight, z: _w.z } }
// 画面の文字は2つの枠だけ: 「一言」（吹き出し1つ）と「判定」（擬音1つ）。同時に最大2つ。
// 前のが読める時間（0.9秒＋1字0.09秒、大事な判定は長め）を過ぎて消えてから次を出す。大事なもの（prio が小さい）は割り込める
const TXT = { sp: { cur: null, q: [] }, ju: { cur: null, q: [] } }
const readT = (text, crit) => { const n = [...String(text).replace(/<[^>]+>/g, '')].length, t = 0.9 + 0.09 * n; return crit ? Math.max(t * 1.4, 2.2) : t }
function txtReq(ch, it) {
  const C = TXT[ch]; it.min = readT(it.text + (it.sub || ''), it.prio === 0); it.life = Math.max(it.life || 0, it.min); it.at = S.time
  if (!C.cur) { txtShow(ch, it); return }
  if (it.prio < C.cur.prio) { txtDrop(C.cur); C.cur = null; txtShow(ch, it); return }
  if (it.prio >= 3) return                                  // おまけの一言は空いている時だけ
  C.q.push(it); C.q.sort((a, b) => a.prio - b.prio || a.at - b.at); if (C.q.length > 2) C.q.length = 2
}
function txtShow(ch, it) {
  const el = document.createElement('div')
  if (ch === 'ju') { el.className = 'ono ' + (it.cls || ''); el.textContent = it.text; el.style.fontSize = (it.size ?? 30) + 'px'; if (it.sub) { const sb = document.createElement('small'); sb.textContent = it.sub; el.appendChild(sb) } }
  else { el.className = 'sb ' + (it.cls || ''); el.textContent = it.text; if (it.c) it.c.bub = el }
  $('#fx').appendChild(el); it.el = el; it.t = 0; it.kind = ch === 'ju' ? 'ono' : 'sb'; TXT[ch].cur = it
  if (S.txtLog && S.txtLog.length < 400) S.txtLog.push(it)
}
function txtDrop(it) { if (!it) return; it.shown = it.t; it.el && it.el.remove(); if (it.c && it.c.bub === it.el) it.c.bub = null }
function ono(text, pos, cls = '', o = {}) { txtReq('ju', { text, pos: pos.clone(), cls, size: o.size, sub: o.sub, life: o.life, prio: o.prio ?? 1, rise: o.rise ?? 0.3, rot: o.rot ?? (Math.random() - 0.5) * 10 }) }
function bubble(c, text, cls = '', life = 0, prio = 1) { if (!c) return; txtReq('sp', { c, text, cls, life, prio }) }
const FX = { get length() { return (TXT.sp.cur ? 1 : 0) + (TXT.ju.cur ? 1 : 0) } }
function clearFx() { for (const ch of ['sp', 'ju']) { txtDrop(TXT[ch].cur); TXT[ch].cur = null; TXT[ch].q.length = 0 } for (const c of allChars()) c.bub = null }
function updateFx(dt) {
  const top = 52, bot = innerHeight - (S.mode === 'play' ? 130 : 12)
  for (const ch of ['sp', 'ju']) {
    const C = TXT[ch]
    if (C.cur) { const f = C.cur; f.t += dt; if (f.t >= f.life || (f.c && !f.c.g.parent)) { txtDrop(f); C.cur = null } }
    // 次を出す（古すぎるもの・話し手がいないものは捨てる）
    while (!C.cur && C.q.length) { const it = C.q.shift(); if (S.time - it.at > 3 || (it.c && !it.c.g.parent)) continue; txtShow(ch, it) }
    const f = C.cur; if (!f) continue
    const k = f.t / f.life, fade = f.life - f.t < 0.2 ? (f.life - f.t) / 0.2 : 1
    if (ch === 'ju') {
      const s = toScreen(_w.copy(f.pos).add(_q.set(0, f.rise * ease(k * 3), 0)))
      if (s.z > 1) { f.el.style.opacity = 0; continue }
      const sc = f.t < 0.12 ? 0.4 + f.t / 0.12 * 0.6 : 1
      const w = f.el.offsetWidth, h = f.el.offsetHeight, x = clamp(s.x, w / 2 + 8, innerWidth - w / 2 - 8), y = clamp(s.y - 20, top, bot - h)
      f.el.style.transform = `translate(${x - w / 2}px,${y}px) rotate(${f.rot}deg) scale(${sc})`; f.el.style.opacity = fade
    } else {
      const s = toScreen(headPos(f.c, _hp)), w = f.el.offsetWidth, h = f.el.offsetHeight
      const x = clamp(s.x - w / 2, 8, innerWidth - w - 8), y = clamp(s.y - h - 10, top, bot - h)
      const sc = f.t < 0.12 ? 0.5 + f.t / 0.12 * 0.5 : 1
      const jig = f.el.classList.contains('hot') || f.el.classList.contains('guard') ? Math.sin(S.time * 60) * 2 : 0
      f.el.style.transform = `translate(${x + jig}px,${y}px) scale(${sc})`; f.el.style.opacity = fade
    }
  }
  // 判定の枠と一言の枠が重なったら、判定を一言の下へずらす
  const a = TXT.sp.cur, b = TXT.ju.cur
  if (a && b) { const ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect(); if (ra.left < rb.right && ra.right > rb.left && ra.top < rb.bottom && ra.bottom > rb.top) b.el.style.transform += ` translateY(${Math.round(ra.bottom - rb.top + 6)}px)` }
}

// ---------- 客
let LINE = []        // 今の客と、並んでいる客（最大3人）
let CUR = null       // 今カウンターの前にいる客
const leaving = []
function kindDef(k) { return D.KINDS[k] }
function allChars() { const a = []; for (const m of CROWD) a.push(m.c); for (const cu of [...LINE, ...leaving]) { a.push(cu.c); if (cu.guards) a.push(...cu.guards) } if (MASTER.c) a.push(MASTER.c); if (P.c) a.push(P.c); return a.filter(Boolean) }
function spawnCust(i) {
  const dd = D.DAY[i]; if (!dd) return null
  const def = kindDef(dd.k), h = def.h
  const c = makeChar(dd.m, { h, anim: 'idle', recolor: dd.k === 'senju' ? 'gold' : null }); if (!c) return null
  const pat = def.pat + (def.jit ? Math.floor(R() * (def.jit + 1)) : 0)
  const cu = { i, k: dd.k, def, c, pat, left: pat, teases: 0, close: 0, tip: 0, idles: 0, irk: 0, aim: ['C'], moved: null, st: 'queue', ph: 'idle', pt: 0, react: 0, lean: 0, reachK: 0, windK: 0, out: null, tut: !!dd.tut, guards: null, pos: new THREE.Vector3(), lastLine: '' }
  if (dd.k === 'kid') addKidHat(c)
  if (dd.k === 'yankee') { addPompadour(c); addShades(c) }
  if (dd.k === 'senju') addSenju(c, def.arms)
  if (dd.k === 'couple') {
    const bf = makeChar(dd.bf, { h: 1.68, anim: 'idle' })
    if (bf) { bf.off = [-0.6, 0.18]; bf.isBf = true; scene.add(bf.g); cu.guards = [bf]; cu.bf = bf }
    const j = def.bf; cu.bfPat = cu.bfLeft = j[0] + Math.floor(R() * (j[1] - j[0] + 1))
  }
  if (dd.k === 'president') {
    addSash(c)
    cu.guards = ['male-a', 'male-b'].map((m, k) => { const gd = makeChar(m, { h: 1.78, anim: 'idle', recolor: 'black' }); if (!gd) return null; addShades(gd); addEarpiece(gd); scene.add(gd.g); gd.side = k ? 1 : -1; return gd }).filter(Boolean)
  }
  scene.add(c.g)
  return cu
}
function queuePos(cu, slot) {
  if (slot < 0) return [0, CUST_Z]
  const q = QUEUE[Math.min(slot, QUEUE.length - 1)]; return [q[0], q[1]]
}
function placeLine(snap) {
  LINE.forEach((cu, k) => {
    const slot = cu === CUR ? -1 : k - (CUR ? 1 : 0)
    const [x, z] = queuePos(cu, slot); cu.tx = x; cu.tz = z
    if (snap) { cu.c.g.position.set(x, 0, z) }
  })
}
function fillLine() {
  while (LINE.length < 3) {
    const n = (LINE.length ? LINE[LINE.length - 1].i : S.ci - 1) + 1
    if (n >= D.DAY.length) break
    const cu = spawnCust(n); if (!cu) break
    const [x, z] = queuePos(cu, LINE.length - (CUR ? 1 : 0)); cu.c.g.position.set(x + 3, 0, z + 1.5); cu.tx = x; cu.tz = z
    LINE.push(cu)
  }
}
function nextCustomer() {
  CUR = LINE.find(cu => cu.st === 'queue') || null
  if (!CUR) { endShift(); return }
  S.ci = CUR.i
  CUR.st = 'walkin'; placeLine(false)
  if (CUR.k === 'president') presArrive()
  if (CUR.k === 'senju') Snd.sfx('gong')
}
function presArrive() {
  Snd.setTrack('boss'); Snd.sfx('fanfare'); $('#vignette').classList.add('boss')
  fx.shake(0.02, 0.6)
}

// ---------- 棒の動き
const _a = new THREE.Vector3(), _b = new THREE.Vector3()
function stickAngles(target) { _a.copy(target).sub(PIV); const yaw = Math.atan2(_a.x, _a.z), pitch = -Math.atan2(_a.y, Math.hypot(_a.x, _a.z)); return [yaw, pitch] }
const OFF_T = new THREE.Vector3()
// アイスを置く5か所（真ん中・上・下・左・右）。画面の左＝世界の +x
const SPOTS = { C: [0, 0], U: [0, 1], D: [0, -1], L: [1, 0], R: [-1, 0] }, SPOT_N = Object.keys(SPOTS)
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' }
function offerTarget(out) { const h = CUR ? CUR.def.h : CH; return out.set(-0.02, clamp(h * 0.62, 1.0, 1.1), 0.32) }
function spotPos(name, out) { offerTarget(out); const [sx, sy] = SPOTS[name]; return out.add(_q.set(sx * 0.3, sy > 0 ? 0.27 : sy < 0 ? -0.15 : 0, Math.abs(sx) * -0.04)) }
const _sf = new THREE.Vector3(), _st = new THREE.Vector3(), _sc = new THREE.Vector3()
function updateStick(dt) {
  // 動かす時はサッと弧を描いて移る（手前へふくらむ）
  S.spotT = Math.min(1, S.spotT + dt / 0.13)
  spotPos(S.spot, _st)
  if (S.spotT < 1) {
    const u = ease(S.spotT); _sc.lerpVectors(_sf, _st, 0.5).add(_q.set(0, 0.12, -0.2))
    P.tip.set(0, 0, 0).addScaledVector(_sf, (1 - u) * (1 - u)).addScaledVector(_sc, 2 * u * (1 - u)).addScaledVector(_st, u * u)
  } else P.tip.copy(_st)
  P.tip.y += Math.sin(S.time * 3) * 0.008
  // 棒は握りからアイスへ
  _a.copy(P.tip).sub(PIV); const len = _a.length()
  P.stick.position.copy(PIV); P.stick.rotation.order = 'YXZ'
  P.stick.rotation.set(-Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), Math.atan2(_a.x, _a.z), 0)
  P.stick.scale.set(1, 1, len / SL)
  // コーン（アイスに刺さっているので、いつも上向き。動かす時にくるっと回す）
  S.spin *= Math.exp(-dt * 4)
  P.cone.visible = S.coneOn
  if (S.coneOn) {
    P.cone.position.copy(P.tip).add(_q.set(0, -0.02, 0))
    P.cone.rotation.set(Math.sin(S.time * 2) * 0.05, P.cone.rotation.y + S.spin * dt, Math.sin(S.spin * 0.1) * 0.25)
    const k = S.coneT < 1 ? ease(S.coneT / 1) : 1; S.coneT = Math.min(1, S.coneT + dt * 4); P.cone.scale.setScalar(0.2 + 0.8 * k)
  }
}
// 十字キー: その方向の場所へ。反対を押すと真ん中へ戻る。真ん中ボタンでも戻る
function move(dir) {
  if (S.mode !== 'play' || S.giving || !CUR || CUR.st !== 'ready' || !S.coneOn) return
  const to = dir === 'C' ? 'C' : S.spot === OPP[dir] ? 'C' : dir
  if (to === S.spot) return
  const cu = CUR
  // 構えの終わりぎわ（0.08秒以内）に押したら、手が伸び始めたのと同じに扱う（先読みの許し）
  if (cu.ph === 'wind' && cu.pt <= 0.08) { if (!cu.aim.includes(S.spot)) cu.aim = pickAim(cu); startLunge(cu) }
  if (cu.ph === 'feint' && !cu.fooled) { cu.fooled = true; ono(TT().fooled, P.tip.clone().add(_q.set(0, 0.3, 0)), 'yel', { size: 28 }) }
  _sf.copy(P.tip); S.spot = to; S.spotT = 0; S.spin = 24; S.moves++; Snd.sfx('pull')
  if (cu.ph === 'wind') {
    // 構えている間に動かすと、狙い直して手を出すのが遅れる。イライラが溜まる
    cu.pt = Math.max(cu.pt, cu.pdur * 0.75); cu.irk++
    if (cu.irk >= 3) irritate(cu)
  } else if (cu.ph === 'lunge' && !cu.moved) cu.moved = cu.pt <= cu.pdur * 0.5 ? 'close' : 'lunge'
}
function irritate(cu) {
  cu.irk = 0; cu.idles++
  if (cu.idles >= (cu.k === 'kid' || cu.k === 'yankee' ? 2 : 3) && !(cu.tut && S.tut >= 0)) { broke(cu, true); return }
  custSay(cu, pick(TT().L[cu.k].idle), cu.k === 'yankee' ? 'hot' : 'warm'); setEmo(cu)
  if (cu.tut) S.tutIrk = 2
}
// 狙う場所（千手観音は2〜3か所。必ず空きが残る）
function pickAim(cu) {
  const a = [S.spot]
  if (cu.def.multi) {
    const n = cu.def.multi[0] + Math.floor(R() * (cu.def.multi[1] - cu.def.multi[0] + 1))
    const rest = SPOT_N.filter(x => x !== S.spot)
    while (a.length < n && rest.length > 1) a.push(rest.splice(Math.floor(R() * rest.length) % rest.length, 1)[0])
  }
  return a
}

// ---------- 見物の人だかり（連続でかわすほど増える。取られる・キレられると散る）
const CROWD = []
const CROWD_SLOTS = [[-0.75, 1.6], [-0.55, 2.3], [0.35, 2.75], [-1.3, 1.95], [-0.1, 3.2], [-1.05, 2.85], [0.75, 3.55], [-1.6, 2.6], [-0.6, 3.75], [-2.0, 2.2]]
const phoneGeo = new THREE.BoxGeometry(0.1, 0.18, 0.02), screenMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff })
let flashTex = null
function addCrowd() {
  const live = CROWD.filter(m => m.st !== 'out'); if (live.length >= D.CROWD.max || !charsReady) return
  const used = new Set(live.map(m => m.slot)), slot = CROWD_SLOTS.findIndex((_, k) => !used.has(k)); if (slot < 0) return
  const c = makeChar(CHAR_FILES[Math.floor(Math.random() * CHAR_FILES.length)], { h: 1.45 + Math.random() * 0.25, anim: 'walk' }); if (!c) return
  c.g.traverse(o => { if (o.isMesh) o.castShadow = false })   // 影は落とさない（軽くする）
  const [x, z] = CROWD_SLOTS[slot], from = x < 0 ? -5 : 5
  c.g.position.set(from, 0, z + 0.4); scene.add(c.g)
  const m = { c, slot, st: 'in', tx: x, tz: z, phone: null, flashT: 1 + Math.random() * 2 }
  // 3人に1人くらいはスマホで撮る
  if (live.length % 3 === 1) {
    const ph = new THREE.Group(); mesh(phoneGeo, M.black, 0, 0, 0, ph); mesh(new THREE.PlaneGeometry(0.08, 0.15), screenMat, 0, 0, -0.012, ph).rotation.y = Math.PI
    flashTex = flashTex || emoTex('flash'); const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); fl.scale.setScalar(0.35); fl.visible = false; ph.add(fl); ph.userData.fl = fl
    scene.add(ph); m.phone = ph
  }
  CROWD.push(m)
}
function crowdN() { return CROWD.filter(m => m.st !== 'out').length }
function crowdSay(text) { return; const live = CROWD.filter(m => m.st === 'idle'); if (!live.length) return; const m = live[Math.floor(Math.random() * live.length)]; ono(text, headPos(m.c, _v2).clone(), 'yel', { size: 22, life: 1, rise: 0.25 }) }
function crowdCheer(big) {
  const n = crowdN()
  if (n) Snd.sfx('ooh', { n })
  addCrowd(); if (big) addCrowd()
  S.money.crowdMax = Math.max(S.money.crowdMax, crowdN())
}
function crowdScatter() {
  const live = CROWD.filter(m => m.st !== 'out'); if (!live.length) return
  Snd.sfx('boo')
  for (const m of live) { m.st = 'out'; m.tx = m.tx < 0 ? -7 : 7; m.tz += 0.6; m.sp = 2.2 + Math.random() }
}
function clearCrowd() { for (const m of CROWD) { freeChar(m.c); if (m.phone) m.phone.removeFromParent() } CROWD.length = 0 }
function updateCrowd(dt) {
  for (let i = CROWD.length - 1; i >= 0; i--) {
    const m = CROWD[i], g = m.c.g, dx = m.tx - g.position.x, dz = m.tz - g.position.z, d = Math.hypot(dx, dz)
    m.c.mixer.update(dt)
    if (d > 0.04) { const sp = Math.min(d, (m.sp || 1.6) * dt); g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = Math.atan2(dx, dz); play(m.c, m.st === 'out' ? 'sprint' : 'walk', 0.15) }
    else if (m.st === 'out') { freeChar(m.c); if (m.phone) m.phone.removeFromParent(); CROWD.splice(i, 1); continue }
    else { m.st = 'idle'; g.rotation.y = lerp(g.rotation.y, Math.atan2(-g.position.x, -g.position.z), 0.1); play(m.c, m.phone ? 'holding-both' : 'idle', 0.3) }
    if (m.phone) {
      headPos(m.c, m.phone.position); const s = m.c.h / CH; m.phone.position.y -= 0.42 * s
      m.phone.position.x += Math.sin(g.rotation.y) * 0.32 * s; m.phone.position.z += Math.cos(g.rotation.y) * 0.32 * s; m.phone.rotation.y = g.rotation.y
      m.flashT -= dt; const fl = m.phone.userData.fl; fl.visible = m.st === 'idle' && m.flashT < 0.08 && m.flashT > 0; if (m.flashT <= 0) m.flashT = 1.5 + Math.random() * 2.5
      m.phone.visible = m.st !== 'out'
    }
  }
}
// ヤンキーが蹴ると看板が落ちる
const signFall = new THREE.Group(); signFall.visible = false; scene.add(signFall)
{
  const t = canvasTex(512, 160, (x, w, h) => { x.fillStyle = '#c8102e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#e9b44c'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#fff'; x.font = `900 76px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('トルコアイス', w / 2, h / 2 + 4) })
  const b = mesh(new THREE.BoxGeometry(0.9, 0.28, 0.03), [std(0x5a3a1e), std(0x5a3a1e), std(0x5a3a1e), std(0x5a3a1e), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })], 0, 0, 0, signFall); b.castShadow = true
}
function dropSign() { signFall.visible = true; signFall.position.set(0.05, 2.3, 0.05); signFall.rotation.set(0.2, Math.PI, 0.1); signFall.userData = { vy: 0, t: 0, bounced: 0 } }
function updateSign(dt) {
  if (!signFall.visible) return
  const u = signFall.userData; u.t += dt; u.vy -= 9 * dt; signFall.position.y += u.vy * dt
  signFall.rotation.z += dt * 2.2 * (u.bounced ? 0.3 : 1); signFall.rotation.x += dt * 1.5 * (u.bounced ? 0.2 : 1)
  if (signFall.position.y < CTR_Y + 0.16) { signFall.position.y = CTR_Y + 0.16; if (u.vy < -1) { u.vy = -u.vy * 0.35; u.bounced++; if (u.bounced === 1) { Snd.sfx('bang'); fx.shake(0.03, 0.25) } } else u.vy = 0 }
}
// 子どもが泣くとお母さんが来る
function spawnMom(cu) {
  if (cu.st === 'gone' || !charsReady) return
  const mom = makeChar('female-d', { h: 1.6, anim: 'walk' }); if (!mom) return
  mom.off = [0.85, 0.6]; mom.face = Math.PI + 0.25; mom.g.position.set(cu.c.g.position.x + 3.5, 0, cu.c.g.position.z + 0.6); scene.add(mom.g)
  cu.guards = (cu.guards || []).concat(mom); cu.mom = mom
  later(0.7, () => { if (mom.g.parent) { bubble(mom, TT().L.mom, 'hot', 0, 1); Snd.sfx('rage'); fx.shake(0.02, 0.3) } })
}

// ---------- 遊びの進行
// 遊びの時計で動くタイマー（setTimeout は一時停止・ヒットストップ・検証の早回しと合わないので使わない）
const TIMERS = []
function later(sec, fn) { TIMERS.push({ t: sec, fn }) }
function runTimers(dt) { const due = []; for (let i = TIMERS.length - 1; i >= 0; i--) { TIMERS[i].t -= dt; if (TIMERS[i].t <= 0) due.push(TIMERS.splice(i, 1)[0]) } for (const d of due.reverse()) d.fn() }
function lines() { return TT().L[CUR.k] }
function stageLine(cu) {
  const L = TT().L[cu.k], st = L.s
  const idx = cu.left <= 0 && cu.k !== 'granny' ? st.length - 1 : Math.min(st.length - 2, Math.floor((cu.teases - 1) * (st.length - 1) / Math.max(1, cu.pat)))
  const arr = st[Math.max(0, idx)]; return pick(arr)
}
function setEmo(cu) {
  const c = cu.c, k = cu.k, warn = cu.left <= 0, mid = cu.left === 1 || (cu.pat >= 4 && cu.left <= 2)
  let e = null
  if (cu.done === 'broke') e = k === 'kid' ? 'tear' : k === 'granny' ? 'zzz' : 'anger'
  else if (cu.done === 'given' || cu.done === 'cap') e = cu.teases ? 'heart' : null
  else if (cu.done === 'stolen') e = 'note'
  else if (k === 'granny') e = cu.teases ? 'note' : null
  else if (k === 'couple') e = warn ? 'sweat' : cu.teases ? 'heart' : null
  else if (k === 'president') e = cu.teases >= D.KINDS.president.ideal ? 'note' : cu.teases ? null : null
  else if (warn) e = k === 'kid' ? 'tear' : k === 'senju' ? 'bang' : 'anger'
  else if (mid) e = k === 'kid' ? 'tear' : 'sweat'
  else if (cu.teases) e = k === 'yankee' ? 'sweat' : 'note'
  if (cu.idles && !e && !cu.done) e = 'sweat'
  c.emoK = e; c.emo.visible = !!e; if (e) c.emo.material.map = emoTex(e)
  c.warn = !cu.done && warn && k !== 'granny'
  if (cu.bf) { const b = cu.bf, e2 = cu.bfBroke ? 'anger' : cu.done ? null : cu.bfLeft === 0 ? 'anger' : cu.bfLeft === 1 ? 'sweat' : null; b.emoK = e2; b.emo.visible = !!e2; if (e2) b.emo.material.map = emoTex(e2); b.warn = !cu.done && cu.bfLeft === 0 }
}
function custSay(cu, text, cls = '', life = 0, prio = 1) { cu.lastLine = text; bubble(cu.c, text, cls, life, prio) }
function guardSay(text, life = 0, prio = 1) { if (!CUR || !CUR.guards) return; const gd = CUR.guards[(CUR.teases + 1) % CUR.guards.length]; bubble(gd, text, 'guard', life, prio); Snd.sfx('guard'); gd.lunge = 1; fx.shake(0.012, 0.3) }
function bossSay(text, life = 0, prio = 2) { if (MASTER.c) { bubble(MASTER.c, text, 'boss', life, prio); Snd.sfx('boss') } }
function speedK() { return 1 - 0.16 * clamp(S.ci / (D.DAY.length - 1), 0, 1) }
function updateCust(dt) {
  // 歩いて並ぶ・前へ詰める
  for (const cu of LINE) {
    const g = cu.c.g, dx = cu.tx - g.position.x, dz = cu.tz - g.position.z, d = Math.hypot(dx, dz)
    if (d > 0.03) { const sp = Math.min(d, 1.7 * dt); g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = lerp(g.rotation.y, Math.atan2(dx, dz), 0.25); play(cu.c, 'walk', 0.15) }
    else { g.rotation.y = lerp(g.rotation.y, Math.PI, 0.15); if (cu.st === 'queue' || cu.st === 'walkin') play(cu.c, 'idle', 0.25) }
    if (cu.guards) cu.guards.forEach((gd, k) => {
      const tx = g.position.x + (gd.off ? gd.off[0] : gd.side * 0.72), tz = g.position.z + (gd.off ? gd.off[1] : 0.55), ddx = tx - gd.g.position.x, ddz = tz - gd.g.position.z, dd = Math.hypot(ddx, ddz)
      if (dd > 0.03) { const sp = Math.min(dd, 1.8 * dt); gd.g.position.x += ddx / dd * sp; gd.g.position.z += ddz / dd * sp; gd.g.rotation.y = Math.atan2(ddx, ddz); play(gd, 'walk', 0.15) }
      else { gd.g.rotation.y = lerp(gd.g.rotation.y, gd.face ?? (Math.PI - (gd.side || 0) * 0.15), 0.1); if (!gd.hold) play(gd, 'idle', 0.25) }
      gd.lunge = Math.max(0, (gd.lunge || 0) - dt * 1.6)
      gd.root.position.z = 0.25 * ease(gd.lunge) / gd.g.scale.x
    })
    if (cu.st === 'walkin' && d <= 0.03) { cu.st = 'ready'; cu.ph = 'idle'; cu.idleT = 0; onReady(cu) }
  }
  for (let i = leaving.length - 1; i >= 0; i--) {
    const cu = leaving[i], g = cu.c.g; cu.lt += dt
    if (cu.lt < 1.3) continue
    g.position.x -= 1.8 * dt; g.position.z += 0.5 * dt; g.rotation.y = lerp(g.rotation.y, -Math.PI / 2 - 0.3, 0.2); play(cu.c, cu.done === 'broke' && cu.k === 'kid' ? 'walk' : 'walk', 0.2)
    if (cu.guards) for (const gd of cu.guards) { gd.g.position.x -= 1.8 * dt; gd.g.position.z += 0.5 * dt; gd.g.rotation.y = -Math.PI / 2; play(gd, 'walk', 0.2) }
    if (g.position.x < -7) { freeChar(cu.c); if (cu.guards) cu.guards.forEach(freeChar); leaving.splice(i, 1) }
  }
  if (!CUR || CUR.st !== 'ready') return
  const cu = CUR, def = cu.def, sk = speedK() * (cu.tut && S.tut >= 0 ? 1.5 : 1)
  cu.pt -= dt
  if (S.giving) return
  if (cu.ph === 'idle') { cu.ph = 'wait'; cu.pt = lerp(def.reach[0], def.reach[1], R()) * sk + (cu.k === 'president' && !cu.waited ? 2.2 : 0); cu.waited = true; cu.moved = null }   // 大統領は最初だけ、ボディガードの脅しを聞かせてから
  else if (cu.ph === 'wait') { if (cu.pt <= 0) { cu.ph = 'wind'; cu.pt = cu.pdur = def.wind * sk; cu.aim = pickAim(cu); Snd.sfx('wind') } }
  else if (cu.ph === 'wind') {
    if (!cu.aim.includes(S.spot)) cu.aim = pickAim(cu)
    if (cu.pt <= 0) {
      cu.aim = cu.aim.includes(S.spot) ? cu.aim : pickAim(cu)
      // フェイント: 伸ばしかけて止める（合図＝肩が沈む・「よっ」は本物の時だけ）
      if (!cu.feinted && R() < feintP(cu)) { cu.ph = 'feint'; cu.pt = cu.pdur = 0.34; cu.feinted = true; cu.fooled = false }
      else startLunge(cu)
    }
  } else if (cu.ph === 'feint') {
    if (cu.pt <= 0) { cu.ph = 'wind'; cu.pt = cu.pdur = 0.22 * sk; cu.aim = pickAim(cu) }
  } else if (cu.ph === 'lunge') {
    if (cu.pt <= 0) {
      if (cu.aim.includes(S.spot)) stolen(cu)
      else if (cu.dbl && !cu.second) {
        // 両手: 1本目をかわしたら、もう片方の手が今の場所へ
        cu.second = true; cu.firstClose = cu.moved === 'close'; cu.aim = [S.spot]; cu.ph = 'lunge'; cu.pt = cu.pdur = def.lunge * sk * 0.85; cu.moved = null; Snd.sfx('hup')
      } else { tease(cu, cu.moved === 'close' || !!cu.firstClose, cu.second); if (cu.st === 'ready') { cu.ph = 'back'; cu.pt = 0.55 } }
    }
  } else if (cu.ph === 'back') { if (cu.pt <= 0) { cu.ph = 'idle'; cu.feinted = false; cu.dbl = false; cu.second = false; cu.firstClose = false } }
}
function feintP(cu) {
  const F = D.FEINT; if ((cu.tut && S.tut >= 0) || cu.i < F.from) return 0
  return lerp(F.p0, F.p1, clamp((cu.i - F.from) / (D.DAY.length - 1 - F.from), 0, 1))
}
function startLunge(cu) {
  const sk = speedK() * (cu.tut && S.tut >= 0 ? 1.5 : 1)
  cu.ph = 'lunge'; cu.pt = cu.pdur = cu.def.lunge * sk * (cu.fooled ? 0.6 : 1); cu.moved = null; cu.tell = 0.3
  cu.dbl = cu.k === 'yankee' && cu.i >= D.FEINT.dblFrom && R() < D.FEINT.dblP; cu.second = false
  if (cu.i >= D.FEINT.from && !(cu.tut && S.tut >= 0)) { cu.tellIcon = cu.dbl ? 'bang2' : 'bang'; cu.tellIconT = 0.45; Snd.sfx('hup') }
}
function onReady(cu) {
  const L = TT().L[cu.k]
  custSay(cu, pick(L.hi), 'order'); setEmo(cu)
  if (cu.k === 'president') later(0.9, () => { if (CUR === cu && cu.st === 'ready') guardSay(TT().L.guard.hi, 0, 1) })
  S.coneOn = true
  if (S.wary && cu.k !== 'president') { S.wary = false; cu.wary = true; cu.pat = cu.left = Math.max(1, cu.pat - 1); later(1.2, () => { if (CUR === cu && cu.st === 'ready') custSay(cu, TT().wary, 'warm') }) }
}
function crowdMult() { return Math.min(D.CROWD.cap, 1 + D.CROWD.per * CROWD.filter(m => m.st !== 'out').length) }
function tease(cu, close, dbl) {
  cu.teases++; cu.left--; cu.irk = 0
  const T = TT(), mult = (close ? 1 + D.YEN.close : 1) * (dbl ? 1 + D.YEN.dbl : 1), add = Math.round(cu.def.tip * mult)
  const bonus = Math.round(add * (crowdMult() - 1))
  cu.tip += add; cu.crowdBonus = (cu.crowdBonus || 0) + bonus; S.money.teases++; if (close) { S.money.close++; cu.close++ }
  crowdCheer(close || dbl)
  Snd.sfx('whiff'); later(0.06, () => Snd.sfx('bell', { p: close ? 1.12 : 1 })); if (close) Snd.sfx('close')
  bell.userData.ring = 1
  const tp = P.tip.clone()
  const willBreak = cu.left - 1 < 0 || (cu.bf && cu.bfLeft - 1 < 0)
  if (!willBreak) ono(dbl ? T.dblWin : close ? T.closeO : pick(T.whiff), tp.clone().add(_q.set(0, 0.3, 0.2)), dbl ? 'red' : close ? 'yel' : 'pink', { size: close || dbl ? 32 : 30, sub: add ? `+¥${(add + bonus).toLocaleString('en-US')}` : '' })
  fx.burst(tp, { count: 14, color: 0xffe08a, speed: 1.2, life: 0.4, size: 0.06 })
  photoMoment((close ? 2 : 1) + (cu.k === 'president' ? 2 : 0) + (cu.k === 'senju' ? 1 : 0))
  // 限界を超えた（カップルは彼氏が先にキレることがある）
  if (cu.bf) { cu.bfLeft--; if (cu.bfLeft < 0) { bfBroke(cu); return } }
  if (cu.left < 0) { broke(cu, false); return }
  if (cu.k === 'granny' && cu.teases >= cu.def.cap) { finish(cu, 'cap'); return }
  // 1回につき一言は1つだけ。カップルは彼氏（彼女が限界の時だけ彼女）、大統領はボディガード（大統領が限界間近の時だけ大統領）
  if (cu.bf && !(cu.left <= 0 && cu.bfLeft > 0)) bfSay(cu, cu.bfLeft === 0 ? T.L.bf.warn : T.L.bf.s[Math.min(T.L.bf.s.length - 1, cu.teases)], cu.bfLeft === 0 ? 'hot' : '')
  else if (cu.k === 'president' && cu.left > 1) guardSay(T.L.guard.s[Math.min(cu.teases - 1, T.L.guard.s.length - 1)])
  else custSay(cu, stageLine(cu), cu.left <= 0 && cu.k !== 'granny' ? (cu.k === 'kid' ? 'cry' : 'hot') : '')
  if (cu.k === 'yankee' && cu.left <= 0) Snd.sfx('rage'); else if (cu.k === 'kid' && cu.left <= 0) Snd.sfx('cry', { p: 1.2 }); else Snd.sfx('laugh', { p: cu.k === 'kid' ? 1.5 : cu.k === 'granny' ? 1.25 : cu.k === 'president' ? 0.7 : 1 })
  setEmo(cu)
  play(cu.c, cu.left <= 0 ? 'emote-no' : 'emote-yes', 0.15, 1.2, true); cu.react = 1
}
function stolen(cu) {
  S.coneOn = false; if (cu.tut) S.lastStolen = true
  S.money.stolen++
  const T = TT()
  Snd.sfx('grab'); ono(T.stolenO, P.tip.clone().add(_q.set(0, 0.3, 0)), 'red', { size: 34, prio: 0, sub: `−¥${D.YEN.ice}` }); crowdScatter()
  fx.shake(0.02, 0.25)
  coneTo(cu)
  custSay(cu, lines().stolen, 'warm')
  cu.tip = 0
  finish(cu, 'stolen')
}
function broke(cu, idle) {
  const T = TT(), L = lines()
  if (cu.k === 'president') { incident(cu); return }
  S.money.broke++; cu.tip = 0; S.coneOn = false
  custSay(cu, L.brk, cu.k === 'kid' ? 'cry' : cu.k === 'granny' ? '' : 'hot', 0, 0)
  const hp = headPos(cu.c, _v2).clone()
  const penY = { kid: D.YEN.mom, yankee: D.YEN.sign, senju: D.YEN.heal, normal: D.YEN.review, couple: D.YEN.review }[cu.k] || 0
  ono(T.brokeO[cu.k], hp.add(_q.set(0, 0.25, 0)), cu.k === 'kid' ? 'blue' : 'red', { size: 36, prio: 0, sub: penY ? `${T.penO[cu.k]} −¥${(penY + D.YEN.ice).toLocaleString('en-US')}` : `−¥${D.YEN.ice}` })
  const pen = S.money.pen
  if (cu.k === 'kid') {
    Snd.sfx('cry'); play(cu.c, 'crouch', 0.2)
    // お母さんが来てクレーム（おわびのアイスもう1個）
    pen.mom++; later(0.8, () => spawnMom(cu))
  } else if (cu.k === 'yankee') {
    Snd.sfx('rage'); Snd.sfx('kick'); play(cu.c, 'attack-kick-right', 0.1, 1.2, true); fx.shake(0.06, 0.5); fx.zoom(0.06, 0.3); cu.slap = 1
    pen.sign++; dropSign()
  } else if (cu.k === 'senju') {
    Snd.sfx('rage'); Snd.sfx('slap'); play(cu.c, 'attack-melee-right', 0.1, 1.3, true); fx.shake(0.07, 0.6); cu.slap = 1
    pen.heal++; S.kick = { kind: 'fly', t: 0 }; S.lastKick = 'fly'
  } else if (cu.k === 'granny') { play(cu.c, 'crouch', 0.4) }
  else {
    // ふつう・カップルの彼女: スマホで★1の口コミ → 次の客が警戒
    Snd.sfx('rage'); play(cu.c, 'emote-no', 0.15, 1, true)
    if (cu.k === 'normal' || cu.k === 'couple') { pen.review++; S.wary = true }
  }
  crowdScatter()
  coneTo(cu)
  finish(cu, 'broke')
}
// カップルの彼氏がキレる（胸ぐら）
function bfSay(cu, text, cls, prio = 1) { if (cu.bf) { bubble(cu.bf, text, cls, 0, prio); cu.bf.lastLine = text } }
function bfBroke(cu) {
  const T = TT()
  S.money.broke++; S.money.pen.clean++; cu.tip = 0; cu.crowdBonus = 0; S.coneOn = false; cu.bfBroke = true
  bfSay(cu, T.L.bf.brk, 'hot', 0); Snd.sfx('rage'); Snd.sfx('collar')
  play(cu.bf, 'attack-melee-right', 0.1, 1, true); cu.bf.lunge = 1; cu.bf.hold = true
  S.kick = { kind: 'pull', t: 0 }; S.lastKick = 'pull'; fx.shake(0.05, 0.5)
  ono(T.collarO, P.tip.clone().add(_q.set(-0.3, 0.3, -0.1)), 'red', { size: 38, prio: 0, sub: `${T.penO.bf} −¥${(D.YEN.clean + D.YEN.ice).toLocaleString('en-US')}` })
  coneTo(cu); crowdScatter()
  finish(cu, 'broke')
}
function finish(cu, how) {
  cu.done = how; cu.st = 'done'; cu.ph = 'idle'; setEmo(cu)
  const T = TT(), L = lines()
  if (how === 'given' || how === 'cap') {
    let just = false
    if (cu.k === 'president') {
      const ideal = cu.def.ideal, y = cu.teases >= ideal ? D.YEN.presBig : D.YEN.presSmall
      S.money.pres += y; custSay(cu, cu.teases >= ideal ? L.just : L.good, '')
      ono(`+¥${y.toLocaleString('en-US')}`, headPos(cu.c, _v2).clone().add(_q.set(0, 0.3, 0)), 'yel', { size: 34, rot: 0 })
      Snd.sfx('fanfare'); fx.moment(P.tip.clone(), { burst: { count: 60, color: 0xffd166, speed: 2.2 }, shake: [0.02, 0.3], hitstop: 0 })
      photoMoment(9)
    } else {
      just = how === 'cap' || (cu.teases > 0 && (cu.left === 0 || (cu.bf && cu.bfLeft === 0)))
      if (just) { cu.tip += D.YEN.just; S.money.just++ }
      if (cu.bf) { cu.tip *= 2; cu.crowdBonus = (cu.crowdBonus || 0) * 2; S.money.just += just ? 1 : 0 }
      custSay(cu, how === 'cap' ? L.cap : cu.teases === 0 ? L.meh : just ? L.just : L.good, '')
      if (cu.tip) ono(`+¥${(cu.tip + (cu.crowdBonus || 0)).toLocaleString('en-US')}`, headPos(cu.c, _v2).clone().add(_q.set(0, 0.25, 0)), 'yel', { size: 30, rot: 0, sub: cu.bf ? T.coupleO : '' })
    }
    S.money.tips += cu.tip; S.money.crowd += cu.crowdBonus || 0
    if (CROWD.length) Snd.sfx('clap', { n: CROWD.length })
    if (cu.tip || cu.k === 'president') Snd.sfx('coin')
    play(cu.c, cu.teases ? 'jump' : 'idle', 0.15, 1, cu.teases > 0)
  }
  later((how === 'broke' ? 1800 : 1200) / 1000, () => startLeave(cu))
}
function startLeave(cu) {
  if (cu.st === 'gone') return
  cu.st = 'gone'; cu.lt = 1.0; const i = LINE.indexOf(cu); if (i >= 0) LINE.splice(i, 1); leaving.push(cu)
  if (CUR === cu) CUR = null
  if (S.mode !== 'play') return
  if (cu.k === 'president') { endShift(); return }
  fillLine(); S.coneOn = true; S.coneT = 0; S.spot = 'C'; S.spotT = 1; Snd.sfx('pop'); signFall.visible = false
  later(0.3, () => { if (S.mode === 'play' && !CUR) nextCustomer() })
}
// アイスを客の手へ（棒の先のアイスを複製して、客について行かせる）
const handCones = []
function coneTo(cu) { const g = P.cone.clone(); g.visible = true; scene.add(g); handCones.push({ g, cu, t: 0, from: P.tip.clone() }); S.coneOn = false; P.cone.visible = false }
function updateConeFly(dt) {
  for (let i = handCones.length - 1; i >= 0; i--) {
    const f = handCones[i]; f.t += dt; const k = ease(f.t / 0.35)
    if (!f.cu.c.g.parent) { f.g.removeFromParent(); handCones.splice(i, 1); continue }
    const hp = headPos(f.cu.c, _v2), s = f.cu.def.h / CH; _b.set(hp.x + 0.2 * s, hp.y - 0.92 * s, hp.z - 0.36 * s * Math.cos(f.cu.c.g.rotation.y))
    f.g.position.lerpVectors(f.from, _b, k); f.g.position.y += Math.sin(k * Math.PI) * 0.15
  }
}
function clearHandCones() { for (const f of handCones) f.g.removeFromParent(); handCones.length = 0 }
function give() {
  if (S.mode !== 'play' || S.giving || !CUR || CUR.st !== 'ready') return
  S.giving = 0.32; CUR.ph = 'idle'; Snd.sfx('offer')
  if (S.tut >= 0) S.tutGave = true
}
function updateGive(dt) {
  if (!S.giving) return
  S.giving -= dt
  if (S.giving <= 0) {
    S.giving = 0; const cu = CUR; if (!cu || cu.st !== 'ready') return
    coneTo(cu); Snd.sfx('grab')
    if (cu.k === 'president' && cu.teases === 0) { closedDown(cu); return }
    finish(cu, 'given')
  }
}
// 大統領の件
function closedDown(cu) {
  crowdScatter()
  S.closed = true; cu.done = 'closed'; cu.st = 'done'; setEmo(cu)
  const T = TT()
  custSay(cu, T.L.president.closed, 'hot', 0, 0)
  later(0.9, () => { guardSay(T.L.guard.closed, 0, 0) })
  later(1.7, () => {
    if (S.mode !== 'play') return
    Snd.sfx('shutter'); S.shutT = 0; shutterMesh.visible = true; $('#shutter b').textContent = S.lang === 'ja' ? '閉店' : 'CLOSED'
    later(0.75, () => { fx.shake(0.07, 0.6) })
  })
  photoMoment(10)
  later(4.2, () => endShift())
}
function incident(cu) {
  crowdScatter()
  S.incident = true; cu.done = 'broke'; cu.st = 'done'; setEmo(cu); S.coneOn = false
  const T = TT()
  custSay(cu, T.L.president.brk, 'cry', 0, 0); Snd.sfx('cry', { p: 0.6 })
  ono(T.brokeO.president, headPos(cu.c, _v2).clone().add(_q.set(0, 0.35, 0)), 'red', { size: 34, prio: 0, sub: `−¥${D.YEN.incident.toLocaleString('en-US')}` })
  later(0.7, () => guardSay(T.L.guard.brk, 0, 0))
  fx.shake(0.05, 0.6); play(cu.c, 'crouch', 0.2)
  coneTo(cu)
  later(3.2, () => endShift())
}

// 写真（明細に貼る一番の場面）
function photoMoment(score) { if (score > S.photoScore) { S.capAt = 0.06; S.capScore = score } }
const photoC = document.createElement('canvas'); photoC.width = photoC.height = 300
function capturePhoto() {
  render()
  const src = renderer.domElement, W = src.width, H = src.height, sx = W / innerWidth
  const tgt = CUR ? headPos(CUR.c, _v2).clone().add(_q.set(0, -0.25, -0.2)) : _v2.set(0, 1.3, 0.6)
  const p = toScreen(tgt), s = Math.min(W, H) * 0.7
  const cx = clamp(p.x * sx, s / 2, W - s / 2), cy = clamp(p.y * sx, s / 2, H - s / 2)
  try { photoC.getContext('2d').drawImage(src, cx - s / 2, cy - s / 2, s, s, 0, 0, 300, 300); S.photo = photoC } catch (e) {}
}

function updateGame(dt) {
  if (S.mode !== 'play') return
  S.t += dt
  updateStick(dt); updateCust(dt); updateGive(dt); updateConeFly(dt); runTimers(dt); updateSign(dt)
  if (S.kick) { S.kick.t += dt; if (S.kick.t > 1.4) S.kick = null }
  if (S.capAt !== undefined && S.capAt !== null) { S.capAt -= dt; if (S.capAt <= 0) { S.capAt = null; S.photoScore = S.capScore; S.doCap = true } }
  if (S.shutT !== undefined && S.shutT !== null) S.shutT += dt
}
function endShift() {
  if (S.ended) return
  S.ended = true; S.mode = 'end'; S.endT = 0; Snd.sfx('end'); Snd.setTrack('end')
  if (!S.closed) bossSay(TT().bossEnd, 0, 0)
  $('#hint').hidden = true; $('#finger').hidden = true; $('#ctl').style.visibility = 'hidden'
  if (!S.photo) S.doCap = true
}
function updateEnd(dt) { S.endT += dt; updateConeFly(dt); updateCust(dt); runTimers(dt); if (S.shutT != null) S.shutT += dt; if (S.endT > 2.2) toResult() }

// ---------- チュートリアル（最初の1回だけ。1人目の客）
function updateTutorial() {
  const h = $('#hint'), fg = $('#finger')
  if (S.tut < 0 || S.mode !== 'play' || !CUR || !CUR.tut) { h.hidden = true; fg.hidden = true; for (const b of ['#dpad', '#bGive']) $(b).classList.remove('flash'); return }
  const T = TT(), cu = CUR; let txt = '', el = null, now = false
  if (cu.st === 'done') { if (cu.done === 'given' || cu.done === 'cap') { S.tut = -1; store.set('tut', '1') } }
  else if (cu.st !== 'ready') txt = ''
  else if (cu.left <= 0 && cu.teases > 0) { txt = isTouch ? T.tutGive : T.tutGivePC; el = '#bGive' }
  else if (S.lastStolen) { txt = T.tutStolen }
  else if (S.tutIrk > 0) { txt = T.tutIrk }
  else if (cu.ph === 'lunge' && !cu.moved) { txt = isTouch ? T.tutPull : T.tutPullPC; el = '#dpad'; now = true }
  else if (cu.ph === 'wind') txt = isTouch ? T.tutWind : T.tutWindPC
  else txt = cu.teases ? T.tutMore : T.tutWatch
  if (TXT.ju.cur) { txt = ''; el = null }   // 判定が出ている間は案内を引っ込める（文字は同時に2つまで）
  h.hidden = !txt; if (txt && h.textContent !== txt) h.textContent = txt; h.classList.toggle('now', now)
  for (const b of ['#dpad', '#bGive']) $(b).classList.toggle('flash', b === el)
  if (el && isTouch) { const r = $(el).getBoundingClientRect(); fg.hidden = false; fg.style.transform = `translate(${r.left + r.width / 2 - 14}px,${r.top - 44}px)` } else fg.hidden = true
  if (S.tutIrk > 0) S.tutIrk -= 1 / 60
}

// ---------- 場面
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _ax = new THREE.Vector3(-1, 0, 0), _aw = new THREE.Vector3()
const HEAD_SIGN = [0.8, 0.6], _axL = new THREE.Vector3(1, 0, 0)
// 腕と目線を狙っている場所へ向ける（構え=向けるだけ、伸ばす=腕ごと伸びる）
function aimArm(cu) {
  const c = cu.c, k = Math.max(cu.windK * 0.75, cu.reachK)
  spotPos(cu.ph === 'lunge' || cu.ph === 'back' ? cu.aim[0] : S.spot, _b)
  cu.look = cu.look || _b.clone(); cu.look.lerp(_b, cu.ph === 'wind' ? 0.25 : 0.5)
  _aw.copy(cu.look); c.g.worldToLocal(_aw)
  if (c.head) { const hy = c.h * 0.75 / c.g.scale.x; c.head.rotation.set(clamp(-Math.atan2(_aw.y - hy, Math.hypot(_aw.x, _aw.z)), -0.5, 0.5) * HEAD_SIGN[1], clamp(Math.atan2(_aw.x, _aw.z), -0.6, 0.6) * HEAD_SIGN[0], 0) }
  // 狙う側の腕を使う（体の前を横切って顔を隠さないように）
  const useL = _aw.x > 0.02 / c.g.scale.x && c.armL, arm = useL ? c.armL : c.armR, other = useL ? c.armR : c.armL
  if (other) other.scale.x = 1
  if (k <= 0.001) { arm.scale.x = 1; return }
  arm.getWorldPosition(_a); _aw.copy(cu.look).sub(_a); const L = _aw.length(); _aw.normalize()
  arm.parent.getWorldQuaternion(_pq); _aw.applyQuaternion(_pq.invert())
  _qa.setFromUnitVectors(useL ? _axL : _ax, _aw); arm.quaternion.slerp(_qa, clamp(k, 0, 1))
  arm.scale.x = lerp(cu.ph === 'wind' ? 0.85 + Math.sin(S.time * 40) * 0.04 : 1, clamp(L / (0.3 * c.h / 1.6), 1, 2.4), cu.reachK)
}
function updateScene(dt) {
  S.time += dt
  if (S.mode === 'title') updateStick(dt)
  // 客の手の動き（構える→伸ばす→戻す）
  for (const cu of LINE) {
    const c = cu.c; c.mixer.update(dt)
    let wantR = 0, wantW = 0
    if (cu === CUR && cu.st === 'ready') {
      if (cu.ph === 'wind') { wantW = 1 }
      else if (cu.ph === 'lunge') { wantR = 1 - Math.max(0, cu.pt) / Math.max(0.01, cu.pdur || cu.def.lunge) ; wantW = 1 }
      else if (cu.ph === 'back') wantR = Math.max(0, cu.pt / 0.55) * 0.6
      else if (cu.ph === 'feint') { const u = 1 - Math.max(0, cu.pt) / cu.pdur; wantR = Math.sin(Math.PI * u) * 0.45; wantW = 1 }
    }
    cu.windK = lerp(cu.windK, wantW, clamp(dt * 14, 0, 1))
    cu.reachK = cu.ph === 'lunge' || cu.ph === 'feint' ? wantR : lerp(cu.reachK, wantR, clamp(dt * 10, 0, 1))
    cu.tell = Math.max(0, (cu.tell || 0) - dt)
    // 体を前へ（手を伸ばす）
    const g = c.g, lean = cu.reachK * 0.07 - cu.windK * (1 - cu.reachK) * 0.06
    c.root.rotation.x = lean
    c.root.position.z = cu.reachK * 0.05 / g.scale.x
    // 本物の伸ばしの合図: 肩がグッと沈む
    c.root.position.y = -Math.sin(Math.PI * clamp(cu.tell / 0.3, 0, 1)) * 0.07 / g.scale.x
    if (c.armR && !c.senjuG) aimArm(cu)
    if (cu.react > 0) { cu.react -= dt; if (cu.react <= 0 && cu.st === 'ready') play(c, 'idle', 0.3) }
    if (c.senjuG) for (const [k, arm] of c.arms.entries()) {
      const u = arm.userData, act = cu === CUR && k < 4 ? 1 : 0
      const wig = Math.sin(S.time * 3 + u.ph) * 0.12
      arm.rotation.set(0, 0, u.rest + wig * (1 + cu.windK * 2))
    }
    // 千手観音: 左右から金の手が4本のびてアイスに集まる
    if (c.grab) c.grab.forEach((gr, k) => {
      const kk = cu === CUR ? Math.max(cu.windK * 0.3, cu.reachK) : 0
      gr.hand.visible = gr.rod.visible = kk > 0.01
      if (kk <= 0.01) return
      const side = k % 2 ? 1 : -1, sc = c.h / 1.6
      _a.set(side * (0.55 + (k >> 1) * 0.12) * sc, (0.62 + (k >> 1) * 0.22) * sc, 0.12 * sc).divideScalar(c.g.scale.x); c.g.localToWorld(_a)
      spotPos(cu.aim[k % cu.aim.length] || 'C', _b).add(_q.set(side * 0.04, (k >> 1) ? -0.05 : 0.04, 0.03))
      _v2.lerpVectors(_a, _b, kk); _v2.y += Math.sin(S.time * 20 + k) * 0.03 * cu.windK * (1 - cu.reachK)
      gr.hand.position.copy(_v2); gr.hand.scale.setScalar(sc)
      const L = _a.distanceTo(_v2); gr.rod.position.copy(_a); _b.copy(_v2).sub(_a).normalize(); gr.rod.quaternion.setFromUnitVectors(_Y, _b); gr.rod.scale.set(sc, Math.max(0.01, L), sc)
    })
    if (c.halo) c.halo.material.emissiveIntensity = c.warn ? 0.6 + Math.sin(S.time * 18) * 0.5 : 0.9
    // 震え（限界）
    if (c.warn && cu.st === 'ready') c.root.position.x = Math.sin(S.time * 50) * 0.012 / g.scale.x; else c.root.position.x = 0
    if (cu.slap) { cu.slap = Math.max(0, cu.slap - dt * 2) }
    // 本物の伸ばしの合図アイコン（!、両手は!!）
    if (cu.tellIconT > 0) { cu.tellIconT -= dt; c.emo.visible = true; c.emo.material.map = emoTex(cu.tellIcon); if (cu.tellIconT <= 0) setEmo(cu) }
    // 表情マーク
    if (c.emo.visible) { headPos(c, c.emo.position); c.emo.position.add(_q.set(0.32 * c.h / CH, 0.0, 0)); const pulse = 1 + Math.sin(S.time * (c.warn ? 14 : 5)) * 0.1; c.emo.scale.setScalar(0.3 * pulse * Math.max(0.75, c.h / CH)) }
    if (cu.guards) for (const gd of cu.guards) { gd.mixer.update(dt); if (gd.emo.visible) { headPos(gd, gd.emo.position); gd.emo.position.x -= 0.3; gd.emo.scale.setScalar(0.3 * (1 + Math.sin(S.time * 14) * 0.1)) } if (gd.isBf && gd.warn && cu.st === 'ready') gd.root.position.x = Math.sin(S.time * 50) * 0.012 / gd.g.scale.x }
  }
  for (const cu of leaving) { cu.c.mixer.update(dt); if (cu.c.emo.visible) { headPos(cu.c, cu.c.emo.position); cu.c.emo.position.x += 0.3 } if (cu.guards) for (const gd of cu.guards) gd.mixer.update(dt) }
  if (P.c) { P.c.mixer.update(dt); poseArm(P.c.armR, 1, 0, 1.45, -0.2) }
  if (MASTER.c) MASTER.c.mixer.update(dt)
  updateCrowd(dt)
  for (const c of walkers) { c.mixer.update(dt); c.g.position.x += c.dir * c.sp * dt; if (c.g.position.x > 12) c.g.position.x = -12; if (c.g.position.x < -12) c.g.position.x = 12 }
  for (const g of lanterns) g.rotation.z = Math.sin(S.time * 1.3 + g.position.x) * 0.06
  for (const g of swayers) g.rotation.z = Math.sin(S.time * 1.7 + g.position.x * 3) * 0.15
  bell.userData.ring = Math.max(0, (bell.userData.ring || 0) - dt * 1.4); bell.rotation.z = Math.sin(S.time * 22) * 0.5 * bell.userData.ring
  // 空の色（昼→夕方）
  const k = clamp(S.ci / (D.DAY.length - 1), 0, 1) * (S.mode === 'title' ? 0 : 1)
  scene.background.copy(SKY0).lerp(SKY1, k * 0.85); scene.fog.color.copy(scene.background)
  lk.sun.color.setRGB(1, lerp(0.94, 0.72, k), lerp(0.85, 0.55, k))
  // シャッター
  if (S.shutT != null) { const u = ease(S.shutT / 0.8); shutterMesh.position.y = lerp(2.4, 0, u); $('#shutter').style.height = (u * 100) + '%' }
  if (P.c) P.c.g.visible = S.mode === 'title' || S.mode === 'resultWait' || S.mode === 'result' || !!S.camO
  frameCamera(dt)
}
let camInit = false
const camP = new THREE.Vector3(), camL = new THREE.Vector3()
function frameCamera(dt = 1) {
  const a = innerWidth / innerHeight, portrait = a < 1
  camera.aspect = a
  camera.fov = portrait ? clamp(52 / Math.max(0.55, a) * 0.62, 50, 66) : a > 1.9 ? 40 : 46
  if (S.mode === 'title') {
    // タイトル: 通りの側から屋台の正面（店員とマスター）
    _cp.set(portrait ? 0.4 : 1.1, 1.6, portrait ? 3.6 : 3.2); _cl.set(portrait ? 0.05 : -0.2, portrait ? 1.45 : 1.3, -0.6)
  } else {
    // 肩越し: 店員の右肩の後ろから客と棒の先
    const h = CUR ? CUR.def.h : CH, pres = CUR && CUR.k === 'president'
    // 店員の目線（一人称）。棒は右下から出る
    _cp.set(0.16, portrait ? 1.58 : 1.5, portrait ? -1.85 : -1.55)
    _cl.set(0.0, clamp(h * 0.66, 0.8, 1.12) - (portrait ? 0.14 : 0.04), CUST_Z)
    if (pres) { _cp.y += 0.08; _cp.z -= portrait ? 0.5 : 0.3; _cl.z += 0.3 }
  }
  if (S.camO) { _cp.set(...S.camO[0]); _cl.set(...S.camO[1]) }
  const snap = dt >= 1 || !camInit || S.camO; camInit = true
  if (snap) { camP.copy(_cp); camL.copy(_cl) } else { const k = clamp(dt * 4, 0, 1); camP.lerp(_cp, k); camL.lerp(_cl, k) }
  camera.position.copy(camP); camera.lookAt(camL)
  if (S.kick && S.mode !== 'title') {
    const u = S.kick.t, k = u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.12) / 1.1)
    if (S.kick.kind === 'fly') { camera.position.add(_q.set(0.15 * k, 0.35 * k, -1.0 * k)); camera.lookAt(camL); camera.rotateZ(0.55 * k) }
    else { camera.position.add(_q.set(-0.05 * k, -0.06 * k, 0.45 * k)); camera.lookAt(camL); camera.rotateZ(-0.12 * k) }
  }
  camera.updateProjectionMatrix()
}

// ---------- 画面の切り替え
const views = ['vTitle', 'vHow', 'vPlay', 'vResult']
function show(id) { for (const v of views) $('#' + v).hidden = v !== id; $('#moreBox').hidden = true }
function applyLang() {
  const T = TT()
  document.documentElement.lang = S.lang
  for (const el of document.querySelectorAll('[data-t]')) el.innerHTML = T[el.dataset.t]
  $('#langTxt').textContent = S.lang === 'ja' ? 'EN' : 'JA'
  $('#bMoreX').setAttribute('aria-label', T.close)
  for (const b of document.querySelectorAll('[data-ta]')) b.setAttribute('aria-label', T[b.dataset.ta])
  $('#hOf').textContent = T.of.replace('{N}', D.DAY.length)
  if (S.mode === 'result') drawSlip(S.stamped ? 1 : 0)
  if (!$('#moreBox').hidden) fillMore()
}
function clearPeople() {
  for (const cu of [...LINE, ...leaving]) { freeChar(cu.c); if (cu.guards) cu.guards.forEach(freeChar) }
  LINE = []; leaving.length = 0; CUR = null
}
function resetRun(seed) {
  S.rand = seed ? mulberry(seed) : Math.random
  clearFx(); clearPeople(); clearHandCones(); clearCrowd(); TIMERS.length = 0; signFall.visible = false
  Object.assign(S, { t: 0, ci: 0, spot: 'C', spotT: 1, moves: 0, tutIrk: 0, giving: 0, spin: 0, coneOn: true, coneT: 1, money: { tips: 0, teases: 0, close: 0, just: 0, stolen: 0, broke: 0, pres: 0, crowd: 0, crowdMax: 0, pen: { sign: 0, mom: 0, review: 0, heal: 0, clean: 0 } }, closed: false, incident: false, wary: false, kick: null, photo: null, photoScore: 0, capAt: null, ended: false, result: null, endT: 0, shutT: null, lastStolen: false, tutGave: false })
  shutterMesh.visible = false; shutterMesh.position.y = 2.4; $('#shutter').style.height = '0'; $('#vignette').classList.remove('boss')
  camInit = false; P.cone.visible = true
  $('#ctl').style.visibility = ''
}
function startRun(seed) {
  Snd.init(); Snd.sfx('tap')
  resetRun(seed)
  S.mode = 'play'; show('vPlay'); Snd.setTrack('play'); S.txtLog = []
  fillLine(); placeLine(false)
  for (const cu of LINE) { const [x, z] = [cu.tx, cu.tz]; cu.c.g.position.set(x + 2.2, 0, z + 0.8) }
  nextCustomer()
}
function toTitle() { Snd.sfx('tap'); resetRun(); S.mode = 'title'; show('vTitle'); Snd.setTrack('title') }
function updateHud() {
  const sh = D.SHIFT, k = clamp((S.ci + (CUR && CUR.st === 'done' ? 1 : 0)) / D.DAY.length, 0, 1), m = sh.h0 * 60 + (sh.h1 - sh.h0) * 60 * k
  const s = `${Math.floor(m / 60)}:${String(Math.floor(m % 60 / 10) * 10).padStart(2, '0')}`
  const el = $('#hClock'); if (el.textContent !== s) el.textContent = s
  const n = String(Math.min(D.DAY.length, S.ci + 1)); if ($('#hCust').textContent !== n) $('#hCust').textContent = n
  const ready = !!CUR && CUR.st === 'ready' && !S.giving
  $('#bGive').disabled = !ready
  for (const b of document.querySelectorAll('.dk')) { b.disabled = !ready; b.classList.toggle('on', b.dataset.dir === S.spot && S.spot !== 'C') }
}
// ---------- 結果（給料明細）
// 控除の行（客ごとのネタ）。紙に収まるよう、6行を超えたら小さいものを「そのほかの弁償」にまとめる
function dedRows(T, m, Y) {
  const p = m.pen, rows = [
    { label: T.dStolen, note: T.dStolenN.replace('{N}', m.stolen), yen: m.stolen * Y.ice },
    { label: T.dBroke, note: T.dBrokeN.replace('{N}', m.broke), yen: m.broke * Y.ice },
    ...(S.closed ? [{ label: T.dClosed, note: T.dClosedN, yen: Y.closed }] : []),
    ...(S.incident ? [{ label: T.dIncident, note: T.dIncidentN, yen: Y.incident }] : []),
    { label: T.dHeal, note: T.dHealN.replace('{N}', p.heal), yen: p.heal * Y.heal },
    { label: T.dSign, note: T.dSignN, yen: p.sign * Y.sign },
    { label: T.dClean, note: T.dCleanN.replace('{N}', p.clean), yen: p.clean * Y.clean },
    { label: T.dMom, note: T.dMomN.replace('{N}', p.mom), yen: p.mom * Y.mom },
    { label: T.dReview, note: T.dReviewN.replace('{N}', p.review), yen: p.review * Y.review },
  ]
  const nz = rows.filter(r => r.yen > 0)
  if (nz.length <= 6) return rows
  const keep = nz.slice(0, 5), rest = nz.slice(5)
  return [...keep, { label: T.dOther, note: T.dOtherN.replace('{N}', rest.length), yen: rest.reduce((a, r) => a + r.yen, 0) }]
}
function calcResult() {
  const T = TT(), Y = D.YEN, m = S.money
  const slip = {
    lang: S.lang, no: 3, job: T.job, date: (d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`)(new Date()), wage: D.SHIFT.wage, hours: D.SHIFT.hours,
    pay: [
      { label: T.tipL, note: T.tipN.replace('{N}', m.teases), yen: m.tips - m.just * Y.just },
      { label: T.justL, note: T.justN.replace('{N}', m.just), yen: m.just * Y.just },
      ...(m.crowd ? [{ label: T.crowdL, note: T.crowdN.replace('{N}', m.crowdMax), yen: m.crowd }] : []),
      ...(m.pres ? [{ label: T.presL, note: T.presN, yen: m.pres }] : []),
    ],
    ded: dedRows(T, m, Y),
    boss: T.bossName, footer: T.footer,
  }
  const net = totals(slip).net
  const nothing = m.teases === 0 && m.tips === 0 && m.pres === 0
  const rank = S.closed ? D.CLOSED : nothing ? D.RANKS[0] : [...D.RANKS].reverse().find(r => net >= r.min)
  slip.comment = rank.cmt[S.lang]; slip.stamp = rank.st[S.lang]
  return { slip, net, rank, raw: { ...m }, closed: S.closed, incident: S.incident }
}
const slipTheme = { main: '#b5102a', dark: '#3d0a12', accent: '#e9b44c', bg: '#2b1416' }
function drawSlip(k = 1) {
  const r = S.result; if (!r) return
  const fresh = calcResult(); r.slip = { ...fresh.slip, comment: r.rank.cmt[S.lang], stamp: r.rank.st[S.lang] }
  drawPayslip($('#slip'), { ...r.slip, photo: S.photo, stampK: k }, slipTheme)
}
async function toResult() {
  S.mode = 'resultWait'; S.result = calcResult(); S.resT = 0; S.stamped = false
  for (const id of ['#rBtns1', '#rBtns2', '#bMore']) $(id).classList.remove('on')
  try { await document.fonts.ready } catch (e) {}
  if (S.mode !== 'resultWait') return   // 待っている間にもう一回が始まった
  S.mode = 'result'; drawSlip(0); show('vResult'); clearFx(); fitSlip()
}
function fitSlip() {
  const c = $('#slip'); if ($('#vResult').hidden) return
  c.style.width = c.style.height = '0px'
  const box = c.parentElement.getBoundingClientRect(), side = $('.resSide').getBoundingClientRect()
  const row = getComputedStyle(c.parentElement).flexDirection === 'row'
  const aw = row ? box.width - side.width - 14 : box.width, ah = row ? box.height : box.height - side.height - 8
  const k = Math.max(0.05, Math.min(aw / 1080, ah / 1350))
  c.style.width = Math.floor(1080 * k) + 'px'; c.style.height = Math.floor(1350 * k) + 'px'
}
function updateReveal(dt) {
  if (S.mode !== 'result') return
  S.resT += dt
  if (S.resT > 0.6 && S.resT < 1.0) drawSlip(clamp((S.resT - 0.6) / 0.35, 0, 1))
  if (S.resT >= 1.0 && !S.stamped) { S.stamped = true; drawSlip(1); Snd.sfx('stamp') }
  if (S.resT > 1.3) for (const id of ['#rBtns1', '#rBtns2', '#bMore']) $(id).classList.add('on')
}
function finishReveal() { if (S.mode === 'result' && S.resT < 1.3) { S.resT = 1.29; updateReveal(0.02) } }
async function saveCard() {
  Snd.sfx('tap'); finishReveal()
  try { await document.fonts.ready } catch (e) {}
  const a = document.createElement('a'); a.href = $('#slip').toDataURL('image/png'); a.download = `job-turkish-ice-${S.result.net}.png`; document.body.appendChild(a); a.click(); a.remove()
}
function shareText() { const r = S.result, T = TT(); return T.share.replace('{Y}', (r.net < 0 ? '-' : '') + Math.abs(r.net).toLocaleString('en-US')).replace('{C}', S.lang === 'ja' ? `マスター「${r.rank.cmt.ja}」` : `Master: "${r.rank.cmt.en}"`) }
function xPost() { const text = shareText(); return { text, url: D.PUBLIC_URL, href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(D.PUBLIC_URL)}` } }
function openX() { if (!S.result) return; Snd.sfx('tap'); window.open(xPost().href, '_blank', 'noopener') }
// ほかのバカゲー
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function fillMore() { const L = S.lang; $('#moreL').innerHTML = D.others.map(g => `<a href="${esc(g.url)}" target="_blank" rel="noopener"><img src="${esc(g.url)}og.png" alt="" width="1200" height="630" decoding="async" onerror="this.style.visibility='hidden'"><b>${esc(g[L])}</b><span>${esc(L === 'ja' ? g.dj : g.de)}</span></a>`).join('') }
function openMore() { Snd.init(); Snd.sfx('tap'); fillMore(); $('#moreBox').hidden = false }
function closeMore() { if ($('#moreBox').hidden) return; $('#moreBox').hidden = true; Snd.sfx('tap') }

// ---------- 入力（ボタンは押した瞬間に効く。押しっぱなしは無い）
function padDown(id, fn) { $(id).addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); fn() }) }
padDown('#bGive', give)
for (const b of document.querySelectorAll('.dk')) padDown('#' + b.id, () => move(b.dataset.dir))
// 3D画面をスワイプしても動かせる（上下左右）
let swipe = null
canvas.addEventListener('pointerdown', e => { if (S.mode === 'play') { swipe = { x: e.clientX, y: e.clientY }; Snd.init() } })
addEventListener('pointerup', e => { if (!swipe) return; const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null; if (Math.hypot(dx, dy) < 24) return; move(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D')) })
const KEYDIR = { ArrowUp: 'U', w: 'U', W: 'U', ArrowDown: 'D', s: 'D', S: 'D', ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', c: 'C', C: 'C' }
addEventListener('keydown', e => {
  if (S.mode !== 'play') { if ((e.key === 'Enter' || e.key === ' ') && S.mode === 'title' && document.activeElement === document.body) { e.preventDefault(); startRun() } return }
  if (e.repeat) return
  if (KEYDIR[e.key]) { move(KEYDIR[e.key]); e.preventDefault() }
  else if (e.key === ' ' || e.key === 'Enter') { give(); e.preventDefault() }
})

// ---------- ループ（固定60Hz）
function render() { look.update(); fx.applyCamera(); renderer.render(scene, camera) }
let acc = 0, lastT = performance.now()
function step() {
  const vdt = fx.update(STEP)
  if (vdt > 0 || S.mode !== 'play') { updateGame(STEP); if (S.mode === 'end') updateEnd(STEP) }
  updateScene(STEP); updateFx(STEP); updateReveal(STEP); updateTutorial()
  if (S.doCap) { S.doCap = false; capturePhoto() }
}
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now(); let dt = (now - lastT) / 1000; lastT = now
  if (S.dbgPause) { Snd.tick(); render(); return }
  acc += Math.min(dt, 0.25)
  let n = 0; while (acc >= STEP && n < 8) { step(); acc -= STEP; n++ }
  if (n === 8) acc = 0
  if (S.mode === 'play') updateHud()
  Snd.tick(); render()
}
function syncMute() { $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted }
function resize() { renderer.setSize(innerWidth, innerHeight, false); frameCamera(); fitSlip() }

// ---------- 起動
applyLang(); syncMute(); resize()
addEventListener('resize', resize)
$('#bStart').onclick = () => startRun()
$('#bHow').onclick = () => { Snd.init(); Snd.sfx('tap'); show('vHow') }
$('#bHowBack').onclick = () => { Snd.sfx('tap'); show('vTitle') }
$('#bAgain').onclick = () => startRun()
$('#bTitle').onclick = () => toTitle()
$('#bSave').onclick = saveCard
$('#bX').onclick = openX
$('#bMore').onclick = openMore; $('#bMoreT').onclick = openMore; $('#bMoreX').onclick = closeMore
$('#moreBox').addEventListener('click', e => { if (e.target === e.currentTarget) closeMore() })
addEventListener('keydown', e => { if (e.key === 'Escape') closeMore() })
$('#vResult').addEventListener('pointerdown', e => { if (!e.target.closest('button')) finishReveal() })
$('#bLang').onclick = () => { Snd.init(); S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('lang', S.lang); applyLang(); Snd.sfx('tap') }
$('#bMute').onclick = () => { Snd.init(); Snd.setMute(!Snd.muted); syncMute() }
document.addEventListener('visibilitychange', () => { if (Snd.ctx) { if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume() } })
show('vTitle'); Snd.setTrack('title')
requestAnimationFrame(loop)
loadChars().then(() => { $('#loading').hidden = true; setupVendor(); setupMaster(); setupWalkers() })

// ---------- 検証用の窓口
window.TI = {
  S, Snd, D, camera, toScreen, xPost, calcResult, P,
  get CUR() { return CUR }, get LINE() { return LINE },
  get charsReady() { return charsReady && !!P.c },
  signVisible() { return signFall.visible },
  dbg: {
    pause(b = true) { S.dbgPause = b },
    step(n = 1) { for (let i = 0; i < n; i++) step(); if (S.mode === 'play') updateHud(); render() },
    tick(n = 1) { for (let i = 0; i < n; i++) step() },
    start(seed) { S.dbgPause = false; startRun(seed) },
    set(o) { Object.assign(S, o) },
    move, give,
    // 今の客まで飛ばす（並んでいる客を入れ替える）
    crowd() { return CROWD.filter(m => m.st !== 'out').length },
    crowdMult,
    texts() { return [...document.querySelectorAll('#fx > *')].length + (document.querySelector('#hint').hidden ? 0 : 1) },
    txtLog() { return (S.txtLog || []).map(it => ({ ch: it.kind, text: it.text, sub: it.sub || '', life: +it.life.toFixed(2), min: +it.min.toFixed(2), shown: it.shown != null ? +it.shown.toFixed(2) : null, prio: it.prio })) },
    addCrowd(n = 1) { for (let k = 0; k < n; k++) addCrowd() },
    skipTo(i) {
      clearPeople(); clearHandCones(); clearFx(); S.wary = false; signFall.visible = false; TIMERS.length = 0; S.ci = i; S.coneOn = true; S.spot = 'C'; S.spotT = 1; S.lastStolen = false
      fillLine(); placeLine(true); nextCustomer(); if (CUR) { CUR.c.g.position.set(CUR.tx, 0, CUR.tz); placeLine(true) }
      for (let k = 0; k < 3; k++) step()
    },
    ready() { return !!CUR && CUR.st === 'ready' },
    resolve() { let n = 0; while (CUR && ['wait', 'wind', 'feint', 'lunge'].includes(CUR.ph) && n++ < 600) step() },
    toLunge() { let n = 0; while (CUR && CUR.st === 'ready' && CUR.ph !== 'lunge' && n++ < 600) step() },
    free() { return SPOT_N.filter(x => CUR && !CUR.aim.includes(x)) },
    // 狙われていない場所へ1回で行ける方向
    dodgeDir() { const free = this.free(); for (const d of ['U', 'L', 'R', 'D', 'C']) { const to = d === 'C' ? 'C' : S.spot === OPP[d] ? 'C' : d; if (to !== S.spot && free.includes(to)) return d } return null },
    dodge(close) {
      this.toLunge(); if (!CUR || CUR.ph !== 'lunge') return false
      const cu = CUR
      for (let hand = 0; hand < 2 && CUR === cu && cu.ph === 'lunge'; hand++) {
        if (close) { for (let i = 0; i < Math.round(cu.pdur * 60 * 0.65); i++) step() }
        this.move(this.dodgeDir())
        let n = 0; while (CUR === cu && cu.ph === 'lunge' && cu.moved && n++ < 200) step()   // 1本目が終わるまで（両手なら2本目が始まる）
      }
      for (let i = 0; i < 30; i++) step(); return true
    },
    cust() { const c = CUR; return c ? { i: c.i, k: c.k, st: c.st, ph: c.ph, bfLeft: c.bf ? c.bfLeft : null, bfLine: c.bf ? c.bf.lastLine || '' : null, bfEmo: c.bf ? c.bf.emoK || null : null, fooled: !!c.fooled, dbl: !!c.dbl, pt: +c.pt.toFixed(2), aim: c.aim.slice(), spot: S.spot, irk: c.irk, teases: c.teases, left: c.left, pat: c.pat, idles: c.idles, tip: c.tip, done: c.done || null, emo: c.c.emoK || null, line: c.lastLine } : null },
    reachNow() { if (CUR) { CUR.ph = 'wind'; CUR.pt = CUR.pdur = CUR.def.wind * speedK(); CUR.aim = pickAim(CUR); Snd.sfx('wind') } },
    end() { endShift() },
    toResult() { toResult() },
    reveal() { finishReveal() },
    render() { render() },
    snap() { camInit = false; frameCamera(1); updateScene(0); frameCamera(1) },
  },
  state() {
    return { mode: S.mode, ci: S.ci, spot: S.spot, money: { ...S.money }, closed: S.closed, incident: S.incident, cust: this.dbg.cust(), result: S.result ? { net: S.result.net, stamp: S.result.rank.st.ja } : null }
  },
}
window.__tiReady = true
