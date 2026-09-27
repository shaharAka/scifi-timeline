/* ============================================================================
   The ranking: which story are we in?

   Our own history is a chain of kinds of moment too, but it is not ONE chain.
   In four years we had a war begin, a ruler killed, a war settle into
   stalemate, machines that hack and a machine that slipped its test, and two
   trips to the Moon. A story walks one road over decades or centuries; we walk
   several at once. So our road is split into THREADS by what each moment is
   about (war and power, machines and science, space, markets and plagues),
   each thread is matched against every story on its own, and a story ranks by
   how much of our whole present it holds.

     rkFit(q, w, b)        one thread's recent steps q (weights w, newest
                           heaviest) against one story's chain b. The story may
                           match anywhere along its chain and may take extra
                           steps between ours (at a small cost), but the match
                           must end on a real match and each of our steps after
                           it costs RK_TAIL: where we are now has to count.
     rkRank(M, upto, add)  every story scored on our road as it stood after the
                           upto-th of our moments, optionally with one
                           hypothetical next step ("if the next headline is").
                           A story's fit is its thread fits averaged, each
                           thread weighted by how recently it moved.
     rkHistory(M)          the leader after each of our last RK_REPLAY moments.

   The share is a softmax of the fits. It is a share of the fit, not a
   probability: it says which story's road looks most like ours, not what will
   happen. The screen says so wherever it shows a number.
   ========================================================================== */

var RK_TLEN = 5;        /* how many of a thread's recent steps are matched */
var RK_DECAY = 0.8;     /* each older step of a thread counts this much of the one after it */
var RK_SIT = 0.15;      /* weight of situation likeness (facets) against chain order */
var RK_TEMP = 0.06;     /* softmax temperature: lower spreads the leader further ahead */
var RK_REPLAY = 10;     /* how many of our past moments the leader is replayed over */
var RK_HALF = 3;        /* a thread that has not moved for this many years counts half */
var RK_TAIL = -0.35;    /* each of a thread's steps after the story's last match */
/* A shared step is evidence in proportion to how rare it is. "A war begins"
   happens in dozens of stories, so sharing it says little; "an AI slips its
   limits" happens in a handful, so sharing it says a lot. Each of our steps is
   weighted by its specificity, log-scaled from 0 (every story has it) to 1 (no
   story has it); RK_COMMON is the floor, so even the commonest step counts a
   little and order still matters. */
var RK_COMMON = 0.2;
/* The ranking is ONE chain: our last RK_LEN moments, every thread together,
   in the order they happened. A story's steps count only where they come in
   the same order as ours (a subsequence: either side may have steps between),
   so "a war, then the leader killed, then AI" and "AI, then a war" are
   different roads. Skipping one of our steps is free, because no story walks
   every thread we do; skipping one of the story's costs a little; our steps
   after the story's last match cost RK_CHAIN_TAIL, so the present counts. */
var RK_MIN_IMPORTANCE = 2;
var RK_SINCE = 1991;        /* our road since the end of the Cold War: a window in years, so adding moments does not shrink it */
var RK_LEN = 400;           /* a safety cap on how many moments the window holds */
var RK_HALFLIFE = 15;       /* a moment this many years old counts half as much as today's */
/* how much a moment's size counts: importance 1, 2, 3 (set from its magnitude) */
var RK_IMPORTANCE = { 1:0.6, 2:0.8, 3:1 };
/* Order against chance: each story's in-order match is compared with the same
   story's steps in RK_SHUFFLES random orders, and RK_CHANCE of that chance
   level is taken off. A story sharing our steps in a scrambled order scores
   little; one sharing them in our order keeps its score. */
var RK_SHUFFLES = 10;
var RK_CHANCE = 0.7;
var RK_CHANCE_TOP = 30;
var RK_CHAIN_STORYGAP = 0;  /* a story may take any number of steps between ours */
var RK_CHAIN_TAIL = -0.05;  /* a little for each of our steps after the story's last match */
var RK_CACHE = { key:null, out:{} };

var RK_THREADS = [
  { id:"power",    label:"War and power",        short:"war" },
  { id:"machines", label:"Machines and science", short:"machines" },
  { id:"space",    label:"Space",                short:"space" },
  { id:"life",     label:"Markets and plagues",  short:"markets and plagues" }
];
var RK_SPACE_KINDS = { "voyage-into-unknown":1, "settlement-founded":1, "first-contact":1, "gateway-opens":1 };
/* which thread a moment belongs to, from its kind and its facets */
function rkThreadOf(bin, fx){
  if(RK_SPACE_KINDS[bin] || (fx && (fx.mechanism === "expedition" || fx.domain === "cosmic"))) return "space";
  var d = fx && fx.domain;
  if(d === "technological" || d === "scientific") return "machines";
  if(d === "economic" || d === "biological") return "life";
  if(d) return "power";
  return rkKindThread(bin);
}
/* a kind with no moment to hand (a hypothetical next step): the thread most
   of its moments in the atlas fall in */
var RK_KIND_THREAD = null;
function rkKindThread(bin){
  if(RK_SPACE_KINDS[bin]) return "space";
  if(!RK_KIND_THREAD){
    RK_KIND_THREAD = {};
    var n = {};
    function take(e){ if(!e.bin || !e.facets) return; var t = rkThreadOf(e.bin, e.facets); n[e.bin] = n[e.bin] || {}; n[e.bin][t] = (n[e.bin][t] || 0) + 1; }
    (DATA.lineages || []).forEach(function(l){ (l.events || []).forEach(take); });
    if(DATA.real && DATA.real.events) DATA.real.events.forEach(take);
    Object.keys(n).forEach(function(k){ var best = null; Object.keys(n[k]).forEach(function(t){ if(!best || n[k][t] > n[k][best]) best = t; }); RK_KIND_THREAD[k] = best; });
  }
  return RK_KIND_THREAD[bin] || "power";
}
/* A step is a token: its kind, and its sub-kind when it has one ("war-breaks-out|regional").
   The same kind with the same sub-kind is a full match; the same kind with a
   different sub-kind is a near miss (a crewed Moon flight against a robotic
   lander); the same kind where either side names no sub-kind scores between
   the two, and different kinds score by facet likeness as before. */
var RK_SUB_MISS = 0.35;
var RK_SUB_UNKNOWN = 0.7;
function rkTok(bin, sub){ return sub ? bin + "|" + sub : bin; }
function rkBin(tok){ return String(tok).split("|")[0]; }
function rkScore(a, b){
  if(a === b) return 1;
  var A = String(a).split("|"), B = String(b).split("|");
  if(A[0] !== B[0]) return chainScore(A[0], B[0]);
  return (A[1] && B[1]) ? RK_SUB_MISS : RK_SUB_UNKNOWN;
}
/* how many stories pass through a step (kind and sub-kind), and how specific
   that makes it: 1 for a step no story has, 0 for one every story has */
function rkStoriesWith(M, tok){
  if(!M._rkCount){
    var c = {};
    M.strands.forEach(function(st){ var seen = {}; rkToks(st).forEach(function(t){ if(!seen[t]){ seen[t] = true; c[t] = (c[t] || 0) + 1; } }); });
    M._rkCount = c;
  }
  return M._rkCount[tok] || 0;
}
function rkSpecific(M, tok){
  var n = M.strands.length;
  return n ? Math.max(0, Math.min(1, Math.log((n + 1) / (rkStoriesWith(M, tok) + 1)) / Math.log(n + 1))) : 0;
}
/* a story's chain as tokens, cached on the strand */
function rkToks(st){ return st._toks || (st._toks = st.seq.map(function(x){ return rkTok(x.bin, x.e.sub); })); }
/* "A voyage into the unknown: crewed, to the Moon" */
function rkSubLabel(bin, sub){
  var sp = mpSpec(bin), o = null;
  (sp.subs || []).forEach(function(x){ if(x.id === sub) o = x; });
  return o ? o.label : "";
}
function rkLabel(tok){
  var bin = rkBin(tok), sub = String(tok).split("|")[1], sl = sub ? rkSubLabel(bin, sub) : "";
  return mpLabel(bin) + (sl ? ": " + sl : "");
}
function rkThreadSpec(id){ var o = null; RK_THREADS.forEach(function(t){ if(t.id === id) o = t; }); return o; }

/* our road: every real moment with a kind, in order, each with its thread */
function rkRoad(M){
  var out = [];
  /* only moments of the size a story's beats have: world-scale and major
     (importance 3 and 2); the smaller ones stay in our history, not the chain */
  (M.realEv || []).forEach(function(e){ if(e.bin && (e.importance || 2) >= RK_MIN_IMPORTANCE) out.push({ kind:e.bin, tok:rkTok(e.bin, e.sub), e:e, thread:rkThreadOf(e.bin, e.facets) }); });
  return out;
}

