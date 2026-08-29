"""OPeNDAP (DAP2), served from the native Grids.

PS 26067 asks for "a lightweight REST/OPeNDAP API backend". The REST half has always been here.
This is the other half, and it is the one an INCOIS engineer would actually use: OPeNDAP is how
oceanographers pull a slice of a large array over the web without downloading the whole thing,
straight into their own Python, Matlab or Ferret. They never visit the website.

One correction worth recording, because the README had it slightly wrong: this project already
*consumes* OPeNDAP. ERDDAP's griddap is a DAP2 server - measured on INCOIS's own,
`incois_argo_10d_VAM.dds` returns a proper dataset descriptor and `.dods` returns binary DAP - so
"we consume ERDDAP subsetting" and "we consume OPeNDAP" are the same sentence. What was missing
was serving it.

Why this is hand-written rather than a library

`xpublish` is the sanctioned xarray route and needs Python 3.11; this project runs 3.10.
`xpublish-wms` pulls in Cartopy, dask, distributed, datashader, numba and pyarrow - forty
packages to serve five one-degree fields. DAP2 over a rectangular array is a small, completely
specified protocol: three responses, two of them plain text. Writing it costs less than the
dependency and is testable against a real client, which `test_dap.py` does - it opens these
endpoints with `pydap` and checks the numbers that come back against the Grid they came from.

The protocol, in the amount of it that applies here

- `.das` - attributes, as nested text.
- `.dds` - structure: types, names and dimension sizes.
- `.dods` - the DDS for whatever was asked for, then `Data:\\n`, then XDR: each array preceded by
  its element count written twice as a big-endian int32, then the elements big-endian.

A constraint expression selects variables and hyperslabs: `?temperature[0][0:9][0:35][0:45]`.
Everything is served from the native Grid, never the Volume - see the note in `cf.py`.
"""

from __future__ import annotations

import re
import struct
from typing import Iterable

import numpy as np

DATASET_NAME = "samudra"

# DAP2 type names for the dtypes this project actually serves. Everything is float; a count of
# casts is stored as a float because it is NaN over land, which an integer cannot express.
_DAP_TYPE = {"float32": "Float32", "float64": "Float64"}


class ConstraintError(ValueError):
    """A constraint expression that names something the dataset does not have."""


def _dap_type(array: np.ndarray) -> str:
    name = array.dtype.name
    if name not in _DAP_TYPE:
        raise ConstraintError(f"cannot serve dtype {name} over DAP2")
    return _DAP_TYPE[name]


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


# ----------------------------------------------------------------- structure


def dds(dataset, name: str = DATASET_NAME, variables: Iterable[str] | None = None) -> str:
    """The Dataset Descriptor Structure.

    Each data variable is served as a DAP `Grid`: the array itself, plus one map vector per
    dimension. That is what lets a client discover the axes rather than being told them, and it
    is the shape ERDDAP serves too - so a script written against INCOIS works against this.
    """
    # Coordinates first, then the Grids. ERDDAP declares them both ways for the same reason:
    # a DAP Grid's MAPS are enough for a client that understands Grids, and xarray's pydap
    # backend is not one - given maps alone it reported "Dimensions without coordinates" and
    # `.sel(latitude=...)` failed, so the axes have to be top-level variables as well.
    wanted = (
        list(variables)
        if variables is not None
        else [c for c in dataset.coords] + list(dataset.data_vars)
    )
    lines = ["Dataset {"]
    for key in wanted:
        if key in dataset.data_vars:
            array = dataset[key]
            # One bracket pair per dimension. DAP2 does not comma-separate them inside a single
            # pair, and pydap refuses a DDS that does - "Unable to parse token: , depth =".
            shape = "".join(f"[{d} = {array.sizes[d]}]" for d in array.dims)
            lines.append("    Grid {")
            lines.append("      ARRAY:")
            lines.append(f"        {_dap_type(array.values)} {key}{shape};")
            lines.append("      MAPS:")
            for dim in array.dims:
                axis = dataset[dim]
                lines.append(
                    f"        {_dap_type(_axis_values(axis))} {dim}[{dim} = {axis.size}];"
                )
            lines.append(f"    }} {key};")
        elif key in dataset.coords:
            axis = dataset[key]
            lines.append(
                f"    {_dap_type(_axis_values(axis))} {key}[{key} = {axis.size}];"
            )
        else:
            raise ConstraintError(f"no variable named {key!r}")
    lines.append(f"}} {name};")
    return "\n".join(lines) + "\n"


def _axis_values(axis) -> np.ndarray:
    """A coordinate as numbers DAP2 can carry.

    Time is the awkward one: xarray holds it as `datetime64`, which DAP2 has no type for, so it
    goes over the wire as CF-style seconds since an epoch and says so in its attributes. Silently
    sending the raw 64-bit integers would be a number no client could interpret.
    """
    values = axis.values
    if np.issubdtype(values.dtype, np.datetime64):
        epoch = np.datetime64("1970-01-01T00:00:00", "s")
        return (values.astype("datetime64[s]") - epoch).astype("float64")
    if values.dtype == np.float64:
        return values
    return values.astype("float32")


def _axis_attributes(dataset, dim: str) -> dict:
    attrs = dict(dataset[dim].attrs)
    if np.issubdtype(dataset[dim].values.dtype, np.datetime64):
        attrs["units"] = "seconds since 1970-01-01T00:00:00Z"
    return attrs


# ----------------------------------------------------------------- attributes


