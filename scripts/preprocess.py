"""
preprocess.py
=============
Fetches, validates, and transforms raw electricity-access and GDP data
from two public sources into a single JSON file consumed by the
Wired World visualization (site/assets/electricity_data.json).

Usage
-----
    python scripts/preprocess.py               # full pipeline (downloads + writes)
    python scripts/preprocess.py --offline     # use cached raw CSVs, skip download
    python scripts/preprocess.py --dry-run     # fetch + validate, print summary, no write

Project layout expected
-----------------------
    FINAL_PROJECT/
    ├── data/
    │   └── raw/
    │       ├── wb_electricity_access.csv   <- downloaded & cached by this script
    │       └── wb_gdp_per_capita.csv       <- downloaded & cached by this script
    ├── scripts/
    │   └── preprocess.py                   <- this file
    └── site/
        └── assets/
            └── electricity_data.json       <- output consumed by main_electricity.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA SOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SOURCE 1 — Electricity Access
  Provider  : World Bank — World Development Indicators (WDI)
  Indicator : EG.ELC.ACCS.ZS
              "Access to electricity (% of population)"
  API URL   : https://api.worldbank.org/v2/country/all/indicator/EG.ELC.ACCS.ZS
  Portal    : https://data.worldbank.org/indicator/EG.ELC.ACCS.ZS
  License   : Creative Commons Attribution 4.0 (CC BY 4.0)
              https://datacatalog.worldbank.org/public-licenses#cc-by
  Coverage  : ~217 countries and regions · annual · 1990–2022
  Definition: Share of the population with access to electricity.
              Data are collected from multiple sources, including
              household surveys (DHS, LSMS, MICS), energy ministries,
              utility data, and census records. Regional aggregates are
              population-weighted averages compiled by the World Bank
              in collaboration with the IEA and IRENA as part of the
              Tracking SDG 7: The Energy Progress Report.

SOURCE 2 — GDP Per Capita
  Provider  : World Bank — World Development Indicators (WDI)
  Indicator : NY.GDP.PCAP.KD
              "GDP per capita (constant 2015 US$)"
  API URL   : https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.KD
  Portal    : https://data.worldbank.org/indicator/NY.GDP.PCAP.KD
  License   : Creative Commons Attribution 4.0 (CC BY 4.0)
  Coverage  : ~217 countries · annual · 1990–2022
  Definition: Gross domestic product divided by midyear population,
              expressed in constant 2015 USD. Using a constant base year
              removes the effects of inflation and exchange-rate fluctuations,
              enabling cross-country and over-time comparisons.
              Used in the Section 5 scatter plot to illustrate the
              relationship between income level and electrification rate.

CITATION (recommended):
  World Bank. (2023). World Development Indicators.
  The World Bank Group. https://databank.worldbank.org/source/world-development-indicators
  License: CC BY 4.0.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT JSON SCHEMA  (site/assets/electricity_data.json)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "meta": {
    "generated_at": "ISO-8601 UTC timestamp",
    "sources": [
      {
        "name": str,        // data provider name
        "indicator": str,   // indicator code + description
        "url": str,         // canonical portal URL
        "license": str,     // license string
        "accessed": str     // YYYY-MM-DD date of download
      },
      ...
    ],
    "regions": [str, ...],       // 5 World Bank regional aggregates
    "spotlight": {               // 9 focus countries with editorial label
      country_name: label_str
    },
    "years": [int, ...],         // years present in "data" array
    "indicator_access": str,     // EG.ELC.ACCS.ZS
    "indicator_gdp": str         // NY.GDP.PCAP.KD
  },

  "data": [                      // Used by: VIZ-3 scrollytelling, VIZ-4 explorer
    {
      "year": int,
      "<Country/Region>": float, // access % for each entity, if available
      ...
    },
    ...                          // one object per year in meta.years
  ],

  "bar": [                       // Used by: VIZ-2 static bar chart
    {
      "country": str,
      "access_1990": float,      // access % in 1990 (null if unavailable)
      "access_2022": float       // access % in 2022
    },
    ...                          // sorted ascending by access_2022
  ],

  "scatter": [                   // Used by: VIZ-5 linked scatter plot
    {
      "country": str,
      "gdp_per_capita": float,   // constant 2015 USD, ~2022
      "access_pct": float        // electricity access %, 2022
    },
    ...
  ],

  "pop_no_elec": {               // Used by: infographic callout figures
    "<Region>": int              // millions of people without electricity (~2022)
  }
}
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

# ─────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────
ROOT     = Path(__file__).resolve().parents[1]
RAW_DIR  = ROOT / "data" / "raw"
OUTPUT   = ROOT / "site" / "assets" / "electricity_data.json"
RAW_ELEC = RAW_DIR / "wb_electricity_access.csv"
RAW_GDP  = RAW_DIR / "wb_gdp_per_capita.csv"

# ─────────────────────────────────────────────────────────────
# World Bank API settings
# ─────────────────────────────────────────────────────────────
WB_BASE   = "https://api.worldbank.org/v2"
WB_PARAMS = {"format": "json", "per_page": 20000, "date": "1990:2022"}

INDICATORS = {
    "access": {
        "code"     : "EG.ELC.ACCS.ZS",
        "label"    : "Access to electricity (% of population)",
        "url"      : "https://data.worldbank.org/indicator/EG.ELC.ACCS.ZS",
        "raw_path" : RAW_ELEC,
        "valid_min": 0.0,
        "valid_max": 100.0,
    },
    "gdp": {
        "code"     : "NY.GDP.PCAP.KD",
        "label"    : "GDP per capita (constant 2015 US$)",
        "url"      : "https://data.worldbank.org/indicator/NY.GDP.PCAP.KD",
        "raw_path" : RAW_GDP,
        "valid_min": 0.0,
        "valid_max": 250_000.0,
    },
}

# ─────────────────────────────────────────────────────────────
# Entities
# ─────────────────────────────────────────────────────────────
REGIONS = [
    "World",
    "Sub-Saharan Africa",
    "South Asia",
    "East Asia and Pacific",
    "Latin America and Caribbean",
]

# The World Bank API returns aggregate region names with "&" rather than
# "and". We normalize them to the canonical "and" form used throughout the
# project (in REGIONS above and in the front-end palette). Without this
# remap, those two regions are silently filtered out of every output and
# the front-end fails to render the small-multiples sparklines for them.
WB_NAME_REMAP = {
    "East Asia & Pacific"      : "East Asia and Pacific",
    "Latin America & Caribbean": "Latin America and Caribbean",
}

SPOTLIGHT = {
    "India"      : "South Asia riser",
    "Bangladesh" : "South Asia riser",
    "Pakistan"   : "South Asia riser",
    "China"      : "East Asia success",
    "Indonesia"  : "East Asia success",
    "Brazil"     : "LAC benchmark",
    "Kenya"      : "East Africa riser",
    "Ethiopia"   : "East Africa riser",
    "Nigeria"    : "West Africa (stalled)",
}

ALL_ENTITIES = REGIONS + list(SPOTLIGHT.keys())

# Years exposed to the frontend
YEARS_OUT = [1990, 1995, 2000, 2005, 2010, 2012, 2014, 2016, 2018, 2019, 2020, 2021, 2022]

# Approximate people without electricity (~2022, millions)
# Source: World Bank / IEA / IRENA — Tracking SDG7 Report 2023
POP_NO_ELEC = {
    "Sub-Saharan Africa"          : 570,
    "South Asia"                  : 110,
    "East Asia and Pacific"       : 15,
    "Latin America and Caribbean" : 20,
    "World"                       : 675,
}


# ══════════════════════════════════════════════════════════════
# STEP 1 — DOWNLOAD
# ══════════════════════════════════════════════════════════════

def wb_download(code: str) -> list[dict]:
    """
    Fetch all observations for a WDI indicator from the World Bank
    JSON REST API. Handles pagination automatically.

    The WB API returns:
        [ { "page": N, "pages": M, ... },   <- pagination header
          [ { "country": { "value": "..." }, "date": "YYYY", "value": 12.3, ... }, ... ] ]

    Returns the flat list of observation dicts across all pages.
    """
    url    = f"{WB_BASE}/country/all/indicator/{code}"
    params = dict(WB_PARAMS)
    page   = 1
    all_records: list[dict] = []

    while True:
        params["page"] = page
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        payload = r.json()

        if len(payload) < 2 or not payload[1]:
            break

        all_records.extend(payload[1])

        total_pages = int(payload[0].get("pages", 1))
        if page >= total_pages:
            break

        page  += 1
        time.sleep(0.25)   # polite pause between pages

    return all_records


def records_to_df(records: list[dict]) -> pd.DataFrame:
    """
    Flatten the WB JSON observation list into a tidy DataFrame.
    Columns: country (str), iso3 (str), year (int), value (float).
    Rows with null value are dropped here.
    """
    rows = [
        {
            "country": r["country"]["value"],
            "iso3"   : r["countryiso3code"],
            "year"   : int(r["date"]),
            "value"  : float(r["value"]),
        }
        for r in records
        if r.get("value") is not None
    ]
    return pd.DataFrame(rows)


def fetch(ind: dict, offline: bool) -> pd.DataFrame:
    """
    Download (or load from cache) a single WDI indicator.
    Always returns a tidy DataFrame with columns [country, iso3, year, value].

    Parameters
    ----------
    ind     : dict  — one entry from INDICATORS
    offline : bool  — if True, skip download and read from raw_path
    """
    raw_path: Path = ind["raw_path"]
    code           = ind["code"]

    if not offline:
        print(f"  Downloading {code} …")
        records = wb_download(code)
        df      = records_to_df(records)
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(raw_path, index=False)
        print(f"  Cached → {raw_path}  ({len(df):,} rows, "
              f"{df['country'].nunique()} entities)")
    else:
        if not raw_path.exists():
            sys.exit(
                f"\n[ERROR] --offline requested but cache not found:\n"
                f"  {raw_path}\n"
                f"Run without --offline first to download.\n"
            )
        df = pd.read_csv(raw_path)
        print(f"  Loaded  ← {raw_path}  ({len(df):,} rows)")

    return df


# ══════════════════════════════════════════════════════════════
# STEP 2 — VALIDATE
# ══════════════════════════════════════════════════════════════

def validate(df: pd.DataFrame, ind: dict) -> pd.DataFrame:
    """
    Run data quality checks on a downloaded indicator DataFrame.

    Checks performed:
      1. Required columns present
      2. No null values in key fields
      3. Values within the expected physical range
      4. Year column is integer within 1990–2022

    Returns a clean copy. Prints warnings for non-critical issues.
    Raises ValueError for critical failures.
    """
    name = ind["label"]

    # 1. Column check
    required = {"country", "iso3", "year", "value"}
    missing  = required - set(df.columns)
    if missing:
        raise ValueError(f"[{name}] Missing required columns: {missing}")

    df = df.copy()

    # 2. Null drop
    null_count = df["value"].isna().sum()
    if null_count:
        print(f"  [WARN] {name}: dropping {null_count:,} null-value rows")
        df = df.dropna(subset=["value"])

    # 3. Range clamp
    lo, hi = ind["valid_min"], ind["valid_max"]
    out_of_range = ((df["value"] < lo) | (df["value"] > hi)).sum()
    if out_of_range:
        print(f"  [WARN] {name}: {out_of_range} values outside [{lo}, {hi}] — clamped")
        df["value"] = df["value"].clip(lo, hi)

    # 4. Year filter
    df["year"] = df["year"].astype(int)
    df = df[df["year"].between(1990, 2022)]

    # Round to 2 decimal places
    df["value"] = df["value"].round(2)

    # Normalize region names ("&" → "and") so they match the canonical
    # entity list used elsewhere in the project.
    df["country"] = df["country"].replace(WB_NAME_REMAP)

    return df


# ══════════════════════════════════════════════════════════════
# STEP 3 — RESHAPE
# ══════════════════════════════════════════════════════════════

def filter_entities(df: pd.DataFrame, entities: list[str]) -> pd.DataFrame:
    """Keep only rows where country is in the given list."""
    df_f = df[df["country"].isin(entities)].copy()
    absent = set(entities) - set(df_f["country"].unique())
    if absent:
        print(f"  [WARN] Entities not found in data: {sorted(absent)}")
    return df_f


def build_data_array(df: pd.DataFrame, years: list[int]) -> tuple[list[dict], list[dict]]:
    """
    Pivot from long format to the wide-by-year format consumed by D3:
        [ { "year": 1990, "World": 71.1, "India": 43.0, ... }, ... ]

    Two passes:
      1.  Real WB observations are placed at their actual years.
      2.  *Interior* gaps (years between two known observations) are
          filled by linear interpolation between the bracketing values.
          This is a standard, defensible imputation for slow-moving
          development indicators like electricity access — and matches
          how WB and IEA themselves report intermediate years for
          cross-country comparisons.

    *Leading* gaps (years before the first known observation for an
    entity) are deliberately NOT imputed — the corresponding line
    simply starts later in the chart, which is the truthful
    representation. Same for trailing gaps.

    Returns (rows, imputed_log) where imputed_log records every
    (entity, year, value) that was filled by interpolation, so the
    methodology is auditable from the JSON itself.
    """
    df_sub = df[df["year"].isin(years)]

    # Build per-entity year→value matrix from real observations
    matrix: dict[str, dict[int, float]] = {}
    for entity in ALL_ENTITIES:
        sub = df_sub[df_sub["country"] == entity].set_index("year")["value"]
        matrix[entity] = {int(y): float(v) for y, v in sub.items()}

    # Linear interpolation for INTERIOR gaps only
    imputed_log: list[dict] = []
    sorted_years = sorted(years)
    for entity, observed in matrix.items():
        if len(observed) < 2:
            continue
        first_y, last_y = min(observed), max(observed)
        for yr in sorted_years:
            if yr in observed or yr < first_y or yr > last_y:
                continue
            # Find bracketing known years
            before = max((y for y in observed if y < yr), default=None)
            after  = min((y for y in observed if y > yr), default=None)
            if before is None or after is None:
                continue
            t = (yr - before) / (after - before)
            v = observed[before] + t * (observed[after] - observed[before])
            v = round(v, 2)
            matrix[entity][yr] = v
            imputed_log.append({
                "entity"      : entity,
                "year"        : int(yr),
                "value"       : v,
                "method"      : "linear interpolation",
                "anchored_at" : [int(before), int(after)],
            })

    # Emit final wide-by-year rows
    rows: list[dict] = []
    for yr in sorted_years:
        row = {"year": int(yr)}
        for entity in ALL_ENTITIES:
            if yr in matrix[entity]:
                row[entity] = round(matrix[entity][yr], 2)
        rows.append(row)
    return rows, imputed_log


def find_baseline(sub: pd.Series,
                  primary_window: tuple[int, int] = (1990, 1995),
                  fallback_window: tuple[int, int] = (1996, 2000),
                  ) -> tuple[int | None, float | None]:
    """
    Locate the earliest available WB observation in the primary window
    [1990, 1995]. If the entity has no observations there (Pakistan,
    China, Ethiopia, and the World/Sub-Saharan Africa/East Asia regional
    aggregates don't), fall back to the next-earliest year in
    [1996, 2000]. Returns (year, value) or (None, None) if the entity
    has no data in either window.

    This gives every focus entity a meaningful "before" anchor that's
    still real WB data — no fabrication, just a slightly later start
    year for the few entities WB didn't report on at the start of the
    1990s. The actual baseline year is recorded per entity in the
    output, so the chart caption stays truthful.
    """
    for window in (primary_window, fallback_window):
        for yr in range(window[0], window[1] + 1):
            if yr in sub.index:
                return int(yr), round(float(sub[yr]), 1)
    return None, None


def build_bar_data(df: pd.DataFrame, entities: list[str]) -> list[dict]:
    """
    Build the bar chart dataset: an *earliest-available baseline* (~1990)
    paired with the 2022 value, per entity, sorted ascending by 2022.

    Why "earliest available" rather than strict 1990:
      The WB EG.ELC.ACCS.ZS series didn't have 1990 observations for
      most of our focus entities — only Brazil and Nigeria reported at
      that exact year. To give every country a meaningful "before"
      anchor without fabricating data, we look up the earliest real
      WB observation in [1990, 1995] (with a fallback to [1996, 2000]
      for entities that didn't report at all in the early 1990s, e.g.
      Pakistan, China, Ethiopia, and several regional aggregates).

    Each row records:
      - country         : entity name
      - access_baseline : real WB value at baseline_year
      - baseline_year   : the actual year the baseline was sampled at
                          (so the front-end / caption can stay truthful)
      - access_2022     : real WB value at 2022
    """
    rows = []
    df_e = df[df["country"].isin(entities)]
    for entity in entities:
        sub = df_e[df_e["country"] == entity].set_index("year")["value"]
        baseline_year, baseline_val = find_baseline(sub)
        rows.append({
            "country"        : entity,
            "access_baseline": baseline_val,
            "baseline_year"  : baseline_year,
            "access_2022"    : round(float(sub[2022]), 1) if 2022 in sub.index else None,
        })
    # Drop entries missing 2022 data, then sort
    rows = [r for r in rows if r["access_2022"] is not None]
    rows.sort(key=lambda r: r["access_2022"])
    return rows


def build_scatter_data(df_access: pd.DataFrame,
                       df_gdp   : pd.DataFrame,
                       countries: list[str]) -> list[dict]:
    """
    Build the scatter plot dataset: 2022 GDP per capita vs.
    2022 electricity access for each focus country.

    Uses country-level GDP only (regional aggregates excluded because
    WB aggregate GDP per capita values mix methodology and are less
    comparable for a scatter plot).
    """
    acc = df_access[df_access["year"] == 2022].set_index("country")["value"]
    gdp = df_gdp   [df_gdp   ["year"] == 2022].set_index("country")["value"]

    rows = []
    for c in countries:
        has_acc = c in acc.index
        has_gdp = c in gdp.index
        if has_acc and has_gdp:
            rows.append({
                "country"       : c,
                "gdp_per_capita": round(float(gdp[c]), 0),
                "access_pct"    : round(float(acc[c]), 1),
            })
        else:
            print(f"  [WARN] scatter: missing 2022 data for '{c}' "
                  f"(access={has_acc}, gdp={has_gdp}) — excluded")
    return rows


# ══════════════════════════════════════════════════════════════
# STEP 4 — ASSEMBLE & WRITE
# ══════════════════════════════════════════════════════════════

def assemble(data_rows, bar_rows, scatter_rows, imputed_log) -> dict:
    """Combine all processed sections into the final JSON payload."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return {
        "meta": {
            "generated_at"    : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sources": [
                {
                    "name"     : "World Bank World Development Indicators",
                    "indicator": f"{INDICATORS['access']['code']} — {INDICATORS['access']['label']}",
                    "url"      : INDICATORS["access"]["url"],
                    "license"  : "CC BY 4.0",
                    "accessed" : today,
                },
                {
                    "name"     : "World Bank World Development Indicators",
                    "indicator": f"{INDICATORS['gdp']['code']} — {INDICATORS['gdp']['label']}",
                    "url"      : INDICATORS["gdp"]["url"],
                    "license"  : "CC BY 4.0",
                    "accessed" : today,
                },
            ],
            "regions"          : REGIONS,
            "spotlight"        : SPOTLIGHT,
            "years"            : YEARS_OUT,
            "indicator_access" : INDICATORS["access"]["code"],
            "indicator_gdp"    : INDICATORS["gdp"]["code"],
            "imputation": {
                "data_array": {
                    "method"        : "linear interpolation between adjacent real WB observations",
                    "applies_to"    : "INTERIOR gaps only — leading/trailing nulls are left as null",
                    "rationale"     : ("Electricity access changes slowly year-to-year, so linear "
                                       "interpolation between two real observations 5 years apart "
                                       "is a defensible estimate matching how WB/IEA report "
                                       "intermediate years. No back- or forward-extrapolation is "
                                       "performed."),
                    "filled_count"  : len(imputed_log),
                },
                "bar_baseline": {
                    "method"        : "earliest real WB observation per entity, primary window 1990–1995, fallback 1996–2000",
                    "rationale"     : ("Most focus entities lacked a strict 1990 observation in WB. "
                                       "Using the earliest real value within the early-1990s window "
                                       "gives every entity a meaningful 'before' anchor without "
                                       "fabricating data. The actual baseline year per entity is "
                                       "recorded in each bar row's `baseline_year` field."),
                },
            },
        },
        "data"       : data_rows,
        "bar"        : bar_rows,
        "scatter"    : scatter_rows,
        "pop_no_elec": POP_NO_ELEC,
        "imputed"    : imputed_log,
    }


