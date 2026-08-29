# `pipeline/` - Python. Reads the data, does the science. All tested logic is here.

See the root [`CLAUDE.md`](../CLAUDE.md) for the rules that govern this code, and
[`CONTEXT.md`](../CONTEXT.md) for the vocabulary.

| File | What it does |
| --- | --- |
| `samudra/bake.py` | Orchestrator. Fetches, derives, warps, encodes, writes everything the browser and API consume. The `main()` CLI is `python -m samudra.bake`. |
| `samudra/sources/base.py` | **The extensibility seam.** `BoundingBox`, `FieldSpec`, `Profile`, and the `GridSource` / `ProfileSource` protocols. A new provider implements one of these and nothing else changes. |
| `samudra/sources/incois.py` | INCOIS ERDDAP adapter. Gridded temperature and salinity, `incois_argo_10d_VAM`. |
| `samudra/sources/argo.py` | Argo adapters. `ProfileColumns` makes the column layout data rather than code, and `measurements` makes the *channels* data too; `ArgoErddapSource` (Ifremer, the demo's), `BgcArgoSource` (chlorophyll), `IncoisArgoSource` (registered to prove the seam). Also QC and pressure-to-depth. |
| `samudra/sources/osmc.py` | **Moored buoys**, from NOAA's real-time GTS feed. The seam's hardest case: depth not pressure, one row per level, the surface reading in a different column, no quality flags at all. Four of the nine buoys are India's own OMNI network. |
| `samudra/currents.py` | The Copernicus current overlay. Tile arithmetic and stitching. A **picture** - read ADR 0011 before treating it as data. |
| `samudra/grid.py` | `Grid` - model data on its native axes. **Scientific truth.** `column_at()` does bilinear interpolation that refuses to blend across land. |
| `samudra/volume.py` | `encode_volume()` - Grid to 4 bytes per voxel: value, coverage, gradient, spare. Read the module docstring before touching it. |
| `samudra/depth_warp.py` | `DepthWarp` - maps INCOIS's 24 uneven depth levels onto an even GPU axis. |
| `samudra/collocation.py` | `collocate()` - pairs a Profile against the model at its exact position. The scientific core. `choose_cast()` decides *which* cast the baked comparison uses: the newest that actually compares against something. |
| `samudra/coverage.py` | **Observation Coverage.** Counts Argo *casts* whose dive passed through each slab, in a circular neighbourhood. The docstring records the two rules this replaced and the measurements that forced each change. |
| `samudra/density.py` | **Density.** TEOS-10 sigma-theta from temperature, salinity and pressure. Also `profile_density()`, the observed side of the density Collocation. |
| `samudra/anomaly.py` | **Temperature Anomaly**, and the **Anomaly Features** found in it. Departure from the per-cell mean, the symmetric encoding range a diverging palette needs, and `find_anomaly_features()`. Warm and cool are labelled separately; the docstring says why. |
| `samudra/thermocline.py` | `isotherm_depth()` and `swept_through()`. Where the 20 degC line sits, and whether it moved through a body of water - which is what lets an Anomaly Feature say why it is there. |
| `samudra/palettes.py` | cmocean palettes as 256-entry lookup tables, one per Field. `banded_table()` for Observation Coverage. |
| `samudra/tls.py` | Supplies the intermediate certificate INCOIS's server omits. Do not replace with `verify=False`. |
| `tests/` | 230 tests, one file per module under test. `test_dap.py` and `test_wms.py` cover `api/`, because that is where the science is served rather than rendered. |
