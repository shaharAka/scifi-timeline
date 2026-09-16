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
  renderChart();
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
      + '<div class="fx-match">' + esc(f.matched.title) + '</div>';
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
