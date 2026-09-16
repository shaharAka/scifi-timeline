/* ============================================================ interactions */

var drag = null, tip = document.getElementById("tip");

function attachInteractions(svg){
  svg.onpointerdown = function(ev){
    if(ev.button !== 0) return;
    /* remember what was pressed: once the svg captures the pointer, pointerup is
       retargeted to the svg itself and ev.target no longer names the branch */
    drag = { x0:ev.clientX, y0:ev.clientY, c0:view.c, p0:panY, moved:0, target:ev.target };
    svg.classList.add("dragging");
    try{ svg.setPointerCapture(ev.pointerId); }catch(e){}
  };
  svg.onpointermove = function(ev){
    if(drag){
      var dx = ev.clientX - drag.x0, dy = (ev.clientY || 0) - (drag.y0 || 0);
      drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy));
      /* Order mode: x is sequence and always fills the width, so there is
         nothing to pan along it. Dragging still moves the tree vertically. */
      if(axisMode === "years") panTime(drag.c0, dx);
      panY = drag.p0 + dy;
      renderChart();
      return;
    }
    hoverCheck(ev);
    branchHover(ev);
    cursorMove(ev, svg);
  };
  svg.onpointerup = function(ev){
    var wasDrag = drag && drag.moved > 4;
    var pressed = drag && drag.target;
    drag = null;
    svg.classList.remove("dragging");
    try{ svg.releasePointerCapture(ev.pointerId); }catch(e){}
    if(wasDrag) return;
    var t = (pressed && pressed.getAttribute) ? pressed : ev.target;
    if(!t || !t.getAttribute) return;
    var lane = t.getAttribute("data-lane"), evId = t.getAttribute("data-ev");
    if(lane){ openWorld(lane); return; }
    if(!evId){ if(sel) closeWorld(); return; }   /* click on empty sky: step back out */
    if(evId){
      var parts = evId.split("|");
      var lin = DATA.lineages.filter(function(x){ return x.id === parts[0]; })[0];
      if(lin){
        var e = lin.events[Number(parts[1])];
        if(e) showTip(ev.clientX, ev.clientY, lin, e);
        openWorld(parts[0]);
      }
    }
  };
  svg.onpointerleave = function(){ hideTip(); setBranchHover(null); cursorHide(); };
  /* wheel: vertical = zoom the picture around the cursor (pinch arrives here
     too); horizontal = slide along time. Shift+wheel pans time as well. */
  svg.onwheel = function(ev){
    ev.preventDefault();
    var rect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : {left:0, top:0, width:W, height:Hv};
    var mx = (ev.clientX - rect.left) * (W / (rect.width || W));
    var my = ((ev.clientY || 0) - rect.top) * (Hv / (rect.height || Hv));
    var dX = ev.deltaX || 0, dY = ev.deltaY || 0;
    if(axisMode === "years" && (ev.shiftKey || Math.abs(dX) > Math.abs(dY))){
      panTime(view.c, -(ev.shiftKey ? dY : dX));
      renderChart();
      return;
    }
    /* In order mode only the lane pitch responds: wheel changes Z, and the
       cursor's x is irrelevant because x is not a quantity. */
    zoomAt(Math.exp(dY * (ev.ctrlKey ? 0.01 : 0.0016)), mx, my);
  };
  svg.ondblclick = function(ev){
    if(axisMode !== "years") return;      /* there is no year to zoom to */
    var rect = svg.getBoundingClientRect();
    var at = yearForPx((ev.clientX - rect.left) * (W / rect.width));
    view.c = view.c + (at - view.c) * 0.6;
    renderChart();
  };
}

/* move the view centre so that a drag of dx pixels reads as a slide in time */
function panTime(c0, dx){
  var scale = ((W - PAD_R) - anchorX()) / warp(view.hs);
  var a = (-dx) / scale;
  view.c = Math.max(-OFF_CAP, Math.min(OFF_CAP, c0 - Math.sign(a) * Math.expm1(Math.abs(a)) * WARP));
}

