# Verified data sources (empirically tested 2026-08-23 and 2026-08-27, from this machine)

## PRIMARY - INCOIS's own public ERDDAP. Real INCOIS data, not a substitute.

Host: https://erddap.incois.gov.in/erddap  (HTTP 200, ~0.3s)

### `incois_argo_10d_VAM` - the 3D field driving the Volume View
INCOIS ARGO 10-day gridded, Variational Analysis Methodology.
- dims: time(813) x ZAX(24) x latitude(60) x longitude(90)
- ZAX = 5,10,20,30,50,75,100,125,150,200,250,300,400,500,600,700,800,900,
        1000,1200,1400,1600,1800,2000  (metres, UNEVEN - see Depth Warp)
- extent: lon 30.5..119.5E, lat -29.5..29.5N, 1 deg
- time: 2004-01-15 .. **2026-07-30** (current!), 10-day step
- vars: TEMP (degC), SAL (PSU), TERR/SERR (relative error)
- CF-1.6 / COARDS / ACDD-1.3 compliant. NaN = land/seafloor (26-43% of cells).
- TEMP observed range 2.65 .. 31.37 degC - physically sane.

VERIFIED download (196 KB in 0.43 s):
```
curl -sL "https://erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.nc?TEMP%5B(last)%5D%5B(5.0):(2000.0)%5D%5B(0.5):(24.5)%5D%5B(60.5):(99.5)%5D,SAL%5B(last)%5D%5B(5.0):(2000.0)%5D%5B(0.5):(24.5)%5D%5B(60.5):(99.5)%5D" -o subset.nc
```
Opens cleanly in xarray. Also available as .json/.csv by changing the extension.

### `incois_valueadded_products_datasets` - 2D operational products
MLD, ILD, D20, D26, HTCNT (heat content), DYN_HT, **GEO_U / GEO_V** (geostrophic currents,
cm/s). Same 1 deg grid. NOTE: time ends 2019-03 - use for the Globe View current vectors,
do NOT claim it is current.

### `incois_argo_mnt_McCreary` / `incois_argo_mnt_VAM` - monthly, with uncertainty
Same 24 levels. Carries T_ANALYZED/S_ANALYZED plus S_STDEV, S_RMSE, and observation counts
(S_ROIOBS, S_BOXOBS) - genuinely useful for the Collocation/Residual story.

## PRIMARY - Argo profiles (observations)
`ArgoFloats` on https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats  (HTTP 200, ~1.1s)
Coriolis GDAC mirror. TrajectoryProfile; has platform_number, time, lat, lon, pres/temp/psal
(+ _adjusted and QC flags). Exact query being verified by a research agent.

## Other reachable hosts (confirmed 200)
data-argo.ifremer.fr, osmc.noaa.gov/erddap, iridl.ldeo.columbia.edu,
opendap.earthdata.nasa.gov, psl.noaa.gov/thredds, polarwatch.noaa.gov/erddap,
erddap.emodnet-physics.eu, incois.gov.in

## DEAD from this machine - do not retry
- **tds.hycom.org** - 20 s timeout (both catalog and dodsC). The obvious HYCOM plan is out.
- **coastwatch.pfeg.noaa.gov/erddap** - timeout.
- **incois.gov.in/thredds** - responds, but it is an unconfigured default TDS install
  ("Initial TDS Installation (please change threddsConfig.xml)"). No datasets. Useless.
- od.incois.gov.in - no route.

## Consequence for the demo
Every byte the demo needs is pre-baked into the repo at build time, so a dead venue network
cannot kill it. The live fetch path exists and is demonstrable, but is never on the critical path.


---

# Second sweep, 2026-08-27

Twenty-nine endpoints probed while closing the gaps in `03-requirement-gaps.md`. Everything
below was reached from this machine; nothing here is recalled.

## NEW PRIMARY - now read by the bake

### `ArgoFloats-synthetic-BGC` - chlorophyll
`https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.csv`
Same host, same protocol and the same adjusted-first column convention as the core Argo source.
Carries chla, doxy, nitrate, pH, backscatter, irradiance, each with QC flags.
Over the demo region, 10 Apr - 30 Jul 2026: **635 casts, 59 floats, 538,059 rows, 51 MB**.
Under this project's own QC rules: **chlorophyll 532 casts / 49 floats; nitrate 21 / 2;
oxygen 0**. The oxygen result is recorded as measured, not explained away.

