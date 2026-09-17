/* ============================================================================
   Chains: aligning sequences of kinds of moment.

   The stories are not memoryless. What follows a kind of moment depends on the
   chain that led there, and with twenty-odd worlds no chain of length two
   repeats, so a higher-order transition count would be all ones. The chain is
   therefore used as a MATCH, not a count: two chains are aligned like two
   sequences, kinds scored by identity or by facet likeness, gaps allowed and
   charged, and what a story did next is read from the end of the alignment.

   Three uses:
     chainAlign(a, b)      local alignment of two chains (Smith-Waterman): the
                           best-matching stretch, for "chains nearest this one"
                           and for our own recent chain as a query.
     chainMSA(chains)      a progressive multiple alignment: every chain laid
                           into shared columns so that kinds several worlds
                           reach at about the same point in their story land in
                           the same column. This is the x-axis of the strands
                           view - the columns are where strands can bundle.
     chainKindSim()        kind-to-kind likeness from the facet signatures of
                           the moments in each kind, so "a plague" and "mass
                           death" can align as near-misses.

   Same kind scores 1; a facet-similar kind scores down to -1 as likeness falls
   from CH_SAME to CH_FAR; a gap costs CH_GAP. The three numbers are here, at
   the top, because they are the argument.
   ========================================================================== */

var CH_GAP  = -0.35;    /* a step one chain has and the other skips (chainAlign) */
var CH_MISS = -0.05;    /* unlike kinds sharing a column of the map (chainMSA only) */
var CH_INS  = -0.70;    /* opening a new column of the map for one chain's step (chainMSA only) */
var CH_SKIP = -0.15;    /* a chain passing a column without a step of its own (chainMSA only) */
var CH_SAME = 0.90;     /* facet likeness at or above this is as good as the same kind */
var CH_FAR  = 0.55;     /* facet likeness at or below this is a plain mismatch (-1) */
var CH_KIND_SIM = null;

/* mean facet likeness between the moments of kind a and the moments of kind b,
   over every moment in the atlas and in our own history. Built once. */
function chainKindSim(){
  if(CH_KIND_SIM) return CH_KIND_SIM;
  var byKind = {};
  function take(e){ if(e && e.bin && e.facets) (byKind[e.bin] = byKind[e.bin] || []).push(e.facets); }
  (DATA.lineages || []).forEach(function(l){ (l.events || []).forEach(take); });
  if(DATA.real && DATA.real.events) DATA.real.events.forEach(take);
  var kinds = Object.keys(byKind), sim = {};
  kinds.forEach(function(a){
    sim[a] = {};
    kinds.forEach(function(b){
      if(a === b){ sim[a][b] = 1; return; }
      if(sim[b] && sim[b][a] != null){ sim[a][b] = sim[b][a]; return; }
      var s = 0, n = 0;
      byKind[a].forEach(function(fa){ byKind[b].forEach(function(fb){ s += facetSim(fa, fb); n++; }); });
      sim[a][b] = n ? s / n : 0;
    });
  });
  CH_KIND_SIM = sim;
  return sim;
}

/* the score for putting kind a against kind b: 1 for the same kind, sliding to
   -1 as the facet likeness falls */
function chainScore(a, b){
  if(a === b) return 1;
  var S = chainKindSim(), s = (S[a] && S[a][b] != null) ? S[a][b] : 0;
  var t = (s - CH_FAR) / (CH_SAME - CH_FAR);
  return Math.max(-1, Math.min(1, 2 * t - 1));
}

/* --- pairwise local alignment ------------------------------------------------
   a, b: arrays of kind ids. Returns the best local alignment: its score, the
   matched index pairs, and the spans it covers in each chain. score / the
   shorter length is a usable 0..1 likeness. */
function chainAlign(a, b){
  var n = a.length, m = b.length, i, j;
  var H = [], best = 0, bi = 0, bj = 0;
  for(i = 0; i <= n; i++){ H.push(new Array(m + 1)); for(j = 0; j <= m; j++) H[i][j] = 0; }
  for(i = 1; i <= n; i++){
    for(j = 1; j <= m; j++){
      var d = H[i - 1][j - 1] + chainScore(a[i - 1], b[j - 1]);
      var u = H[i - 1][j] + CH_GAP, l = H[i][j - 1] + CH_GAP;
      var v = Math.max(0, d, u, l);
      H[i][j] = v;
      if(v > best){ best = v; bi = i; bj = j; }
    }
  }
  var pairs = [];
  i = bi; j = bj;
  while(i > 0 && j > 0 && H[i][j] > 0){
    var here = H[i][j];
    if(Math.abs(here - (H[i - 1][j - 1] + chainScore(a[i - 1], b[j - 1]))) < 1e-9){ pairs.push([i - 1, j - 1]); i--; j--; }
    else if(Math.abs(here - (H[i - 1][j] + CH_GAP)) < 1e-9) i--;
    else j--;
  }
  pairs.reverse();
  var norm = Math.max(1, Math.min(n, m));
  return { score:best, likeness:Math.max(0, Math.min(1, best / norm)), pairs:pairs,
           a0:i, a1:bi - 1, b0:j, b1:bj - 1 };
}

/* --- progressive multiple alignment ------------------------------------------
   chains: [{id, kinds:[...]}]. Returns { C, cols: {id: [column per step]} }.
   Every step of every chain gets exactly one column; columns are strictly
   increasing along a chain; a column holds at most one step of a chain.

   Built greedily: the two most alike chains seed a profile, then the chain
   most alike the profile joins it, and so on. Chain-versus-profile is a global
   alignment with free end gaps, so a short chain can sit anywhere along a long
   one without paying for the ends it does not have. */
