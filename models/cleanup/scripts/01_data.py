# generate synthetic injection pairs and fetch the real held out eval set.
# see docs/HANDBOOK.md section 5 (01_data.py).
import argparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/inject.yaml")
    parser.add_argument("--out-dir", default="data/generated")
    parser.add_argument("--num-pairs", type=int, default=None)
    parser.add_argument("--clean-file", default=None, help="local clean text, smoke only")
    parser.add_argument("--clean-cap", type=int, default=2000)
    parser.add_argument("--eval-cap", type=int, default=None)
    args = parser.parse_args()

    # steps to implement:
    # 1. cfg = load_inject_config(args.config); rng = random.Random(cfg.seed).
    # 2. clean = load_clean_sentences(cfg, args.clean_file, args.clean_cap).
    # 3. pairs = build_pairs(clean, cfg, args.num_pairs or cfg.num_pairs, rng).
    # 4. train, val = split_pairs(pairs, cfg.val_fraction, rng); write both jsonl.
    # 5. eval_pairs = load_eval_pairs(cfg, args.eval_cap); write eval.jsonl (warn on fail).
    # 6. print a few sample pairs so you can confirm the clean side has punctuation.
    raise NotImplementedError


if __name__ == "__main__":
    main()
