// 検証用の自動プレイ（本番では読まない）。TIBot.run(steps, { rt:[最小,最大]ティック, give:'skill'|'quick'|'greedy'|'random', nothing, spam })
window.TIBot = {
  w: 0, rt: 14, goal: null, n: 0,
  r(a) { return a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1)) },
  // 今の場所から1回押して行ける、狙われていない場所への方向
  dodgeDir(cu) {
    const S = TI.S, free = TI.dbg.free(), OPP = { U: 'D', D: 'U', L: 'R', R: 'L' }
    for (const d of ['U', 'L', 'R', 'D', 'C']) { const to = d === 'C' ? 'C' : S.spot === OPP[d] ? 'C' : d; if (to !== S.spot && free.includes(to)) return d }
    return 'U'
  },
  tick(o) {
    const S = TI.S, cu = TI.CUR
    if (S.mode !== 'play' || !cu || cu.st !== 'ready' || S.giving) { this.w = 0; this.goal = null; return }
    if (o.nothing) return
    if (o.spam) { if (++this.n % o.spam === 0) TI.dbg.move(['U', 'L', 'R', 'D'][this.r([0, 3])]); return }
    if (this.goal === null || this.goalFor !== cu) { this.goalFor = cu; this.goal = o.give === 'random' ? this.r([1, 4]) : 0 }
    const want = o.give === 'quick' ? true
      : o.give === 'greedy' ? false
      : o.give === 'random' ? cu.teases >= this.goal
      : cu.k === 'granny' ? false : cu.teases > 0 && (cu.left <= 0 || (cu.bf && cu.bfLeft <= 0))
    if (want && cu.ph !== 'lunge') { TI.dbg.give(); return }
    if (cu.ph === 'lunge' && !cu.moved) { if (++this.w >= this.rt) { TI.dbg.move(this.dodgeDir(cu)); this.w = 0; this.rt = this.r(o.rt || [14, 14]) } }
    else this.w = 0
  },
  run(n, o = {}) { this.w = 0; this.n = 0; this.rt = this.r(o.rt || [14, 14]); for (let i = 0; i < n && TI.S.mode === 'play'; i++) { this.tick(o); TI.dbg.tick(1) } return TI.state() },
}
