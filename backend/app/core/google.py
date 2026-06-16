"""Verify Google ID tokens (the "Sign in with Google" credential).

The frontend obtains an ID token via Google Identity Services and POSTs it here;
we verify its signature, audience, issuer, and expiry against Google's public
keys. No client secret is needed for this flow — only the public client ID.
"""

from app.core.config import settings


def verify_id_token(credential: str) -> dict:
    """Return the verified claims, or raise ValueError if the token is invalid.

    `verify_oauth2_token` checks the signature against Google's rotating keys and
    that `aud == GOOGLE_CLIENT_ID`, the issuer is Google, and the token is unexpired.
    """
    if not settings.google_client_id:
        raise ValueError("Google sign-in is not configured")

    # Imported lazily so the dependency is only loaded when the feature is used
    # (and so tests can patch `verify_id_token` without importing google-auth).
    import urllib3
    from google.auth.transport import urllib3 as google_urllib3
    from google.oauth2 import id_token

    # A 10 s timeout ensures a hung Google cert endpoint can't stall the login
    # flow indefinitely. urllib3.PoolManager forwards the Timeout to every request.
    http = urllib3.PoolManager(timeout=urllib3.Timeout(connect=10, read=10))
    return id_token.verify_oauth2_token(
        credential,
        google_urllib3.Request(http),
        settings.google_client_id,
    )
