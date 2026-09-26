/* ============================================================================
   Arriving: the first thing a new reader sees, and links into the map.

   Most readers arrive from a shared link knowing nothing about the atlas. The
   map alone does not say what it is, so the first visit opens a short card:
   what this is in two sentences, the latest news as the way in, and the three
   things to know to read the lines. It is shown once per browser and can be
   reopened from About. A link that already names something (#news=, #world=,
   #kind=) skips the card and opens straight on it, because whoever shared it
   has already said what it is.

   News also gets a count on the News button while an item is fresh, so a
   returning reader sees that something happened since they last looked.
   ========================================================================== */

var WELCOME_KEY = "wwan-welcome-v1";

function welcomeSeen(){
  try{ return localStorage.getItem(WELCOME_KEY) === "1"; }catch(e){ return false; }
}
function welcomeMark(){
  try{ localStorage.setItem(WELCOME_KEY, "1"); }catch(e){}
}

function welcomeHtml(){
  var ls = DATA.lineages || [];
  var t = { optimistic:0, pessimistic:0, unknown:0 };
  ls.forEach(function(l){ t[(l.ending && l.ending.valence) || "unknown"]++; });
  var news = (typeof mpNewsList === "function") ? mpNewsList()[0] : null;
  var fresh = news && typeof mpNewsFresh === "function" && mpNewsFresh(news);
  var phone = typeof mpIsPhone === "function" && mpIsPhone();
  return '<div class="wl-card" role="dialog" aria-modal="true" aria-labelledby="wl-title">'
    + '<button class="wl-x" id="wl-x" aria-label="Close">×</button>'
    + '<div class="wl-kicker">An atlas of science-fiction futures</div>'
    + '<h1 id="wl-title">Where We Are Now</h1>'
    + '<p class="wl-lede">' + ls.length + ' science-fiction worlds, each pinned to our real calendar. Every one '
    + 'leaves our history at a single moment and walks its own chain of events to an ending: '
    + '<b class="ok">' + t.optimistic + ' end well</b>, <b class="bad">' + t.pessimistic + ' end badly</b>, '
    + '<b class="open">' + t.unknown + ' are still open</b>.</p>'
    + '<p class="wl-lede">Lined up, they let you ask of today’s news: <i>which stories already walked this road, and where did it lead?</i></p>'
    + (news ? '<button class="wl-news" id="wl-news">'
        + '<span class="wl-news-k">' + (fresh ? '<span class="mp-new">New</span> ' : 'Latest news · ') + esc(fmtNewsDate(news.date)) + '</span>'
        + '<span class="wl-news-h">' + esc(news.headline) + '</span>'
        + '<span class="wl-news-go">See which futures passed through this →</span></button>' : '')
    + (phone ? '' : '<ul class="wl-how">'
    + '<li><svg width="34" height="14" aria-hidden="true"><line x1="1" y1="7" x2="33" y2="7" style="stroke:var(--trunk)" stroke-width="3.2" stroke-linecap="round"/></svg><span><b>Our history</b> is the heavy blue line, up to today.</span></li>'
    + '<li><svg width="34" height="14" aria-hidden="true"><path d="M1 12 C12 12,16 3,33 3" fill="none" style="stroke:var(--ok)" stroke-width="2"/><path d="M1 2 C12 2,16 11,33 11" fill="none" style="stroke:var(--bad)" stroke-width="2"/></svg><span><b>Each line is one world</b>, coloured by how it ends.</span></li>'
    + '<li><svg width="34" height="14" aria-hidden="true"><rect x="3" y="1" width="28" height="12" rx="6" style="fill:var(--surface);stroke:var(--ink-3)" stroke-width="1.2"/></svg><span>A <b>pill</b> is where several worlds reach the same kind of moment. Tap anything to read it.</span></li>'
    + '</ul>')
    + '<div class="wl-actions">'
    + (news ? '<button class="wl-btn primary" id="wl-go-news">Start with the news</button>' : '')
    + '<button class="wl-btn" id="wl-go-map">' + (phone ? 'Browse the stories' : 'Explore the map') + '</button>'
    + '</div></div>';
}

function showWelcome(){
  var host = document.getElementById("welcome");
  if(!host) return;
  host.innerHTML = welcomeHtml();
  host.hidden = false;
  host.classList.add("on");
  function close(){ welcomeMark(); host.classList.remove("on"); host.hidden = true; host.innerHTML = ""; }
  function toNews(){
    close();
    var n = mpNewsList()[0];
    if(!n) return;
    if(typeof pickerActive === "function" && pickerActive()){ pickerGo("news=" + mpNewsKey(n)); return; }
    if(axisMode !== "moments") setAxis("moments", false);
    momentsSelectNews(n);
  }
  host.onclick = function(ev){ if(ev.target === host) close(); };
  ["wl-x", "wl-go-map"].forEach(function(id){ var b = document.getElementById(id); if(b) b.onclick = close; });
  ["wl-news", "wl-go-news"].forEach(function(id){ var b = document.getElementById(id); if(b) b.onclick = toNews; });
  showWelcome._esc = function(e){ if(e.key === "Escape" && !host.hidden){ close(); } };
  document.addEventListener("keydown", showWelcome._esc);
  var first = document.getElementById("wl-go-news") || document.getElementById("wl-go-map");
  if(first && first.focus) try{ first.focus(); }catch(e){}
}

/* the News button counts items still fresh */
function renderNewsBadge(){
  var b = document.getElementById("btn-news");
  if(!b || typeof mpNewsList !== "function") return;
  var n = mpNewsList().filter(mpNewsFresh).length;
  var badge = b.querySelector ? b.querySelector(".nav-badge") : null;
  if(n){
    if(!badge){ badge = document.createElement("span"); badge.className = "nav-badge"; b.appendChild(badge); }
    badge.textContent = String(n);
    b.setAttribute("title", n + " new " + (n === 1 ? "item" : "items") + " since the last month");
  } else if(badge && badge.parentNode){ badge.parentNode.removeChild(badge); }
}

/* #news=<date or id>, #world=<id>, #kind=<id>: open straight on it */
function applyHash(){
  if(typeof location === "undefined" || !location.hash) return false;
  var m = /^#(news|world|kind)=(.+)$/.exec(decodeURIComponent(location.hash));
  if(!m) return false;
  var kind = m[1], v = m[2];
  if(axisMode !== "moments") setAxis("moments", false);
  if(kind === "news"){ var n = mpNewsByKey(v); if(!n) return false; momentsSelectNews(n); return true; }
  if(kind === "world"){ if(!DATA.lineages.some(function(l){ return l.id === v; })) return false; momentsSelectWorld(v); return true; }
  if(kind === "kind"){ momentsSelectKind(v); return true; }
  return false;
}

function welcomeInit(){
  renderNewsBadge();
  var linked = false;
  /* a phone opens on Stories, which reads the link itself */
  var phone = typeof pickerInit === "function" && pickerInit();
  if(phone) linked = typeof location !== "undefined" && /^#(news|world|kind)=/.test(location.hash || "");
  else try{ linked = applyHash(); }catch(e){ linked = false; }
  /* no modal where the app shell runs: its Today screen opens on the answer
     and explains itself, and a modal would cover exactly what a reader coming
     from a post came to see. pickerInit returns true on a phone only, so ask
     the shell directly. */
  var shell = typeof pickerActive === "function" && pickerActive();
  if(!linked && !welcomeSeen() && !phone && !shell) showWelcome();
  var again = document.getElementById("about-intro");
  if(again) again.onclick = function(){ setPanel(""); showWelcome(); };
}
