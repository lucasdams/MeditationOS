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
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(
        credential, google_requests.Request(), settings.google_client_id
    )