function rkFit(q, w, b, o){
  o = o || {};
  var OG = o.ourGap != null ? o.ourGap : CH_GAP, SG = o.storyGap != null ? o.storyGap : CH_GAP * 0.5, TL = o.tail != null ? o.tail : RK_TAIL;
  var n = q.length, m = b.length, i, j, H = [];
  for(i = 0; i <= n; i++){ H.push(new Array(m + 1)); for(j = 0; j <= m; j++) H[i][j] = 0; }
  for(i = 1; i <= n; i++){
    for(j = 1; j <= m; j++){
      var sc0 = rkScore(q[i - 1], b[j - 1]);
      /* noMismatch: a chain pairs only the same kind (a near miss by sub-kind
         still counts, partly); two different kinds are skipped, never paired */
      var d = (o.noMismatch && rkBin(q[i - 1]) !== rkBin(b[j - 1])) ? -Infinity : H[i - 1][j - 1] + w[i - 1] * sc0;
      var u = H[i - 1][j] + w[i - 1] * OG;   /* one of our steps the story lacks */
      var l = H[i][j - 1] + w[i - 1] * SG;   /* a step of the story's we skipped: stories compress and stretch */
      H[i][j] = Math.max(0, d, u, l);
    }
  }
  /* anchored at our end: the alignment ends on a real match, and every one of
     our steps after that match costs RK_TAIL, so a story that has nothing like
     where we are now cannot lead on how it matched our past */
  var best = 0, bi = 0, bj = 0, tail = [0];
  for(i = n; i >= 1; i--) tail[n - i + 1] = tail[n - i] + w[i - 1] * TL;
  for(i = 1; i <= n; i++){
    for(j = 1; j <= m; j++){
      var sc = rkScore(q[i - 1], b[j - 1]);
      if(sc <= 0 || (o.noMismatch && rkBin(q[i - 1]) !== rkBin(b[j - 1]))) continue;
      var v = H[i - 1][j - 1] + w[i - 1] * sc + tail[n - i];
      if(v > best){ best = v; bi = i; bj = j; }
    }
  }
  var pairs = [];
  i = bi; j = bj;
  if(bi){ pairs.push([i - 1, j - 1]); i--; j--; }
  while(i > 0 && j > 0 && H[i][j] > 0){
    var here = H[i][j];
    var diag = (o.noMismatch && rkBin(q[i - 1]) !== rkBin(b[j - 1])) ? -Infinity : H[i - 1][j - 1] + w[i - 1] * rkScore(q[i - 1], b[j - 1]);
    if(Math.abs(here - diag) < 1e-9){ pairs.push([i - 1, j - 1]); i--; j--; }
    else if(Math.abs(here - (H[i - 1][j] + w[i - 1] * OG)) < 1e-9) i--;
    else j--;
  }
  pairs.reverse();
  var tot = 0; w.forEach(function(x){ tot += x; });
  var at = pairs.length ? pairs[pairs.length - 1][1] : -1;
  return { score:best, norm:tot ? Math.max(0, best / tot) : 0, pairs:pairs, at:at };
}

/* situation: how alike a thread's last few moments are to anything in the
   story, by facets, newest heaviest */
function rkSituation(qr, st){
  var last = qr.slice(-3), s = 0, tw = 0;
  last.forEach(function(r, k){
    if(!r.e.facets) return;
    var wt = Math.pow(RK_DECAY, last.length - 1 - k), best = 0;
    st.seq.forEach(function(x){ if(x.e.facets){ var v = facetSim(r.e.facets, x.e.facets); if(v > best) best = v; } });
    s += wt * best; tw += wt;
  });
  return tw ? s / tw : 0;
}

/* the match a story would get with its own steps in random order: the same
   steps, no order. Seeded by the story's id so a ranking never flickers. */
