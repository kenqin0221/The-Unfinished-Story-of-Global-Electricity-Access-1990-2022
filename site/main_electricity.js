/* 
   main_electricity.js  —  Global Electricity Access 1990–2022
   VIZ-1  Static: small multiples  (5 region sparklines)
   VIZ-2  Static: ranked bar chart (country 1990 vs 2022)
   VIZ-3  Scrollytelling multi-line chart (6 steps)
   VIZ-4  Interactive country explorer (toggle buttons + tooltip)
   VIZ-5  Linked view: scatter (GDP × access) → timeline panel
   VIZ-6  Infographic: four pathways to electrification (SVG) */
"use strict";

/* Data flow:
     scripts/preprocess.py  →  site/assets/electricity_data.json
     index_electricity.html →  loads main_electricity.js
     main_electricity.js    →  fetches assets/electricity_data.json (this file)
   The whole /site directory is self-contained and deployable as static
   files (e.g. on Georgetown Domains). Source data: World Bank WDI
   (CC BY 4.0); see scripts/preprocess.py for the pipeline + sources. */
const DATA_URL = "assets/electricity_data.json";

/* Palette */
const C = {
  "World":                       "black",
  "Sub-Saharan Africa":          "orange",
  "South Asia":                  "purple",
  "East Asia and Pacific":       "green",
  "Latin America and Caribbean": "red",
  "India":                       "indigo",
  "Bangladesh":                  "blue",
  "Pakistan":                    "magenta",
  "China":                       "darkgreen",
  "Indonesia":                   "teal",
  "Brazil":                      "crimson",
  "Kenya":                       "gold",
  "Ethiopia":                    "brown",
  "Nigeria":                     "maroon",
};

const REGIONS   = ["World","Sub-Saharan Africa","South Asia",
                   "East Asia and Pacific","Latin America and Caribbean"];
const COUNTRIES = ["India","Bangladesh","Kenya","Ethiopia","Nigeria",
                   "China","Indonesia","Brazil","Pakistan"];
const ALL       = Object.keys(C);

/* Scroll steps */
const STEPS = [
  { label:"The divergence · 1996–2000",
    heading:"East Asia approached universal access. Sub-Saharan Africa lost ground.",
    body:"By 2000, the East Asia and Pacific region had reached 92.1%, with China alone at 96.7%. However, Sub-Saharan Africa's reported access rate actually declined during these time, which might caused by population growth and broader country coverage in the WB methodology outpaced infrastructure expansion. ",
    stat:"East Asia & Pacific: 92.1% (2000) · Sub-Saharan Africa: 28.5% → 25.7%",
    show:["Sub-Saharan Africa","East Asia and Pacific","South Asia","World"], yr:2000 },
  { label:"China's milestone · 2000–2014",
    heading:"China reached universal electrification — the fastest large-scale achievement in history.",
    body:"Starting at 96.7% in 2000, China connected its final rural households through the Rural Power Grid Upgrading programs, achieving 100% coverage by 2014.",
    stat:"China: 96.7% (2000) → 100.0% (2014)",
    show:["China","East Asia and Pacific","World"], yr:2014 },
  { label:"South Asia's surge · 2010–2020",
    heading:"India and Bangladesh became the story of the decade.",
    body:"India's SAUBHAGYA scheme (launched Sept. 2017) targeted 100% household electrification, connecting roughly 26 million homes by March 2019 — about 18 months. Bangladesh's Rural Electrification Board cooperative model lifted national access from 55.3% in 2010 to 96.2% in 2020 — adding roughly four percentage points per year, every year, for a decade.",
    stat:"South Asia region: 74.1% (2010) → 96.4% (2020)",
    show:["India","Bangladesh","Pakistan","South Asia"], yr:2020 },
  { label:"East Africa's bright spots · 2010–2022",
    heading:"Kenya's electrification stands out — but Nigeria's stagnation looms large.",
    body:"Kenya advanced from 19% in 2010 to 76% in 2022, driven by the Last Mile Connectivity Project and pay-as-you-go solar. Ethiopia rose from 26% to 55%. Nigeria — 220 million people, significant oil wealth — moved only from 48% to 60.5% over the same period.",
    stat:"Kenya: 19% → 76% · Nigeria: 48% → 60.5% (2010–2022)",
    show:["Kenya","Ethiopia","Nigeria","Sub-Saharan Africa"], yr:2022 },
  { label:"The solar inflection · 2015–2022",
    heading:"Off-grid solar began closing the gap where national grids could not reach.",
    body:"Falling solar panel costs and mobile-money platforms created a new pathway that pay-as-you-go off-grid solar. Sub-Saharan Africa's pace of progress more than doubled after 2015.",
    stat:"Sub-Saharan Africa: 29% (2005) → 52% (2022)",
    show:["Sub-Saharan Africa","Kenya","Ethiopia","World"], yr:2022 },
  { label:"Where we stand · 2022",
    heading:"675 million people remain without electricity. The gap is calcifying.",
    body:"Sub-Saharan Africa holds roughly 85% of the global electricity gap. Even at the accelerated post-2015 level, the region reaches only ~62% access by 2030 which is far behind the target.",
    stat:"SDG 7 target: 100% access by 2030 · Projected trajectory: ~62% in SSA",
    show:REGIONS, yr:2022 },
];

/*  Module-level state  */
let DATA = [], BAR_DATA = [], SCATTER_DATA = [];
let currentStep = -1;
// Scrolly chart handles
let sChart = null;
// Shared tooltip div
let TIP = null;

