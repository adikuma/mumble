# cpu latency of the fine tuned cleanup model on real eval inputs.
# see docs/HANDBOOK.md section 5 (05_benchmark.py).
import argparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/train.yaml")
    parser.add_argument("--data-dir", default="data/generated")
    parser.add_argument("--runs-dir", default="runs")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--samples", type=int, default=20)
    args = parser.parse_args()

    # steps to implement:
    # 1. load the merged model if runs/<id>/merged exists, else base + adapter.
    # 2. time clean_text over the first --samples eval raws (cpu).
    # 3. record avg/min/max latency and the merged + onnx dir sizes in mb.
    # 4. dump benchmark.json and print it.
    raise NotImplementedError


if __name__ == "__main__":
    main()
