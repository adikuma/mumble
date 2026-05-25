# build the synthetic training pairs and load the real held out eval set.
# see docs/HANDBOOK.md sections 2 and 5.


def load_clean_sentences(inject_cfg, clean_file=None, cap=None):
    # if clean_file is set, read sentences one per line (used by the smoke target
    # so no big download is needed). otherwise stream the hf dataset named in
    # inject_cfg.clean_source, disable audio decoding (cast the audio column to
    # Audio(decode=False) so torchcodec is not pulled), and collect unique non
    # empty values of the text column up to cap. return list[str].
    raise NotImplementedError


def build_pairs(clean_sentences, inject_cfg, num_pairs, rng):
    # for num_pairs iterations: pick a clean sentence, make_raw it, collect
    # {"raw":..., "clean":...}. randomized injection means one clean sentence
    # yields many distinct raws, so num_pairs can exceed the clean count.
    raise NotImplementedError


def split_pairs(pairs, val_fraction, rng):
    # shuffle a copy, split off val_fraction as val, return (train, val).
    raise NotImplementedError


def load_eval_pairs(inject_cfg, cap=None):
    # stream inject_cfg.eval_source (disable audio), return list of
    # {"raw": <raw_column value>, "clean": <clean_column value>}.
    raise NotImplementedError


def write_jsonl(path, rows):
    # write one json object per line, creating parent dirs.
    raise NotImplementedError


def read_jsonl(path):
    # read a jsonl file into a list of dicts.
    raise NotImplementedError
