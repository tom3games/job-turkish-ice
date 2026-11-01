// 検証用の自動プレイ（本番では読まない）。TIBot.run(steps, { rt:[最小,最大]ティック, give:'skill'|'quick'|'greedy'|'random', nothing })
window.TIBot = {
  w: 0, rt: 14, delay: 0, goal: null,
  r(a) { return a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1)) },
  tick(o) {
    const S = TI.S, cu = TI.CUR
    if (S.mode !== 'play' || !cu || cu.st !== 'ready' || S.giving) { this.w = 0; this.goal = null; return }
    if (o.nothing) return
    if (this.goal === null || this.goalFor !== cu) { this.goalFor = cu; this.goal = o.give === 'random' ? this.r([1, 4]) : 0 }
    const want = o.give === 'quick' ? true
      : o.give === 'greedy' ? false
      : o.give === 'random' ? cu.teases >= this.goal
      : cu.k === 'granny' ? false : cu.teases > 0 && cu.left <= 0
    if (want && S.want === 0) { TI.dbg.give(); return }
    if (S.want === 0) { if (cu.ph === 'idle') { if (++this.delay > (o.re ?? 8)) { TI.dbg.offer(); this.delay = 0 } } return }
    if (cu.ph === 'wind' || cu.ph === 'lunge') { if (++this.w >= this.rt) { TI.dbg.pull(); this.w = 0; this.rt = this.r(o.rt || [14, 14]) } }
    else this.w = 0
  },
  run(n, o = {}) { this.w = 0; this.rt = this.r(o.rt || [14, 14]); for (let i = 0; i < n && TI.S.mode === 'play'; i++) { this.tick(o); TI.dbg.tick(1) } return TI.state() },
}
