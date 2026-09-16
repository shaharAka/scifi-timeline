/* ============================================================================
   The Moments graph: one circle per kind of moment, and an arc for every way a
   story moves between them.

   This is not the Order view with different spacing. There, x is a sequence and
   a branch is a line. Here a kind of moment is a thing in the world - a node -
   and what matters is which kinds connect to which, and how differently
   different stories travel between the same ones.

   What the data turned out to be, measured over the 24 worlds: 32 kinds, 154
   transitions between them, and only 20 of those transitions are shared by more
   than one world. So the vocabulary is common but almost every ARC belongs to a
   single story. That is the picture: shared circles, private roads between them,
   and a handful of roads two or more worlds both take.

   Layout is force-directed, seeded from the arc position of each kind so the
   result still reads roughly early-to-late, then relaxed until the circles stop
   colliding. Deterministic: same data, same picture.
   ========================================================================== */

var MOMENT_R = 7;              /* circle radius, before separation passes */
var momentGraphCache = null;   /* keyed on the visible list, so a re-render is cheap */

/* Every transition a world makes, with the world that made it. */
function momentEdges(list, colOf){
  var edges = {}, order = [];
  list.forEach(function(l){
    var seq = [];
    (l.events || []).forEach(function(e){
      if(e.bin && colOf[e.bin] && (seq.length === 0 || seq[seq.length - 1] !== e.bin)){
        seq.push(e.bin);
      }
    });
    for(var i = 1; i < seq.length; i++){
      var a = seq[i - 1], b = seq[i], k = a + "\u0000" + b;
      if(!edges[k]){
        edges[k] = { a:a, b:b, worlds:[], n:0 };
        order.push(edges[k]);
      }
      edges[k].worlds.push(l);
      edges[k].n++;
    }
  });
  return { edges:edges, list:order };
}

/* A short name for a transition, built from the two ends and trimmed so it stays
   a caption rather than a sentence. */
function edgeLabel(edge, byId){
  var a = (byId[edge.a] && (byId[edge.a].label || edge.a)) || edge.a;
  var b = (byId[edge.b] && (byId[edge.b].label || edge.b)) || edge.b;
  return shortName(a) + " \u2192 " + shortName(b);
}
function shortName(s){
  s = String(s);
  return s.length > 22 ? s.slice(0, 21).trim() + "\u2026" : s;
}

function placeMomentsGraph(list, left, right){
  var cols = (AX && AX.columns) ? AX.columns : [];
  var byId = {};
  cols.forEach(function(c){ byId[c.bin] = c; });
  var g = momentEdges(list, byId);

  var W = right - left, H = Math.max(320, Hv - 90);
  var cx0 = left + W / 2, cy0 = 56 + H / 2;

  /* ---- seed: the arc, laid along a spine that alternates above and below ---
     A graph wants to be a cloud, but a cloud of 32 labelled circles is a
     thicket. The spine keeps the arc readable - left is earlier in a story -
     while the alternation gives every label a clear row of its own, which is
     what makes the circles legible at this count. */
  var n = cols.length;
  var x0 = left + 58, span = Math.max(1, right - 24 - x0);
  var midY = 70 + (Hv - 150) / 2;
  var amp = Math.max(60, Math.min(190, (Hv - 190) / 2));
  var nodes = cols.map(function(c){
    var t = n > 1 ? c.i / (n - 1) : 0.5;
    var up = (c.i % 2 === 0) ? -1 : 1;
    return {
      id: c.bin, spec: c.spec, worlds: c.worlds, hits: c.hits, t: t, up: up,
      x: x0 + t * span,
      y: midY + up * (amp * (0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI)))),
      vx: 0, vy: 0
    };
  });
  var at = {};
  nodes.forEach(function(k){ at[k.id] = k; });

  /* ---- relax: only enough to stop the circles colliding -------------------
     The spine is the layout; the relaxation is a correction to it, not a
     replacement, so it is small and damped. */
  var ITER = 160;
  for(var it = 0; it < ITER; it++){
    var cool = 1 - it / ITER;
    for(var i = 0; i < nodes.length; i++){
      for(var j = i + 1; j < nodes.length; j++){
        var A = nodes[i], B = nodes[j];
        var dx = B.x - A.x, dy = B.y - A.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        /* labels sit to the side, so the clearance needed is mostly vertical */
        var wantY = 30, wantX = 46;
        if(Math.abs(dy) < wantY && Math.abs(dx) < wantX){
          var push = (1 - Math.abs(dy) / wantY) * 7 * cool;
          var sgn = dy >= 0 ? 1 : -1;
          A.y -= sgn * push; B.y += sgn * push;
        }
      }
    }
    /* keep neighbours from stacking on top of each other along the spine */
    for(var k = 1; k < nodes.length; k++){
      var P = nodes[k - 1], Q = nodes[k];
      var gap = Q.x - P.x;
      var need = 52;
      if(gap < need){
        var fix = (need - gap) / 2 * 0.5 * cool;
        P.x -= fix; Q.x += fix;
      }
    }
    nodes.forEach(function(k){
      k.x = Math.max(left + 30, Math.min(right - 20, k.x));
      k.y = Math.max(24, Math.min(Hv - 30, k.y));
    });
  }

  /* ---- a stable draw order: the long arcs behind, the circles in front ---- */
  var edges = g.list.slice().sort(function(a, b){ return b.n - a.n; });

  return {
    nodes: nodes,
    at: at,
    edges: edges,
    /* how many transitions exist, and how many are shared - the headline fact */
    sharedEdges: edges.filter(function(e){ return e.n > 1; }).length,
    labelFor: function(e){ return edgeLabel(e, byId); }
  };
}

