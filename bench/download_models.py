"""download the parakeet models and the librispeech test-clean parquet.

the two model repos are owned by the legitimate sherpa-onnx maintainer
(csukuangfj / k2-fsa). the dataset comes from the huggingface convert branch
of openslr/librispeech_asr, so no dataset loader script is executed. files land
under models/int8, models/fp32, and data/librispeech.
"""

from pathlib import Path

from huggingface_hub import snapshot_download

MODEL_REPOS = {
    "int8": "csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    "fp32": "csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3",
}
MODELS_DIR = Path(__file__).parent / "models"

DATASET_REPO = "openslr/librispeech_asr"
DATASET_REVISION = "refs/convert/parquet"
DATASET_PATTERN = "clean/test/*"
DATA_DIR = Path(__file__).parent / "data" / "librispeech"


def main():
    for variant, repo in MODEL_REPOS.items():
        dest = MODELS_DIR / variant
        print(f"downloading {repo} to {dest}")
        snapshot_download(repo_id=repo, local_dir=str(dest))
        print(f"done {variant}")

    print(f"downloading {DATASET_REPO} {DATASET_PATTERN} to {DATA_DIR}")
    snapshot_download(
        repo_id=DATASET_REPO,
        repo_type="dataset",
        revision=DATASET_REVISION,
        allow_patterns=DATASET_PATTERN,
        local_dir=str(DATA_DIR),
    )
    print("done dataset")


if __name__ == "__main__":
    main()
