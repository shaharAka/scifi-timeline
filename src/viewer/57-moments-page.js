/* ============================================================================
   The Moments page: a flow of what leads to what.

   One circle per kind of moment. The roads between kinds are the drawing: a
   road is a move some fiction makes from one kind to the next after it has
   left our history, drawn once, heavier the more worlds make it, with an arrow
   where several do, dashed where it lies ahead of today. A road only one world
   takes is a whisper until a circle or a world is chosen. Our own history is
   one path through the same kinds, dotted, in our colour, with the kind we are
   in now double-ringed.

   The circles are placed left to right by what leads to what - dagre ranks the
   shared roads and our own path - and never by a date or by the order we first
   reached them. Kinds no shared road touches sit in a row underneath.

   Nothing is coloured by world until you ask for one. Click a circle and the
   panel shows every world that passes through that kind of moment, the moment
   each one had there, what followed, what leads here and what it leads to.
   Click a time it happened to us and the panel matches that real beat by
   situation to the nearest fictional moments and reads them forward. Click a
   world's name to light its whole road.

   Rendering is Cytoscape.js + dagre from vendor/ when present, with an SVG
   flow drawn from the same model when it is not (the test shim). The page has
   its own camera: wheel zooms around the cursor, drag pans, Fit shows the whole
   map beside the panel, and it opens with our own path framed at a readable
   zoom.
   ========================================================================== */

var MP = { s:1, tx:0, ty:0, node:null, world:null, beat:null, model:null, geom:null, width:900 };
var MP_PAD = 72;
var MP_MAX_S = 9;

/* the width the line may use: the canvas minus the panel when it is open */
function mpUsableWidth(){
  var d = document.getElementById("drawer");
  var open = d && d.classList && d.classList.contains("open");
  var pw = open ? (d.offsetWidth || Math.min(480, W * 0.94)) : 0;
  return Math.max(320, W - pw);
}

function mpMean(a){ var s = 0; a.forEach(function(v){ s += v; }); return a.length ? s / a.length : 0; }
function mpSpec(id){
  var en = mpEndingSpec(id); if(en) return en;
  var out = null;
  ((typeof BINS !== "undefined" && BINS) || []).forEach(function(b){ if(b.id === id) out = b; });
  return out || { id:id, label:id, definition:"" };
}
function mpLabel(id){ return mpSpec(id).label || id; }

/* Where an arc converges. Three sinks, drawn as the right edge of the map: every
   world's path runs into one, and ours runs into "unknown" because we are still
   inside it. The valence is the state the story leaves the world in as far as
   it is told (data/SCHEMA.md, Endings), never the mood of the last beat. */
var MP_ENDINGS = [
  { id:"ending-optimistic",  valence:"optimistic",  label:"Ends well",  definition:"The world is left better, freer or safer than at the fork, or the threat that drove the story is ended." },
  { id:"ending-pessimistic", valence:"pessimistic", label:"Ends badly", definition:"The world is left ruined, captive or doomed, and the story does not take that back." },
  { id:"ending-unknown",     valence:"unknown",     label:"Still open", definition:"The author left it open, the franchise is mid-sentence, or the story refuses to say. Our own history ends here too." }
];
function mpEndingSpec(v){ var out = null; MP_ENDINGS.forEach(function(e){ if(e.valence === v || e.id === v) out = e; }); return out; }
function mpEndingOf(l){ return (l && l.ending && mpEndingSpec(l.ending.valence)) || mpEndingSpec("unknown"); }
function mpIsEnding(id){ return !!mpEndingSpec(id); }

/* --- the model: kinds, our order, roads, what follows ------------------------ */
function momentsModel(){
  var realEv = (REAL && REAL.events) || [];
  var realOrder = [], visits = {};
  realEv.forEach(function(e){
    if(!e.bin) return;
    if(realOrder.indexOf(e.bin) < 0) realOrder.push(e.bin);
    (visits[e.bin] = visits[e.bin] || []).push(e);
  });
  var list = visibleLineages();
  var through = {}, pos = {}, paths = {};
  list.forEach(function(l){
    var evs = (l.events || []).filter(function(e){ return e.bin; });
    var seq = [];
    evs.forEach(function(e, i){
      if(!seq.length || seq[seq.length - 1].bin !== e.bin) seq.push({ bin:e.bin, e:e, year:e.year });
      (pos[e.bin] = pos[e.bin] || []).push(i / Math.max(1, evs.length - 1));
    });
    paths[l.id] = { l:l, seq:seq };
    seq.forEach(function(s, i){ (through[s.bin] = through[s.bin] || []).push({ l:l, e:s.e, i:i, seq:seq }); });
  });
  var fictionOnly = Object.keys(through).filter(function(b){ return realOrder.indexOf(b) < 0; })
    .sort(function(a, b){ return mpMean(pos[a]) - mpMean(pos[b]); });
  var order = realOrder.concat(fictionOnly);
  var nodes = [], at = {};
  order.forEach(function(b, i){
    var th = through[b] || [], ws = {};
    th.forEach(function(t){ ws[t.l.id] = true; });
    var n = { id:b, i:i, spec:mpSpec(b), ours: realOrder.indexOf(b) >= 0, visits: visits[b] || [],
              through: th, worlds: Object.keys(ws).length };
    var f = {};
    th.forEach(function(t){
      var nx = t.seq[t.i + 1];
      if(nx){ (f[nx.bin] = f[nx.bin] || { bin:nx.bin, worlds:[] }).worlds.push(t.l); }
    });
    n.follow = Object.keys(f).map(function(k){ return f[k]; })
      .sort(function(x, y){ return y.worlds.length - x.worlds.length; });
    nodes.push(n); at[b] = n;
  });
  /* the three sinks: one node per valence, after every kind */
  MP_ENDINGS.forEach(function(en, j){
    var n = { id:en.id, i:order.length + j, spec:en, ending:true, valence:en.valence, ours: en.valence === "unknown",
              visits:[], through:[], worlds:0, follow:[] };
    list.forEach(function(l){
      if(mpEndingOf(l).id !== en.id) return;
      var seq = paths[l.id].seq, last = seq.length ? seq[seq.length - 1] : null;
      n.through.push({ l:l, e:last ? last.e : null, i:seq.length, seq:seq, why:(l.ending || {}).why || "" });
    });
    n.worlds = n.through.length;
    pos[en.id] = [1.06];
    nodes.push(n); at[en.id] = n;
  });
  /* of the worlds through each kind, how their arcs end */
  nodes.forEach(function(n){
    if(n.ending) return;
    var seen = {}, t = { optimistic:[], pessimistic:[], unknown:[] };
    n.through.forEach(function(x){ if(seen[x.l.id]) return; seen[x.l.id] = true; t[mpEndingOf(x.l).valence].push(x.l); });
    n.outcomes = t;
  });
  var roads = {}, roadList = [];
  Object.keys(paths).forEach(function(id){
    var p = paths[id], dv = p.l.divergence.year;
    /* the arc's last kind runs into its ending */
    if(p.seq.length){
      var lastS = p.seq[p.seq.length - 1], en = mpEndingOf(p.l), ek = lastS.bin + "|" + en.id;
      if(at[lastS.bin]){
        if(!roads[ek]){ roads[ek] = { a:lastS.bin, b:en.id, key:ek, worlds:[], future:false, ending:true }; roadList.push(roads[ek]); }
        roads[ek].worlds.push(p.l);
        if(lastS.year > NOW) roads[ek].future = true;
        at[lastS.bin].follow.push({ bin:en.id, worlds:[p.l], ending:true });
      }
    }
    for(var i = 1; i < p.seq.length; i++){
      if(p.seq[i].year < dv) continue;
      var a = p.seq[i - 1].bin, b = p.seq[i].bin;
      if(!at[a] || !at[b]) continue;
      var k = a + "|" + b;
      if(!roads[k]){ roads[k] = { a:a, b:b, key:k, worlds:[], future:false }; roadList.push(roads[k]); }
      roads[k].worlds.push(p.l);
      if(p.seq[i - 1].year > NOW) roads[k].future = true;
    }
  });
  nodes.forEach(function(n){
    if(n.ending) return;
    var merged = {}, outF = [];
    n.follow.forEach(function(f){
      if(!merged[f.bin]){ merged[f.bin] = { bin:f.bin, worlds:[], ending:!!f.ending }; outF.push(merged[f.bin]); }
      merged[f.bin].worlds = merged[f.bin].worlds.concat(f.worlds);
    });
    n.follow = outF.sort(function(x, y){ return y.worlds.length - x.worlds.length; });
  });
  roadList.sort(function(x, y){ return y.worlds.length - x.worlds.length; });
  var ours = [];
  for(var j = 1; j < realEv.length; j++){
    var a2 = realEv[j - 1].bin, b2 = realEv[j].bin;
    if(a2 && b2 && a2 !== b2 && at[a2] && at[b2]) ours.push({ a:a2, b:b2, from:realEv[j - 1], to:realEv[j] });
  }
  var lastRealEv = realEv.length ? realEv[realEv.length - 1] : null;
  if(lastRealEv && lastRealEv.bin && at[lastRealEv.bin]){
    ours.push({ a:lastRealEv.bin, b:"ending-unknown", from:lastRealEv, to:{ year:NOW, title:"where we are now: not yet decided" }, ending:true });
  }
  return { nodes:nodes, at:at, order:order, realOrder:realOrder, fictionOnly:fictionOnly, pos:pos,
           roads:roadList, ours:ours, paths:paths, list:list,
           todayIndex: realOrder.length - 1, lastReal: realEv.length ? realEv[realEv.length - 1] : null };
}

