# metric functions for the cleanup task. all pure, given strings. the suite
# balances edit quality (chrf, disfluency f1) against faithfulness (added
# content rate, source overlap), since the dominant risk is the model inventing
# content rather than just deleting and repunctuating. see HANDBOOK section 4.
#
# suggested helper: _norm_tokens(text) -> lowercase, punctuation stripped tokens,
# used by the faithfulness and disfluency metrics so they compare content fairly.


def chrf(hyps, refs):
    # sacrebleu corpus_chrf(hyps, [refs]).score. character n-gram f-score against
    # the gold clean text.
    raise NotImplementedError


def added_content_rate(raw, hyp):
    # fraction of hyp content tokens NOT present in raw. about 0 is ideal: a
    # deletion task should not introduce new words. this is the key hallucination
    # guard.
    raise NotImplementedError


def source_overlap(raw, hyp):
    # fraction of hyp tokens that ARE present in raw. about 1 is ideal.
    raise NotImplementedError


def disfluency_f1(raw, hyp, gold):
    # treat cleanup as deleting tokens from raw. gold deletions = multiset(raw) -
    # multiset(gold); predicted deletions = multiset(raw) - multiset(hyp). compute
    # f1 over those deleted multisets (Counter intersection for tp, etc.).
    raise NotImplementedError


def aggregate(rows):
    # rows: list of {raw, gold, hyp}. return a dict with n, chrf (corpus level),
    # and the per row mean of disfluency_f1, added_content_rate, source_overlap.
    raise NotImplementedError
