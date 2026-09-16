/* ============================================================================
   The Moments axis: columns are kinds of moment, not years and not ranks.

   The atlas is read from today's news. A real event is matched to the KIND of
   moment it is, every world that passed through that kind lights up, and each is
   read forward from that node - many futures for one present. So the x-axis here
   is the vocabulary: one column per bin, and a branch visits its columns in the
   canonical order of the kinds themselves, never in its own date order.

   That last point is the whole idea. Two worlds converge when they pass through
   the same kind of moment, and they converge in this view whether or not they
   ever agreed about a date. A branch must therefore run left to right through
   the columns even where its own chronology would jump about - the world's real
   sequence is preserved in the tooltip and in the Years view, which is what that
   view is for.

   Everything here degrades quietly: with no bins, or with bins the events do not
   use, the view says so instead of drawing an empty chart.
   ========================================================================== */

/* Where "today" sits among the kinds. Default: the column most worlds are
   currently at, which is the honest reading of "the kind of moment we are in".
   Overridable by ATLAS.todayStage when a hand-picked answer matters more. */
function todayColumnIndex(cols){
  if(!cols.length) return -1;
  var best = -1, bestN = -1;
  cols.forEach(function(c, i){
    var n = c.worlds.size;
    if(n > bestN){ bestN = n; best = i; }
  });
  return best;
}

function axisMoments(list, left, right){
  var bins = (typeof BINS !== "undefined" && BINS) ? BINS : [];
  var byId = {};
  bins.forEach(function(b){ byId[b.id] = b; });

  /* --- 1. each world's bin sequence, in canonical order -------------------
     Canonical order is the column order, so a world cannot run backwards by
     construction. Ties - several events in one kind - keep their year order so
     the vertical stack reads oldest at the top. */
  var seqOf = {};
  var touched = {};                       /* bin id -> Set of world ids */
  list.forEach(function(l){
    var seq = [];
    (l.events || []).forEach(function(e, i){
      if(e.bin && byId[e.bin]) seq.push({ e:e, bin:e.bin, idx:i, year:e.year });
    });
    seqOf[l.id] = seq;
    seq.forEach(function(s){
      if(!touched[s.bin]) touched[s.bin] = new Set();
      touched[s.bin].add(l.id);
    });
  });

  /* --- 2. order the columns by where their events sit in their worlds -----
     Mean position as a fraction of each world's own sequence, so a kind that
     tends to arrive late sits right and one that tends to arrive early sits
     left. The arc is produced by the events, not imposed. */
  var cols = [];
  Object.keys(touched).forEach(function(bid){
    var positions = [];
    list.forEach(function(l){
      var seq = seqOf[l.id];
      if(!seq.length) return;
      var at = -1;
      seq.forEach(function(s, i){ if(s.bin === bid && at < 0) at = i; });
      if(at >= 0 && seq.length > 1) positions.push(at / (seq.length - 1));
      else if(at >= 0) positions.push(0);
    });
    var sum = positions.reduce(function(a, b){ return a + b; }, 0);
    cols.push({
      bin: bid,
      spec: byId[bid] || { id:bid, label:bid, definition:"" },
      mean: positions.length ? sum / positions.length : 0,
      worlds: touched[bid],
      count: touched[bid].size,
      hits: 0                             /* filled below: number of events */
    });
  });
  list.forEach(function(l){
    seqOf[l.id].forEach(function(s){
      var c = null;
      for(var i = 0; i < cols.length; i++) if(cols[i].bin === s.bin){ c = cols[i]; break; }
      if(c) c.hits++;
    });
  });

  cols.sort(function(a, b){
    if(a.mean !== b.mean) return a.mean - b.mean;
    /* a stable, meaningful tiebreak: the more worlds share a kind, the earlier
       the kind tends to be in a story */
    if(a.count !== b.count) return b.count - a.count;
    return a.bin < b.bin ? -1 : 1;
  });

  /* --- 3. lay the columns out evenly across the canvas -------------------- */
  var n = cols.length;
  var colW = n ? (right - left) / n : (right - left);
  cols.forEach(function(c, i){
    c.x0 = left + i * colW;
    c.x1 = c.x0 + colW;
    c.cx = c.x0 + colW / 2;
    c.i = i;
  });

  /* events with no bin: real moments with nowhere to stand. Counted so the view
     can say so rather than silently dropping them. */
  var unbinned = 0;
  list.forEach(function(l){
    (l.events || []).forEach(function(e){ if(!e.bin || !byId[e.bin]) unbinned++; });
  });

  /* --- 4. the accessor ---------------------------------------------------- */
  var colOf = {};
  cols.forEach(function(c){ colOf[c.bin] = c; });

  function colFor(l, e){
    if(!e || !e.bin) return null;
    var c = colOf[e.bin];
    return c || null;
  }

  var nowIdx = -1;
  var wanted = (typeof ATLAS !== "undefined" && ATLAS && ATLAS.todayStage) || null;
  if(wanted && colOf[wanted]) nowIdx = colOf[wanted].i;
  else nowIdx = todayColumnIndex(cols);
  var nowX = (nowIdx >= 0 && cols[nowIdx]) ? cols[nowIdx].cx : (left + right) / 2;

  function anchorX(l, which){
    var seq = seqOf[l.id] || [];
    if(!seq.length) return left;
    var s = which === "last" ? seq[seq.length - 1] : seq[0];
    var c = colOf[s.bin];
    return c ? c.cx : left;
  }

  return {
    mode: "moments",
    now: nowX,
    columns: cols,
    unbinned: unbinned,
    caption: cols.length
      ? { text: cols.length + " kinds of moment \u00b7 "
              + list.filter(function(l){ return (seqOf[l.id] || []).length; }).length
              + " worlds placed" }
      : null,
    x: function(l, e){
      var c = colFor(l, e);
      return c ? c.cx : anchorX(l, "first");
    },
    fork: function(l){ return anchorX(l, "first"); },
    beat: function(l, e){ return this.x(l, e); },
    pre:  function(l, e){ return this.x(l, e); },
    end:  function(l){ return anchorX(l, "last"); },
    /* the vertical cluster of several events in one column, top to bottom */
    stack: function(l, e){
      var c = colFor(l, e);
      if(!c) return { i:0, n:1 };
      var same = (seqOf[l.id] || []).filter(function(s){ return s.bin === e.bin; });
      var at = -1;
      same.forEach(function(s, i){ if(s.e === e) at = i; });
      return { i: at < 0 ? 0 : at, n: Math.max(1, same.length) };
    },
    forkColumn: function(l){
      var seq = seqOf[l.id] || [];
      if(!seq.length) return null;
      return colOf[seq[0].bin] || null;
    },
    /* Moments has no date axis, so a real beat is placed by its own order along
       the trunk - the one reading that means the same thing here as in Order */
    realX: function(e){ return left + realBeatT(e) * (right - left); },
    offCanvas: false
  };
}
