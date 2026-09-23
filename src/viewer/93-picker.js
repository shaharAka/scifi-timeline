/* ============================================================================
   Stories: the phone's way into the atlas.

   A canvas you pan and pinch is the wrong front door on a phone. The Moments
   map is still there (the Map tab), but a phone opens on a list: today's news,
   our own recent chain, and one card per world, sorted by how much its chain
   is like ours. A card opens that story as a vertical chain of moments with
   its ending and the stories most like it; any kind of moment opens every
   story that passed through it. Each screen is a real history entry (#world=,
   #kind=, #news=), so the phone's back button walks back through them.

   The detail screens reuse the Moments panel's builders, so a story reads the
   same here as it does beside the map on a desktop.
   ========================================================================== */

var PK = { sort:"alike", end:"all", on:false };

function pickerActive(){ return !!PK.on; }
function pickerModel(){ return MP.model || momentsModel(); }

/* --- the list ------------------------------------------------------------------ */
function pickerListHtml(M){
  var news = mpNewsList();
  var q = mpOurQuery(M, null, 6);
  var html = '<div class="pk-intro">'
    + '<p>' + M.list.length + ' science-fiction worlds, pinned to our calendar. Each leaves our history at one moment and walks its own chain of events to an ending. Which of them are on our road?</p></div>';
  if(news.length){
    var n = news[0];
    html += '<button class="mp-news-card' + (mpNewsFresh(n) ? ' fresh' : '') + '" data-news="' + esc(mpNewsKey(n)) + '">'
      + '<span class="mp-kicker">' + (mpNewsFresh(n) ? '<span class="mp-new">New</span> ' : 'Latest news · ') + esc(fmtNewsDate(n.date)) + '</span>'
      + '<span class="mp-news-card-head">' + esc(n.headline) + '</span>'
      + '<span class="mp-news-card-go">Which stories walked this road, and where it led →</span></button>';
  }
  if(q.length){
    html += '<div class="pk-road"><div class="mp-kicker">Our own road, lately</div><div class="mp-chain query">'
      + q.map(function(k, i){ return (i ? '<span class="mp-arr">→</span>' : '') + '<button class="mp-chip us" data-kind="' + esc(k) + '">' + esc(mpLabel(k)) + '</button>'; }).join("")
      + '<span class="mp-arr">→</span><span class="mp-chip open">?</span></div></div>';
  }
  /* score every story against our road once */
  var score = {};
  M.strands.forEach(function(st){ score[st.id] = q.length ? chainAlign(q, st.kinds).score : 0; });
  var list = M.strands.slice();
  if(PK.end !== "all") list = list.filter(function(st){ return st.ending.valence === PK.end; });
  if(PK.sort === "alike") list.sort(function(a, b){ return score[b.id] - score[a.id] || a.l.title.localeCompare(b.l.title); });
  else if(PK.sort === "fork") list.sort(function(a, b){ return a.fork - b.fork; });
  else list.sort(function(a, b){ return a.l.title.localeCompare(b.l.title); });
  var t = M.tally;
  html += '<div class="pk-tools"><div class="pk-ends">'
    + [["all", "All " + M.strands.length], ["optimistic", t.optimistic.length + " end well"], ["pessimistic", t.pessimistic.length + " end badly"], ["unknown", t.unknown.length + " still open"]]
      .map(function(o){ return '<button class="pk-end ' + o[0] + (PK.end === o[0] ? ' on' : '') + '" data-end="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join("")
    + '</div><label class="pk-sort">Sort <select id="pk-sort">'
    + [["alike", "most like our road"], ["fork", "where they leave us"], ["title", "A to Z"]]
      .map(function(o){ return '<option value="' + o[0] + '"' + (PK.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join("")
    + '</select></label></div>';
  var best = list.length ? score[list[0].id] : 0;
  html += '<div class="pk-list">';
  list.forEach(function(st){
    var l = st.l, art = typeof artFor === "function" ? artFor(l.id) : null;
    var chain = st.kinds.slice(0, 4).map(function(k){ return esc(mpLabel(k)); }).join(' <i>→</i> ') + (st.kinds.length > 4 ? ' <i>→ …</i>' : '');
    var alike = PK.sort === "alike" && q.length && best > 0 ? Math.round(100 * score[st.id] / best) : null;
    html += '<button class="pk-card ' + st.ending.valence + '" data-world="' + esc(l.id) + '" style="--c:' + esc(st.color) + '">'
      + (art && art.sm ? '<span class="pk-thumb" style="background-image:url(\'' + esc(art.sm) + '\')"></span>' : '<span class="pk-thumb none"></span>')
      + '<span class="pk-body"><span class="pk-title">' + esc(l.title) + '</span>'
      + '<span class="pk-meta">' + esc(mediumLabel(l.medium)) + ' · leaves us in ' + esc(fmtYearFull(st.fork)) + '</span>'
      + '<span class="pk-chain">' + chain + '</span>'
      + '<span class="pk-foot"><span class="mp-badge ' + st.ending.valence + '">' + esc(st.ending.label.toLowerCase()) + '</span>'
      + (alike != null ? '<span class="pk-alike"><i style="width:' + alike + '%"></i></span>' : '') + '</span></span></button>';
  });
  html += '</div><p class="pk-foot-note">Sorted by how closely each story’s chain of moments matches ours: the same kind of moment counts fully, a similar one partly. <button class="pk-link" id="pk-map">See them all on the map →</button></p>';
  return html;
}

/* --- a story, as a vertical chain ------------------------------------------------ */
function pickerStoryHtml(st, M){
  var l = st.l, art = typeof artFor === "function" ? artFor(l.id) : null;
  var html = (art && (art.lg || art.sm) ? '<figure class="dhero pk-hero"><img src="' + esc(art.lg || art.sm) + '" alt=""></figure>' : '')
    + '<div class="mp-kicker">' + esc(l._g.name || "") + ' · ' + esc(mediumLabel(l.medium)) + ' · ' + esc(String(l.originYear || "")) + '</div>'
    + '<h2 class="pk-h">' + esc(l.title) + '</h2>'
    + '<p class="mp-def"><b>Leaves our history in ' + esc(fmtYearFull(st.fork)) + ':</b> ' + esc(l.divergence.label || "") + '</p>'
    + (l.divergence.delta ? '<p class="pk-delta">' + esc(l.divergence.delta) + '</p>' : '');
  html += '<ol class="pk-steps">';
  st.seq.forEach(function(x, i){
    var b = (M.byKind[x.bin] || []).filter(function(bb){ return bb.col === st.cols[i]; })[0];
    var others = b && b.strands.length > 1 ? b.strands.filter(function(o){ return o !== st; }) : [];
    html += '<li><span class="pk-yr">' + esc(fmtYear(x.e.year)) + '</span><div class="pk-step">'
      + '<div class="pk-step-t">' + esc(x.e.title) + '</div>'
      + (x.e.description ? '<div class="pk-step-d">' + esc(x.e.description) + '</div>' : '')
      + '<button class="mp-kind small" data-pill="' + esc(x.bin + "@" + st.cols[i]) + '">' + esc(mpLabel(x.bin)) + '</button>'
      + (others.length ? '<span class="pk-with">also here: ' + others.map(function(o){ return '<button class="pk-link" data-world="' + esc(o.id) + '">' + esc(o.l.title) + '</button>'; }).join(", ") + '</span>' : '')
      + '</div></li>';
  });
  html += '<li class="pk-endstep ' + st.ending.valence + '"><span class="pk-yr"></span><div class="pk-step"><div class="pk-step-t">'
    + esc(st.ending.label) + '</div><div class="pk-step-d">' + esc((l.ending && l.ending.why) || "") + '</div></div></li></ol>';
  html += '<div class="pk-actions"><button class="wl-btn" data-open-world="' + esc(l.id) + '">Full dossier</button>'
    + '<button class="wl-btn" data-map-world="' + esc(l.id) + '">See it on the map</button></div>';
  html += '<h3 class="mp-h">Stories most like this one</h3>'
    + '<p class="mp-def">Aligned moment by moment. What each did after the shared stretch is where this story might have gone instead.</p>'
    + mpQueryHtml(M, st.kinds, { k:4, exclude:st.id });
  return html;
}

function pickerNewsListHtml(){
  var items = mpNewsList();
  if(!items.length) return '<p class="mp-none">No news yet.</p>';
  return '<h2 class="pk-h">In the news</h2><p class="mp-def">Real events, each read against the stories that walked the same road.</p>'
    + items.map(function(n){
      return '<button class="mp-news-card' + (mpNewsFresh(n) ? ' fresh' : '') + '" data-news="' + esc(mpNewsKey(n)) + '">'
        + '<span class="mp-kicker">' + (mpNewsFresh(n) ? '<span class="mp-new">New</span> ' : '') + esc(fmtNewsDate(n.date)) + '</span>'
        + '<span class="mp-news-card-head">' + esc(n.headline) + '</span>'
        + (n.bin ? '<span class="mp-news-card-go">' + esc(mpLabel(n.bin)) + ' →</span>' : '') + '</button>';
    }).join("");
}

/* --- routing ------------------------------------------------------------------------
   The screen is named by the hash, so back and forward work and every screen
   can be linked: "" the list, #world=, #kind=<id>[@col], #news=, #ending=, #newslist. */
function pickerRoute(){
  var h = (typeof location !== "undefined" && location.hash) ? decodeURIComponent(location.hash.slice(1)) : "";
  var m = /^(world|kind|news|ending|beat)=(.+)$/.exec(h);
  if(h === "newslist") return { view:"newslist" };
  return m ? { view:m[1], id:m[2] } : { view:"list" };
}
function pickerGo(hash){
  PK_DEPTH++;
  if(typeof history !== "undefined" && history.pushState){
    try{ history.pushState(null, "", hash ? "#" + hash : location.pathname + location.search); }catch(e){}
  }
  renderPicker();
}

function renderPicker(){
  var host = document.getElementById("picker");
  if(!host || !PK.on) return;
  var M = pickerModel(), r = pickerRoute(), body = "", back = true;
  MP.col = null;
  if(r.view === "world" && M.byId[r.id]) body = pickerStoryHtml(M.byId[r.id], M);
  else if(r.view === "kind" || r.view === "ending"){
    var v = r.id.split("@"), id = v[0];
    if(mpIsEnding(id)) body = mpEndingHtml(mpEndingRec(M, id), M);
    else if(M.kinds[id]){ if(v[1] != null) MP.col = parseInt(v[1], 10); body = mpKindHtml(M.kinds[id], M); }
  }
  else if(r.view === "news"){ var n = mpNewsByKey(r.id); if(n) body = mpNewsHtml(n, M).replace(/<button class="ghost small" id="mp-back">[^<]*<\/button>/, ""); }
  else if(r.view === "beat"){ var e = null; (M.realEv || []).forEach(function(x){ if(x.id === r.id) e = x; }); if(e) body = mpBeatHtml(e, M).replace(/<button class="ghost small" id="mp-back">[^<]*<\/button>/, ""); }
  else if(r.view === "newslist") body = pickerNewsListHtml();
  if(!body){ body = pickerListHtml(M); back = false; }
  host.innerHTML = (back ? '<button class="pk-back" id="pk-back">← Back</button>' : '') + '<div class="pk-screen">' + body + '</div>';
  host.scrollTop = 0;
  pickerWire(host);
  var bs = document.getElementById("btn-stories");
  if(bs) bs.classList.toggle("on", true);
}

function pickerWire(host){
  function each(sel, fn){ Array.prototype.forEach.call(host.querySelectorAll(sel), fn); }
  each("[data-world]", function(b){ b.onclick = function(){ pickerGo("world=" + b.getAttribute("data-world")); }; });
  each("[data-kind]", function(b){ b.onclick = function(){ pickerGo("kind=" + b.getAttribute("data-kind")); }; });
  each("[data-pill]", function(b){ b.onclick = function(){ pickerGo("kind=" + b.getAttribute("data-pill")); }; });
  each("[data-news]", function(b){ b.onclick = function(){ pickerGo("news=" + b.getAttribute("data-news")); }; });
  each("[data-beat]", function(b){ b.onclick = function(){ pickerGo("beat=" + b.getAttribute("data-beat")); }; });
  each("[data-open-world]", function(b){ b.onclick = function(){ openWorld(b.getAttribute("data-open-world")); }; });
  each("[data-map-world]", function(b){ b.onclick = function(){ showMap(); momentsSelectWorld(b.getAttribute("data-map-world")); }; });
  each("[data-end]", function(b){ b.onclick = function(){ PK.end = b.getAttribute("data-end"); renderPicker(); }; });
  var s = document.getElementById("pk-sort");
  if(s) s.onchange = function(){ PK.sort = s.value; renderPicker(); };
  var m = document.getElementById("pk-map");
  if(m) m.onclick = function(){ showMap(); };
  var bk = document.getElementById("pk-back");
  if(bk) bk.onclick = function(){
    if(typeof history !== "undefined" && history.length > 1 && pickerBackable()) history.back();
    else pickerGo("");
  };
}
/* back only leaves the picker's own entries; a first screen reached from a link goes to the list */
var PK_DEPTH = 0;
function pickerBackable(){ return PK_DEPTH > 0; }

/* --- the two phone views ---------------------------------------------------------- */
function showStories(){
  PK.on = true;
  if(document.body && document.body.classList){ document.body.classList.add("view-stories"); document.body.classList.remove("view-map"); }
  setPanel("");
  var bm = document.getElementById("btn-map"); if(bm) bm.classList.remove("on");
  renderPicker();
}
function showMap(){
  PK.on = false;
  if(document.body && document.body.classList){ document.body.classList.remove("view-stories"); document.body.classList.add("view-map"); }
  var bs = document.getElementById("btn-stories"); if(bs) bs.classList.remove("on");
  var bm = document.getElementById("btn-map"); if(bm) bm.classList.add("on");
  if(axisMode !== "moments") setAxis("moments", false);
  W = measureW(); Hv = measureH();
  momentsFit(); renderChart();
}

function pickerInit(){
  if(typeof mpIsPhone !== "function" || !mpIsPhone()) return false;
  on("btn-stories", "onclick", function(){ if(PK.on) pickerGo(""); else { showStories(); } });
  on("btn-map", "onclick", function(){ showMap(); });
  /* the News button lists the news as a Stories screen on a phone */
  on("btn-news", "onclick", function(){ if(!PK.on) showStories(); pickerGo("newslist"); });
  window.addEventListener("popstate", function(){ PK_DEPTH = Math.max(0, PK_DEPTH - 1); if(PK.on) renderPicker(); });
  showStories();
  return true;
}