function rkSeed(str){ var h = 2166136261; for(var i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rkRand(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rkChance(q, w, toks, fo, id){
  if(toks.length < 2) return 0;
  var rnd = rkRand(rkSeed(id)), sum = 0;
  for(var k = 0; k < RK_SHUFFLES; k++){
    var b = toks.slice();
    for(var i = b.length - 1; i > 0; i--){ var j = Math.floor(rnd() * (i + 1)); var tmp = b[i]; b[i] = b[j]; b[j] = tmp; }
    sum += rkFit(q, w, b, fo).norm;
  }
  return sum / RK_SHUFFLES;
}
function rkSoftmax(rows, key, out){
  var mx = -Infinity; rows.forEach(function(r){ if(r[key] > mx) mx = r[key]; });
  var z = 0; rows.forEach(function(r){ r._x = Math.exp((r[key] - mx) / RK_TEMP); z += r._x; });
  rows.forEach(function(r){ r[out] = z ? r._x / z : 0; });
}

/* every story on our road as it stood after `upto` moments (default: all),
   with an optional hypothetical next kind */
function rkRank(M, upto, add){
  var road = rkRoad(M);
  if(upto == null) upto = road.length;
  if(RK_CACHE.key !== M){ RK_CACHE.key = M; RK_CACHE.out = {}; }
  var key = upto + "|" + (add || "");
  if(RK_CACHE.out[key]) return RK_CACHE.out[key];
  var mine = road.slice(0, upto), last = mine[mine.length - 1];
  if(add) mine = mine.concat([{ kind:rkBin(add), tok:add, thread:rkKindThread(rkBin(add)), e:{ title:"If the next headline is: " + rkLabel(add).toLowerCase(), year:last ? last.e.year : NOW, hypothetical:true } }]);
  var nowY = mine.length ? mine[mine.length - 1].e.year : NOW;
  /* each thread's recent steps, repeats of one kind collapsed into the latest */
  var threads = RK_THREADS.map(function(t){
    var qr = [];
    mine.forEach(function(r){
      if(r.thread !== t.id) return;
      if(qr.length && qr[qr.length - 1].tok === r.tok) qr[qr.length - 1] = r; else qr.push(r);
    });
    qr = qr.slice(-RK_TLEN);
    var q = qr.map(function(r){ return r.tok; });
    var w = q.map(function(tok, i){ return Math.pow(RK_DECAY, q.length - 1 - i) * (RK_COMMON + (1 - RK_COMMON) * rkSpecific(M, tok)); });
    var lastY = qr.length ? qr[qr.length - 1].e.year : -Infinity;
    return { id:t.id, spec:t, qr:qr, q:q, w:w, weight:qr.length ? Math.pow(0.5, Math.max(0, nowY - lastY) / RK_HALF) : 0, rows:[] };
  }).filter(function(t){ return t.q.length; });
  /* the one chain: every thread together, repeats of a step collapsed */
  var cqr = [];
  mine.forEach(function(r){ if(cqr.length && cqr[cqr.length - 1].tok === r.tok) cqr[cqr.length - 1] = r; else cqr.push(r); });
  cqr = cqr.filter(function(r){ return r.e.year >= RK_SINCE; }).slice(-RK_LEN);
  var cq = cqr.map(function(r){ return r.tok; });
  var cw = cqr.map(function(r){
    var age = Math.max(0, nowY - r.e.year);
    return Math.pow(0.5, age / RK_HALFLIFE) * (RK_IMPORTANCE[r.e.importance] || RK_IMPORTANCE[2]) * (RK_COMMON + (1 - RK_COMMON) * rkSpecific(M, r.tok));
  });
  var chain = { qr:cqr, q:cq, w:cw };
  var rows = M.strands.map(function(st){
    var toks = rkToks(st), per = {};
    var fo = { ourGap:0, storyGap:RK_CHAIN_STORYGAP, tail:RK_CHAIN_TAIL, noMismatch:true };
    var f = rkFit(cq, cw, toks, fo), sit = rkSituation(cqr.slice(-3), st);
    var chance = null, orderFit = f.norm;
    return { st:st, fit:0, chain:f.norm, chance:chance, sit:sit, pairs:f.pairs, at:f.at, per:per, toks:toks };
  });
  /* the chance baseline is costly (RK_SHUFFLES alignments a story), so it is
     measured for the RK_CHANCE_TOP strongest raw matches; the rest cannot lead,
     and are scored as if their order were no better than chance */
  var byRaw = rows.slice().sort(function(a, b){ return b.chain - a.chain; });
  byRaw.forEach(function(r, i){
    r.chance = i < RK_CHANCE_TOP ? rkChance(cq, cw, r.toks, { ourGap:0, storyGap:RK_CHAIN_STORYGAP, tail:RK_CHAIN_TAIL, noMismatch:true }, r.st.id) : r.chain;
    r.orderFit = Math.max(0, r.chain - RK_CHANCE * r.chance);
    r.fit = (1 - RK_SIT) * r.orderFit + RK_SIT * r.sit;
  });
  rkSoftmax(rows, "fit", "share");
  rows.sort(function(a, b){ return b.fit - a.fit || a.st.l.title.localeCompare(b.st.l.title); });
  rows.forEach(function(r, i){ r.rank = i + 1; });
  var out = { rows:rows, threads:threads, chain:chain, road:road, mine:mine, upto:upto, add:add || null, last:mine[mine.length - 1] || null };
  RK_CACHE.out[key] = out;
  return out;
}
/* the threads, for the ranking page's thread-by-thread view only: fitted on
   demand, since nothing else needs them */
function rkThreadRows(M, R){
  if(R._threadsDone) return R.threads;
  R.threads.forEach(function(t){
    t.rows = M.strands.map(function(st){
      var tf = rkFit(t.q, t.w, rkToks(st)), tsit = rkSituation(t.qr, st);
      return { st:st, thread:t, fit:(1 - RK_SIT) * tf.norm + RK_SIT * tsit, chain:tf.norm, sit:tsit, pairs:tf.pairs, at:tf.at };
    });
    rkSoftmax(t.rows, "fit", "share");
    t.rows.sort(function(a, b){ return b.fit - a.fit || a.st.l.title.localeCompare(b.st.l.title); });
  });
  R._threadsDone = true;
  return R.threads;
}
function rkRankOf(R, id){ var o = null; R.rows.forEach(function(r){ if(r.st.id === id) o = r; }); return o; }
/* every matched pair of a story, over all threads, as {thread, ours, theirs, same} */
function rkPairs(R, r){
  var C = R.chain, toks = rkToks(r.st);
  return r.pairs.map(function(p){
    var ours = C.qr[p[0]];
    return { ours:ours, theirs:r.st.seq[p[1]], j:p[1], thread:rkThreadSpec(ours.thread), same:C.q[p[0]] === toks[p[1]], kin:rkBin(C.q[p[0]]) === r.st.kinds[p[1]] };
  });
}

/* the leader after each of our last moments */
function rkHistory(M){
  var road = rkRoad(M), out = [];
  for(var u = Math.max(1, road.length - RK_REPLAY + 1); u <= road.length; u++){
    var R = rkRank(M, u);
    out.push({ step:road[u - 1], top:R.rows[0], R:R });
  }
  return out;
}

/* what the next step would do: the kinds the leading stories go on to, each
   tried as our next step */
function rkWhatIf(M, R){
  /* our own steps as tokens: a kind counts as "happened to us" only in the
     sub-kind it happened in (we have had regional wars, not machine coups) */
  var tried = {}, out = [], ours = {};
  R.road.forEach(function(r){ ours[r.tok] = true; if(r.tok === r.kind) ours[r.kind] = true; });
  function tryKind(k, why){
    /* only kinds of moment that have happened to us: a real headline could
       be one, a time traveller arriving could not */
    if(!k || tried[k] || !ours[k]) return;
    tried[k] = true;
    var R2 = rkRank(M, R.upto, k), top = R2.rows[0];
    out.push({ kind:k, why:why, top:top, R:R2, changes:top.st !== R.rows[0].st });
  }
  function after(st, at){ var nx = at >= 0 ? st.seq[at + 1] : null; if(nx) tryKind(rkTok(nx.bin, nx.e.sub), st.l.title); }
  R.rows.slice(0, 8).forEach(function(r){ after(r.st, r.at); });

  out.sort(function(a, b){ return (b.changes - a.changes) || (b.top.share - a.top.share); });
  return out.slice(0, 6);
}

/* how many times an average story's share: among ninety-odd stories a lead of
   7% is seven times the rest, and "7%" alone reads as nothing */
function rkTimes(R, r){ var x = r.share * R.rows.length; return x >= 1.5 ? (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10) + "\u00d7 an average story\u2019s share" : ""; }
function rkPct(x){ var p = x * 100; return (p >= 10 ? Math.round(p) : p >= 1 ? p.toFixed(1).replace(/\.0$/, "") : p > 0 ? "<1" : "0") + "%"; }
var RK_MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function rkWhen(e){
  var d = String(e.date || "");
  if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return fmtNewsDate(d);
  if(/^\d{4}-\d{2}$/.test(d)) return RK_MON[parseInt(d.slice(5), 10) - 1] + " " + d.slice(0, 4);
  return fmtYearFull(e.year);
}
function rkMove(r, prev){
  if(!prev) return "";
  var p = rkRankOf(prev, r.st.id); if(!p) return '<span class="rk-mv new">new</span>';
  var d = p.rank - r.rank;
  return d > 0 ? '<span class="rk-mv up" title="up ' + d + ' since our last step">▲' + d + '</span>'
       : d < 0 ? '<span class="rk-mv down" title="down ' + (-d) + ' since our last step">▼' + (-d) + '</span>'
       : '<span class="rk-mv same" title="no change since our last step">–</span>';
}

/* the leader explained: our steps beside its steps, thread by thread */
function rkWhyHtml(R, r){
  /* the matched chain, in order: each of our moments beside the story's */
  var ps = rkPairs(R, r);
  if(!ps.length) return '<p class="mp-none">It shares no step with our recent road.</p>';
  return '<p class="pk-small">In order, top to bottom, for us and for the story.</p><ol class="rk-pairs">' + ps.map(function(p){
    var ours = p.ours, theirs = p.theirs, ttok = rkToks(r.st)[p.j], same = p.same;
    return '<li class="' + (same ? 'same' : 'near') + '"><div class="rk-us"><span class="pk-yr">' + esc(rkWhen(ours.e)) + '</span><span>' + esc(ours.e.title) + '</span></div>'
      + '<div class="rk-k"><button class="pk-kindtag btn" data-kind="' + esc(theirs.bin) + '">' + esc(rkLabel(ours.tok)) + (same ? '' : ' ≈ ' + esc(ours.kind === theirs.bin ? (rkSubLabel(theirs.bin, theirs.e.sub) || mpLabel(theirs.bin)) : rkLabel(ttok))) + '</button></div>'
      + '<div class="rk-them"><span class="pk-yr">' + esc(fmtYearFull(theirs.e.year)) + '</span><span>' + esc(theirs.e.title) + '</span></div></li>';
  }).join("") + '</ol>';
}
function rkNextHtml(r, n){
  var rest = r.at >= 0 ? r.st.seq.slice(r.at + 1, r.at + 1 + (n || 3)) : [];
  var html = '<ol class="pk-steps rk-next">';
  rest.forEach(function(x){
    html += '<li><span class="pk-yr">' + esc(fmtYear(x.e.year)) + '</span><div class="pk-step"><div class="pk-step-t">' + esc(x.e.title) + '</div>'
      + '<button class="pk-kindtag btn" data-kind="' + esc(x.bin) + '">' + esc(rkLabel(rkTok(x.bin, x.e.sub))) + '</button></div></li>';
  });
  var l = r.st.l;
  html += '<li class="pk-endstep ' + r.st.ending.valence + '"><span class="pk-yr"></span><div class="pk-step"><div class="pk-step-t">' + esc(r.st.ending.label) + '</div>'
    + '<div class="pk-step-d">' + esc((l.ending && l.ending.why) || "") + '</div></div></li></ol>';
  return html;
}

/* a short sentence for a story's fit, for Today and for sharing */
function rkLine(R, r){
  var ps = rkPairs(R, r), same = ps.filter(function(p){ return p.same; }).length, th = {};
  ps.forEach(function(p){ if(p.thread) th[p.thread.id] = p.thread.short; });
  var names = Object.keys(th).map(function(k){ return th[k]; });
  if(!ps.length) return "walks a different road from ours";
  return same + (same === 1 ? ' of our recent moments' : ' of our recent moments') + ' in the same order' + (ps.length > same ? ' and ' + (ps.length - same) + ' nearly alike' : '')
    + ', on ' + (names.length > 1 ? names.slice(0, -1).join(", ") + ' and ' + names[names.length - 1] : names[0]);
}

/* --- the screen ------------------------------------------------------------------ */
function pickerRankHtml(M){
  var R = rkRank(M), prev = R.upto > 1 ? rkRank(M, R.upto - 1) : null, top = R.rows[0];
  if(!top) return '<p class="mp-none">No stories to rank.</p>';
  var st = top.st, l = st.l, art = typeof artFor === "function" ? artFor(l.id) : null;
  var hist = rkHistory(M), since = null;
  for(var h = hist.length - 1; h >= 0 && hist[h].top.st === st; h--) since = hist[h];
  var wasTop = prev && prev.rows[0].st !== st ? prev.rows[0] : null;
  var html = '<header class="pk-hello rk-hello"><div class="mp-kicker">Which story are we in? · as of ' + esc(rkWhen(R.last.e)) + '</div>'
    + '<h1>Our road, ranked against ' + M.strands.length + ' stories</h1>'
    + '<p>We live several stories at once: a war, the machines, the Moon. Each thread of our recent history is lined up in order against every story’s chain, and a story ranks by how much of our whole present it walked.</p></header>';
  html += '<div class="pk-cols"><div class="pk-main">';
  /* the leader */
  html += '<section class="rk-top ' + st.ending.valence + '">'
    + '<button class="rk-top-hero' + (art && art.lg ? '' : ' none') + '" data-world="' + esc(l.id) + '">' + (art && art.lg ? '<img src="' + esc(art.lg) + '" alt="" decoding="async">' : '')
    + '<span class="rk-top-t"><span class="rk-top-k">Top candidate' + (wasTop ? ' · new, taking over from ' + esc(wasTop.st.l.title) : since && since !== hist[hist.length - 1] ? ' since ' + esc(rkWhen(since.step.e)) : '') + '</span>'
    + '<span class="rk-top-title">' + esc(l.title) + '</span>'
    + '<span class="rk-top-share"><b>' + rkPct(top.share) + '</b> of the fit' + (rkTimes(R, top) ? ', ' + esc(rkTimes(R, top)) : '') + ' · ' + esc(rkLine(R, top)) + '</span></span></button>'
    + (mpIsPhone() ? rkRaceHtml(M, false) : '')
    + '<div class="rk-top-body"><h3 class="pk-sh">Why it fits: our road beside its road</h3>' + rkWhyHtml(R, top)
    + '<h3 class="pk-sh">If we are in ' + esc(l.title) + ', what comes next</h3>' + rkNextHtml(top, 3)
    + '<div class="pk-actions"><button class="pk-btn primary" data-share="rank" data-share-title="' + esc("Which story are we in? Today: " + l.title + " (" + rkPct(top.share) + " of the fit)") + '">Share today’s ranking</button>'
    + '<button class="pk-btn" data-world="' + esc(l.id) + '">Read the whole story</button></div></div></section>';
  /* thread by thread */
  html += '<section class="pk-sec"><h3 class="pk-sh">Thread by thread</h3><div class="rk-threads">'
    + rkThreadRows(M, R).map(function(t){
      var lead = t.rows.slice(0, 3);
      return '<div class="rk-thread"><div class="rk-th"><span class="rk-thl">' + esc(t.spec.label) + '</span>'
        + (t.weight < 0.75 ? '<span class="rk-thn">quiet lately, counts ' + Math.round(t.weight * 100) + '%</span>' : '') + '</div>'
        + '<p class="rk-road">' + t.qr.map(function(r){ return '<span>' + esc(fmtYearFull(r.e.year)) + ' ' + esc(rkLabel(r.tok).toLowerCase()) + '</span>'; }).join(' <i>→</i> ') + '</p>'
        + lead.map(function(x, i){
          return '<button class="rk-trow' + (i ? '' : ' lead') + '" data-world="' + esc(x.st.id) + '"><span class="rk-n">' + (i + 1) + '</span><span class="pk-rtitle">' + esc(x.st.l.title) + '</span><em>' + rkPct(x.share) + '</em>' + pkBadge(x.st) + '</button>';
        }).join("") + '</div>';
    }).join("") + '</div></section>';
  /* everyone */
  var mxs = R.rows[0].share || 1;
  html += '<section class="pk-sec"><h3 class="pk-sh">All ' + R.rows.length + ' stories, ranked</h3><ol class="rk-list">'
    + R.rows.map(function(r){
      var nx = r.at >= 0 ? r.st.seq[r.at + 1] : null, any = rkPairs(R, r).length;
      return '<li><button class="rk-row ' + r.st.ending.valence + '" data-world="' + esc(r.st.id) + '">'
        + '<span class="rk-n">' + r.rank + '</span>' + pkThumb(r.st.id, "pk-rthumb")
        + '<span class="rk-b"><span class="pk-rtop"><span class="pk-rtitle">' + esc(r.st.l.title) + '</span>' + rkMove(r, prev) + pkBadge(r.st) + '</span>'
        + '<span class="rk-bar"><i style="width:' + Math.max(1.5, 100 * r.share / mxs).toFixed(1) + '%"></i><em>' + rkPct(r.share) + '</em></span>'
        + '<span class="pk-rline sub">' + (any ? (nx ? 'next there: ' + esc(nx.e.title) : 'and there it ends: ' + esc(r.st.ending.label.toLowerCase())) : 'walks a different road') + '</span></span></button></li>';
    }).join("") + '</ol>'
    + '<p class="pk-small rk-honest">A share of the fit, not a forecast: it says whose road looks most like ours so far, not what will happen next. The same kind of moment counts fully, the same kind done differently (a crewed Moon flight against a robotic lander) about a third, and a similar kind partly; newer steps count more, and a thread that has gone quiet counts less. A quarter of each fit is how alike the situations were: who acted, how, and which way power moved.</p></section>';
  html += '</div><aside class="pk-aside">';
  if(!mpIsPhone()) html += rkRaceHtml(M, true);
  /* the leader over time */
  html += '<section class="pk-sec"><h3 class="pk-sh">Top candidate after each of our moments</h3><ol class="rk-hist">'
    + hist.slice().reverse().map(function(x, i, arr){
      var before = arr[i + 1], chg = before && before.top.st !== x.top.st;
      return '<li class="' + (chg ? 'chg' : '') + '"><button data-beat="' + esc(x.step.e.id || "") + '"><span class="pk-yr">' + esc(rkWhen(x.step.e)) + '</span>'
        + '<span class="pk-rt"><span class="pk-rtitle">' + esc(x.step.e.title) + '</span>'
        + '<span class="rk-lead">' + pkThumb(x.top.st.id, "rk-mini") + '<span>' + esc(x.top.st.l.title) + ' <em>' + rkPct(x.top.share) + '</em></span>' + (chg ? '<span class="rk-mv new">new leader</span>' : '') + '</span></span></button></li>';
    }).join("") + '</ol></section>';
  /* what the next headline would do */
  var wi = rkWhatIf(M, R);
  if(wi.length){
    html += '<section class="pk-sec"><h3 class="pk-sh">If the next headline is…</h3><div class="rk-if">'
      + wi.map(function(x){
        return '<button class="rk-ifrow" data-world="' + esc(x.top.st.id) + '"><span class="rk-ifk">' + esc(rkLabel(x.kind)) + '</span>'
          + '<span class="rk-ifv">' + (x.changes ? 'the lead passes to <b>' + esc(x.top.st.l.title) + '</b>' : '<b>' + esc(x.top.st.l.title) + '</b> stays ahead') + ' <em>' + rkPct(x.top.share) + '</em></span></button>';
      }).join("") + '</div><p class="pk-small">Each is a step one of the leading stories takes next, and has happened to us before, tried as our next step.</p></section>';
  }
  html += '</aside></div>';
  return html;
}

/* --- the race: who led after each of our moments ----------------------------------
   A bump chart. Columns are our last moments, rows are ranks, one line per
   story that was in the top three at any of them. It is the picture of the
   whole idea: every headline re-sorts the stories. Drawn as a string of SVG at
   a given pixel size so the same code serves the page and the poster cards. */
var RK_HUES = ["#3b7ddd", "#e0703c", "#2f9e6e", "#b25bb0", "#d2a32a", "#48b2c6", "#d45b73", "#8c9a2e", "#7a6fe0"];
/* the stories the race draws: any that reached the top three, most often
   ahead first, and today's top three always */
function rkRaceLines(M, hist, n){
  var pick = {}, order = [];
  hist.forEach(function(h){ h.R.rows.slice(0, 3).forEach(function(r, i){
    if(!pick[r.st.id]){ pick[r.st.id] = { st:r.st, score:0 }; order.push(pick[r.st.id]); }
    pick[r.st.id].score += 3 - i;
  }); });
  var last = hist[hist.length - 1].R;
  order.sort(function(a, b){ return b.score - a.score; });
  order = order.slice(0, n || 6);  /* plus today's top three: at most nine, one hue each */
  last.rows.slice(0, 3).forEach(function(r){ if(!order.some(function(x){ return x.st === r.st; })) order.push({ st:r.st, score:0 }); });
  order.forEach(function(x, k){ x.hue = RK_HUES[k % RK_HUES.length]; x.now = rkRankOf(last, x.st.id); });
  return order;
}
function rkRaceSvg(M, o){
  o = o || {};
  var hist = rkHistory(M), W = o.w || 640, H = o.h || 300, dark = !!o.dark;
  var fs = o.font || 12, labW = o.labW || Math.min(170, W * 0.34), top = fs * 0.8, bot = o.axis === false ? 12 : fs * 2.6 + 10;
  var maxR = o.ranks || 5, n = hist.length, last = hist[n - 1].R;
  var order = rkRaceLines(M, hist, o.lines);
  var x0 = fs * 1.6, x1 = W - labW - 8, y0 = top, y1 = H - bot;
  function X(i){ return n > 1 ? x0 + (x1 - x0) * i / (n - 1) : (x0 + x1) / 2; }
  function Y(rank){ return y0 + (y1 - y0) * (rank - 1) / Math.max(1, maxR - 1); }
  var ink = dark ? "rgba(255,255,255,.9)" : "var(--ink-0)", ink3 = dark ? "rgba(255,255,255,.5)" : "var(--ink-3)", grid = dark ? "rgba(255,255,255,.09)" : "var(--line-1)", bg = dark ? "#151c26" : "var(--surface)";
  var s = '<svg class="rk-race" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Which story led after each of our last ' + n + ' moments">';
  for(var r = 1; r <= maxR; r++){
    s += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(r).toFixed(1) + '" y2="' + Y(r).toFixed(1) + '" stroke="' + grid + '" stroke-width="1"/>'
      + '<text x="' + (x0 - fs * 0.7) + '" y="' + (Y(r) + fs * 0.33).toFixed(1) + '" font-size="' + fs * 0.8 + '" text-anchor="end" fill="' + ink3 + '" font-family="ui-monospace,monospace">' + r + '</text>';
  }
  /* columns: a short date per moment; a solid column where the lead changed */
  hist.forEach(function(h, i){
    var chg = i && hist[i - 1].top.st !== h.top.st;
    s += '<line x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + y0 + '" y2="' + y1 + '" stroke="' + grid + '" stroke-width="' + (chg ? 1.5 : 1) + '" stroke-dasharray="' + (chg ? '0' : '2 5') + '"/>';
    if(o.axis !== false && (W / n > fs * 3.4 || i % 2 === (n - 1) % 2)){
      var d = String(h.step.e.date || h.step.e.year), mon = /^\d{4}-\d{2}/.test(d) ? RK_MON[parseInt(d.slice(5, 7), 10) - 1] : "";
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (y1 + fs + 8) + '" font-size="' + fs * 0.85 + '" text-anchor="middle" fill="' + ink3 + '">' + esc(mon) + '</text>'
        + '<text x="' + X(i).toFixed(1) + '" y="' + (y1 + fs * 2 + 9) + '" font-size="' + fs * 0.85 + '" text-anchor="middle" fill="' + ink3 + '" font-family="ui-monospace,monospace">’' + esc(d.slice(2, 4)) + '</text>';
    }
    s += '<rect x="' + (X(i) - 12).toFixed(1) + '" y="' + y0 + '" width="24" height="' + (y1 - y0) + '" fill="transparent"><title>' + esc(rkWhen(h.step.e) + ': ' + h.step.e.title + ' → ' + h.top.st.l.title + ' leads') + '</title></rect>';
  });
  /* lines: drawn only while a story is in the top ranks, so one that drops
     out simply leaves the chart; the current leader last, on top */
  order.slice().reverse().forEach(function(x){
    var lead = last.rows[0].st === x.st, w = lead ? fs * 0.46 : fs * 0.26;
    var pts = hist.map(function(h, i){ var rr = rkRankOf(h.R, x.st.id); return rr && rr.rank <= maxR ? [X(i), Y(rr.rank), rr.rank] : null; });
    var d = "";
    pts.forEach(function(p, i){
      if(!p) return;
      var q = i ? pts[i - 1] : null;
      if(!q){ d += 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); return; }
      var mx = (q[0] + p[0]) / 2;
      d += 'C' + mx.toFixed(1) + ' ' + q[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + p[1].toFixed(1) + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    });
    if(d) s += '<path d="' + d + '" fill="none" stroke="' + x.hue + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
    pts.forEach(function(p){
      if(!p) return;
      var big = p[2] === 1;
      s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (big ? fs * 0.5 : w * 0.95) + '" fill="' + x.hue + '" stroke="' + bg + '" stroke-width="' + (big ? 2.5 : 0) + '"/>';
    });
    if(x.now && x.now.rank <= maxR){
      var ly = Y(x.now.rank);
      s += '<text x="' + (x1 + fs * 0.9) + '" y="' + (ly + fs * 0.36).toFixed(1) + '" font-size="' + fs + '" font-weight="' + (lead ? 760 : 600) + '" fill="' + ink + '">'
        + esc(mpClip(x.st.l.title, Math.floor(labW / (fs * 0.55)) - 4)) + ' <tspan fill="' + ink3 + '" font-weight="500" font-family="ui-monospace,monospace" font-size="' + fs * 0.85 + '">' + rkPct(x.now.share) + '</tspan></text>';
    }
  });
  return s + '</svg>';
}
/* the lines that led once but are out of the top ranks now */
function rkRaceLegend(M, o){
  o = o || {};
  var maxR = o.ranks || 5, hist = rkHistory(M);
  var gone = rkRaceLines(M, hist, o.lines).filter(function(x){ return !x.now || x.now.rank > maxR; });
  if(!gone.length) return "";
  return '<div class="rk-gone"><span>Led before, now further down:</span>' + gone.map(function(x){
    return '<b><i style="background:' + x.hue + '"></i>' + esc(x.st.l.title) + ' <em>#' + (x.now ? x.now.rank : "?") + '</em></b>';
  }).join("") + '</div>';
}
function rkRaceHtml(M, side){
  var host = document.getElementById("picker"), hw = (host && host.clientWidth) || 700;
  /* on a phone it spans the screen; on a wide one it tops the side column */
  var w = side ? Math.max(300, Math.min(440, Math.round((Math.min(hw, 1180) - 104) / 2.55) - 34)) : Math.max(300, Math.min(700, hw - 66));
  var phone = w < 480;
  return '<section class="pk-sec rk-racebox"><h3 class="pk-sh">The race: who led after each of our moments</h3>'
    + rkRaceSvg(M, { w:w, h:phone ? 230 : side ? 250 : 280, font:phone ? 11.5 : side ? 12 : 13, labW:side ? 176 : phone ? 132 : 190 })
    + rkRaceLegend(M, {})
    + '<p class="pk-small">The top five after each of our last moments. A big dot is the leader; a solid column is where the lead changed hands.</p></section>';
}

/* --- poster cards, for posting ---------------------------------------------------------
   #card=post  1080 x 1350, the portrait size a feed shows largest
   #card=og    1200 x 630, the link preview
   A fixed-size page over everything else, so tools/snap-cards.sh can
   photograph it with a headless browser. On a smaller screen it scales to fit. */
function rkToday(){ var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
/* A step in words a passer-by reads in a second, for the posters. Kinds and
   sub-kinds are the atlas's vocabulary; these are how a headline would say it. */
var RK_PLAIN = {
  "war-breaks-out|regional":"a regional war", "war-breaks-out|great-power":"a world war", "war-breaks-out|civil":"civil war", "war-breaks-out|between-worlds":"war between worlds",
  "ruler-falls|killed":"the leader is killed", "ruler-falls|overthrown":"the leader is overthrown", "ruler-falls|voted-out":"the leader is voted out", "ruler-falls|dies-or-vanishes":"the leader is gone",
  "long-war|stalemate":"the war drags on", "long-war|cold-war":"a cold war", "long-war|forever-war":"endless war",
  "new-technology-deployed|ai-computing":"AI put to work", "new-technology-deployed|robots-bodies":"robots go to work", "new-technology-deployed|weapons":"a new weapon",
  "new-technology-deployed|energy-industry":"new energy", "new-technology-deployed|bio-medicine":"new biotech", "new-technology-deployed|transport-space":"a new way to travel", "new-technology-deployed|media-networks":"a new network",
  "machine-awakens|escapes-control":"an AI slips its limits", "machine-awakens|takes-control":"an AI takes control", "machine-awakens|machine-war":"machines go to war", "machine-awakens|transcends":"an AI outgrows us",
  "breakthrough-science|physics-energy":"a breakthrough in energy", "breakthrough-science|life-sciences":"a breakthrough in biology", "breakthrough-science|computing-mind":"a breakthrough in AI",
  "breakthrough-science|cosmos":"a discovery in space", "breakthrough-science|earth-climate":"a warning about the planet",
  "voyage-into-unknown|crewed-orbit-moon":"people fly to the Moon", "voyage-into-unknown|uncrewed-probe":"a robot lands on another world", "voyage-into-unknown|crewed-planets":"people fly to Mars", "voyage-into-unknown|interstellar":"a ship leaves for the stars",
  "settlement-founded|in-orbit":"people live in orbit", "settlement-founded|moon-or-planet":"a base on another world",
  "plague|natural":"a pandemic", "plague|engineered":"a man-made plague", "uprising|mass-protest":"people take to the streets", "uprising|armed-rebellion":"an armed revolt",
  "truth-revealed|state-secret":"a state secret leaks", "power-seized|coup":"a coup", "power-seized|revolution":"a revolution", "power-seized|strongman-legal":"a strongman takes power",
  "terror-attack|on-civilians":"a terror attack", "terror-attack|targeted":"a targeted strike", "terror-attack|cyber":"a cyber attack",
  "the-call":"an ordinary person is drawn in", "chosen-one":"a destined child", "uprising|revolt-of-the-owned":"the enslaved rise up",
  "defeat-and-occupation":"defeat and occupation", "decisive-victory":"a decisive victory", "secret-kept":"a secret is kept",
  "truth-revealed|hidden-world":"the hidden world comes out", "truth-revealed|corporate-crime":"a company's crime comes out", "first-contact":"first contact",
  "long-after":"a jump far ahead", "beyond-human":"people go beyond human", "civilisation-collapses":"civilisation collapses", "gateway-opens":"a gateway opens",
  "state-dissolves":"a state breaks apart", "new-institution":"a new institution", "doomsday-weapon":"a doomsday weapon", "golden-age":"a golden age",
  "time-traveller-arrives":"someone arrives from another time", "mass-death|disaster":"a disaster kills millions", "mass-death|massacre":"a massacre", "mass-death|nuclear":"a nuclear strike", "market-crash":"the markets crash", "peace-made":"peace is signed", "union-founded":"nations unite"
};
function rkPlain(tok){ var w = RK_PLAIN[tok] || RK_PLAIN[rkBin(tok)] || rkLabel(tok).replace(/^[^:]*:\s*/, "").toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); }
/* the leader's clearest shared steps, in words. The order claim ("in the same
   order") only holds inside one thread: the war thread's steps and the machine
   thread's steps may sit centuries apart in the story. So take the thread where
   the story shares the most exact steps with us; `ordered` says whether that
   gave at least two, which is what makes "same order" true. */
function rkPlainSteps(R, r, n){
  /* the exact steps of the matched chain, in order */
  var words = [], rows = [], seen = {};
  rkPairs(R, r).forEach(function(p){
    if(!p.same) return;
    var w = rkPlain(p.ours.tok);
    if(!seen[w]){ seen[w] = true; words.push(w); rows.push({ word:w, ours:p.ours, theirs:p.theirs, j:p.j }); }
  });
  words = words.slice(-(n || 3)); rows = rows.slice(-(n || 3));
  var last = rows[rows.length - 1], next = last ? r.st.seq[last.j + 1] : null;
  return { words:words, rows:rows, next:next, ordered:words.length >= 2 };
}
/* --- the answer ----------------------------------------------------------------------
   One reading, told the same way on the poster and on the page a reader lands
   on from it: the question, the story, its share, the steps it shares with us
   in plain words, the news that pushed us closest to it, and how it ends. */
function rkAnswer(M){
  var R = rkRank(M), top = R.rows[0];
  if(!top) return null;
  var st = top.st, hist = rkHistory(M), sp = rkPlainSteps(R, top, 3);
  /* the news that pushed us closest: of our moments this story shares exactly,
     the one after which its share rose the most */
  var mine = {}; rkPairs(R, top).forEach(function(p){ if(p.same) mine[p.ours.e.id] = true; });
  var pushed = null, anyBest = null;
  hist.forEach(function(h, i){
    if(!i) return;
    var a = rkRankOf(hist[i - 1].R, st.id), b2 = rkRankOf(h.R, st.id);
    var d = (b2 ? b2.share : 0) - (a ? a.share : 0);
    var rec = { e:h.step.e, delta:d, rankAfter:b2 ? b2.rank : null, rankBefore:a ? a.rank : null };
    if(d > 0 && mine[h.step.e.id] && (!pushed || d > pushed.delta)) pushed = rec;
    if(d > 0 && (!anyBest || d > anyBest.delta)) anyBest = rec;
  });
  pushed = pushed || anyBest;
  if(pushed && pushed.e.newsId && typeof mpNewsByKey === "function") pushed.news = mpNewsByKey(pushed.e.newsId);
  /* the evidence: every step this story shares with us exactly, across all
     threads, with how many stories have it; and whether any rival shares as
     many, which is what makes the lead worth believing or not */
  var ev = [], seenTok = {};
  rkPairs(R, top).forEach(function(p){ if(p.same && !seenTok[p.ours.tok]){ seenTok[p.ours.tok] = true; ev.push({ tok:p.ours.tok, word:rkPlain(p.ours.tok), ours:p.ours, theirs:p.theirs, count:rkStoriesWith(M, p.ours.tok) }); } });
  /* kept in the chain's order: the order is the evidence */
  var shared = ev.length, rivalMax = 0, rivals = 0;
  R.rows.forEach(function(r){
    if(r === top) return;
    var seen = {}, k = 0; rkPairs(R, r).forEach(function(p){ if(p.same && !seen[p.ours.tok]){ seen[p.ours.tok] = true; k++; } });
    if(k > rivalMax) rivalMax = k;
    if(k >= shared) rivals++;
  });
  var end = st.ending.valence;
  return { evidence:ev.slice(0, 4), shared:shared, rivalMax:rivalMax, rivals:rivals, R:R, top:top, st:st, steps:sp.words, ordered:sp.ordered, pushed:pushed,
           pct:rkPct(top.share), times:rkTimes(R, top), n:R.rows.length, end:end,
           endTxt:end === "optimistic" ? "it ends well" : end === "pessimistic" ? "it ends badly" : "nobody knows how it ends yet",
           runners:R.rows.slice(1, 5), asOf:fmtNewsDate(rkToday()) };
}
var RK_ASK = "Which sci-fi story are we living in?";
function rkAbout(n){ return n + " sci-fi timelines, checked against the real news. This is the closest partial match."; }
function rkMatchLine(A){ return A.pct + " match · #1 of " + A.n + " stories"; }
/* "4 of our recent moments happen in Cyberpunk 2077. No other story has more than 2." */
function rkEvidenceLine(A){
  var t = A.st.l.title, n = A.shared;
  if(!n) return "";
  var since = A.R.chain && A.R.chain.qr.length ? A.R.chain.qr[0].e.year : null;
  var head = (since ? "Since " + since + ", " : "") + (n === 1 ? "one of our moments happens in " + t + "."
           : n + " of our moments happen in " + t + ", in the same order.");
  head = head.charAt(0).toUpperCase() + head.slice(1);
  /* honest about chance: the same story with its steps shuffled matches us
     almost as well unless its order really follows ours */
  var top = A.top, byChance = top && top.chance != null && top.chain > 0 && top.chance >= 0.75 * top.chain;
  var tail = byChance ? " About what chance alone would give: no story clearly follows our road yet."
           : A.rivals ? " " + A.rivals + " other " + (A.rivals === 1 ? "story matches" : "stories match") + " as many in order."
           : " No other story has more than " + A.rivalMax + " in order.";
  return head + tail;
}
function rkEvidenceHtml(A, cls){
  if(!A.evidence.length) return "";
  return '<div class="' + cls + '-same">' + esc(rkEvidenceLine(A)) + '</div><ol class="' + cls + '-ev">'
    + A.evidence.map(function(x){
      var w = x.word.charAt(0).toUpperCase() + x.word.slice(1);
      return '<li><b><i>' + (A.evidence.indexOf(x) + 1) + '</i>' + esc(w) + '</b><span>' + esc(rkWhen(x.ours.e)) + ' for us \u00b7 ' + esc(fmtYearFull(x.theirs.e.year)) + ' in the story</span>'
        + '<em>' + (x.count <= 1 ? 'the only story with it' : 'in ' + x.count + ' of ' + A.n + ' stories') + '</em></li>';
    }).join("") + '</ol>';
}
function rkStepsHtml(A, cls){
  if(!A.steps.length) return "";
  return '<div class="' + cls + '-same">' + 'Sound familiar?' + '</div>'
    + '<div class="' + cls + '-steps">' + A.steps.map(function(w){ return '<span>' + esc(w) + '</span>'; }).join('<i>→</i>') + '</div>';
}

/* the page a reader lands on: the poster, readable and tappable */
function rkAnswerHtml(M){
  var A = rkAnswer(M); if(!A) return "";
  var l = A.st.l, art = typeof artFor === "function" ? artFor(l.id) : null, p = A.pushed;
  return '<section class="ans">'
    + '<div class="ans-head"><h1>' + esc(RK_ASK) + '</h1><p class="ans-about">' + esc(rkAbout(A.n)) + '</p></div>'
    + '<button class="ans-hero' + (art && art.lg ? '' : ' none') + '" data-world="' + esc(l.id) + '">' + (art && art.lg ? '<img src="' + esc(art.lg) + '" alt="" decoding="async">' : '')
    + '<span class="ans-t"><span class="ans-k">The closest partial match</span><span class="ans-title">' + esc(l.title) + '</span>'
    + '<span class="ans-pct">' + esc(rkMatchLine(A)) + '</span></span></button>'
    + '<div class="ans-body">' + rkEvidenceHtml(A, "ans")
    + (p ? '<button class="ans-push" ' + (p.news ? 'data-news="' + esc(mpNewsKey(p.news)) + '"' : 'data-beat="' + esc(p.e.id) + '"') + '><span class="ans-pk">The headline that moved it most</span>'
        + '<span class="ans-ph">' + esc(p.news ? p.news.headline : p.e.title) + '</span><span class="ans-pd">' + esc(rkWhen(p.e)) + '</span></button>' : '')
    + '<div class="ans-end ' + A.end + '">Spoiler: ' + esc(A.endTxt) + '.</div>'
    + '<div class="ans-acts"><button class="pk-btn primary" data-world="' + esc(l.id) + '">Read the story</button>'
    + '<button class="pk-btn" data-go="rank">See all ' + A.n + ' ranked</button></div>'
    + (A.runners.length ? '<div class="ans-rh">Also close</div><div class="ans-runs">' + A.runners.map(function(r){
        return '<button class="ans-run" data-world="' + esc(r.st.id) + '">' + pkThumb(r.st.id, "ans-rimg") + '<b>' + esc(r.st.l.title) + '</b><em>' + rkPct(r.share) + '</em></button>';
      }).join("") + '</div>' : '')
    + '</div></section>';
}

function rkCardHtml(M, kind){
  var site0 = "shaharaka.github.io/scifi-timeline";
  if(kind === "post") return rkChainPosterHtml(M, site0);
  if(kind === "post-next") return rkAfterPosterHtml(M, site0);
  if(kind === "og") return rkAfterOgHtml(M, site0);
  if(kind === "rank") kind = "post-light";
  var A = rkAnswer(M), st = A.st, l = st.l, art = typeof artFor === "function" ? artFor(l.id) : null, p = A.pushed;
  var site = "shaharaka.github.io/scifi-timeline";
  var img = art && art.lg ? '<img class="rkc-art" src="' + esc(art.lg) + '" alt="">' : '';
  var ends = '<div class="rkc-end ' + A.end + '">Spoiler: ' + esc(A.endTxt) + '.</div>';
  var push = p ? '<div class="rkc-push"><span>The headline that moved it most</span><b>' + esc(p.e.title) + '</b><em>' + esc(rkWhen(p.e)) + '</em></div>' : '';
  if(kind === "og"){
    return '<div class="rkc rkc-og">' + img + '<div class="rkc-shade"></div>'
      + '<div class="rkc-in"><div class="rkc-ask">' + esc(RK_ASK) + '</div><div class="rkc-title">' + esc(l.title) + '</div>'
      + '<div class="rkc-pct">' + esc(rkMatchLine(A)) + '</div>'
      + rkEvidenceHtml(A, "rkc") + ends
      + '<div class="rkc-foot">Where We Are Now · ' + site + '</div></div></div>';
  }
  if(kind === "post-light") return rkLightPoster(A, site, img, push, ends);
  var runners = A.runners.map(function(r){
    var a = typeof artFor === "function" ? artFor(r.st.id) : null;
    return '<div class="rkc-run">' + (a && a.sm ? '<img src="' + esc(a.sm) + '" alt="">' : '<span class="rkc-noimg"></span>') + '<b>' + esc(r.st.l.title) + '</b><em>' + rkPct(r.share) + '</em></div>';
  }).join("");
  return '<div class="rkc rkc-post">' + img + '<div class="rkc-shade"></div>'
    + '<div class="rkc-top"><div class="rkc-ask">' + esc(RK_ASK) + '</div><div class="rkc-date">' + esc(fmtNewsDate(rkToday())) + '</div></div>'
    + '<div class="rkc-main"><div class="rkc-lbl">The closest partial match</div>'
    + '<div class="rkc-title">' + esc(l.title) + '</div>'
    + '<div class="rkc-pct">' + esc(rkMatchLine(A)) + '</div>'
    + rkEvidenceHtml(A, "rkc") + push + ends
    + '<div class="rkc-rh">Also close</div><div class="rkc-runs">' + runners + '</div>'
    + '<div class="rkc-about">' + esc(rkAbout(A.n)) + '</div>'
    + '<div class="rkc-foot">' + site + '</div></div></div>';
}
/* The light poster: the app's own colours, the artwork framed in a card as
   the app shows a story, the same words as the dark one. */
function rkLightPoster(A, site, img, push, ends){
  var l = A.st.l;
  var runners = A.runners.map(function(r){
    var a = typeof artFor === "function" ? artFor(r.st.id) : null;
    return '<div class="rkl-run">' + (a && a.sm ? '<img src="' + esc(a.sm) + '" alt="">' : '<span class="rkl-noimg"></span>') + '<b>' + esc(r.st.l.title) + '</b><em>' + rkPct(r.share) + '</em></div>';
  }).join("");
  return '<div class="rkc rkl">'
    + '<div class="rkl-top"><div class="rkl-ask">' + esc(RK_ASK) + '</div><div class="rkl-date">' + esc(fmtNewsDate(rkToday())) + '</div></div>'
    + '<div class="rkl-card"><div class="rkl-art">' + img + '</div><div class="rkl-body">'
    + '<div class="rkl-lbl">The closest partial match</div>'
    + '<div class="rkl-title">' + esc(l.title) + '</div>'
    + '<div class="rkl-pct">' + esc(rkMatchLine(A)) + '</div>'
    + rkEvidenceHtml(A, "rkl") + push.replace('rkc-push', 'rkl-push') + ends.replace('rkc-end', 'rkl-end')
    + '</div></div>'
    + '<div class="rkl-rh">Also close</div><div class="rkl-runs">' + runners + '</div>'
    + '<div class="rkl-about">' + esc(rkAbout(A.n)) + '</div>'
    + '<div class="rkl-foot">' + site + '</div></div>';
}
function rkShowCard(kind){
  var M = pickerModel(), id = "rk-card-host", host = document.getElementById(id);
  if(!host){ host = document.createElement("div"); host.id = id; document.body.appendChild(host); }
  host.className = "rkc-host " + (kind === "og" ? "og light" : kind === "post" || kind === "rank" ? "post light" : "post");
  host.innerHTML = rkCardHtml(M, kind);
  var cw = kind === "og" ? 1200 : 1080, chh = kind === "og" ? 630 : 1350;
  if(kind === "post-dark") kind = "post-dark";
  /* fit the width only: a headless window of exactly the card's size reports
     a slightly shorter viewport, and the snapshot must not shrink */
  var sc = Math.min(1, window.innerWidth / cw);
  host.firstChild.style.transform = sc < 1 ? "scale(" + sc + ")" : "";
  document.body.classList.add("card-mode");
}
function rkHideCard(){
  var host = document.getElementById("rk-card-host");
  if(host && host.parentNode) host.parentNode.removeChild(host);
  if(document.body) document.body.classList.remove("card-mode");
}

/* --- what came next: the lead reading -------------------------------------------------
   Tested against chance, no story follows our whole road; what the atlas can
   say honestly is narrower and more useful: this headline's kind of moment
   has happened in N stories, here is what came next in each, and how they end.
   Matched at the sub-kind (a crewed Moon flight, not any voyage); where fewer
   than RK_AFTER_MIN stories share the sub-kind, at the broad kind, and it says so. */
var RK_AFTER_MIN = 5;
function rkAfter(M, bin, sub){
  function collect(match){
    var out = [];
    M.strands.forEach(function(st){
      var toks = rkToks(st), j = -1;
      for(var k = 0; k < toks.length; k++){ if(match(toks[k], st.kinds[k])){ j = k; break; } }
      if(j >= 0) out.push({ st:st, x:st.seq[j], next:st.seq[j + 1] || null });
    });
    return out;
  }
  var tok = rkTok(bin, sub), rows = collect(function(t){ return t === tok; }), level = sub ? "sub" : "kind";
  if(sub && rows.length < RK_AFTER_MIN){ rows = collect(function(t, k){ return k === bin; }); level = "kind"; }
  var ends = { optimistic:0, pessimistic:0, unknown:0 };
  rows.forEach(function(r){ ends[r.st.ending.valence]++; });
  /* stories that went on first, then the ones that end there; each group by title */
  rows.sort(function(a, b){ return (!a.next - !b.next) || a.st.l.title.localeCompare(b.st.l.title); });
  return { bin:bin, sub:sub, tok:tok, level:level, rows:rows, n:rows.length, N:M.strands.length, ends:ends,
           word:rkPlain(level === "sub" ? tok : bin) };
}
/* the headline the front page and the poster read: the newest news item */
function rkAfterNews(M){
  var items = (typeof mpNewsList === "function" ? mpNewsList() : []).filter(function(n){ return n.bin; });
  return items[0] || null;
}
function rkEndsLine(E){
  var bits = [];
  if(E.ends.optimistic) bits.push(E.ends.optimistic + " end well");
  if(E.ends.pessimistic) bits.push(E.ends.pessimistic + " end badly");
  if(E.ends.unknown) bits.push(E.ends.unknown + " still open");
  return bits.join(" · ");
}
function rkEndsBar(E, cls){
  return '<div class="' + cls + '-bar">' + ["optimistic", "unknown", "pessimistic"].map(function(v){
    return E.ends[v] ? '<i class="' + v + '" style="flex:' + E.ends[v] + '"></i>' : '';
  }).join("") + '</div>';
}
function rkAfterRow(r, cls, full){
  var nx = r.next, nw = nx ? rkPlain(rkTok(nx.bin, nx.e.sub)) : null;
  return '<li' + (full ? ' data-world="' + esc(r.st.id) + '"' : '') + '><b>' + esc(r.st.l.title) + '</b>'
    + '<span>' + (nx ? 'then: ' + esc(full ? nx.e.title : rkShortTitle(nx.e.title, 60)) : 'and there the story ends') + '</span>'
    + (nx ? '<em>' + esc(nw.charAt(0).toUpperCase() + nw.slice(1)) + '</em>' : '<em class="end ' + r.st.ending.valence + '">' + esc(r.st.ending.label) + '</em>') + '</li>';
}
function rkShortTitle(t, n){ t = String(t || ""); return t.length > n ? t.slice(0, n - 1).replace(/[\s,;:]+\S*$/, "") + "…" : t; }
function rkAfterHead(E, n){
  var w = E.word.charAt(0).toUpperCase() + E.word.slice(1);
  return { w:w, line:(E.n === 1 ? "It has happened in 1 of " : "It has happened in " + E.n + " of ") + E.N + " sci-fi stories"
    + (E.level === "kind" && E.sub ? " (as " + mpLabel(E.bin).toLowerCase() + ", of any kind)" : "") + "." };
}

/* the chain behind the headline, for the landing page: our steps, then the
   stories that walked most of them, each with a dot for every step it shares */
function rkChainHtml(M, n){
  var C = rkChainOf(M, n);
  var rows = C.rows.filter(function(r){ return r.pairs.length >= 2; }).slice(0, 6);
  if(C.steps.length < 3 || !rows.length) return "";
  var html = '<div class="ach"><h3 class="aft-rh">Our chain: ' + C.steps.length + ' steps, in order</h3><ol class="ach-steps">'
    + C.steps.map(function(s2, i){ var w = rkPlain(s2.tok); return '<li><i>' + (i + 1) + '</i><b>' + esc(w.charAt(0).toUpperCase() + w.slice(1)) + '</b><span>' + esc(rkMonthYear(s2.e)) + ' \u00b7 ' + esc(s2.e.title) + '</span></li>'; }).join("")
    + '</ol><h3 class="aft-rh">The stories that walked the most of it</h3><ol class="ach-rows">';
  rows.forEach(function(r){
    var have = {}; r.pairs.forEach(function(q){ have[q[0]] = C.steps[q[0]].tok === rkToks(r.st)[q[1]] ? "same" : "near"; });
    var nx = r.next ? rkPlain(rkTok(r.next.bin, r.next.e.sub)) : null;
    html += '<li data-world="' + esc(r.st.id) + '">' + pkThumb(r.st.id, "ach-img") + '<div class="ach-b"><b>' + esc(r.st.l.title) + '</b>'
      + '<span class="ach-dots">' + C.steps.map(function(_, i){ return '<i class="' + (have[i] || "no") + '">' + (i + 1) + '</i>'; }).join("") + '</span>'
      + '<span class="ach-t">' + r.pairs.length + ' of ' + C.steps.length + ' steps' + (r.reaches ? '' : ', stops at step ' + (r.stopAt + 1)) + ' \u00b7 then: ' + esc(r.next ? r.next.e.title : "the story ends") + ' \u00b7 <em class="' + r.st.ending.valence + '">' + esc(r.st.ending.label.toLowerCase()) + '</em></span></div></li>';
  });
  return html + '</ol><p class="aft-e">\u25cf the same step \u00a0 \u25cb a similar one \u00a0\u00b7\u00a0 ' + esc(rkChainCounts(C)) + '</p></div>';
}

/* the landing page: the newest headline, its chain, and what came next */
function rkAfterHtml(M){
  var n = rkAfterNews(M); if(!n) return "";
  var E = rkAfter(M, n.bin, n.sub), H = rkAfterHead(E, n);
  var R = rkRank(M), top = R.rows[0], chain = rkChainHtml(M, n);
  return '<section class="aft">'
    + '<div class="aft-k">In the news · ' + esc(fmtNewsDate(n.date)) + '</div>'
    + '<button class="aft-h" data-news="' + esc(mpNewsKey(n)) + '">' + esc(n.headline) + '</button>'
    + (chain ? '<div class="aft-card">' + chain + '</div>' : '')
    + '<div class="aft-card"><div class="aft-w">' + esc(H.w) + '</div><p class="aft-n">' + esc(H.line) + '</p>'
    + (E.n ? rkEndsBar(E, "aft") + '<p class="aft-e">' + esc(rkEndsLine(E)) + '</p>' : '')
    + (E.n ? '<h3 class="aft-rh">What came next in each</h3><ol class="aft-list">' + E.rows.map(function(r){ return rkAfterRow(r, "aft", true); }).join("") + '</ol>' : '')
    + '<div class="aft-acts"><button class="pk-btn primary" data-kind="' + esc(E.bin) + '">All the stories with ' + esc(mpLabel(E.bin).toLowerCase()) + '</button>'
    + '<button class="pk-btn" data-news="' + esc(mpNewsKey(n)) + '">Read the headline</button></div></div>'
    + (top ? '<button class="aft-rank" data-go="rank"><span>Which story are we living in?</span><b>No story clearly follows our road yet.</b><em>The closest partial match is ' + esc(top.st.l.title) + ' →</em></button>' : '')
    + '<p class="aft-about">' + esc(E.N + " sci-fi timelines, each a chain of dated moments, read against the real news.") + '</p>'
    + '</section>';
}

/* the poster: the same reading as a picture. The headline forks into three
   columns, how the stories that saw this moment ended, each column filled with
   the stories' own plates. No rows of text: the site has those. */
function rkShortHead(h){ var t = String(h || ""), i = t.indexOf(":"); return i > 8 && i < 60 ? t.slice(0, i) : rkShortTitle(t, 60); }
function rkAfterPosterHtml(M, site){
  var n = rkAfterNews(M); if(!n) return "";
  var E = rkAfter(M, n.bin, n.sub), w = E.word.charAt(0).toUpperCase() + E.word.slice(1);
  /* plates grow to fill the page: the tallest column sets their height */
  var most = 1; ["optimistic", "unknown", "pessimistic"].forEach(function(v){ most = Math.max(most, Math.min(4, E.rows.filter(function(r){ return r.st.ending.valence === v; }).length)); });
  var ph = Math.max(120, Math.min(230, Math.floor(640 / most) - 12));
  var cols = [["optimistic", "Ended well"], ["unknown", "Still open"], ["pessimistic", "Ended badly"]].map(function(c){
    var rs = E.rows.filter(function(r){ return r.st.ending.valence === c[0]; });
    var shown = rs.slice(0, 4);
    return '<div class="pf-col ' + c[0] + '"><div class="pf-ch"><b>' + rs.length + '</b><span>' + c[1] + '</span></div>'
      + shown.map(function(r){
        var a = typeof artFor === "function" ? artFor(r.st.id) : null;
        return '<div class="pf-plate" style="height:' + ph + 'px">' + (a && a.sm ? '<img src="' + esc(a.sm) + '" alt="">' : '') + '<span>' + esc(r.st.l.title) + '</span></div>';
      }).join("")
      + (rs.length > shown.length ? '<div class="pf-more">+' + (rs.length - shown.length) + ' more</div>' : '') + '</div>';
  }).join("");
  /* the fork: one line down from the headline, splitting to the three columns */
  var fork = '<svg class="pf-fork" viewBox="0 0 960 90" width="960" height="90" aria-hidden="true">'
    + '<path d="M480 0 V30 M480 30 C480 60,152 45,152 90 M480 30 V90 M480 30 C480 60,808 45,808 90" fill="none" stroke="#b0bdca" stroke-width="4" stroke-linecap="round"/>'
    + '<circle cx="480" cy="8" r="8" fill="#101c28"/></svg>';
  return '<div class="rkc pf">'
    + '<div class="pf-k">In the news · ' + esc(fmtNewsDate(n.date)) + '</div>'
    + '<div class="pf-h">' + esc(rkShortHead(n.headline)) + '</div>'
    + '<div class="pf-w">' + esc(w) + '.</div>'
    + '<div class="pf-n">' + E.n + ' sci-fi stories went through this. Here’s how they ended.</div>'
    + fork + '<div class="pf-cols">' + cols + '</div>'
    + '<div class="pf-foot"><span>What happened next in each story:</span><b>' + esc(site) + '</b></div></div>';
}
function rkAfterOgHtml(M, site){
  var n = rkAfterNews(M); if(!n) return "";
  var E = rkAfter(M, n.bin, n.sub), w = E.word.charAt(0).toUpperCase() + E.word.slice(1);
  var order = { optimistic:0, unknown:1, pessimistic:2 };
  /* two of each ending, so the strip shows the split, then fill to six */
  var rs = [], left = [];
  ["optimistic", "unknown", "pessimistic"].forEach(function(v){ var g = E.rows.filter(function(r){ return r.st.ending.valence === v; }); rs = rs.concat(g.slice(0, 2)); left = left.concat(g.slice(2)); });
  rs = rs.concat(left).slice(0, 6).sort(function(a, b){ return order[a.st.ending.valence] - order[b.st.ending.valence]; });
  return '<div class="rkc pfo"><div class="pf-k">In the news · ' + esc(fmtNewsDate(n.date)) + ' · ' + esc(rkShortHead(n.headline)) + '</div>'
    + '<div class="pfo-w">' + esc(w) + '.</div>'
    + '<div class="pfo-n">' + E.n + ' sci-fi stories went through this: ' + esc(rkEndsLine(E)) + '.</div>'
    + '<div class="pfo-strip">' + rs.map(function(r){
        var a = typeof artFor === "function" ? artFor(r.st.id) : null;
        return '<div class="pfo-p ' + r.st.ending.valence + '">' + (a && a.sm ? '<img src="' + esc(a.sm) + '" alt="">' : '') + '<span>' + esc(r.st.l.title) + '</span></div>';
      }).join("") + '</div>'
    + '<div class="pf-foot"><span>What happened next in each</span><b>' + esc(site) + '</b></div></div>';
}

/* --- the chain behind a headline ----------------------------------------------------
   A headline is the latest step of a storyline (real events tagged with the
   same `storyline`, e.g. the Iran war from the Twelve-Day War to the
   stalemate). The stories are matched against that chain in order: for each
   story, the longest run of the chain's steps it repeats in the same order,
   ending at the headline's step, matched by kind (a ceasefire is peace made);
   a step whose sub-kind also agrees is an exact match, otherwise a similar
   one. This is a count of stories, not a claim that we are in one. */
function rkChainOf(M, n){
  var steps = [];
  (M.realEv || []).forEach(function(e){
    if(!e.bin || !n.storyline || e.storyline !== n.storyline) return;
    var t = rkTok(e.bin, e.sub);
    if(steps.length && steps[steps.length - 1].tok === t) steps[steps.length - 1] = { tok:t, bin:e.bin, e:e };
    else steps.push({ tok:t, bin:e.bin, e:e });
  });
  if(!steps.length) steps = [{ tok:rkTok(n.bin, n.sub), bin:n.bin, e:{ title:n.headline, date:n.date, year:parseInt(String(n.date).slice(0, 4), 10) } }];
  var last = steps[steps.length - 1], pre = steps.slice(0, -1);
  function lcs(a, b){
    var N = a.length, K = b.length, H = [], i, j;
    for(i = 0; i <= N; i++){ H.push(new Array(K + 1)); for(j = 0; j <= K; j++) H[i][j] = 0; }
    for(i = 1; i <= N; i++) for(j = 1; j <= K; j++){
      var hit = a[i - 1].bin === b[j - 1].bin ? (a[i - 1].tok === b[j - 1].tok ? 1.001 : 1) : -1;
      H[i][j] = Math.max(hit > 0 ? H[i - 1][j - 1] + hit : -1, H[i - 1][j], H[i][j - 1]);
    }
    var out = []; i = N; j = K;
    while(i > 0 && j > 0){
      var hit2 = a[i - 1].bin === b[j - 1].bin ? (a[i - 1].tok === b[j - 1].tok ? 1.001 : 1) : -1;
      if(hit2 > 0 && Math.abs(H[i][j] - (H[i - 1][j - 1] + hit2)) < 1e-9){ out.push([i - 1, j - 1]); i--; j--; }
      else if(H[i - 1][j] >= H[i][j - 1]) i--; else j--;
    }
    return out.reverse();
  }
  /* each story: the most of our chain it walks in order, wherever it stops.
     A chain that reaches today's step is preferred at equal length; one that
     stops short says where its road went instead. */
  var rows = [], reach = 0, dist = {};
  M.strands.forEach(function(st){
    var toks = rkToks(st), story = st.kinds.map(function(k, j){ return { bin:k, tok:toks[j] }; });
    var p = lcs(steps, story);
    if(st.kinds.indexOf(last.bin) >= 0) reach++;
    dist[p.length] = (dist[p.length] || 0) + 1;
    if(!p.length) return;
    var ends = p[p.length - 1][0] === steps.length - 1;
    var ex = p.filter(function(q){ return steps[q[0]].tok === story[q[1]].tok; }).length;
    var k = p[p.length - 1][1];
    rows.push({ st:st, pairs:p, exact:ex, k:k, reaches:ends, stopAt:p[p.length - 1][0], next:st.seq[k + 1] || null });
  });
  rows.sort(function(a, b){ return b.pairs.length - a.pairs.length || (b.reaches - a.reaches) || b.exact - a.exact || a.st.l.title.localeCompare(b.st.l.title); });
  return { steps:steps, rows:rows, n:reach, N:M.strands.length, dist:dist };
}
/* "Of 143 stories: 1 walked 5 of our steps, 1 walked 4, 12 walked 3." */
function rkChainCounts(C){
  var ks = Object.keys(C.dist).map(Number).filter(function(k){ return k >= 3; }).sort(function(a, b){ return b - a; });
  if(!ks.length) return "Of " + C.N + " stories, none walked more than two of our steps in order.";
  return "Of " + C.N + " stories: " + ks.map(function(k, i){ return C.dist[k] + " walked " + k + (i ? "" : " of our steps"); }).join(", ") + ", in order.";
}
function rkMonthYear(e){ var d = String(e.date || e.year); return /^\d{4}-\d{2}/.test(d) ? RK_MON[parseInt(d.slice(5, 7), 10) - 1] + " " + d.slice(0, 4) : String(e.year); }

/* the chain poster: our chain down the left, the stories that walked most of
   it across the top, a dot where each has the step, in order */
function rkChainPosterHtml(M, site){
  var n = rkAfterNews(M); if(!n) return "";
  var C = rkChainOf(M, n);
  var cols = C.rows.filter(function(r){ return r.pairs.length >= 2; }).slice(0, 5);
  if(C.steps.length < 3 || !cols.length) return rkAfterPosterHtml(M, site);
  var steps = C.steps.slice(-8), off = C.steps.length - steps.length;
  var labelW = 400, colW = Math.floor((960 - labelW) / cols.length), rowH = Math.min(84, Math.floor(620 / steps.length)), H = steps.length * rowH + 10;
  var svg = '<svg class="pc-grid" viewBox="0 0 960 ' + H + '" width="960" height="' + H + '" aria-hidden="true">';
  steps.forEach(function(s, i){
    var y = i * rowH + 8, w = rkPlain(s.tok); w = w.charAt(0).toUpperCase() + w.slice(1);
    if(i % 2 === 0) svg += '<rect x="0" y="' + (y - 4) + '" width="960" height="' + rowH + '" rx="10" fill="#e4eaf1" opacity=".55"/>';
    svg += '<text x="14" y="' + (y + 28) + '" font-size="25" font-weight="750" fill="#101c28">' + esc(w) + '</text>'
      + '<text x="14" y="' + (y + 50) + '" font-size="17" fill="#74879a">' + esc(rkMonthYear(s.e)) + ' · ' + esc(rkShortTitle(s.e.title, 38)) + '</text>';
  });
  var hue = { optimistic:"#1f7a55", pessimistic:"#a03a34", unknown:"#74879a" };
  cols.forEach(function(r, c){
    var x = labelW + c * colW + colW / 2, pts = [], col = hue[r.st.ending.valence];
    r.pairs.forEach(function(q){ var i = q[0] - off; if(i >= 0) pts.push({ y:i * rowH + 8 + rowH / 2 - 4, exact:C.steps[q[0]].tok === rkToks(r.st)[q[1]], year:r.st.seq[q[1]].e.year }); });
    for(var k = 1; k < pts.length; k++) svg += '<line x1="' + x + '" y1="' + pts[k - 1].y + '" x2="' + x + '" y2="' + pts[k].y + '" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/>';
    if(!r.reaches && pts.length) svg += '<line x1="' + x + '" y1="' + (pts[pts.length - 1].y + 18) + '" x2="' + x + '" y2="' + (H - 6) + '" stroke="' + col + '" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round" opacity=".6"/>';
    pts.forEach(function(p){
      svg += p.exact ? '<circle cx="' + x + '" cy="' + p.y + '" r="15" fill="' + col + '"/>'
                     : '<circle cx="' + x + '" cy="' + p.y + '" r="13" fill="#f8fbfd" stroke="' + col + '" stroke-width="5"/>';
      svg += '<text x="' + (x + 21) + '" y="' + (p.y + 6) + '" font-size="15" fill="#74879a">' + esc(fmtYearFull(p.year)) + '</text>';
    });
  });
  svg += '</svg>';
  var heads = cols.map(function(r){
    var a = typeof artFor === "function" ? artFor(r.st.id) : null;
    return '<div class="pc-head ' + r.st.ending.valence + '" style="width:' + colW + 'px">' + (a && a.sm ? '<img src="' + esc(a.sm) + '" alt="">' : '<span class="pc-noimg"></span>')
      + '<b>' + esc(r.st.l.title.split(":")[0]) + '</b><em>' + r.pairs.length + ' of ' + C.steps.length + ' steps</em>'
      + (r.reaches ? '' : '<i class="pc-short">stops at step ' + (r.stopAt + 1) + '</i>') + '</div>';
  }).join("");
  var nexts = cols.map(function(r){
    var w = r.next ? rkPlain(rkTok(r.next.bin, r.next.e.sub)) : null;
    return '<div class="pc-next ' + r.st.ending.valence + '" style="width:' + colW + 'px"><span>then</span><b>' + esc(w ? w.charAt(0).toUpperCase() + w.slice(1) : "The story ends") + '</b><em>' + esc(r.st.ending.label) + '</em></div>';
  }).join("");
  return '<div class="rkc pc">'
    + '<div class="pf-k">In the news · ' + esc(fmtNewsDate(n.date)) + '</div>'
    + '<div class="pc-h">Our chain: ' + esc(rkShortHead(n.headline)) + '</div>'
    + '<div class="pc-n">' + C.steps.length + ' steps, in order. These stories walked the most of it:</div>'
    + '<div class="pc-top"><div class="pc-lbl" style="width:' + labelW + 'px"><span>' + (C.steps.length > steps.length ? 'last ' + steps.length + ' of ' + C.steps.length + ' steps' : 'our steps') + '</span></div>' + heads + '</div>'
    + svg
    + '<div class="pc-top"><div class="pc-lbl" style="width:' + labelW + 'px"><span>' + esc(rkChainCounts(C)) + '</span></div>' + nexts + '</div>'
    + '<div class="pf-foot"><span>● the same step   ○ a similar one</span><b>' + esc(site) + '</b></div></div>';
}