/* --- the camera: one zoom, two pans, over the whole flow ------------------------ */
function mpT(x){ return MP.tx + x * MP.s; }
function mpTY(y){ return MP.ty + y * MP.s; }
function momentsFit(){ MP.s = 1; MP.tx = 0; MP.ty = 0; }
function momentsZoomAt(g, mx, my){
  if(my == null) my = Hv / 2;
  var s2 = Math.max(0.6, Math.min(MP_MAX_S, MP.s * g));
  var wx = (mx - MP.tx) / MP.s, wy = (my - MP.ty) / MP.s;
  MP.tx = mx - wx * s2; MP.ty = my - wy * s2; MP.s = s2;
}
function momentsPan(dx, tx0, dy, ty0){
  MP.tx = tx0 + dx;
  if(ty0 !== undefined) MP.ty = ty0 + (dy || 0);
}

/* --- selection ------------------------------------------------------------------ */
function momentsSelectKind(id){
  MP.node = id; MP.beat = null;
  if(MP.world && MP.model && !(MP.model.paths[MP.world] && MP.model.paths[MP.world].seq.some(function(s){ return s.bin === id; }))) MP.world = null;
  renderChart(); renderMomentsPanel();
  if(typeof setPanel === "function") setPanel("moments");
}
function momentsSelectBeat(id){
  var e = null;
  ((REAL && REAL.events) || []).forEach(function(x){ if(x.id === id) e = x; });
  if(!e) return;
  MP.beat = e; MP.node = e.bin || MP.node; MP.world = null;
  renderChart(); renderMomentsPanel();
  if(typeof setPanel === "function") setPanel("moments");
}
function momentsSelectWorld(id){
  MP.world = (MP.world === id) ? null : id;
  renderChart(); renderMomentsPanel();
}
function momentsClear(){
  MP.node = null; MP.world = null; MP.beat = null;
  renderChart(); renderMomentsPanel();
}

/* --- layout: x is story position, y follows the roads ----------------------------- */
function momentsLayout(M, width){
  var left = MP_PAD, right = width - MP_PAD - 110, top = 78, bottom = Hv - 64;
  var n = M.nodes.length;
  /* x: where the kind tends to fall in a story (0 = a story's first beat,
     1 = its last), averaged over every world that has it; a kind only our
     history has is placed by its rank in ours */
  M.nodes.forEach(function(k){
    var ps = M.pos[k.id];
    var p = (ps && ps.length) ? mpMean(ps)
          : (M.realOrder.length > 1 ? M.realOrder.indexOf(k.id) / (M.realOrder.length - 1) : 0.5);
    k.p = p;
    k.fx = left + (right - left) * p;
  });
  /* neighbours, weighted by how many worlds take the road */
  var nb = {};
  M.nodes.forEach(function(k){ nb[k.id] = []; });
  M.roads.forEach(function(r){
    nb[r.a].push({ id:r.b, w:r.worlds.length }); nb[r.b].push({ id:r.a, w:r.worlds.length });
  });
  M.ours.forEach(function(o){ nb[o.a].push({ id:o.b, w:1 }); nb[o.b].push({ id:o.a, w:1 }); });
  /* y: start spread by x-rank, then pull each kind toward the kinds it connects
     to, then push apart anything that would overlap. Deterministic. */
  var byX = M.nodes.slice().sort(function(a, b){ return a.fx - b.fx || (a.id < b.id ? -1 : 1); });
  byX.forEach(function(k, i){
    var f = (i * 0.6180339887) % 1;
    k.fy = top + (bottom - top) * f;
  });
  var minGap = 34;
  for(var it = 0; it < 8; it++){
    M.nodes.forEach(function(k){
      var ws = 0, sum = 0;
      nb[k.id].forEach(function(e){ var o = M.at[e.id]; if(!o) return; sum += o.fy * e.w; ws += e.w; });
      if(ws) k.fy = 0.55 * k.fy + 0.45 * (sum / ws);
    });
    /* de-overlap: kinds close in x must be a lane apart in y */
    var byY = M.nodes.slice().sort(function(a, b){ return a.fy - b.fy; });
    for(var pass = 0; pass < 3; pass++){
      for(var i = 0; i < byY.length; i++){
        for(var j = i + 1; j < byY.length; j++){
          var A = byY[i], B = byY[j];
          if(Math.abs(A.fx - B.fx) > 96) continue;
          var d = B.fy - A.fy;
          if(d < minGap){ var push = (minGap - d) / 2; A.fy -= push; B.fy += push; }
        }
      }
      byY.sort(function(a, b){ return a.fy - b.fy; });
    }
    M.nodes.forEach(function(k){ k.fy = Math.max(top, Math.min(bottom, k.fy)); });
  }
  return { left:left, right:right, top:top, bottom:bottom };
}

