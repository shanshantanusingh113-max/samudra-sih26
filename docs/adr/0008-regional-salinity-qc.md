# Argo salinity is filtered against a regional floor, stricter than the Argo standard

Real GDAC data contains failed sensors. This region currently has a float reporting about
20 PSU at the surface - fresher than the Baltic and impossible in the open Bay of Bengal -
which renders as a wild spike on the Collocation chart and looks like our bug.

Argo's global gross range check (QC Manual, test 4) passes salinity from 2 PSU, because it must
accommodate brackish marginal seas. It therefore does not catch this float. Our floor is
regional, is a judgement call rather than a published threshold, and is labelled as such in the
code.

25 PSU is the floor rather than something tighter because the northern Bay of Bengal really is
that fresh: Ganges-Brahmaputra discharge drives monsoon surface salinity down to roughly 28 PSU.
Clamping at, say, 33 would delete one of the most scientifically interesting features in India's
own EEZ as though it were instrument error.

Filtering is per channel, so a cast with a failed salinity sensor still contributes its
perfectly good temperature.