/* Curved path between two circles, bowed perpendicular to the line. Two worlds
   taking the same road bow opposite ways, so both stay visible. */
/* The quadratic's geometry, so a label can be placed at any fraction along the
   arc rather than only at its midpoint. */
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
  return {
    x: u * u * g.p0.x + 2 * u * t * g.p1.x + t * t * g.p2.x,
    y: u * u * g.p0.y + 2 * u * t * g.p1.y + t * t * g.p2.y
  };
}

function edgePath(A, B, bow, rad){
  var dx = B.x - A.x, dy = B.y - A.y;
  var d = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / d, uy = dy / d;
  var sx = A.x + ux * (rad || MOMENT_R), sy = A.y + uy * (rad || MOMENT_R);
  var ex = B.x - ux * (rad || MOMENT_R), ey = B.y - uy * (rad || MOMENT_R);
  var mx = (sx + ex) / 2 - uy * bow, my = (sy + ey) / 2 + ux * bow;
  if(A.gx === undefined) A.gx = 0;
  return "M" + sx.toFixed(1) + "," + sy.toFixed(1)
       + "Q" + mx.toFixed(1) + "," + my.toFixed(1)
       + " " + ex.toFixed(1) + "," + ey.toFixed(1);
}

/* ============================================================================
   Drawing the graph. Circles for kinds of moment, arcs for the ways stories
   move between them, and a name for each arc - because the arcs are where the
   worlds differ, and most of them belong to exactly one world.
   ========================================================================== */
