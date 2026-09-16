"use strict";
/* ============================================================================
   The viewer. Assembled by build-data.py from src/viewer/*.js in filename
   order into one IIFE; this file opens it and 99-go.js closes it. Nothing here
   needs a bundler: files share one scope on purpose, so keep names distinct.
   ========================================================================== */
(function(){

/* ============================================================ data */

var DATA = null;
var ATLAS = null;

function readEmbedded(){
  try{
    var el = document.getElementById("embedded-data");
    var raw = el.textContent.trim();
    if(!raw || raw === "__EMBEDDED__") return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}

function normalize(d){
  if(!d || !d.groups || !d.lineages) return null;
  var gmap = {}, wmap = {};
  d.groups.forEach(function(g){ gmap[g.id] = g; });
  (d.worlds || []).forEach(function(w){ wmap[w.id] = w; });
  d.lineages = d.lineages.filter(function(l){ return gmap[l.group]; });
  d.lineages.forEach(function(l){
    l.events = (l.events || []).slice().sort(function(a,b){ return a.year - b.year; });
    l._g = gmap[l.group];
    l._w = wmap[l.id] || null;
  });
  d.worlds = d.worlds || [];
  d.atlas = d.atlas || {};
  return d;
}

function boot(d){
  try{
    DATA = normalize(d);
    if(!DATA){
      document.getElementById("chartbody").innerHTML =
        '<div class="empty">No dataset found. Run <code>python3 build-data.py</code>.</div>';
      return;
    }
    ATLAS = DATA.atlas;
    BINS = DATA.bins || [];
    /* the atlas may name its default axis; Order is ours */
    if(ATLAS && (ATLAS.defaultAxis === "years" || ATLAS.defaultAxis === "order"
                 || ATLAS.defaultAxis === "moments")){
      axisMode = ATLAS.defaultAxis;
    }
    init();
  }catch(e){
    window.__bootError = (e && e.stack) || String(e);
    throw e;
  }
}
