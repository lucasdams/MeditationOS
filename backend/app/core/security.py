"""Password hashing. argon2 per docs/design/authentication.md / ADR-0005.

Plaintext passwords are never stored or logged — only the argon2 hash.
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)
