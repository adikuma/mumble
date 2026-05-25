# synthetic disfluency injection. given a clean sentence (the target), produce a
# corrupted raw input. every corruption is an insertion plus punctuation and
# casing removal, so the clean target is recoverable from the raw by deletion
# alone. that is what makes the data faithful by construction (the model cannot
# learn to invent content). see docs/HANDBOOK.md sections 2 and 5.


def strip_punctuation_and_lowercase(text):
    # return text lowercased with punctuation removed, keeping apostrophes so
    # contractions survive. collapse whitespace.
    raise NotImplementedError


def make_raw(clean, cfg, rng):
    # cfg is an InjectConfig, rng is a random.Random.
    # 1. tokenize clean on whitespace.
    # 2. with cfg.false_start["prob"], prepend a duplicated 1..max_span head.
    # 3. with cfg.repetition["prob"], duplicate an internal 1..max_span span.
    # 4. with cfg.filler["prob"], insert filler words at gaps (per_gap_prob each).
    # 5. join, then with prob cfg.lowercase_strip_punctuation lowercase + strip.
    # return the corrupted raw string. suggested private helpers: _inject_fillers,
    # _inject_repetition, _inject_false_start.
    raise NotImplementedError
