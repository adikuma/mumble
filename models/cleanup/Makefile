.PHONY: help sync data train evaluate export benchmark pack all clean smoke

RUN_ID ?= run-$(shell date -u +%Y%m%d-%H%M%S)
LR ?=
EPOCHS ?=

help:
	@echo "make sync                      install dependencies via uv"
	@echo "make data                      generate synthetic injection pairs and fetch the real eval set"
	@echo "make train RUN_ID=r1           lora fine tune qwen2.5-0.5b, writes runs/r1"
	@echo "make evaluate RUN_ID=r1        base vs fine tune on the held out real test"
	@echo "make export RUN_ID=r1          merge lora and export onnx"
	@echo "make benchmark RUN_ID=r1       cpu latency and memory"
	@echo "make pack RUN_ID=r1            tar the run, print sha256 and the scp line"
	@echo "make all RUN_ID=r1             full pipeline end to end"
	@echo "make smoke                     tiny cpu run to validate wiring (no gpu needed)"

sync:
	uv sync

data:
	uv run python scripts/01_data.py

train:
	uv run python scripts/02_train.py --run-id $(RUN_ID) $(if $(LR),--lr $(LR),) $(if $(EPOCHS),--epochs $(EPOCHS),)

evaluate:
	uv run python scripts/03_evaluate.py --run-id $(RUN_ID)

export:
	uv run python scripts/04_export.py --run-id $(RUN_ID)

benchmark:
	uv run python scripts/05_benchmark.py --run-id $(RUN_ID)

pack:
	uv run python scripts/06_pack_and_ship.py --run-id $(RUN_ID)

all: data train evaluate export benchmark pack

# tiny end to end check on cpu: few pairs, 1 epoch, lightweight eval.
smoke:
	uv run python scripts/01_data.py --num-pairs 200
	uv run python scripts/02_train.py --run-id smoke --epochs 1 --max-train-rows 150
	uv run python scripts/03_evaluate.py --run-id smoke --max-eval-rows 40

clean:
	rm -rf runs/* dist/* data/generated