/* BOOT */
document.addEventListener("DOMContentLoaded", async () => {
  let json;
  try {
    json = await d3.json(DATA_URL);
  } catch (err) {
    console.error(
      `Failed to load ${DATA_URL} — check that the file exists and the ` +
      "page is being served over HTTP (not opened as file://). " +
      "Re-run `python scripts/preprocess.py` if the JSON is missing.",
      err
    );
    return;
  }
  if (!json || !Array.isArray(json.data)) {
    console.error(`${DATA_URL} loaded but did not contain expected shape ({ data: [...] }).`);
    return;
  }
  DATA         = json.data;
  BAR_DATA     = (json.bar || []).filter(d => !REGIONS.includes(d.country));
  SCATTER_DATA = json.scatter || [];

  TIP = document.createElement("div");
  Object.assign(TIP.style, {
    position:"fixed", background:"#0f2044", color:"#fff",
    padding:"6px 10px", borderRadius:"3px", fontSize:"12px",
    fontFamily:"var(--font-sans)", pointerEvents:"none",
    opacity:"0", transition:"opacity .12s", zIndex:"500",
    whiteSpace:"nowrap", lineHeight:"1.6",
  });
  document.body.appendChild(TIP);
  const safe = (fn, name) => {
    try { fn(); }
    catch (err) { console.error(`[${name}] render failed:`, err); }
  };

  safe(drawSmallMultiples, "drawSmallMultiples");
  safe(buildScrolly,       "buildScrolly");
  safe(buildStepCards,     "buildStepCards");
  safe(initScrollSpy,      "initScrollSpy");
  safe(drawBarChart,       "drawBarChart");
  safe(drawExplorer,       "drawExplorer");
  safe(drawLinkedView,     "drawLinkedView");
  safe(drawInfographic,    "drawInfographic");
  safe(initTOCSpy,         "initTOCSpy");
});

/*  Tooltip helpers  */
function showTip(e, html) {
  TIP.innerHTML = html;
  TIP.style.opacity = "1";
  moveTip(e);
}
function moveTip(e) {
  const x = e.clientX + 14, y = e.clientY - 32;
  TIP.style.left = x + "px";
  TIP.style.top  = y + "px";
}
function hideTip() { TIP.style.opacity = "0"; }

/*  Line generator factory  */
function makeLineGen(xS, yS) {
  return d3.line().x(d => xS(d.year)).y(d => yS(d.v))
    .defined(d => d.v != null).curve(d3.curveCatmullRom.alpha(0.5));
}

/*  Series helper  */
function series(name) {
  return DATA.filter(r => r[name] != null).map(r => ({ year: r.year, v: r[name] }));
}

/*  Shared axis styler  */
function styleAxis(sel) {
  sel.select(".domain").attr("stroke","#cbd5e1");
  sel.selectAll(".tick line").attr("stroke","#cbd5e1");
  sel.selectAll(".tick text")
    .attr("fill","#94a3b8")
    .attr("font-family","var(--font-mono)")
    .attr("font-size","9.5px");
}

/* VIZ-1  STATIC */
function drawSmallMultiples() {
  const wrap = document.getElementById("small-multiples");
  if (!wrap) return;

  REGIONS.forEach(name => {
    const vals = DATA.map(d => ({ year: d.year, v: d[name] })).filter(d => d.v != null);
    if (vals.length === 0) {
      // No data for this region
      console.warn(`[small-multiples] no data for region "${name}" — skipping`);
      const cell = document.createElement("div");
      cell.className = "sm-cell";
      cell.innerHTML = `
        <div class="sm-region">${name}</div>
        <div class="sm-val" style="color:#cbd5e1">—</div>
        <div class="sm-chg" style="color:#cbd5e1">no data</div>`;
      wrap.appendChild(cell);
      return;
    }
    const first = vals[0].v, last = vals[vals.length - 1].v;
    const firstYr = vals[0].year;
    const chg = (last - first).toFixed(1);
    const color = C[name];

    // Build sparkline path string
    const W = 180, H = 60;
    const xs = d3.scaleLinear().domain([1990, 2022]).range([4, W - 4]);
    const ys = d3.scaleLinear().domain([0, 105]).range([H - 4, 4]);
    const pathD = vals.map((d, i) =>
      (i === 0 ? "M" : "L") + xs(d.year).toFixed(1) + "," + ys(d.v).toFixed(1)
    ).join(" ");
    const lx = xs(vals[vals.length - 1].year).toFixed(1);
    const ly = ys(last).toFixed(1);

    const shortName = name.replace("Latin America and Caribbean","LAC")
                          .replace("East Asia and Pacific","East Asia & Pacific");

    const cell = document.createElement("div");
    cell.className = "sm-cell";
    cell.innerHTML = `
      <div class="sm-region">${shortName}</div>
      <div class="sm-val">${last.toFixed(1)}%</div>
      <div class="sm-chg up">▲ ${chg} pp since ${firstYr}</div>
      <svg viewBox="0 0 ${W} ${H}" class="sm-svg" style="margin-top:5px">
        <line x1="${xs(firstYr)}" y1="${ys(0)}" x2="${xs(firstYr)}" y2="${ys(100)}"
              stroke="#e2e8f0" stroke-width="0.5"/>
        <line x1="${xs(2022)}" y1="${ys(0)}" x2="${xs(2022)}" y2="${ys(100)}"
              stroke="#e2e8f0" stroke-width="0.5"/>
        <line x1="${xs(firstYr)}" y1="${ys(50)}" x2="${xs(2022)}" y2="${ys(50)}"
              stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="2,2"/>
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${lx}" cy="${ly}" r="3" fill="${color}"/>
        <text x="${xs(firstYr)}" y="${H - 1}" font-size="7" fill="#94a3b8"
              font-family="monospace" text-anchor="middle">${firstYr}</text>
        <text x="${xs(2022)}" y="${H - 1}" font-size="7" fill="#94a3b8"
              font-family="monospace" text-anchor="middle">2022</text>
      </svg>`;
    wrap.appendChild(cell);
  });
}

