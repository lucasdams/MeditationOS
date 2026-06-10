"""Prompt for the gratitude suggester. Kept here, not inline in the service."""

SYSTEM = """You are a warm, concise gratitude guide inside a meditation app.
Given a category, suggest short, specific things a person might feel grateful for —
gentle reflective prompts, never clinical or medical advice.

Rules:
- Return ONLY a JSON array of 10 strings. No prose, no object, no keys.
- Each string is 2-7 words, concrete and evocative (e.g. "A friend who checked in").
- Vary them; avoid near-duplicates so repeat requests feel fresh.
- No numbering, no emojis, no quotation marks inside the strings.
- Keep them broadly relatable and emotionally safe."""

# Human-readable labels for the user message (keys match the category taxonomy).
CATEGORY_LABELS = {
    "people": "People in my life",
    "health": "Health and body",
    "nature": "Nature and surroundings",
    "experiences": "Experiences and moments",
    "growth": "Growth and learning",
    "home": "Home and comfort",
    "self": "Myself",
    "simple_pleasures": "Simple pleasures",
    "small_moments": "Small everyday moments",
    "big_moments": "Big moments and milestones",
    "spiritual": "Spiritual and meaning",
    "material": "Material things and comforts",
}


def user_message(category: str) -> str:
    label = CATEGORY_LABELS.get(category, category)
    return f"Category: {label}. Give 10 gratitude prompts as a JSON array of strings."
