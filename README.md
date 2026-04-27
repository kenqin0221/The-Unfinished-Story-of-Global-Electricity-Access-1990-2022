# Wired World

### _The Unfinished Story of Global Electricity Access, 1990–2022_

A data visualization report by **Ken Qin** · Georgetown University · DSAN program · Spring 2026

**Live site:** https://kenqin0221.georgetown.domains/

---

## Why this report exists

Imagine going home tonight and the lights don't turn on. Not because of a power cut — because your house has never been connected to a power grid, and may never be. You cook over firewood. Your kids do homework by kerosene lamp. Your phone, if you have one, gets charged at a kiosk down the road, when the kiosk has fuel for its generator.

In 2022, **675 million people lived like this** every day. That's more than twice the population of the United States.

But here's the part most people don't know: in 1990, _1.5 billion_ people lived this way. In a single generation, more than 800 million people were connected to electricity for the first time. It's one of the largest, fastest, least-celebrated development achievements in human history. China alone connected an estimated 400 million rural residents. India connected 26 million households in 18 months under a single program. Bangladesh — once one of the lowest-access countries on Earth — climbed to 99.4% in 32 years.

And yet, in the same span of time, Sub-Saharan Africa stagnated. The _absolute_ number of people without power in the region has barely moved in 30 years, because population growth has kept pace with new connections. Today, the region holds roughly 85% of the global electricity gap. At current rates, it will reach maybe 65% access by 2030 — far short of the United Nations' goal of universal access by that year.

This report tells that story — the dramatic gains _and_ the calcified inequalities — through six visualizations, all built on real data from the World Bank.

---

## What you'll find on the site

The report is a longform scrolling page with six visualizations, in order. Each one answers a different question about the same underlying story.

### Section 1 — Five Regional Trajectories

A row of five small "sparkline" charts, one per world region, all on the same 0–100% y-axis. The same scale lets your eye directly compare. The dramatic East Asia climb (driven by China) and the patient, persistent flatness of the Sub-Saharan Africa line are visible at a glance.

### Section 2 — Seven Inflection Points (Scrollytelling)

A 30-year story told as you scroll. On the left, a chart with all 14 series faintly drawn. On the right, seven narrative cards: _Setting the scene · 1990_, _The divergence · 1990–2000_, _China's milestone · 2005–2014_, _South Asia's surge_, _East Africa's bright spots_, _The solar inflection_, _Where we stand · 2022_. As each card scrolls into view, the chart highlights the lines being discussed and marks the relevant year with a vertical guide. You're meant to read the cards and watch the chart — they're choreographed together.

### Section 3 — Country Snapshot

Nine focus countries — India, Bangladesh, Pakistan, China, Indonesia, Brazil, Kenya, Ethiopia, Nigeria — ranked by their 2022 access rate, with a translucent overlay showing each country's earliest-1990s baseline. The gap between the two bars _is_ the story: Bangladesh climbed +85 percentage points; Nigeria barely moved (+33 points over 32 years, despite oil wealth and 220 million people).

Hover any bar to see the exact baseline year used for that country. (The World Bank doesn't have 1990 observations for everyone, so we use each country's earliest available value in the 1990–1995 window, with a fallback to ~2000 for the few countries WB didn't report on at all in the early '90s — see the _Data_ section below.)

### Section 4 — Country Trajectory Explorer (Interactive)

Toggle the nine focus countries on or off; their full 1990–2022 trajectories overlay on a shared time axis. Hover the chart to read precise annual values. Useful for constructing your own comparisons — try India vs. Nigeria, the East African neighbors, or the BRICs together.

### Section 5 — Income vs. Access (Linked View · Interactive)

Two panels side by side. The left panel is a scatter plot mapping each country's 2022 GDP per capita (log scale) against its 2022 electricity access rate. The relationship is broadly upward — richer countries have higher access — but the surprises are the point. **Click any country dot** and the right panel loads that country's full 1990–2022 trajectory. Watch how Bangladesh, at roughly the same income level as Nigeria, got to 99.4% access while Nigeria sits at 60.5%. _Income matters, but policy and institutions matter more._

### Section 6 — Four Pathways to Universal Access

A static infographic synthesizing how countries actually reached universal access. Four mechanisms, each with an estimated share of new connections worldwide, a real-world example, and the countries best illustrating it: **National Grid Extension** (~55% — India SAUBHAGYA), **Off-Grid Solar Home Systems** (~20% — M-KOPA in East Africa), **Community Mini-Grids** (~15% — Nigeria REA), and **Policy & Financing Reform** (~10% — World Bank SE4All, AfDB Desert to Power). Estimates from the IEA _World Energy Outlook 2023_ and the World Bank/IEA _Tracking SDG 7_ report.

---

## The data

### Where it comes from

Two indicators, both from the **World Bank's World Development Indicators** — the same database the United Nations uses to track Sustainable Development Goal 7 (universal energy access by 2030):

| Indicator code   | Measures                              | Coverage                 |
| ---------------- | ------------------------------------- | ------------------------ |
| `EG.ELC.ACCS.ZS` | Population with electricity (% share) | 264 entities · 1990–2022 |
| `NY.GDP.PCAP.KD` | GDP per capita (constant 2015 USD)    | 261 entities · 1990–2022 |

Both are licensed **Creative Commons Attribution 4.0** — open data, free to use with attribution. Source URLs:

