# Technical Approach - spoken script (~70 seconds)

**(left column)**

"Boring on purpose. Python does the science, the browser does the picture, and nothing needs installing.

We read INCOIS's own public ERDDAP: their ten-day gridded Argo analysis, temperature and salinity on twenty-four depth levels from five metres to two thousand, across the whole Indian Ocean. They publish it as CF-compliant NetCDF, so we never guess what a number means. The float observations come from the Argo global data centre.

**(architecture row, left to right)**

Every provider enters through one box, the source adapter. That is the only code in the system that knows what ERDDAP is.

Then the data splits two ways, and this is our most important decision. The **Grid** is scientific truth: real numbers on the provider's own grid, and every figure a user reads comes from it. The **Volume** is a picture: four bytes per voxel so a graphics card can draw it. We never answer a scientific question from the picture.

**(the seam)**

That one entry point is what makes extensibility real. A mooring, an ADCP or an HF-radar feed means writing one adapter class. The renderer, the API and the interface never change. We proved it by adding a second Argo provider for the cost of one small class.

**(five steps)**

Ingest a subset. Resample twenty-four uneven depth levels onto an even axis, rejecting implausible values channel by channel, so a float with a failed salinity sensor still gives good temperature. Encode the volume with a coverage channel, so land can never bleed into the water and fake a cold patch. Ray-march it in the browser. Then collocate: one float's cast against the model interpolated to that exact position.

**(status)**

A working prototype on real INCOIS data, not a mock-up. Ingestion, rendering, overlay and comparison all built and tested. 377 tests green. The demo data ships inside the build, so it runs with the network cable pulled out. What is left is deployment and more variables, not core capability."