/* --- drawing ------------------------------------------------------------------- */
/* a road from A to B: an S-curve forward, a loop over the top when it runs back */
function mpRoadPath(x1, y1, x2, y2){
  var dx = x2 - x1;
  if(dx >= 0){
    var c = Math.max(24, dx * 0.5);
    return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + " C" + (x1 + c).toFixed(1) + " " + y1.toFixed(1) + ","
      + (x2 - c).toFixed(1) + " " + y2.toFixed(1) + "," + x2.toFixed(1) + " " + y2.toFixed(1);
  }
  var lift = Math.min(160, 50 + Math.abs(dx) * 0.25);
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + " C" + (x1 + 70).toFixed(1) + " " + (y1 - lift).toFixed(1) + ","
    + (x2 - 70).toFixed(1) + " " + (y2 - lift).toFixed(1) + "," + x2.toFixed(1) + " " + y2.toFixed(1);
}
function mpRadius(k){ return 4 + Math.min(10, k.worlds * 0.9); }

function renderMomentsPage(svg){
  var M = momentsModel();
  MP.model = M;
  MP.width = mpUsableWidth();
  if(mpCyAvailable()){ renderMomentsCy(M); return; }
  var cb = document.getElementById("chartbody");
  if(cb && cb.classList) cb.classList.remove("cy-on");
  var g = sEl("g", null, "moments-page");
  svg.appendChild(g);
  if(!M.nodes.length){
    var none = sEl("text", {x:W / 2, y:Hv / 2, "text-anchor":"middle"}, "mp-empty");
    none.textContent = "No kinds of moment to show: bin the events first.";
    g.appendChild(none);
    return;
  }
  var L = momentsLayout(M, MP.width);
  MP.geom = L;
  M.nodes.forEach(function(k){ k.x = mpT(k.fx); k.y = mpTY(k.fy); });

  var defs = sEl("defs");
  var mk = sEl("marker", {id:"mp-arrow", viewBox:"0 0 10 10", refX:"9", refY:"5", markerWidth:"7", markerHeight:"7", orient:"auto-start-reverse"});
  mk.appendChild(sEl("path", {d:"M0 1 L9 5 L0 9 z"}, "mp-arrowhead"));
  defs.appendChild(mk);
  g.appendChild(defs);

  /* the story axis: beginning to end */
  var ay = Hv - 30;
  var axl = sEl("text", {x:mpT(L.left), y:ay, "text-anchor":"start"}, "mp-region");
  axl.textContent = "BEGINNING OF A STORY";
  var axr = sEl("text", {x:mpT(L.right), y:ay, "text-anchor":"end"}, "mp-region");
  axr.textContent = "END OF A STORY";
  var axm = sEl("text", {x:mpT((L.left + L.right) / 2), y:ay, "text-anchor":"middle"}, "mp-region faint");
  axm.textContent = "left to right: where a kind of moment tends to fall  ·  roads: what leads to what  ·  thickness: how many worlds";
  g.appendChild(sEl("line", {x1:mpT(L.left), y1:ay - 14, x2:mpT(L.right), y2:ay - 14}, "mp-axis"));
  g.appendChild(axl); g.appendChild(axr); g.appendChild(axm);

  var selected = MP.node, litWorld = MP.world;
  function touches(r){ return selected && (r.a === selected || r.b === selected); }

  /* our own path through the kinds, as it actually ran */
  var gOurs = sEl("g", null, "mp-ours");
  M.ours.forEach(function(o){
    var A = M.at[o.a], B = M.at[o.b];
    var p = sEl("path", {d:mpRoadPath(A.x, A.y, B.x, B.y), fill:"none"}, "mp-our-road");
    p.setAttribute("data-our-road", o.a + "|" + o.b);
    if(selected && !(o.a === selected || o.b === selected)) p.setAttribute("opacity", "0.12");
    var t = sEl("title"); t.textContent = "us: " + o.from.year + " " + o.from.title + "  →  " + o.to.year + " " + o.to.title;
    p.appendChild(t);
    gOurs.appendChild(p);
  });
  g.appendChild(gOurs);

  /* the roads */
  var gRoads = sEl("g", null, "mp-roads");
  M.roads.forEach(function(r){
    var A = M.at[r.a], B = M.at[r.b];
    var shared = r.worlds.length > 1;
    var p = sEl("path", {d:mpRoadPath(A.x, A.y, B.x, B.y), fill:"none"},
                "mp-road" + (shared ? " shared" : "") + (r.future ? " future" : "") + (r.ending ? " into-ending " + (M.at[r.b].valence || "") : ""));
    p.setAttribute("data-road", r.key);
    p.setAttribute("stroke-width", (0.8 + Math.min(4, r.worlds.length * 0.9)).toFixed(2));
    if(shared || touches(r)) p.setAttribute("marker-end", "url(#mp-arrow)");
    if(selected) p.setAttribute("opacity", touches(r) ? "0.95" : "0.04");
    var t = sEl("title");
    t.textContent = mpLabel(r.a) + "  →  " + mpLabel(r.b) + "\n" + r.worlds.length
      + (r.worlds.length === 1 ? " world: " : " worlds: ") + r.worlds.map(function(l){ return l.title; }).join(", ");
    p.appendChild(t);
    gRoads.appendChild(p);
  });
  g.appendChild(gRoads);

  /* one world's whole road, in its colour */
  if(litWorld && M.paths[litWorld]){
    var pth = M.paths[litWorld], col = pth.l._g.color, dv = pth.l.divergence.year;
    var gW = sEl("g", null, "mp-world-path");
    for(var i = 1; i < pth.seq.length; i++){
      var a = pth.seq[i - 1], b = pth.seq[i], A2 = M.at[a.bin], B2 = M.at[b.bin];
      if(!A2 || !B2) continue;
      var wp = sEl("path", {d:mpRoadPath(A2.x, A2.y, B2.x, B2.y), fill:"none", "marker-end":"url(#mp-arrow)"},
                   "mp-world-road" + (b.year < dv ? " shared-with-us" : "") + (a.year > NOW ? " future" : ""));
      paintC(wp, "stroke", col);
      var tt = sEl("title");
      tt.textContent = pth.l.title + ": " + a.e.year + " " + a.e.title + "  →  " + b.e.year + " " + b.e.title
        + (b.year < dv ? "\n(still sharing our history)" : "");
      wp.appendChild(tt);
      gW.appendChild(wp);
    }
    pth.seq.forEach(function(s){
      var K = M.at[s.bin]; if(!K) return;
      gW.appendChild(paintC(sEl("circle", {cx:K.x, cy:K.y, r:mpRadius(K) + 4}, "mp-world-ring"), "stroke", col));
    });
    g.appendChild(gW);
  }

  /* the kinds */
  var connected = {};
  if(selected){ M.roads.forEach(function(r){ if(touches(r)){ connected[r.a] = true; connected[r.b] = true; } }); }
  var gNodes = sEl("g", null, "mp-nodes");
  M.nodes.forEach(function(k){
    var x = k.x, y = k.y, r = mpRadius(k);
    var grp = sEl("g", null, "mp-node" + (k.ending ? " ending " + k.valence : (k.ours ? " ours" : " notyet")) + (k.id === selected ? " selected" : ""));
    grp.setAttribute("data-moment-node", k.id);
    if(selected && k.id !== selected && !connected[k.id]) grp.setAttribute("opacity", "0.3");
    grp.appendChild(sEl("circle", {cx:x, cy:y, r:r + 7, fill:"transparent", "pointer-events":"all"}, "mp-hit"));
    grp.appendChild(sEl("circle", {cx:x, cy:y, r:r}, "mp-circle"));
    if(k.id === selected) grp.appendChild(sEl("circle", {cx:x, cy:y, r:r + 4}, "mp-selected-ring"));
    if(r >= 7){
      var ct = sEl("text", {x:x, y:y + 3, "text-anchor":"middle"}, "mp-count");
      ct.textContent = String(k.worlds);
      grp.appendChild(ct);
    }
    var lab = sEl("text", {x:x + r + 5, y:y + 3.5}, "mp-label" + (MP.s < 0.8 ? " tight" : ""));
    lab.textContent = mpLabel(k.id);
    grp.appendChild(lab);
    if(k.visits.length){
      var yr = sEl("text", {x:x + r + 5, y:y + 14}, "mp-years");
      yr.textContent = "us: " + k.visits.slice(0, 3).map(function(e){ return e.year; }).join(", ") + (k.visits.length > 3 ? " …" : "");
      grp.appendChild(yr);
    }
    var t = sEl("title");
    t.textContent = mpLabel(k.id) + " — " + k.worlds + (k.worlds === 1 ? " world" : " worlds")
      + (k.visits.length ? "\nhappened to us: " + k.visits.map(function(e){ return e.year; }).join(", ") : "\nhas not happened to us")
      + "\n" + (k.spec.definition || "") + "\nclick: what leads here, what it leads to, and the worlds through it";
    grp.appendChild(t);
    gNodes.appendChild(grp);
    /* the times it happened to us: a dot per visit above the circle, clickable */
    var kk = k.visits.length;
    k.visits.forEach(function(e, j){
      var vx = x + (j - (kk - 1) / 2) * 7, vy = y - r - 8;
      var hit = sEl("circle", {cx:vx, cy:vy, r:6, fill:"transparent", "pointer-events":"all"}, "mp-beat-hit");
      hit.setAttribute("data-real", e.id);
      var tb = sEl("title");
      tb.textContent = e.year + " · " + e.title + (e.facets ? "\n" + e.facets.change : "")
        + "\nclick: the fictional moments nearest this situation, and what followed there";
      hit.appendChild(tb);
      hit.onclick = function(ev){ if(ev && ev.stopPropagation) ev.stopPropagation(); momentsSelectBeat(e.id); };
      gNodes.appendChild(hit);
      gNodes.appendChild(sEl("circle", {cx:vx, cy:vy, r: MP.beat && MP.beat.id === e.id ? 3.6 : 2.4},
                              "mp-beat" + (MP.beat && MP.beat.id === e.id ? " selected" : "")));
    });
  });
  g.appendChild(gNodes);
  Array.prototype.forEach.call(gNodes.querySelectorAll("[data-moment-node]"), function(el){
    el.onclick = function(ev){ if(ev && ev.stopPropagation) ev.stopPropagation(); momentsSelectKind(el.getAttribute("data-moment-node")); };
  });

  /* today: where our path currently ends */
  if(M.lastReal && M.at[M.lastReal.bin]){
    var tn = M.at[M.lastReal.bin], rr = mpRadius(tn) + 8;
    g.appendChild(sEl("circle", {cx:tn.x, cy:tn.y, r:rr}, "mp-today-ring"));
    var tl = sEl("text", {x:tn.x, y:tn.y - rr - 6, "text-anchor":"middle"}, "now-cap mp-today");
    tl.textContent = "TODAY " + NOW + " · we are here";
    g.appendChild(tl);
  }

  var cap = sEl("text", {x:MP.width - MP_PAD, y:22, "text-anchor":"end"}, "axis-caption");
  cap.textContent = M.nodes.length + " kinds of moment · " + M.roads.length + " roads, "
    + M.roads.filter(function(r){ return r.worlds.length > 1; }).length + " taken by more than one world · zoom " + MP.s.toFixed(1) + "×";
  g.appendChild(cap);
}