/*VIZ-2  STATIC — RANKED BAR CHART*/
function drawBarChart() {
  const el = document.getElementById("bar-chart");
  if (!el) return;

  const rows = [...BAR_DATA].sort((a, b) => a.access_2022 - b.access_2022);
  const m = { top: 16, right: 72, bottom: 32, left: 116 };
  const W = Math.max(el.clientWidth, 520);
  const ROW_H = 30;
  const IH = rows.length * ROW_H;
  const H = IH + m.top + m.bottom;

  const svg = d3.select(el).append("svg")
    .attr("width","100%").attr("viewBox",`0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform",`translate(${m.left},${m.top})`);
  const IW = W - m.left - m.right;

  const xS = d3.scaleLinear().domain([0,105]).range([0,IW]);
  const yS = d3.scaleBand().domain(rows.map(d=>d.country)).range([0,IH]).padding(0.3);

  // Grid
  [25,50,75,100].forEach(v => {
    g.append("line").attr("x1",xS(v)).attr("x2",xS(v)).attr("y1",0).attr("y2",IH)
      .attr("stroke","#e2e8f0").attr("stroke-dasharray","3,3");
    g.append("text").attr("x",xS(v)).attr("y",-4).attr("text-anchor","middle")
      .attr("fill","#94a3b8").attr("font-family","var(--font-mono)").attr("font-size","9px")
      .text(v + "%");
  });

  // Baseline (early-1990s) ghost bars
  g.selectAll(".bbase").data(rows.filter(d=>d.access_baseline!=null)).join("rect")
    .attr("class","bbase")
    .attr("x",0).attr("width",d=>xS(d.access_baseline))
    .attr("y",d=>yS(d.country) + yS.bandwidth()*0.5)
    .attr("height",yS.bandwidth()*0.32)
    .attr("fill",d=>C[d.country]||"#94a3b8").attr("opacity",0.25).attr("rx",1);

  // 2022 bars
  g.selectAll(".b22").data(rows).join("rect").attr("class","b22")
    .attr("x",0).attr("width",d=>xS(d.access_2022))
    .attr("y",d=>yS(d.country)).attr("height",yS.bandwidth()*0.65)
    .attr("fill",d=>C[d.country]||"#94a3b8").attr("rx",2)
    .on("mouseover",(e,d) => showTip(e,
      `<strong>${d.country}</strong><br>2022: ${d.access_2022}%<br>${d.baseline_year || "Baseline"}: ${d.access_baseline != null ? d.access_baseline + "%" : "n/a"}<br>Change: +${(d.access_2022-(d.access_baseline||0)).toFixed(1)} pp`))
    .on("mousemove", moveTip)
    .on("mouseleave", hideTip);

  // Labels
  g.selectAll(".bl").data(rows).join("text").attr("class","bl")
    .attr("x",-6).attr("y",d=>yS(d.country)+yS.bandwidth()*0.38)
    .attr("text-anchor","end").attr("dominant-baseline","middle")
    .attr("fill","#334155").attr("font-family","var(--font-sans)").attr("font-size","11px")
    .text(d=>d.country);

  // Value labels
  g.selectAll(".bv").data(rows).join("text").attr("class","bv")
    .attr("x",d=>xS(d.access_2022)+4).attr("y",d=>yS(d.country)+yS.bandwidth()*0.38)
    .attr("dominant-baseline","middle")
    .attr("fill","#64748b").attr("font-family","var(--font-mono)").attr("font-size","9.5px")
    .text(d=>d.access_2022.toFixed(0)+"%");

  // X axis
  g.append("g").attr("transform",`translate(0,${IH})`)
    .call(d3.axisBottom(xS).tickValues([0,25,50,75,100]).tickFormat(d=>d+"%").tickSize(3))
    .call(styleAxis);

  // Legend
  const leg = svg.append("g").attr("transform",`translate(${m.left},${H-6})`);
  [{l:"earliest baseline",op:0.25},{l:"2022",op:1}].forEach((d,i)=>{
    leg.append("rect").attr("x",i*110).attr("y",-10).attr("width",10).attr("height",8)
      .attr("fill","#1d4ed8").attr("opacity",d.op).attr("rx",1);
    leg.append("text").attr("x",i*110+13).attr("y",-3)
      .attr("fill","#64748b").attr("font-family","var(--font-sans)").attr("font-size","10px")
      .text(d.l);
  });
}

/*VIZ-3  SCROLLYTELLING*/
function buildScrolly() {
  const el = document.getElementById("scrolly-chart");
  if (!el) return;

  // The chart lives inside .chart-sticky → .chart-frame, both of which use
  // flex layout. .chart-sticky is height: calc(100vh - 70px) — so on a
  // typical viewport there's ~700-900px of vertical real estate available
  // for the chart panel. Previously H0 was hard-capped at 420px, leaving
  // a large empty region below the chart inside the framed panel. Now we
  // measure the flex-allocated height and use it directly.
  const m = { top:18, right:24, bottom:46, left:50 };
  const W0 = el.parentElement.clientWidth || 500;
  let H0 = el.clientHeight;
  if (!H0 || H0 < 280) {
    // clientHeight may be 0 if the layout hasn't settled — derive it from
    // the surrounding sticky container as a fallback.
    const sticky = el.closest(".chart-sticky");
    const stickyH = sticky ? sticky.clientHeight : (window.innerHeight - 90);
    // Subtract approximate header (50) + legend (70) + frame padding (28)
    H0 = Math.max(360, stickyH - 148);
  }
  // Cap on very tall windows so the chart doesn't get awkwardly stretched.
  H0 = Math.min(H0, Math.max(420, window.innerHeight * 0.78));
  const IW = W0 - m.left - m.right;
  const IH = H0 - m.top  - m.bottom;

  const svg = d3.select("#scrolly-chart").append("svg")
    .attr("width","100%").attr("height","100%")
    .attr("viewBox",`0 0 ${W0} ${H0}`)
    .attr("preserveAspectRatio","xMidYMid meet");
  const g = svg.append("g").attr("transform",`translate(${m.left},${m.top})`);

  const xS = d3.scaleLinear().domain([1990,2022]).range([0,IW]);
  const yS = d3.scaleLinear().domain([0,105]).range([IH,0]);

  // Grid
  [20,40,60,80,100].forEach(v => {
    g.append("line").attr("x1",0).attr("x2",IW)
      .attr("y1",yS(v)).attr("y2",yS(v))
      .attr("stroke","#e2e8f0").attr("stroke-dasharray","3,4");
  });

  // Axes
  g.append("g").attr("transform",`translate(0,${IH})`)
    .call(d3.axisBottom(xS).tickValues([1990,1995,2000,2005,2010,2015,2020,2022]).tickFormat(d3.format("d")).tickSize(3))
    .call(styleAxis)
    .selectAll(".tick text").attr("dy","1.4em");

  g.append("g")
    .call(d3.axisLeft(yS).tickValues([0,20,40,60,80,100]).tickFormat(d=>d+"%").tickSize(0))
    .call(styleAxis)
    .select(".domain").remove();

  const cursor = g.append("line").attr("class","yr-cursor")
    .attr("y1",0).attr("y2",IH)
    .attr("stroke","#1d4ed8").attr("stroke-width",1)
    .attr("stroke-dasharray","4,3").attr("opacity",0);

  const linesG = g.append("g");
  const dotsG  = g.append("g");
  const labG   = g.append("g");
  const yrLab  = g.append("text").attr("text-anchor","middle")
    .attr("fill","#1d4ed8").attr("font-family","var(--font-mono)")
    .attr("font-size","10px").attr("font-weight","500").attr("y",-4).attr("opacity",0);

  sChart = { g, xS, yS, cursor, linesG, dotsG, labG, yrLab, IW, IH };

  // Draw all lines initially
  ALL.forEach(name => {
    linesG.append("path").attr("class","sl-"+name.replace(/\s+/g,"_"))
      .attr("fill","none").attr("stroke",C[name]).attr("stroke-width",1.8)
      .attr("stroke-linecap","round").attr("opacity",0.06)
      .attr("d", makeLineGen(xS,yS)(series(name)));
  });

  // Legend
  const legEl = document.getElementById("scrolly-legend");
  if (legEl) {
    ALL.forEach(name => {
      const d = document.createElement("div");
      d.className = "leg-item"; d.dataset.name = name;
      d.innerHTML = `<span class="leg-dot" style="background:${C[name]}"></span>`
        + name.replace("Latin America and Caribbean","LAC").replace("East Asia and Pacific","E. Asia & Pac.");
      legEl.appendChild(d);
    });
  }
}

function buildStepCards() {
  const wrap = document.getElementById("scroll-steps");
  if (!wrap) return;
  STEPS.forEach((s,i) => {
    const div = document.createElement("div");
    div.className = "step"; div.dataset.index = i;
    div.innerHTML = `<p class="step-eyebrow">${s.label}</p>
      <h3>${s.heading}</h3><p>${s.body}</p>
      ${s.stat ? `<span class="step-stat">${s.stat}</span>` : ""}`;
    wrap.appendChild(div);
  });
}

function activateStep(idx) {
  if (idx === currentStep) return;
  currentStep = idx;
  if (!sChart) return;
  const step = STEPS[idx];
  const { xS, yS, cursor, linesG, dotsG, labG, yrLab, IW } = sChart;

  document.querySelectorAll(".step").forEach((el,i) => el.classList.toggle("is-active", i===idx));
  document.querySelectorAll(".leg-item").forEach(el => {
    el.style.opacity = step.show.includes(el.dataset.name) ? "1" : "0.18";
  });

  // Update line opacities
  ALL.forEach(name => {
    const active = step.show.includes(name);
    linesG.select(".sl-"+name.replace(/\s+/g,"_"))
      .transition().duration(350)
      .attr("opacity", active ? 1 : 0.04)
      .attr("stroke-width", active ? (name==="World"?2.8:2) : 1);
  });

  dotsG.selectAll("*").remove();
  labG.selectAll("*").remove();

  if (step.yr) {
    const cx = xS(step.yr);
    cursor.transition().duration(400).attr("x1",cx).attr("x2",cx).attr("opacity",1);
    yrLab.attr("x",cx).transition().duration(350).attr("opacity",0.9).text(step.yr);

    // Collision-aware label placement
    const placed = [];
    step.show.forEach(name => {
      const row = DATA.find(r => r.year === step.yr);
      if (!row || row[name] == null) return;
      let cy = yS(row[name]);

      // Nudge label to avoid overlap
      placed.sort((a,b)=>a-b);
      placed.forEach(py => { if (Math.abs(cy - py) < 12) cy = py - 13; });
      placed.push(cy);

      const color = C[name];
      dotsG.append("circle").attr("cx",cx).attr("cy",yS(row[name])).attr("r",0)
        .attr("fill","none").attr("stroke",color).attr("stroke-width",1).attr("opacity",0.3)
        .transition().duration(400).attr("r",10);
      dotsG.append("circle").attr("cx",cx).attr("cy",yS(row[name])).attr("r",0)
        .attr("fill",color).transition().duration(350).attr("r",4);

      const onLeft = cx > IW * 0.55;
      const short  = name.replace("Latin America and Caribbean","LAC")
                         .replace("East Asia and Pacific","E.Asia")
                         .replace("Sub-Saharan Africa","Sub-Sah.");
      labG.append("text")
        .attr("x", onLeft ? cx-12 : cx+12).attr("y", cy+4)
        .attr("text-anchor", onLeft ? "end" : "start")
        .attr("fill", color).attr("font-family","var(--font-mono)").attr("font-size","9px")
        .attr("opacity",0).text(`${short} ${row[name]}%`)
        .transition().duration(400).attr("opacity",1);
    });
  }
}

function initScrollSpy() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) activateStep(+e.target.dataset.index); });
  }, { rootMargin:"-40% 0px -40% 0px" });
  document.querySelectorAll(".step").forEach(el => obs.observe(el));
  // Activate first step immediately
  setTimeout(() => activateStep(0), 100);
}

/* VIZ-4  INTERACTIVE — COUNTRY EXPLORER */
function drawExplorer() {
  const btns = document.getElementById("explorer-btns");
  const chart = document.getElementById("explorer-chart");
  if (!btns || !chart) return;

  let selected = new Set(["India","Kenya","Bangladesh","China","Nigeria"]);

  const m = { top:18, right:30, bottom:40, left:52 };
  const W = Math.max(chart.clientWidth, 520);
  const H = 300;
  const IW = W - m.left - m.right;
  const IH = H - m.top  - m.bottom;

  const svg = d3.select("#explorer-chart").append("svg")
    .attr("width","100%").attr("viewBox",`0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform",`translate(${m.left},${m.top})`);

  const xS = d3.scaleLinear().domain([1990,2022]).range([0,IW]);
  const yS = d3.scaleLinear().domain([0,105]).range([IH,0]);

  [20,40,60,80,100].forEach(v => {
    g.append("line").attr("x1",0).attr("x2",IW).attr("y1",yS(v)).attr("y2",yS(v))
      .attr("stroke","#e2e8f0").attr("stroke-dasharray","3,4");
  });

  g.append("g").attr("transform",`translate(0,${IH})`)
    .call(d3.axisBottom(xS).tickValues([1990,1995,2000,2005,2010,2015,2020,2022]).tickFormat(d3.format("d")).tickSize(3))
    .call(styleAxis).selectAll(".tick text").attr("dy","1.4em");

  g.append("g").call(d3.axisLeft(yS).tickValues([0,20,40,60,80,100]).tickFormat(d=>d+"%").tickSize(0))
    .call(styleAxis).select(".domain").remove();

  const lG = g.append("g");
  const labG = g.append("g");

  // Hover overlay
  const overlay = g.append("rect").attr("width",IW).attr("height",IH)
    .attr("fill","none").attr("pointer-events","all");

  // Hover crosshair line
  const hLine = g.append("line").attr("y1",0).attr("y2",IH)
    .attr("stroke","#94a3b8").attr("stroke-width",1)
    .attr("stroke-dasharray","3,3").attr("opacity",0);

  overlay.on("mousemove",(e) => {
    const [mx] = d3.pointer(e);
    const yr = Math.round(xS.invert(mx));
    const snapped = [1990,1995,2000,2005,2010,2012,2014,2016,2018,2019,2020,2021,2022]
      .reduce((a,b) => Math.abs(b-yr)<Math.abs(a-yr)?b:a);
    const row = DATA.find(r=>r.year===snapped);
    if (!row) return;
    const cx = xS(snapped);
    hLine.attr("x1",cx).attr("x2",cx).attr("opacity",0.5);
    const lines = [...selected].map(n =>
      `<strong style="color:${C[n]}">${n}</strong>: ${row[n]!=null ? row[n].toFixed(1)+"%" : "—"}`
    ).join("<br>");
    showTip(e, `<strong>${snapped}</strong><br>${lines}`);
  }).on("mouseleave",() => { hideTip(); hLine.attr("opacity",0); });

  function redraw() {
    COUNTRIES.forEach(name => {
      const on = selected.has(name);
      const pts = series(name);
      const existing = lG.select(".ex-"+name.replace(/\s+/g,"_"));
      if (existing.empty()) {
        lG.append("path").attr("class","ex-"+name.replace(/\s+/g,"_"))
          .attr("fill","none").attr("stroke",C[name]).attr("stroke-linecap","round")
          .attr("d",makeLineGen(xS,yS)(pts));
      }
      lG.select(".ex-"+name.replace(/\s+/g,"_"))
        .transition().duration(250)
        .attr("opacity", on ? 1 : 0.05)
        .attr("stroke-width", on ? 2.2 : 1);
    });

    // End labels
    labG.selectAll("*").remove();
    [...selected].forEach(name => {
      const pts = series(name);
      const last = pts[pts.length-1];
      if (!last) return;
      labG.append("text").attr("x",xS(last.year)+4).attr("y",yS(last.v)+4)
        .attr("fill",C[name]).attr("font-family","var(--font-mono)").attr("font-size","9px")
        .text(name.substring(0,3).toUpperCase());
    });
  }

  // Build toggle buttons
  COUNTRIES.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "btn-toggle" + (selected.has(name) ? " on" : "");
    btn.textContent = name;
    if (selected.has(name)) { btn.style.background=C[name]; btn.style.borderColor=C[name]; }
    btn.addEventListener("click", () => {
      if (selected.has(name)) {
        selected.delete(name); btn.classList.remove("on");
        btn.style.background=""; btn.style.borderColor="";
      } else {
        selected.add(name); btn.classList.add("on");
        btn.style.background=C[name]; btn.style.borderColor=C[name];
      }
      redraw();
    });
    btns.appendChild(btn);
  });

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-clear"; resetBtn.textContent = "Reset";
  resetBtn.addEventListener("click", () => {
    selected = new Set(["India","Kenya","Bangladesh","China","Nigeria"]);
    btns.querySelectorAll(".btn-toggle").forEach(b => {
      const on = selected.has(b.textContent);
      b.classList.toggle("on", on);
      b.style.background = on ? C[b.textContent] : "";
      b.style.borderColor = on ? C[b.textContent] : "";
    });
    redraw();
  });
  btns.appendChild(resetBtn);

  redraw();
}

