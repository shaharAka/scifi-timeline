/* ============================================================================
   The Moments page: strands.

   One strand per world, leaving our history at its fork and running right to
   one of three endings. Left to right is position along the chain, never a
   date. Where several strands reach the same kind of moment at about the same
   point in their story they bundle through a pill and split after; a kind one
   strand reaches alone is a small mark on that strand. The same kind may
   appear at several places on the canvas, because the unit here is the chain,
   not the kind: seven chains through "power is seized" arrived by seven roads
   and leave by seven, and the picture keeps that.

   Columns come from a multiple alignment of the chains (59-chains.js), so two
   worlds that reach a kind at step three and step five still meet if the
   chains around it agree. Vertical order is a storyline layout: strands are
   pulled together where they share a pill and kept apart elsewhere, with the
   endings they run to as their home rows - ends well above our path, still
   open around it, ends badly below.

   Our own history is the trunk: a heavy line from our first charted beat to
   TODAY, with a dot per beat you can click for the situation match, then a
   dotted line into "still open", because we are inside our chain. Every
   fiction's strand is coloured by how it ends, along its whole length, so you
   can see a red and a green strand leave the same pill and find where they
   parted.

   Click a strand for its chain and the chains most like it. Click a pill for
   the chains through it, before and after. Click an ending for every chain
   that runs there. Click a beat on the trunk for the situation match. Nothing
   is drawn by a library: this is our own SVG, with the page's own camera
   (wheel zooms, drag pans, Fit shows the whole map beside the panel).
   ========================================================================== */

var MP = { s:1, sy:1, fitS:1, tx:0, ty:0, node:null, col:null, world:null, beat:null, news:null, focus:false, panned:false, model:null, geom:null, width:900, fit:true };
var MP_PAD = 72;
var MP_MIN_S = 0.35;
var MP_MAX_S = 9;

/* the width the map may use: the canvas minus the panel when it is open */
function mpUsableWidth(){
  if(mpIsPhone()) return W;                 /* the panel is a bottom sheet there */
  var d = document.getElementById("drawer");
  var open = d && d.classList && d.classList.contains("open");
  var pw = open ? (d.offsetWidth || Math.min(480, W * 0.94)) : 0;
  return Math.max(320, W - pw);
}
/* A phone: the panel sits under the map instead of beside it, so the map
   loses height rather than width. */
function mpIsPhone(){
  return typeof window !== "undefined" && window.innerWidth > 0 && window.innerWidth < 720;
}
function mpUsableHeight(){
  if(!mpIsPhone()) return Hv;
  var d = document.getElementById("drawer");
  var open = d && d.classList && d.classList.contains("open");
  return Math.max(300, Hv - (open ? (d.offsetHeight || Hv * 0.5) : 0));
}
function mpMean(a){ var s = 0; a.forEach(function(v){ s += v; }); return a.length ? s / a.length : 0; }

/* Where an arc converges. Three sinks at the right edge of the map: every
   world's strand runs into one, and ours runs into "still open" because we are
   still inside it. The valence is the state the story leaves the world in as
   far as it is told (data/SCHEMA.md, Endings), never the mood of the last beat. */
var MP_ENDINGS = [
  { id:"ending-optimistic",  valence:"optimistic",  label:"Ends well",  definition:"The world is left better, freer or safer than at the fork, or the threat that drove the story is ended." },
  { id:"ending-unknown",     valence:"unknown",     label:"Still open", definition:"The author left it open, the franchise is mid-sentence, or the story refuses to say. Our own history ends here too." },
  { id:"ending-pessimistic", valence:"pessimistic", label:"Ends badly", definition:"The world is left ruined, captive or doomed, and the story does not take that back." }
];
function mpEndingSpec(v){ var out = null; MP_ENDINGS.forEach(function(e){ if(e.valence === v || e.id === v) out = e; }); return out; }
function mpEndingOf(l){ return (l && l.ending && mpEndingSpec(l.ending.valence)) || mpEndingSpec("unknown"); }
function mpIsEnding(id){ return !!mpEndingSpec(id); }

function mpSpec(id){
  var en = mpEndingSpec(id); if(en) return en;
  var out = null;
  ((typeof BINS !== "undefined" && BINS) || []).forEach(function(b){ if(b.id === id) out = b; });
  return out || { id:id, label:id, definition:"" };
}
function mpLabel(id){ return mpSpec(id).label || id; }

/* --- the model: strands, their alignment, the bundles, the kinds, the endings ---- */
/* The model aligns every chain against every other (chainMSA), which grows
   roughly with the square of the worlds and took seconds at ninety of them. It
   depends only on which worlds are visible, so it is built once per set of
   worlds and reused by every render and every click. */
var MP_MODEL_CACHE = { key:null, model:null };
function momentsModel(){
  var key = visibleLineages().map(function(l){ return l.id; }).join(",");
  if(MP_MODEL_CACHE.key === key && MP_MODEL_CACHE.model) return MP_MODEL_CACHE.model;
  var model = momentsModelBuild();
  MP_MODEL_CACHE.key = key; MP_MODEL_CACHE.model = model;
  return model;
}
function momentsModelBuild(){
  var realEv = (REAL && REAL.events) || [];
  var realKinds = [], visits = {};
  realEv.forEach(function(e){
    if(!e.bin) return;
    if(!realKinds.length || realKinds[realKinds.length - 1].bin !== e.bin) realKinds.push({ bin:e.bin, e:e, year:e.year });
    (visits[e.bin] = visits[e.bin] || []).push(e);
  });
  var list = visibleLineages();
  var strands = [], byId = {};
  list.forEach(function(l){
    var evs = (l.events || []).filter(function(e){ return e.bin; }), seq = [];
    evs.forEach(function(e){
      if(!seq.length || seq[seq.length - 1].bin !== e.bin) seq.push({ bin:e.bin, e:e, year:e.year });
    });
    var dv = l.divergence.year;
    /* the strand starts at its fork: what came before was shared with us */
    var post = seq.filter(function(s){ return s.year >= dv; });
    if(!post.length) return;
    var s = { id:l.id, l:l, seq:post, pre:seq.filter(function(x){ return x.year < dv; }),
              kinds:post.map(function(x){ return x.bin; }), ending:mpEndingOf(l), fork:dv, color:l._g.color };
    strands.push(s); byId[l.id] = s;
  });
  var msa = chainMSA(strands.map(function(s){ return { id:s.id, kinds:s.kinds }; }));
  strands.forEach(function(s){
    s.cols = msa.cols[s.id] || s.kinds.map(function(_, i){ return i; });
    s.first = s.cols[0]; s.last = s.cols[s.cols.length - 1];
    s.kindAt = {}; s.stepAt = {};
    s.cols.forEach(function(c, i){ s.kindAt[c] = s.kinds[i]; s.stepAt[c] = i; });
  });
  /* bundles: the same kind, in the same column, in more than one strand */
  var bundles = [], byKind = {};
  for(var c = 0; c < msa.C; c++){
    var g = {};
    strands.forEach(function(s){ var k = s.kindAt[c]; if(k) (g[k] = g[k] || []).push(s); });
    Object.keys(g).forEach(function(k){
      var b = { key:k + "@" + c, kind:k, col:c, strands:g[k], pill:g[k].length > 1 };
      bundles.push(b); (byKind[k] = byKind[k] || []).push(b);
    });
  }
  /* kinds: every kind fiction reaches, with the strands through it wherever
     they reach it, and how those arcs end; plus kinds only we have reached */
  var kinds = {};
  function kindRec(k){
    if(!kinds[k]) kinds[k] = { id:k, spec:mpSpec(k), strands:[], hits:[], ours:!!visits[k], visits:visits[k] || [] };
    return kinds[k];
  }
  strands.forEach(function(s){
    s.kinds.forEach(function(k, i){
      var r = kindRec(k);
      if(r.strands.indexOf(s) < 0) r.strands.push(s);
      r.hits.push({ s:s, step:i, col:s.cols[i] });
    });
  });
  realKinds.forEach(function(r){ kindRec(r.bin); });
  Object.keys(kinds).forEach(function(k){
    var t = { optimistic:[], pessimistic:[], unknown:[] };
    kinds[k].strands.forEach(function(s){ t[s.ending.valence].push(s.l); });
    kinds[k].outcomes = t; kinds[k].worlds = kinds[k].strands.length;
  });
  var endings = MP_ENDINGS.map(function(en){
    var o = { id:en.id, valence:en.valence, label:en.label, definition:en.definition, spec:en, ending:true };
    o.strands = strands.filter(function(s){ return s.ending.id === en.id; });
    o.worlds = list.filter(function(l){ return mpEndingOf(l).id === en.id; });
    return o;
  });
  var tally = { optimistic:[], pessimistic:[], unknown:[] };
  list.forEach(function(l){ tally[mpEndingOf(l).valence].push(l); });
  return { list:list, strands:strands, byId:byId, C:msa.C, bundles:bundles, byKind:byKind, kinds:kinds,
           endings:endings, tally:tally, realKinds:realKinds, realEv:realEv, visits:visits,
           ourKinds:realKinds.map(function(r){ return r.bin; }),
           lastReal: realEv.length ? realEv[realEv.length - 1] : null };
}
function mpEndingRec(M, id){ var out = null; M.endings.forEach(function(e){ if(e.id === id) out = e; }); return out; }

