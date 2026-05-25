# load yaml configs into typed dataclasses. no hyperparameters live in code.
# the dataclass fields below mirror the yaml keys and are the scaffolding; YOU
# write the two loaders. see docs/HANDBOOK.md section 5 (config.py).
from dataclasses import dataclass

import yaml  # noqa: F401  (you'll use this in the loaders)


@dataclass
class TrainConfig:
    base_model: str
    max_seq_length: int
    lora_r: int
    lora_alpha: int
    lora_dropout: float
    lora_target_modules: list
    learning_rate: float
    weight_decay: float
    warmup_ratio: float
    max_grad_norm: float
    lr_scheduler_type: str
    num_epochs: int
    train_batch_size: int
    eval_batch_size: int
    gradient_accumulation_steps: int
    max_train_rows: object
    max_eval_rows: object
    bf16: bool
    fp16: bool
    tf32: bool
    seed: int
    logging_steps: int
    save_total_limit: int
    completion_only: bool


def load_train_config(path) -> TrainConfig:
    # read the yaml at path, return TrainConfig(**data).
    raise NotImplementedError


@dataclass
class InjectConfig:
    clean_source: dict
    eval_source: dict
    num_pairs: int
    val_fraction: float
    seed: int
    lowercase_strip_punctuation: float
    filler: dict
    repetition: dict
    false_start: dict


def load_inject_config(path) -> InjectConfig:
    # read the yaml at path, return InjectConfig(**data).
    raise NotImplementedError
