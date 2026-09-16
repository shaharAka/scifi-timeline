/* ============================================================ selection */

function matches(l){
  if(!groupOn[l.group]) return false;
  if(tagFilter){
    var tags = (l._w && l._w.tags) || [];
    if(tags.indexOf(tagFilter) < 0) return false;
  }
  if(!q) return true;
  var w = l._w || {};
  var hay = [l.title, l.creator, l._g.name, l.medium, l.epoch,
             l.divergence.label, l.divergence.delta, w.setting, w.conflict,
             (w.tags||[]).join(" "), (w.themes||[]).join(" "),
             (w.locations||[]).map(function(x){ return x.name; }).join(" "),
             (w.factions||[]).map(function(x){ return x.name; }).join(" "),
             l.events.map(function(e){ return e.title; }).join(" ")]
            .join(" ").toLowerCase();
  return hay.indexOf(q) >= 0;
}

function sortMode(){
  var s = document.getElementById("sort");
  return (s && s.value) || "group";
}

function sortMembers(list, how){
  list = list.slice();
  if(how === "title") list.sort(function(a,b){ return a.title.localeCompare(b.title); });
  else if(how === "events") list.sort(function(a,b){ return b.events.length - a.events.length; });
  else if(how === "medium") list.sort(function(a,b){
    return (a.medium||"").localeCompare(b.medium||"") || a.divergence.year - b.divergence.year; });
  else list.sort(function(a,b){ return a.divergence.year - b.divergence.year; });
  return list;
}

function visibleLineages(){
  var list = DATA.lineages.filter(matches);
  var gi = {}; DATA.groups.forEach(function(g,i){ gi[g.id] = i; });
  var how = sortMode();
  var out = [];
  DATA.groups.forEach(function(g){
    out = out.concat(sortMembers(list.filter(function(l){ return l.group === g.id; }), how));
  });
  return out;
}

/* An event the real world has since contradicted: dated to a year now behind us,
   close enough to check, and it did not happen. An alternate history set in 1947
   is not contradicted - its fork is the premise. */
function overtaken(e){
  if(e.historyContradicts === true || e.historyContradicts === false) return e.historyContradicts;
  if(e.kind === "publication") return false;
  return e.year >= 1990 && e.year < NOW;
}