/* --- the camera: one zoom, two pans, over the whole map ------------------------- */
function mpT(x){ return MP.tx + x * MP.s; }
/* x and y scale separately: the fit view squeezes the map's width into the
   canvas but keeps its full height, so the strands spread; zooming from there
   scales both alike */
function mpTY(y){ return MP.ty + y * MP.sy; }
function momentsFit(){ MP.fit = true; }
function momentsZoomAt(g, mx, my){
  if(my == null) my = Hv / 2;
  var s2 = Math.max(MP_MIN_S, Math.min(MP_MAX_S, MP.s * g));
  var r = s2 / MP.s, sy2 = MP.sy * r;
  var wx = (mx - MP.tx) / MP.s, wy = (my - MP.ty) / MP.sy;
  MP.tx = mx - wx * s2; MP.ty = my - wy * sy2; MP.s = s2; MP.sy = sy2; MP.fit = false;
}
function momentsPan(dx, tx0, dy, ty0){
  if(Math.abs(dx) > 8) MP.panned = true;
  MP.tx = tx0 + dx;
  if(ty0 !== undefined) MP.ty = ty0 + (dy || 0);
  MP.fit = false;
}

/* --- selection ------------------------------------------------------------------- */
function mpShow(){
  MP.focus = true;               /* bring the choice into view where the map is narrow */
  if(typeof setPanel === "function") setPanel("moments");
  renderChart(); renderMomentsPanel();
  var d = document.getElementById("drawer"); if(d) d.scrollTop = 0;
  mpSyncHash();
}
function momentsSelectKind(id){ MP.node = id; MP.col = null; MP.beat = null; MP.world = null; MP.news = null; mpShow(); }
function momentsSelectPill(kind, col){ MP.node = kind; MP.col = col; MP.beat = null; MP.world = null; MP.news = null; mpShow(); }
/* A news item: its kind lights the chains through it, and the panel reads
   them with the news on top. */
function momentsSelectNews(n){
  if(!n) return;
  MP.news = n; MP.node = n.bin || null; MP.col = null; MP.beat = null; MP.world = null;
  mpShow();
}
/* The selection as a link someone can share: #news=, #world=, #kind=. */
function mpNewsKey(n){ return n.id || n.date; }
function mpSyncHash(){
  if(typeof history === "undefined" || !history.replaceState || typeof location === "undefined") return;
  var h = MP.news ? "news=" + mpNewsKey(MP.news)
        : MP.world ? "world=" + MP.world
        : MP.node ? "kind=" + MP.node : "";
  try{ history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); }catch(e){}
}
function momentsSelectBeat(id){
  var e = null;
  ((REAL && REAL.events) || []).forEach(function(x){ if(x.id === id) e = x; });
  if(!e) return;
  MP.beat = e; MP.world = null; MP.news = null;
  if(e.bin){ MP.node = e.bin; MP.col = null; }
  mpShow();
}
function momentsSelectWorld(id){
  MP.world = (MP.world === id) ? null : id;
  if(MP.world){ MP.beat = null; MP.news = null; }
  mpShow();
}
function momentsClear(){
  MP.node = null; MP.col = null; MP.world = null; MP.beat = null; MP.news = null;
  renderChart(); renderMomentsPanel(); mpSyncHash();
}

/* --- layout: a storyline ----------------------------------------------------------
   x: the fork zone (our history, by real order) then one column per alignment
   column, then the endings. y: strands pulled together where they bundle and
   kept apart elsewhere, home rows by ending. Deterministic. */
function momentsLayout(M, width){
  var phone = mpIsPhone();
  var left = phone ? 28 : MP_PAD, top = phone ? 70 : 92, bottom = mpUsableHeight() - (phone ? 54 : 72);
  var trunkY = Math.round((top + bottom) / 2);
  var forkL = left + 34, forkR = left + Math.max(170, Math.min(260, width * 0.17));
  var futL = forkR + 14, futR = forkR + 56;
  var colW = 96, colX0 = futR + 70;
  var C = Math.max(1, M.C);
  function xc(c){ return colX0 + c * colW; }
  var bucketX = xc(C - 1) + colW * 0.9, bucketW = 100, bucketH = 46;
  var total = bucketX + bucketW + MP_PAD;
  var bucketY = { optimistic: top + 36, unknown: trunkY, pessimistic: bottom - 36 };

  /* our beats along the trunk, by their own order */
  var realX = {}, evs = M.realEv, nR = evs.length;
  evs.forEach(function(e, i){ realX[e.id] = nR > 1 ? forkL + (forkR - forkL) * i / (nR - 1) : forkR; });
  function forkXFor(year){
    if(!nR) return forkR;
    for(var i = 1; i < nR; i++){
      if(year <= evs[i].year){
        var a = evs[i - 1], b = evs[i], t = (year - a.year) / Math.max(1, b.year - a.year);
        return realX[a.id] + t * (realX[b.id] - realX[a.id]);
      }
    }
    return forkR;
  }
  var pre = [], fut = [], mid = [];
  M.strands.forEach(function(s){
    if(nR && s.fork <= evs[0].year) pre.push(s); else if(s.fork > NOW) fut.push(s); else mid.push(s);
  });
  pre.sort(function(a, b){ return a.fork - b.fork; });
  fut.sort(function(a, b){ return a.fork - b.fork; });
  pre.forEach(function(s, i){ s.forkX = forkL - 26 + (pre.length > 1 ? 20 * i / (pre.length - 1) : 10); });
  fut.forEach(function(s, i){ s.forkX = futL + (fut.length > 1 ? (futR - futL) * i / (fut.length - 1) : (futR - futL) / 2); });
  mid.forEach(function(s){ s.forkX = forkXFor(s.fork); });
  var trunkL = forkL - 34;
  function realXForYear(year){ return year >= NOW ? forkR : Math.min(forkR, forkXFor(year)); }

  /* home rows: ends well above our path, still open around it, ends badly below */
  var rank = { optimistic:0, unknown:1, pessimistic:2 };
  var ss = M.strands.slice().sort(function(a, b){ return rank[a.ending.valence] - rank[b.ending.valence] || a.forkX - b.forkX; });
  var nS = ss.length;
  ss.forEach(function(s, i){
    s.y0 = nS > 1 ? top + 26 + (bottom - top - 52) * i / (nS - 1) : trunkY;
    s.Y = {}; s.cur = s.y0;
  });

  var GAP = 7, columnGroups = {};
  function groupsAt(c, wantOf){
    var groups = [], seen = {};
    ss.forEach(function(s){
      if(c < s.first || c > s.last) return;
      var k = s.kindAt[c], key = k ? "k:" + k : "p:" + s.id;
      if(!seen[key]){ seen[key] = { key:key, kind:k || null, members:[] }; groups.push(seen[key]); }
      seen[key].members.push(s);
    });
    groups.forEach(function(g){
      g.pill = !!g.kind && g.members.length > 1;
      g.size = g.pill ? 26 + (g.members.length - 1) * 3.5 : (g.kind ? 16 : 9);
      g.want = mpMean(g.members.map(function(s){ return wantOf(s, c); }));
      g.members.sort(function(a, b){ return wantOf(a, c) - wantOf(b, c); });
    });
    return groups;
  }
  /* place one side of the trunk: outward from the trunk band, then squeeze back
     inside the canvas if it overflowed */
  function placeSide(groups, dir, edge){
    var start = trunkY + dir * (12 + GAP);
    groups.sort(function(a, b){ return dir * (a.want - b.want); });
    var cursor = start;
    groups.forEach(function(g){
      var y = dir > 0 ? Math.max(g.want, cursor + g.size / 2) : Math.min(g.want, cursor - g.size / 2);
      g.y = y; cursor = y + dir * (g.size / 2 + GAP);
    });
    var over = dir > 0 ? (cursor - GAP) - edge : edge - (cursor + GAP);
    if(over > 0){
      /* pull everything back toward the trunk, keeping the spacing */
      var span = Math.abs(cursor - start), avail = Math.abs(edge - start);
      var k = avail / Math.max(1, span);
      groups.forEach(function(g){ g.y = start + (g.y - start) * k; });
    }
  }
  function placeColumn(c, wantOf){
    var groups = groupsAt(c, wantOf);
    var above = groups.filter(function(g){ return g.want < trunkY; }), below = groups.filter(function(g){ return g.want >= trunkY; });
    placeSide(above, -1, top); placeSide(below, 1, bottom);
    groups.forEach(function(g){
      g.members.forEach(function(s, i){
        s.Y[c] = g.y + (g.pill ? (i - (g.members.length - 1) / 2) * 3.5 : 0);
        s.cur = s.Y[c];
      });
    });
    columnGroups[c] = groups;
  }
  function nextY(s, c){ return c + 1 <= s.last ? s.Y[c + 1] : bucketY[s.ending.valence]; }
  function prevY(s, c){ return c - 1 >= s.first ? s.Y[c - 1] : trunkY + (s.y0 - trunkY) * 0.5; }
  var c;
  for(c = 0; c < C; c++) placeColumn(c, function(s){ return s.cur; });
  for(c = C - 1; c >= 0; c--) placeColumn(c, function(s, cc){ return s.kindAt[cc] ? s.Y[cc] : (prevY(s, cc) + nextY(s, cc)) / 2; });
  for(c = 0; c < C; c++) placeColumn(c, function(s, cc){ return s.kindAt[cc] ? s.Y[cc] : (prevY(s, cc) + nextY(s, cc)) / 2; });

  /* where each strand enters its ending */
  M.endings.forEach(function(en){
    var into = en.strands.slice().sort(function(a, b){ return a.Y[a.last] - b.Y[b.last]; });
    var n = into.length, step = Math.min(3.8, (bucketH - 10) / Math.max(1, n));
    into.forEach(function(s, i){ s.entryY = bucketY[en.valence] + (i - (n - 1) / 2) * step; });
  });

  /* the polyline every strand is drawn from */
  M.strands.forEach(function(s){
    var pts = [{ x:s.forkX, y:trunkY, year:s.fork, fork:true }];
    var lastYear = s.fork;
    for(var cc = s.first; cc <= s.last; cc++){
      var k = s.kindAt[cc], st = s.stepAt[cc];
      if(k) lastYear = s.seq[st].year;
      pts.push({ x:xc(cc), y:s.Y[cc], kind:k || null, step:k ? st : null, col:cc, year:lastYear });
    }
    pts.push({ x:bucketX, y:s.entryY, bucket:true, year:lastYear });
    s.pts = pts;
  });

  /* pills and single marks, with their geometry */
  var pills = [], marks = [];
  M.bundles.forEach(function(b){
    var ys = b.strands.map(function(s){ return s.Y[b.col]; });
    var rec = { key:b.key, kind:b.kind, col:b.col, strands:b.strands, x:xc(b.col), y:mpMean(ys), pill:b.pill };
    if(b.pill) pills.push(rec); else marks.push(rec);
  });

  return { left:left, top:top, bottom:bottom, trunkY:trunkY, trunkL:trunkL, forkL:forkL, forkR:forkR,
           futL:futL, futR:futR, colX0:colX0, colW:colW, C:C, xc:xc, bucketX:bucketX, bucketW:bucketW,
           bucketH:bucketH, bucketY:bucketY, total:total, realX:realX, realXForYear:realXForYear, pills:pills, marks:marks };
}

