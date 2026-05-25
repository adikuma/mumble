# lora supervised fine tune of qwen2.5-0.5b for cleanup. this is the core file.
# read docs/HANDBOOK.md section 3 (SFT objective, AdamW, LoRA) before writing it.

# qwen2.5 marks the assistant turn with this header. completion only loss masks
# everything up to and including it, so the loss is computed only on the clean
# target tokens, not the prompt.
ASSISTANT_TEMPLATE = "<|im_start|>assistant\n"


def build_dataset(path, tokenizer, max_rows=None):
    # load the jsonl pairs, render each as a chat with three turns
    # (system prompt, user=raw, assistant=clean) via tokenizer.apply_chat_template
    # (tokenize=False), return a datasets.Dataset with a single "text" column.
    raise NotImplementedError


def train(config, data_dir, run_dir, max_train_rows=None):
    # 1. load AutoTokenizer + AutoModelForCausalLM(config.base_model). set pad
    #    token to eos if missing.
    # 2. build_dataset for train.jsonl and val.jsonl.
    # 3. peft LoraConfig(r=config.lora_r, lora_alpha, lora_dropout,
    #    target_modules=config.lora_target_modules, task_type="CAUSAL_LM").
    # 4. trl SFTConfig with the optimizer/schedule/precision fields from config,
    #    dataset_text_field="text", packing=False, max_length=config.max_seq_length.
    # 5. trl SFTTrainer(model, args, train/eval datasets, peft_config=lora,
    #    data_collator=DataCollatorForCompletionOnlyLM(ASSISTANT_TEMPLATE) when
    #    config.completion_only, processing_class=tokenizer). trainer.train().
    # 6. save adapter + tokenizer to run_dir/adapter. return (adapter_dir, metrics).
    raise NotImplementedError
