/* ============================================================================
   The Moments graph, anchored on us.

   One circle per kind of moment, an arc for every road a story takes between
   two kinds. What anchors the picture is our own history: the kinds WE have
   passed through are laid out as one main line, left to right in the order we
   first reached them, with the years it happened to us under each. The kinds
   only fiction has reached sit off the line, above and below. Every fiction
   rides the main line until its fork - drawn as a coloured strand alongside it
   that stops where that world leaves us - and then takes roads to other kinds.

   Roads are drawn once, weighted by how many worlds take them: shared roads
   heavy, private ones faint, dashed where they lie ahead of today. Clicking a
   circle lights the worlds that share that kind of moment and opens them in the
   panel with the moment each one had there and what followed.
   ========================================================================== */

var MOMENT_R = 7;              /* base circle radius */
var momentGraphCache = null;   /* the placed graph, republished on every render */
var EDGE_KEY_SEP = "|";        /* joins two bin ids into one road key */

/* Every road a world takes AFTER it has forked, with the worlds that take it.
   Transitions made while a world still rides our history are not roads: they
   are the strand along the main line. */
function momentEdges(list, byId){
  var edges = {}, order = [];
  list.forEach(function(l){
    var dv = l.divergence.year;
    var seq = [];
    (l.events || []).forEach(function(e){
      if(e.bin && byId[e.bin] && (seq.length === 0 || seq[seq.length - 1].bin !== e.bin)){
        seq.push({ bin:e.bin, year:e.year });
      }
    });
    for(var i = 1; i < seq.length; i++){
      if(seq[i].year < dv) continue;                 /* still with us */
      var a = seq[i - 1].bin, b = seq[i].bin, k = a + EDGE_KEY_SEP + b;
      if(!edges[k]){
        edges[k] = { a:a, b:b, key:k, worlds:[], n:0, future:false };
        order.push(edges[k]);
      }
      edges[k].worlds.push(l);
      edges[k].n++;
      if(seq[i - 1].year > NOW) edges[k].future = true;
    }
  });
  return { edges:edges, list:order };
}

function edgeLabel(edge, byId){
  var a = (byId[edge.a] && (byId[edge.a].label || edge.a)) || edge.a;
  var b = (byId[edge.b] && (byId[edge.b].label || edge.b)) || edge.b;
  return shortName(a) + " → " + shortName(b);
}
function shortName(s){
  s = String(s);
  return s.length > 22 ? s.slice(0, 21).trim() + "…" : s;
}

/* The kinds our own history has passed through, in the order we FIRST reached
   each, and the beats we were there. */
function realVisits(){
  var main = [], years = {};
  var evs = (REAL && REAL.events) || [];
  evs.forEach(function(e){
    if(!e.bin) return;
    if(main.indexOf(e.bin) < 0) main.push(e.bin);
    (years[e.bin] = years[e.bin] || []).push(e);
  });
  return { main:main, years:years, last: evs.length ? evs[evs.length - 1] : null };
}