/* ============================================================================
   The Cytoscape rendering of the same model. Layout is dagre, left to right:
   ranks come from the roads themselves, so a kind sits to the right of the
   kinds that lead to it. Cytoscape owns pan, zoom and hit-testing on a canvas,
   which is what a graph of 140 roads needs; the SVG drawing above stays as the
   headless fallback (the test harness has no canvas and loads no vendor code).
   ========================================================================== */
function mpCyAvailable(){
  return typeof window !== "undefined" && typeof window.cytoscape === "function"
      && !!document.getElementById("cy") && typeof document.createElement("canvas").getContext === "function";
}
function mpCss(name, fallback){
  try{
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }catch(e){ return fallback; }
}
function mpElements(M){
  var els = [];
  var todayId = M.lastReal ? M.lastReal.bin : null;
  M.nodes.forEach(function(k){
    var years = k.visits.length ? "us: " + k.visits.slice(0, 3).map(function(e){ return e.year; }).join(", ") + (k.visits.length > 3 ? " …" : "") : "";
    els.push({ group:"nodes", data:{ id:k.id, label:mpLabel(k.id) + (k.ending ? "\n" + k.worlds + (k.worlds === 1 ? " world" : " worlds") : ""),
               years:years, worlds:k.worlds, ours:k.ours ? 1 : 0, p:k.p || 0, valence:k.valence || "" },
               classes:(k.ending ? "ending " + k.valence : (k.ours ? "ours" : "notyet")) + (k.id === todayId ? " today" : "") });
  });
  M.roads.forEach(function(r){
    els.push({ group:"edges", data:{ id:"r:" + r.key, source:r.a, target:r.b, weight:r.worlds.length,
               names:r.worlds.map(function(l){ return l.title; }).join(", ") },
               classes:"road" + (r.worlds.length > 1 ? " shared" : "") + (r.future ? " future" : "")
                       + (r.ending ? " into-ending " + at(r.b).valence : "") });
  });
  M.ours.forEach(function(o, i){
    els.push({ group:"edges", data:{ id:"o:" + i, source:o.a, target:o.b, weight:1, names:o.from.year + " " + o.from.title + " → " + o.to.year + " " + o.to.title },
               classes:"ours" + (o.ending ? " into-ending" : "") });
  });
  return els;
  function at(id){ return M.at[id] || {}; }
}
function mpCyStyle(){
  var trunk = mpCss("--trunk", "#1d3f6b"), ink2 = mpCss("--ink-2", "#4a5c6b"), ink4 = mpCss("--ink-4", "#9fafbd"),
      ink1 = mpCss("--ink-1", "#22323f"), surface = mpCss("--surface", "#f8fbfd"), line3 = mpCss("--line-3", "#8494a6"),
      now = mpCss("--now", "#101c28"), font = mpCss("--font-sans", "sans-serif"),
      ok = mpCss("--ok", "#1f7a55"), bad = mpCss("--bad", "#a03a34"), bg2 = mpCss("--bg-2", "#e4eaf1"),
      okBg = "rgba(31,122,85,.10)", badBg = "rgba(160,58,52,.10)";
  return [
    { selector:"node", style:{
        "width":"mapData(worlds, 0, 12, 16, 46)", "height":"mapData(worlds, 0, 12, 16, 46)",
        "background-color":surface, "border-width":1.4, "border-color":line3,
        "label":"data(label)", "font-family":font, "font-size":13, "font-weight":600, "color":ink1,
        "text-valign":"bottom", "text-halign":"center", "text-margin-y":6, "text-wrap":"wrap", "text-max-width":110,
        "text-background-color":surface, "text-background-opacity":0.85, "text-background-padding":2, "text-background-shape":"roundrectangle",
        "min-zoomed-font-size":6,
        "transition-property":"opacity", "transition-duration":"120ms" } },
    { selector:"node.ours", style:{ "border-width":2.6, "border-color":trunk } },
    { selector:"node.ending", style:{ "shape":"round-rectangle", "width":118, "height":44, "border-width":2,
        "text-valign":"center", "text-halign":"center", "text-margin-y":0, "text-wrap":"wrap", "text-max-width":110,
        "font-size":12, "text-background-opacity":0, "color":ink1 } },
    { selector:"node.ending.optimistic",  style:{ "border-color":ok,  "background-color":okBg } },
    { selector:"node.ending.pessimistic", style:{ "border-color":bad, "background-color":badBg } },
    { selector:"node.ending.unknown",     style:{ "border-color":ink4, "background-color":bg2, "border-style":"dashed" } },
    { selector:"edge.into-ending.optimistic",  style:{ "line-color":ok,  "target-arrow-color":ok } },
    { selector:"edge.into-ending.pessimistic", style:{ "line-color":bad, "target-arrow-color":bad } },
    { selector:"edge.into-ending.unknown",     style:{ "line-color":ink4, "target-arrow-color":ink4 } },
    { selector:"edge.into-ending", style:{ "opacity":0.55, "target-arrow-shape":"triangle", "width":"mapData(weight, 1, 8, 1.4, 7)" } },
    { selector:"node.today", style:{ "border-style":"double", "border-width":5, "border-color":now } },
    { selector:"node.selected", style:{ "border-color":now, "border-width":4, "background-color":mpCss("--bg-2", "#e4eaf1") } },
    { selector:"node.dim", style:{ "opacity":0.28 } },
    /* A road one world takes is context, not shape: it stays a whisper until a
       circle or a world is chosen, and then only the ones that touch it speak. */
    { selector:"edge", style:{ "curve-style":"unbundled-bezier", "control-point-distances":[38], "control-point-weights":[0.5],
        "line-color":ink4, "opacity":0.07, "width":1,
        "target-arrow-shape":"none", "arrow-scale":0.8,
        "transition-property":"opacity", "transition-duration":"120ms" } },
    { selector:"edge.shared", style:{ "line-color":ink2, "target-arrow-color":ink2, "target-arrow-shape":"triangle", "opacity":0.8,
        "width":"mapData(weight, 2, 8, 1.8, 7)" } },
    { selector:"edge.future", style:{ "line-style":"dashed", "line-dash-pattern":[6, 4] } },
    { selector:"edge.ours", style:{ "line-color":trunk, "target-arrow-color":trunk, "target-arrow-shape":"triangle", "line-style":"dotted", "width":2, "opacity":0.7,
        "control-point-distances":[-30] } },
    { selector:"edge.touch", style:{ "opacity":0.98, "target-arrow-shape":"triangle", "line-color":ink1, "target-arrow-color":ink1, "z-index":10,
        "width":"mapData(weight, 1, 8, 1.6, 7)" } },
    { selector:"edge.faded", style:{ "opacity":0.04 } },
    { selector:"edge.world", style:{ "line-color":"data(color)", "target-arrow-color":"data(color)", "target-arrow-shape":"triangle", "width":3.2, "opacity":0.98, "z-index":20 } },
    { selector:"edge.world.shared-with-us", style:{ "line-style":"dotted" } },
    { selector:"node.on-world", style:{ "border-color":"data(color)", "border-width":3.4 } }
  ];
}
/* Fit the graph into the part of the canvas the panel does not cover, so the
   right-hand kinds are not parked behind it. Cytoscape's own fit only knows the
   whole container. */
