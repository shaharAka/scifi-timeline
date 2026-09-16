/* ============================================================ chrome */

function renderChips(){
  var host = document.getElementById("chips");
  host.innerHTML = "";
  DATA.groups.forEach(function(g){
    var n = DATA.lineages.filter(function(l){ return l.group === g.id; }).length;
    var c = document.createElement("button");
    c.className = "chip" + (groupOn[g.id] ? "" : " off");
    c.innerHTML = '<span class="dot" style="background:' + g.color + ';color:' + g.color + '"></span>' + esc(g.name) +
      ' <span style="opacity:.6">' + n + '</span>';
    c.title = g.question || "";
    c.onclick = function(){
      groupOn[g.id] = !groupOn[g.id];
      refresh();
    };
    host.appendChild(c);
  });
}

var DEFAULT_ERAS = [
  {label:"Around now", from:1830, to:2150},
  {label:"Divergence era", from:1900, to:2100},
  {label:"Next millennia", from:-1000, to:5000},
  {label:"Full reach", from:-46000, to:50000},
  {label:"Deep past", from:-48000, to:2000}
];
function eras(){
  var e = ATLAS && ATLAS.eras;
  return (e && e.length) ? e : DEFAULT_ERAS;
}
function homeEra(){
  var list = eras(), i = (ATLAS && ATLAS.defaultEra) || 0;
  return list[Math.min(list.length - 1, Math.max(0, i))];
}

function renderEras(){
  var host = document.getElementById("eras");
  host.innerHTML = "";
  var home = homeEra();
  eras().forEach(function(p){
    var b = document.createElement("button");
    b.className = "era small" + (p === home ? " on" : "");
    b.textContent = p.label;
    b.setAttribute("data-a", p.from); b.setAttribute("data-b", p.to);
    b.onclick = function(){
      Array.prototype.forEach.call(host.querySelectorAll(".era"), function(x){ x.classList.remove("on"); });
      b.classList.add("on");
      setDomain(p.from, p.to);
    };
    host.appendChild(b);
  });
}

function setDomain(a, b){
  tweenTo((a + b) / 2, Math.max(SPAN_MIN, (b - a) / 2), null, CAM_MS);
}

/* --- camera ---------------------------------------------------------------- */

/* zoom by factor g (>1 zooms out) keeping the point (mx,my) fixed on screen;
   the time window and the lane pitch move together so the tree behaves like
   one picture */
