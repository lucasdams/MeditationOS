"""SQLAlchemy models. Importing them here registers their tables on
`Base.metadata` so Alembic autogenerate and `env.py` can see every model.
"""

from app.models.user import User  # noqa: F401