function mpCyFit(pad, eles, maxZoom){
  var cy = MP.cy; if(!cy) return;
  pad = pad == null ? 36 : pad;
  var bb = (eles || cy.elements()).boundingBox();
  if(!bb.w || !bb.h) return;
  var cw = cy.width(), ch = cy.height();
  var uw = Math.min(cw, mpUsableWidth());
  var z = Math.min((uw - 2 * pad) / bb.w, (ch - 2 * pad) / bb.h);
  z = Math.max(cy.minZoom(), Math.min(maxZoom || cy.maxZoom(), z));
  cy.viewport({ zoom:z, pan:{ x: (uw - bb.w * z) / 2 - bb.x1 * z, y: (ch - bb.h * z) / 2 - bb.y1 * z } });
}
/* Pan the least distance that brings a node into the uncovered part of the
   canvas: choosing a circle opens the panel, and the circle must stay in view. */
function mpCyReveal(id){
  var cy = MP.cy; if(!cy) return;
  var n = cy.getElementById(id); if(!n || !n.length) return;
  var rp = n.renderedPosition(), uw = Math.min(cy.width(), mpUsableWidth()), ch = cy.height(), m = 90;
  var dx = 0, dy = 0;
  if(rp.x > uw - m) dx = (uw - m) - rp.x; else if(rp.x < m) dx = m - rp.x;
  if(rp.y > ch - m) dy = (ch - m) - rp.y; else if(rp.y < m) dy = m - rp.y;
  if(dx || dy) cy.panBy({ x:dx, y:dy });
}
function mpSignature(M){
  return M.nodes.map(function(k){ return k.id; }).join(",") + "#" + M.roads.map(function(r){ return r.key; }).join(",") + "#" + M.ours.length;
}
function renderMomentsCy(M){
  var cb = document.getElementById("chartbody"), host = document.getElementById("cy");
  if(cb && cb.classList) cb.classList.add("cy-on");
  var sig = mpSignature(M);
  if(!MP.cy){
    if(window.cytoscapeDagre && cytoscape.use){ try{ cytoscape.use(window.cytoscapeDagre); }catch(e){} }
    MP.cy = cytoscape({ container:host, elements:mpElements(M), style:mpCyStyle(), wheelSensitivity:0.25,
                        minZoom:0.25, maxZoom:6, boxSelectionEnabled:false, autounselectify:true });
    MP.cySig = sig;
    mpCyLayout();
    MP.cy.on("tap", "node", function(ev){ momentsSelectKind(ev.target.id()); });
    MP.cy.on("tap", function(ev){ if(ev.target === MP.cy) momentsClear(); });
    MP.cy.on("mouseover", "node", function(ev){ host.style.cursor = "pointer"; });
    MP.cy.on("mouseout", "node", function(ev){ host.style.cursor = ""; });
  } else if(MP.cySig !== sig){
    MP.cy.elements().remove();
    MP.cy.add(mpElements(M));
    MP.cySig = sig;
    mpCyLayout();
  }
  var cy = MP.cy;
  cy.resize();
  /* selection state as classes */
  cy.nodes().removeClass("selected dim on-world");
  cy.edges().removeClass("touch faded");
  cy.edges(".world").remove();
  if(MP.node){
    var sel = cy.getElementById(MP.node);
    sel.addClass("selected");
    mpCyReveal(MP.node);
    var near = sel.closedNeighborhood();
    cy.nodes().not(near).addClass("dim");
    cy.edges(".road").forEach(function(e){
      if(e.source().id() === MP.node || e.target().id() === MP.node) e.addClass("touch"); else e.addClass("faded");
    });
  }
  if(MP.world && M.paths[MP.world]){
    var pth = M.paths[MP.world], col = pth.l._g.color, dv = pth.l.divergence.year, add = [];
    for(var i = 1; i < pth.seq.length; i++){
      var a = pth.seq[i - 1], b = pth.seq[i];
      if(!M.at[a.bin] || !M.at[b.bin]) continue;
      add.push({ group:"edges", data:{ id:"w:" + i, source:a.bin, target:b.bin, color:col,
                 names:pth.l.title + ": " + a.e.year + " " + a.e.title + " → " + b.e.year + " " + b.e.title },
                 classes:"world" + (b.year < dv ? " shared-with-us" : "") });
      cy.getElementById(b.bin).addClass("on-world").data("color", col);
    }
    if(pth.seq.length) cy.getElementById(pth.seq[0].bin).addClass("on-world").data("color", col);
    cy.add(add);
  }
}
function mpCyLayout(){
  var cy = MP.cy;
  /* Rank left to right on the roads several worlds take and on our own path.
     Ranking on every private road too spread 33 kinds over four thousand
     pixels: one world's idiosyncratic detour is not the shape of the story. */
  var ranking = cy.elements().filter(function(e){
    return e.isNode() || e.hasClass("shared") || e.hasClass("ours") || e.hasClass("into-ending");
  });
  var opts = { name:"dagre", rankDir:"LR", nodeSep:40, rankSep:82, edgeSep:12, ranker:"tight-tree",
               padding:30, animate:false, eles:ranking,
               edgeWeight:function(e){ return e.hasClass("shared") ? (1 + (e.data("weight") || 1)) : 1; } };
  try{
    ranking.layout(opts).run();
  }catch(e){
    try{ cy.layout({ name:"breadthfirst", directed:true, padding:30 }).run(); }
    catch(e2){ cy.layout({ name:"grid", padding:30 }).run(); }
  }
  /* kinds that no shared road or real step touches were not ranked: place them
     at the x their story position implies, in a row under the rest */
  var bb = cy.elements().filter(function(e){ return e.isNode() && ranking.contains(e) && e.connectedEdges(".shared, .ours, .into-ending").length; }).boundingBox();
  var stray = cy.nodes().filter(function(n){ return !n.connectedEdges(".shared, .ours, .into-ending").length; });
  stray.forEach(function(n, i){
    n.position({ x: bb.x1 + (bb.w || 600) * (n.data("p") || 0.5), y: bb.y2 + 90 + (i % 2) * 44 });
  });
  mpCyHome();
}
/* The opening camera frames our own path at a zoom the labels survive: the
   real history is the anchor, and the fictions are read outward from it. Fit
   gives the whole map, smaller, when the reader asks for it. */