function zoomAt(g, mx, my, ms){
  var at = yearForPx(mx);
  var old = view.hs;
  var hs1 = clampSpan(view.hs * g);
  var gh = hs1 / old;
  var c1 = Math.max(-OFF_CAP, Math.min(OFF_CAP, at + (view.c - at) * gh));
  /* Lane pitch moves with the zoom, because the tree should behave like one
     picture. panY is NOT re-anchored to the cursor here: doing that while Z also
     changes drove the content off the top of the viewport on the first wheel
     step. Vertical framing is fit()'s job; zoom only changes the pitch. */
  var Zn = clamp(Z / g, Z_MIN, Z_MAX);
  var pan1 = panY;
  if(ms){
    var c0 = view.c, h0 = view.hs, z0 = Z, p0 = panY, t0 = performance.now();
    cancelAnimationFrame(camRaf);
    (function step(now){
      var p = Math.min(1, (now - t0) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      view.c = c0 + (c1 - c0) * e;
      view.hs = h0 + (hs1 - h0) * e;
      Z = z0 + (Zn - z0) * e;
      panY = p0 + (pan1 - p0) * e;
      renderChart();
      if(p < 1) camRaf = requestAnimationFrame(step);
    })(t0);
    return;
  }
  view.c = c1; view.hs = hs1; Z = Zn; panY = pan1;
  renderChart();
}
/* Zoom about the TODAY line, not about the viewport centre.
   The centre of a 100,000-year window is early history, where almost nothing
   happens; every world forks within a couple of centuries of the present. So
   zooming toward the centre pushed the content off the right edge while
   magnifying empty space, which read as the chart falling apart. Anchoring on
   today means zooming in actually magnifies the part being looked at. */
function zoomBy(g, ms){
  if(axisMode === "moments"){
    if(MP.cy){ MP.cy.zoom({ level: MP.cy.zoom() / g, renderedPosition: { x: MP.cy.width() / 2, y: MP.cy.height() / 2 } }); }
    else { momentsZoomAt(1 / g, W / 2, Hv / 2); renderChart(); }
    return;
  }
  var nx = pxFor(NOW);
  var ax = (nx >= LANE_R && nx <= W - 12) ? nx : (LANE_R + (W - 12)) / 2;
  zoomAt(g, ax, Hv / 2, ms);
}

/* fit: the home era, and a zoom that puts the whole tree in the viewport */
/* Open on the WHOLE tree: every world visible at once, at the smallest lane
   pitch, so the first thing you see is the shape of the argument. Zooming in
   from here is the reader's move, not the page's. */
function fitEverything(){
  view.c = (ATLAS_FULL.from + ATLAS_FULL.to) / 2;
  view.hs = clampSpan((ATLAS_FULL.to - ATLAS_FULL.from) / 2);
  var lay0 = layout(visibleLineages());
  Z = clamp((Hv - 12) / Math.max(1, lay0.height1), Z_MIN, 1.15);
  panY = 0;
  renderChart();
  var host = document.getElementById("eras");
  if(host) Array.prototype.forEach.call(host.querySelectorAll(".era"), function(x){
    x.classList.remove("on");
  });
}

/* Camera moves are tweened, not snapped: a jump reads as a redraw, a tween
   reads as moving. Reduced-motion users get the destination directly. */
var camRaf = 0;
function tweenTo(c, hs, z, ms){
  if(REDUCED || !ms){ view.c = c; view.hs = hs; if(z != null) Z = z; renderChart(); return; }
  cancelAnimationFrame(camRaf);
  var c0 = view.c, h0 = view.hs, z0 = Z;
  var hs1 = clampSpan(hs), z1 = (z == null ? z0 : clamp(z, Z_MIN, 1.15));
  var t0 = performance.now();
  (function step(now){
    var p = Math.min(1, (now - t0) / ms);
    var e = 1 - Math.pow(1 - p, 3);
    view.c = c0 + (c - c0) * e;
    view.hs = h0 + (hs1 - h0) * e;
    Z = z0 + (z1 - z0) * e;
    renderChart();
    if(p < 1) camRaf = requestAnimationFrame(step);
  })(t0);
}

/* Fit the tree. Both modes want the same vertical framing - the whole tree in
   the viewport at the smallest lane pitch that holds it - and only Years has a
   time span to set. In Order mode x is sequence and always fills the width, so
   touching view.c/hs there would mean nothing. */
function fitAll(){
  if(axisMode === "moments"){
    momentsFit(); renderChart();
    if(MP.cy) mpCyFit(36);
    return;
  }
  var lay = layout(visibleLineages());
  Z = clamp((Hv - 12) / Math.max(1, lay.height1), Z_MIN, 1.15);
  panY = 0;
  if(axisMode === "years"){
    var h = homeEra();
    view.c = (h.from + h.to) / 2;
    view.hs = clampSpan((h.to - h.from) / 2);
    var host = document.getElementById("eras");
    if(host) Array.prototype.forEach.call(host.querySelectorAll(".era"), function(x, i){
      x.classList.toggle("on", eras()[i] === h);
    });
  }
  renderChart();
}

/* --- the panel --------------------------------------------------------------- */

/* The panel holds two different things: the news list, and the reading of one
   moment forward by situation. Its heading has to say which, and the heading in
   the template describes only the first - a situation panel under "On today's
   timeline" is describing something it is not. */
function updatePanelCopy(){
  var head = document.getElementById("news-head");
  var hint = document.getElementById("news-hint");
  if(!head) return;
  var host = document.getElementById("news-list");
  var situ = host && host.querySelector(".fx-head");
  if(situ){
    var t = situ.querySelector("h3");
    head.textContent = t ? t.textContent : "This moment";
    if(hint) hint.textContent = "The nearest situations in other worlds by "
      + "signature, with outcomes held out, and what followed each there.";
  } else {
    head.textContent = "On today's timeline";
    if(hint) hint.textContent = "Real events that touch these worlds. Each one is "
      + "marked on the today line, where a fiction's future and our present meet.";
  }
}

function setPanel(mode){
  panelMode = mode || "";
  if(panelMode === "news") updatePanelCopy();
  var d = document.getElementById("drawer");
  d.setAttribute("data-mode", panelMode);
  d.classList.toggle("open", !!panelMode);
  ["index","news","world","about","moments"].forEach(function(m){
    var el = document.getElementById("panel-" + m);
    if(el) el.classList.toggle("on", m === panelMode);
  });
  var bw = document.getElementById("btn-worlds"), ba = document.getElementById("btn-about");
  var bn = document.getElementById("btn-news");
  if(bw) bw.classList.toggle("on", panelMode === "index");
  if(bn) bn.classList.toggle("on", panelMode === "news");
  if(ba) ba.classList.toggle("on", panelMode === "about");
  if(panelMode) d.scrollTop = 0;
  if(axisMode === "moments" && typeof renderMomentsPage === "function" && !setPanel._busy){
    setPanel._busy = true;
    try{ renderChart(); } finally { setPanel._busy = false; }
  }
}
function togglePanel(mode){ setPanel(panelMode === mode ? "" : mode); }

/* Page copy comes from data/atlas.json so the viewer stays generic. Anything
   missing keeps the text baked into the template. */
function setText(id, html){
  var el = document.getElementById(id);
  if(el && html) el.innerHTML = html;
}
function renderAtlasCopy(){
  if(!ATLAS) return;
  if(ATLAS.title){ document.title = ATLAS.title; }
  if(ATLAS.headline){
    setText("hero-title", esc(ATLAS.headline) +
      (ATLAS.headlineAccent ? ' <span class="accent">' + esc(ATLAS.headlineAccent) + '</span>' : ''));
    setText("brand", '<span class="brand-a">' + esc(ATLAS.headline) + '</span> ' +
      (ATLAS.headlineAccent ? '<span class="brand-b">' + esc(ATLAS.headlineAccent) + '</span>' : ''));
  }
  if(ATLAS.lede) setText("hero-lede", mark(ATLAS.lede));
  if(ATLAS.legendHint) setText("legend-hint", esc(ATLAS.legendHint));
  var s = ATLAS.sections || {};
  if(s.worlds) setText("sec-worlds-blurb", mark(s.worlds.blurb));
  if(ATLAS.notes && ATLAS.notes.paragraphs){
    setText("notes", '<h3>' + esc(ATLAS.notes.heading || "Notes") + '</h3>' +
      ATLAS.notes.paragraphs.map(function(p){ return '<p>' + mark(p) + '</p>'; }).join(""));
  }
}



/* Inline markup uses the archetype's single accessible value. */
function colorVars(hex){
  return "--c-light:var(--g-" + String(hex).replace("#","") + "-light)";
}


/* ============================================================ axis toggle */
/* Order is the default; Years is the evidence view. Switching rebuilds the
   axis and re-renders - nothing about the data changes. */
function setAxis(mode, persist){
  axisMode = (mode === "years" || mode === "moments") ? mode : "order";
  Array.prototype.forEach.call(document.querySelectorAll(".ax"), function(b){
    b.classList.toggle("on", b.getAttribute("data-axis") === axisMode);
  });
  /* Horizontal zoom and pan have no meaning when x is sequence, so the
     calendar controls are disabled rather than hidden: a control that vanishes
     looks like a bug, a greyed one explains itself. */
  var blocked = (axisMode !== "years");
  ["eras", "zoom"].forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle("disabled", blocked);
    el.setAttribute("aria-disabled", blocked ? "true" : "false");
  });
  if(persist){ try{ localStorage.setItem("scifi-timeline-axis", axisMode); }catch(e){} }
  /* Each mode needs its own framing. Years fits the whole calendar - fitting
     only the home era at 1958-2042 hides almost every fork, which looks like
     the switch broke the chart. Order and Moments both fill the width and need
     only a vertical fit: their x is not a quantity to zoom. */
  if(typeof document !== "undefined" && document.body && document.body.classList){
    document.body.classList.toggle("mode-moments", axisMode === "moments");
  }
  if(axisMode === "moments"){ momentsFit(); renderChart(); renderMomentsPanel(); if(panelMode === "" || panelMode === "news") setPanel("moments"); }
  else if(axisMode === "years") fitEverything();
  else fitAll();
}

