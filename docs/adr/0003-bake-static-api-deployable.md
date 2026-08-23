# The demo runs on baked static files; the API is the deployable half

Everything the browser demo needs is committed as static assets, and the REST API is not on the
critical path for the demo at all.

The reason is operational, not technical. The demo runs on a venue network we do not control,
and the two upstream servers are in Hyderabad and Brest. A cold fetch is fast when it works and
the entire platform is dead when it is not. Free-tier hosting adds 30-50 second cold starts on
top of that. None of it is a risk worth taking in a scored demo.

The API still exists and is real, because a Collocation is a *query*, not a fixture - any float,
any cast, any analysis step, or an arbitrary position - and precomputing that cross-product is
neither possible nor sensible. /api/live/timesteps proves the ingestion path is live by asking
INCOIS what exists right now.

Consequence: two read paths to keep honest. The rule is that the bake and the API both go
through the same Source Adapters and the same collocate(), so they cannot disagree about the
science, only about how much has been precomputed.
