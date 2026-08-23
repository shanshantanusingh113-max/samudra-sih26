# INCOIS's own public ERDDAP is the model source

Prior research concluded that INCOIS exposes no public API and that the demo would have to use
a substitute such as HYCOM. Both halves turned out to be wrong, in our favour.

tds.hycom.org is unreachable from the build machine - 20-second timeouts on both the catalog
and the OPeNDAP endpoint - as is coastwatch.pfeg.noaa.gov. Meanwhile erddap.incois.gov.in is a
real, running, public ERDDAP, and `incois_argo_10d_VAM` is exactly what the platform needs:
temperature and salinity on 24 levels from 5 m to 2000 m, 1 degree, over the whole Indian
Ocean, on a 10-day cycle and current to this month.

The demo therefore runs on INCOIS's own operational product rather than a stand-in, which
removes the "this is not really our data" objection entirely.

It also makes the Collocation scientifically meaningful rather than contrived: the VAM analysis
is *derived from* Argo profiles, so comparing it against raw Argo casts asks a real operational
question - did the analysis reproduce the observations that fed it? - and INCOIS publish their
own error fields alongside it.

One wart, recorded so nobody rediscovers it at 3 a.m.: their server sends only its leaf
certificate and omits the GlobalSign intermediate. Browsers and curl paper over this; Python's
ssl module does not. See pipeline/samudra/tls.py.
