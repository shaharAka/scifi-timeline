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
var RK_SIT = 0.25;      /* weight of situation likeness (facets) against chain order */
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
  (M.realEv || []).forEach(function(e){ if(e.bin) out.push({ kind:e.bin, tok:rkTok(e.bin, e.sub), e:e, thread:rkThreadOf(e.bin, e.facets) }); });
  return out;
}

function rkFit(q, w, b){
  var n = q.length, m = b.length, i, j, H = [];
  for(i = 0; i <= n; i++){ H.push(new Array(m + 1)); for(j = 0; j <= m; j++) H[i][j] = 0; }
  for(i = 1; i <= n; i++){
    for(j = 1; j <= m; j++){
      var d = H[i - 1][j - 1] + w[i - 1] * rkScore(q[i - 1], b[j - 1]);
      var u = H[i - 1][j] + w[i - 1] * CH_GAP;       /* one of our steps the story lacks */
      var l = H[i][j - 1] + w[i - 1] * CH_GAP * 0.5; /* a step of the story's we skipped: cheaper, stories compress and stretch */
      H[i][j] = Math.max(0, d, u, l);
    }
  }
  /* anchored at our end: the alignment ends on a real match, and every one of
     our steps after that match costs RK_TAIL, so a story that has nothing like
     where we are now cannot lead on how it matched our past */
  var best = 0, bi = 0, bj = 0, tail = [0];
  for(i = n; i >= 1; i--) tail[n - i + 1] = tail[n - i] + w[i - 1] * RK_TAIL;
  for(i = 1; i <= n; i++){
    for(j = 1; j <= m; j++){
      var sc = rkScore(q[i - 1], b[j - 1]);
      if(sc <= 0) continue;
      var v = H[i - 1][j - 1] + w[i - 1] * sc + tail[n - i];
      if(v > best){ best = v; bi = i; bj = j; }
    }
  }
  var pairs = [];
  i = bi; j = bj;
  if(bi){ pairs.push([i - 1, j - 1]); i--; j--; }
  while(i > 0 && j > 0 && H[i][j] > 0){
    var here = H[i][j];
    if(Math.abs(here - (H[i - 1][j - 1] + w[i - 1] * rkScore(q[i - 1], b[j - 1]))) < 1e-9){ pairs.push([i - 1, j - 1]); i--; j--; }
    else if(Math.abs(here - (H[i - 1][j] + w[i - 1] * CH_GAP)) < 1e-9) i--;
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
  var tw = 0; threads.forEach(function(t){ tw += t.weight; });
  var rows = M.strands.map(function(st){
    var per = {}, fit = 0, at = -1;
    threads.forEach(function(t){
      var f = rkFit(t.q, t.w, rkToks(st)), sit = rkSituation(t.qr, st);
      var x = { st:st, thread:t, fit:(1 - RK_SIT) * f.norm + RK_SIT * sit, chain:f.norm, sit:sit, pairs:f.pairs, at:f.at };
      per[t.id] = x; t.rows.push(x);
      fit += t.weight * x.fit;
      if(f.at > at) at = f.at;
    });
    return { st:st, fit:tw ? fit / tw : 0, per:per, at:at };
  });
  rkSoftmax(rows, "fit", "share");
  rows.sort(function(a, b){ return b.fit - a.fit || a.st.l.title.localeCompare(b.st.l.title); });
  rows.forEach(function(r, i){ r.rank = i + 1; });
  threads.forEach(function(t){
    rkSoftmax(t.rows, "fit", "share");
    t.rows.sort(function(a, b){ return b.fit - a.fit || a.st.l.title.localeCompare(b.st.l.title); });
  });
  var out = { rows:rows, threads:threads, road:road, mine:mine, upto:upto, add:add || null, last:mine[mine.length - 1] || null };
  RK_CACHE.out[key] = out;
  return out;
}
function rkRankOf(R, id){ var o = null; R.rows.forEach(function(r){ if(r.st.id === id) o = r; }); return o; }
/* every matched pair of a story, over all threads, as {thread, ours, theirs, same} */
function rkPairs(R, r){
  var out = [];
  R.threads.forEach(function(t){
    var x = r.per[t.id]; if(!x) return;
    x.pairs.forEach(function(p){ out.push({ thread:t, ours:t.qr[p[0]], theirs:r.st.seq[p[1]], same:t.q[p[0]] === rkToks(r.st)[p[1]], kin:rkBin(t.q[p[0]]) === r.st.kinds[p[1]] }); });
  });
  return out;
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
  R.threads.forEach(function(t){ t.rows.slice(0, 3).forEach(function(x){ after(x.st, x.at); }); });
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
  var html = '';
  R.threads.forEach(function(t){
    var x = r.per[t.id]; if(!x || !x.pairs.length) return;
    var pos = t.rows.indexOf(x) + 1;
    html += '<div class="rk-th"><span class="rk-thl">' + esc(t.spec.label) + '</span><span class="rk-thn">#' + pos + ' of ' + t.rows.length + ' on this thread</span></div><ol class="rk-pairs">';
    x.pairs.forEach(function(p){
      var ours = t.qr[p[0]], theirs = r.st.seq[p[1]], ttok = rkToks(r.st)[p[1]], same = ours.tok === ttok;
      html += '<li class="' + (same ? 'same' : 'near') + '"><div class="rk-us"><span class="pk-yr">' + esc(rkWhen(ours.e)) + '</span><span>' + esc(ours.e.title) + '</span></div>'
        + '<div class="rk-k"><button class="pk-kindtag btn" data-kind="' + esc(theirs.bin) + '">' + esc(rkLabel(ours.tok)) + (same ? '' : ' ≈ ' + esc(ours.kind === theirs.bin ? (rkSubLabel(theirs.bin, theirs.e.sub) || mpLabel(theirs.bin)) : rkLabel(ttok))) + '</button></div>'
        + '<div class="rk-them"><span class="pk-yr">' + esc(fmtYearFull(theirs.e.year)) + '</span><span>' + esc(theirs.e.title) + '</span></div></li>';
    });
    html += '</ol>';
  });
  return html || '<p class="mp-none">It shares no step with our recent road.</p>';
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
  ps.forEach(function(p){ th[p.thread.id] = p.thread.spec.short; });
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
    + R.threads.map(function(t){
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
  "terror-attack|on-civilians":"a terror attack", "mass-death|nuclear":"a nuclear strike", "market-crash":"the markets crash", "peace-made":"peace is signed", "union-founded":"nations unite"
};
function rkPlain(tok){ var w = RK_PLAIN[tok] || RK_PLAIN[rkBin(tok)] || rkLabel(tok).replace(/^[^:]*:\s*/, "").toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); }
/* the leader's clearest shared steps, in words. The order claim ("in the same
   order") only holds inside one thread: the war thread's steps and the machine
   thread's steps may sit centuries apart in the story. So take the thread where
   the story shares the most exact steps with us; `ordered` says whether that
   gave at least two, which is what makes "same order" true. */
function rkPlainSteps(R, r, n){
  var best = null;
  R.threads.forEach(function(t){
    var x = r.per[t.id]; if(!x) return;
    var ex = x.pairs.filter(function(p){ return t.q[p[0]] === rkToks(r.st)[p[1]]; });
    if(!best || ex.length > best.ex.length || (ex.length === best.ex.length && x.fit > best.fit)) best = { t:t, ex:ex, fit:x.fit };
  });
  if(!best || !best.ex.length) return { words:[], ordered:false };
  var words = [], seen = {};
  best.ex.forEach(function(p){ var w = rkPlain(best.t.q[p[0]]); if(!seen[w]){ seen[w] = true; words.push(w); } });
  words = words.slice(-(n || 3));
  return { words:words, ordered:words.length >= 2, thread:best.t };
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
  ev.sort(function(a, b){ return a.count - b.count; });
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
function rkAbout(n){ return n + " sci-fi timelines, checked against the real news. This is the closest one."; }
function rkMatchLine(A){ return A.pct + " match · #1 of " + A.n + " stories"; }
/* "4 of our recent moments happen in Cyberpunk 2077. No other story has more than 2." */
function rkEvidenceLine(A){
  var t = A.st.l.title, n = A.shared;
  if(!n) return "";
  var head = (n === 1 ? "One of our recent moments happens" : n + " of our recent moments happen") + " in " + t + ".";
  var tail = A.rivals ? " " + A.rivals + " other " + (A.rivals === 1 ? "story matches" : "stories match") + " as many."
           : " No other story has more than " + A.rivalMax + ".";
  return head + tail;
}
function rkEvidenceHtml(A, cls){
  if(!A.evidence.length) return "";
  return '<div class="' + cls + '-same">' + esc(rkEvidenceLine(A)) + '</div><ul class="' + cls + '-ev">'
    + A.evidence.map(function(x){
      var w = x.word.charAt(0).toUpperCase() + x.word.slice(1);
      return '<li><b>' + esc(w) + '</b><span>' + esc(rkWhen(x.ours.e)) + ' for us \u00b7 ' + esc(fmtYearFull(x.theirs.e.year)) + ' in the story</span>'
        + '<em>' + (x.count <= 1 ? 'the only story with it' : 'in ' + x.count + ' of ' + A.n + ' stories') + '</em></li>';
    }).join("") + '</ul>';
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
    + '<span class="ans-t"><span class="ans-k">Right now, we\u2019re closest to</span><span class="ans-title">' + esc(l.title) + '</span>'
    + '<span class="ans-pct">' + esc(rkMatchLine(A)) + '</span></span></button>'
    + '<div class="ans-body">' + rkEvidenceHtml(A, "ans")
    + (p ? '<button class="ans-push" ' + (p.news ? 'data-news="' + esc(mpNewsKey(p.news)) + '"' : 'data-beat="' + esc(p.e.id) + '"') + '><span class="ans-pk">The headline that did it</span>'
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
  var A = rkAnswer(M), st = A.st, l = st.l, art = typeof artFor === "function" ? artFor(l.id) : null, p = A.pushed;
  var site = "shaharaka.github.io/scifi-timeline";
  var img = art && art.lg ? '<img class="rkc-art" src="' + esc(art.lg) + '" alt="">' : '';
  var ends = '<div class="rkc-end ' + A.end + '">Spoiler: ' + esc(A.endTxt) + '.</div>';
  var push = p ? '<div class="rkc-push"><span>The headline that did it</span><b>' + esc(p.e.title) + '</b><em>' + esc(rkWhen(p.e)) + '</em></div>' : '';
  if(kind === "og"){
    return '<div class="rkc rkc-og">' + img + '<div class="rkc-shade"></div>'
      + '<div class="rkc-in"><div class="rkc-ask">' + esc(RK_ASK) + '</div><div class="rkc-title">' + esc(l.title) + '</div>'
      + '<div class="rkc-pct">' + esc(rkMatchLine(A)) + '</div>'
      + rkEvidenceHtml(A, "rkc") + ends
      + '<div class="rkc-foot">Where We Are Now · ' + site + '</div></div></div>';
  }
  if(kind === "post") return rkLightPoster(A, site, img, push, ends);
  var runners = A.runners.map(function(r){
    var a = typeof artFor === "function" ? artFor(r.st.id) : null;
    return '<div class="rkc-run">' + (a && a.sm ? '<img src="' + esc(a.sm) + '" alt="">' : '<span class="rkc-noimg"></span>') + '<b>' + esc(r.st.l.title) + '</b><em>' + rkPct(r.share) + '</em></div>';
  }).join("");
  return '<div class="rkc rkc-post">' + img + '<div class="rkc-shade"></div>'
    + '<div class="rkc-top"><div class="rkc-ask">' + esc(RK_ASK) + '</div><div class="rkc-date">' + esc(fmtNewsDate(rkToday())) + '</div></div>'
    + '<div class="rkc-main"><div class="rkc-lbl">Right now, we\u2019re closest to</div>'
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
    + '<div class="rkl-lbl">Right now, we\u2019re closest to</div>'
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
  host.className = "rkc-host " + (kind === "og" ? "og" : kind === "post" ? "post light" : "post");
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
