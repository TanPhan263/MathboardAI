# Must match SYMBOLS in src/lib/ink/symbols.ts (same order: it is the network's output order).
CLASSES = [
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "x", "y", "z", "a", "b", "c", "n", "t",
    "+", "-", "=", "<", ">", "≤", "≥", "(", ")", "/", ".", "·",
    "?",
    "∅",  # not a symbol: two glued together, or part of one (used to choose the split)
]
OTHER = "?"
JUNK = "∅"
