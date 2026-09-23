/* ============================================================================
   News -> futures.

   The reason the Moments view exists. A real event is matched to the KIND of
   moment it is; every world that passed through that kind lights up; and each
   is read forward from that node, so the reader can put the futures side by
   side and see where they agree, where they diverge, and in what order.

   Nothing here invents a match. If a news item carries no `bin` - or carries a
   bin the vocabulary does not define - the view says so rather than guessing.
   ========================================================================== */

/* Which kind of moment is this news item? Its own `bin` if it has one. */
function binForNews(item){
  return (item && item.bin) || null;
}

/* The worlds that passed through a kind of moment, and what they did next.
   "Next" means the beats after the matched one in THIS world's sequence - not
   the next column on the canvas, which is the canonical arc and not a date. */
function futuresFor(binId, limit){
  var out = [];
  if(!binId) return out;
  var N = limit || 4;
  DATA.lineages.forEach(function(l){
    var evs = l.events || [];
    var at = -1;
    for(var i = 0; i < evs.length; i++){
      if(evs[i].bin === binId){ at = i; break; }
    }
    if(at < 0) return;
    var after = [];
    for(var j = at + 1; j < evs.length && after.length < N; j++){
      if(evs[j].bin) after.push(evs[j]);
    }
    out.push({
      world: l,
      matched: evs[at],
      matchedAt: at + 1,
      of: evs.length,
      after: after
    });
  });
  /* the worlds with the most to show first, then alphabetically */
  out.sort(function(a, b){
    if(b.after.length !== a.after.length) return b.after.length - a.after.length;
    return a.world.title < b.world.title ? -1 : 1;
  });
  return out;
}

/* Light every world through this kind of moment, and open the panel. */
function matchNews(item){
  var binId = binForNews(item);
  if(axisMode === "moments"){
    if(binId) momentsSelectNews(item && item.headline ? item : { headline:binId, bin:binId, date:"" });
    return Object.keys(worldsThroughBin(binId)).length;
  }
  if(!binId){
    litBin = null; litWorlds = null;
    renderChart();
    renderFutures(item, null);
    return 0;
  }
  var worlds = {};
  DATA.lineages.forEach(function(l){
    (l.events || []).forEach(function(e){ if(e.bin === binId) worlds[l.id] = true; });
  });
  litBin = binId;
  litWorlds = worlds;
  renderChart();
  renderFutures(item, futuresFor(binId));
  return Object.keys(worlds).length;
}

function clearMatch(){
  litBin = null; litWorlds = null;
  litMoment = null;
  renderChart();
}

/* ============================================================================
   Matching by SITUATION, which is what the atlas now runs on.

   Choosing a real beat - from the trunk, from a news item, from the panel - is
   one operation: find the moments in other worlds whose SITUATION is nearest,
   hold their outcomes out, and read each forward from there. A bin says what
   kind of moment it is; the facets say what the situation is, and the situation
   is what makes two moments comparable across worlds that share no dates.
   ========================================================================== */

/* Read a moment forward by situation. Returns the neighbours found. */
function matchMoment(e, label){
  var moments = facetMoments();
  var mine = null;
  for(var i = 0; i < moments.length; i++){
    if(moments[i].e === e){ mine = moments[i]; break; }
  }
  litMoment = e;
  if(!mine || !e.facets){
    /* no signature: the best that can be done is the coarse kind, and saying so
       is better than pretending the match is finer than it is */
    litBin = e.bin || null;
    litWorlds = null;
    if(litBin){
      litWorlds = {};
      DATA.lineages.forEach(function(l){
        (l.events || []).forEach(function(x){ if(x.bin === litBin) litWorlds[l.id] = true; });
      });
    }
    renderChart();
    renderSituation(label || e.title, e, null, "no signature: matched on the kind alone");
    return [];
  }
  var ns = facetNeighbours(mine, moments, 6);
  /* the worlds those neighbours live in are what the chart lights */
  litBin = null;
  litWorlds = {};
  ns.forEach(function(n){ litWorlds[n.m.world] = true; });
  renderChart();
  renderSituation(label || e.title, e, ns, null);
  return ns;
}

/* The worlds a bin is passed through, as a set - the older, coarser match. */
function worldsThroughBin(binId){
  var worlds = {};
  if(!binId) return worlds;
  DATA.lineages.forEach(function(l){
    (l.events || []).forEach(function(x){ if(x.bin === binId) worlds[l.id] = true; });
  });
  return worlds;
}

function futuresHost(){
  return document.getElementById("news-list");
}

