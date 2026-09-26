/* ============================================================================
   The app shell: the atlas designed for a thumb first, then laid out for width.

   A reader arrives from a shared link, has a minute, reads a story or two, and
   maybe passes it on. So the phone is a small app with a tab bar at the bottom
   (Today, Ranking, Stories, Map, About), a slim header with a share button, and screens
   that read top to bottom:

     Today     the latest news, the top candidate for which story we are in and
               the stories close behind it, our road lately, how the stories
               end, more news
     Ranking   every story ranked against our road (94-ranking.js)
     Stories   every world as a card; search, filter by ending, sort
     a story   its chain of moments as a vertical timeline down to its ending,
               then the stories that walked part of the same road
     a moment  every story that passed through that kind of moment, and what
               came next in each
     news      the item, the kind of moment it is, the stories that walked the
               same road and what followed, and our recent road matched
     Map       the Moments map, full screen, for whoever wants the whole picture

   Every screen is a history entry (#stories, #world=, #kind=, #news=,
   #beat=, #about, #map, #rank), so the phone's back button walks back through them
   and any screen can be linked. The canvas is not the front door here.

   The same screens serve the desktop (body.shell without body.phone): the
   tabs move into the header, and each screen splits into a main column and a
   side column (.pk-main / .pk-aside) that stack on a phone and sit side by
   side on a wide screen. The Map tab is the full Moments canvas with its tools,
   where a large screen earns it.
   ========================================================================== */

var PK = { sort:"alike", end:"all", q:"", on:false };
var PK_DEPTH = 0;

function pickerActive(){ return !!PK.on; }
function pickerModel(){ return MP.model || momentsModel(); }
function pkThumb(id, cls){
  var art = typeof artFor === "function" ? artFor(id) : null;
  if(art && art.sm) return '<img class="' + (cls || "pk-thumb") + '" src="' + esc(art.sm) + '" alt="" loading="lazy" decoding="async">';
  /* no plate yet: the archetype's colour and the title's initials, not a grey hole */
  var l = null; (DATA.lineages || []).forEach(function(x){ if(x.id === id) l = x; });
  var words = l ? l.title.replace(/^(The|A|An)\s+/i, "").split(/[\s:\-]+/).filter(function(w){ return /^[A-Za-z0-9]/.test(w); }) : [];
  var ini = words.slice(0, 2).map(function(w){ return w.charAt(0).toUpperCase(); }).join("");
  var col = l && l._g ? "var(--g-" + String(l._g.color).replace("#", "") + "-light)" : "var(--ink-3)";
  return '<span class="' + (cls || "pk-thumb") + ' none" aria-hidden="true" style="--tc:' + col + '"><b>' + esc(ini) + '</b></span>';
}
function pkBadge(st){ return '<span class="mp-badge ' + st.ending.valence + '">' + esc(st.ending.label.toLowerCase()) + '</span>'; }
/* the shared stretch of an alignment, in words */
function pkShared(q, st, r){
  return r.pairs.map(function(p){ return mpLabel(st.kinds[p[1]]); }).join(" → ");
}

/* a compact story row: thumbnail, title, ending, one or two lines of context */
function pkRow(st, line1, line2){
  return '<button class="pk-row ' + st.ending.valence + '" data-world="' + esc(st.id) + '">'
    + pkThumb(st.id, "pk-rthumb")
    + '<span class="pk-rbody"><span class="pk-rtop"><span class="pk-rtitle">' + esc(st.l.title) + '</span>' + pkBadge(st) + '</span>'
    + (line1 ? '<span class="pk-rline">' + line1 + '</span>' : '')
    + (line2 ? '<span class="pk-rline sub">' + line2 + '</span>' : '')
    + '</span></button>';
}
function pkNewsCard(n, big){
  return '<button class="pk-news' + (big ? ' big' : '') + (mpNewsFresh(n) ? ' fresh' : '') + '" data-news="' + esc(mpNewsKey(n)) + '">'
    + '<span class="pk-news-k">' + (mpNewsFresh(n) ? '<span class="mp-new">New</span> ' : (big ? 'Latest news · ' : '')) + esc(fmtNewsDate(n.date)) + '</span>'
    + '<span class="pk-news-h">' + esc(n.headline) + '</span>'
    + (big && n.bin ? '<span class="pk-news-go">Which stories walked this road →</span>' : '')
    + '</button>';
}
function pkEndingsBar(M, title){
  var t = M.tally, total = M.list.length;
  return '<section class="pk-sec"><h3 class="pk-sh">' + esc(title) + '</h3>'
    + '<div class="mp-obar">' + MP_ENDINGS.map(function(en){ var n = t[en.valence].length; return n ? '<i class="' + en.valence + '" style="flex:' + n + '"></i>' : ''; }).join("") + '</div>'
    + '<div class="pk-ends3">' + MP_ENDINGS.map(function(en){
        return '<button class="pk-end3 ' + en.valence + '" data-kind="' + en.id + '"><b>' + t[en.valence].length + '</b><span>' + esc(en.label.toLowerCase()) + '</span></button>';
      }).join("") + '</div>'
    + '<p class="pk-small">of ' + total + ' stories, as each is told</p></section>';
}

