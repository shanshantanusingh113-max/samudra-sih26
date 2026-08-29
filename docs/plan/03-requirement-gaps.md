# Closing the requirement gaps

Every clause of PS 26067 the README marks **Not met** or **Partly met**, researched from this
machine on 2026-08-27, with a decision and a checklist. Endpoint results here were measured, not
recalled; anything already recorded dead in `00-data-sources-verified.md` was not retried.

The rule this file follows is the one the rest of the project follows: **a source that cannot
share the demo's timeline is not a source.** Half of what follows is a decision *not* to build
something, with the measurement that settles it.

---

## Decisions at a glance

| Clause | Was | Decision | Cost |
| --- | --- | --- | --- |
| Chlorophyll / BGC | Partly | **Build.** BGC-Argo, live in this window | 4-6 h |
| Moorings, CTD, ADCP, HF-radar extensibility | Partly | **Build the moorings.** OSMC real-time, Indian buoys | 4-6 h |
| OPeNDAP API backend | Not met | **Build.** `xpublish` over the native Grids | 3-4 h |
| CF Conventions on our own output | Partly | **Build.** Same wrapper as OPeNDAP | 1-2 h |
| OGC WMS | Not met | **Build, for the derived Fields only** | 2-3 h |
| OGC WCS | Not met | **Do not build.** No maintained Python server, and OPeNDAP is what this community uses | - |
| Current vectors | Not met | **Build as baked Copernicus tiles.** A picture, labelled as one | 3-4 h |
| Gliders | Partly | **Do not build.** The basin has had no glider since 2022-10-14 | - |
| CTD sections | Not met | **Do not build.** Newest GO-SHIP section here is 2025-04, a year off the window | - |
| Interoperability with portals | Partly | **Reframe only.** Five portals read, two interfaces exposed | - |
| Machine-learning products | Not met | **Do not build.** The refusal is worth more than the feature | - |
| Public outreach | Met (overclaimed) | **Downgrade to Partly, and build a tour** | 2-3 h |

---

## Build

### 1. Chlorophyll, from BGC-Argo

**Measured.** `ArgoFloats-synthetic-BGC` on `erddap.ifremer.fr` - the same host, the same
tabledap protocol and the same column-variant layout as the Argo source already in the tree.
Over `DEMO_REGION` and the bake's window, 10 Apr to 30 Jul 2026: 538,059 rows, 51 MB, from
**635 casts by 59 floats**. Applying this project's own per-channel QC rule - reject flags 3, 4
and 9, prefer adjusted, fall back to raw:

| Channel | Casts with 5+ good levels | Floats |
| --- | --- | --- |
| **chlorophyll** | **532** | **49** |
| nitrate | 21 | 2 |
| oxygen | **0** | 0 |

The oxygen result is recorded as measured rather than explained away. Nobody should promise
oxygen until somebody has looked at the raw columns for ten minutes.

INCOIS's own chlorophyll exists and is dead, both read directly off their ERDDAP:
`IRS_chlorophyll_datasets` ends **2006-03-21**; `incois_oceansat2_datasets` (CHL, KD490, TSM)
ends **2020-05-01**. Neither can share a 2026 timeline.

**Two things that make this different from temperature.** It is an observation with **no model
to hold it against** - there is no gridded chlorophyll on this timeline - so the Collocation
panel has one line, not two, and `WHY_NO_COLLOCATION` must say so. And it lives in the top
200 m; below the euphotic zone it is zero, so it is drawn as a shallow Profile rather than
stretched down a 2000 m axis.

- [ ] `ProfileColumns` gains an optional `chlorophyll` variant tuple
- [ ] `BgcArgoSource` pointing at the synthetic-BGC dataset
- [ ] `_PLAUSIBLE` range for chlorophyll, stated as a judgement the way the salinity floor is
- [ ] Bake merges BGC casts into the Float set by platform number
- [ ] `WHY_NO_COLLOCATION` entry, `GUIDE` entry, map-key entry
- [ ] Tests: parser, QC per channel, the merge, the shallow-axis rule

