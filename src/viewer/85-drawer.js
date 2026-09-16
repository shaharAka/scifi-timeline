/* ============================================================ world drawer */

function openWorld(id){
  var l = DATA.lineages.filter(function(x){ return x.id === id; })[0];
  if(!l) return;
  sel = l;
  /* always land on the world pane: arriving at a new world with the previous
     world's tab still selected is disorienting */
  activeTab = "world";
  renderChart();
  renderDrawer();
  setPanel("world");
  markCard();
}

function closeWorld(){
  sel = null;
  renderChart();
  setPanel(panelMode === "world" ? "index" : panelMode);
  markCard();
}

function markCard(){
  Array.prototype.forEach.call(document.querySelectorAll("#cards .card"), function(c){
    c.classList.toggle("on", !!sel && c.getAttribute("data-lid") === sel.id);
  });
}

function renderDrawer(){
  var d = document.getElementById("panel-world");
  if(!d) return;
  if(!sel){ d.innerHTML = ""; return; }
  var l = sel, w = l._w || {}, g = l._g;
  var tabs = [["world","The world"],["chronology","Full chronology"],["where","Where to start"]];
  d.innerHTML =
    '<div class="phead"><button class="ghost" id="dback">&larr; All worlds</button>' +
      '<button class="ghost" id="dclose">Close</button></div>' +
    '<div class="dhead"><div>' +
      '<h2 class="dtitle">' + esc(l.title) + '</h2>' +
      '<div class="dmeta">' +
        '<span class="pill" style="border-color:' + g.color + ';color:' + g.color + '">' + esc(g.name) + '</span>' +
        '<span>' + mediumLabel(l.medium) + '</span><span>&middot;</span>' +
        '<span>' + esc(l.creator || '') + '</span><span>&middot;</span>' +
        '<span>first released ' + esc(l.originYear || '?') + '</span><span>&middot;</span>' +
        '<span>' + esc(l.franchiseStatus || '') + '</span>' +
        (l.epoch ? '<span>&middot;</span><span class="pill">' +
          (l.epoch === 'deep-past' ? 'set in the deep past' :
           l.epoch === 'far-future' ? 'projects into the far future' :
           'runs alongside the present') + '</span>' : '') +
        (w.spoilerLevel && w.spoilerLevel !== 'none'
          ? '<span>&middot;</span><span class="pill" style="color:var(--flag);border-color:#6b5a20">spoilers: ' +
            esc(w.spoilerLevel) + '</span>' : '') +
      '</div>' +
    '</div></div>' +
    '<div class="tabs">' + tabs.map(function(t){
      return '<div class="tab' + (activeTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' +
        t[1] + '</div>';
    }).join("") + '</div>' +
    '<div class="panes" id="panes">' + paneHtml(l, w) + '</div>';

  var cb = document.getElementById("dclose");
  if(cb) cb.onclick = function(){ sel = null; renderChart(); setPanel(""); markCard(); };
  var bb = document.getElementById("dback");
  if(bb) bb.onclick = closeWorld;
  Array.prototype.forEach.call(d.querySelectorAll(".tab"), function(t){
    t.onclick = function(){ activeTab = t.getAttribute("data-tab"); renderDrawer(); };
  });
  Array.prototype.forEach.call(d.querySelectorAll("[data-goto]"), function(n){
    n.onclick = function(){ openWorld(n.getAttribute("data-goto")); };
  });
  Array.prototype.forEach.call(d.querySelectorAll("[data-tag]"), function(n){
    n.onclick = function(){
      var t = n.getAttribute("data-tag");
      tagFilter = (tagFilter === t) ? null : t;
      refresh();
    };
  });
  if(activeTab === "chronology"){
    var svg = document.getElementById("dchart");
    if(svg) drawMini(svg, l, g.color);
  }
  revealIn();
}

function paneHtml(l, w){
  if(activeTab === "chronology") return chronologyPane(l);
  if(activeTab === "where") return wherePane(l, w);
  return worldPane(l, w);
}

function worldPane(l, w){
  if(!w || !w.setting){
    return '<div class="pane on"><p style="color:var(--ink-3);font-size:13px">' +
      'No dossier has been written for this world yet &mdash; only its chronology is charted.</p>' +
      deltaHtml(l) + '</div>';
  }
  var themes = (w.themes || []).map(function(t){ return '<span class="tag">' + esc(t) + '</span>'; }).join(" ");
  var tags = (w.tags || []).map(function(t){
    return '<span class="tag" data-tag="' + esc(t) + '" style="cursor:pointer">#' + esc(t) + '</span>'; }).join(" ");
  return '<div class="pane on"><div class="dgrid"><div>' +
      '<div class="prose">' +
        '<p>' + esc(w.setting) + '</p>' +
        '<p><b>The conflict underneath it.</b> ' + esc(w.conflict || '') + '</p>' +
      '</div>' +
      '<dl class="factlist">' +
        (w.politics ? '<div class="fact"><dt>Power</dt><dd>' + esc(w.politics) + '</dd></div>' : '') +
        (w.technology ? '<div class="fact"><dt>Technology</dt><dd>' + esc(w.technology) + '</dd></div>' : '') +
        (w.mood ? '<div class="fact"><dt>Register</dt><dd>' + esc(w.mood) + '</dd></div>' : '') +
        '<div class="fact"><dt>Themes</dt><dd>' + themes + '</dd></div>' +
        '<div class="fact"><dt>Tags</dt><dd>' + tags + '</dd></div>' +
      '</dl>' + deltaHtml(l) +
    '</div><div>' +
      tileSection("Places that matter", w.locations) +
      tileSection("Who holds power", w.factions) +
      connectionsHtml(w) +
    '</div></div></div>';
}

function deltaHtml(l){
  var dv = l.divergence;
  return '<div class="delta" style="border-color:' + l._g.color + ';margin-top:14px">' +
    '<span class="dl">Breaks from our history in ' + fmtYearFull(dv.year) + '</span>' +
    esc(dv.delta || '') +
    (dv.note ? '<div style="font-size:11.5px;color:var(--ink-3);margin-top:7px;font-style:italic">' +
      esc(dv.note) + '</div>' : '') +
    (l.groupingNote ? '<div style="font-size:11.5px;color:var(--ink-3);margin-top:7px">' +
      '<b style="color:var(--ink-2)">Why it sits in this archetype.</b> ' + esc(l.groupingNote) + '</div>' : '') +
    '</div>';
}

function tileSection(title, items){
  if(!items || !items.length) return "";
  return '<div class="tierlabel">' + title + '</div><div class="tilegrid">' +
    items.map(function(x){
      return '<div class="tile"><div class="n">' + esc(x.name) + '</div>' +
             '<div class="b">' + esc(x.blurb || '') + '</div></div>';
    }).join("") + '</div>';
}

function connectionsHtml(w){
  var conns = w.connections || [];
  if(!conns.length) return "";
  return '<div class="tierlabel">Connects to</div><div class="tilegrid">' +
    conns.map(function(c){
      var other = DATA.lineages.filter(function(x){ return x.id === c.id; })[0];
      var nm = other ? other.title : c.id;
      var col = other ? other._g.color : "#5f7cc4";
      return '<div class="tile link" data-goto="' + esc(c.id) + '">' +
        '<div class="n" style="color:' + col + '">' + esc(nm) + ' &rarr;</div>' +
        '<div class="b">' + esc(c.note || '') + '</div></div>';
    }).join("") + '</div>';
}

function chronologyPane(l){
  var rows = l.events.map(function(e){
    return '<tr><td class="y">' + fmtYearFull(e.year) + '</td>' +
      '<td class="t">' + esc(e.title) +
        (e.inUniverse ? '<span class="iu">in-universe: ' + esc(e.inUniverse) + '</span>' : '') + '</td>' +
      '<td>' + esc(e.description || '') +
        (e.note ? '<span class="enote">' + esc(e.note) + '</span>' : '') + '</td>' +
      '<td><span class="tier">' + esc(e.tier) + ' · ' + esc(e.phase) + '</span><br>' +
        '<span class="conf ' + esc(e.confidence) + '">' + esc(e.confidence) + '</span></td></tr>';
  }).join("");
  return '<div class="pane on"><svg id="dchart"></svg>' +
    '<div class="tierlabel">All ' + l.events.length + ' charted events</div>' +
    '<table class="ev"><thead><tr><th>Real year</th><th>Event</th><th>What happens</th>' +
    '<th>Tier</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function wherePane(l, w){
  var starts = (w.whereToStart || []);
  var body = starts.length
    ? '<div class="tilegrid">' + starts.map(function(s, i){
        return '<div class="tile"><div class="n">' + (i === 0 ? '★ ' : '') + esc(s.title) +
          ' <span style="color:var(--ink-3);font-weight:400">' + esc(s.year) + ' · ' +
          esc(mediumLabel(s.medium)) + '</span></div>' +
          '<div class="b">' + esc(s.blurb || '') + '</div></div>';
      }).join("") + '</div>'
    : '<p style="color:var(--ink-3);font-size:13px">No entry points recorded yet.</p>';
  return '<div class="pane on">' +
    '<div class="tierlabel">Where to begin' + (starts.length ? ' — most accessible first' : '') + '</div>' +
    body + deltaHtml(l) + '</div>';
}

function revealIn(){
  if(REDUCED) return;
  Array.prototype.forEach.call(
    document.querySelectorAll("#drawer .pane, .stat"),
    function(n){
      if(n.classList.contains("in")) return;
      n.classList.add("reveal");
      requestAnimationFrame(function(){ n.classList.add("in"); });
    });
}

/* ============================================================ mini chart */
/* The drawer's own branch: the same grammar as the big chart, one world. */

function drawMini(svg, l, color){
  var box = svg.parentElement;
  var w = Math.max(320, (box ? box.clientWidth : 600) - 8);
  var h = 158;
  svg.setAttribute("viewBox", "0 0 " + w + " " + h);
  svg.setAttribute("width", w); svg.setAttribute("height", h);
  while(svg.firstChild) svg.removeChild(svg.firstChild);

  var evs = l.events;
  if(!evs.length) return;
  var dv = l.divergence.year;
  var lo = Math.min(evs[0].year, dv), hi = Math.max(evs[evs.length-1].year, dv, NOW);
  var pre = evs.some(function(e){ return e.year < dv; });

  /* Two log-compressed segments joined at the fork, so a world that leans on
     an event two billion years ago still shows its own branch at full width:
     the trunk before the fork gets a fixed share, the branch gets the rest. */
  var x0 = 22, x1 = w - 22, split = x0 + (x1 - x0) * (pre ? 0.3 : 0.12);
  var L = Math.max(1, dv - lo), R = Math.max(8, hi - dv);
  function X(y){
    if(y <= dv) return x0 + (split - x0) * (1 - warp(dv - y) / warp(L + Math.max(8, L*0.08)));
    return split + (x1 - split) * (warp(y - dv) / warp(R + Math.max(8, R*0.08)));
  }
  var ty = 96, by = 62, dx = X(dv), nx = X(NOW);
  var trunkEnd = Math.max(22, Math.min(nx, w - 22));

  svg.appendChild(sEl("line", {x1:22, y1:ty, x2:trunkEnd, y2:ty}, "trunk-glow"));
  svg.appendChild(sEl("line", {x1:22, y1:ty, x2:trunkEnd, y2:ty}, "trunk-core"));
  if(trunkEnd < w - 23) svg.appendChild(sEl("line", {x1:trunkEnd, y1:ty, x2:w-22, y2:ty}, "trunk-future"));

  var cw = Math.min(60, Math.max(20, (w - 22) - dx));
  var d = "M" + dx + " " + ty + " C" + (dx + cw*0.55) + " " + ty + "," + (dx + cw*0.45) + " " + by + "," +
          (dx + cw) + " " + by + " L" + (w - 22) + " " + by;
  var g = sEl("g", null, "branch");
  g.appendChild(sEl("path", {d:d, stroke:color}, "halo"));
  g.appendChild(sEl("path", {d:d, stroke:color}, "core"));
  g.appendChild(sEl("circle", {cx:dx, cy:ty, r:3.8, fill:color}, "fork"));
  svg.appendChild(g);

  svg.appendChild(sEl("line", {x1:nx, y1:14, x2:nx, y2:h-24}, "now-line"));
  var nt = sEl("text", {x:nx, y:11, "text-anchor":"middle"}, "nowcap");
  nt.textContent = "TODAY"; svg.appendChild(nt);

  var above = [], below = [];
  evs.forEach(function(e){
    if(e.year < l.divergence.year){ below.push(e); return; }
    above.push(e);
  });
  above.forEach(function(e, i){
    var x = X(e.year), up = (i % 2 === 0);
    var yy = up ? by - 30 : by + 26;
    g.appendChild(sEl("circle", {cx:x, cy:by, r:e.importance>=3?4:2.6, fill:color}, "node"));
    svg.appendChild(sEl("line", {x1:x, y1:by + (up?-7:7), x2:x, y2:yy + (up?8:-9)}, "leader"));
    var t1 = sEl("text", {x:x, y:yy, "text-anchor":"middle"}, "lbl-title");
    t1.setAttribute("font-size","10.5px");
    t1.textContent = (e.title||"").length > 28 ? e.title.slice(0,27)+"…" : e.title;
    svg.appendChild(t1);
    var t2 = sEl("text", {x:x, y:yy + (up?-11:11), "text-anchor":"middle"}, "lbl-year");
    t2.textContent = fmtYearFull(e.year); svg.appendChild(t2);
  });
  below.forEach(function(e){
    var x = X(e.year);
    svg.appendChild(sEl("circle", {cx:x, cy:ty + 7, r:2.4, fill:color, opacity:".6"}));
    var t2 = sEl("text", {x:x, y:ty + 24, "text-anchor":"middle"}, "lbl-year");
    t2.textContent = fmtYearFull(e.year); svg.appendChild(t2);
  });
}
