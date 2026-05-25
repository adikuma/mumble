# lora fine tune for transcript cleanup. writes runs/<run_id>.
# see docs/HANDBOOK.md section 3 (mechanism) and 5 (02_train.py).
import argparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/train.yaml")
    parser.add_argument("--data-dir", default="data/generated")
    parser.add_argument("--runs-dir", default="runs")
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--lr", type=float, default=None, help="override learning rate")
    parser.add_argument("--epochs", type=int, default=None, help="override epoch count")
    parser.add_argument("--max-train-rows", type=int, default=None, help="cap for smoke")
    args = parser.parse_args()

    # steps to implement:
    # 1. config = load_train_config(args.config); apply --lr / --epochs overrides.
    # 2. precision: if not torch.cuda.is_available() turn bf16/fp16/tf32 off (cpu
    #    smoke); else enable tf32 and fall back bf16 -> fp16 if the gpu lacks bf16.
    # 3. run_id and run_dir = runs/<run_id>; mkdir; dump config.json.
    # 4. adapter_dir, metrics = train(config, data_dir, run_dir, max_train_rows).
    # 5. dump train_metrics.json; print "next: make evaluate RUN_ID=<run_id>".
    raise NotImplementedError


if __name__ == "__main__":
    main()