### 2. Moorings, from the OSMC real-time feed

**Measured.** `OSMC_RealTime` on `erddap.aoml.noaa.gov/gdp/erddap` flattens the whole Global
Telecommunication System into one tabledap table. CC0, no login, same query shape as the Argo
adapter. One ten-day window, 20-30 Jul 2026, over `DEMO_REGION`: 100,405 rows, of which
**94,653 carry subsurface temperature**.

| Platform type | Rows | Platforms |
| --- | --- | --- |
| Profiling floats and gliders | 92,608 | 169 |
| **Moored buoys (generic)** | 4,269 | **13** |
| Volunteer observing ships | 1,284 | 89 |
| Drifting buoys | 1,294 | 14 |
| **Tropical moored buoys** | 347 | **2** |
| Ships (generic) | 172 | 33 |
| Shore and bottom stations | 163 | 5 |

The moorings that report a real vertical profile:

| WMO | Country | Position | Levels |
| --- | --- | --- | --- |
| **23459** | India | 14.0 N 87.0 E, Bay of Bengal | 10, 0-500 m |
| **23451** | India | 14.9 N 69.1 E, Arabian Sea | 9, 0-500 m |
| **23452** | - | 12.3 N 68.2 E, Arabian Sea | 10, 0-500 m |
| **2300009** | RAMA | 15.0 N 89.0 E | 11, 0-500 m |
| **2300019** | RAMA | 3.9 S 65.0 E | 9, 0-500 m |

Plus about ten surface-only Indian buoys off Chennai, Visakhapatnam, Lakshadweep and the
Andamans. Across the whole bake window there are consistently **6-7** moorings with subsurface
profiles, and retention reaches back to at least Jan 2024. The 23xxx buoys are India's OMNI
network, run by NIOT with INCOIS as the data centre; the 2300xxx pair are RAMA, the joint
MoES-NOAA array. So the extensibility demonstration runs on Indian instruments.

**Currents do not come through.** The feed carries `uo` and `vo` columns and **zero rows** in
this region populate them, even though OMNI buoys measure currents.

**A mooring earns something Argo cannot give.** It does not move, so its Collocation is a *time
series at a fixed point*: the model at 14 N 87 E against the buoy, at ten depths, across all
twelve analysis steps. An Argo float has drifted somewhere else by the next step.

- [ ] `OsmcSource` implementing `ProfileSource`; a cast is (platform, time)
- [ ] Keep the platform type and country, so the panel can say what an instrument is
- [ ] Moorings are drawn as a distinct marker - they are anchored, and a drift track is wrong
- [ ] Fixed-point Collocation across every Timestep, not just the nearest
- [ ] `GUIDE` entry, map-key entry
- [ ] Tests: parser, grouping, the fixed-point series

### 3. OPeNDAP, CF NetCDF and WMS - one wrapper, three clauses

**Measured, and it corrects the README.** ERDDAP's griddap *is* a DAP2 server, so this project
already **consumes** OPeNDAP rather than merely "ERDDAP subsetting":
`incois_argo_10d_VAM.dds` returns 200 with a proper dataset descriptor, and
`.dods?TEMP[812][0][30:32][30:32]` returns 200 with a binary DAP response.

INCOIS's ERDDAP also already serves **WMS 1.3.0** for the exact dataset we read - GetCapabilities
returns 200 and 26 KB, with layers including `incois_argo_10d_VAM:SAL`, `:TERR` and `:SERR`. So
re-serving *their* temperature as WMS is re-publishing. What this platform has that theirs does
not is the **derived** Fields: density, the temperature anomaly, and Observation Coverage. Those
are the ones worth serving.

Libraries checked on PyPI and all maintained: `pydap` 3.5.10 (2026-06-26), `xpublish` 0.5.2
(2026-06-18), `xpublish-opendap` 0.2.0, `xpublish-wms` 0.13.2, `pygeoapi` 0.24.0 (2026-07-28).
There is no maintained pure-Python WCS server worth naming, which is most of why WCS is not
being built.