- https://data.worldbank.org/indicator/EG.ELC.ACCS.ZS
- https://data.worldbank.org/indicator/NY.GDP.PCAP.KD

### How it gets prepared

A single Python script — `scripts/preprocess.py` — handles the whole pipeline:

```
World Bank API
      │
      ▼  download (with offline cache for reproducibility)
data/raw/*.csv  (~560 KB total)
      │
      ▼  validate  (range checks, null drops, year filtering)
      ▼  normalize ("&" → "and" for region names)
      ▼  reshape   (long → wide-by-year for D3)
      ▼  baseline  (earliest available value per country, 1990–1995 window)
      ▼  interpolate  (linear, interior gaps only — never across countries)
      │
      ▼
site/assets/electricity_data.json  (~10 KB)
      │
      ▼  loaded at runtime by main_electricity.js
six rendered visualizations
```

Re-run any time:

```bash
python scripts/preprocess.py            # online refresh from WB API
python scripts/preprocess.py --offline  # rebuild from cached CSVs
python scripts/preprocess.py --dry-run  # validate only, don't write
```

### Honesty notes

This is a course project, but the data integrity standards are real. A few things worth being explicit about:

**Pre-1990 data does not exist for these countries.** The World Bank indicator begins in 1990 because that's when systematic, comparable household electrification surveys started. We did not extend the series backwards by fabrication — even when an earlier curve would have looked "more complete." For Bangladesh, that's not a data problem, it's a history problem: the country wasn't even independent until 1971.

**Each country's baseline year is real.** The bar chart's "before" overlay uses each country's earliest available WB observation in 1990–1995, with a fallback to ~2000 for the few countries WB simply didn't report on at the start of the '90s. Six of nine focus countries are anchored in 1990–1993 (true early-1990s data). Three (Pakistan, China, Ethiopia) fall back to 1998–2000. The exact baseline year is shown when you hover any bar, and recorded in the `baseline_year` field of the JSON.

**No null is replaced with a cross-country average.** That would be statistical malpractice — mixing a country at 30% with countries at 100%. The pipeline does linear interpolation only between two real bracketing observations of the _same_ entity, and only for interior gaps. Leading and trailing nulls are left as null. The chart line just starts later, which is the truth.

**Every imputed value is logged.** The output JSON contains a `meta.imputation` block documenting the methodology and an `imputed[]` array recording each filled point with its bracketing anchors. The methodology is auditable from the data file alone.

A few spot-checks against publicly known facts, to show the values are real:

| Claim                             | Value in our JSON | Public reference                                       |
| --------------------------------- | ----------------- | ------------------------------------------------------ |
| China reached 100% access in 2014 | 100.0%            | WB / IEA _SDG 7 Tracking Report_                       |
| Bangladesh, 2022                  | 99.4%             | WB · matches Rural Electrification Board narrative     |
| India, 2022                       | 99.2%             | WB · post-SAUBHAGYA                                    |
| Nigeria, 2022                     | 60.5%             | WB · matches the stagnation narrative                  |
| Sub-Saharan Africa, 2022          | 51.6%             | WB · ≈ 50% regional aggregate                          |
| World, 2022                       | 91.3%             | WB · matches the "675 million without" headline figure |

---

## Try it locally

The entire `site/` folder is a self-contained bundle of static files: one HTML, one CSS, one JS, one JSON. Total weight: ~104 KB. The only external dependency is D3 v7 from a CDN.

```bash
cd site
python3 -m http.server 8000
# then open http://localhost:8000/index_electricity.html
```

You need a real HTTP server (not just double-clicking the HTML) because the page loads the JSON via `fetch()`, which browsers block when the page is opened directly from disk.

To deploy: copy the contents of `site/` into your host's public root (e.g., `public_html/` on cPanel-based hosts like Georgetown Domains). That's it — no build step, no server-side code.

---

## Project layout

```
final_project/
├── data/
│   └── raw/                            cached WB CSVs (~560 KB)
│       ├── wb_electricity_access.csv
│       └── wb_gdp_per_capita.csv
├── scripts/
│   └── preprocess.py                   the data pipeline
├── site/                               <-- THE DEPLOYABLE BUNDLE
│   ├── index_electricity.html          the report page
│   ├── style_electricity.css           typography + layout
│   ├── main_electricity.js             the six visualizations (D3)
│   └── assets/
│       └── electricity_data.json       the data
└── README.md                           you are here
```

---

## Credits and reference reading

**Data** — World Bank Group, _World Development Indicators_. License: CC BY 4.0.

**Reference reading**

- World Bank / IEA / IRENA, _Tracking SDG 7: The Energy Progress Report 2023_
- IEA, _World Energy Outlook 2023_
- GOGLA, _Off-Grid Solar Market Trends Report 2022_
- Our World in Data, [_Access to Energy_](https://ourworldindata.org/energy-access) (overview article + curated dataset)

**Built with** — D3 v7, vanilla JavaScript, Python (pandas + requests), and a lot of patience for stubborn null values.

**Author** — Ken Qin, Georgetown University, Data Science and Analytics program, Spring 2026.

---

The trajectories on these charts are not abstract. They're hundreds of millions of evenings, hundreds of millions of children's homework hours, hundreds of millions of clinics that can or cannot keep vaccines refrigerated. 675 million people are still waiting for the lights to come on. Use this site to understand the shape of the problem — and to remember that it's not finished.
