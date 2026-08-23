"""A CA bundle that can actually verify INCOIS.

INCOIS's ERDDAP serves only its leaf certificate and omits the "GlobalSign RSA OV SSL CA 2018"
intermediate that signs it. Browsers and curl paper over this - they cache intermediates, or
chase the certificate's AIA extension to fetch one on demand - but Python's `ssl` does neither,
so `requests` cannot build a chain to a trusted root and refuses the connection.

The lazy fix is `verify=False`. We do not do that: it would disable verification for every
host the pipeline talks to, and silently accept anyone who can get between us and Hyderabad.

Instead we supply the intermediate the server forgot. Verification stays fully on, the chain
still has to terminate at a root certifi already trusts, and the only thing that changed is
that we are carrying a link INCOIS should have sent us. The certificate is committed to the
repo so a fresh clone works offline, and it is a public CA certificate, not a secret.
"""

from __future__ import annotations

import os
import tempfile
from functools import lru_cache
from pathlib import Path

import certifi

_MISSING_INTERMEDIATES = Path(__file__).parent.parent / "certs"


@lru_cache(maxsize=1)
def ca_bundle() -> str:
    """Path to certifi's roots plus the intermediates our sources fail to send."""
    bundle = Path(__file__).parent.parent / "certs" / "_bundle.pem"
    parts = [Path(certifi.where()).read_text(encoding="utf-8")]
    parts += [
        pem.read_text(encoding="utf-8")
        for pem in sorted(_MISSING_INTERMEDIATES.glob("*.pem"))
        if pem.name != "_bundle.pem"
    ]
    bundle.write_text("\n".join(parts), encoding="utf-8")
    return str(bundle)