function placeMomentsGraph(list, left, right){
  var cols = (AX && AX.columns) ? AX.columns : [];
  var byCol = {};
  cols.forEach(function(c){ byCol[c.bin] = c; });
  var specs = {};
  ((typeof BINS !== "undefined" && BINS) || []).forEach(function(b){ specs[b.id] = b; });

  var rv = realVisits();
  var main = rv.main;

  /* --- nodes: every kind a visible world touches, plus every kind we have
     been through ourselves even if no fiction has ---------------------------- */
  var x0 = left + 64, x1 = right - 44, span = Math.max(1, x1 - x0);
  var midY = 70 + (Hv - 150) / 2;
  var amp = Math.max(70, Math.min(230, (Hv - 210) / 2));
  var nodes = [], at = {};

  main.forEach(function(b, i){
    var c = byCol[b];
    var n = { id:b, spec:specs[b] || (c && c.spec) || { id:b, label:b }, onMain:true, order:i,
              worlds: c ? c.worlds : new Set(), hits: c ? c.hits : 0,
              x: main.length > 1 ? x0 + span * (i / (main.length - 1)) : (x0 + x1) / 2,
              y: midY, up: (i % 2 === 0) ? -1 : 1, years: rv.years[b] || [] };
    nodes.push(n); at[b] = n;
  });

  /* off the line: only fiction has been here. x from where the kind tends to
     fall in a story (the arc the events produce), tiers above and below, spread
     so labels clear each other. */
  var off = cols.filter(function(c){ return main.indexOf(c.bin) < 0; })
                .slice().sort(function(a, b){ return a.mean - b.mean; });
  var tiers = [-0.55, 0.55, -1, 1];
  var placed = [];
  off.forEach(function(c, i){
    var x = x0 + 40 + (span - 80) * c.mean;
    var chosen = null;
    for(var t = 0; t < tiers.length && chosen === null; t++){
      var ty = midY + tiers[(i + t) % tiers.length] * amp;
      var ok = placed.every(function(p){ return Math.abs(p.x - x) > 118 || Math.abs(p.y - ty) > 56; });
      if(ok) chosen = ty;
    }
    if(chosen === null){ chosen = midY + tiers[i % tiers.length] * amp; x += 60; }
    placed.push({ x:x, y:chosen });
    var n = { id:c.bin, spec:c.spec, onMain:false, order:main.length + i, worlds:c.worlds, hits:c.hits,
              x:x, y:chosen, up: chosen < midY ? -1 : 1, years:[] };
    nodes.push(n); at[c.bin] = n;
  });
  nodes.forEach(function(k){
    k.x = Math.max(left + 30, Math.min(right - 24, k.x));
    k.y = Math.max(26, Math.min(Hv - 30, k.y));
  });

  /* --- strands: how far along our line each world rides before it forks --- */
  var strands = [];
  list.forEach(function(l, wi){
    var dv = l.divergence.year, xs = [];
    (l.events || []).forEach(function(e){
      if(e.bin && e.year < dv && at[e.bin] && at[e.bin].onMain) xs.push(at[e.bin].x);
    });
    if(!xs.length) return;
    var a = Math.min.apply(null, xs), b = Math.max.apply(null, xs);
    strands.push({ l:l, x0:a, x1:Math.max(b, a + 6), offset: 10 + (wi % 12) * 1.7 });
  });

  var g = momentEdges(list, at);
  var edges = g.list.slice().sort(function(a, b){ return b.n - a.n; });
  var today = rv.last && at[rv.last.bin] ? at[rv.last.bin] : null;

  return {
    nodes:nodes, at:at, edges:edges, strands:strands, midY:midY, main:main, today:today,
    sharedEdges: edges.filter(function(e){ return e.n > 1; }).length,
    labelFor: function(e){ return edgeLabel(e, specs); }
  };
}

/* Curved path between two circles, bowed perpendicular to the line. */
function edgeGeom(A, B, bow, rad){
  var dx = B.x - A.x, dy = B.y - A.y;
  var d = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / d, uy = dy / d;
  var r = rad || MOMENT_R;
  var p0 = { x:A.x + ux * r, y:A.y + uy * r };
  var p2 = { x:B.x - ux * r, y:B.y - uy * r };
  var p1 = { x:(p0.x + p2.x) / 2 - uy * bow, y:(p0.y + p2.y) / 2 + ux * bow };
  return { p0:p0, p1:p1, p2:p2 };
}
function quadAt(g, t){
  var u = 1 - t;
  return { x: u*u*g.p0.x + 2*u*t*g.p1.x + t*t*g.p2.x, y: u*u*g.p0.y + 2*u*t*g.p1.y + t*t*g.p2.y };
}
function edgePath(A, B, bow, rad){
  var g = edgeGeom(A, B, bow, rad);
  return "M" + g.p0.x.toFixed(1) + "," + g.p0.y.toFixed(1)
       + "Q" + g.p1.x.toFixed(1) + "," + g.p1.y.toFixed(1)
       + " " + g.p2.x.toFixed(1) + "," + g.p2.y.toFixed(1);
}