**One rule governs all three.** They serve the native Grids and never the Volume. An OPeNDAP
endpoint over a quantised, depth-warped, land-back-filled texture would be the worst possible
violation of this project's first rule, because the consumer cannot see what they have been
given.

- [ ] `Grid` -> `xarray.Dataset` with CF-1.8 attributes and real standard names
- [ ] `/api/netcdf/{field}/{index}` returning CF NetCDF
- [ ] `xpublish` + `xpublish-opendap` mounted under the existing FastAPI
- [ ] `xpublish-wms` for the derived Fields
- [ ] Tests: a slice read back through the server equals `Grid.column_at`

### 4. Current vectors, as baked Copernicus tiles

**Measured.** INCOIS's own geostrophic currents are confirmed dead for this purpose -
`incois_valueadded_products_datasets` ends **2019-03-30**. Copernicus Marine
`GLOBAL_ANALYSISFORECAST_PHY_001_024` carries eastward and northward velocity on 1/12 degree,
50 levels, daily, to a nine-day forecast. Its data is **not** anonymous:

| Object | Result |
| --- | --- |
| `geoChunked.zarr/.zmetadata` | **200** |
| `geoChunked.zarr/latitude/0` | **200** |
| `geoChunked.zarr/elevation/0` | **200** |
| `geoChunked.zarr/uo/0.0.0.0` | **403** |
| `geoChunked.zarr/vo/0.0.0.0` | **403** |

Their **WMTS is anonymous**, and a real tile came back with no credentials: layer
`.../sea_water_velocity`, style `cmap:speed,vectorStyle:vector`, GetTile 200, 30 KB PNG. The time
dimension runs **2022-06-01 to 2026-09-05 daily** and the elevation dimension carries all 50
levels.

Every other route is dead, each checked once:

| Source | Status |
| --- | --- |
| INCOIS `GEO_U`/`GEO_V` | Ends 2019-03-30 |
| NOAA Global Drifter Program, 6-hourly | Ends 2025-06-18 |
| NOAA Global Drifter Program, hourly | Ends 2022-10-31 |
| OSMC real-time GTS | Has the columns; **0 rows** carry them here |
| SusTunTech Indian Ocean buoy currents | 2010-2020, and CC BY-NC-ND |
| ANDRO (Ifremer) | A climatology, no time axis |
| EMODnet HF-radar, 20+ networks | Europe and the USA only |
| Thermal wind from our own density | Measured and rejected. ADR 0010 |

**So currents arrive as a picture, and are labelled as one.** Tiles are fetched at bake time and
committed, so the demo still makes no network calls. Nothing about them is clickable and no
number is ever read off them - which is not a discipline we have to maintain, because a rendered
tile *cannot* give you a number. Attribution: "E.U. Copernicus Marine Service Information".

- [ ] Fetch and bake one WMTS mosaic per Timestep over `DEMO_REGION`
- [ ] Draw as an overlay on the sea-surface layer; toggle in the panel
- [ ] Label it as Copernicus's own rendering, at its own date, on its own depth
- [ ] `GUIDE` entry saying plainly that this layer carries no numbers and why
- [ ] Never a Field, never in the Variable selector, never collocated

### 5. A guided tour, for the outreach clause

The guide panel is excellent and entirely **reactive** - it explains what you touched. A first
time visitor does not know what to touch. Every step of a tour is already a store action, and
`capture.mjs` is close to the script.

- [ ] Dive, click the largest disagreement, switch to Coverage, switch to the anomaly, open a
      Feature
- [ ] Skippable, and it must never fight a user who takes the controls
- [ ] Downgrade the README's outreach row from **Met** to **Partly**, and say what is missing

---

## Do not build, and why

### Gliders

**Measured.** The `OceanGlidersGDACTrajectories` GDAC is on `erddap.ifremer.fr` - the same host
the demo already reads - and it carries temperature, salinity, oxygen, chlorophyll, CDOM and
backscatter with per-value QC flags. Over `DEMO_REGION`, all time: **7 deployments, 1.33 million
rows.**

