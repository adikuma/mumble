# base vs fine tune on the held out real test, plus the adversarial question check.
# see docs/HANDBOOK.md section 4 (metrics) and 5 (03_evaluate.py).
import argparse

# adversarial inputs: questions the model must CLEAN, not ANSWER. answering was
# the base model's exact failure in the prototype, so this is the key behavioral
# test. keep/extend this list.
ADVERSARIAL = [
    "um what's the capital of france",
    "can you can you write me a poem about the sea",
    "so like what is two plus two i mean",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/train.yaml")
    parser.add_argument("--data-dir", default="data/generated")
    parser.add_argument("--runs-dir", default="runs")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--max-eval-rows", type=int, default=None)
    args = parser.parse_args()

    # steps to implement:
    # 1. load eval.jsonl (cap to --max-eval-rows).
    # 2. load_model(base) -> generate clean_text for each raw -> base_rows.
    # 3. load_model(base, adapter=runs/<id>/adapter) -> ft_rows.
    # 4. metrics = {"base": aggregate(base_rows), "fine_tune": aggregate(ft_rows)}.
    # 5. for each ADVERSARIAL question, record base vs fine_tune cleaned output.
    # 6. dump eval_metrics.json; print the metrics table and the adversarial
    #    before/after so you can eyeball that questions are cleaned, not answered.
    raise NotImplementedError


if __name__ == "__main__":
    main()