/* the one lit world's colour, when exactly one is lit */
function litColour(){
  if(!litWorlds) return null;
  var ids = Object.keys(litWorlds);
  if(ids.length !== 1) return null;
  var l = DATA.lineages.filter(function(x){ return x.id === ids[0]; })[0];
  return l ? l._g.color : null;
}

function drawMomentGraph(host, list, left, right){
  var G = placeMomentsGraph(list, left, right);
  momentGraphCache = G;
  var g = sEl("g", null, "moment-graph");
  var one = litColour();

  /* --- the main line: our history, drawn once ------------------------------- */
  var mains = G.nodes.filter(function(n){ return n.onMain; });
  if(mains.length > 1){
    var pts = mains.map(function(n){ return n.x.toFixed(1) + "," + n.y.toFixed(1); }).join(" ");
    g.appendChild(sEl("polyline", {points:pts}, "main-line-glow"));
    g.appendChild(sEl("polyline", {points:pts}, "main-line"));
    var ml = sEl("text", {x:mains[0].x - 6, y:G.midY + 4, "text-anchor":"end"}, "main-line-label");
    ml.textContent = "US";
    g.appendChild(ml);
  }

  /* --- strands: each fiction rides our line until it forks ------------------ */
  var gStr = sEl("g", null, "graph-strands");
  G.strands.forEach(function(s){
    var y = G.midY + s.offset;
    var grp = sEl("g", null, "strand");
    grp.setAttribute("data-lane-group", s.l.id);
    if(litWorlds && !litWorlds[s.l.id]) grp.setAttribute("opacity", "0.18");
    grp.appendChild(paintC(sEl("line", {x1:s.x0, y1:y, x2:s.x1, y2:y}, "strand-line"), "stroke", s.l._g.color));
    grp.appendChild(paintC(sEl("circle", {cx:s.x1, cy:y, r:2.4}, "strand-end"), "fill", s.l._g.color));
    var t = sEl("title");
    t.textContent = s.l.title + " rides our history until " + fmtYearFull(s.l.divergence.year)
      + ": " + (s.l.divergence.label || "its fork");
    grp.appendChild(t);
    grp.style.cursor = "pointer";
    grp.onclick = function(ev){ if(ev && ev.stopPropagation) ev.stopPropagation(); openWorld(s.l.id); };
    gStr.appendChild(grp);
  });
  g.appendChild(gStr);

  /* --- roads, behind the circles ------------------------------------------- */
  var gEdges = sEl("g", null, "graph-edges");
  var edgeLabelSpots = [];
  G.edges.forEach(function(e){
    var A = G.at[e.a], B = G.at[e.b];
    if(!A || !B) return;
    var bow = ((e.a < e.b) ? 1 : -1) * (16 + Math.min(26, e.n * 4));
    var p = sEl("path", {d:edgePath(A, B, bow)},
                "graph-edge" + (e.n > 1 ? " shared" : "") + (e.future ? " future" : ""));
    p.setAttribute("data-edge", e.key);
    p.setAttribute("stroke-width", (0.6 + Math.min(2.6, e.n * 0.55)).toFixed(2));
    if(litBin || litWorlds){
      var through = e.worlds.some(function(l){ return litWorlds && litWorlds[l.id]; });
      p.setAttribute("opacity", through ? "0.9" : "0.07");
      if(through && one){ p.setAttribute("stroke", one); p.setAttribute("stroke-width", "3"); }
    }
    var t = sEl("title");
    t.textContent = G.labelFor(e) + "\n"
      + (e.n === 1 ? e.worlds[0].title
                   : e.n + " worlds: " + e.worlds.map(function(l){ return l.title; }).join(", "));
    p.appendChild(t);
    gEdges.appendChild(p);
    if(e.n >= 2){
      var text = G.labelFor(e), w = text.length * 5.2 + 14, geom = edgeGeom(A, B, bow), spot = null;
      for(var attempt = 0; attempt < 12 && !spot; attempt++){
        var tt = 0.5 + ((attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 0.09);
        if(tt < 0.16 || tt > 0.84) continue;
        var q = quadAt(geom, tt), off = -9 - Math.floor(attempt / 4) * 5, clash = false;
        for(var k = 0; k < edgeLabelSpots.length; k++){
          var o = edgeLabelSpots[k];
          if(Math.abs(o.y - (q.y + off)) < 11 && Math.abs(o.x - q.x) < (o.w + w) / 2){ clash = true; break; }
        }
        if(!clash) spot = { x:q.x, y:q.y + off, w:w };
      }
      if(spot){
        edgeLabelSpots.push(spot);
        var lab = sEl("text", {x:spot.x, y:spot.y, "text-anchor":"middle"}, "graph-edge-label");
        lab.textContent = text + " · " + e.n;
        gEdges.appendChild(lab);
      }
    }
  });
  g.appendChild(gEdges);

  /* --- circles --------------------------------------------------------------- */
  var gNodes = sEl("g", null, "graph-nodes");
  G.nodes.forEach(function(n){
    var nodeLit = !litBin || n.id === litBin;
    var grp = sEl("g", null, "graph-node" + (n.onMain ? " on-main" : " off-main"));
    grp.setAttribute("data-moment-node", n.id);
    if(!nodeLit) grp.setAttribute("opacity", "0.28");
    var rr = MOMENT_R + n.worlds.size * 0.75;
    grp.appendChild(paintC(sEl("circle", {cx:n.x, cy:n.y, r:rr}, "moment-circle"), "fill", "#ffffff"));
    grp.appendChild(sEl("circle", {cx:n.x, cy:n.y, r:rr}, "moment-ring"));
    var cnt = sEl("text", {x:n.x, y:n.y + 3.2, "text-anchor":"middle"}, "moment-node-n");
    cnt.textContent = String(n.worlds.size);
    grp.appendChild(cnt);
    /* label on the outer side. On the main line 22 kinds sit 60px apart, so
       labels take four rows: above/below alternates, and every second pair
       steps out to a farther row, with a hairline lead back to its circle. */
    var side = n.up, tier = n.onMain ? Math.floor(n.order / 2) % 2 : 0;
    var labY = side < 0 ? n.y - rr - 7 - tier * 26 : n.y + rr + 13 + tier * 26;
    if(tier){
      grp.appendChild(sEl("line", {x1:n.x, y1: side < 0 ? n.y - rr : n.y + rr,
                                   x2:n.x, y2: side < 0 ? labY + 4 : labY - 10}, "moment-lead"));
    }
    var lab = sEl("text", {x:n.x, y:labY, "text-anchor":"middle"}, "moment-node-label");
    lab.textContent = shortName(n.spec.label || n.id);
    grp.appendChild(lab);
    if(n.onMain && n.years.length){
      var yt = sEl("text", {x:n.x, y:side < 0 ? labY - 11 : labY + 11, "text-anchor":"middle"}, "moment-years");
      yt.textContent = n.years.slice(0, 3).map(function(e){ return e.year; }).join("  ")
        + (n.years.length > 3 ? " …" : "");
      grp.appendChild(yt);
    } else if(!n.onMain){
      var oc = sEl("text", {x:n.x, y:side < 0 ? labY - 11 : labY + 11, "text-anchor":"middle"}, "moment-node-count");
      oc.textContent = "only in fiction";
      grp.appendChild(oc);
    }
    var t = sEl("title");
    t.textContent = (n.spec.label || n.id) + " — " + n.worlds.size + " worlds, " + n.hits + " events."
      + (n.years.length ? "\nHappened to us: "
          + n.years.map(function(e){ return e.year + " " + e.title; }).join("; ") : "")
      + "\n" + (n.spec.definition || "")
      + "\nclick: the worlds that share this moment, and what each did next";
    grp.appendChild(t);
    grp.style.cursor = "pointer";
    grp.onclick = function(ev){
      if(ev && ev.stopPropagation) ev.stopPropagation();
      matchNews({ headline: n.spec.label || n.id, bin: n.id, years: n.years });
      if(typeof setPanel === "function") setPanel("news");
    };
    gNodes.appendChild(grp);
  });
  g.appendChild(gNodes);

  /* --- real beats: a dot per visit, just under their kind's circle, each
     clickable for the situation match ---------------------------------------- */
  var gReal = sEl("g", null, "real-beats");
  mains.forEach(function(n){
    var k = n.years.length;
    n.years.forEach(function(e, i){
      var x = n.x + (i - (k - 1) / 2) * 7, y = n.y + MOMENT_R + n.worlds.size * 0.75 + 7;
      var hit = sEl("circle", {cx:x, cy:y, r:6, fill:"transparent", "pointer-events":"all"}, "real-hit");
      hit.setAttribute("data-real", e.id);
      hit.style.cursor = "pointer";
      var tt = sEl("title");
      tt.textContent = e.year + " · " + e.title + (e.facets ? "\n" + e.facets.change : "")
        + "\nclick: the worlds nearest this situation, and what followed there";
      hit.appendChild(tt);
      hit.onclick = function(ev){
        if(ev && ev.stopPropagation) ev.stopPropagation();
        matchMoment(e);
        if(typeof setPanel === "function") setPanel("news");
      };
      gReal.appendChild(hit);
      gReal.appendChild(sEl("circle", {cx:x, cy:y, r:2.3}, "real-dot"));
    });
  });
  g.appendChild(gReal);

  /* --- today: the last kind we reached ---------------------------------------- */
  if(G.today){
    var tn = G.today, rr2 = MOMENT_R + tn.worlds.size * 0.75 + 6;
    g.appendChild(sEl("circle", {cx:tn.x, cy:tn.y, r:rr2}, "today-ring"));
    var tc = sEl("text", {x:tn.x, y:tn.y - rr2 - 30, "text-anchor":"middle"}, "now-cap graph-now");
    tc.textContent = "TODAY " + NOW;
    g.appendChild(tc);
  }

  host.appendChild(g);

  var cap = sEl("text", {x:right, y:Hv - 26, "text-anchor":"end"}, "axis-label");
  cap.textContent = G.main.length + " kinds of moment we have been through, in the order we first reached them · "
    + (G.nodes.length - G.main.length) + " only fiction has reached · " + G.edges.length
    + " roads, " + G.sharedEdges + " taken by more than one world";
  host.appendChild(cap);
}

/* Moments draws a graph. Kept as one place to ask. */
function graphMode(){
  return typeof AX !== "undefined" && AX && AX.mode === "moments" && AX.columns && AX.columns.length > 0;
}

/* Real history's beats in the line-shaped views (Order, Years): a strip at the
   head of the drawing area. In the graph they are drawn on their kind's circle
   by drawMomentGraph, so this returns early there. */
function drawRealBeats(host, list, left, right){
  if(!REAL || !REAL.events || !REAL.events.length) return;
  if(graphMode()) return;
  var g = sEl("g", null, "real-beats");
  var shown = 0;
  REAL.events.forEach(function(e){
    var x = AX.realX ? AX.realX(e) : null;
    if(x == null || isNaN(x) || x < left - 4 || x > right + 4) return;
    shown++;
    var y = 0;
    var hit = sEl("circle", {cx:x, cy:y, r:11, fill:"transparent", "pointer-events":"all"}, "real-hit");
    hit.setAttribute("data-real", e.id);
    hit.style.cursor = "pointer";
    var t = sEl("title");
    t.textContent = fmtYear(e.year) + " · " + e.title + "\n" + (e.facets ? e.facets.change : "")
      + "\nclick to read what followed in worlds in this situation";
    hit.appendChild(t);
    g.appendChild(hit);
    g.appendChild(paintC(sEl("circle", {cx:x, cy:y, r:3.1}, "real-dot"), "fill", "#ffffff"));
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
