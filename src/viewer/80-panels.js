/* ============================================================ the explorer: stats, tags, world index */
/* Everything that used to be a page section below the chart lives in the side
   panel now. The canvas is the page; the panel is where you read. */

function renderStats(){
  var evs = 0, byConf = {high:0, medium:0, low:0}, lo = Infinity, hi = -Infinity;
  DATA.lineages.forEach(function(l){
    evs += l.events.length;
    l.events.forEach(function(e){
      byConf[e.confidence] = (byConf[e.confidence]||0) + 1;
      if(e.year < lo) lo = e.year;
      if(e.year > hi) hi = e.year;
    });
  });
  var covered = DATA.lineages.filter(function(l){ return l._w; }).length;
  var total = evs || 1;
  var conf = Math.round(100 * byConf.high / total);

  function stat(k, v, s, barPct, color){
    return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div>' +
      '<div class="s">' + s + '</div>' +
      (barPct == null ? '' : '<div class="bar"><span style="width:0%;background:' + color +
        '" data-w="' + barPct + '"></span></div>') + '</div>';
  }
  document.getElementById("stats").innerHTML =
    stat("Worlds charted", DATA.lineages.length, DATA.groups.length + " archetypes") +
    stat("Dated events", evs, "pinned to real years") +
    stat("Time span", isFinite(lo) ? fmtSpan(lo) + " &ndash; " + fmtSpan(hi) : "&mdash;", "symmetric-log axis") +
    stat("Stated outright", conf + "%", byConf.high + " of " + total + " rated high", conf, "var(--ok)") +
    stat("Contested", byConf.low, "sources disagree", Math.round(100*byConf.low/total), "var(--bad)") +
    stat("Dossiers", covered + "/" + DATA.lineages.length, "worlds to step into",
         Math.round(100*covered/Math.max(1, DATA.lineages.length)), "#2dd4e6");

  requestAnimationFrame(function(){
    Array.prototype.forEach.call(document.querySelectorAll(".stat .bar span"), function(s){
      s.style.width = s.getAttribute("data-w") + "%";
    });
  });
}

function renderTags(){
  var host = document.getElementById("tags");
  if(!host) return;
  host.innerHTML = "";
  var cloud = {};
  DATA.lineages.forEach(function(l){
    ((l._w && l._w.tags) || []).forEach(function(t){ cloud[t] = (cloud[t]||0)+1; });
  });
  var top = Object.keys(cloud).sort(function(a,b){ return cloud[b]-cloud[a]; }).slice(0, 12);
  if(!top.length) return;
  var lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = "Tag";
  host.appendChild(lbl);
  top.forEach(function(t){
    var b = document.createElement("button");
    b.className = "chip" + (tagFilter === t ? "" : " off");
    b.innerHTML = '#' + esc(t) + ' <span style="opacity:.6">' + cloud[t] + '</span>';
    b.onclick = function(){
      tagFilter = (tagFilter === t) ? null : t;
      refresh();
    };
    host.appendChild(b);
  });
}

/* one row per world: identity, one line of its fork, and where its charted
   time sits against today */
function renderCards(){
  var host = document.getElementById("cards");
  var list = visibleLineages();
  if(!list.length){
    host.innerHTML = '<div class="empty">No world matches that filter.</div>';
    return;
  }
  var lo = -1000, hi = 12000;
  DATA.lineages.forEach(function(l){
    l.events.forEach(function(e){
      if(e.year > -8000 && e.year < lo) lo = e.year;
      if(e.year < 60000 && e.year > hi) hi = e.year;
    });
  });
  function frac(y){
    var f = Math.log1p(Math.max(0, y - lo)) / Math.log1p(hi - lo);
    return Math.max(0, Math.min(1, f));
  }
  var nx = frac(NOW), lastGroup = null, html = "";
  list.forEach(function(l){
    if(l.group !== lastGroup){
      lastGroup = l.group;
      html += '<div class="cards-head" style="color:' + l._g.color + '">' + esc(l._g.name) + '</div>';
    }
    var w = l._w || {};
    var ys = l.events.map(function(e){ return e.year; });
    var a = frac(Math.min.apply(null, ys)), b = frac(Math.max.apply(null, ys));
    html += '<button class="card' + (sel === l ? ' on' : '') + '" data-lid="' + l.id + '" style="--c:' + l._g.color + '">' +
      '<span class="edge"></span>' +
      '<div class="ttl">' + esc(l.title) + ' <span class="meta">' + mediumLabel(l.medium) +
        ' &middot; ' + esc(l.creator || '') + ' &middot; forks ' + fmtYearFull(l.divergence.year) + '</span></div>' +
      '<div class="delta">' + esc(l.divergence.label || (w.setting || '').slice(0, 120)) + '</div>' +
      '<div class="track"><div class="fill" style="left:' + (a*100).toFixed(2) + '%;width:' +
          Math.max(0.8, (b-a)*100).toFixed(2) + '%"></div>' +
        '<div class="nowmark" style="left:' + (nx*100).toFixed(2) + '%"></div></div>' +
      '</button>';
  });
  host.innerHTML = html;
  Array.prototype.forEach.call(host.querySelectorAll(".card"), function(c){
    c.onclick = function(){ openWorld(c.getAttribute("data-lid")); };
    c.onmouseenter = function(){ setBranchHover(c.getAttribute("data-lid")); };
    c.onmouseleave = function(){ setBranchHover(null); };
  });
}

/* re-render everything that depends on filters */
function refresh(){
  renderChips(); renderTags(); renderChart(); renderCards(); animateLayout();
}