function hoverCheck(ev){
  var t = ev.target;
  if(!t || !t.getAttribute) return hideTip();
  var evId = t.getAttribute("data-ev");
  if(evId){
    var parts = evId.split("|");
    var lin = DATA.lineages.filter(function(x){ return x.id === parts[0]; })[0];
    if(lin){
      var e = lin.events[Number(parts[1])];
      if(e){
        if(evId !== lastTipId){ lastTipId = evId; ripple(t, lin._g.color); }
        return showTip(ev.clientX, ev.clientY, lin, e);
      }
    }
  }
  lastTipId = null;
  hideTip();
}
var lastTipId = null;

/* --- lighting one lineage up ------------------------------------------- */
function branchOf(node){
  var n = node, guard = 0;
  while(n && guard++ < 12){
    if(n.getAttribute && n.getAttribute("data-lane-group")) return n.getAttribute("data-lane-group");
    n = n.parentNode;
  }
  return null;
}
function branchHover(ev){
  setBranchHover(branchOf(ev.target));
}
function setBranchHover(id){
  var svg = document.getElementById("chart");
  if(!svg) return;
  if(hoverId && hoverId !== id){
    Array.prototype.forEach.call(svg.querySelectorAll("[data-lane-group]"), function(n){
      if(n.getAttribute("data-lane-group") === hoverId) n.classList.remove("hover");
    });
  }
  hoverId = id;
  if(id){
    Array.prototype.forEach.call(svg.querySelectorAll("[data-lane-group]"), function(n){
      if(n.getAttribute("data-lane-group") === id) n.classList.add("hover");
    });
    svg.classList.add("has-hover");
  } else {
    svg.classList.remove("has-hover");
  }
}

/* --- the scrubber -------------------------------------------------------- */
function svgX(ev, svg){
  var rect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : {left:0, width:W};
  return (ev.clientX - rect.left) * (W / (rect.width || W));
}
function cursorMove(ev, svg){
  if(!cursorEls || ev.clientX == null) return;
  var x = svgX(ev, svg);
  if(x < LANE_R || x > W - PAD_R){ cursorHide(); return; }
  var lanes = (lastLayout && lastLayout.lanes) || [];
  var year = yearForPx(x);
  var head, label;
  if(axisMode === "order"){
    /* The x-axis is sequence, so a year under the cursor is meaningless. What
       the column means is what has already happened there. */
    var nx = AX ? AX.now : x;
    var forked = 0;
    lanes.forEach(function(ln){ if(ln.l.divergence.year <= NOW) forked++; });
    if(x > nx){
      head = "after today";
      label = "  \u00b7  what has not happened yet";
    } else if(AX && AX.caption && x >= AX.caption.zoneA && x <= AX.caption.zoneB){
      head = "the fork zone";
      label = "  \u00b7  " + forked + " worlds leave our history here";
    } else {
      head = "before today";
      label = "  \u00b7  " + forked + " of " + lanes.length + " worlds have left";
    }
  } else {
    var forkedY = 0;
    lanes.forEach(function(ln){ if(ln.l.divergence.year <= year) forkedY++; });
    head = fmtYear(year);
    label = (year > NOW)
      ? "  \u00b7  " + (Math.round(year) - NOW) + " years ahead"
      : "  \u00b7  " + forkedY + " of " + lanes.length + " worlds have forked";
  }
  var c = cursorEls;
  c.line.setAttribute("x1", x); c.line.setAttribute("x2", x);
  c.text.textContent = "";
  var y1 = sEl("tspan", null, "n"); y1.textContent = head;
  var y2 = sEl("tspan", null, "m"); y2.textContent = label;
  c.text.appendChild(y1); c.text.appendChild(y2);
  var tw = label.length * 6.3 + 18;
  var px = clamp(x - tw/2, LANE_R, W - PAD_R - tw);
  c.pill.setAttribute("x", px); c.pill.setAttribute("width", tw);
  c.text.setAttribute("x", px + 9);
  c.g.setAttribute("opacity", "1");
}
function cursorHide(){ if(cursorEls) cursorEls.g.setAttribute("opacity", "0"); }
function ripple(target, color){
  if(!cursorEls || REDUCED) return;
  var cx = target.getAttribute("cx"), cy = target.getAttribute("cy");
  if(cx == null) return;
  var r = sEl("circle", {cx:cx, cy:cy, r:6, stroke:color}, "ripple");
  cursorEls.g.appendChild(r);
  setTimeout(function(){ if(r.parentNode) r.parentNode.removeChild(r); }, 800);
}

