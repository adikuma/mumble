# unit tests for the pure injection functions. fill in the assertions.
# run: uv run pytest
import random

from cleanup.config import load_inject_config
from cleanup.inject import make_raw, strip_punctuation_and_lowercase


def test_strip_punctuation_and_lowercase():
    # "Hello, World!" -> "hello world". apostrophes survive: "don't" -> "don't".
    raise NotImplementedError


def test_make_raw_only_adds_tokens():
    # the faithfulness invariant the whole approach relies on: injection only
    # ADDS tokens and removes punctuation/casing, so every content token of the
    # clean target (lowercased, depunctuated) must appear in the raw. assert that
    # over a handful of clean sentences and a seeded rng.
    raise NotImplementedError