function renderAxisToggle(){
  var buttons = document.querySelectorAll(".ax");
  if(!buttons.length) return;
  Array.prototype.forEach.call(buttons, function(b){
    b.onclick = function(){ setAxis(b.getAttribute("data-axis"), true); };
  });
  var stored = null;
  try{ stored = localStorage.getItem("scifi-timeline-axis"); }catch(e){}
  setAxis(stored || axisMode, false);
}

function on(id, evt, fn){ var el = document.getElementById(id); if(el) el[evt] = fn; }

function init(){
  DATA.groups.forEach(function(g){ groupOn[g.id] = true; });
  NOW = new Date().getFullYear();

  renderAtlasCopy();
  renderAxisToggle();
  renderStats();
  renderEras();
  renderChips();
  renderTags();
  W = measureW(); Hv = measureH();
  /* Open on the fork cluster, where the argument is legible; the whole dataset
     is one preset away (Full reach). Opening on everything squashed twenty
     forks into a hundred pixels and hid the grouping. */
  if(axisMode === "moments"){ momentsFit(); renderChart(); if(MP.cy) mpCyHome(); }
  else fitAll();
  renderCards();

  on("zin", "onclick", function(){ zoomBy(0.7, CAM_MS); });
  on("zout", "onclick", function(){ zoomBy(1.4, CAM_MS); });
  on("reset", "onclick", function(){ fitAll(); });
  on("zoom", "oninput", function(){
    var target = clampSpan(SPAN_MIN * Math.pow(SPAN_MAX/SPAN_MIN, Number(this.value)/1000));
    zoomBy(target / view.hs, 0);
  });
  on("find", "oninput", function(){
    q = this.value.trim().toLowerCase();
    refresh();
  });
  on("sort", "onchange", function(){ renderChart(); renderCards(); animateLayout(); });
  on("converge", "onclick", playConvergence);
  var ab = document.getElementById("allev");
  ab.onclick = function(){
    showAllEvents = !showAllEvents;
    ab.classList.toggle("on", showAllEvents);
    ab.textContent = showAllEvents ? "Fewer labels" : "Show all event labels";
    renderChart();
  };
  on("btn-worlds", "onclick", function(){ togglePanel("index"); });
  on("btn-news", "onclick", function(){ renderNews(); togglePanel("news"); });
  on("btn-about", "onclick", function(){ togglePanel("about"); });
  on("pclose-index", "onclick", function(){ setPanel(""); });
  on("pclose-about", "onclick", function(){ setPanel(""); });
  on("pclose-moments", "onclick", function(){ setPanel(""); });

  window.addEventListener("resize", function(){
    if(measureW() !== W || measureH() !== Hv){
      renderChart();
      if(activeTab === "chronology" && sel){
        var s = document.getElementById("dchart");
        if(s) drawMini(s, sel, sel._g.color);
      }
    }
  });

  document.addEventListener("keydown", function(e){
    if(e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var step = view.hs * 0.16;
    if(e.key === "ArrowLeft"){ view.c -= step; renderChart(); }
    else if(e.key === "ArrowRight"){ view.c += step; renderChart(); }
    else if(e.key === "ArrowUp"){ panY += 80; renderChart(); }
    else if(e.key === "ArrowDown"){ panY -= 80; renderChart(); }
    else if(e.key === "+" || e.key === "="){ zoomBy(0.7); }
    else if(e.key === "-" || e.key === "_"){ zoomBy(1.4); }
    else if(e.key === "0"){ fitAll(); }
    else if(e.key === "Escape"){ if(sel) closeWorld(); else setPanel(""); }
  });

  revealIn();
  growIn();
}