def das(dataset, name: str = DATASET_NAME) -> str:
    """The Dataset Attribute Structure: everything `cf.py` attached, in DAP2's own syntax."""
    lines = ["Attributes {"]
    for key in list(dataset.data_vars) + [c for c in dataset.coords]:
        lines.append(f"    {key} {{")
        attrs = (
            _axis_attributes(dataset, key)
            if key in dataset.coords
            else dict(dataset[key].attrs)
        )
        for attribute, value in attrs.items():
            lines.append(f"        {_attribute_line(attribute, value)}")
        lines.append("    }")
    lines.append("    NC_GLOBAL {")
    for attribute, value in dataset.attrs.items():
        lines.append(f"        {_attribute_line(attribute, value)}")
    lines.append("    }")
    lines.append("}")
    return "\n".join(lines) + "\n"


def _attribute_line(attribute: str, value) -> str:
    if isinstance(value, (int, np.integer)):
        return f"Int32 {attribute} {int(value)};"
    if isinstance(value, (float, np.floating)):
        # NaN is what _FillValue is here, and DAP2 clients read it as a bare token.
        return f"Float64 {attribute} {float(value)!r};"
    return f'String {attribute} "{_escape(str(value))}";'


# ----------------------------------------------------------------- constraints


_SLICE = re.compile(r"\[(-?\d+)(?::(-?\d+))?(?::(-?\d+))?\]")


def parse_constraint(expression: str | None, dataset) -> list[tuple[str, tuple[slice, ...]]]:
    """Turn `?temperature[0][0:9][0:35][0:45]` into variables and slices.

    DAP2's three-part hyperslab is `[start:stride:stop]`, and **stop is inclusive** - which is
    the trap, because Python's is not. `[0:23]` over 24 levels means all 24, not 23. A client
    that asks for the whole array and gets one level short would look like our arithmetic was
    wrong rather than our protocol.
    """
    if not expression:
        # Same order as `dds()` declares them, because a .dods body is positional.
        return [(key, ()) for key in list(dataset.coords) + list(dataset.data_vars)]

    out: list[tuple[str, tuple[slice, ...]]] = []
    for clause in expression.split(","):
        clause = clause.strip()
        if not clause:
            continue
        name = clause.split("[", 1)[0]
        # `temperature.temperature` selects the array out of a DAP Grid. Both halves name the
        # same thing here, and a client is entitled to ask either way.
        if "." in name:
            outer, inner = name.split(".", 1)
            name = inner if inner in dataset.variables else outer
        if name not in dataset.variables:
            raise ConstraintError(f"no variable named {name!r}")

        slices = []
        for start, stop, step in _SLICE.findall(clause):
            if step:  # [start:stride:stop]
                slices.append(slice(int(start), int(step) + 1, int(stop)))
            elif stop:  # [start:stop], stop inclusive
                slices.append(slice(int(start), int(stop) + 1, 1))
            else:  # [index]
                slices.append(slice(int(start), int(start) + 1, 1))
        out.append((name, tuple(slices)))
    return out


def _apply(array, slices: tuple[slice, ...]):
    if not slices:
        return array
    if len(slices) > array.ndim:
        raise ConstraintError(
            f"{array.name} has {array.ndim} dimensions; the constraint gave {len(slices)}"
        )
    return array[slices]


# ----------------------------------------------------------------- data


def _xdr(values: np.ndarray) -> bytes:
    """One array, DAP2 style: the element count twice as big-endian int32, then the elements.

    The doubled length is not a mistake in this code - it is what DAP2 specifies for arrays, and
    a client that reads only one of them silently misaligns every array after the first.
    """
    flat = np.ascontiguousarray(values).ravel()
    header = struct.pack(">ii", flat.size, flat.size)
    return header + flat.astype(flat.dtype.newbyteorder(">")).tobytes()


def dods(dataset, expression: str | None = None, name: str = DATASET_NAME) -> bytes:
    """The DDS for what was asked for, then the data."""
    selected = parse_constraint(expression, dataset)

    subset = {}
    order: list[str] = []
    for key, slices in selected:
        if key in dataset.data_vars:
            array = _apply(dataset[key], slices)
            subset[key] = array
            order.append(key)
        else:
            subset[key] = _apply(dataset[key], slices)
            order.append(key)

    trimmed = _describe(dataset, subset, order, name)

    body = [trimmed.encode("ascii"), b"\n\nData:\n"]
    for key in order:
        array = subset[key]
        if key in dataset.data_vars:
            body.append(_xdr(np.asarray(array.values, dtype="float32")))
            # A DAP Grid sends its maps straight after its array, trimmed the same way.
            for dim in array.dims:
                axis = dataset[dim]
                values = _axis_values(axis)
                # The map has to match the slab that was actually sent, or the client will draw
                # the right numbers at the wrong coordinates.
                index = array.get_index(dim)
                positions = axis.get_index(dim).get_indexer(index)
                body.append(_xdr(values[positions]))
        else:
            body.append(_xdr(_axis_values(array)))
    return b"".join(body)


def _describe(dataset, subset, order, name) -> str:
    """A DDS for the trimmed arrays rather than the whole dataset."""
    lines = ["Dataset {"]
    for key in order:
        array = subset[key]
        if key in dataset.data_vars:
            shape = "".join(f"[{d} = {array.sizes[d]}]" for d in array.dims)
            lines.append("    Grid {")
            lines.append("      ARRAY:")
            lines.append(f"        Float32 {key}{shape};")
            lines.append("      MAPS:")
            for dim in array.dims:
                values = _axis_values(dataset[dim])
                lines.append(
                    f"        {_DAP_TYPE[values.dtype.name]} {dim}[{dim} = {array.sizes[dim]}];"
                )
            lines.append(f"    }} {key};")
        else:
            values = _axis_values(array)
            lines.append(
                f"    {_DAP_TYPE[values.dtype.name]} {key}[{key} = {array.size}];"
            )
    lines.append(f"}} {name};")
    return "\n".join(lines)