function showTip(cx, cy, l, e){
  var pre = e.year < l.divergence.year;
  var d = e.year - NOW;
  var dist = d === 0 ? "<b>this year</b>"
           : d < 0 ? "<b>" + fmtSpanYears(-d) + "</b> behind us"
           : "<b>" + fmtSpanYears(d) + "</b> ahead of us";
  var onBranch = l.events.filter(function(x){ return x.year >= l.divergence.year; });
  var first = l.divergence.year, last = onBranch.length ? onBranch[onBranch.length-1].year : first;
  var span = Math.max(1, last - first);
  var pos = pre ? 0 : clamp((e.year - first) / span, 0, 1);
  var nowPos = clamp((NOW - first) / span, 0, 1);
  var idx = onBranch.indexOf(e);
  if(tip.style.setProperty) tip.style.setProperty("--c", l._g.color);
  tip.innerHTML =
    '<div class="tt-h">' + esc(e.title) + '</div>' +
    '<div class="tt-m">' + esc(l.title) + ' \u00b7 ' + fmtYearFull(e.year) +
      (e.inUniverse ? ' \u00b7 ' + esc(e.inUniverse) : '') +
      (pre ? ' \u00b7 real history, before the fork' : '') + '</div>' +
    '<div class="tt-d">' + esc(e.description || '') + '</div>' +
    '<div class="tt-dist"><span>' + dist + '</span><span>' +
      (pre ? 'before this world forks' : 'beat ' + (idx + 1) + ' of ' + onBranch.length) + '</span></div>' +
    '<div class="tt-bar"><i style="width:' + (pos*100).toFixed(1) + '%"></i>' +
      (nowPos > 0 && nowPos < 1 ? '<em style="left:' + (nowPos*100).toFixed(1) + '%"></em>' : '') +
      '<span style="left:' + (pos*100).toFixed(1) + '%"></span></div>' +
    '<div class="tt-r"><span class="tag">' + esc(e.kind || 'event') + '</span>' +
      '<span class="tag">' + esc(e.tier) + (e.phase ? ' \u00b7 ' + esc(e.phase) : '') + '</span>' +
      '<span class="tag">confidence ' + esc(e.confidence) + '</span>' +
      (overtaken(e) ? '<span class="tag" style="color:var(--flag)">contradicted by real history</span>' : '') +
      (e.note ? '<span class="tag" style="color:var(--flag)">note</span>' : '') + '</div>';
  tip.classList.add("show");
  var r = tip.getBoundingClientRect();
  var x = cx + 16, y = cy + 16;
  if(x + r.width > window.innerWidth - 12) x = cx - r.width - 16;
  if(y + r.height > window.innerHeight - 12) y = cy - r.height - 16;
  tip.style.left = Math.max(8, x) + "px";
  tip.style.top = Math.max(8, y) + "px";
}
function fmtSpanYears(n){
  n = Math.round(n);
  if(n >= 1e9) return (Math.round(n/1e8)/10) + " billion years";
  if(n >= 1e6) return (Math.round(n/1e5)/10) + " million years";
  if(n >= 10000) return (Math.round(n/100)/10) + "k years";
  return n + (n === 1 ? " year" : " years");
}
function hideTip(){ tip.classList.remove("show"); }