function chainMSA(chains){
  var todo = chains.filter(function(c){ return c.kinds && c.kinds.length; });
  var cols = {};
  if(!todo.length) return { C:0, cols:cols };
  if(todo.length === 1){
    cols[todo[0].id] = todo[0].kinds.map(function(_, i){ return i; });
    return { C:todo[0].kinds.length, cols:cols };
  }
  /* profile: an array of columns, each a list of {id, step, kind}.
     A column is a POSITION along the story, so unlike kinds may share one
     freely: a mismatch costs almost nothing here, a gap costs CH_GAP, and only
     a match (or a near-miss by facets) is rewarded. That keeps the map to
     about as many columns as the longest chain; in chainAlign, where the
     question is likeness, a mismatch costs -1 as it should. */
  function colScore(kind, column){
    var s = 0; column.forEach(function(m){ s += Math.max(CH_MISS, chainScore(kind, m.kind)); });
    return s / column.length;
  }
  /* align one chain to the profile. Returns {score, ops} where ops walk the
     profile: {type:"match", step, col} | {type:"ins", step} (new column) | {type:"skip", col} */
  function alignToProfile(chain, profile){
    var n = chain.kinds.length, m = profile.length, i, j;
    var H = [], T = [];
    for(i = 0; i <= n; i++){ H.push(new Array(m + 1)); T.push(new Array(m + 1)); }
    for(i = 0; i <= n; i++) for(j = 0; j <= m; j++){ H[i][j] = 0; T[i][j] = 0; }
    /* skipping leading columns is free (row 0 stays 0); a chain's own leading
       steps open new columns and pay for each (column 0) */
    for(i = 1; i <= n; i++){ H[i][0] = i * CH_INS; T[i][0] = 2; }
    for(i = 1; i <= n; i++){
      for(j = 1; j <= m; j++){
        var d = H[i - 1][j - 1] + colScore(chain.kinds[i - 1], profile[j - 1]);
        var u = H[i - 1][j] + CH_INS;         /* chain step with no column: insertion */
        var l = H[i][j - 1] + CH_SKIP;        /* column the chain skips */
        var v = d, t = 1;
        if(u > v){ v = u; t = 2; }
        if(l > v){ v = l; t = 3; }
        H[i][j] = v; T[i][j] = t;
      }
    }
    /* trailing: skipping the profile's remaining columns is free; the chain's
       own remaining steps open new columns and pay for each */
    var best = -Infinity, bi = n, bj = m;
    for(j = 0; j <= m; j++) if(H[n][j] > best){ best = H[n][j]; bi = n; bj = j; }
    for(i = 0; i <= n; i++){ var v2 = H[i][m] + (n - i) * CH_INS; if(v2 > best){ best = v2; bi = i; bj = m; } }
    var ops = [];
    /* trailing: chain steps after bi are insertions after the profile; columns after bj are skipped */
    for(j = m; j > bj; j--) ops.push({ type:"skip", col:j - 1 });
    for(i = n; i > bi; i--) ops.push({ type:"ins", step:i - 1 });
    i = bi; j = bj;
    while(i > 0 && j > 0){
      var t2 = T[i][j];
      if(t2 === 1){ ops.push({ type:"match", step:i - 1, col:j - 1 }); i--; j--; }
      else if(t2 === 2){ ops.push({ type:"ins", step:i - 1 }); i--; }
      else { ops.push({ type:"skip", col:j - 1 }); j--; }
    }
    while(i > 0){ ops.push({ type:"ins", step:i - 1 }); i--; }
    while(j > 0){ ops.push({ type:"skip", col:j - 1 }); j--; }
    ops.reverse();
    return { score:best, ops:ops };
  }
  function merge(chain, profile, ops){
    var out = [], placed = {};
    ops.forEach(function(op){
      if(op.type === "match"){ var c = profile[op.col].slice(); c.push({ id:chain.id, step:op.step, kind:chain.kinds[op.step] }); out.push(c); }
      else if(op.type === "skip"){ out.push(profile[op.col].slice()); }
      else { out.push([{ id:chain.id, step:op.step, kind:chain.kinds[op.step] }]); }
    });
    return out;
  }
  /* seed with the two most alike chains */
  var bestPair = null;
  for(var x = 0; x < todo.length; x++) for(var y = x + 1; y < todo.length; y++){
    var pa = todo[x].kinds.map(function(k, i){ return [{ id:todo[x].id, step:i, kind:k }]; });
    var r = alignToProfile(todo[y], pa);
    if(!bestPair || r.score > bestPair.score) bestPair = { x:x, y:y, score:r.score };
  }
  var first = todo[bestPair.x], second = todo[bestPair.y];
  var profile = first.kinds.map(function(k, i){ return [{ id:first.id, step:i, kind:k }]; });
  profile = merge(second, profile, alignToProfile(second, profile).ops);
  var done = {}; done[first.id] = true; done[second.id] = true;
  var left = todo.filter(function(c){ return !done[c.id]; });
  while(left.length){
    var pick = null;
    left.forEach(function(c){
      var r = alignToProfile(c, profile);
      if(!pick || r.score > pick.r.score) pick = { c:c, r:r };
    });
    profile = merge(pick.c, profile, pick.r.ops);
    done[pick.c.id] = true;
    left = left.filter(function(c){ return !done[c.id]; });
  }
  profile.forEach(function(column, ci){
    column.forEach(function(m){
      if(!cols[m.id]) cols[m.id] = [];
      cols[m.id][m.step] = ci;
    });
  });
  return { C:profile.length, cols:cols };
}