/* On a phone the map is wider than the screen, so a choice made in the panel
   or on the map can be off to the side. Slide the map, never zoom it, so the
   chosen thing sits a third of the way in. */
function mpFocus(M, L){
  if(!mpIsPhone()) return;
  var x = null, y = L.trunkY;
  if(MP.news) x = L.forkR;
  else if(MP.world && M.byId[MP.world]){ var st = M.byId[MP.world]; x = L.xc(st.first); y = st.Y[st.first]; }
  else if(MP.node && mpIsEnding(MP.node)){ x = L.bucketX + L.bucketW; var en = mpEndingRec(M, MP.node); y = L.bucketY[en ? en.valence : "unknown"]; }
  else if(MP.node && M.kinds[MP.node]){
    var k = M.kinds[MP.node], cols = k.hits.map(function(h){ return h.col; });
    var c = MP.col != null ? MP.col : Math.min.apply(null, cols.length ? cols : [0]);
    x = L.xc(c);
    var ys = k.hits.filter(function(h){ return h.col === c; }).map(function(h){ return h.s.Y[c]; });
    if(ys.length) y = mpMean(ys);
  } else if(MP.beat) x = L.realX[MP.beat.id];
  if(x == null || isNaN(x)) return;
  var target = MP.node && mpIsEnding(MP.node) ? W - 16 : W * 0.34;
  MP.tx = Math.min(0, target - x * MP.s);
  if(y != null && !isNaN(y)) MP.ty = mpUsableHeight() * 0.45 - y * MP.sy;
}
/* "the endings are this way": shown on a phone until the reader first pans */
function mpHint(L){
  var el = document.getElementById("mp-hint");
  if(!el) return;
  var off = mpT(L.bucketX) > MP.width - 20;
  var show = mpIsPhone() && !MP.panned && off && !MP.node && !MP.world && !MP.news;
  el.hidden = !show;
  if(show && el.classList) el.classList.add("on");
}