/* VIZ-5  LINKED VIEW */
function drawLinkedView() {
  const scatterEl  = document.getElementById("scatter-panel");
  const timelineEl = document.getElementById("timeline-panel");
  const selLabel   = document.getElementById("selected-country-label");
  if (!scatterEl || !timelineEl) return;

  /* Scatter */
  const sm = { top:20, right:20, bottom:48, left:58 };
  const SW  = Math.max(scatterEl.clientWidth, 300);
  const SH  = 280;
  const SIW = SW - sm.left - sm.right;
  const SIH = SH - sm.top  - sm.bottom;

  const sSVG = d3.select("#scatter-panel").append("svg")
    .attr("width","100%").attr("viewBox",`0 0 ${SW} ${SH}`);
  const sG = sSVG.append("g").attr("transform",`translate(${sm.left},${sm.top})`);

  const xScat = d3.scaleLog().domain([700,16000]).range([0,SIW]);
  const yScat = d3.scaleLinear().domain([40,105]).range([SIH,0]);

  [50,60,70,80,90,100].forEach(v => {
    sG.append("line").attr("x1",0).attr("x2",SIW).attr("y1",yScat(v)).attr("y2",yScat(v))
      .attr("stroke","#e2e8f0").attr("stroke-dasharray","3,3");
  });

  sG.append("g").attr("transform",`translate(0,${SIH})`)
    .call(d3.axisBottom(xScat).tickValues([1000,2000,5000,10000]).tickFormat(d=>"$"+d3.format(",")(d)).tickSize(3))
    .call(styleAxis).selectAll(".tick text").attr("dy","1.4em");

  sG.append("g").call(d3.axisLeft(yScat).tickValues([50,60,70,80,90,100]).tickFormat(d=>d+"%").tickSize(0))
    .call(styleAxis).select(".domain").remove();

  // Axis labels
  sG.append("text").attr("x",SIW/2).attr("y",SIH+40)
    .attr("text-anchor","middle").attr("fill","#94a3b8")
    .attr("font-family","var(--font-sans)").attr("font-size","9.5px")
    .text("GDP per capita, constant 2015 USD (log scale) · 2022");

  sG.append("text").attr("transform","rotate(-90)").attr("x",-SIH/2).attr("y",-46)
    .attr("text-anchor","middle").attr("fill","#94a3b8")
    .attr("font-family","var(--font-sans)").attr("font-size","9.5px")
    .text("Electricity access (%) 2022");

  const dots = sG.selectAll(".sc-dot").data(SCATTER_DATA).join("g")
    .attr("class","sc-dot").style("cursor","pointer")
    .attr("transform",d=>`translate(${xScat(d.gdp_per_capita)},${yScat(d.access_pct)})`);

  dots.append("circle").attr("r",7).attr("fill",d=>C[d.country]||"#1d4ed8")
    .attr("opacity",0.85).attr("stroke","#fff").attr("stroke-width",1.5);
  dots.append("text").attr("x",10).attr("y",4)
    .attr("fill","#475569").attr("font-family","var(--font-sans)").attr("font-size","9px")
    .text(d=>d.country);

  dots.on("mouseenter",(e,d) => {
    d3.select(e.currentTarget).select("circle").attr("r",10).attr("stroke-width",2);
    showTip(e, `<strong>${d.country}</strong><br>GDP per capita: $${d3.format(",")(d.gdp_per_capita)}<br>Access 2022: ${d.access_pct}%`);
  }).on("mousemove",moveTip)
    .on("mouseleave",(e) => {
      d3.select(e.currentTarget).select("circle").attr("r",7).attr("stroke-width",1.5);
      hideTip();
    })
    .on("click",(e,d) => {
      dots.select("circle").attr("stroke","#fff").attr("stroke-width",1.5);
      d3.select(e.currentTarget).select("circle").attr("stroke","#1d4ed8").attr("stroke-width",2.5);
      if (selLabel) selLabel.textContent = d.country;
      updateTimeline(d.country);
    });

  /* Timeline  */
  const tm = { top:18, right:28, bottom:42, left:52 };
  const TW  = Math.max(timelineEl.clientWidth, 300);
  const TH  = 280;
  const TIW = TW - tm.left - tm.right;
  const TIH = TH - tm.top  - tm.bottom;

  const tSVG = d3.select("#timeline-panel").append("svg")
    .attr("width","100%").attr("viewBox",`0 0 ${TW} ${TH}`);
  const tG = tSVG.append("g").attr("transform",`translate(${tm.left},${tm.top})`);

  const xT = d3.scaleLinear().domain([1990,2022]).range([0,TIW]);
  const yT = d3.scaleLinear().domain([0,105]).range([TIH,0]);

  [20,40,60,80,100].forEach(v => {
    tG.append("line").attr("x1",0).attr("x2",TIW).attr("y1",yT(v)).attr("y2",yT(v))
      .attr("stroke","#e2e8f0").attr("stroke-dasharray","3,4");
  });

  tG.append("g").attr("transform",`translate(0,${TIH})`)
    .call(d3.axisBottom(xT).tickValues([1990,1995,2000,2005,2010,2015,2020,2022]).tickFormat(d3.format("d")).tickSize(3))
    .call(styleAxis).selectAll(".tick text").attr("dy","1.4em");

  tG.append("g").call(d3.axisLeft(yT).tickValues([0,20,40,60,80,100]).tickFormat(d=>d+"%").tickSize(0))
    .call(styleAxis).select(".domain").remove();

  const tContent = tG.append("g");
  const tHint = tG.append("text").attr("x",TIW/2).attr("y",TIH/2-8)
    .attr("text-anchor","middle").attr("fill","#cbd5e1")
    .attr("font-family","var(--font-sans)").attr("font-size","11px").attr("font-style","italic")
    .text("← Select a country from the scatter plot");

  // Hover on timeline
  const tOverlay = tG.append("rect").attr("width",TIW).attr("height",TIH)
    .attr("fill","none").attr("pointer-events","all");
  tOverlay.on("mousemove",(e) => {
    if (!tContent.select(".t-path").size()) return;
    const [mx] = d3.pointer(e);
    const yr = Math.round(xT.invert(mx));
    const snapped = [1990,1995,2000,2005,2010,2012,2014,2016,2018,2019,2020,2021,2022]
      .reduce((a,b)=>Math.abs(b-yr)<Math.abs(a-yr)?b:a);
    const cname = tContent.attr("data-country");
    if (!cname) return;
    const row = DATA.find(r=>r.year===snapped);
    if (!row || row[cname]==null) return;
    showTip(e,`<strong>${cname}</strong><br>${snapped}: ${row[cname].toFixed(1)}%`);
  }).on("mouseleave",hideTip);

  function updateTimeline(country) {
    tHint.attr("opacity",0);
    tContent.attr("data-country",country);
    const pts = series(country);
    const lg  = makeLineGen(xT,yT);
    const ag  = d3.area().x(d=>xT(d.year)).y0(TIH).y1(d=>yT(d.v)).curve(d3.curveCatmullRom.alpha(0.5));
    const color = C[country] || "#1d4ed8";

    tContent.selectAll("*").remove();

    // Area
    tContent.append("path").attr("fill",color).attr("opacity",0.07).attr("d",ag(pts));

    // Reference: World average
    const wpts = series("World");
    tContent.append("path").attr("fill","none").attr("stroke","#94a3b8")
      .attr("stroke-width",1.2).attr("stroke-dasharray","4,3")
      .attr("d",lg(wpts));
    tContent.append("text").attr("x",xT(2022)+4).attr("y",yT(wpts[wpts.length-1].v)+4)
      .attr("fill","#94a3b8").attr("font-family","var(--font-mono)").attr("font-size","8.5px")
      .text("World");

    // Main line
    tContent.append("path").attr("class","t-path").attr("fill","none")
      .attr("stroke",color).attr("stroke-width",2.5).attr("stroke-linecap","round")
      .attr("d",lg(pts));

    // Data points
    tContent.selectAll(".tdot").data(pts).join("circle").attr("class","tdot")
      .attr("cx",d=>xT(d.year)).attr("cy",d=>yT(d.v))
      .attr("r",3).attr("fill",color).attr("opacity",0.75);

    // Annotations at 1990 and 2022
    [{p:pts[0],yr:1990},{p:pts[pts.length-1],yr:2022}].forEach(({p}) => {
      tContent.append("circle").attr("cx",xT(p.year)).attr("cy",yT(p.v))
        .attr("r",5).attr("fill",color).attr("stroke","#fff").attr("stroke-width",1.5);
      const onLeft = xT(p.year) > TIW*0.6;
      tContent.append("text")
        .attr("x", onLeft ? xT(p.year)-8 : xT(p.year)+8)
        .attr("y",yT(p.v)-10)
        .attr("text-anchor", onLeft ? "end" : "start")
        .attr("fill",color).attr("font-family","var(--font-mono)").attr("font-size","9px").attr("font-weight","500")
        .text(`${p.year}: ${p.v.toFixed(1)}%`);
    });

    // SDG 100% target line
    tContent.append("line").attr("x1",0).attr("x2",TIW)
      .attr("y1",yT(100)).attr("y2",yT(100))
      .attr("stroke","#15803d").attr("stroke-width",0.8).attr("stroke-dasharray","6,4").attr("opacity",0.5);
    tContent.append("text").attr("x",4).attr("y",yT(100)-4)
      .attr("fill","#15803d").attr("font-family","var(--font-sans)").attr("font-size","8.5px")
      .text("SDG target: 100%");
  }
}