| Deployment | Window |
| --- | --- |
| Humpback_504, Denebola_382, Bellatrix_368, Marlin_505, Melonhead_506 | Jun-Jul **2016**, Bay of Bengal |
| sea057_20220128 | Nov 2021 - Mar 2022 |
| sea057_20220707 | Jul - **Oct 2022** |

Rows by year: 2016 -> 1,052,561; 2021 -> 55,533; 2022 -> 222,802; **2023 to 2026 -> zero.**

The newest glider left this basin on **2022-10-14**, three and a half years before the analysis
window. Putting it beside a July 2026 analysis is precisely what ADR 0009 refuses for INCOIS's
own Argo archive, and refusing it there while accepting it here would be inconsistent in front of
the same judge.

**The README sentence is wrong and must change.** It says "we found no reachable public glider
feed for this region". A feed exists, on a server we already read, holding seven deployments in
India's waters. The gap is India's glider programme, not our adapter - which is a much stronger
sentence.

### CTD sections

**Measured.** `CCHDO_GO_SHIP_CTD` on EMODnet Physics ERDDAP, public domain, with temperature,
salinity, oxygen and fluorescence. Cruises in `DEMO_REGION` since 2000: **6**. The most recent is
`325020250321`, **76 casts, 6-23 Apr 2025**; before that Dec 2019 (48), May-Jun 2018 (62), Apr
2016 (82), Apr 2007 (77), Oct 2000 (12).

Unlike gliders this one has an honest home - the INCOIS analysis runs back to 2004, so an April
2025 section could sit beside the April 2025 analysis. It is simply a lower return than the
mooring work for the same effort, and the mooring feed carries 122 ships in a single window
anyway. Revisit if there is time after everything above.

### HF radar and ADCP

INCOIS runs five HF-radar pairs on the Andhra, Tamil Nadu, Gujarat, Odisha and Andaman coasts and
archives them as NetCDF, but access is behind a login at `services.incois.gov.in`, which did not
resolve from this machine at all. EMODnet publishes more than twenty HF-radar networks and every
one is European or American. The OSMC feed carries no current components here.

So the instruments exist, they are Indian, and their data is not on any open endpoint. That is a
data-policy fact rather than an architecture gap, and saying so is a better answer than dropping
a European radar dataset into an Indian Ocean tool.

### OGC WCS

No maintained pure-Python WCS server. `pygeoapi` implements the modern OGC API family rather than
classic WCS, and re-implementing WCS by hand is a day that buys a checkbox. The honest position:
we serve the numbers over OPeNDAP, which is what this community actually uses.

### Machine-learning derived products

Unchanged from `02-next-features.md`, and reinforced. **We have already built the thing ML would
be used for, and built it better.** The Anomaly Feature detector finds unusual water, reports a
z-score against a stated threshold, and says how many observations stand behind it. Relabelling
that as machine learning replaces a defensible number with an indefensible one, and the first
question - trained on what? - has no answer, because twelve Timesteps is not a training set.

The second trap is that ML is exactly how a plausible-and-wrong Field gets made. ADR 0010 tells
that story once already with geostrophic currents: finite, physical-looking, and wrong by a
factor of ten. A neural gap-filler would produce smooth, believable temperatures in precisely the
6% of the block where nobody measured, painting over the one honest hole this platform is
proudest of.

The strongest answer to this clause is to point at Observation Coverage and say: we know where
the model is interpolating, we show it, and we declined to fill it in with a guess.

### Being listed in an ocean data portal

A hackathon prototype has no business asking to be indexed by an operational portal. What it can
do is expose the interfaces that would let it be, which the OPeNDAP and WMS work above does.

The reading side is also stronger than the README claims: **five** independent institutions were
read openly and anonymously during this research - INCOIS ERDDAP, Ifremer Coriolis, NOAA AOML,
EMODnet Physics, and Copernicus Marine metadata - not two.