/* --- drawing helpers ------------------------------------------------------------- */
function mpSeg(x1, y1, x2, y2){
  var dx = Math.max(12, (x2 - x1) * 0.5);
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + " C" + (x1 + dx).toFixed(1) + " " + y1.toFixed(1) + ","
    + (x2 - dx).toFixed(1) + " " + y2.toFixed(1) + "," + x2.toFixed(1) + " " + y2.toFixed(1);
}
function mpWrap(label, max){
  max = max || 15;
  if(label.length <= max) return [label];
  var words = label.split(" "), lines = [""], i;
  for(i = 0; i < words.length; i++){
    var w = words[i], cur = lines[lines.length - 1];
    if(cur && (cur + " " + w).length > max && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = cur ? cur + " " + w : w;
  }
  return lines;
}
function mpTextW(s, px){ return s.length * px * 0.56; }

/* which strands are lit by the current selection; null means all */
function mpLit(M){
  if(MP.world){ var o = {}; o[MP.world] = true; return o; }
  if(MP.node && mpIsEnding(MP.node)){
    var en = mpEndingRec(M, MP.node), lit = {};
    if(en) en.strands.forEach(function(s){ lit[s.id] = true; });
    return lit;
  }
  if(MP.node){
    var k = M.kinds[MP.node], lit2 = {};
    if(k) k.hits.forEach(function(h){ if(MP.col == null || h.col === MP.col) lit2[h.s.id] = true; });
    return lit2;
  }
  return null;
}

function renderMomentsPage(svg){
  var M = momentsModel();
  MP.model = M;
  MP.width = mpUsableWidth();
  var g = sEl("g", null, "moments-page");
  svg.appendChild(g);
  if(!M.strands.length){
    var none = sEl("text", {x:W / 2, y:Hv / 2, "text-anchor":"middle"}, "mp-empty");
    none.textContent = "No chains to show: bin the events first.";
    g.appendChild(none);
    return;
  }
  var L = momentsLayout(M, MP.width);
  MP.geom = L;
  if(MP.fit){
    MP.fitS = mpIsPhone() ? 0.5 : Math.max(MP_MIN_S, Math.min(1, (MP.width - 12) / L.total));
    MP.s = MP.fitS; MP.sy = 1; MP.tx = 0; MP.ty = 0; MP.fit = false;
  }
  if(MP.focus){ MP.focus = false; mpFocus(M, L); }
  mpHint(L);
  var T = mpT, TY = mpTY, s = MP.s;
  var lit = mpLit(M);
  function isLit(id){ return !lit || lit[id]; }
  var anySel = !!(MP.node || MP.world);

  var defs = sEl("defs");
  var mk = sEl("marker", {id:"mp-arrow", viewBox:"0 0 10 10", refX:"9", refY:"5", markerWidth:"6", markerHeight:"6", orient:"auto-start-reverse"});
  mk.appendChild(sEl("path", {d:"M0 1 L9 5 L0 9 z"}, "mp-arrowhead"));
  defs.appendChild(mk);
  g.appendChild(defs);

  /* the column axis: steps after the fork */
  var ax = sEl("g", null, "mp-axis-g");
  for(var c = 0; c < L.C; c++){
    var tx = sEl("text", {x:T(L.xc(c)), y:TY(L.bottom) + 30, "text-anchor":"middle"}, "mp-step");
    tx.textContent = String(c + 1);
    ax.appendChild(tx);
  }
  if(T(L.xc(0)) - T(L.trunkL) > 230){      /* only where it cannot collide with the caption on its left */
    var axl = sEl("text", {x:T(L.xc(0)) - 12, y:TY(L.bottom) + 30, "text-anchor":"end"}, "mp-region");
    axl.textContent = "STEP";
    ax.appendChild(axl);
  }
  var axf = sEl("text", {x:T(L.trunkL), y:TY(L.bottom) + 30, "text-anchor":"start"}, "mp-region");
  axf.textContent = "WHERE THEY LEAVE US";
  ax.appendChild(axf);
  g.appendChild(ax);

  /* the trunk: our history, then our open future */
  var trunk = sEl("g", null, "mp-trunk-g");
  trunk.appendChild(sEl("line", {x1:T(L.trunkL), y1:TY(L.trunkY), x2:T(L.forkR), y2:TY(L.trunkY)}, "mp-trunk"));
  trunk.appendChild(sEl("line", {x1:T(L.forkR), y1:TY(L.trunkY), x2:T(L.bucketX), y2:TY(L.trunkY)}, "mp-trunk-open"));
  var ourLab = sEl("text", {x:T(L.trunkL), y:TY(L.trunkY) - 12}, "mp-region");
  ourLab.textContent = "OUR HISTORY";
  trunk.appendChild(ourLab);
  var openLab = sEl("text", {x:T(L.bucketX) - 6, y:TY(L.trunkY) - 8, "text-anchor":"end"}, "mp-open-cap");
  openLab.textContent = "our chain is still open";
  trunk.appendChild(openLab);
  trunk.appendChild(sEl("circle", {cx:T(L.forkR), cy:TY(L.trunkY), r:7}, "mp-today-ring"));
  var todayLab = sEl("text", {x:T(L.forkR), y:TY(L.trunkY) + 24, "text-anchor":"middle"}, "now-cap mp-today");
  todayLab.textContent = "TODAY " + NOW;
  trunk.appendChild(todayLab);
  if(M.strands.some(function(x){ return x.fork > NOW; })){
    var fl = sEl("text", {x:T((L.futL + L.futR) / 2), y:TY(L.trunkY) + 24, "text-anchor":"middle"}, "mp-open-cap");
    fl.textContent = "fork ahead of us";
    trunk.appendChild(fl);
  }
  /* our beats: a dot each, clickable for the situation match */
  M.realEv.forEach(function(e){
    var x = T(L.realX[e.id]), y = TY(L.trunkY);
    var hit = sEl("circle", {cx:x, cy:y, r:8, fill:"transparent", "pointer-events":"all"}, "mp-beat-hit");
    hit.setAttribute("data-real", e.id);
    var tb = sEl("title");
    tb.textContent = e.year + " · " + e.title + (e.facets ? "\n" + e.facets.change : "")
      + "\nclick: the fictional moments nearest this situation, and the chains most like ours up to here";
    hit.appendChild(tb);
    trunk.appendChild(hit);
    trunk.appendChild(sEl("circle", {cx:x, cy:y, r: MP.beat && MP.beat.id === e.id ? 4 : 2.6},
                          "mp-beat" + (MP.beat && MP.beat.id === e.id ? " selected" : "")));
  });
  g.appendChild(trunk);

  /* the strands */
  var gS = sEl("g", null, "mp-strands");
  M.strands.forEach(function(st){
    var on = isLit(st.id), pts = st.pts;
    var grp = sEl("g", null, "mp-strand " + st.ending.valence + (on ? (anySel ? " lit" : "") : " dim") + (MP.world === st.id ? " chosen" : ""));
    grp.setAttribute("data-strand-g", st.id);
    var full = "";
    for(var i = 1; i < pts.length; i++){
      var a = pts[i - 1], b = pts[i];
      var d = mpSeg(T(a.x), TY(a.y), T(b.x), TY(b.y));
      full += (full ? " " : "") + d;
      grp.appendChild(sEl("path", {d:d, fill:"none"}, "mp-seg" + (a.year > NOW ? " future" : "")));
    }
    var hit = sEl("path", {d:full, fill:"none", "pointer-events":"stroke"}, "mp-strand-hit");
    hit.setAttribute("data-strand", st.id);
    var t = sEl("title");
    t.textContent = st.l.title + " · " + st.ending.label.toLowerCase() + "\n"
      + st.kinds.map(function(k){ return mpLabel(k); }).join(" → ")
      + "\nclick: this chain, and the chains most like it";
    hit.appendChild(t);
    grp.appendChild(hit);
    grp.appendChild(sEl("circle", {cx:T(st.forkX), cy:TY(L.trunkY), r:3}, "mp-fork"));
    gS.appendChild(grp);
  });
  g.appendChild(gS);

  /* single marks: a kind one strand reaches alone at that point */
  var gM = sEl("g", null, "mp-marks");
  L.marks.forEach(function(m){
    var st = m.strands[0], on = isLit(st.id);
    var isSel = MP.node === m.kind && (MP.col == null || MP.col === m.col);
    var grp = sEl("g", null, "mp-mark " + st.ending.valence + (on ? "" : " dim") + (isSel ? " selected" : ""));
    grp.setAttribute("data-pill", m.kind + "@" + m.col);
    grp.appendChild(sEl("circle", {cx:T(m.x), cy:TY(m.y), r:9, fill:"transparent", "pointer-events":"all"}, "mp-hit"));
    grp.appendChild(sEl("circle", {cx:T(m.x), cy:TY(m.y), r:isSel ? 5 : 3.6}, "mp-mark-dot"));
    if(s * L.colW >= 80 || isSel || MP.world === st.id){
      var lab = sEl("text", {x:T(m.x) + 7, y:TY(m.y) - 5}, "mp-mark-label");
      lab.textContent = mpLabel(m.kind);
      grp.appendChild(lab);
    }
    var t = sEl("title");
    t.textContent = mpLabel(m.kind) + " · " + st.l.title + "\n" + st.seq[st.stepAt[m.col]].e.year + " " + st.seq[st.stepAt[m.col]].e.title
      + "\nclick: every chain through this kind";
    grp.appendChild(t);
    gM.appendChild(grp);
  });
  g.appendChild(gM);

  /* pills: where strands bundle */
  var gP = sEl("g", null, "mp-pills");
  var labelAll = s * L.colW >= 62;      /* room for a label in every column */
  L.pills.forEach(function(p){
    var isSel = MP.node === p.kind && (MP.col == null || MP.col === p.col);
    var on = !lit || p.strands.some(function(st){ return lit[st.id]; });
    var onWorld = MP.world && p.strands.some(function(st){ return st.id === MP.world; });
    if(!labelAll && !isSel && !onWorld && p.strands.length < 3){
      /* a small bundle at overview zoom: a knot, not a label */
      var kg = sEl("g", null, "mp-pill knot" + (on ? "" : " dim"));
      kg.setAttribute("data-pill", p.kind + "@" + p.col);
      kg.appendChild(sEl("circle", {cx:T(p.x), cy:TY(p.y), r:9, fill:"transparent", "pointer-events":"all"}, "mp-hit"));
      kg.appendChild(sEl("circle", {cx:T(p.x), cy:TY(p.y), r:5}, "mp-knot"));
      var kn = sEl("text", {x:T(p.x), y:TY(p.y) + 3, "text-anchor":"middle"}, "mp-knot-n");
      kn.textContent = String(p.strands.length);
      kg.appendChild(kn);
      var kt = sEl("title");
      kt.textContent = mpLabel(p.kind) + " · " + p.strands.length + " chains bundle here\n"
        + p.strands.map(function(st){ return st.l.title; }).join(", ") + "\nzoom in for the label · click: the chains through it";
      kg.appendChild(kt);
      gP.appendChild(kg);
      return;
    }
    var lines = mpWrap(mpLabel(p.kind), 15), fs = 10;
    var w = Math.max(54, Math.max.apply(null, lines.map(function(ln){ return mpTextW(ln, fs); })) + 16);
    var h = lines.length > 1 ? 30 : 22;
    var grp = sEl("g", null, "mp-pill" + (isSel ? " selected" : "") + (on ? "" : " dim"));
    grp.setAttribute("data-pill", p.kind + "@" + p.col);
    grp.appendChild(sEl("rect", {x:T(p.x) - w / 2, y:TY(p.y) - h / 2, width:w, height:h, rx:h / 2}, "mp-pill-box"));
    lines.forEach(function(ln, i){
      var ty = TY(p.y) + (lines.length > 1 ? (i === 0 ? -2 : 9) : 3.5);
      var tx2 = sEl("text", {x:T(p.x), y:ty, "text-anchor":"middle"}, "mp-pill-label");
      tx2.textContent = ln;
      grp.appendChild(tx2);
    });
    var badge = sEl("text", {x:T(p.x) + w / 2 - 2, y:TY(p.y) - h / 2 - 3, "text-anchor":"end"}, "mp-pill-n");
    badge.textContent = String(p.strands.length);
    grp.appendChild(badge);
    var t = sEl("title");
    t.textContent = mpLabel(p.kind) + " · " + p.strands.length + " chains bundle here\n"
      + p.strands.map(function(st){ return st.l.title + " (" + st.ending.label.toLowerCase() + ")"; }).join(", ")
      + "\nclick: the chains through it, before and after";
    grp.appendChild(t);
    gP.appendChild(grp);
  });
  g.appendChild(gP);

  mpDrawNews(g, L, T, TY);

  /* the endings */
  var gE = sEl("g", null, "mp-endings");
  M.endings.forEach(function(en){
    var y = L.bucketY[en.valence], x = L.bucketX;
    var isSel = MP.node === en.id;
    var grp = sEl("g", null, "mp-bucket " + en.valence + (isSel ? " selected" : ""));
    grp.setAttribute("data-ending", en.id);
    grp.appendChild(sEl("rect", {x:T(x), y:TY(y) - L.bucketH / 2, width:L.bucketW, height:L.bucketH, rx:8}, "mp-bucket-box"));
    var l1 = sEl("text", {x:T(x) + L.bucketW / 2, y:TY(y) - 3, "text-anchor":"middle"}, "mp-bucket-label");
    l1.textContent = en.label;
    var l2 = sEl("text", {x:T(x) + L.bucketW / 2, y:TY(y) + 12, "text-anchor":"middle"}, "mp-bucket-n");
    l2.textContent = en.worlds.length + (en.worlds.length === 1 ? " world" : " worlds") + (en.valence === "unknown" ? " + us" : "");
    grp.appendChild(l1); grp.appendChild(l2);
    var t = sEl("title");
    t.textContent = en.label + ": " + en.definition + "\nclick: every chain that ends here";
    grp.appendChild(t);
    gE.appendChild(grp);
  });
  g.appendChild(gE);

  var cap = sEl("text", {x:MP.width - MP_PAD, y:22, "text-anchor":"end"}, "axis-caption");
  cap.textContent = M.strands.length + " worlds · " + L.pills.length + " places where their chains meet · drag to move, scroll to zoom";
  g.appendChild(cap);
}

/* --- news on the trunk ------------------------------------------------------------
   Every curated item is a diamond on our history at its date. The newest one
   also carries a flag above TODAY with its headline, and a NEW badge while it
   is fresh, because a reader arriving from a link should see first that this
   map is about the present. Click either to read the news against the chains. */
var MP_FRESH_DAYS = 30;
function mpNewsList(){ return (typeof newsItems === "function") ? newsItems() : ((DATA && DATA.news) || []); }
function mpNewsAgeDays(n){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(n && n.date || ""));
  if(!m) return Infinity;
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return (Date.now() - t) / 86400000;
}
function mpNewsFresh(n){ return mpNewsAgeDays(n) <= MP_FRESH_DAYS; }
function mpNewsYear(n){ var y = parseInt(String(n.date || "").slice(0, 4), 10); return isNaN(y) ? NOW : y; }
function mpClip(s, n){ s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; }
function mpDrawNews(g, L, T, TY){
  var items = mpNewsList();
  if(!items.length) return;
  var gN = sEl("g", null, "mp-news");
  var y = TY(L.trunkY);
  items.forEach(function(n){
    var x = T(L.realXForYear(mpNewsYear(n)));
    var on = MP.news && mpNewsKey(MP.news) === mpNewsKey(n);
    var grp = sEl("g", null, "mp-news-mark" + (on ? " selected" : "") + (mpNewsFresh(n) ? " fresh" : ""));
    grp.setAttribute("data-news", mpNewsKey(n));
    grp.appendChild(sEl("circle", {cx:x, cy:y - 11, r:9, fill:"transparent", "pointer-events":"all"}, "mp-hit"));
    grp.appendChild(sEl("path", {d:"M" + x + " " + (y - 16) + " l5 5 l-5 5 l-5 -5 z"}, "mp-news-diamond"));
    var t = sEl("title");
    t.textContent = fmtNewsDate(n.date) + " · " + n.headline + "\nclick: which fictional chains passed through this kind of moment, and where they went";
    grp.appendChild(t);
    gN.appendChild(grp);
  });
  /* the flag for the newest item (or the chosen one); on a phone it steps aside
     while something else is chosen, so it does not cover the choice */
  if(mpIsPhone() && !MP.news && (MP.node || MP.world || MP.beat)){ g.appendChild(gN); return; }
  var n0 = MP.news || items[0];
  var fx = T(L.realXForYear(mpNewsYear(n0))), top = y - 92;
  var head = mpClip(n0.headline, mpIsPhone() ? 30 : 40), fresh = mpNewsFresh(n0);
  var w = Math.max(170, Math.min(300, head.length * 6.4 + 24)), h = 46;
  var bx = Math.max(6, fx - w + 18);
  var flag = sEl("g", null, "mp-news-flag" + (fresh ? " fresh" : "") + (MP.news ? " selected" : ""));
  flag.setAttribute("data-news", mpNewsKey(n0));
  flag.appendChild(sEl("line", {x1:fx, y1:top + h, x2:fx, y2:y - 17}, "mp-news-stem"));
  flag.appendChild(sEl("rect", {x:bx, y:top, width:w, height:h, rx:6}, "mp-news-box"));
  var k = sEl("text", {x:bx + 10, y:top + 16}, "mp-news-kicker");
  k.textContent = (fresh ? "NEW \u00b7 " : (MP.news ? "IN THE NEWS \u00b7 " : "LATEST NEWS \u00b7 ")) + fmtNewsDate(n0.date).toUpperCase();
  flag.appendChild(k);
  var hl = sEl("text", {x:bx + 10, y:top + 34}, "mp-news-head");
  hl.textContent = head;
  flag.appendChild(hl);
  if(fresh) flag.appendChild(sEl("circle", {cx:bx + w - 12, cy:top + 12, r:4}, "mp-news-pulse"));
  var ft = sEl("title");
  ft.textContent = n0.headline + "\nclick: read it against the chains";
  flag.appendChild(ft);
  gN.appendChild(flag);
  g.appendChild(gN);
}
function mpNewsByKey(key){
  var out = null;
  mpNewsList().forEach(function(n){ if(mpNewsKey(n) === key) out = n; });
  return out;
}
/* A news item, read against the atlas: what kind of moment it is, how the arcs
   through that kind end, our chain with it added, and every chain through it. */
