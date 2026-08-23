# Two Argo providers are registered; the demo reads the current one

INCOIS serves Argo profiles themselves, at `Indian_ARGO_Floats` on their public ERDDAP. Sourcing
observations there as well as the model field would make the whole demo end-to-end INCOIS, which
is a genuinely better story — so we checked whether it could replace the Ifremer GDAC mirror.

It cannot. INCOIS's Argo archive ends **2025-04-23**, while their gridded analysis runs to
**2026-07-30**. Collocating across that gap would pair a July 2026 analysis with observations
more than a year old, which is not a comparison of a model against reality; it is a comparison
of two different oceans. The demo therefore keeps reading Coriolis/Ifremer, which is current.

We implemented the INCOIS adapter anyway, because it earns its place a different way: it makes
the extensibility claim checkable instead of asserted. The two providers disagree about
everything superficial — INCOIS names its columns in upper case and ships the delayed-mode
`*_ADJUSTED` fields **entirely empty** (measured: 0% populated, against 100% for the raw
columns), while Ifremer names them in lower case and populates them. An adapter that preferred
adjusted values blindly would read INCOIS as a table of nothing.

Absorbing that pushed one real change into the design: the column layout became *data* rather
than code. A `ProfileColumns` records what a provider calls each quantity and in which order to
prefer its variants, and a single parser serves both. Adding INCOIS then cost a subclass with
four attributes and no new parsing logic, which is the strongest evidence available that a
mooring, an ADCP or an HF-radar feed would cost the same.

`/api/sources` reports both, each with its column style, its coverage limit, and whether the
demo actually reads it — so the claim can be inspected rather than taken on trust.
