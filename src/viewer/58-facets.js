/* ============================================================================
   Matching by situation, reading forward by outcome.

   A bin says what kind of moment something is. A facet signature says what the
   situation is: how it changed, by what mechanism, who did it, from where, at
   what scope, in what domain, which way the four axes moved, and what had to be
   true first. Similarity is measured over those and OUTCOMES ARE HELD OUT - the
   outcomes are what the match is for.

   This is a port of tools/facet-match.py, and the two must agree: the weights
   and the holding-out are the same, so a match quoted from the page and a match
   quoted from the tool are the same number. If you change one, change both.
   ========================================================================== */

var FACET_SCOPE = ["local", "national", "civilisational", "planetary", "beyond"];
var FACET_W = { mechanism:3, actor:2, position:2.5, domain:2, scope:1,
                direction:2.5, preconditions:2 };

function facetJaccard(a, b){
  a = a || []; b = b || [];
  if(!a.length && !b.length) return 0;
  var inA = {};
  a.forEach(function(x){ inA[x] = true; });
  var inter = 0;
  b.forEach(function(x){ if(inA[x]) inter++; });
  var union = {};
  a.concat(b).forEach(function(x){ union[x] = true; });
  var n = Object.keys(union).length;
  return n ? inter / n : 0;
}

function facetVec(fx){
  var d = fx.direction || {};
  return [d.power || 0, d.openness || 0, d.capability || 0, d.population || 0];
}

function facetCosine(a, b){
  var na = 0, nb = 0, dot = 0;
  for(var i = 0; i < a.length; i++){ na += a[i] * a[i]; nb += b[i] * b[i]; dot += a[i] * b[i]; }
  na = Math.sqrt(na); nb = Math.sqrt(nb);
  return (na && nb) ? dot / (na * nb) : 0;
}

/* 0..1. Under about 0.5 means nothing close. */
function facetSim(a, b){
  if(!a || !b) return 0;
  var s = 0;
  s += FACET_W.mechanism * (a.mechanism === b.mechanism ? 1 : 0);
  s += FACET_W.actor     * (a.actor === b.actor ? 1 : 0);
  s += FACET_W.position  * (a.position === b.position ? 1 : 0);
  s += FACET_W.domain    * (a.domain === b.domain ? 1 : 0);
  var ia = FACET_SCOPE.indexOf(a.scope), ib = FACET_SCOPE.indexOf(b.scope);
  s += FACET_W.scope * (1 - Math.abs(ia - ib) / 4);
  s += FACET_W.direction * ((facetCosine(facetVec(a), facetVec(b)) + 1) / 2);
  s += FACET_W.preconditions * facetJaccard(a.preconditions, b.preconditions);
  var total = 0;
  Object.keys(FACET_W).forEach(function(k){ total += FACET_W[k]; });
  return s / total;
}

/* Every moment that carries a signature: the fictions and our own history,
   each with the sequence it sits in, so a match can be read forward. */
function facetMoments(){
  var out = [];
  DATA.lineages.forEach(function(l){
    var evs = (l.events || []).filter(function(e){ return e.facets; });
    evs.forEach(function(e, i){
      out.push({ world:l.id, worldTitle:l.title, lineage:l, e:e, idx:i, seq:evs, real:false });
    });
  });
  var real = DATA.real;
  if(real && real.events){
    var revs = real.events.filter(function(e){ return e.facets; });
    revs.forEach(function(e, i){
      out.push({ world:"real", worldTitle:real.title || "Real history",
                 lineage:real, e:e, idx:i, seq:revs, real:true });
    });
  }
  return out;
}

/* The k nearest moments in OTHER worlds, by situation. Outcomes held out. */
function facetNeighbours(m, moments, k){
  var scored = [];
  moments.forEach(function(o){
    if(o === m || o.world === m.world) return;
    scored.push({ score:facetSim(m.e.facets, o.e.facets), m:o });
  });
  scored.sort(function(a, b){ return b.score - a.score; });
  return scored.slice(0, k || 5);
}

/* What followed each neighbour, in that world's own order. */
function facetForward(neighbour, n){
  var seq = neighbour.seq, at = neighbour.idx;
  return seq.slice(at + 1, at + 1 + (n || 3));
}