/* The futures, side by side: one block per world, in this world's own order. */
function renderFutures(item, futures){
  var host = futuresHost();
  if(!host || !item) return;
  var binId = binForNews(item);
  var head = '<div class="fx-head"><h3>' + esc(item.headline) + '</h3>';
  if(!binId){
    host.innerHTML = head + '<p class="fx-none">This item has not been matched to a '
      + 'kind of moment yet, so there are no futures to read. Binning it is what '
      + 'makes the match.</p></div>';
    return;
  }
  var spec = null;
  (BINS || []).forEach(function(b){ if(b.id === binId) spec = b; });
  var known = !!spec;
  var n = futures ? futures.length : 0;
  var body = '<p class="fx-bin">Kind of moment: <b>'
    + esc(spec ? (spec.label || binId) : binId) + '</b>'
    + (known ? '' : ' <i>(not in the vocabulary)</i>')
    + ' &middot; ' + n + (n === 1 ? ' world' : ' worlds') + ' pass through it.</p>';
  if(spec && spec.definition) body += '<p class="fx-def">' + esc(spec.definition) + '</p>';
  if(item.years && item.years.length){
    body += '<p class="fx-us">Happened to us: ' + item.years.map(function(e){
      return '<b>' + esc(String(e.year)) + '</b> ' + esc(e.title); }).join(' \u00b7 ') + '</p>';
  }
  if(!n){
    host.innerHTML = head + body + '<p class="fx-none">No world in the atlas '
      + 'passes through this kind of moment yet.</p></div>';
    return;
  }
  body += '<div class="fx-grid">';
  futures.forEach(function(f){
    body += '<div class="fx-card">'
      + '<div class="fx-world" data-lid="' + esc(f.world.id) + '">' + esc(f.world.title)
      + '<span class="fx-at">beat ' + f.matchedAt + ' of ' + f.of + '</span></div>'
      + '<div class="fx-match"><span class="fx-yr">' + fmtYear(f.matched.year) + '</span> ' + esc(f.matched.title) + '</div>';
    if(!f.after.length){
      body += '<div class="fx-end">nothing binned follows this in this world</div>';
    } else {
      body += '<ol class="fx-next">';
      f.after.forEach(function(e){
        body += '<li><span class="fx-yr">' + fmtYear(e.year) + '</span> '
          + esc(e.title) + '</li>';
      });
      body += '</ol>';
    }
    body += '</div>';
  });
  body += '</div>';
  host.innerHTML = head + body + '</div>';
  Array.prototype.forEach.call(host.querySelectorAll(".fx-world"), function(el){
    el.onclick = function(){ openWorld(el.getAttribute("data-lid")); };
    el.style.cursor = "pointer";
  });
}

/* ============================================================================
   The situation panel: what this moment IS, who is nearest to it, and what
   followed them. The neighbours are ranked by similarity over the signature,
   and each one's next beats are read from its own world's order.
   ========================================================================== */
function renderSituation(title, e, neighbours, note){
  var host = futuresHost();
  if(!host) return;
  var bin = null;
  (BINS || []).forEach(function(b){ if(b.id === e.bin) bin = b; });
  var html = '<div class="fx-head"><h3>' + esc(title) + '</h3>';
  html += '<p class="fx-bin">' + esc(fmtYear(e.year)) + ' \u00b7 <b>'
    + esc(bin ? (bin.label || e.bin) : (e.bin || "unbinned")) + '</b></p>';
  if(e.facets){
    html += '<p class="fx-change">' + esc(e.facets.change || "") + '</p>';
    /* the signature, stated: this is what the match is computed over, and the
       outcomes are deliberately not part of it */
    var f = e.facets;
    html += '<dl class="fx-facets">'
      + '<dt>mechanism</dt><dd>' + esc(f.mechanism) + '</dd>'
      + '<dt>actor</dt><dd>' + esc(f.actor) + '</dd>'
      + '<dt>position</dt><dd>' + esc(f.position) + '</dd>'
      + '<dt>domain</dt><dd>' + esc(f.domain) + '</dd>'
      + '<dt>scope</dt><dd>' + esc(f.scope) + '</dd>'
      + '<dt>direction</dt><dd>power ' + sign(f.direction.power) + ', openness '
      + sign(f.direction.openness) + ', capability ' + sign(f.direction.capability)
      + ', population ' + sign(f.direction.population) + '</dd>'
      + (f.preconditions && f.preconditions.length
          ? '<dt>needed first</dt><dd>' + esc(f.preconditions.join(", ")) + '</dd>' : '')
      + '</dl>';
  }
  if(note) html += '<p class="fx-none">' + esc(note) + '</p>';
  if(!neighbours){
    host.innerHTML = html + '</div>';
    return;
  }
  if(!neighbours.length){
    host.innerHTML = html + '<p class="fx-none">No other world is close enough '
      + 'to this situation to read forward from.</p></div>';
    return;
  }
  html += '<p class="fx-def">Nearest situations in other worlds. Their outcomes are '
    + 'held out of the match, and what followed each is read from its own world.</p>';
  html += '<div class="fx-grid">';
  neighbours.forEach(function(n){
    var m = n.m;
    var next = facetForward(m, 3);
    html += '<div class="fx-card">'
      + '<div class="fx-world" data-lid="' + esc(m.world) + '">'
      + esc(m.worldTitle)
      + '<span class="fx-at">' + n.score.toFixed(2) + ' match</span></div>'
      + '<div class="fx-match">' + esc(fmtYear(m.e.year)) + ' &middot; '
      + esc(m.e.title) + '</div>'
      + '<div class="fx-why">' + esc(m.e.facets ? (m.e.facets.change || "") : "") + '</div>';
    if(!next.length){
      html += '<div class="fx-end">the charted history ends here</div>';
    } else {
      html += '<ol class="fx-next">';
      next.forEach(function(x){
        html += '<li><span class="fx-yr">' + fmtYear(x.year) + '</span> '
          + esc(x.title) + '</li>';
      });
      html += '</ol>';
    }
    html += '</div>';
  });
  html += '</div></div>';
  host.innerHTML = html;
  Array.prototype.forEach.call(host.querySelectorAll(".fx-world"), function(el){
    var id = el.getAttribute("data-lid");
    if(id === "real") return;
    el.onclick = function(){ openWorld(id); };
    el.style.cursor = "pointer";
  });
}

function sign(v){
  v = v || 0;
  return v > 0 ? "+" + v : String(v);
}