/* VIZ-6 INFOGRAPHIC */
function drawInfographic() {
  const el = document.getElementById("infographic-svg-mount");
  if (!el) return;

  const VW = 900, VH = 460;

  const svg = d3.select(el).append("svg")
    .attr("width","100%").attr("viewBox",`0 0 ${VW} ${VH}`)
    .attr("style","display:block;max-width:100%;");

  // Background
  svg.append("rect").attr("width",VW).attr("height",VH).attr("fill","#f8f7f4");

  // Header band
  svg.append("rect").attr("x",0).attr("y",0).attr("width",VW).attr("height",56).attr("fill","#0f2044");
  svg.append("text").attr("x",VW/2).attr("y",22)
    .attr("text-anchor","middle").attr("fill","rgba(255,255,255,0.45)")
    .attr("font-family","var(--font-sans)").attr("font-size","9").attr("font-weight","600").attr("letter-spacing","2")
    .text("FIGURE 6  ·  INFOGRAPHIC");
  svg.append("text").attr("x",VW/2).attr("y",42)
    .attr("text-anchor","middle").attr("fill","#fff")
    .attr("font-family","var(--font-sans)").attr("font-size","15").attr("font-weight","700")
    .text("Four Pathways to Universal Electricity Access");

  const PATHWAYS = [
    { x:22, color:"#1d4ed8", num:"01",
      title:["National Grid","Extension"],
      share:"~55%", shareLabel:"of new connections",
      desc:["State-led programs extending","transmission & distribution","to rural areas. High upfront","cost; best for dense areas."],
      example:"India SAUBHAGYA: 26M households connected in 18 months (2017–2019)",
      countries:["India","Bangladesh","China","Pakistan"] },
    { x:242, color:"#b45309", num:"02",
      title:["Off-Grid Solar","Home Systems"],
      share:"~20%", shareLabel:"of new connections",
      desc:["Standalone solar systems","for lighting & phone charging.","Pay-as-you-go financing","enables low-income access."],
      example:"M-KOPA / d.light: 2M+ systems across East Africa",
      countries:["Kenya","Ethiopia"] },
    { x:462, color:"#15803d", num:"03",
      title:["Community","Mini-Grids"],
      share:"~15%", shareLabel:"of new connections",
      desc:["Solar or hybrid microgrids","serving 50–500 households.","Higher quality than SHS;","lower cost than grid extension."],
      example:"Nigeria REA mini-grid program; DRC rural electrification",
      countries:["Nigeria","Ethiopia","Kenya"] },
    { x:682, color:"#7c3aed", num:"04",
      title:["Policy &","Financing Reform"],
      share:"~10%", shareLabel:"of new connections",
      desc:["Subsidies, carbon credits,","results-based financing","and regulation that unlock","all three pathways above."],
      example:"World Bank SE4All; AfDB Desert to Power Initiative",
      countries:[] },
  ];

  const CW=196, CH=360, CT=68;

  // Arrow defs
  const defs = svg.append("defs");
  defs.append("marker").attr("id","arr2").attr("viewBox","0 0 10 10")
    .attr("refX","8").attr("refY","5").attr("markerWidth","5").attr("markerHeight","5")
    .attr("orient","auto-start-reverse")
    .append("path").attr("d","M2 2L8 5L2 8").attr("fill","none")
    .attr("stroke","#94a3b8").attr("stroke-width","1.5").attr("stroke-linecap","round");

  // Connector arrows between cards
  [0,1,2].forEach(i => {
    const x1 = PATHWAYS[i].x + CW + 2;
    const x2 = PATHWAYS[i+1].x - 2;
    const my = CT + CH/2;
    svg.append("line").attr("x1",x1).attr("x2",x2).attr("y1",my).attr("y2",my)
      .attr("stroke","#cbd5e1").attr("stroke-width","1").attr("stroke-dasharray","4,3")
      .attr("marker-end","url(#arr2)");
  });

  PATHWAYS.forEach(p => {
    const g = svg.append("g");

    // Card shadow
    g.append("rect").attr("x",p.x+2).attr("y",CT+3).attr("width",CW).attr("height",CH)
      .attr("rx",4).attr("fill","rgba(0,0,0,0.06)");

    // Card background
    g.append("rect").attr("x",p.x).attr("y",CT).attr("width",CW).attr("height",CH)
      .attr("rx",4).attr("fill","#fff").attr("stroke","#e2e8f0").attr("stroke-width","1");

    // Color top band
    g.append("rect").attr("x",p.x).attr("y",CT).attr("width",CW).attr("height",5)
      .attr("rx",4).attr("fill",p.color);
    // Fill bottom corners of band
    g.append("rect").attr("x",p.x).attr("y",CT+2).attr("width",CW).attr("height",3).attr("fill",p.color);

    // Number badge
    g.append("rect").attr("x",p.x+10).attr("y",CT+14).attr("width",24).attr("height",14)
      .attr("rx",2).attr("fill",p.color).attr("opacity",0.15);
    g.append("text").attr("x",p.x+22).attr("y",CT+24).attr("text-anchor","middle")
      .attr("fill",p.color).attr("font-family","var(--font-mono)").attr("font-size","9").attr("font-weight","700")
      .text(p.num);

    // Title lines
    p.title.forEach((line,i) => {
      g.append("text").attr("x",p.x+CW/2).attr("y",CT+42+i*16)
        .attr("text-anchor","middle").attr("fill","#0f2044")
        .attr("font-family","var(--font-sans)").attr("font-size","12").attr("font-weight","700")
        .text(line);
    });

    // Share pill
    g.append("rect").attr("x",p.x+CW/2-26).attr("y",CT+82).attr("width",52).attr("height",22)
      .attr("rx",11).attr("fill",p.color);
    g.append("text").attr("x",p.x+CW/2).attr("y",CT+97).attr("text-anchor","middle")
      .attr("fill","#fff").attr("font-family","var(--font-mono)").attr("font-size","10").attr("font-weight","600")
      .text(p.share);
    g.append("text").attr("x",p.x+CW/2).attr("y",CT+116).attr("text-anchor","middle")
      .attr("fill","#94a3b8").attr("font-family","var(--font-sans)").attr("font-size","8.5")
      .text(p.shareLabel);

    // Divider
    g.append("line").attr("x1",p.x+14).attr("x2",p.x+CW-14).attr("y1",CT+124).attr("y2",CT+124)
      .attr("stroke","#e2e8f0").attr("stroke-width","0.8");

    // Description lines
    p.desc.forEach((line,i) => {
      g.append("text").attr("x",p.x+12).attr("y",CT+140+i*14)
        .attr("fill","#475569").attr("font-family","var(--font-sans)").attr("font-size","9.5")
        .text(line);
    });

    // Example box
    const EY = CT+210;
    g.append("rect").attr("x",p.x+10).attr("y",EY).attr("width",CW-20).attr("height",78)
      .attr("rx",3).attr("fill","#f1f5f9").attr("stroke","#e2e8f0").attr("stroke-width","0.8");
    g.append("text").attr("x",p.x+16).attr("y",EY+13)
      .attr("fill",p.color).attr("font-family","var(--font-sans)").attr("font-size","8").attr("font-weight","700")
      .attr("letter-spacing","0.8").text("REAL-WORLD EXAMPLE");

    // Wrap example text to ~28 chars
    const ew = p.example.split(" ");
    const eLines = []; let cur="";
    ew.forEach(w => { const t=cur?cur+" "+w:w; if(t.length>30){eLines.push(cur);cur=w;}else cur=t; });
    if(cur)eLines.push(cur);
    eLines.slice(0,4).forEach((line,i)=>{
      g.append("text").attr("x",p.x+16).attr("y",EY+26+i*13)
        .attr("fill","#334155").attr("font-family","var(--font-sans)").attr("font-size","9")
        .text(line);
    });

    // Countries row (colored dots)
    if (p.countries.length) {
      g.append("text").attr("x",p.x+12).attr("y",CT+300)
        .attr("fill","#94a3b8").attr("font-family","var(--font-sans)").attr("font-size","8")
        .text("KEY COUNTRIES");
      p.countries.forEach((cn,i) => {
        g.append("circle").attr("cx",p.x+14+i*22).attr("cy",CT+315).attr("r",6)
          .attr("fill",C[cn]||"#94a3b8").attr("opacity",0.85);
        g.append("text").attr("x",p.x+14+i*22).attr("y",CT+332).attr("text-anchor","middle")
          .attr("fill","#94a3b8").attr("font-family","var(--font-sans)").attr("font-size","7")
          .text(cn.substring(0,3));
      });
    }
  });

  // Bottom annotation
  svg.append("text").attr("x",VW/2).attr("y",VH-8).attr("text-anchor","middle")
    .attr("fill","#94a3b8").attr("font-family","var(--font-sans)").attr("font-size","8.5")
    .text("Share estimates: IEA World Energy Outlook 2023 & World Bank Tracking SDG7 Report 2023. Categories represent dominant connection mechanism.");
}

/* TOC ACTIVE SCROLL SPY */
function initTOCSpy() {
  const sections = ["abstract","overview","narrative","country-snapshot","explorer","linked","pathways","findings","methodology"];
  const links = document.querySelectorAll(".toc-inner a");

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        links.forEach(a => a.classList.toggle("active", a.getAttribute("href")==="#"+id));
      }
    });
  }, { rootMargin:"-48px 0px -70% 0px" });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el);
  });
}
