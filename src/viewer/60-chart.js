/* ============================================================ svg helpers */

function sEl(tag, attrs, cls){
  var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if(cls) e.setAttribute("class", cls);
  if(attrs) for(var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function measureW(){
  var b = document.getElementById("chartbody");
  return Math.max(axisMode === "moments" ? 300 : 620, b.clientWidth || 1100);
}
function measureH(){
  var b = document.getElementById("chartbody");
  return Math.max(360, b.clientHeight || 700);
}
/* keep the scene reachable: centred when it fits, otherwise never pulled fully
   out of view */
function clampPan(sceneH){
  if(sceneH <= Hv) panY = (Hv - sceneH) / 2;
  else panY = clamp(panY, Hv - sceneH - 24, 24);
}

/* How many event labels a lane may carry.
   In Years mode this follows the time span: zoomed in, there is room for more.
   In Order mode there is no span to read (x is sequence, and a stale span from
   the other view would be a lie), so it follows the lane pitch instead. */
function labelBudget(span, lod){
  if(showAllEvents) return 99;
  if(lod != null){
    return lod >= 2 ? 4 : lod === 1 ? 3 : 2;
  }
  if(span < 30) return 8;
  if(span < 120) return 6;
  if(span < 500) return 4;
  if(span < 4000) return 3;
  return 2;
}

var rooms = {};
function claimRoom(key, x0, x1, pad){
  pad = pad == null ? 8 : pad;
  var used = rooms[key] || (rooms[key] = []);
  for(var i=0;i<used.length;i++){
    if(x0 < used[i][1] + pad && x1 > used[i][0] - pad) return false;
  }
  used.push([x0,x1]);
  return true;
}

/* ============================================================ backdrop */
/* A static field of faint stars behind the SVG. Painted once per size, never
   per frame, and skipped entirely where canvas is unavailable (tests). */

/* Which ground is under the stars decides whether there ARE stars. A faint
   field reads as depth on a dark page and as dirt on a light one, so light
   themes get a clean sheet and the chart carries the whole picture. */
function themeIsDark(){
  try{
    var probe = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    var m = probe.match(/^#([0-9a-f]{6})$/i);
    if(m){
      var v = parseInt(m[1], 16);
      var r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
      return (0.2126*r + 0.7152*g + 0.0722*b) < 110;
    }
  }catch(e){}
  return false;
}

var backdropKey = "";
function drawBackdrop(w, h){
  var cv = document.getElementById("backdrop");
  if(!cv || !cv.getContext) return;
  var dark = themeIsDark();
  var key = w + "x" + h + (dark ? "-dark" : "-light");
  if(key === backdropKey) return;
  backdropKey = key;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  var ctx = cv.getContext("2d");
  if(!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if(!dark) return;
  var seed = 1234567;
  function rnd(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var n = Math.round((w * h) / 2600);
  for(var i=0;i<n;i++){
    var x = rnd()*w, y = rnd()*h, r = rnd();
    var rad = r < 0.85 ? 0.6 : r < 0.97 ? 1.1 : 1.7;
    var a = 0.12 + rnd()*0.35;
    ctx.fillStyle = "rgba(232,226,245," + a.toFixed(3) + ")";  /* starfield: dark ground only */
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2); ctx.fill();
  }
}

/* ============================================================ chart */


/* Colours that carry meaning come from the data. The data's values are tuned
   for a dark ground, so each is darkened toward black - preserving hue - until
   it clears WCAG AA on this pale one. That computed value is set directly: with
   a single palette there is nothing for a per-theme indirection to decide. */
function paintC(node, prop, color){
  node.setAttribute(prop, accessible(color));
  return node;
}
function accessible(hex){
  var m = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if(!m) return hex;
  function lin(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
  function lum(r,g,b){ return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); }
  function contrast(r,g,b){
    var a = lum(r,g,b), bg = lum(238,242,246);
    var hi = Math.max(a,bg), lo = Math.min(a,bg);
    return (hi+0.05)/(lo+0.05);
  }
  var v = parseInt(m[1],16), r = (v>>16)&255, g = (v>>8)&255, b = v&255;
  if(contrast(r,g,b) >= 4.5) return hex;
  var lo = 0, hi = 1;
  for(var i=0;i<24;i++){
    var k = (lo+hi)/2;
    if(contrast(Math.round(r*k), Math.round(g*k), Math.round(b*k)) >= 4.5) lo = k; else hi = k;
  }
  return "#" + ((1<<24) + (Math.round(r*lo)<<16) + (Math.round(g*lo)<<8) + Math.round(b*lo))
    .toString(16).slice(1);
}


/* ---- Moments: naming the columns -------------------------------------------
   The strip above the tree holds one label per kind of moment. Its height is
   computed from the labels themselves - how wide they measure and how many rows
   that forces - rather than fixed, because a fixed strip is a guess about a
   vocabulary that changes. Nothing here caps how many kinds get named: if the
   labels need nine rows they get nine, and if they need one they get one.
   Row assignment lives here, pre-layout, so layout() can ask for the height and
   the draw pass can reuse the same rows rather than re-deriving them. */
var MOMENT_LABEL_FONT = '700 10px Inter, system-ui, sans-serif';
var momentRowsCache = null;

function momentLabelWidth(text){
  var c = momentLabelWidth._c;
  if(c === undefined){
    try{
      c = document.createElement("canvas").getContext("2d");
      if(c) c.font = MOMENT_LABEL_FONT;
    }catch(e){ c = null; }
    momentLabelWidth._c = c;
  }
  if(c) return c.measureText(text).width + 16;
  /* No canvas (the headless harness): a character-width estimate, stated as one
     so it is not mistaken for measurement. */
  return text.length * 5.6 + 16;
}

/* Assign each kind to the first row where its label clears its neighbours.
   Shorter names first: they are the ones that fit, and a long name that ends up
   unplaced should not have taken a short one's slot. */
function momentHeadRows(cols){
  var items = cols.map(function(c){
    var text = c.spec.label || c.bin;
    return { c:c, text:text, w:momentLabelWidth(text) };
  }).sort(function(a, b){ return a.w - b.w; });
  var rows = [];
  items.forEach(function(it){
    for(var r = 0; ; r++){
      var taken = rows[r] || (rows[r] = []);
      var clash = false;
      for(var k = 0; k < taken.length; k++){
        if(Math.abs(taken[k].cx - it.c.cx) < (taken[k].w + it.w) / 2){ clash = true; break; }
      }
      if(!clash){
        taken.push({ cx:it.c.cx, w:it.w });
        it.c._row = r;                  /* recorded for the draw pass */
        return;
      }
    }
  });
  var n = rows.length;
  return { rows:n, height:n ? n * 12 + 14 : 0 };
}

function renderChart(yOverride){
  W = measureW();
  var svg = document.getElementById("chart");
  var list = visibleLineages();
  var lay = layout(list);
  if(yOverride){
    lay.lanes.forEach(function(ln){ if(yOverride[ln.l.id] != null) ln.y = yOverride[ln.l.id]; });
  }
  lastLayout = lay;
  Hv = measureH();
  H = lay.height;
  clampPan(H);
  svg.setAttribute("viewBox", "0 0 " + W + " " + Hv);
  svg.setAttribute("width", W);
  svg.setAttribute("height", Hv);
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  rooms = {};
  drawBackdrop(W, Hv);
  svg.setAttribute("class", (svg.getAttribute("class") || "").replace(/\blod-\d\b/g, "").replace(/\bmoments\b/g, "").trim() + " lod-" + lay.lod);

  /* Moments is its own page: an arc diagram with its own camera and panel.
     Nothing of the tree is drawn there. */
  var chartBody = document.getElementById("chartbody");
  if(axisMode === "moments"){
    svg.setAttribute("class", (svg.getAttribute("class") || "") + " moments");
    cursorEls = null;
    renderMomentsPage(svg);
    attachInteractions(svg);
    publishTimeline(lay, null);
    return;
  }

  var defs = sEl("defs");
  var grad = sEl("linearGradient", {id:"nowGrad", x1:"0", x2:"1", y1:"0", y2:"0"});
  /* stop-color must be a token so the today-plane reads on light and dark alike */
  grad.appendChild(sEl("stop", {offset:"0", style:"stop-color:var(--now)", "stop-opacity":"0"}));
  grad.appendChild(sEl("stop", {offset:"0.5", style:"stop-color:var(--now)", "stop-opacity":"0.08"}));
  grad.appendChild(sEl("stop", {offset:"1", style:"stop-color:var(--now)", "stop-opacity":"0"}));
  defs.appendChild(grad);
  var tgrad = sEl("linearGradient", {id:"trunkGrad", x1:"0", x2:"1", y1:"0", y2:"0"});
  tgrad.appendChild(sEl("stop", {offset:"0", style:"stop-color:var(--trunk)", "stop-opacity":"0.55"}));
  tgrad.appendChild(sEl("stop", {offset:"0.35", style:"stop-color:var(--trunk)", "stop-opacity":"1"}));
  tgrad.appendChild(sEl("stop", {offset:"1", style:"stop-color:var(--now)", "stop-opacity":"1"}));
  defs.appendChild(tgrad);
  svg.appendChild(defs);

  /* viewport layers (grid, today, scrubber) and the pannable scene */
  var gGrid = sEl("g"), gPlane = sEl("g", null, "now-plane"), gNow = sEl("g"), gCursor = sEl("g", null, "cursor");
  var gScene = sEl("g", {transform:"translate(0," + panY.toFixed(1) + ")"}, "scene");
  var gBundles = sEl("g"), gTrunk = sEl("g"), gBranches = sEl("g"), gPre = sEl("g", null, "prehist");
  [gBundles, gTrunk, gBranches, gPre].forEach(function(g){ gScene.appendChild(g); });
  [gGrid, gPlane, gScene, gNow, gCursor].forEach(function(g){ svg.appendChild(g); });

  var lo = view.c - view.hs, hi = view.c + view.hs;
  var left = LANE_R, right = W - PAD_R;
  var ty = lay.trunkY;
  buildAxis(list, left, right);
  var nx = AX.now;
  var budget = labelBudget(AX.mode === 'years' ? view.hs * 2 : 0,
                           AX.mode === 'years' ? null : lay.lod);

  /* Archetype bands and the two half-canvas labels describe LANES: which shelf
     a branch sits on, and whether it runs past today. The Moments graph has no
     lanes - a circle is a kind of moment, and every world passes through it
     whatever its dates - so the bands are not drawn there. They were overlay
     from the tree view, labelling nothing. */
  if(!graphMode()) lay.bundles.forEach(function(b){
    var bh = Math.max(0, b.y1 - b.y0);
    gBundles.appendChild(paintC(sEl("rect", {x:0, y:b.y0, width:W, height:bh}, "bundle-band"), "fill", b.g.color));
    gBundles.appendChild(paintC(sEl("rect", {x:left - 14, y:b.y0 + 2, width:3, height:Math.max(0, bh - 4), rx:1.5}, "bundle-bar"), "fill", b.g.color));
    /* headings sit above their band on both halves; the layout leaves extra
       room under the trunk so the innermost lower heading clears the axis row */
    var ly = b.y0 - 7;
    var t = paintC(sEl("text", {x:left - 14, y:ly}, "bundle-label"), "fill", b.g.color);
    t.textContent = b.g.name + "  ";
    var n = sEl("tspan", null, "n"); n.textContent = String(b.count);
    t.appendChild(n);
    gBundles.appendChild(t);
  });

  /* the two halves of the canvas carry meaning; say so along the left edge */
  var sidesCopy = (ATLAS && ATLAS.sides) || {};
  function sideLabel(y0, y1, key, fallback){
    var h = y1 - y0;
    if(h < 110) return;
    var cy = (y0 + y1) / 2, copy = sidesCopy[key] || fallback;
    var t = sEl("text", {x:11, y:cy, "text-anchor":"middle", transform:"rotate(-90 11 " + cy.toFixed(1) + ")"}, "side-label");
    t.textContent = copy.label;
    gBundles.appendChild(t);
    if(h >= 260 && copy.sub){
      var u = sEl("text", {x:22, y:cy, "text-anchor":"middle", transform:"rotate(-90 22 " + cy.toFixed(1) + ")"}, "side-label sub");
      u.textContent = copy.sub;
      gBundles.appendChild(u);
    }
  }
  if(!graphMode()){
    sideLabel(PAD_Y * Z, ty - TRUNK_BAND * Z, "above", {label:"AHEAD OF US", sub:"worlds whose stories run past today"});
    sideLabel(ty + TRUNK_BAND * Z, H - PAD_Y * Z, "below", {label:"BEHIND AND BESIDE US", sub:"pasts that went otherwise, secrets under this one"});
  }

  /* Axis chrome. In Years mode these are year ticks, which is the evidence.
     In Order mode there is no year scale to tick - position means sequence - so
     the same slot under the trunk says what the two directions mean instead. */
  if(AX.mode === "years"){
    var target = Math.max(3, Math.min(14, Math.round(W / 150)));
    niceTicks(lo, hi, target).forEach(function(t, i){
      if(t === 0) return;
      var x = pxFor(t);
      if(x < left + 6 || x > right - 6) return;
      gGrid.appendChild(sEl("line", {x1:x, y1:0, x2:x, y2:Hv}, "gridline"));
      gTrunk.appendChild(sEl("line", {x1:x, y1:ty-5, x2:x, y2:ty+5}, "axis-tick"));
      var tx = sEl("text", {x:x, y:ty+19, "text-anchor":"middle"},
                   "axis-label" + (i%2 === 0 ? " major" : ""));
      tx.textContent = fmtYear(t);
      gTrunk.appendChild(tx);
    });
  } else if(AX.mode === "moments" && !graphMode()){
    /* One band per kind of moment. The header is the kind and how many worlds
       pass through it - that count IS the convergence, so it is stated, not
       implied by a shade. */
    var cols = AX.columns || [];
    /* No width threshold decides whether headers appear: a band can be wide
       and its label still be wider, so the only meaningful test is whether two
       labels collide. Placement below does that test. */
    /* Convergence is the column's density, so the band is shaded by how many
       worlds pass through it - the one thing this view exists to show. */
    var maxW = 1;
    cols.forEach(function(c){ if(c.worlds.size > maxW) maxW = c.worlds.size; });
    var tops = [];                        /* the densest kinds, labelled below */
    cols.forEach(function(c){
      var band = sEl("rect",
        {x:c.x0, y:0, width:Math.max(0, c.x1 - c.x0), height:Hv}, "moment-band");
      band.style.fillOpacity = (0.18 + 0.62 * (c.worlds.size / maxW)).toFixed(3);
      /* At 54 kinds a band is about 21px, too narrow for a header, so the band
         carries its own name on hover rather than going nameless. */
      var ttl = sEl("title");
      ttl.textContent = (c.spec.label || c.bin) + " \u2014 " + c.worlds.size
        + (c.worlds.size === 1 ? " world" : " worlds") + ", " + c.hits
        + (c.hits === 1 ? " event" : " events") + ".\n" + (c.spec.definition || "");
      band.appendChild(ttl);
      band.setAttribute("data-moment", c.bin);
      gGrid.appendChild(band);
      /* Convergence gets a mark of its own. Shade alone was too quiet for the
         one thing this view exists to show: how many worlds meet on this kind
         of moment, and so how many futures a match would return. */
      {
        var capW = Math.min(Math.max(0, c.x1 - c.x0) - 8, 4 + c.worlds.size * 1.7);
        var capY = PAD_Y * Z + (lay.head || 0) - 12;
        var cap = sEl("rect",
          {x:c.cx - capW / 2, y:capY, width:capW, height:3, rx:1.5}, "moment-capsule");
        cap.style.fillOpacity = (0.35 + 0.65 * (c.worlds.size / maxW)).toFixed(3);
        var ct = sEl("title");
        ct.textContent = c.worlds.size + " worlds pass through "
          + (c.spec.label || c.bin);
        cap.appendChild(ct);
        gGrid.appendChild(cap);
      }
      tops.push(c);                     /* every kind is a candidate for a name */
    });
    /* Headers are placed by collision, not by a width threshold. A band wide
       enough on average still produces labels far wider than itself, so the
       only test that means anything is whether two labels would overlap. They
       are laid out on rows with a short lead down to each band, inside the
       strip layout() reserved. A kind that cannot be placed is left unlabelled
       rather than overprinted - its band still carries its name on hover. */
    /* The rows were assigned before layout so it could size the strip; this
       draws them. Same computation, not a second one that could disagree. */
    if(tops.length && momentRowsCache){
      var placed = momentHeadRows(tops);
      cols.forEach(function(c){
        if(c._row === undefined) return;
      });
      tops.forEach(function(c){
        var r = c._row;
        if(r === undefined) return;
        var ly = 9 + r * 12;
        gGrid.appendChild(sEl("line",
          {x1:c.cx, y1:ly + 4, x2:c.cx, y2:(lay.head || 0) - 1}, "moment-lead"));
        var lab = sEl("text", {x:c.cx, y:ly, "text-anchor":"middle"}, "moment-head");
        lab.textContent = (c.spec.label || c.bin) + " \u00b7 " + c.worlds.size;
        gGrid.appendChild(lab);
      });
    }
  } else if(!graphMode()){
    /* the fork zone: where worlds stop sharing our history. Guarded on the
       shape, not just on caption being set: the Moments axis carries a caption
       of its own, and reading it here drew a kinds-of-moment string as if it
       described a zone that does not exist in that view. */
    if(AX.caption && AX.caption.zoneA !== undefined){
      var z = AX.caption;
      gGrid.appendChild(sEl("rect",
        {x:z.zoneA, y:0, width:Math.max(0, z.zoneB - z.zoneA), height:Hv}, "fork-zone"));
      /* The fork zone is a thicket of branch titles top to bottom - every
         pre-today branch curves away inside it - so the caption goes on the
         trunk line, which is the one strip no lane can cross. It replaces
         nothing: the "beats before today" marker sits to the right of the zone. */
      var zl = sEl("text", {x:(z.zoneA + z.zoneB) / 2, y:ty + 4, "text-anchor":"middle"},
                   "axis-label major zone");
      zl.textContent = z.text;
      gTrunk.appendChild(zl);
    }
    var bl = sEl("text", {x:nx - 12, y:ty + 19, "text-anchor":"end"}, "axis-label major");
    bl.textContent = "\u2190 beats before today";
    gTrunk.appendChild(bl);
    var al = sEl("text", {x:nx + 12, y:ty + 19, "text-anchor":"start"}, "axis-label major");
    al.textContent = "beats after today \u2192";
    gTrunk.appendChild(al);
  }

  /* The trunk is real history drawn once through the middle of the tree, solid
     to today and faint beyond. The graph has no trunk - its kinds of moment are
     not a line and its x is not a date - so the line, its two labels and the
     year-axis caption are all tree furniture and are not drawn there. */
  var trunkEnd = clamp(nx, left, right);
  if(!graphMode() && trunkEnd > left + 1){
    gTrunk.appendChild(sEl("line", {x1:left, y1:ty, x2:trunkEnd, y2:ty}, "trunk-glow"));
    gTrunk.appendChild(sEl("line", {x1:left, y1:ty, x2:trunkEnd, y2:ty, stroke:"url(#trunkGrad)"}, "trunk-core"));
  }
  if(!graphMode() && trunkEnd < right - 1){
    gTrunk.appendChild(sEl("line", {x1:trunkEnd, y1:ty, x2:right, y2:ty}, "trunk-future"));
  }
  var trunkLabel = (ATLAS && ATLAS.trunkLabel) || "REAL HISTORY";
  if(!graphMode() && trunkEnd > left + 150){
    var tl = sEl("text", {x:left + 4, y:ty - 14}, "trunk-label");
    tl.textContent = trunkLabel;
    gTrunk.appendChild(tl);
  }
  if(!graphMode() && right - trunkEnd > 260){
    var fl = sEl("text", {x:trunkEnd + 14, y:ty - 14}, "trunk-label faint");
    fl.textContent = (ATLAS && ATLAS.futureLabel) || "the years none of us have reached";
    gTrunk.appendChild(fl);
  }
  if(!graphMode()){
    var cap = sEl("text", {x:right, y:Hv - 8, "text-anchor":"end"}, "axis-caption");
    cap.textContent = "real-world year \u00b7 symmetric-log axis, stretched around today";
    gGrid.appendChild(cap);
  }

  /* the present day */
  /* the graph places today on the last kind we reached and draws its own cap */
  if(!graphMode() && nx > -30 && nx < W + 30){
    gPlane.appendChild(sEl("rect", {x:nx-18, y:0, width:36, height:Hv, fill:"url(#nowGrad)"}));
    var nl = sEl("line", {x1:nx, y1:0, x2:nx, y2:Hv}, "now-line");
    if(!REDUCED) nl.classList.add("now-pulse");
    gNow.appendChild(nl);
  }
  var offscreen = (nx < 0 || nx > W);
  /* In Moments the column headers share this strip, and a header can land on
     the plane. Sit the cap beside the line rather than centred on it, so the
     plane stays legible and the header is not overprinted. */
  var capX = clamp(nx, left + 52, right - 52);
  var capAnchor = "middle", capY = 14;
  if(AX && AX.mode === "moments"){
    /* Moments fills the top strip with column labels, so the today cap drops to
       the crown of the tree and sits beside the plane rather than on it. */
    capY = PAD_Y * Z + (lay.head || 0) + 11;
    if(nx + 46 < right - 4){ capAnchor = "start"; capX = nx + 5; }
    else { capAnchor = "end"; capX = nx - 5; }
  }
  var nt = sEl("text", {x:capX, y:capY, "text-anchor":capAnchor}, "now-cap");
  nt.textContent = offscreen ? ("TODAY " + NOW + (nx < 0 ? " ←" : " →")) : ("TODAY " + NOW);
  if(offscreen) nt.setAttribute("opacity", "0.5");
  if(!graphMode()){
    gNow.appendChild(nt);
    renderNewsBand(gNow, nx, 0, Hv);
  }

  /* branches and the real history each one leans on */
  var targets = {};
  lay.lanes.forEach(function(ln){
    targets[ln.l.id] = ln.y;
    gBranches.appendChild(renderBranch(ln, lay, budget, left, right, nx));
    renderPrehistory(ln, lay, gPre, left, right);
  });

  /* Real history's own beats, drawn on the trunk in every view. They are not
     decoration: a world's divergence is a divergence from THESE, and clicking
     one asks the question the atlas exists for - which fictions are in a
     comparable situation, and what followed there. */
  drawRealBeats(gTrunk, list, left, right, ty);

  /* the scrubber lives in its own group and is moved in place, never re-rendered */
  var tyv = clamp(ty + panY, 30, Hv - 60);
  cursorEls = {
    g:gCursor, line:sEl("line", {x1:-10, y1:0, x2:-10, y2:Hv}, "cursor-line"),
    pill:sEl("rect", {x:-999, y:tyv + 26, width:10, height:18, rx:9}, "cursor-pill"),
    text:sEl("text", {x:-999, y:tyv + 39}, "cursor-text"), trunkY:tyv
  };
  gCursor.appendChild(cursorEls.line); gCursor.appendChild(cursorEls.pill); gCursor.appendChild(cursorEls.text);
  gCursor.setAttribute("opacity", "0");

  attachInteractions(svg);
  if(hoverId) setBranchHover(hoverId);

  if(!yOverride){
    anim.from = {};
    Object.keys(targets).forEach(function(id){
      anim.from[id] = (curY[id] === undefined) ? targets[id] : curY[id];
      curY[id] = targets[id];
    });
    lastTargets = targets;
  }

  var zs = document.getElementById("zoom");
  if(zs) zs.value = String(Math.round(1000 * (Math.log(view.hs/SPAN_MIN) / Math.log(SPAN_MAX/SPAN_MIN))));

  publishTimeline(lay, nx);
}

function publishTimeline(lay, nx){
  var ty = lay ? lay.trunkY : 0;
  window.__timeline = {
    view:view, NOW:NOW, W:W, H:Hv, sceneH:H, NOWX:nx, LANE_R:LANE_R, trunkY:ty, Z:Z, panY:panY,
    zoomBy:zoomBy, fit:fitAll,
    pxFor:pxFor, yearForPx:yearForPx, render:renderChart,
    axis:function(){ return AX; }, axisMode:function(){ return axisMode; },
    bins:function(){ return BINS; },
    matchNews:function(item){ return matchNews(item); },
    clearMatch:function(){ return clearMatch(); },
    futuresFor:function(id, n){ return futuresFor(id, n); },
    renderFutures:function(item, fx){ return renderFutures(item, fx); },
    moments:function(){ return MP.model; },
    momentsState:function(){ return MP; },
    momentsZoom:function(g){ momentsZoomAt(g, W / 2); renderChart(); },
    momentsSelectKind:momentsSelectKind, momentsSelectBeat:momentsSelectBeat, momentsSelectPill:momentsSelectPill,
    momentsSelectNews:momentsSelectNews, newsByKey:mpNewsByKey,
    pickerListHtml:function(){ return pickerListHtml(MP.model || momentsModel()); },
    pickerRankHtml:function(){ return pickerRankHtml(MP.model || momentsModel()); },
    pickerTodayHtml:function(){ return pickerTodayHtml(MP.model || momentsModel()); },
    rank:function(upto, add){ return rkRank(MP.model || momentsModel(), upto, add); },
    rankHistory:function(){ return rkHistory(MP.model || momentsModel()); },
    rankCard:function(kind){ return rkCardHtml(MP.model || momentsModel(), kind); },
    rankRace:function(o){ return rkRaceSvg(MP.model || momentsModel(), o); },
    rankWhatIf:function(){ var M = MP.model || momentsModel(); return rkWhatIf(M, rkRank(M)); },
    pickerStoryHtml:function(id){ var M = MP.model || momentsModel(); return M.byId[id] ? pickerStoryHtml(M.byId[id], M) : ""; },
    chainAlign:chainAlign, chainMSA:chainMSA, chainScore:chainScore,
    momentsSelectWorld:momentsSelectWorld, momentsClear:momentsClear,
    litBin:function(){ return litBin; },
    litWorlds:function(){ return litWorlds; },
    real:function(){ return REAL; },
    facetMoments:facetMoments, facetNeighbours:facetNeighbours,
    facetForward:facetForward, facetSim:facetSim,
    visibleYears:function(){ return { from:yearForPx(LANE_R), to:yearForPx(W-12) }; },
    focusYear:function(year, halfSpan){
      view.c = year;
      view.hs = clampSpan(Math.max(halfSpan || 150, 40 + Math.abs(year - NOW) * 0.9));
      renderChart();
    },
    layout:lay,
    lineages:DATA.lineages,
    openWorld:openWorld, closeWorld:closeWorld, clearMatch:function(){ if(typeof clearMatch === "function") clearMatch(); },
    playConvergence:playConvergence
  };
}

/* one world = one branch off the trunk */
function renderBranch(ln, lay, budget, left, right, nx){
  var l = ln.l, y = ln.y, side = ln.side, color = l._g.color, ty = lay.trunkY;
  var g = sEl("g", null, "branch");
  g.setAttribute("data-lane-group", l.id);
  /* Dimming answers two different questions. Normally it is "which world am I
     reading". When a news item is matched, it is "which worlds passed through
     this kind of moment" - and that lights several branches at once, which is
     the whole point of the Moments view. */
  var matching = typeof litBin !== "undefined" && litBin;
  /* nothing chosen: every branch at full strength. Dimming only means something
     against a choice - one world opened, or the worlds a news item matched. */
  var lit = matching ? !!(litWorlds && litWorlds[l.id]) : (!sel || l === sel);
  if(!lit) g.classList.add("dim");
  if(matching ? lit : (sel && l === sel)) g.classList.add("sel");

  var dv = l.divergence.year, evs = l.events;
  var lastYear = dv;
  evs.forEach(function(e){ if(e.year > lastYear) lastYear = e.year; });
  var dxRaw = AX.fork(l), endRaw = AX.end(l);
  var out = side;                                  /* direction away from the trunk */
  var titleY = side < 0 ? y - 8 : y + 17;
  var labelY = side < 0 ? y + 13 : y - 6;

  var halfLane = lay.gap / 2;
  var hitX0 = clamp(dxRaw, left, right);
  var hit = sEl("rect", {x:hitX0, y:y - halfLane, width:Math.max(0, right - hitX0), height:lay.gap}, "hit");
  hit.setAttribute("data-lane", l.id);

  if(AX.mode === "years" && dxRaw > right - 24){
    /* this world has not forked yet in the visible window. In Order mode this
       cannot happen - every world is placed on canvas by construction - so the
       edge marker is a Years-mode affordance. */
    /* The edge marker names a world that has not forked yet in this window. It is
       an affordance for panning, not an identity, so it only appears once there is
       room for it; at the widest zoom it is noise stacked against the edge. */
    var gh = sEl("text", {x:right - 2, y:titleY, "text-anchor":"end",
                          opacity: lay.lod >= 1 ? "1" : "0"}, "ghost");
    gh.textContent = l.title + " forks in " + fmtYearFull(dv) + " →";
    g.appendChild(gh);
    g.appendChild(hit);
    return g;
  }

  var endX = clamp(endRaw, left, right);
  var continues = endRaw > right;
  var flatStart, d, cw = 0;
  if(dxRaw < left){
    flatStart = left;
    d = "M" + left + " " + y + " L" + endX + " " + y;
  } else {
    var cw = Math.min(CURVE_W * Math.sqrt(Z), Math.max(18, endX - dxRaw));
    flatStart = dxRaw + cw;
    d = "M" + dxRaw.toFixed(1) + " " + ty +
        " C" + (dxRaw + cw*0.55).toFixed(1) + " " + ty + "," +
               (dxRaw + cw*0.45).toFixed(1) + " " + y + "," +
               flatStart.toFixed(1) + " " + y;
    if(endX > flatStart) d += " L" + endX.toFixed(1) + " " + y;
  }
  if(dxRaw > left + 1){
    g.appendChild(paintC(sEl("line", {x1:left, y1:ty, x2:Math.min(dxRaw, right), y2:ty}, "shared"), "stroke", color));
  }
  g.appendChild(paintC(sEl("path", {d:d}, "halo"), "stroke", color));
  /* The part of a branch that lies beyond today has not happened, in any
     history: it is drawn dashed. Solid = behind us, dashed = ahead of us. */
  if(lastYear <= NOW || nx >= endX){
    g.appendChild(paintC(sEl("path", {d:d}, "core"), "stroke", color));
  } else if(dv >= NOW || nx <= flatStart || nx <= left){
    g.appendChild(paintC(sEl("path", {d:d}, "core future"), "stroke", color));
  } else {
    var dSolid = (dxRaw < left)
      ? "M" + left + " " + y + " L" + nx.toFixed(1) + " " + y
      : "M" + dxRaw.toFixed(1) + " " + ty +
        " C" + (dxRaw + cw*0.55).toFixed(1) + " " + ty + "," + (dxRaw + cw*0.45).toFixed(1) + " " + y + "," +
        flatStart.toFixed(1) + " " + y + " L" + nx.toFixed(1) + " " + y;
    g.appendChild(paintC(sEl("path", {d:dSolid}, "core"), "stroke", color));
    g.appendChild(paintC(sEl("path", {d:"M" + nx.toFixed(1) + " " + y + " L" + endX.toFixed(1) + " " + y}, "core future"), "stroke", color));
  }

  if(continues){
    g.appendChild(paintC(sEl("path", {
      d:"M" + (right+3) + " " + (y-4) + " L" + (right+8) + " " + y + " L" + (right+3) + " " + (y+4),
      fill:"none", "stroke-width":"1.6"}, "continues"), "stroke", color));
  } else if(endX > flatStart + 2 || dxRaw < left){
    g.appendChild(paintC(sEl("circle", {cx:endX, cy:y, r:3.4}, "cap"), "stroke", color));
  }
  if(dxRaw >= left){
    g.appendChild(paintC(sEl("circle", {cx:dxRaw, cy:ty, r:3.8}, "fork"), "fill", color));
  }
  if(dv < NOW && lastYear > NOW && nx > flatStart && nx < endX){
    g.appendChild(sEl("circle", {cx:nx, cy:y, r:2.8}, "cross"));
  }

  /* title, sitting just past the fork on the outer side */
  var shown = l.title.length > 34 ? l.title.slice(0,33) + "\u2026" : l.title;
  var subText = mediumLabel(l.medium) + " \u00b7 forks " + fmtYearFull(dv) + " \u00b7 " + evs.length + " events";
  var titleW = shown.length * 6.4 + subText.length * 5.3 + 10;
  var tx = Math.max(left + 4, flatStart + 6);
  var tAttrs = {x:tx, y:titleY};
  /* a name that would sit on its archetype's heading moves along past it */
  (lay.bundles || []).forEach(function(b){
    var ly = b.y0 - 7, lw = (b.g.name.length + 4) * 7.6;
    if(Math.abs(titleY - ly) < 12 && tAttrs.x < left - 14 + lw + 8) tAttrs.x = left - 14 + lw + 8;
  });
  if(tAttrs.x + titleW > right){ tAttrs.x = right - 2; tAttrs["text-anchor"] = "end"; }  /* forks near the right edge hang their title off it */
  /* A branch title needs roughly a lane's worth of vertical room. At the widest
     zoom the pitch is about 16px, so every title would sit on top of the next
     one and the middle of the chart turned into a wall of words. Below that
     threshold only the selected and hovered branches name themselves; the rest
     are identified by the panel and by hovering. */
  /* names stay on at a tighter pitch in a smaller type: a branch nobody can
     name is a line, not a world */
  var titleFits = lay.gap >= 11;
  var compactTitle = lay.gap < 19;
  var showTitle = titleFits || l === sel || l.id === hoverId;
  if(showTitle){
    var tt = sEl("text", tAttrs, "title" + (compactTitle ? " compact" : ""));
    /* tagged so a test can assert every world is named, which is the thing
       that matters - not how many text nodes the axis happens to draw */
    tt.setAttribute("data-lane-title", l.id);
    tt.textContent = shown + "  ";
    if(lay.lod >= 1 && !compactTitle){
      var sub = sEl("tspan", null, "sub");
      sub.textContent = subText;
      tt.appendChild(sub);
    }
    g.appendChild(tt);
  }

  /* events on the branch */
  var onBranch = evs.filter(function(e){ return e.year >= dv; });
  var chosen = onBranch.map(function(e){
    return { e:e, score:(e.importance||1)*1000 - Math.abs(e.year - view.c)/400 };
  }).filter(function(o){ var x = AX.x(l, o.e); return x >= left - 4 && x <= right + 4; })
    .sort(function(a,b){ return b.score - a.score; });
  var budgetLeft = (lay.lod >= 2 || l === sel || l.id === hoverId) ? budget : 0;
  chosen.forEach(function(o){
    if(budgetLeft <= 0) return;
    if((o.e.importance||1) < 2 && budgetLeft < budget/2) return;
    o.want = true; budgetLeft--;
  });

  onBranch.forEach(function(e){
    var x = AX.x(l, e);
    if(x < left - 2 || x > right + 2) return;
    var imp = e.importance || 1;
    var r = (imp >= 3 ? 4.4 : imp === 2 ? 3.2 : 2.1) * lay.nodeScale;
    g.appendChild(sEl("circle", {cx:x, cy:y, r:r, fill: "var(--chart-ghost)"}, "node" + (imp < 2 ? " minor" : "")));
    if(overtaken(e)) g.appendChild(sEl("circle", {cx:x, cy:y, r:r + 3.6}, "flag"));
  });

  chosen.filter(function(o){ return o.want; })
        .sort(function(a,b){ return a.e.year - b.e.year; })
        .forEach(function(o){
    var e = o.e, x = AX.x(l, e);
    var title = e.title || "";
    if(title.length > 40) title = title.slice(0,39) + "…";
    var yr = fmtYearFull(e.year);
    var tw = title.length*5.6 + yr.length*5.8 + 14;
    var flip = (x + 6 + tw > right);
    var ax = flip ? x - 6 : x + 6;
    var x0 = flip ? ax - tw : ax;
    var row = -1;
    if(claimRoom(l.id + "/ev", x0, x0 + tw)) row = 0;
    if(row < 0) return;
    var ly = labelY;
    var t = sEl("text", {x:ax, y:ly, "text-anchor": flip ? "end" : "start"}, "ev-label");
    var ys = sEl("tspan", null, "yr"); ys.textContent = yr + "  ";
    t.appendChild(ys);
    var ts = sEl("tspan"); ts.textContent = title;
    t.appendChild(ts);
    g.appendChild(t);
  });

  g.appendChild(hit);
  onBranch.forEach(function(e){
    var x = AX.x(l, e);
    if(x < left - 2 || x > right + 2) return;
    var cir = sEl("circle", {cx:x, cy:y, r:8, fill:"transparent", "pointer-events":"all"});
    cir.setAttribute("data-ev", l.id + "|" + evs.indexOf(e));
    cir.style.cursor = "pointer";
    g.appendChild(cir);
  });
  return g;
}

/* events before a world's fork are real history it leans on: they sit on the
   trunk, nudged toward the side that world lives on */
function renderPrehistory(ln, lay, host, left, right){
  var l = ln.l, ty = lay.trunkY, color = l._g.color, dv = l.divergence.year;
  var g = sEl("g");
  if(sel && l !== sel) g.setAttribute("opacity", "0.25");
  var any = false;
  l.events.forEach(function(e, i){
    if(e.year >= dv) return;
    var x = AX.x(l, e);
    if(x < left - 2 || x > right + 2) return;
    any = true;
    var cy = ty + ln.side * 7;
    g.appendChild(paintC(sEl("circle", {cx:x, cy:cy, r:(e.importance||1) >= 3 ? 2.8 : 2.1}, "node"), "fill", color));
    var cir = sEl("circle", {cx:x, cy:cy, r:7, fill:"transparent", "pointer-events":"all"});
    cir.setAttribute("data-ev", l.id + "|" + i);
    cir.style.cursor = "pointer";
    g.appendChild(cir);
  });
  if(any) host.appendChild(g);
}
