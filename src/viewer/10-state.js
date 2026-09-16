/* ============================================================ state */

var NOW = new Date().getFullYear();
var W = 900;              /* canvas width in px */
var Hv = 600;             /* canvas (viewport) height in px */
var H = 400;              /* height of the laid-out scene at the current zoom */

/* chart geometry at zoom 1 - see DESIGN.md "Chart anatomy". Everything vertical
   scales with Z, so the scene's y coordinates are simply Z times these. */
var LANE_R = 14;          /* left drawable edge (published for tests) */
var PAD_R = 14;           /* right drawable edge inset */
var PAD_Y = 34;           /* top/bottom padding; the outermost bundle heading sits in it */
var TRUNK_BAND = 42;      /* clear space either side of the trunk for the axis */
var LANE_GAP = 38;        /* lane pitch */
var BUNDLE_GAP = 22;      /* extra space between archetype bundles; the bundle label lives here */
var CURVE_W = 76;         /* horizontal length of the fork curve */

/* camera */
var Z = 1, Z_MIN = 0.28, Z_MAX = 3.2;   /* vertical zoom: lane pitch multiplier */
var panY = 0;                           /* vertical pan of the scene, px */

/* time axis. ANCHOR is where the view centre sits across the width: 0.5 makes
   an era preset's from/to the true left and right edges (the warp is symmetric
   in log space around the centre). Keep it a constant - see DESIGN.md. */
var ANCHOR = 0.5;
var WARP = 110;
var WARP_LOG_CAP = 1e4;
var SPAN_MIN = 8, SPAN_MAX = 300000;
var OFF_CAP = 5e9;

var view = { c:1990, hs:160 };
var sel = null, activeTab = "world";
var q = "", tagFilter = null, showAllEvents = false;
var groupOn = {};
var anim = { raf:0, from:null, dur:480 };
var curY = {};            /* lineage id -> y currently shown */
var lastTargets = null;   /* lineage id -> y the layout wants */
var lastLayout = null;
var playing = false;
var grown = false;
var hoverId = null;       /* lineage id under the pointer (or a hovered card) */
var cursorEls = null;     /* the scrubber's svg nodes, rebuilt with the chart */
var panelMode = "";       /* "" | "index" | "world" | "about" */

var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
