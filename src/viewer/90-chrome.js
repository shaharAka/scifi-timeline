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
  view.c = (a + b) / 2;
  view.hs = clampSpan(Math.max(SPAN_MIN, (b - a) / 2));
  renderChart();
}

/* --- camera ---------------------------------------------------------------- */

/* zoom by factor g (>1 zooms out) keeping the point (mx,my) fixed on screen;
   the time window and the lane pitch move together so the tree behaves like
   one picture */
function zoomAt(g, mx, my){
  var at = yearForPx(mx);
  var old = view.hs;
  view.hs = clampSpan(view.hs * g);
  var gh = view.hs / old;
  view.c = at + (view.c - at) * gh;
  view.c = Math.max(-OFF_CAP, Math.min(OFF_CAP, view.c));
  var Zn = clamp(Z / g, Z_MIN, Z_MAX);
  var ys1 = (my - panY) / Z;         /* scene y at zoom 1 under the cursor */
  panY = my - ys1 * Zn;
  Z = Zn;
  renderChart();
}
function zoomBy(g){ zoomAt(g, anchorX(), Hv / 2); }

/* fit: the home era, and a zoom that puts the whole tree in the viewport */
function fitAll(){
  var h = homeEra();
  view.c = (h.from + h.to) / 2;
  view.hs = clampSpan((h.to - h.from) / 2);
  var lay = layout(visibleLineages());
  Z = clamp((Hv - 12) / Math.max(1, lay.height1), Z_MIN, 1.15);
  panY = 0;
  renderChart();
  var host = document.getElementById("eras");
  if(host) Array.prototype.forEach.call(host.querySelectorAll(".era"), function(x, i){
    x.classList.toggle("on", eras()[i] === h);
  });
}

/* --- the panel --------------------------------------------------------------- */

function setPanel(mode){
  panelMode = mode || "";
  var d = document.getElementById("drawer");
  d.setAttribute("data-mode", panelMode);
  d.classList.toggle("open", !!panelMode);
  ["index","world","about"].forEach(function(m){
    var el = document.getElementById("panel-" + m);
    if(el) el.classList.toggle("on", m === panelMode);
  });
  var bw = document.getElementById("btn-worlds"), ba = document.getElementById("btn-about");
  if(bw) bw.classList.toggle("on", panelMode === "index");
  if(ba) ba.classList.toggle("on", panelMode === "about");
  if(panelMode) d.scrollTop = 0;
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

function on(id, evt, fn){ var el = document.getElementById(id); if(el) el[evt] = fn; }

function init(){
  DATA.groups.forEach(function(g){ groupOn[g.id] = true; });
  NOW = new Date().getFullYear();

  renderAtlasCopy();
  renderStats();
  renderEras();
  renderChips();
  renderTags();
  W = measureW(); Hv = measureH();
  fitAll();
  renderCards();

  on("zin", "onclick", function(){ zoomBy(0.7); });
  on("zout", "onclick", function(){ zoomBy(1.4); });
  on("reset", "onclick", fitAll);
  on("zoom", "oninput", function(){
    var target = clampSpan(SPAN_MIN * Math.pow(SPAN_MAX/SPAN_MIN, Number(this.value)/1000));
    zoomBy(target / view.hs);
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
  on("btn-about", "onclick", function(){ togglePanel("about"); });
  on("pclose-index", "onclick", function(){ setPanel(""); });
  on("pclose-about", "onclick", function(){ setPanel(""); });

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