function drawMomentGraph(host, list, left, right){
  var G = placeMomentsGraph(list, left, right);
  momentGraphCache = G;
  var g = sEl("g", null, "moment-graph");

  /* --- arcs, behind the circles ------------------------------------------ */
  var gEdges = sEl("g", null, "graph-edges");
  var edgeLabelSpots = [];
  G.edges.forEach(function(e){
    var A = G.at[e.a], B = G.at[e.b];
    if(!A || !B) return;
    /* worlds that make the same move bow the same way and draw once, thicker */
    var key = e.a + "\u0000" + e.b;
    var bow = ((e.a < e.b) ? 1 : -1) * (16 + Math.min(26, e.n * 4));
    var p = sEl("path", {d:edgePath(A, B, bow)}, "graph-edge" + (e.n > 1 ? " shared" : ""));
    p.setAttribute("data-edge", key);
    p.setAttribute("stroke-width", (0.5 + Math.min(2.4, e.n * 0.5)).toFixed(2));
    if(litBin){
      /* the roads the matched worlds actually walk stay bright; the rest fade */
      var through = e.worlds.some(function(l){ return litWorlds && litWorlds[l.id]; });
      p.setAttribute("opacity", through ? "0.9" : "0.07");
    }
    var t = sEl("title");
    t.textContent = G.labelFor(e) + "\n"
      + (e.n === 1 ? e.worlds[0].title : e.n + " worlds: "
         + e.worlds.map(function(l){ return l.title; }).join(", "));
    p.appendChild(t);
    gEdges.appendChild(p);
    /* Named where a road is shared at all. Measured: 134 of the 154 transitions
       belong to one world and 20 are taken by exactly two, so "shared" means
       "two stories make this same move" - the convergence worth reading. Naming
       all 154 would be a wall of text; naming these 20 is the finding. A
       private road keeps its name on hover. */
    if(e.n >= 2){
      var text = G.labelFor(e);
      var w = text.length * 5.2 + 14;
      var geom = edgeGeom(A, B, bow);
      /* Slide the label along its own arc until it clears the ones already
         placed, then bow it outward. Dumping all 23 at their midpoints put
         eight of them on top of each other. */
      var spot = null;
      for(var attempt = 0; attempt < 12 && !spot; attempt++){
        var t = 0.5 + ((attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 0.09);
        if(t < 0.16 || t > 0.84) continue;
        var p = quadAt(geom, t);
        /* sit off the line by default: on it, every label reads as if it named
           the wrong arc */
        var off = -9 - Math.floor(attempt / 4) * 5;
        var clash = false;
        for(var q = 0; q < edgeLabelSpots.length; q++){
          var o = edgeLabelSpots[q];
          if(Math.abs(o.y - (p.y + off)) < 11 && Math.abs(o.x - p.x) < (o.w + w) / 2){
            clash = true; break;
          }
        }
        if(!clash) spot = { x:p.x, y:p.y + off, w:w };
      }
      if(spot){
        edgeLabelSpots.push(spot);
        var lab = sEl("text", {x:spot.x, y:spot.y, "text-anchor":"middle"}, "graph-edge-label");
        lab.textContent = text + " \u00b7 " + e.n;
        gEdges.appendChild(lab);
      }
    }
  });
  g.appendChild(gEdges);

  /* --- circles ------------------------------------------------------------ */
  var maxW = 1;
  G.nodes.forEach(function(n){ if(n.worlds.size > maxW) maxW = n.worlds.size; });
  var gNodes = sEl("g", null, "graph-nodes");
  G.nodes.forEach(function(n){
    /* A match is about ONE kind of moment. Dimming by "shares a world with the
       match" was tried and lit 31 of the 32 kinds, because worlds pass through
       many kinds each - a highlight that marks everything marks nothing. So the
       matched kind is spotted and every other circle recedes; the lit WORLDS
       are carried by the arcs, which is where a world's path actually lives. */
    var nodeLit = !litBin || n.id === litBin;
    var grp = sEl("g", null, "graph-node");
    grp.setAttribute("data-moment-node", n.id);
    if(!nodeLit) grp.setAttribute("opacity", "0.28");
    var rr = MOMENT_R + n.worlds.size * 0.75;
    grp.appendChild(paintC(sEl("circle", {cx:n.x, cy:n.y, r:rr}, "moment-circle"), "fill", "#ffffff"));
    grp.appendChild(sEl("circle", {cx:n.x, cy:n.y, r:rr}, "moment-ring"));
    /* The name sits beside its circle, on the side the circle hangs, and the
       count beneath it. Inline labels over the arcs made both unreadable. */
    var side = n.up < 0 ? -1 : 1;
    var lab = sEl("text", {x:n.x, y:n.y + side * 4, "text-anchor":"middle",
                           dy: side < 0 ? "-0.9em" : "1.6em"}, "moment-node-label");
    lab.textContent = shortName(n.spec.label || n.id);
    grp.appendChild(lab);
    var cnt = sEl("text", {x:n.x, y:n.y, "text-anchor":"middle",
                           dy: side < 0 ? "-2.1em" : "2.9em"}, "moment-node-count");
    cnt.textContent = n.worlds.size + (n.worlds.size === 1 ? " world" : " worlds");
    grp.appendChild(cnt);
    var t = sEl("title");
    t.textContent = (n.spec.label || n.id) + " \u2014 " + n.worlds.size
      + " worlds, " + n.hits + " events.\n" + (n.spec.definition || "");
    grp.appendChild(t);
    grp.style.cursor = "pointer";
    grp.onclick = function(){
      litBin = n.id;
      litWorlds = {};
      n.worlds.forEach(function(id){ litWorlds[id] = true; });
      renderChart();
    };
    gNodes.appendChild(grp);
  });
  g.appendChild(gNodes);

  host.appendChild(g);

  /* --- the reading, stated ------------------------------------------------- */
  var cap = sEl("text", {x:right, y:Hv - 26, "text-anchor":"end"}, "axis-label");
  cap.textContent = G.nodes.length + " kinds of moment \u00b7 " + G.edges.length
    + " ways between them \u00b7 " + G.sharedEdges + " taken by more than one world";
  host.appendChild(cap);
}

/* Moments draws a graph. Kept as one place to ask, so the chart and the layout
   agree about which picture is being drawn. */
function graphMode(){
  return typeof AX !== "undefined" && AX && AX.mode === "moments"
      && AX.columns && AX.columns.length > 0;
}

/* ============================================================================
   Real history on the trunk.

   The real beats carry the same schema as the fictions - binned and faceted -
   so they sit on the same axis as everything else and answer the same question
   when clicked. Position comes from the active axis, so they land correctly in
   Order, in Moments and in Years without a second set of rules.
   ========================================================================== */
function drawRealBeats(host, list, left, right){
  if(!REAL || !REAL.events || !REAL.events.length) return;
  var g = sEl("g", null, "real-beats");
  var shown = 0;
  REAL.events.forEach(function(e){
    var x = AX.realX ? AX.realX(e) : null;
    if(x == null || isNaN(x) || x < left - 4 || x > right + 4) return;
    shown++;
    /* A fixed strip at the head of the drawing area. In graph mode there is no
       trunk line to sit on, and in the line views the trunk is where the lanes
       converge - a hundred year ticks - so real history gets its own row. */
    var y = graphMode() ? 26 : 0;
    var hit = sEl("circle", {cx:x, cy:y, r:11, fill:"transparent",
                             "pointer-events":"all"}, "real-hit");
    hit.setAttribute("data-real", e.id);
    hit.style.cursor = "pointer";
    var t = sEl("title");
    t.textContent = fmtYear(e.year) + " \u00b7 " + e.title
      + "\n" + (e.facets ? e.facets.change : "")
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
  /* the clicks are wired here because the group is rebuilt on every render */
  Array.prototype.forEach.call(g.querySelectorAll("[data-real]"), function(el){
    el.onclick = function(ev){
      if(ev && ev.stopPropagation) ev.stopPropagation();
      var id = el.getAttribute("data-real");
      var e = null;
      REAL.events.forEach(function(x){ if(x.id === id) e = x; });
      if(e) matchMoment(e);
    };
  });
}
