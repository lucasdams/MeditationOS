"""AI-generated gratitude prompt options, with a curated fallback.

The Anthropic SDK is imported lazily so the dependency only loads when the feature
is configured, and so tests can patch `suggest_options` without it. Model output is
treated as untrusted and validated; any failure (no key, timeout, bad shape) falls
back to a curated set. The fallback draws a random sample from a large pool, so the
"show different ideas" reload feels fresh even without a key. We never send the
user's own gratitude text to the model. See .claude/rules/ai-product.md.
"""

import json
import logging
import random

from app.core.config import settings
from app.prompts.gratitude import SYSTEM, user_message

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
MAX_OPTIONS = 10
MAX_OPTION_LEN = 60
TIMEOUT_SECONDS = 8.0

# Curated pools (much larger than MAX_OPTIONS) — sampled randomly, so reloading
# keeps surfacing fresh sets. Used when the API key is unset, or on any failure.
FALLBACK_OPTIONS: dict[str, list[str]] = {
    "people": [
        "A friend who checked in on me",
        "Someone who made me laugh",
        "My family's support",
        "A kind stranger",
        "A mentor or teacher",
        "Someone I love",
        "A friend I can be myself with",
        "Someone who believed in me",
        "A neighbor's small kindness",
        "Reconnecting with an old friend",
        "Someone who really listened",
        "A community I belong to",
        "A friend's honesty",
        "Someone's patience with me",
        "A grandparent's wisdom",
        "A child's energy",
        "Someone who forgave me",
        "A coworker who helped out",
        "An old friend who stayed",
        "Someone who showed up when it mattered",
    ],
    "health": [
        "A good night's sleep",
        "Being able to move my body",
        "A nourishing meal",
        "A moment of rest",
        "My breath, steady and calm",
        "Feeling a little better today",
        "My senses — sight, sound, taste",
        "Energy to get through the day",
        "A body that carries me",
        "Healing, slow as it is",
        "Clean water to drink",
        "A moment without pain",
        "A doctor or nurse who helped",
        "Recovering from being sick",
        "My beating heart",
        "Being able to see clearly",
        "Strength I didn't know I had",
        "Waking up rested",
        "A calm, quiet mind",
        "Two feet to stand on",
    ],
    "nature": [
        "Sunlight on my face",
        "Fresh air outside",
        "A walk I took",
        "The sound of rain",
        "A tree or plant nearby",
        "The quiet of early morning",
        "The night sky",
        "A change in the season",
        "Birdsong",
        "The feel of a breeze",
        "Flowers in bloom",
        "The ocean or a river",
        "Stars on a clear night",
        "The smell after rain",
        "Warm sand or grass",
        "A sunset",
        "Mountains or hills",
        "Light changing at dusk",
        "Snow falling quietly",
        "Leaves turning color",
    ],
    "experiences": [
        "Something that made me smile",
        "A good conversation",
        "Music I enjoyed",
        "A small adventure",
        "A moment of stillness",
        "Something new I tried",
        "A book or show I loved",
        "Laughing until it hurt",
        "A trip or outing",
        "Getting lost in a hobby",
        "A memory that resurfaced",
        "A moment of flow",
        "A film that moved me",
        "Dancing to a song",
        "A meal shared with others",
        "A spontaneous yes",
        "A long, easy drive",
        "Seeing something for the first time",
        "A celebration",
        "Time that flew by",
    ],
    "growth": [
        "A small win today",
        "Something I learned",
        "Progress on a goal",
        "Getting through something hard",
        "A mistake I grew from",
        "An opportunity ahead of me",
        "Feedback that helped me",
        "A habit that's sticking",
        "Facing a fear",
        "Patience with myself",
        "A challenge that stretched me",
        "How far I've come",
        "Asking for help",
        "Saying no when I needed to",
        "A lesson learned the hard way",
        "Becoming more patient",
        "A skill I'm building",
        "Owning a mistake",
        "A perspective that shifted",
        "Starting over",
    ],
    "home": [
        "A warm, safe place to be",
        "My favorite spot at home",
        "A comforting routine",
        "A cup of coffee or tea",
        "Quiet at the end of the day",
        "Something that makes home feel like home",
        "A cozy blanket",
        "A freshly made bed",
        "The smell of cooking",
        "A place to rest",
        "My own space",
        "Light through a window",
        "A door that locks",
        "A kitchen to cook in",
        "A chair that fits me",
        "Familiar sounds at home",
        "A pet at my feet",
        "A tidy room",
        "Somewhere to come back to",
        "The hum of a quiet house",
    ],
    "self": [
        "Something I did well",
        "A quality I'm proud of",
        "Showing up for myself today",
        "My own resilience",
        "Taking time to breathe",
        "Being kind to myself",
        "My curiosity",
        "A boundary I kept",
        "My sense of humor",
        "Trusting my gut",
        "Forgiving myself",
        "Just being here",
        "My imagination",
        "A choice I'm proud of",
        "Standing up for myself",
        "My ability to begin again",
        "Noticing the good",
        "A calm I found",
        "My honesty",
        "Letting myself rest",
    ],
    "simple_pleasures": [
        "My first sip of coffee",
        "A warm shower",
        "A good stretch",
        "Comfortable clothes",
        "A small treat",
        "A moment of peace and quiet",
        "Clean sheets",
        "A favorite song coming on",
        "Sunlight through a window",
        "A deep breath",
        "A good meal",
        "Crossing something off my list",
        "An unhurried nap",
        "Cold water on a hot day",
        "A good book",
        "A favorite mug",
        "Music in the background",
        "A slow morning",
        "Fresh, clean laundry",
        "A perfectly ripe piece of fruit",
    ],
    "small_moments": [
        "A stranger's smile",
        "Catching a green light",
        "The first sip of something warm",
        "A text from someone I missed",
        "A song that fit the moment",
        "Finishing a small task",
        "A pet's greeting",
        "A short, good laugh",
        "A quiet pause in a busy day",
        "The smell of fresh air",
        "A kind word, offered or received",
        "A moment that just felt easy",
        "Holding a warm mug",
        "A door held open for me",
        "A perfectly timed break",
        "Sun breaking through clouds",
        "A good parking spot",
        "A message that made me smile",
        "One small thing going right",
        "A breath of fresh air",
    ],
    "big_moments": [
        "A milestone I reached",
        "A relationship that shaped me",
        "A risk that paid off",
        "A turning point in my life",
        "Somewhere meaningful I've been",
        "A goal I worked years for",
        "A person who changed my path",
        "Becoming who I am",
        "A hard season I survived",
        "A chance I took",
        "A door that opened",
        "A dream I'm living",
        "A graduation or first day",
        "Moving somewhere new",
        "Meeting someone important",
        "A leap of faith",
        "Coming through a loss",
        "A long-held wish coming true",
        "A bold decision",
        "A new chapter beginning",
    ],
    "spiritual": [
        "A sense of something larger",
        "A moment of awe",
        "Feeling deeply connected",
        "Peace I can't quite explain",
        "A grounding stillness",
        "My faith or practice",
        "Gratitude itself",
        "A sense of purpose",
        "Being fully present",
        "The mystery of being alive",
        "A feeling of being held",
        "Letting go of control",
        "A prayer or meditation",
        "A sense of grace",
        "Forgiveness, given or received",
        "Trust in something unseen",
        "A quiet kind of hope",
        "Feeling part of something",
        "The gift of this day",
        "Surrender",
    ],
    "material": [
        "A roof over my head",
        "Food in the kitchen",
        "Warm clothes",
        "A device that connects me",
        "Reliable transport",
        "Enough for what I need",
        "A tool that makes life easier",
        "A comfortable bed",
        "Something I saved up for",
        "Running water and heat",
        "A gift someone gave me",
        "Enough — and a little extra",
        "Shoes that fit",
        "A working phone",
        "Heat on a cold night",
        "A full fridge",
        "A bed of my own",
        "Tools for my work",
        "Savings, however small",
        "A comfortable chair",
    ],
}


