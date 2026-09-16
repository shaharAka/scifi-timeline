/* ============================================================ scale */
/* Symmetric-log time axis. The present day sits at a fixed fraction of the
   width so the mapping stays invertible; pxFor and yearForPx must remain exact
   inverses (test-render.js checks this at several views). */

function clampSpan(h){ return Math.max(SPAN_MIN, Math.min(SPAN_MAX, h)); }
function warp(off){
  var a = Math.log1p(Math.abs(off) / WARP);
  if(a > WARP_LOG_CAP) a = WARP_LOG_CAP;
  return Math.sign(off) * a;
}
function anchorX(){ return LANE_R + (W - LANE_R - PAD_R) * ANCHOR; }
function warpX(off){
  var a = warp(off), b = warp(view.hs);
  return anchorX() + (((W - PAD_R) - anchorX()) * a) / b;
}
function pxFor(year){ return warpX(year - view.c); }
function yearForPx(px){
  var b = warp(view.hs);
  var a = ((px - anchorX()) * b) / ((W - PAD_R) - anchorX());
  return view.c + Math.sign(a) * Math.expm1(Math.abs(a)) * WARP;
}
