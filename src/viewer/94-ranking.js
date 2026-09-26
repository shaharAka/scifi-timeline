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
function rkThreadSpec(id){ var o = null; RK_THREADS.forEach(function(t){ if(t.id === id) o = t; }); return o; }

/* our road: every real moment with a kind, in order, each with its thread */
function rkRoad(M){
  var out = [];
  (M.realEv || []).forEach(function(e){ if(e.bin) out.push({ kind:e.bin, e:e, thread:rkThreadOf(e.bin, e.facets) }); });
  return out;
}

function rkFit(q, w, b){
  var n = q.length, m = b.length, i, j, H = [];
  for(i = 0; i <= n; i++){ H.push(new Array(m + 1)); for(j = 0; j <= m; j++) H[i][j] = 0; }
  for(i = 1; i <= n; i++){
    for(j = 1; j <= m; j++){
      var d = H[i - 1][j - 1] + w[i - 1] * chainScore(q[i - 1], b[j - 1]);
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
      var sc = chainScore(q[i - 1], b[j - 1]);
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
    if(Math.abs(here - (H[i - 1][j - 1] + w[i - 1] * chainScore(q[i - 1], b[j - 1]))) < 1e-9){ pairs.push([i - 1, j - 1]); i--; j--; }
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
  if(add) mine = mine.concat([{ kind:add, thread:rkKindThread(add), e:{ title:"If the next headline is: " + mpLabel(add).toLowerCase(), year:last ? last.e.year : NOW, hypothetical:true } }]);
  var nowY = mine.length ? mine[mine.length - 1].e.year : NOW;
  /* each thread's recent steps, repeats of one kind collapsed into the latest */
  var threads = RK_THREADS.map(function(t){
    var qr = [];
    mine.forEach(function(r){
      if(r.thread !== t.id) return;
      if(qr.length && qr[qr.length - 1].kind === r.kind) qr[qr.length - 1] = r; else qr.push(r);
    });
    qr = qr.slice(-RK_TLEN);
    var q = qr.map(function(r){ return r.kind; });
    var w = q.map(function(_, i){ return Math.pow(RK_DECAY, q.length - 1 - i); });
    var lastY = qr.length ? qr[qr.length - 1].e.year : -Infinity;
    return { id:t.id, spec:t, qr:qr, q:q, w:w, weight:qr.length ? Math.pow(0.5, Math.max(0, nowY - lastY) / RK_HALF) : 0, rows:[] };
  }).filter(function(t){ return t.q.length; });
  var tw = 0; threads.forEach(function(t){ tw += t.weight; });
  var rows = M.strands.map(function(st){
    var per = {}, fit = 0, at = -1;
    threads.forEach(function(t){
      var f = rkFit(t.q, t.w, st.kinds), sit = rkSituation(t.qr, st);
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
    x.pairs.forEach(function(p){ out.push({ thread:t, ours:t.qr[p[0]], theirs:r.st.seq[p[1]], same:t.q[p[0]] === r.st.kinds[p[1]] }); });
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
  var tried = {}, out = [];
  function tryKind(k, why){
    /* only kinds of moment that have happened to us: a real headline could
       be one, a time traveller arriving could not */
    if(!k || tried[k] || !M.visits[k]) return;
    tried[k] = true;
    var R2 = rkRank(M, R.upto, k), top = R2.rows[0];
    out.push({ kind:k, why:why, top:top, R:R2, changes:top.st !== R.rows[0].st });
  }
  function after(st, at){ var nx = at >= 0 ? st.seq[at + 1] : null; if(nx) tryKind(nx.bin, st.l.title); }
  R.rows.slice(0, 8).forEach(function(r){ after(r.st, r.at); });
  R.threads.forEach(function(t){ t.rows.slice(0, 3).forEach(function(x){ after(x.st, x.at); }); });
  out.sort(function(a, b){ return (b.changes - a.changes) || (b.top.share - a.top.share); });
  return out.slice(0, 6);
}

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
      var ours = t.qr[p[0]], theirs = r.st.seq[p[1]], same = ours.kind === theirs.bin;
      html += '<li class="' + (same ? 'same' : 'near') + '"><div class="rk-us"><span class="pk-yr">' + esc(rkWhen(ours.e)) + '</span><span>' + esc(ours.e.title) + '</span></div>'
        + '<div class="rk-k"><button class="pk-kindtag btn" data-kind="' + esc(theirs.bin) + '">' + esc(mpLabel(ours.kind)) + (same ? '' : ' ≈ ' + esc(mpLabel(theirs.bin))) + '</button></div>'
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
      + '<button class="pk-kindtag btn" data-kind="' + esc(x.bin) + '">' + esc(mpLabel(x.bin)) + '</button></div></li>';
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
    + '<span class="rk-top-share"><b>' + rkPct(top.share) + '</b> of the fit · ' + esc(rkLine(R, top)) + '</span></span></button>'
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
        + '<p class="rk-road">' + t.qr.map(function(r){ return '<span>' + esc(fmtYearFull(r.e.year)) + ' ' + esc(mpLabel(r.kind).toLowerCase()) + '</span>'; }).join(' <i>→</i> ') + '</p>'
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
    + '<p class="pk-small rk-honest">A share of the fit, not a forecast: it says whose road looks most like ours so far, not what will happen next. The same kind of moment counts fully and a similar one partly; newer steps count more, and a thread that has gone quiet counts less. A quarter of each fit is how alike the situations were: who acted, how, and which way power moved.</p></section>';
  html += '</div><aside class="pk-aside">';
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
        return '<button class="rk-ifrow" data-world="' + esc(x.top.st.id) + '"><span class="rk-ifk">' + esc(mpLabel(x.kind)) + '</span>'
          + '<span class="rk-ifv">' + (x.changes ? 'the lead passes to <b>' + esc(x.top.st.l.title) + '</b>' : '<b>' + esc(x.top.st.l.title) + '</b> stays ahead') + ' <em>' + rkPct(x.top.share) + '</em></span></button>';
      }).join("") + '</div><p class="pk-small">Each is a step one of the leading stories takes next, and has happened to us before, tried as our next step.</p></section>';
  }
  html += '</aside></div>';
  return html;
}
