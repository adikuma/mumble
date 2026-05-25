# merge the lora adapter into the base and export onnx for the rust ort path.
# see docs/HANDBOOK.md sections 5 (04_export.py) and 6.
import argparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/train.yaml")
    parser.add_argument("--runs-dir", default="runs")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--skip-onnx", action="store_true")
    args = parser.parse_args()

    # steps to implement:
    # 1. merge_adapter(config.base_model, runs/<id>/adapter, runs/<id>/merged).
    # 2. unless --skip-onnx, export_onnx(runs/<id>/merged, runs/<id>/onnx).
    # 3. print "next: make benchmark RUN_ID=<run_id>".
    raise NotImplementedError


if __name__ == "__main__":
    main()
