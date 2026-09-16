/* ============================================================ layout */
/* The chart is a tree. Real history is one horizontal trunk; every world is a
   branch that leaves it at its divergence year and settles into its own lane
   above or below. Archetypes are bundles of adjacent lanes on one side.

   Ordering rule, on each side: the world that forks EARLIEST sits OUTERMOST,
   both between bundles and within a bundle. A later fork then curves out to an
   inner lane without crossing an earlier branch's flat run.

   Every vertical measure is multiplied by the zoom Z, so the scene is exactly
   Z times its zoom-1 self: that is what lets the camera keep the point under
   the cursor fixed while zooming. */

function assignSides(groups, counts){
  var sides = {}, load = { "-1":0, "1":0 };
  groups.forEach(function(g){
    var n = counts[g.id] || 0;
    if(!n) return;
    var s = g.side === "above" ? -1 : g.side === "below" ? 1
          : (load["-1"] <= load["1"] ? -1 : 1);
    sides[g.id] = s;
    load[String(s)] += n;
  });
  return sides;
}

function layout(list){
  var counts = {};
  list.forEach(function(l){ counts[l.group] = (counts[l.group] || 0) + 1; });
  var sides = assignSides(DATA.groups, counts);
  var how = sortMode();

  var perSide = { "-1":[], "1":[] };
  DATA.groups.forEach(function(g){
    var members = list.filter(function(l){ return l.group === g.id; });
    if(!members.length) return;
    var earliest = Math.min.apply(null, members.map(function(m){ return m.divergence.year; }));
    perSide[String(sides[g.id])].push({ g:g, members:sortMembers(members, how), earliest:earliest });
  });
  perSide["-1"].sort(function(a,b){ return a.earliest - b.earliest; });
  perSide["1"].sort(function(a,b){ return a.earliest - b.earliest; });

  var gap = LANE_GAP * Z, bgap = BUNDLE_GAP * Z, band = TRUNK_BAND * Z, pad = PAD_Y * Z;

  function sideHeight(bundles){
    var lanes = 0;
    bundles.forEach(function(b){ lanes += b.members.length; });
    return lanes * gap + Math.max(0, bundles.length - 1) * bgap;
  }
  var hAbove = sideHeight(perSide["-1"]), hBelow = sideHeight(perSide["1"]);
  var trunkY = pad + hAbove + band;
  /* the axis year labels hang under the trunk, so the lower half starts a
     little further away than the upper one; this is screen pixels, not scaled */
  var height = trunkY + band + TRUNK_BELOW_EXTRA + hBelow + pad;

  var lanes = [], bundles = [];

  /* above the trunk: outermost bundle at the top, reading downward */
  var y = pad + gap/2;
  perSide["-1"].forEach(function(b){
    var y0 = y - gap/2;
    b.members.forEach(function(l){ lanes.push({ l:l, y:y, side:-1, g:b.g }); y += gap; });
    bundles.push({ g:b.g, side:-1, y0:y0, y1:y - gap/2, count:b.members.length });
    y += bgap;
  });

  /* below the trunk: outermost bundle at the bottom, reading upward */
  y = height - pad - gap/2;
  perSide["1"].forEach(function(b){
    var y1 = y + gap/2;
    b.members.forEach(function(l){ lanes.push({ l:l, y:y, side:1, g:b.g }); y -= gap; });
    bundles.push({ g:b.g, side:1, y0:y + gap/2, y1:y1, count:b.members.length });
    y -= bgap;
  });

  /* level of detail follows the lane pitch on screen */
  var lod = gap >= 24 ? 2 : gap >= 15 ? 1 : 0;

  return { lanes:lanes, bundles:bundles, trunkY:trunkY, height:height, height1:height / Z,
           gap:gap, lod:lod, nodeScale:clamp(gap / 34, 0.55, 1) };
}
