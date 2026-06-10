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
    "material": "Things I have",
    "work": "Work and livelihood",
    "food": "Food and drink",
    "learning": "Learning and ideas",
    "creativity": "Creativity and making",
    "kindness": "Kindness and generosity",
    "music": "Music and sound",
    "animals": "Animals and pets",
    "travel": "Travel and places",
    "friendship": "Friendship",
    "family": "Family",
    "love": "Love",
    "play": "Play and fun",
    "memories": "Memories and the past",
    "hope": "Hope and the future",
    "body": "The body and senses",
    "mind": "The mind",
    "mornings": "Mornings",
    "evenings": "Evenings and rest",
    "weather": "Weather and sky",
    "comfort": "Comfort and coziness",
    "freedom": "Freedom and choice",
    "abundance": "Abundance and enough",
    "community": "Community and belonging",
    "beauty": "Beauty in the world",
}


def user_message(category: str) -> str:
    label = CATEGORY_LABELS.get(category, category)
    return f"Category: {label}. Give 10 gratitude prompts as a JSON array of strings."