/* --- Today --------------------------------------------------------------------- */
function pickerTodayHtml(M){
  var news = mpNewsList(), R = rkRank(M), prev = R.upto > 1 ? rkRank(M, R.upto - 1) : null;
  var html = '<header class="pk-hello"><h1>Which stories are on our road?</h1>'
    + '<p>' + M.list.length + ' science-fiction worlds, each pinned to our calendar, each walking its own chain of events to an ending. Read today’s news against them.</p></header>'
    + '<div class="pk-cols"><div class="pk-main">';
  if(news.length) html += pkNewsCard(news[0], true);
  var top = R.rows[0];
  if(top){
    var nx = top.at >= 0 ? top.st.seq[top.at + 1] : null, was = prev && prev.rows[0].st !== top.st ? prev.rows[0].st : null;
    html += '<button class="rk-card ' + top.st.ending.valence + '" data-go="rank">' + pkThumb(top.st.id, "rk-cthumb")
      + '<span class="rk-cbody"><span class="rk-top-k">Which story are we in? · top candidate' + (was ? ', taking over from ' + esc(was.l.title) : '') + '</span>'
      + '<span class="rk-ctitle">' + esc(top.st.l.title) + ' <b>' + rkPct(top.share) + '</b></span>'
      + '<span class="pk-rline">' + esc(rkLine(R, top)) + (nx ? '; there, next: ' + esc(nx.e.title) : '') + '</span>'
      + '<span class="pk-news-go">See all ' + R.rows.length + ' stories ranked →</span></span></button>';
  }
  var near = R.rows.slice(1, 7).filter(function(r){ return rkPairs(R, r).length; });
  if(near.length){
    html += '<section class="pk-sec"><h3 class="pk-sh">Close behind</h3><div class="pk-rail">'
      + near.map(function(r){
        return '<button class="pk-tile" data-world="' + esc(r.st.id) + '">' + pkThumb(r.st.id, "pk-tthumb")
          + '<span class="pk-ttitle">' + r.rank + '. ' + esc(r.st.l.title) + ' ' + rkMove(r, prev) + '</span>' + pkBadge(r.st)
          + '<span class="pk-tline">' + rkPct(r.share) + ' of the fit</span></button>';
      }).join("") + '</div></section>';
  }
  html += pkEndingsBar(M, "How the stories end");
  html += '<button class="pk-mapcard" data-go="map"><span class="pk-mapcard-k">The map</span><span class="pk-mapcard-h">All ' + M.strands.length
    + ' stories as strands, leaving our history and running to how they end</span><span class="pk-mapcard-go">Open the map →</span></button>';
  html += '</div><aside class="pk-aside">';
  var beats = (M.realEv || []).filter(function(e){ return e.bin; }).slice(-6).reverse();
  if(beats.length){
    html += '<section class="pk-sec"><h3 class="pk-sh">Our road lately</h3><ol class="pk-road">'
      + beats.map(function(e){
        return '<li><button data-beat="' + esc(e.id) + '"><span class="pk-yr">' + esc(String(e.year)) + '</span>'
          + '<span class="pk-rt"><span class="pk-rtitle">' + esc(e.title) + '</span><span class="pk-kindtag">' + esc(mpLabel(e.bin)) + '</span></span></button></li>';
      }).join("") + '</ol><p class="pk-small">Tap a moment to find the fictional worlds in the same situation, and what happened next there.</p></section>';
  }
  if(news.length > 1){
    html += '<section class="pk-sec"><h3 class="pk-sh">More in the news</h3>' + news.slice(1).map(function(n){ return pkNewsCard(n, false); }).join("") + '</section>';
  }
  html += '<button class="pk-cta" data-go="stories">Browse all ' + M.strands.length + ' stories</button>';
  html += '</aside></div>';
  return html;
}