### `OSMC_RealTime` - moored buoys, ships, drifters
`https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/OSMC_RealTime.csv` - CC0, no login.
The whole GTS flattened into one table. One ten-day window (20-30 Jul 2026) over the region:
**100,405 rows, 94,653 with subsurface temperature**, from 169 profiling floats, 13 generic
moored buoys, 2 tropical moored buoys, 122 ships, 14 drifters, 5 shore stations, 1 tide gauge.
Moorings with a real water column: **23459, 23451, 23452** (India's OMNI) and **2300009,
2300019** (RAMA), 9-11 levels each, 0-500 m. Retention reaches back to at least Jan 2024.
**`uo`/`vo` exist as columns and zero rows populate them here.**

### Copernicus Marine WMTS - surface currents
`https://wmts.marine.copernicus.eu/teroWmts` - **anonymous**, no account.
Layer `GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m_202406/
sea_water_velocity`, style `cmap:speed,vectorStyle:vector`. GetTile 200, 30 KB PNG.
Time dimension **2022-06-01 to 2026-09-05 daily**; elevation carries all 50 levels.
Matrix sets EPSG:3857 and **EPSG:4326** (plus @2x and @3x). GetLegend as JSON gives 0 to
1.035 m/s.
**Their data is NOT anonymous**: on the ARCO Zarr store, `.zmetadata` 200, `latitude/0` 200,
`elevation/0` 200, but `uo/0.0.0.0` **403** and `vo/0.0.0.0` **403**.

## REACHABLE, and cannot share this timeline

| Source | What it is | Why not |
| --- | --- | --- |
| `OceanGlidersGDACTrajectories` (Ifremer) | The global glider GDAC | **7 deployments in this box, all time.** 5 in Jun-Jul 2016, sea057 Nov 2021-Mar 2022 and Jul-**Oct 2022**. Rows by year: 2016 -> 1,052,561; 2021 -> 55,533; 2022 -> 222,802; **2023-2026 -> zero** |
| `CCHDO_GO_SHIP_CTD` (EMODnet Physics) | Ship CTD sections | 6 cruises here since 2000; newest `325020250321`, 76 casts, **Apr 2025** |
| `drifter_6hour_qc` (NOAA AOML) | Measured surface velocity | Ends **2025-06-18** |
| `drifter_hourly_qc` (NOAA AOML) | Measured surface velocity | Ends **2022-10-31** |
| `Sustuntech_Buoy_derived_uv_monthly` | Indian Ocean buoy currents | 2010-2020, monthly, and **CC BY-NC-ND** |
| `ANDRO` (Ifremer) | Argo-derived deep velocity | A climatology; no time axis |
| `IRS_chlorophyll_datasets` (INCOIS) | IRS P4 OCM chlorophyll | Ends **2006-03-21** |
| `incois_oceansat2_datasets` (INCOIS) | CHL, KD490, TSM | Ends **2020-05-01** |
| `ascat_daily_datasets` (INCOIS) | Daily wind field | Ends **2023-05-21** |
| EMODnet HF-radar (20+ networks) | Measured surface currents | Europe and the USA only |

## Worth knowing about INCOIS's own server

Eighteen datasets. Two carry the current analysis window:

- `incois_argo_10d_VAM` - the one the demo reads.
- **`incois_argo_10day_McCreary`** - same 10-day cadence, current to **2026-07-30**, 921 steps,
  and it carries `T_STDEV`, `T_RMSE`, `T_ROIOBS`, `T_BOXOBS`: **INCOIS's own published analysis
  error and observation counts**, on the same grid and timeline. Not used yet; the most
  interesting unexploited thing on their server.
- **Their ERDDAP already serves WMS 1.3.0** for `incois_argo_10d_VAM` - GetCapabilities 200,
  26 KB, layers for SAL, TERR, SERR.
- **Their griddap is an OPeNDAP (DAP2) server** - `.dds` 200, `.dods` 200. So this project
  always consumed OPeNDAP; it only ever lacked the serving half.

## DEAD or gated from this machine - do not retry

- `services.incois.gov.in` - **no route at all** (this is where the HF-radar archive lives).
- `las.incois.gov.in` - SSL failure even with the intermediate bundle.
- `incois.gov.in/portal/osf/osf.jsp` - 404.
- `data-oceansites.ifremer.fr` - connection refused.
- `tds.marine.copernicus.eu/thredds` - connection refused.
- Plus everything in the 2026-08-23 list above.
