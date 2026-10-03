"""Question kinds, decided from the textbook's exercise sub-heading (e.g. "VI. Give reasons")."""
import re

VALID_TYPES = ["mcq", "fill", "match", "truefalse", "oneword", "short", "reason", "distinguish",
               "long", "timeline", "problem", "map"]

# order matters: first match wins.  None = skip the block (activities, ICT...)
TYPE_RULES = [
    (r"activit|case stud|project|\bict\b|life skill|exercise for|student|\blab\b|practical", None),
    (r"assertion", "mcq"),
    (r"true or false|true/false|state whether|correct the", "truefalse"),
    (r"choose|correct answer|best answer|correct statement|odd one|incorrect|which of the|tick|consider the|inappropriate", "mcq"),
    (r"fill", "fill"),
    (r"match", "match"),
    (r"distinguish|differentiate|difference between", "distinguish"),
    (r"give reasons?|reason out|account for", "reason"),
    (r"one word|one or two word|word or sentence|in a sentence|very short|vsa", "oneword"),
    (r"\bmap\b|mark the|locate", "map"),
    (r"time ?line", "timeline"),
    (r"problem|numerical|solve|calculat", "problem"),
    (r"detail|paragraph|essay|elaborate|long answer", "long"),
    (r"brief|short|answer|give|define|explain|hot|higher order|value based", "short"),
]


def classify(heading):
    """-> (type or None, unsure: bool)"""
    h = (heading or "").lower()
    for pat, t in TYPE_RULES:
        if re.search(pat, h):
            return t, False
    return "short", True
