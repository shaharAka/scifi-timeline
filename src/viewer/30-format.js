/* ============================================================ format */

function fmtYear(y){
  y = Math.round(y);
  if(Math.abs(y) >= 1e9) return (Math.round(y/1e8)/10) + "bn";
  if(Math.abs(y) >= 1e6) return (Math.round(y/1e5)/10) + "m";
  if(y <= -10000 || y >= 10000) return (Math.round(y/100)/10) + "k";
  if(y < 0) return Math.abs(y) + " BC";
  return String(y);
}
function fmtYearFull(y){ y = Math.round(y); return y < 0 ? Math.abs(y) + " BC" : String(y); }
function fmtSpan(y){
  var a = Math.abs(Math.round(y)), s;
  if(a >= 1e9) s = (Math.round(a/1e8)/10) + "bn";
  else if(a >= 1e6) s = (Math.round(a/1e5)/10) + "m";
  else if(a >= 1e4) s = (Math.round(a/100)/10) + "k";
  else s = String(a);
  return y < 0 ? s + " BC" : s + " CE";
}
function esc(s){
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
/* The atlas copy uses four inline marks: **bold**, *italic*, `code`, ==now==. */
function mark(s){
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/==([^=]+)==/g, '<span class="now-inline">$1</span>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
}
function mediumLabel(m){
  return ({film:"film", tv:"TV", book:"book", game:"game", comic:"comic"})[m] || m || "";
}
function niceTicks(lo, hi, target){
  var span = hi - lo;
  if(span <= 0) return [];
  var raw = span / Math.max(1, target);
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var norm = raw / mag;
  var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  var out = [];
  for(var y = Math.ceil(lo/step)*step; y <= hi; y += step) out.push(y);
  return out;
}
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