def _fallback(category: str) -> list[str]:
    pool = FALLBACK_OPTIONS.get(category, FALLBACK_OPTIONS["experiences"])
    return random.sample(pool, min(MAX_OPTIONS, len(pool)))


def _validate(raw: object) -> list[str] | None:
    """Accept only a list of short, non-empty strings (untrusted model output)."""
    if not isinstance(raw, list):
        return None
    cleaned = [
        item.strip()
        for item in raw
        if isinstance(item, str) and item.strip() and len(item.strip()) <= MAX_OPTION_LEN
    ]
    return cleaned[:MAX_OPTIONS] or None


def suggest_options(category: str) -> list[str]:
    """Return ~10 gratitude prompts for a category. Never raises — degrades to fallback."""
    if not settings.anthropic_api_key:
        return _fallback(category)
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key, timeout=TIMEOUT_SECONDS
        )
        message = client.messages.create(
            model=MODEL,
            max_tokens=500,
            temperature=1.0,
            system=SYSTEM,
            messages=[{"role": "user", "content": user_message(category)}],
        )
        text = "".join(b.text for b in message.content if b.type == "text")
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end == -1:
            raise ValueError("no JSON array in model output")
        options = _validate(json.loads(text[start : end + 1]))
        if options is None:
            raise ValueError("model output failed validation")
        return options
    except Exception:
        # Any failure (network, timeout, parse, validation) degrades gracefully.
        logger.warning("gratitude suggester failed; using curated fallback", exc_info=False)
        return _fallback(category)
