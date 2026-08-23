# Verified data sources (empirically tested 2026-08-23, from this machine)

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
