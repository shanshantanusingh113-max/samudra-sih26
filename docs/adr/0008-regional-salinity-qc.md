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


## Update, 2026-08-26

This ADR described the regional floor as "stricter than the Argo standard", which was true of the
gross range check and quietly implied the rest of Argo's tests were running. They were not: the
request never asked for the `_qc` columns.

They run now, per channel and per variant, and they are the *first* layer - the regional floor is
the second, for what the global standard lets through. The floor itself is unchanged and the
reasoning above still holds. Reading the flags removed the two floats whose salinity sensors had
failed while keeping their temperature, and dropped the worst density RMS in the bake from
6.16 to 0.73 kg/m3.
