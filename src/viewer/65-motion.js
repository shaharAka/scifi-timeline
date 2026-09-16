/* ============================================================ motion */
/* Three movements, all on the same idea: branches are drawn as strokes that
   can be shortened back to the trunk.
     growIn()         first paint - every branch grows out of the trunk
     playConvergence() the thesis performed - retract, hold, regrow
     animateLayout()  re-sort / filter - lanes glide to their new rows       */

function branchPaths(svg){
  var out = [];
  Array.prototype.forEach.call(svg.querySelectorAll(".core, .halo"), function(n){ out.push(n); });
  return out;
}
function branchDressing(svg){
  var out = [];
  Array.prototype.forEach.call(svg.querySelectorAll(
    ".node, .title, .ev-label, .leader, .fork, .cross, .flag, .cap, .ghost, .bundle-label"),
    function(n){ out.push(n); });
  return out;
}
/* Future segments are dashed by a CSS rule, which outranks a presentation
   attribute; so the animation arms the inline style as well (inline wins). */
function armDash(n, len, off){
  n.setAttribute("stroke-dasharray", len); n.setAttribute("stroke-dashoffset", off);
  if(n.style){ n.style.strokeDasharray = String(len); n.style.strokeDashoffset = String(off); }
}
function setOffset(n, off){
  n.setAttribute("stroke-dashoffset", String(off));
  if(n.style) n.style.strokeDashoffset = String(off);
}
function disarmDash(n){
  n.removeAttribute("stroke-dasharray"); n.removeAttribute("stroke-dashoffset");
  if(n.style){ n.style.strokeDasharray = ""; n.style.strokeDashoffset = ""; }
}
function pathLen(n){
  try{ if(n.getTotalLength) return Math.max(40, n.getTotalLength()); }catch(e){}
  return W * 1.5;
}
function forkFraction(n){
  var d = n.getAttribute("d") || "";
  var m = d.match(/^M([\d.\-]+)/);
  var x = m ? Number(m[1]) : 0;
  return clamp(x / Math.max(1, W), 0, 1);
}

function growIn(){
  if(REDUCED || grown) return;
  grown = true;
  var svg = document.getElementById("chart");
  var paths = branchPaths(svg), dress = branchDressing(svg);
  if(!paths.length) return;
  var L = paths.map(pathLen), start = paths.map(forkFraction);
  paths.forEach(function(n, i){ armDash(n, L[i], L[i]); });
  dress.forEach(function(n){ n.setAttribute("opacity", "0"); });
  var t0 = performance.now(), DUR = 1500;
  function frame(now){
    var p = clamp((now - t0) / DUR, 0, 1);
    paths.forEach(function(n, i){
      var local = clamp((p - start[i]*0.45) / 0.55, 0, 1);
      setOffset(n, L[i] * (1 - (1 - Math.pow(1 - local, 3))));
    });
    var dp = clamp((p - 0.45) / 0.55, 0, 1);
    dress.forEach(function(n){ n.setAttribute("opacity", String(dp)); });
    if(p < 1) requestAnimationFrame(frame);
    else {
      paths.forEach(disarmDash);
      dress.forEach(function(n){ n.removeAttribute("opacity"); });
    }
  }
  requestAnimationFrame(frame);
}

function playConvergence(){
  if(playing) return;
  var svg = document.getElementById("chart");
  var paths = branchPaths(svg), dress = branchDressing(svg);
  if(!paths.length) return;
  var L = paths.map(pathLen);
  paths.forEach(function(n, i){ armDash(n, L[i], 0); });

  playing = true;
  var btn = document.getElementById("converge");
  btn.classList.add("on");
  btn.textContent = "■ converging";
  svg.classList.add("converging");

  function done(){
    paths.forEach(disarmDash);
    dress.forEach(function(n){ n.removeAttribute("opacity"); });
    svg.classList.remove("converging");
    playing = false; btn.classList.remove("on");
    btn.innerHTML = "&#9654; Play convergence";
  }
  if(REDUCED){ done(); return; }

  var t0 = performance.now(), IN = 1300, HOLD = 520, OUT = 1200;
  var seed = paths.map(function(_, i){ return (i % 7) / 7; });
  function frame(now){
    var t = now - t0;
    if(t < IN){
      var p = t / IN;
      paths.forEach(function(n, i){
        var local = clamp((p - seed[i]*0.4) / 0.6, 0, 1);
        setOffset(n, L[i] * (1 - Math.pow(1 - local, 2)));
      });
      dress.forEach(function(n){ n.setAttribute("opacity", String(Math.max(0, 1 - p*1.7))); });
    } else if(t < IN + HOLD){
      dress.forEach(function(n){ n.setAttribute("opacity", "0"); });
    } else if(t < IN + HOLD + OUT){
      var p2 = (t - IN - HOLD) / OUT, e2 = Math.pow(p2, 0.6);
      paths.forEach(function(n, i){ setOffset(n, L[i] * (1 - e2)); });
      dress.forEach(function(n){ n.setAttribute("opacity", String(Math.min(1, p2*1.6))); });
    } else { done(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* The chart is rebuilt wholesale on every frame of the glide: at this size
   (a few hundred nodes) that is cheaper than tracking every element. */
function animateLayout(){
  if(REDUCED) return;
  var from = anim.from, target = lastTargets;
  if(!from || !target) return;
  var moved = Object.keys(target).some(function(id){
    return from[id] !== undefined && Math.abs(from[id] - target[id]) > 0.6;
  });
  if(!moved) return;
  cancelAnimationFrame(anim.raf);
  var t0 = performance.now();
  function frame(now){
    var p = Math.min(1, (now - t0) / anim.dur);
    var e = 1 - Math.pow(1 - p, 3);
    var y = {};
    Object.keys(target).forEach(function(id){
      var f = from[id] === undefined ? target[id] : from[id];
      y[id] = f + (target[id] - f) * e;
    });
    if(p < 1){ renderChart(y); anim.raf = requestAnimationFrame(frame); }
    else renderChart();
  }
  anim.raf = requestAnimationFrame(frame);
}