/* --- Stories ------------------------------------------------------------------- */
function pickerListHtml(M){
  var RR = rkRank(M), sc = {}, t = M.tally;
  RR.rows.forEach(function(r){ sc[r.st.id] = { score:r.fit }; });
  var list = M.strands.slice();
  if(PK.end !== "all") list = list.filter(function(st){ return st.ending.valence === PK.end; });
  if(PK.q){
    var needle = PK.q.toLowerCase();
    list = list.filter(function(st){
      var w = st.l._w || {};
      return (st.l.title + " " + (st.l.creator || "") + " " + (w.tags || []).join(" ") + " " + st.kinds.map(mpLabel).join(" ")).toLowerCase().indexOf(needle) >= 0;
    });
  }
  if(PK.sort === "alike") list.sort(function(a, b){ return sc[b.id].score - sc[a.id].score || a.l.title.localeCompare(b.l.title); });
  else if(PK.sort === "fork") list.sort(function(a, b){ return a.fork - b.fork; });
  else list.sort(function(a, b){ return a.l.title.localeCompare(b.l.title); });
  var html = '<div class="pk-tools"><input type="search" id="pk-q" class="pk-search" placeholder="Search stories, moments, tags" value="' + esc(PK.q) + '" aria-label="Search stories">'
    + '<div class="pk-ends">'
    + [["all", "All " + M.strands.length], ["optimistic", t.optimistic.length + " end well"], ["pessimistic", t.pessimistic.length + " end badly"], ["unknown", t.unknown.length + " still open"]]
      .map(function(o){ return '<button class="pk-end ' + o[0] + (PK.end === o[0] ? ' on' : '') + '" data-end="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join("")
    + '</div><label class="pk-sort">Sort by <select id="pk-sort">'
    + [["alike", "closest to our road"], ["fork", "when they leave us"], ["title", "A to Z"]]
      .map(function(o){ return '<option value="' + o[0] + '"' + (PK.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join("")
    + '</select></label></div>';
  html += '<div class="pk-list">';
  if(!list.length) html += '<p class="mp-none">No story matches that.</p>';
  list.forEach(function(st){
    var l = st.l;
    var chain = st.kinds.slice(0, 3).map(function(k){ return esc(mpLabel(k)); }).join(' <i>→</i> ') + (st.kinds.length > 3 ? ' <i>→ …</i>' : '');
    html += '<button class="pk-card ' + st.ending.valence + '" data-world="' + esc(l.id) + '">' + pkThumb(l.id)
      + '<span class="pk-body"><span class="pk-title">' + esc(l.title) + '</span>'
      + '<span class="pk-meta">' + esc(mediumLabel(l.medium)) + ' · leaves us in ' + esc(fmtYearFull(st.fork)) + '</span>'
      + '<span class="pk-chain">' + chain + '</span>'
      + '<span class="pk-foot">' + pkBadge(st) + '</span></span></button>';
  });
  html += '</div>';
  return html;
}

/* --- a story --------------------------------------------------------------------- */
function pickerStoryHtml(st, M){
  var l = st.l, art = typeof artFor === "function" ? artFor(l.id) : null;
  var html = '<div class="pk-hero' + (art && art.lg ? '' : ' none') + '">'
    + (art && art.lg ? '<img src="' + esc(art.lg) + '" alt="" decoding="async">' : '')
    + '<div class="pk-hero-t"><span class="pk-hero-k">' + esc(l._g.name || "") + ' · ' + esc(mediumLabel(l.medium)) + ' · ' + esc(String(l.originYear || "")) + '</span>'
    + '<h2>' + esc(l.title) + '</h2>' + pkBadge(st) + '</div></div>';
  html += '<div class="pk-cols"><div class="pk-main"><div class="pk-fork"><span class="pk-fork-y">' + esc(fmtYearFull(st.fork)) + '</span><span><b>Where it leaves our history.</b> ' + esc(l.divergence.label || "") + '</span></div>'
    + (l.divergence.delta ? '<p class="pk-delta">' + esc(l.divergence.delta) + '</p>' : '');
  html += '<ol class="pk-steps">';
  st.seq.forEach(function(x, i){
    var b = (M.byKind[x.bin] || []).filter(function(bb){ return bb.col === st.cols[i]; })[0];
    var others = b && b.strands.length > 1 ? b.strands.filter(function(o){ return o !== st; }) : [];
    html += '<li><span class="pk-yr">' + esc(fmtYear(x.e.year)) + '</span><div class="pk-step">'
      + '<div class="pk-step-t">' + esc(x.e.title) + '</div>'
      + (x.e.description ? '<div class="pk-step-d">' + esc(x.e.description) + '</div>' : '')
      + '<button class="pk-kindtag btn" data-kind="' + esc(x.bin) + '">' + esc(mpLabel(x.bin)) + '</button>'
      + (others.length ? '<span class="pk-with">also here: ' + others.map(function(o){ return '<button class="pk-link" data-world="' + esc(o.id) + '">' + esc(o.l.title) + '</button>'; }).join(", ") + '</span>' : '')
      + '</div></li>';
  });
  html += '<li class="pk-endstep ' + st.ending.valence + '"><span class="pk-yr"></span><div class="pk-step"><div class="pk-step-t">'
    + esc(st.ending.label) + '</div><div class="pk-step-d">' + esc((l.ending && l.ending.why) || "") + '</div></div></li></ol>';
  html += '</div><aside class="pk-aside">';
  var RR = rkRank(M), me = rkRankOf(RR, st.id);
  if(me) html += '<button class="rk-mine" data-go="rank"><span class="pk-sh">Which story are we in?</span><b>#' + me.rank + ' of ' + RR.rows.length + '</b> today, with ' + rkPct(me.share) + ' of the fit'
    + (rkPairs(RR, me).length ? '<span class="pk-small">' + esc(rkLine(RR, me)) + '</span>' : '<span class="pk-small">its road runs apart from ours lately</span>') + '</button>';
  html += '<div class="pk-endcard ' + st.ending.valence + '"><span class="pk-sh">How it ends</span><b>' + esc(st.ending.label) + '</b><p>' + esc((l.ending && l.ending.why) || "") + '</p></div>';
  html += '<div class="pk-actions"><button class="pk-btn primary" data-share="world=' + esc(l.id) + '" data-share-title="' + esc(l.title + " — Where We Are Now") + '">Share this story</button>'
    + '<button class="pk-btn" data-open-world="' + esc(l.id) + '">The world</button>'
    + '<button class="pk-btn" data-map-world="' + esc(l.id) + '">On the map</button></div>';
  /* the real thing the story turns away from, photographed, credited as its licence asks */
  if(typeof pdBlock === "function" && pdFor(l.id)) html += '<div class="pk-real">' + pdBlock(l.id) + '</div>';
  /* the stories most like this one */
  var near = [];
  M.strands.forEach(function(o){ if(o === st) return; var r = chainAlign(st.kinds, o.kinds); if(r.pairs.length >= 2) near.push({ o:o, r:r }); });
  near.sort(function(a, b){ return b.r.score - a.r.score; });
  if(near.length){
    html += '<section class="pk-sec"><h3 class="pk-sh">Stories that walked part of the same road</h3>'
      + near.slice(0, 4).map(function(x){
        var after = x.o.seq[x.r.b1 + 1];
        return pkRow(x.o, 'shared: ' + esc(pkShared(st.kinds, x.o, x.r)),
          after ? 'then, there: ' + esc(after.e.title) : 'and there it ended: ' + esc(x.o.ending.label.toLowerCase()));
      }).join("") + '</section>';
  }
  html += '</aside></div>';
  return html;
}

/* --- a kind of moment -------------------------------------------------------------- */
function pkThroughRows(M, kindId, onlyCol){
  var k = M.kinds[kindId]; if(!k) return "";
  var seen = {}, rows = [];
  k.hits.forEach(function(h){
    if(onlyCol != null && h.col !== onlyCol) return;
    if(seen[h.s.id]) return; seen[h.s.id] = true;
    var x = h.s.seq[h.step], nx = h.s.seq[h.step + 1];
    rows.push(pkRow(h.s, esc(fmtYearFull(x.e.year)) + ' · ' + esc(x.e.title),
      nx ? 'then: ' + esc(nx.e.title) : 'the story ends here: ' + esc(h.s.ending.label.toLowerCase())));
  });
  return rows.join("");
}
function pickerKindHtml(k, M){
  var html = '<div class="pk-cols"><div class="pk-main"><div class="mp-kicker">Kind of moment' + (k.ours ? ' · it has happened to us' : ' · not yet happened to us') + '</div>'
    + '<h2 class="pk-h">' + esc(mpLabel(k.id)) + '</h2>'
    + (k.spec.definition ? '<p class="pk-lead">' + esc(k.spec.definition) + '</p>' : '')
    + (k.spec.exampleHeadline ? '<p class="pk-eg">As a headline: “' + esc(k.spec.exampleHeadline) + '”</p>' : '');
  if(k.worlds) html += mpOutcomesHtml(k.outcomes, k.worlds, k.worlds + (k.worlds === 1 ? " story passed through it. It ends:" : " stories passed through it. They end:"));
  html += '<section class="pk-sec"><h3 class="pk-sh">The stories, and what came next</h3><div class="pk-rows">'
    + (k.hits.length ? pkThroughRows(M, k.id, null) : '<p class="mp-none">No story in the atlas reaches this kind of moment yet.</p>') + '</div></section>';
  html += '</div><aside class="pk-aside">';
  if(k.visits.length){
    html += '<section class="pk-sec"><h3 class="pk-sh">When it happened to us</h3><ol class="pk-road">'
      + k.visits.map(function(e){
        return '<li><button data-beat="' + esc(e.id) + '"><span class="pk-yr">' + esc(String(e.year)) + '</span><span class="pk-rt"><span class="pk-rtitle">' + esc(e.title) + '</span><span class="pk-small">find the same situation in fiction →</span></span></button></li>';
      }).join("") + '</ol></section>';
  }
  html += '<div class="pk-actions"><button class="pk-btn primary" data-share="kind=' + esc(k.id) + '" data-share-title="' + esc(mpLabel(k.id) + " — the stories that walked this road") + '">Share this moment</button></div>';
  html += '</aside></div>';
  return html;
}
function pickerEndingHtml(en, M){
  var html = '<div class="mp-kicker">How a story ends</div><h2 class="pk-h mp-title-' + en.valence + '">' + esc(en.label) + '</h2>'
    + '<p class="pk-lead">' + esc(en.definition) + '</p>'
    + '<section class="pk-sec"><h3 class="pk-sh">' + en.strands.length + (en.strands.length === 1 ? ' story ends' : ' stories end') + ' this way</h3><div class="pk-rows">'
    + en.strands.slice().sort(function(a, b){ return a.l.title.localeCompare(b.l.title); }).map(function(st){
        var last = st.seq[st.seq.length - 1];
        return pkRow(st, 'last: ' + esc(last.e.title), esc((st.l.ending && st.l.ending.why) || ""));
      }).join("") + '</div></section>';
  if(en.valence === "unknown") html += '<p class="pk-small">Our own history ends here too: we are still inside it.</p>';
  return html;
}

/* --- news ---------------------------------------------------------------------------- */
function pickerNewsHtml(n, M){
  var k = n.bin ? M.kinds[n.bin] : null;
  var html = '<div class="pk-cols"><div class="pk-main"><div class="mp-kicker">' + (mpNewsFresh(n) ? '<span class="mp-new">New</span> ' : '') + 'In the news · ' + esc(fmtNewsDate(n.date)) + '</div>'
    + '<h2 class="pk-h">' + esc(n.headline) + '</h2>'
    + (n.summary ? '<p class="pk-lead">' + esc(n.summary) + '</p>' : '')
    + (n.source && n.source.url ? '<a class="pk-src" href="' + esc(n.source.url) + '" target="_blank" rel="noopener">' + esc(n.source.title || "source") + ' ↗</a>' : '');
  if(!k){ return html + '<p class="mp-none">Not matched to a kind of moment yet, so it cannot be read against the stories.</p></div></div>'; }
  html += '<div class="pk-is">This is <button class="pk-kindtag btn big" data-kind="' + esc(k.id) + '">' + esc(mpLabel(k.id)) + '</button></div>';
  if(k.worlds) html += mpOutcomesHtml(k.outcomes, k.worlds, k.worlds + (k.worlds === 1 ? " story went through this. It ends:" : " stories went through this. They end:"));
  html += '<section class="pk-sec"><h3 class="pk-sh">The stories that walked this road, and what came next</h3><div class="pk-rows">' + pkThroughRows(M, k.id, null) + '</div></section>';
  html += '</div><aside class="pk-aside">';
  html += '<div class="pk-actions"><button class="pk-btn primary" data-share="news=' + esc(mpNewsKey(n)) + '" data-share-title="' + esc(n.headline + " — which stories walked this road?") + '">Share this reading</button></div>';
  var q = mpOurQuery(M, null, 5); if(q[q.length - 1] !== n.bin) q = q.concat([n.bin]).slice(-6);
  var near = [];
  M.strands.forEach(function(st){ var r = chainAlign(q, st.kinds); if(r.pairs.length >= 2) near.push({ st:st, r:r }); });
  near.sort(function(a, b){ return b.r.score - a.r.score; });
  if(near.length){
    html += '<section class="pk-sec"><h3 class="pk-sh">Not just this moment: our whole recent road</h3>'
      + '<p class="pk-small">' + q.map(mpLabel).map(esc).join(" → ") + '</p>'
      + near.slice(0, 3).map(function(x){ var after = x.st.seq[x.r.b1 + 1];
          return pkRow(x.st, 'shared: ' + esc(pkShared(q, x.st, x.r)), after ? 'then, there: ' + esc(after.e.title) : 'and there it ended'); }).join("")
      + '</section>';
  }
  html += '</aside></div>';
  return html;
}
function pickerNewsListHtml(){
  var items = mpNewsList();
  if(!items.length) return '<p class="mp-none">No news yet.</p>';
  return '<h2 class="pk-h">In the news</h2><p class="pk-lead">Real events, each read against the stories that walked the same road.</p>'
    + items.map(function(n, i){ return pkNewsCard(n, i === 0); }).join("");
}

/* --- one of our own moments, matched by situation ---------------------------------------- */
function pickerBeatHtml(e, M){
  var html = '<div class="mp-kicker">A moment in our history</div><h2 class="pk-h"><span class="pk-hy">' + esc(String(e.year)) + '</span> ' + esc(e.title) + '</h2>'
    + (e.description ? '<p class="pk-lead">' + esc(e.description) + '</p>' : '')
    + (e.bin ? '<div class="pk-is">A kind of moment: <button class="pk-kindtag btn" data-kind="' + esc(e.bin) + '">' + esc(mpLabel(e.bin)) + '</button></div>' : '');
  if(e.facets && typeof facetMoments === "function"){
    var moments = facetMoments(), mine = null;
    moments.forEach(function(m){ if(m.e === e) mine = m; });
    var ns = mine ? facetNeighbours(mine, moments, 5) : [];
    if(ns.length){
      html += '<section class="pk-sec"><h3 class="pk-sh">The same situation, in fiction</h3>'
        + '<p class="pk-small">Matched on how it happened, who did it and which way it moved power and openness; what followed is read from each world.</p><div class="pk-rows">'
        + ns.map(function(nb){
          var st = M.byId[nb.m.world]; if(!st) return "";
          var fwd = facetForward(nb.m, 1)[0];
          return pkRow(st, esc(fmtYearFull(nb.m.e.year)) + ' · ' + esc(nb.m.e.title) + ' <span class="pk-score">' + Math.round(nb.score * 100) + '% alike</span>',
            fwd ? 'then: ' + esc(fwd.title) : 'the story ends there');
        }).join("") + '</div></section>';
    }
  }
  return html;
}

/* --- About ------------------------------------------------------------------------------ */
function pickerAboutHtml(M){
  var lede = document.getElementById("hero-lede"), notes = document.getElementById("notes");
  return '<h2 class="pk-h">About this atlas</h2>'
    + (lede ? '<p class="pk-lead">' + lede.innerHTML + '</p>' : '')
    + '<section class="pk-sec"><h3 class="pk-sh">How to read it</h3><ul class="pk-how">'
    + '<li><b>A story</b> leaves our real history at one dated moment and walks a chain of events to an ending.</li>'
    + '<li><b>A kind of moment</b> (a plague, a war begins, power is seized) is how stories are compared: two stories meet when they pass through the same kind of moment.</li>'
    + '<li><b>An ending</b> is the state the story leaves the world in as far as it is told: well, badly, or still open.</li>'
    + '<li><b>Closest to our road</b> lines up the order of our own recent moments against each story’s; the same kind counts fully, a similar one partly.</li>'
    + '</ul></section>'
    + (notes ? '<section class="pk-sec pk-notes">' + notes.innerHTML + '</section>' : '')
    + '<p class="pk-small">' + M.list.length + ' worlds · dates, sources and confidence for every event are in each world’s full chronology. The map and the calendar views are best on a larger screen.</p>';
}

/* --- routing ------------------------------------------------------------------------------ */
function pickerRoute(){
  var h = (typeof location !== "undefined" && location.hash) ? decodeURIComponent(location.hash.slice(1)) : "";
  var m = /^(world|kind|news|ending|beat|card)=(.+)$/.exec(h);
  if(m) return { view:m[1], id:m[2] };
  if(h === "stories" || h === "about" || h === "map" || h === "newslist" || h === "rank") return { view:h };
  return { view:"today" };
}
function pickerGo(hash){
  PK_DEPTH++;
  if(typeof history !== "undefined" && history.pushState){
    try{ history.pushState(null, "", hash ? "#" + hash : location.pathname + location.search); }catch(e){}
  }
  pickerRender();
}
function pickerTab(view){
  return view === "stories" || view === "world" ? "stories"
       : view === "about" ? "about" : view === "map" ? "map" : view === "rank" ? "rank" : "today";
}
function pickerRender(){
  var r = pickerRoute();
  if(r.view === "card"){ rkShowCard(r.id); return; }
  rkHideCard();
  pickerTabs(pickerTab(r.view));
  if(r.view === "map"){ showMap(); return; }
  if(!PK.on) showStories(true);
  var host = document.getElementById("picker");
  if(!host) return;
  var M = pickerModel(), body = "", sub = true, title = "";
  if(r.view === "world" && M.byId[r.id]){ body = pickerStoryHtml(M.byId[r.id], M); title = M.byId[r.id].l.title; }
  else if(r.view === "kind" || r.view === "ending"){
    var id = r.id.split("@")[0];
    if(mpIsEnding(id)){ body = pickerEndingHtml(mpEndingRec(M, id), M); title = mpLabel(id); }
    else if(M.kinds[id]){ body = pickerKindHtml(M.kinds[id], M); title = mpLabel(id); }
  }
  else if(r.view === "news"){ var n = mpNewsByKey(r.id); if(n){ body = pickerNewsHtml(n, M); title = "In the news"; } }
  else if(r.view === "beat"){ var e = null; (M.realEv || []).forEach(function(x){ if(x.id === r.id) e = x; }); if(e){ body = pickerBeatHtml(e, M); title = String(e.year); } }
  else if(r.view === "newslist"){ body = pickerNewsListHtml(); title = "News"; }
  else if(r.view === "rank"){ body = pickerRankHtml(M); sub = false; title = "Ranking"; }
  else if(r.view === "stories"){ body = pickerListHtml(M); sub = false; title = "Stories"; }
  else if(r.view === "about"){ body = pickerAboutHtml(M); sub = false; title = "About"; }
  if(!body){ body = pickerTodayHtml(M); sub = false; }
  var head = document.getElementById("pk-head"), phone = mpIsPhone();
  /* a phone names the screen in the header; a wide screen keeps the atlas's name
     there and puts the way back at the top of the page */
  if(head) head.innerHTML = sub && phone
    ? '<button class="pk-back" id="pk-back" aria-label="Back">\u2039</button><span class="pk-htitle">' + esc(title) + '</span>'
    : '<button class="pk-brand" data-home="1">Where We Are Now</button>';
  if(sub && !phone) body = '<button class="pk-back2" id="pk-back">\u2190 Back</button>' + body;
  var keepSearch = r.view === "stories" && document.activeElement && document.activeElement.id === "pk-q";
  host.innerHTML = '<div class="pk-screen v-' + r.view + '">' + body + '</div>';
  if(!keepSearch) host.scrollTop = 0;
  pickerWire(host);
  var bk = document.getElementById("pk-back");
  if(bk) bk.onclick = function(){ if(typeof history !== "undefined" && PK_DEPTH > 0) history.back(); else pickerGo(""); };
  var hb = head && head.querySelector("[data-home]");
  if(hb) hb.onclick = function(){ pickerGo(""); };
  if(keepSearch){ var qi = document.getElementById("pk-q"); if(qi){ qi.focus(); try{ qi.setSelectionRange(qi.value.length, qi.value.length); }catch(e){} } }
}
/* kept for callers from before the phone was an app */
function renderPicker(){ pickerRender(); }

function pickerTabs(active){
  Array.prototype.forEach.call(document.querySelectorAll("#tabbar [data-tab]"), function(b){
    b.classList.toggle("on", b.getAttribute("data-tab") === active);
    b.setAttribute("aria-current", b.getAttribute("data-tab") === active ? "page" : "false");
  });
}

function pickerShare(hash, title){
  var base = (typeof location !== "undefined") ? location.href.split("#")[0] : "";
  var url = base + (hash ? "#" + hash : "");
  var data = { title: title || "Where We Are Now", text: title || "Which science-fiction stories are on our road?", url: url };
  if(typeof navigator !== "undefined" && navigator.share){
    navigator.share(data).catch(function(){});
    return;
  }
  var done = function(){ pkToast("Link copied"); };
  try{
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function(){ pkToast(url); });
    else pkToast(url);
  }catch(e){ pkToast(url); }
}
function pkToast(msg){
  var t = document.getElementById("pk-toast");
  if(!t) return;
  t.textContent = msg; t.classList.add("on");
  clearTimeout(pkToast._t); pkToast._t = setTimeout(function(){ t.classList.remove("on"); }, 2200);
}

function pickerWire(host){
  function each(sel, fn){ Array.prototype.forEach.call(host.querySelectorAll(sel), fn); }
  each("[data-world]", function(b){ b.onclick = function(){ pickerGo("world=" + b.getAttribute("data-world")); }; });
  each("[data-kind]", function(b){ b.onclick = function(){ pickerGo("kind=" + b.getAttribute("data-kind")); }; });
  each("[data-pill]", function(b){ b.onclick = function(){ pickerGo("kind=" + b.getAttribute("data-pill").split("@")[0]); }; });
  each("[data-news]", function(b){ b.onclick = function(){ pickerGo("news=" + b.getAttribute("data-news")); }; });
  each("[data-beat]", function(b){ b.onclick = function(){ pickerGo("beat=" + b.getAttribute("data-beat")); }; });
  each("[data-go]", function(b){ b.onclick = function(){ pickerGo(b.getAttribute("data-go")); }; });
  each("[data-open-world]", function(b){ b.onclick = function(){ openWorld(b.getAttribute("data-open-world")); }; });
  each("[data-map-world]", function(b){ b.onclick = function(){ var id = b.getAttribute("data-map-world"); pickerGo("map"); momentsSelectWorld(id); }; });
  each("[data-end]", function(b){ b.onclick = function(){ PK.end = b.getAttribute("data-end"); pickerRender(); }; });
  each("[data-share]", function(b){ b.onclick = function(){ pickerShare(b.getAttribute("data-share"), b.getAttribute("data-share-title")); }; });
  var s = document.getElementById("pk-sort");
  if(s) s.onchange = function(){ PK.sort = s.value; pickerRender(); };
  var qi = document.getElementById("pk-q");
  if(qi) qi.oninput = function(){ PK.q = qi.value.trim(); pickerRender(); };
}

/* --- the two surfaces: screens, or the map ------------------------------------------------ */
function showStories(quiet){
  PK.on = true;
  if(document.body && document.body.classList){ document.body.classList.add("view-stories"); document.body.classList.remove("view-map"); }
  setPanel("");
  if(!quiet) pickerRender();
}
function showMap(){
  PK.on = false;
  if(document.body && document.body.classList){ document.body.classList.remove("view-stories"); document.body.classList.add("view-map"); }
  var head = document.getElementById("pk-head");
  if(head) head.innerHTML = '<span class="pk-brand">' + (mpIsPhone() ? 'The map' : 'Where We Are Now') + '</span>';
  pickerTabs("map");
  /* a phone only has the Moments map; a wide screen keeps the view last chosen */
  if(mpIsPhone() && axisMode !== "moments") setAxis("moments", false);
  /* a world left selected from before, with its dossier closed, would dim the
     tree for no visible reason */
  if(typeof sel !== "undefined" && sel && panelMode !== "world"){ sel = null; if(typeof setPlate === "function") setPlate(null); }
  W = measureW(); Hv = measureH();
  if(axisMode === "moments"){
    momentsFit(); renderChart();
    if(!mpIsPhone() && panelMode === ""){ renderMomentsPanel(); setPanel("moments"); }
  } else fitAll();
}

function pickerInit(){
  /* a real page only: the test harness has no location and keeps the canvas */
  if(typeof location === "undefined" || !document.getElementById("picker")) return false;
  var cl = document.body && document.body.classList;
  if(cl){ cl.add("shell"); cl.toggle("phone", mpIsPhone()); }
  window.addEventListener("resize", function(){
    if(!cl) return;
    var was = cl.contains("phone"), now = mpIsPhone();
    if(was !== now){ cl.toggle("phone", now); pickerRender(); }
  });
  Array.prototype.forEach.call(document.querySelectorAll("#tabbar [data-tab]"), function(b){
    b.onclick = function(){
      var t = b.getAttribute("data-tab");
      pickerGo(t === "today" ? "" : t);
    };
  });
  on("pk-zin", "onclick", function(){ momentsZoomAt(1.4, W / 2, Hv / 2); renderChart(); });
  on("pk-zout", "onclick", function(){ momentsZoomAt(1 / 1.4, W / 2, Hv / 2); renderChart(); });
  on("pk-fit", "onclick", function(){ momentsFit(); renderChart(); });
  on("pk-share", "onclick", function(){
    var h = (location.hash || "").slice(1);
    pickerShare(h === "map" ? "" : h, document.title);
  });
  window.addEventListener("popstate", function(){ PK_DEPTH = Math.max(0, PK_DEPTH - 1); pickerRender(); });
  showStories(true);
  pickerRender();
  return true;
}