function mpNewsHtml(n, M){
  var k = n.bin ? M.kinds[n.bin] : null;
  var html = '<div class="mp-head mp-news-head"><button class="ghost small" id="mp-back">\u2190 all strands</button>'
    + '<div class="mp-kicker">' + (mpNewsFresh(n) ? '<span class="mp-new">New</span> ' : '') + 'In the news \u00b7 ' + esc(fmtNewsDate(n.date)) + '</div>'
    + '<h3 class="mp-title">' + esc(n.headline) + '</h3>'
    + (n.summary ? '<p class="mp-def">' + esc(n.summary) + '</p>' : '')
    + (n.source && n.source.url ? '<a class="news-src" href="' + esc(n.source.url) + '" target="_blank" rel="noopener">' + esc(n.source.title || "source") + ' \u2197</a>' : '')
    + '</div>';
  if(!k){
    html += '<p class="mp-none">This item is not matched to a kind of moment yet, so it cannot be read against the chains.</p>';
    return html;
  }
  html += '<p class="mp-lead">This is a kind of moment the atlas knows: <button class="mp-kind" data-kind="' + esc(k.id) + '">'
    + esc(mpLabel(k.id)) + '</button>. ' + (k.worlds ? '<b>' + k.worlds + (k.worlds === 1 ? ' fictional world has' : ' fictional worlds have') + '</b> passed through it; they are lit on the map.' : 'No fictional world has passed through it yet.') + '</p>';
  if(k.worlds) html += mpOutcomesHtml(k.outcomes, k.worlds, "How their arcs end");
  var q = mpOurQuery(M, null, 5);
  if(q[q.length - 1] !== n.bin) q = q.concat([n.bin]).slice(-6);
  html += '<h3 class="mp-h">Our chain up to this, matched</h3>'
    + '<div class="mp-chain query">' + q.map(function(x, i){ return (i ? '<span class="mp-arr">\u2192</span>' : '')
        + '<button class="mp-chip us' + (i === q.length - 1 ? ' on' : '') + '" data-kind="' + esc(x) + '">' + esc(mpLabel(x)) + '</button>'; }).join("")
    + '<span class="mp-arr">\u2192</span><span class="mp-chip open">?</span></div>'
    + '<p class="mp-def">Not just this one moment: the stretch of our history that led to it, aligned against every fictional chain. What each world did next is read from that world.</p>'
    + mpQueryHtml(M, q, { k:4 });
  html += '<div class="mp-sep"></div>' + mpKindHtml(k, M).replace('<div class="mp-head">', '<div class="mp-head sub">');
  return html;
}

/* --- the panel ------------------------------------------------------------------ */
function mpWorldButton(l){
  return '<button class="mp-world' + (MP.world === l.id ? ' on' : '') + '" data-world="' + esc(l.id)
    + '" style="--c:' + esc(l._g.color) + '">' + esc(l.title) + '</button>';
}
function mpBadge(l){
  var en = mpEndingOf(l);
  return '<button class="mp-badge ' + en.valence + '" data-kind="' + en.id + '" title="' + esc((l.ending && l.ending.why) || en.definition) + '">' + esc(en.label.toLowerCase()) + '</button>';
}
/* a three-segment bar: how the arcs through something end; each key is a
   button onto that ending */
