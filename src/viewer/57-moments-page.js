/* ============================================================================
   The Moments page: an arc diagram anchored on us.

   One line of circles, one per kind of moment. Left of TODAY: the kinds our own
   history has passed through, in the order we first reached them. Right of
   TODAY: the kinds only fiction has reached, in the order they tend to arrive
   in a story. Above the line, arcs are the roads fictions take between kinds
   after they fork - drawn once each, heavier the more worlds take them, dashed
   where they lie ahead of today. Below the line, our own path through the kinds,
   in our colour.

   Nothing is coloured by world until you ask for one. Click a circle and the
   panel shows every world that passes through that kind of moment, the moment
   each one had there, what followed, and what tends to follow across all of
   them. Click one of the small dots under a circle - a time it happened to us -
   and the panel matches that real beat by situation to the nearest fictional
   moments and reads them forward. Click a world's name to light its whole road.

   The page has its own camera: wheel zooms the line around the cursor, drag
   pans it, Fit resets. Labels appear as the spacing allows.
   ========================================================================== */

var MP = { s:1, tx:0, node:null, world:null, beat:null, model:null, geom:null, width:900 };
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
  var out = null;
  ((typeof BINS !== "undefined" && BINS) || []).forEach(function(b){ if(b.id === id) out = b; });
  return out || { id:id, label:id, definition:"" };
}
function mpLabel(id){ return mpSpec(id).label || id; }

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
  var roads = {}, roadList = [];
  Object.keys(paths).forEach(function(id){
    var p = paths[id], dv = p.l.divergence.year;
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
  roadList.sort(function(x, y){ return y.worlds.length - x.worlds.length; });
  var ours = [];
  for(var j = 1; j < realEv.length; j++){
    var a2 = realEv[j - 1].bin, b2 = realEv[j].bin;
    if(a2 && b2 && a2 !== b2 && at[a2] && at[b2]) ours.push({ a:a2, b:b2, from:realEv[j - 1], to:realEv[j] });
  }
  return { nodes:nodes, at:at, order:order, realOrder:realOrder, fictionOnly:fictionOnly,
           roads:roadList, ours:ours, paths:paths, list:list,
           todayIndex: realOrder.length - 1, lastReal: realEv.length ? realEv[realEv.length - 1] : null };
}

/* --- the camera ---------------------------------------------------------------- */
function mpUnit(n){ return (MP.width - 2 * MP_PAD) / Math.max(1, n - 1); }
function mpX(i){ return MP_PAD + MP.tx + i * mpUnit(MP.model ? MP.model.nodes.length : 2) * MP.s; }
function mpClampTx(){
  var n = MP.model ? MP.model.nodes.length : 2;
  var lineW = (n - 1) * mpUnit(n) * MP.s;
  var minTx = Math.min(0, (MP.width - 2 * MP_PAD) - lineW);
  MP.tx = Math.max(minTx, Math.min(0, MP.tx));
}
function momentsFit(){ MP.s = 1; MP.tx = 0; }
function momentsZoomAt(g, mx){
  var n = MP.model ? MP.model.nodes.length : 2, unit = mpUnit(n);
  var s2 = Math.max(1, Math.min(MP_MAX_S, MP.s * g));
  var xs = (mx - MP_PAD - MP.tx) / (unit * MP.s);        /* which node-index the cursor is over */
  MP.tx = mx - MP_PAD - xs * unit * s2;
  MP.s = s2;
  mpClampTx();
}
function momentsPan(dx0, tx0){ MP.tx = tx0 + dx0; mpClampTx(); }

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

/* --- drawing ------------------------------------------------------------------- */
function mpArc(x1, x2, y, above, cls, attrs){
  var rx = Math.max(1, Math.abs(x2 - x1) / 2);
  /* height grows with distance but is capped by the room on that side, so a
     road across the whole line is a low wide arch rather than a wall */
  var room = above ? (y - 64) : ((Hv - 44) - y);
  var ry = Math.max(6, Math.min(rx * 0.5, room * 0.92));
  var d = "M" + x1.toFixed(1) + " " + y.toFixed(1) + " A" + rx.toFixed(1) + " " + ry.toFixed(1)
        + " 0 0 " + (above ? (x2 > x1 ? 1 : 0) : (x2 > x1 ? 0 : 1)) + " " + x2.toFixed(1) + " " + y.toFixed(1);
  var p = sEl("path", { d:d, fill:"none" }, cls);
  if(attrs) for(var k in attrs) p.setAttribute(k, attrs[k]);
  return p;
}

function renderMomentsPage(svg){
  var M = momentsModel();
  MP.model = M;
  MP.width = mpUsableWidth();
  mpClampTx();
  var n = M.nodes.length;
  var baseY = Math.round(Hv * 0.66);
  var spacing = mpUnit(n) * MP.s;
  var g = sEl("g", null, "moments-page");
  svg.appendChild(g);
  if(!n){
    var none = sEl("text", {x:W / 2, y:Hv / 2, "text-anchor":"middle"}, "mp-empty");
    none.textContent = "No kinds of moment to show: bin the events first.";
    g.appendChild(none);
    return;
  }
  var xOf = {};
  M.nodes.forEach(function(k){ xOf[k.id] = mpX(k.i); k.x = xOf[k.id]; k.y = baseY; });
  MP.geom = { baseY:baseY, spacing:spacing };

  /* region headers */
  var h1 = sEl("text", {x:MP_PAD, y:34}, "mp-region");
  h1.textContent = "WHAT HAS HAPPENED TO US  ·  kinds of moment, in the order we first reached them";
  g.appendChild(h1);
  var todayX = null;
  if(M.todayIndex >= 0){
    todayX = M.fictionOnly.length ? (xOf[M.realOrder[M.todayIndex]] + xOf[M.fictionOnly[0]]) / 2
                                  : xOf[M.realOrder[M.todayIndex]] + spacing / 2;
    g.appendChild(sEl("line", {x1:todayX, y1:48, x2:todayX, y2:Hv - 40}, "mp-today-line"));
    var tl = sEl("text", {x:todayX, y:Hv - 24, "text-anchor":"middle"}, "now-cap mp-today");
    tl.textContent = "TODAY " + NOW;
    g.appendChild(tl);
    if(M.fictionOnly.length){
      var h2 = sEl("text", {x:Math.min(MP.width - MP_PAD, Math.max(todayX + 12, xOf[M.fictionOnly[0]] - 10)), y:34}, "mp-region faint");
      h2.textContent = "NOT YET  ·  kinds only fiction has reached, in the order stories tend to reach them";
      g.appendChild(h2);
    }
  }

  /* the line itself: ours solid, the not-yet part dotted */
  var xFirst = xOf[M.order[0]], xLastOurs = M.todayIndex >= 0 ? xOf[M.realOrder[M.todayIndex]] : xFirst;
  var xLast = xOf[M.order[n - 1]];
  if(xLastOurs > xFirst) g.appendChild(sEl("line", {x1:xFirst, y1:baseY, x2:xLastOurs, y2:baseY}, "mp-line-ours"));
  if(xLast > xLastOurs) g.appendChild(sEl("line", {x1:xLastOurs, y1:baseY, x2:xLast, y2:baseY}, "mp-line-notyet"));

  /* our own path, below the line */
  var gOurs = sEl("g", null, "mp-ours");
  M.ours.forEach(function(o){
    var p = mpArc(xOf[o.a], xOf[o.b], baseY, false, "mp-our-road");
    p.setAttribute("data-our-road", o.a + "|" + o.b);
    var t = sEl("title"); t.textContent = o.from.year + " " + o.from.title + "  →  " + o.to.year + " " + o.to.title;
    p.appendChild(t);
    gOurs.appendChild(p);
  });
  g.appendChild(gOurs);

  /* the fictions' roads, above the line */
  var selected = MP.node, litWorld = MP.world;
  var gRoads = sEl("g", null, "mp-roads");
  M.roads.forEach(function(r){
    var cls = "mp-road" + (r.worlds.length > 1 ? " shared" : "") + (r.future ? " future" : "");
    var p = mpArc(xOf[r.a], xOf[r.b], baseY, true, cls);
    p.setAttribute("data-road", r.key);
    p.setAttribute("stroke-width", (0.8 + Math.min(3.4, r.worlds.length * 0.7)).toFixed(2));
    if(selected){
      var touches = (r.a === selected || r.b === selected);
      p.setAttribute("opacity", touches ? "0.95" : "0.05");
    }
    var t = sEl("title");
    t.textContent = mpLabel(r.a) + " → " + mpLabel(r.b) + "\n"
      + r.worlds.length + (r.worlds.length === 1 ? " world: " : " worlds: ")
      + r.worlds.map(function(l){ return l.title; }).join(", ");
    p.appendChild(t);
    gRoads.appendChild(p);
  });
  g.appendChild(gRoads);

  /* one world's whole road, in its colour, on top */
  if(litWorld && M.paths[litWorld]){
    var pth = M.paths[litWorld], col = pth.l._g.color, dv = pth.l.divergence.year;
    var gW = sEl("g", null, "mp-world-path");
    for(var i = 1; i < pth.seq.length; i++){
      var a = pth.seq[i - 1], b = pth.seq[i];
      if(!xOf[a.bin] || !xOf[b.bin]) continue;
      var shared = b.year < dv;                     /* still riding our history */
      var future = a.year > NOW;
      var wp = mpArc(xOf[a.bin], xOf[b.bin], baseY, true, "mp-world-road" + (shared ? " shared-with-us" : "") + (future ? " future" : ""));
      paintC(wp, "stroke", col);
      var tt = sEl("title");
      tt.textContent = pth.l.title + ": " + a.e.year + " " + a.e.title + "  →  " + b.e.year + " " + b.e.title
        + (shared ? "\n(still sharing our history)" : "");
      wp.appendChild(tt);
      gW.appendChild(wp);
    }
    pth.seq.forEach(function(s){
      if(xOf[s.bin] == null) return;
      gW.appendChild(paintC(sEl("circle", {cx:xOf[s.bin], cy:baseY, r: 5 + Math.min(10, (M.at[s.bin].worlds || 1) * 0.9) + 4}, "mp-world-ring"), "stroke", col));
    });
    g.appendChild(gW);
  }

  /* circles */
  /* labels by spacing: all of them when there is room, every other one when
     tight, and always the selected kind. A label is rotated so 33 kinds can be
     named across 1000px; below that it takes a hover. */
  var showAll = spacing >= 44, showSome = spacing >= 21;
  var gNodes = sEl("g", null, "mp-nodes");
  M.nodes.forEach(function(k){
    var x = xOf[k.id], r = 4 + Math.min(10, k.worlds * 0.9);
    var grp = sEl("g", null, "mp-node" + (k.ours ? " ours" : " notyet") + (k.id === selected ? " selected" : ""));
    grp.setAttribute("data-moment-node", k.id);
    if(selected && k.id !== selected){
      var touching = M.roads.some(function(rd){ return (rd.a === selected && rd.b === k.id) || (rd.b === selected && rd.a === k.id); });
      if(!touching) grp.setAttribute("opacity", "0.35");
    }
    grp.appendChild(sEl("circle", {cx:x, cy:baseY, r:r + 7, fill:"transparent", "pointer-events":"all"}, "mp-hit"));
    grp.appendChild(sEl("circle", {cx:x, cy:baseY, r:r}, "mp-circle"));
    if(k.id === selected) grp.appendChild(sEl("circle", {cx:x, cy:baseY, r:r + 4}, "mp-selected-ring"));
    if(r >= 7){
      var ct = sEl("text", {x:x, y:baseY + 3, "text-anchor":"middle"}, "mp-count");
      ct.textContent = String(k.worlds);
      grp.appendChild(ct);
    }
    var label = showAll || (showSome && (k.i % 2 === 0 || k.worlds >= 5)) || k.id === selected;
    if(label){
      var ly = baseY + r + 12;
      var lab = sEl("text", {x:x, y:ly, "text-anchor":"end",
                             transform:"rotate(-34 " + x.toFixed(1) + " " + ly.toFixed(1) + ")"},
                    "mp-label" + (spacing < 44 ? " tight" : ""));
      lab.textContent = mpLabel(k.id);
      grp.appendChild(lab);
    }
    var t = sEl("title");
    t.textContent = mpLabel(k.id) + " — " + k.worlds + (k.worlds === 1 ? " world" : " worlds")
      + (k.visits.length ? "\nhappened to us: " + k.visits.map(function(e){ return e.year; }).join(", ") : "\nhas not happened to us")
      + "\n" + (k.spec.definition || "") + "\nclick to see the worlds that pass through it";
    grp.appendChild(t);
    gNodes.appendChild(grp);

    /* the times it happened to us: a dot per visit above the circle, clickable */
    if(k.visits.length && (spacing >= 22 || k.id === selected)){
      var kk = k.visits.length;
      k.visits.forEach(function(e, j){
        var vx = x + (j - (kk - 1) / 2) * Math.min(8, Math.max(4, spacing / 6)), vy = baseY - r - 9;
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
    }
  });
  g.appendChild(gNodes);

  /* click wiring for the shim (real browsers dispatch through onpointerup) */
  Array.prototype.forEach.call(gNodes.querySelectorAll("[data-moment-node]"), function(el){
    el.onclick = function(ev){ if(ev && ev.stopPropagation) ev.stopPropagation(); momentsSelectKind(el.getAttribute("data-moment-node")); };
  });

  var cap = sEl("text", {x:MP.width - MP_PAD, y:Hv - 8, "text-anchor":"end"}, "axis-caption");
  cap.textContent = M.realOrder.length + " kinds we have been through · " + M.fictionOnly.length
    + " only in fiction · " + M.roads.length + " roads, "
    + M.roads.filter(function(r){ return r.worlds.length > 1; }).length + " shared · zoom "
    + MP.s.toFixed(1) + "×";
  g.appendChild(cap);
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
  } else if(MP.node && M.at[MP.node]){
    html += mpKindHtml(M.at[MP.node], M);
  } else {
    html += '<p class="mp-intro">One circle per kind of moment. Left of today, the kinds our own history has '
      + 'passed through, in the order we first reached them; right of today, the kinds only fiction has reached. '
      + 'Arcs above the line are the roads fictions take between kinds once they have left our history; the line '
      + 'below is our own path.</p>'
      + '<p class="mp-intro"><b>Click a circle</b> for every world that passes through that kind of moment and what '
      + 'each did next. <b>Click a small dot</b> above a circle, a time it happened to us, to match that real moment '
      + 'by situation to the nearest fictional ones. <b>Click a world</b> to light its whole road.</p>';
    var shared = M.roads.filter(function(r){ return r.worlds.length > 1; }).slice(0, 10);
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

function mpKindHtml(k, M){
  var html = '<div class="mp-head"><div class="mp-kicker">Kind of moment' + (k.ours ? '' : ' · not yet happened to us') + '</div>'
    + '<h3 class="mp-title">' + esc(mpLabel(k.id)) + '</h3>'
    + (k.spec.definition ? '<p class="mp-def">' + esc(k.spec.definition) + '</p>' : '')
    + (k.spec.exampleHeadline ? '<p class="mp-eg">as a headline: “' + esc(k.spec.exampleHeadline) + '”</p>' : '')
    + '</div>';
  if(k.visits.length){
    html += '<h3 class="mp-h">Happened to us</h3><ul class="mp-visits">';
    k.visits.forEach(function(e){
      html += '<li><button class="mp-beat-btn" data-beat="' + esc(e.id) + '"><b>' + esc(String(e.year)) + '</b> ' + esc(e.title)
        + '</button><span class="mp-hint">match by situation →</span></li>';
    });
    html += '</ul>';
  }
  if(k.follow.length){
    var total = 0; k.follow.forEach(function(f){ total += f.worlds.length; });
    html += '<h3 class="mp-h">What tends to follow</h3><ul class="mp-follow">';
    k.follow.slice(0, 8).forEach(function(f){
      var pct = Math.round(100 * f.worlds.length / Math.max(1, total));
      html += '<li><button class="mp-kind" data-kind="' + esc(f.bin) + '">' + esc(mpLabel(f.bin)) + '</button>'
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
          + '<div class="mp-card-head">' + mpWorldButton(w.l)
          + '<button class="mp-open" data-open-world="' + esc(w.l.id) + '" title="open the world">dossier →</button></div>';
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
            html += '<div class="mp-end">the charted history ends here</div>';
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
      + '<span class="mp-score">' + nb.score.toFixed(2) + ' match</span></div>'
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