def write_json(payload: dict, path: Path, dry_run: bool) -> None:
    """
    Serialize payload to JSON and write to disk (unless dry_run).

    The JSON file is the only artifact this script emits to /site. The
    front-end (`site/main_electricity.js`) loads it at runtime via
    fetch — so the entire `/site` directory is a deployable bundle of
    static assets (HTML, CSS, JS, JSON) that can be uploaded as-is to
    a static host like Georgetown Domains / cPanel / GitHub Pages.
    """
    summary = (
        f"  data rows   : {len(payload['data'])} years × {len(ALL_ENTITIES)} entities\n"
        f"  bar entries : {len(payload['bar'])}\n"
        f"  scatter pts : {len(payload['scatter'])}"
    )
    if dry_run:
        print(f"\n[DRY RUN] Would write → {path}")
        print(summary)
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    size_kb = path.stat().st_size / 1024
    print(f"\n✓  Written → {path}")
    print(summary)
    print(f"  file size   : {size_kb:.1f} KB")


# ══════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Preprocess WDI electricity access + GDP data → electricity_data.json"
    )
    parser.add_argument(
        "--offline", action="store_true",
        help="Load from cached CSVs in data/raw/ instead of calling the API."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run all steps but do not write the output JSON."
    )
    args = parser.parse_args()

    print("=" * 58)
    print("  Wired World  —  Data Preprocessing Pipeline")
    print("=" * 58)
    mode = "offline" if args.offline else "online"
    if args.dry_run:
        mode += " + dry-run"
    print(f"  mode   : {mode}")
    print(f"  output : {OUTPUT}\n")

    # ── 1. Fetch ───────────────────────────────────────────────
    print("[ Step 1 / 4 ]  Fetching raw data")
    df_access_raw = fetch(INDICATORS["access"], offline=args.offline)
    df_gdp_raw    = fetch(INDICATORS["gdp"],    offline=args.offline)

    # ── 2. Validate ────────────────────────────────────────────
    print("\n[ Step 2 / 4 ]  Validating")
    df_access = validate(df_access_raw, INDICATORS["access"])
    df_gdp    = validate(df_gdp_raw,    INDICATORS["gdp"])
    print(f"  EG.ELC.ACCS.ZS : {len(df_access):,} rows, "
          f"{df_access['country'].nunique()} entities")
    print(f"  NY.GDP.PCAP.KD : {len(df_gdp):,} rows, "
          f"{df_gdp['country'].nunique()} entities")

    # ── 3. Reshape ─────────────────────────────────────────────
    print("\n[ Step 3 / 4 ]  Filtering & reshaping")
    df_access_sel = filter_entities(df_access, ALL_ENTITIES)
    df_gdp_sel    = filter_entities(df_gdp,    list(SPOTLIGHT.keys()))

    data_rows, imputed_log = build_data_array(df_access_sel, YEARS_OUT)
    bar_rows               = build_bar_data(df_access_sel, ALL_ENTITIES)
    scatter_rows           = build_scatter_data(df_access_sel, df_gdp_sel,
                                                list(SPOTLIGHT.keys()))

    print(f"  data array  : {len(data_rows)} year-records")
    print(f"  bar chart   : {len(bar_rows)} entries (baseline window: 1990–1995, fallback to 2000)")
    print(f"  scatter     : {len(scatter_rows)} points")
    print(f"  imputed     : {len(imputed_log)} (entity, year) values via linear interpolation")

    # ── 4. Write ───────────────────────────────────────────────
    print("\n[ Step 4 / 4 ]  Assembling & writing output")
    payload = assemble(data_rows, bar_rows, scatter_rows, imputed_log)
    write_json(payload, OUTPUT, dry_run=args.dry_run)

    print("\nPipeline complete.\n")


if __name__ == "__main__":
    main()