function mpCyHome(){
  var cy = MP.cy; if(!cy) return;
  var ours = cy.nodes(".ours");
  if(!ours.length){ mpCyFit(36); return; }
  mpCyFit(48, ours, 1.05);
  if(cy.zoom() < 0.62){
    /* Too wide to read whole. Open at a readable zoom with the right edge of
       the map - where today sits - just inside the view, so what led here fills
       the screen and only the kinds beyond us are off to the right. */
    var t = cy.nodes(".today"); var c = (t.length ? t : ours).boundingBox(), all = cy.elements().boundingBox();
    var z = 0.72, uw = Math.min(cy.width(), mpUsableWidth());
    /* the endings are the right edge now; keep them in view with today */
    var right = all.x2;
    var yc = all.h * z < cy.height() - 40 ? all.y1 + all.h / 2 : c.y1 + c.h / 2;
    cy.viewport({ zoom:z, pan:{ x: (uw - 48) - right * z, y: cy.height() / 2 - yc * z } });
  }
}

/* --- the panel ------------------------------------------------------------------ */
function mpWorldButton(l){
  return '<button class="mp-world' + (MP.world === l.id ? ' on' : '') + '" data-world="' + esc(l.id)
    + '" style="--c:' + esc(l._g.color) + '">' + esc(l.title) + '</button>';
}
function renderMomentsPanel(){
  var host = document.getElementById("moments-body");
  if(!host) return;
  var M = MP.model || momentsModel();
  var html = "";
  if(MP.beat){
    html += mpBeatHtml(MP.beat, M);
  } else if(MP.node && M.at[MP.node] && M.at[MP.node].ending){
    html += mpEndingHtml(M.at[MP.node], M);
  } else if(MP.node && M.at[MP.node]){
    html += mpKindHtml(M.at[MP.node], M);
  } else {
    html += '<p class="mp-intro">One circle per kind of moment, and a road for every move a fiction makes from one '
      + 'kind to the next once it has left our history. Circles run left to right by what leads to what, never by '
      + 'date: a heavy border marks a kind we have been through ourselves, a double ring the kind we are in now, and '
      + 'the dotted line is our own path. Roads several worlds take are drawn dark, with an arrow; a road one world '
      + 'takes stays faint until you choose something.</p>'
      + '<p class="mp-intro"><b>Click a circle</b> for every world that passes through that kind of moment, what leads '
      + 'there and what it leads to. <b>Click a time it happened to us</b> to match that real moment by situation to '
      + 'the nearest fictional ones and read them forward. <b>Click a world</b> to light its whole road. '
      + 'Scroll to zoom, drag to pan, Fit for the whole map.</p>'
      + '<p class="mp-intro">Every arc converges on one of three endings at the right edge: it <b>ends well</b>, '
      + '<b>ends badly</b>, or is <b>still open</b>. Our own path runs into <i>still open</i>, because we are inside it. '
      + 'Click a kind of moment and its panel says how the worlds that passed through it ended.</p>';
    html += mpOutcomesHtml(mpTallyAll(M), M.list.length, "How the " + M.list.length + " arcs end");
    var shared = M.roads.filter(function(r){ return r.worlds.length > 1 && !r.ending; }).slice(0, 10);
    if(shared.length){
      html += '<h3 class="mp-h">Roads more than one world takes</h3><ol class="mp-roads">';
      shared.forEach(function(r){
        html += '<li><button class="mp-kind" data-kind="' + esc(r.a) + '">' + esc(mpLabel(r.a)) + '</button> → '
          + '<button class="mp-kind" data-kind="' + esc(r.b) + '">' + esc(mpLabel(r.b)) + '</button>'
          + '<span class="mp-n">' + r.worlds.length + ' worlds</span></li>';
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
  Array.prototype.forEach.call(host.querySelectorAll("[data-beat]"), function(b){
    b.onclick = function(){ momentsSelectBeat(b.getAttribute("data-beat")); };
  });
  Array.prototype.forEach.call(host.querySelectorAll("[data-open-world]"), function(b){
    b.onclick = function(){ openWorld(b.getAttribute("data-open-world")); };
  });
  var back = document.getElementById("mp-back");
  if(back) back.onclick = function(){ if(MP.beat){ MP.beat = null; renderChart(); renderMomentsPanel(); } else momentsClear(); };
}

function mpTallyAll(M){
  var t = { optimistic:[], pessimistic:[], unknown:[] };
  M.list.forEach(function(l){ t[mpEndingOf(l).valence].push(l); });
  return t;
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
function mpBadge(l){
  var en = mpEndingOf(l);
  return '<button class="mp-badge ' + en.valence + '" data-kind="' + en.id + '" title="' + esc((l.ending && l.ending.why) || en.definition) + '">' + esc(en.label.toLowerCase()) + '</button>';
}
function mpEndingHtml(k, M){
  var html = '<div class="mp-head"><div class="mp-kicker">How an arc ends' + (k.ours ? ' · where our own path runs' : '') + '</div>'
    + '<h3 class="mp-title mp-title-' + k.valence + '">' + esc(k.spec.label) + '</h3>'
    + '<p class="mp-def">' + esc(k.spec.definition) + '</p></div>';
  var leads = M.roads.filter(function(r){ return r.b === k.id; });
  if(leads.length){
    var tot = 0; leads.forEach(function(r){ tot += r.worlds.length; });
    html += '<h3 class="mp-h">The last kind of moment before it</h3><ul class="mp-follow">';
    leads.forEach(function(r){
      var pct = Math.round(100 * r.worlds.length / Math.max(1, tot));
      html += '<li><button class="mp-kind" data-kind="' + esc(r.a) + '">' + esc(mpLabel(r.a)) + '</button> →'
        + '<span class="mp-bar"><i style="width:' + pct + '%"></i></span>'
        + '<span class="mp-n">' + r.worlds.length + ' of ' + tot + '</span>'
        + '<span class="mp-who">' + r.worlds.map(function(l){ return esc(l.title); }).join(", ") + '</span></li>';
    });
    html += '</ul>';
  }
  if(k.ours){
    html += '<div class="mp-card ours"><div class="mp-card-head"><span class="mp-world">Us, ' + NOW + '</span></div>'
      + '<div class="mp-moment">' + (M.lastReal ? '<b>' + esc(String(M.lastReal.year)) + '</b> ' + esc(M.lastReal.title) : '') + '</div>'
      + '<div class="mp-why">Not decided. Every road out of the kind we are in now has been walked by some fiction; read them from the circle.</div></div>';
  }
  html += '<h3 class="mp-h">' + k.worlds + (k.worlds === 1 ? ' world ends' : ' worlds end') + ' here</h3>';
  if(!k.through.length) html += '<p class="mp-none">No world in the atlas ends this way.</p>';
  else {
    html += '<div class="mp-worlds">';
    k.through.slice().sort(function(a, b){ return a.l.title < b.l.title ? -1 : 1; }).forEach(function(w){
      html += '<div class="mp-card" style="--c:' + esc(w.l._g.color) + '">'
        + '<div class="mp-card-head">' + mpWorldButton(w.l)
        + '<button class="mp-open" data-open-world="' + esc(w.l.id) + '" title="open the world">dossier →</button></div>'
        + (w.e ? '<div class="mp-moment"><b>' + esc(fmtYearFull(w.e.year)) + '</b> ' + esc(w.e.title)
          + ' <button class="mp-kind small" data-kind="' + esc(w.e.bin) + '">' + esc(mpLabel(w.e.bin)) + '</button></div>' : '')
        + '<div class="mp-why">' + esc(w.why) + '</div></div>';
    });
    html += '</div>';
  }
  return html;
}

function mpKindHtml(k, M){
  var html = '<div class="mp-head"><div class="mp-kicker">Kind of moment' + (k.ours ? '' : ' · not yet happened to us') + '</div>'
    + '<h3 class="mp-title">' + esc(mpLabel(k.id)) + '</h3>'
    + (k.spec.definition ? '<p class="mp-def">' + esc(k.spec.definition) + '</p>' : '')
    + (k.spec.exampleHeadline ? '<p class="mp-eg">as a headline: “' + esc(k.spec.exampleHeadline) + '”</p>' : '')
    + '</div>';
  if(k.outcomes && k.worlds){
    html += mpOutcomesHtml(k.outcomes, k.worlds, "How the arcs through it end");
  }
  if(k.visits.length){
    html += '<h3 class="mp-h">Happened to us</h3><ul class="mp-visits">';
    k.visits.forEach(function(e){
      html += '<li><button class="mp-beat-btn" data-beat="' + esc(e.id) + '"><b>' + esc(String(e.year)) + '</b> ' + esc(e.title)
        + '</button><span class="mp-hint">match by situation →</span></li>';
    });
    html += '</ul>';
  }
  var leads = M.roads.filter(function(r){ return r.b === k.id; });
  if(leads.length){
    var tot = 0; leads.forEach(function(r){ tot += r.worlds.length; });
    html += '<h3 class="mp-h">What leads here</h3><ul class="mp-follow">';
    leads.forEach(function(r){
      var pct = Math.round(100 * r.worlds.length / Math.max(1, tot));
      html += '<li><button class="mp-kind" data-kind="' + esc(r.a) + '">' + esc(mpLabel(r.a)) + '</button> →'
        + '<span class="mp-bar"><i style="width:' + pct + '%"></i></span>'
        + '<span class="mp-n">' + r.worlds.length + ' of ' + tot + '</span>'
        + '<span class="mp-who">' + r.worlds.map(function(l){ return esc(l.title); }).join(", ") + '</span></li>';
    });
    html += '</ul>';
  }
  if(k.follow.length){
    var total = 0; k.follow.forEach(function(f){ total += f.worlds.length; });
    html += '<h3 class="mp-h">What it leads to</h3><ul class="mp-follow">';
    k.follow.slice(0, 8).forEach(function(f){
      var pct = Math.round(100 * f.worlds.length / Math.max(1, total));
      html += '<li><button class="mp-kind' + (f.ending ? ' mp-kind-ending ' + esc(M.at[f.bin].valence) : '') + '" data-kind="' + esc(f.bin) + '">'
        + esc(f.ending ? "the arc " + mpLabel(f.bin).toLowerCase() : mpLabel(f.bin)) + '</button>'
        + '<span class="mp-bar"><i style="width:' + pct + '%"></i></span>'
        + '<span class="mp-n">' + f.worlds.length + ' of ' + total + '</span>'
        + '<span class="mp-who">' + f.worlds.map(function(l){ return esc(l.title); }).join(", ") + '</span></li>';
    });
    html += '</ul>';
  }
  html += '<h3 class="mp-h">' + k.worlds + (k.worlds === 1 ? ' world passes' : ' worlds pass') + ' through it</h3>';
  if(!k.through.length){
    html += '<p class="mp-none">No fiction in the atlas reaches this kind of moment.</p>';
  } else {
    var byWorld = {};
    k.through.forEach(function(t){ (byWorld[t.l.id] = byWorld[t.l.id] || { l:t.l, hits:[] }).hits.push(t); });
    html += '<div class="mp-worlds">';
    Object.keys(byWorld).map(function(id){ return byWorld[id]; })
      .sort(function(a, b){ return a.l.title < b.l.title ? -1 : 1; })
      .forEach(function(w){
        html += '<div class="mp-card" style="--c:' + esc(w.l._g.color) + '">'
          + '<div class="mp-card-head">' + mpWorldButton(w.l) + '<span class="mp-card-tools">' + mpBadge(w.l)
          + '<button class="mp-open" data-open-world="' + esc(w.l.id) + '" title="open the world">dossier →</button></span></div>';
        w.hits.forEach(function(t){
          var nxt = t.seq.slice(t.i + 1, t.i + 4);
          html += '<div class="mp-moment"><b>' + esc(fmtYearFull(t.e.year)) + '</b> ' + esc(t.e.title)
            + (t.e.year < w.l.divergence.year ? ' <span class="mp-hint">(shared with us: before its fork)</span>' : '') + '</div>';
          if(nxt.length){
            html += '<ol class="mp-next">';
            nxt.forEach(function(s){
              html += '<li><span class="mp-yr">' + esc(fmtYear(s.e.year)) + '</span> ' + esc(s.e.title)
                + ' <button class="mp-kind small" data-kind="' + esc(s.bin) + '">' + esc(mpLabel(s.bin)) + '</button></li>';
            });
            html += '</ol>';
          } else {
            html += '<div class="mp-end">the charted history ends here: ' + esc(mpEndingOf(w.l).label.toLowerCase())
              + (w.l.ending && w.l.ending.why ? ' — ' + esc(w.l.ending.why) : '') + '</div>';
          }
        });
        html += '</div>';
      });
    html += '</div>';
  }
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
  if(!e.facets || typeof facetMoments !== "function"){
    html += '<p class="mp-none">This beat has no signature yet, so it cannot be matched by situation.</p>';
    return html;
  }
  var moments = facetMoments(), mine = null;
  for(var i = 0; i < moments.length; i++){ if(moments[i].e === e){ mine = moments[i]; break; } }
  var ns = mine ? facetNeighbours(mine, moments, 6) : [];
  html += '<h3 class="mp-h">Nearest situations in fiction</h3>'
    + '<p class="mp-def">Matched on how, who, where and the direction of change. What followed is held out of the match and read from each world.</p>';
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
function drawRealBeats(host, list, left, right){
  if(!REAL || !REAL.events || !REAL.events.length) return;
  if(graphMode()) return;
  var g = sEl("g", null, "real-beats");
  var shown = 0;
  REAL.events.forEach(function(e){
    var x = AX.realX ? AX.realX(e) : null;
    if(x == null || isNaN(x) || x < left - 4 || x > right + 4) return;
    shown++;
    var hit = sEl("circle", {cx:x, cy:0, r:11, fill:"transparent", "pointer-events":"all"}, "real-hit");
    hit.setAttribute("data-real", e.id);
    hit.style.cursor = "pointer";
    var t = sEl("title");
    t.textContent = fmtYear(e.year) + " · " + e.title + "\n" + (e.facets ? e.facets.change : "")
      + "\nclick to read what followed in worlds in this situation";
    hit.appendChild(t);
    g.appendChild(hit);
    g.appendChild(paintC(sEl("circle", {cx:x, cy:0, r:3.1}, "real-dot"), "fill", "#ffffff"));
  });
  if(shown){
    var lab = sEl("text", {x:left + 4, y:-13}, "real-label");
    lab.textContent = "REAL HISTORY · " + shown + " beats";
    g.appendChild(lab);
  }
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
