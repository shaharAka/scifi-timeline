/* ============================================================================
   The axis: how a world's x-position is decided.

   Two modes, and the renderer knows nothing about which is active - it draws
   from AX and never from pxFor. That indirection is the whole point: the chart
   code answers "where does this fork sit" without knowing whether the answer
   came from a calendar or from a rank.

     years  the symmetric-log calendar. Honest and complete, but the entire
            dataset occupies a fraction of one percent of the x-range: forks
            squeeze into a few hundred pixels while +/-48,000 years sits empty.
     order  position by sequence, not by date. Forks keep their order and spread
            across a fork zone; beats spread evenly along their branch; today is
            a fixed column. No world is off-canvas and no distance is drawn
            where there is no information.

   The years view is the evidence. The order view is the story.
   ========================================================================== */

var axisMode = "order";                    /* overridden by ATLAS.defaultAxis */

/* Every world in the visible list, placed once per render. */
var AX = null;

/* --- the calendar axis (unchanged behaviour) --------------------------------- */

function axisYears(list, left, right){
  return {
    mode: "years",
    now: pxFor(NOW),
    /* x is the one the renderer calls; beat/pre are kept as the same function
       under their older names so either reads correctly. */
    x:    function(l, e){ return pxFor(e.year); },
    fork: function(l){ return pxFor(l.divergence.year); },
    beat: function(l, e){ return pxFor(e.year); },
    pre:  function(l, e){ return pxFor(e.year); },
    end:  function(l){
      var last = l.divergence.year;
      (l.events || []).forEach(function(e){ if(e.year > last) last = e.year; });
      return pxFor(last);
    },
    offCanvas: false,
    caption: null
  };
}

/* --- the order axis ---------------------------------------------------------- */

/* Rules, from BRIEF-order-axis.md 1.1:
   - today is a fixed column, and everything left of it has happened.
   - worlds that fork BEFORE today share the fork zone, evenly spaced by rank
     (earliest leftmost). Worlds that fork AFTER today take the first slot right
     of today, in their own rank order, so their branch leaves the trunk in the
     dashed region.
   - beats spread evenly along the branch: those before today fill forkX..now so
     the last sits just short of today; those after today fill now..right so the
     last is not on the edge.
   - prehistory sits on the trunk, spread in its own order, so a two-billion-year
     -old artefact is one dot and exactly as important as any other.
*/
function axisOrder(list, left, right){
  var nx = left + 0.58 * (right - left);
  var zoneA = left + 0.10 * (nx - left);
  var zoneB = left + 0.48 * (nx - left);

  var before = list.filter(function(l){ return l.divergence.year <= NOW; })
                   .slice()
                   .sort(function(a, b){ return a.divergence.year - b.divergence.year; });
  var after  = list.filter(function(l){ return l.divergence.year > NOW; })
                   .slice()
                   .sort(function(a, b){ return a.divergence.year - b.divergence.year; });

  var nowX = nx;
  var forkX = {};
  var span = zoneB - zoneA;
  before.forEach(function(l, i){
    forkX[l.id] = before.length === 1
      ? zoneA + span * 0.5
      : zoneA + span * (i / (before.length - 1));
  });
  /* first slot right of today, plus a little clearance from the today plane */
  var afterStart = nx + Math.max(28, (right - nx) * 0.22);
  after.forEach(function(l, i){
    forkX[l.id] = afterStart + (i - 0) * ((right - afterStart) / Math.max(1, after.length + 1));
  });

  /* Placed once per world per render, then the accessors are pure lookups. */
  var cache = {};
  function placed(l){
    if(cache[l.id]) return cache[l.id];
    var fx = forkX[l.id];
    var dv = l.divergence.year;
    var pre = [], on = [];
    (l.events || []).forEach(function(e){
      if(e.year < dv) pre.push(e); else on.push(e);
    });

    /* Beats are every event from the fork onward, in year order. The fork
       itself is beat 0 conceptually, so a world whose first on-branch event is
       its own divergence sits exactly at the fork. */
    var before = on.filter(function(e){ return e.year <= NOW; });
    var after  = on.filter(function(e){ return e.year >  NOW; });
    var nx = nowX;
    var beatsBefore = before.map(function(e, i){
      /* i from 0..kBefore-1, so the last pre-today beat sits just short of today */
      return before.length === 0 ? fx
        : fx + (nx - fx) * (i / before.length);
    });
    var beatsAfter = after.map(function(e, j){
      /* j+1 over kAfter+1, so the last one is not on the right edge */
      return nx + (right - nx) * ((j + 1) / (after.length + 1));
    });

    var preX = [];
    var preEnd = Math.max(left + 8, fx - 12);
    pre.forEach(function(e, i){
      preX.push(pre.length === 1
        ? left + 8
        : left + 8 + (preEnd - (left + 8)) * (i / (pre.length - 1)));
    });

    /* a year appears at most once per lineage, so it is its own key */
    var X = {};
    before.forEach(function(e, i){ X[e.year] = beatsBefore[i]; });
    after.forEach(function(e, i){ X[e.year] = beatsAfter[i]; });
    pre.forEach(function(e, i){ X[e.year] = preX[i]; });

    var endX = beatsAfter.length ? beatsAfter[beatsAfter.length - 1]
             : beatsBefore.length ? beatsBefore[beatsBefore.length - 1]
             : fx;

    var res = { fork: fx, X: X, end: endX, hasAfter: after.length > 0 };
    cache[l.id] = res;
    return res;
  }

  /* every event, whichever side of the fork it sits on */
  function placeX(l, e){
    var p = placed(l);
    var xi = p.X[e.year];
    return xi === undefined ? p.fork : xi;
  }

  return {
    mode: "order",
    now: nowX,
    offCanvas: false,
    caption: { zoneA: zoneA, zoneB: zoneB,
               text: "worlds leave our history, in the order they do" },
    fork: function(l){ return placed(l).fork; },
    x: placeX,
    beat: placeX,
    pre:  placeX,
    end:  function(l){ return placed(l).end; }
  };
}

/* Built once per render, for the visible list. */
function buildAxis(list, left, right){
  AX = (axisMode === "years")
    ? axisYears(list, left, right)
    : axisOrder(list, left, right);
  return AX;
}