function mpOutcomesHtml(t, total, title){
  if(!total) return "";
  var html = '<div class="mp-outcomes">' + (title ? '<h3 class="mp-h">' + esc(title) + '</h3>' : '') + '<div class="mp-obar">';
  MP_ENDINGS.forEach(function(en){
    var n = t[en.valence].length; if(!n) return;
    html += '<i class="' + en.valence + '" style="flex:' + n + '" title="' + esc(en.label) + ': ' + n + '"></i>';
  });
  html += '</div><div class="mp-okeys">';
  MP_ENDINGS.forEach(function(en){
    var n = t[en.valence].length;
    html += '<button class="mp-okey ' + en.valence + (n ? '' : ' none') + '" data-kind="' + en.id + '" title="'
      + esc(t[en.valence].map(function(l){ return l.title; }).join(", ")) + '"><b>' + n + '</b> ' + esc(en.label.toLowerCase()) + '</button>';
  });
  html += '</div></div>';
  return html;
}
/* one chain as chips, the emphasised step marked, the ending as a badge */
function mpChainChips(st, emphStep, opts){
  opts = opts || {};
  var html = '<div class="mp-chain">';
  if(opts.head) html += opts.head;
  st.kinds.forEach(function(k, i){
    var on = emphStep != null && i === emphStep;
    var stepAttr = ' data-pill="' + esc(k + "@" + st.cols[i]) + '"';
    html += (i ? '<span class="mp-arr">→</span>' : '')
      + '<button class="mp-chip' + (on ? ' on' : '') + (opts.lo && opts.lo[i] ? ' lo' : '') + '"' + stepAttr
      + ' title="' + esc(st.seq[i].e.year + " " + st.seq[i].e.title) + '">' + esc(mpLabel(k)) + '</button>';
  });
  html += '<span class="mp-arr">→</span>' + mpBadge(st.l) + '</div>';
  return html;
}
/* the chains most like a query chain, by local alignment, read forward */
function mpQueryHtml(M, query, opts){
  opts = opts || {};
  if(!query.length) return '<p class="mp-none">Nothing to match yet.</p>';
  var scored = [];
  M.strands.forEach(function(st){
    if(opts.exclude && st.id === opts.exclude) return;
    var r = chainAlign(query, st.kinds);
    if(r.pairs.length) scored.push({ st:st, r:r });
  });
  scored.sort(function(a, b){ return b.r.score - a.r.score; });
  scored = scored.slice(0, opts.k || 5);
  if(!scored.length) return '<p class="mp-none">No chain in the atlas shares a stretch with this one.</p>';
  var html = '<div class="mp-worlds">';
  scored.forEach(function(x){
    var st = x.st, r = x.r;
    var after = st.seq.slice(r.b1 + 1, r.b1 + 4);
    html += '<div class="mp-card" style="--c:' + esc(st.color) + '"><div class="mp-card-head">' + mpWorldButton(st.l)
      + '<span class="mp-card-tools">' + mpBadge(st.l) + '<span class="mp-score">' + r.likeness.toFixed(2) + ' alike · '
      + r.pairs.length + (r.pairs.length === 1 ? ' step' : ' steps') + '</span></span></div>'
      + '<div class="mp-align">';
    r.pairs.forEach(function(p, i){
      var same = query[p[0]] === st.kinds[p[1]];
      html += (i ? '<span class="mp-arr">→</span>' : '') + '<span class="mp-pair' + (same ? ' same' : '') + '" title="'
        + esc(same ? "the same kind" : "a like kind: " + mpLabel(query[p[0]]) + " ↔ " + mpLabel(st.kinds[p[1]])) + '">'
        + esc(mpLabel(st.kinds[p[1]])) + (same ? '' : '<i>≈ ' + esc(mpLabel(query[p[0]])) + '</i>') + '</span>';
    });
    html += '</div>';
    if(after.length){
      html += '<div class="mp-then">then, in ' + esc(st.l.title) + ':</div><ol class="mp-next">';
      after.forEach(function(x2){
        html += '<li><span class="mp-yr">' + esc(fmtYear(x2.e.year)) + '</span> ' + esc(x2.e.title)
          + ' <button class="mp-kind small" data-kind="' + esc(x2.bin) + '">' + esc(mpLabel(x2.bin)) + '</button></li>';
      });
      html += '</ol>';
    } else {
      html += '<div class="mp-end">the matched stretch is the end of the chain: it ' + esc(st.ending.label.toLowerCase()) + '</div>';
    }
    if(st.l.ending && st.l.ending.why) html += '<div class="mp-why">' + esc(st.ending.label) + ': ' + esc(st.l.ending.why) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}
function mpOurQuery(M, upToId, k){
  var kinds = [];
  var evs = M.realEv;
  for(var i = 0; i < evs.length; i++){
    var e = evs[i];
    if(e.bin && (!kinds.length || kinds[kinds.length - 1] !== e.bin)) kinds.push(e.bin);
    if(upToId && e.id === upToId) break;
  }
  return kinds.slice(-(k || 6));
}

function renderMomentsPanel(){
  var host = document.getElementById("moments-body");
  if(!host) return;
  var M = MP.model || momentsModel();
  var html = "";
  if(MP.news){
    html += mpNewsHtml(MP.news, M);
  } else if(MP.beat){
    html += mpBeatHtml(MP.beat, M);
  } else if(MP.world && M.byId[MP.world]){
    html += mpStrandHtml(M.byId[MP.world], M);
  } else if(MP.node && mpIsEnding(MP.node)){
    html += mpEndingHtml(mpEndingRec(M, MP.node), M);
  } else if(MP.node && M.kinds[MP.node]){
    html += mpKindHtml(M.kinds[MP.node], M);
  } else {
    var latest = mpNewsList()[0];
    if(latest){
      html += '<button class="mp-news-card' + (mpNewsFresh(latest) ? ' fresh' : '') + '" data-news="' + esc(mpNewsKey(latest)) + '">'
        + '<span class="mp-kicker">' + (mpNewsFresh(latest) ? '<span class="mp-new">New</span> ' : 'Latest news \u00b7 ') + esc(fmtNewsDate(latest.date)) + '</span>'
        + '<span class="mp-news-card-head">' + esc(latest.headline) + '</span>'
        + '<span class="mp-news-card-go">Which fictions walked this road, and where it led \u2192</span></button>';
    }
    html += '<p class="mp-intro"><b>Each line is one fictional world.</b> It leaves our history, the blue line, at the moment the story breaks from ours, and runs right through the kinds of moment it lives through to how it ends.</p>'
      + '<ul class="mp-how">'
      + '<li><i class="sw ok"></i><i class="sw bad"></i><i class="sw open"></i><span>Its colour is its ending: <b>well</b>, <b>badly</b>, or <b>still open</b>.</span></li>'
      + '<li><i class="sw pill"></i><span>A <b>pill</b> is where several worlds reach the same kind of moment at the same point in their story.</span></li>'
      + '<li><i class="sw tap"></i><span>Tap a line, a pill or an ending to read it. Drag to move, scroll or +/\u2212 to zoom.</span></li>'
      + '</ul>';
    html += mpOutcomesHtml(M.tally, M.list.length, "How the " + M.list.length + " arcs end");
    var q = mpOurQuery(M, null, 6);
    if(q.length){
      html += '<h3 class="mp-h">Our recent chain, matched</h3>'
        + '<div class="mp-chain query">' + q.map(function(k, i){ return (i ? '<span class="mp-arr">→</span>' : '')
            + '<button class="mp-chip us" data-kind="' + esc(k) + '">' + esc(mpLabel(k)) + '</button>'; }).join("")
        + '<span class="mp-arr">→</span><span class="mp-chip open">?</span></div>'
        + '<p class="mp-def">The last ' + q.length + ' kinds of moment we have been through, aligned against every fictional chain. '
        + 'The same kind counts full, a like situation counts partly, a skipped step costs. What each world did after the matched stretch is read from that world.</p>'
        + mpQueryHtml(M, q, { k:5 });
    }
    var big = MP.geom ? MP.geom.pills.slice().sort(function(a, b){ return b.strands.length - a.strands.length; }).slice(0, 8) : [];
    if(big.length){
      html += '<h3 class="mp-h">Where the most strands bundle</h3><ol class="mp-roads">';
      big.forEach(function(p){
        html += '<li><button class="mp-kind" data-pill="' + esc(p.kind + "@" + p.col) + '">' + esc(mpLabel(p.kind)) + '</button>'
          + '<span class="mp-n">step ' + (p.col + 1) + ' · ' + p.strands.length + ' chains</span>'
          + '<span class="mp-who">' + p.strands.map(function(st){ return esc(st.l.title); }).join(", ") + '</span></li>';
      });
      html += '</ol>';
    }
  }
  host.innerHTML = html;
  Array.prototype.forEach.call(host.querySelectorAll("[data-world]"), function(b){
    b.onclick = function(){ momentsSelectWorld(b.getAttribute("data-world")); };
  });
  Array.prototype.forEach.call(host.querySelectorAll("[data-kind]"), function(b){
    b.onclick = function(){ momentsSelectKind(b.getAttribute("data-kind")); };
  });
  Array.prototype.forEach.call(host.querySelectorAll("[data-pill]"), function(b){
    b.onclick = function(){ var v = b.getAttribute("data-pill").split("@"); momentsSelectPill(v[0], parseInt(v[1], 10)); };
  });
  Array.prototype.forEach.call(host.querySelectorAll("[data-news]"), function(b){
    b.onclick = function(){ momentsSelectNews(mpNewsByKey(b.getAttribute("data-news"))); };
  });
  Array.prototype.forEach.call(host.querySelectorAll("[data-beat]"), function(b){
    b.onclick = function(){ momentsSelectBeat(b.getAttribute("data-beat")); };
  });
  Array.prototype.forEach.call(host.querySelectorAll("[data-open-world]"), function(b){
    b.onclick = function(){ openWorld(b.getAttribute("data-open-world")); };
  });
  var back = document.getElementById("mp-back");
  if(back) back.onclick = function(){
    if(MP.news){ momentsClear(); }
    else if(MP.beat){ MP.beat = null; renderChart(); renderMomentsPanel(); }
    else if(MP.world){ MP.world = null; renderChart(); renderMomentsPanel(); }
    else momentsClear();
  };
}

/* a strand: its chain, how it ends, and the chains most like it */
function mpStrandHtml(st, M){
  var l = st.l;
  var html = '<div class="mp-head"><button class="ghost small" id="mp-back">← ' + (MP.node ? esc(mpLabel(MP.node)) : 'all strands') + '</button>'
    + '<div class="mp-kicker">One chain · ' + esc(l._g.name || "") + '</div>'
    + '<h3 class="mp-title" style="--c:' + esc(st.color) + '">' + esc(l.title) + ' ' + mpBadge(l)
    + ' <button class="mp-open" data-open-world="' + esc(l.id) + '">dossier →</button></h3>'
    + '<p class="mp-def">Leaves our history in <b>' + esc(fmtYearFull(st.fork)) + '</b>: ' + esc(l.divergence.label || "") + '</p>'
    + (l.ending && l.ending.why ? '<p class="mp-why">' + esc(st.ending.label) + ': ' + esc(l.ending.why) + '</p>' : '')
    + '</div>';
  html += '<h3 class="mp-h">The chain, ' + st.kinds.length + ' kinds of moment</h3>' + mpChainChips(st, null);
  html += '<ol class="mp-next chain">';
  st.seq.forEach(function(x, i){
    var others = (M.byKind[x.bin] || []).filter(function(b){ return b.col === st.cols[i]; })[0];
    var withWho = others && others.strands.length > 1 ? others.strands.filter(function(o){ return o !== st; }).map(function(o){ return o.l.title; }) : [];
    html += '<li><span class="mp-yr">' + esc(fmtYear(x.e.year)) + '</span> ' + esc(x.e.title)
      + ' <button class="mp-kind small" data-pill="' + esc(x.bin + "@" + st.cols[i]) + '">' + esc(mpLabel(x.bin)) + '</button>'
      + (withWho.length ? '<span class="mp-who">bundled with ' + esc(withWho.join(", ")) + '</span>' : '') + '</li>';
  });
  html += '</ol>';
  if(st.pre.length){
    html += '<p class="mp-hint">Before its fork it shared ' + st.pre.length + ' charted ' + (st.pre.length === 1 ? 'moment' : 'moments')
      + ' with us: ' + esc(st.pre.map(function(x){ return mpLabel(x.bin); }).join(", ")) + '.</p>';
  }
  html += '<h3 class="mp-h">Chains most like this one</h3>'
    + '<p class="mp-def">Aligned kind by kind. What each did after the shared stretch is where this chain might have gone instead.</p>'
    + mpQueryHtml(M, st.kinds, { k:4, exclude:st.id });
  return html;
}

/* an ending: who runs there, by what last kinds, and what their chains share */
function mpEndingHtml(en, M){
  var html = '<div class="mp-head"><div class="mp-kicker">How an arc ends' + (en.valence === "unknown" ? ' · where our own chain runs' : '') + '</div>'
    + '<h3 class="mp-title mp-title-' + en.valence + '">' + esc(en.label) + '</h3>'
    + '<p class="mp-def">' + esc(en.definition) + '</p></div>';
  /* last kinds before it */
  var lasts = {};
  en.strands.forEach(function(st){ var k = st.kinds[st.kinds.length - 1]; (lasts[k] = lasts[k] || []).push(st); });
  var lastList = Object.keys(lasts).map(function(k){ return { k:k, sts:lasts[k] }; }).sort(function(a, b){ return b.sts.length - a.sts.length; });
  if(lastList.length){
    html += '<h3 class="mp-h">The last kind of moment before it</h3><ul class="mp-follow">';
    lastList.forEach(function(x){
      var pct = Math.round(100 * x.sts.length / Math.max(1, en.strands.length));
      html += '<li><button class="mp-kind" data-kind="' + esc(x.k) + '">' + esc(mpLabel(x.k)) + '</button>'
        + '<span class="mp-bar"><i style="width:' + pct + '%"></i></span>'
        + '<span class="mp-n">' + x.sts.length + ' of ' + en.strands.length + '</span>'
        + '<span class="mp-who">' + x.sts.map(function(st){ return esc(st.l.title); }).join(", ") + '</span></li>';
    });
    html += '</ul>';
  }
  /* what the chains that end here share */
  if(en.strands.length > 1){
    var count = {};
    en.strands.forEach(function(st){ var seen = {}; st.kinds.forEach(function(k){ if(!seen[k]){ seen[k] = true; count[k] = (count[k] || 0) + 1; } }); });
    var common = Object.keys(count).filter(function(k){ return count[k] >= Math.max(2, Math.ceil(en.strands.length / 2)); })
      .sort(function(a, b){ return count[b] - count[a]; });
    html += '<h3 class="mp-h">What these chains have in common</h3>';
    if(common.length){
      html += '<div class="mp-chips">' + common.map(function(k){
        return '<button class="mp-chip" data-kind="' + esc(k) + '">' + esc(mpLabel(k)) + ' <b>' + count[k] + '/' + en.strands.length + '</b></button>';
      }).join("") + '</div><p class="mp-hint">kinds of moment in at least half of them</p>';
    } else html += '<p class="mp-none">No kind of moment is in even half of these chains.</p>';
  }
  if(en.valence === "unknown"){
    html += '<div class="mp-card ours"><div class="mp-card-head"><span class="mp-world">Us, ' + NOW + '</span></div>'
      + '<div class="mp-moment">' + (M.lastReal ? '<b>' + esc(String(M.lastReal.year)) + '</b> ' + esc(M.lastReal.title) : '') + '</div>'
      + '<div class="mp-why">Not decided. Our recent chain is matched against every fiction on the opening panel.</div></div>';
  }
  html += '<h3 class="mp-h">' + en.strands.length + (en.strands.length === 1 ? ' chain ends' : ' chains end') + ' here</h3>';
  if(!en.strands.length) html += '<p class="mp-none">No world in the atlas ends this way.</p>';
  else {
    html += '<div class="mp-worlds">';
    en.strands.slice().sort(function(a, b){ return a.l.title < b.l.title ? -1 : 1; }).forEach(function(st){
      html += '<div class="mp-card" style="--c:' + esc(st.color) + '">'
        + '<div class="mp-card-head">' + mpWorldButton(st.l)
        + '<button class="mp-open" data-open-world="' + esc(st.l.id) + '" title="open the world">dossier →</button></div>'
        + mpChainChips(st, null)
        + '<div class="mp-why">' + esc((st.l.ending && st.l.ending.why) || "") + '</div></div>';
    });
    html += '</div>';
  }
  return html;
}

/* a kind: how the arcs through it end, and every chain through it, before and after */
function mpKindHtml(k, M){
  var html = '<div class="mp-head"><div class="mp-kicker">Kind of moment' + (k.ours ? '' : ' · not yet happened to us') + '</div>'
    + '<h3 class="mp-title">' + esc(mpLabel(k.id)) + '</h3>'
    + (k.spec.definition ? '<p class="mp-def">' + esc(k.spec.definition) + '</p>' : '')
    + (k.spec.exampleHeadline ? '<p class="mp-eg">as a headline: “' + esc(k.spec.exampleHeadline) + '”</p>' : '')
    + '</div>';
  if(k.worlds) html += mpOutcomesHtml(k.outcomes, k.worlds, "How the arcs through it end");
  if(k.visits.length){
    html += '<h3 class="mp-h">Happened to us</h3><ul class="mp-visits">';
    k.visits.forEach(function(e){
      html += '<li><button class="mp-beat-btn" data-beat="' + esc(e.id) + '"><b>' + esc(String(e.year)) + '</b> ' + esc(e.title)
        + '</button><span class="mp-hint">match by situation →</span></li>';
    });
    html += '</ul>';
  }
  if(!k.hits.length){
    html += '<p class="mp-none">No fiction in the atlas reaches this kind of moment.</p>';
    return html;
  }
  /* the chains through it, grouped by where on the map they reach it */
  var byCol = {};
  k.hits.forEach(function(h){ (byCol[h.col] = byCol[h.col] || []).push(h); });
  var cols = Object.keys(byCol).map(Number).sort(function(a, b){
    if(MP.col != null){ if(a === MP.col) return -1; if(b === MP.col) return 1; }
    return byCol[b].length - byCol[a].length || a - b;
  });
  html += '<h3 class="mp-h">' + k.hits.length + (k.hits.length === 1 ? ' chain passes' : ' chains pass') + ' through it'
    + (cols.length > 1 ? ', at ' + cols.length + ' places on the map' : '') + '</h3>'
    + '<p class="mp-def">Each chain whole, this kind marked. What led here is to its left, what followed to its right, how it ended at the end.</p>';
  cols.forEach(function(c){
    var hs = byCol[c];
    html += '<div class="mp-bundle' + (MP.col === c ? ' on' : '') + '"><div class="mp-bundle-head">'
      + '<button class="mp-kind small" data-pill="' + esc(k.id + "@" + c) + '">step ' + (c + 1) + '</button> '
      + (hs.length > 1 ? hs.length + ' chains bundle here' : 'one chain, alone') + '</div>';
    hs.sort(function(a, b){ return a.s.l.title < b.s.l.title ? -1 : 1; }).forEach(function(h){
      var st = h.s, x = st.seq[h.step];
      html += '<div class="mp-card" style="--c:' + esc(st.color) + '"><div class="mp-card-head">' + mpWorldButton(st.l)
        + '<span class="mp-card-tools"><button class="mp-open" data-open-world="' + esc(st.l.id) + '" title="open the world">dossier →</button></span></div>'
        + '<div class="mp-moment"><b>' + esc(fmtYearFull(x.e.year)) + '</b> ' + esc(x.e.title) + '</div>'
        + mpChainChips(st, h.step) + '</div>';
    });
    html += '</div>';
  });
  return html;
}

function mpBeatHtml(e, M){
  var html = '<div class="mp-head"><button class="ghost small" id="mp-back">← ' + esc(mpLabel(e.bin || "")) + '</button>'
    + '<div class="mp-kicker">A moment in our history</div>'
    + '<h3 class="mp-title"><b>' + esc(String(e.year)) + '</b> ' + esc(e.title) + '</h3>'
    + '<p class="mp-def">' + esc(e.description || "") + '</p>';
  if(e.facets){
    var f = e.facets;
    html += '<p class="mp-change">' + esc(f.change || "") + '</p>'
      + '<dl class="mp-facets"><dt>how</dt><dd>' + esc(f.mechanism) + '</dd><dt>who</dt><dd>' + esc(f.actor) + ', from ' + esc(f.position) + '</dd>'
      + '<dt>where</dt><dd>' + esc(f.domain) + ', ' + esc(f.scope) + '</dd>'
      + '<dt>direction</dt><dd>power ' + mpSign(f.direction.power) + ' · openness ' + mpSign(f.direction.openness)
      + ' · capability ' + mpSign(f.direction.capability) + ' · population ' + mpSign(f.direction.population) + '</dd>'
      + (f.preconditions && f.preconditions.length ? '<dt>out of</dt><dd>' + esc(f.preconditions.join(", ")) + '</dd>' : '')
      + '</dl>';
  }
  html += '</div>';
  /* the chain up to here, matched */
  var q = mpOurQuery(M, e.id, 6);
  if(q.length){
    html += '<h3 class="mp-h">Our chain up to here, matched</h3>'
      + '<div class="mp-chain query">' + q.map(function(k, i){ return (i ? '<span class="mp-arr">→</span>' : '')
          + '<button class="mp-chip us' + (i === q.length - 1 ? ' on' : '') + '" data-kind="' + esc(k) + '">' + esc(mpLabel(k)) + '</button>'; }).join("")
      + '</div>' + mpQueryHtml(M, q, { k:4 });
  }
  if(!e.facets || typeof facetMoments !== "function"){
    html += '<p class="mp-none">This beat has no signature yet, so it cannot be matched by situation.</p>';
    return html;
  }
  var moments = facetMoments(), mine = null;
  for(var i = 0; i < moments.length; i++){ if(moments[i].e === e){ mine = moments[i]; break; } }
  var ns = mine ? facetNeighbours(mine, moments, 6) : [];
  html += '<h3 class="mp-h">Nearest situations in fiction</h3>'
    + '<p class="mp-def">This one moment matched on how, who, where and the direction of change. What followed is held out of the match and read from each world.</p>';
  if(!ns.length){ html += '<p class="mp-none">No fictional moment is close to this situation.</p>'; return html; }
  html += '<div class="mp-worlds">';
  ns.forEach(function(nb){
    var m = nb.m, l = DATA.lineages.filter(function(x){ return x.id === m.world; })[0];
    var col = l ? l._g.color : "var(--line-3)";
    var fwd = facetForward(m, 3);
    html += '<div class="mp-card" style="--c:' + esc(col) + '"><div class="mp-card-head">'
      + (l ? mpWorldButton(l) : '<span class="mp-world">' + esc(m.worldTitle) + '</span>')
      + '<span class="mp-card-tools">' + (l ? mpBadge(l) : '') + '<span class="mp-score">' + nb.score.toFixed(2) + ' match</span></span></div>'
      + '<div class="mp-moment"><b>' + esc(fmtYearFull(m.e.year)) + '</b> ' + esc(m.e.title)
      + (m.e.bin ? ' <button class="mp-kind small" data-kind="' + esc(m.e.bin) + '">' + esc(mpLabel(m.e.bin)) + '</button>' : '') + '</div>'
      + '<div class="mp-change small">' + esc(m.e.facets ? m.e.facets.change : "") + '</div>';
    if(fwd.length){
      html += '<ol class="mp-next">';
      fwd.forEach(function(x){
        html += '<li><span class="mp-yr">' + esc(fmtYear(x.year)) + '</span> ' + esc(x.title)
          + (x.bin ? ' <button class="mp-kind small" data-kind="' + esc(x.bin) + '">' + esc(mpLabel(x.bin)) + '</button>' : '') + '</li>';
      });
      html += '</ol>';
    } else html += '<div class="mp-end">the charted history ends here</div>';
    if(l && l.ending) html += '<div class="mp-why">' + esc(mpEndingOf(l).label) + ': ' + esc(l.ending.why) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}
function mpSign(v){ v = v || 0; return v > 0 ? "up" : v < 0 ? "down" : "level"; }

/* Moments is drawn as its own page; the tree's layout and furniture ask this. */
function graphMode(){ return axisMode === "moments"; }

/* Real history's beats in the line-shaped views (Order, Years): a strip at the
   head of the drawing area. The Moments page draws its own. */
function drawRealBeats(host, list, left, right, ty){
  ty = ty || 0;
  if(!REAL || !REAL.events || !REAL.events.length) return;
  if(graphMode()) return;
  var g = sEl("g", null, "real-beats");
  var shown = 0;
  REAL.events.forEach(function(e){
    var x = AX.realX ? AX.realX(e) : null;
    if(x == null || isNaN(x) || x < left - 4 || x > right + 4) return;
    shown++;
    var hit = sEl("circle", {cx:x, cy:ty, r:9, fill:"transparent", "pointer-events":"all"}, "real-hit");
    hit.setAttribute("data-real", e.id);
    hit.style.cursor = "pointer";
    var t = sEl("title");
    t.textContent = fmtYear(e.year) + " · " + e.title + "\n" + (e.facets ? e.facets.change : "")
      + "\nclick to read what followed in worlds in this situation";
    hit.appendChild(t);
    g.appendChild(hit);
    g.appendChild(paintC(sEl("circle", {cx:x, cy:ty, r:3.1}, "real-dot"), "fill", "#ffffff"));
  });
  /* the trunk is already labelled "real history"; the dots need no second caption */
  host.appendChild(g);
  Array.prototype.forEach.call(g.querySelectorAll("[data-real]"), function(el){
    el.onclick = function(ev){
      if(ev && ev.stopPropagation) ev.stopPropagation();
      var id = el.getAttribute("data-real"), e = null;
      REAL.events.forEach(function(x){ if(x.id === id) e = x; });
      if(e) matchMoment(e);
    };
  });
}
