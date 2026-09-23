/* ============================================================================
   News: real events that touch these worlds.

   Two places, for two different reasons. In the panel they are a reading list.
   On the chart they are a band beside the today line, because that is the one
   place on this page where a fiction's future and our present meet.

   The band is anchored to the today line rather than to each item's own date.
   That is deliberate: on a symmetric-log axis spanning 100,000 years, 2022 to
   2026 is a fraction of one pixel, so "positioned by date" would be a lie told
   at sub-pixel scale. The band is a stack, ordered newest first, and each row
   names its own date. Only the count of items is inferred, nothing else.
   ========================================================================== */

function newsItems(){
  return (DATA && DATA.news) || [];
}

/* Items touching one world, newest first (the payload already sorts them). */
function newsFor(id){
  return newsItems().filter(function(n){ return (n.worlds || []).indexOf(id) >= 0; });
}

/* --- the panel list --------------------------------------------------------- */

function renderNews(){
  var host = document.getElementById("news-list");
  if(!host) return;
  var items = newsItems();
  if(!items.length){
    host.innerHTML = '<p class="phint">No news yet. Add items to ' +
      '<code>data/news.json</code> and run the build; each one needs a date, a ' +
      'headline, a summary and a source.</p>';
    return;
  }
  host.innerHTML = items.map(function(n){
    var worlds = (n.worlds || []).map(function(wid){
      var l = DATA.lineages.filter(function(x){ return x.id === wid; })[0];
      if(!l) return "";
      return '<button class="news-world" data-goto="' + esc(wid) + '" style="' +
        colorVars(l._g.color) + ';color:var(--c-light)">' + esc(l.title) + '</button>';
    }).join("");
    var binId = n.bin || null;
    var spec = null;
    (BINS || []).forEach(function(b){ if(b.id === binId) spec = b; });
    var kind = binId
      ? '<button class="news-kind" data-bin="' + esc(binId) + '" data-key="' + esc(n.id || n.date) + '">Read the futures: '
        + esc(spec ? (spec.label || binId) : binId) + ' \u2192</button>'
      : '<div class="news-kind none">not matched to a kind of moment yet</div>';
    return '<article class="news-item' + (binId ? ' matched' : '') + '">' +
      '<div class="news-date">' + esc(fmtNewsDate(n.date)) + '</div>' +
      '<h3 class="news-head">' + esc(n.headline) + '</h3>' +
      '<p class="news-sum">' + esc(n.summary) + '</p>' +
      (n.source && n.source.url
        ? '<a class="news-src" href="' + esc(n.source.url) + '" target="_blank" rel="noopener">' +
          esc(n.source.title || "source") + ' \u2197</a>'
        : '') +
      (worlds ? '<div class="news-worlds">' + worlds + '</div>' : '') +
      kind +
    '</article>';
  }).join("");
  Array.prototype.forEach.call(host.querySelectorAll("[data-goto]"), function(b){
    b.onclick = function(){ openWorld(b.getAttribute("data-goto")); };
  });
  /* the match: one click reads every world forward from this kind of moment */
  Array.prototype.forEach.call(host.querySelectorAll("[data-bin]"), function(b){
    b.onclick = function(){
      var id = b.getAttribute("data-bin"), key = b.getAttribute("data-key");
      var item = newsItems().filter(function(n){ return (n.id || n.date) === key; })[0]
              || newsItems().filter(function(n){ return n.bin === id; })[0] || { headline: id, bin: id };
      /* the reading lives on the Moments page, so go there */
      if(axisMode !== "moments" && typeof setAxis === "function") setAxis("moments", false);
      matchNews(item);
    };
  });
}

function fmtNewsDate(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if(!m) return String(iso || "");
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return parseInt(m[3], 10) + " " + months[parseInt(m[2], 10) - 1] + " " + m[1];
}

/* --- the band, in the free space to the right ------------------------------

   It is anchored to the right edge rather than to the today line. Anchoring it
   to the line put it directly under the densest cluster of branch titles, and
   the right of the chart is empty at every era preset because no world's events
   reach that far. The band names the today line in its own heading, so it still
   reads as belonging to it.

   Rows are NOT positioned by their date: on a symmetric-log axis spanning
   100,000 years, 2022 to 2026 is a fraction of one pixel, so "positioned by
   date" would be a lie told at sub-pixel scale. Each row carries its own date.
   --------------------------------------------------------------------------- */

function renderNewsBand(parent, nx, top, height){
  var items = newsItems();
  if(!items.length) return;
  /* The band belongs to the calendar. In Order the today column already says
     what has happened; in Moments the x-axis is a kind of moment, so a band of
     items anchored to the right edge would be attached to nothing. The panel
     keeps every item, and in Moments the match is what replaces the band. */
  if(AX && AX.mode !== "years") return;   /* Moments draws its own flag on the trunk */
  /* the box belongs to the today line; when the line is off screen, so is the box */
  if(!(nx >= 0 && nx <= W)) return;

  var w = 250;
  var x = W - w - 14;
  /* bottom right: the far-future titles hang off the top right edge, and the
     lower right quarter is where the fewest branches run */
  var maxRows = Math.max(1, Math.floor((height - 90) / 21));
  var rows = items.slice(0, Math.min(maxRows, 4));
  var h = 30 + rows.length * 21 + 6;
  var y0 = Math.max(top + 30, height - h - 40);

  var g = sEl("g", null, "news-band");
  g.appendChild(sEl("rect", {x:x, y:y0, width:w, height:h, rx:4}, "news-field"));
  var head = sEl("text", {x:x + 10, y:y0 + 15}, "news-head-label");
  head.textContent = "SINCE THE TODAY LINE";
  g.appendChild(head);

  rows.forEach(function(n, i){
    var ry = y0 + 32 + i * 21;
    var row = sEl("g", {transform:"translate(0," + ry + ")"}, "news-row");
    row.setAttribute("data-news-date", n.date);
    var hit = sEl("rect", {x:x + 6, y:-9, width:w - 12, height:19}, "news-hit");
    row.appendChild(hit);
    var d = sEl("text", {x:x + 10, y:3.5}, "news-row-date");
    d.textContent = fmtNewsDate(n.date);
    row.appendChild(d);
    var t = sEl("text", {x:x + 84, y:3.5}, "news-row-head");
    var span = Math.max(8, Math.floor((w - 94) / 5.25));
    t.textContent = n.headline.length > span ? n.headline.slice(0, span - 1) + "\u2026" : n.headline;
    row.appendChild(t);
    var ids = n.worlds || [];
    hit.addEventListener("mouseenter", function(){ setBranchHover(ids.length === 1 ? ids[0] : null); });
    hit.addEventListener("mouseleave", function(){ setBranchHover(null); });
    hit.addEventListener("click", function(){ renderNews(); setPanel("news"); });
    g.appendChild(row);
  });
  parent.appendChild(g);
}
