# load the cleanup model (optionally with a lora adapter) and clean text.
# see docs/HANDBOOK.md section 5.


def load_model(base_model, adapter_dir=None, dtype=None):
    # load AutoTokenizer (from adapter_dir if given, else base_model) and
    # AutoModelForCausalLM(base_model). if adapter_dir, wrap with
    # PeftModel.from_pretrained(model, adapter_dir). set pad token, eval().
    # return (model, tokenizer).
    raise NotImplementedError


def clean_text(model, tokenizer, raw, max_new_factor=1.6):
    # build chat messages (prompts.build_messages), apply_chat_template with
    # add_generation_prompt=True, tokenize, generate greedily (do_sample=False)
    # with max_new_tokens capped near the raw token length (so cleanup cannot
    # balloon into a reply), decode only the newly generated tokens, return the
    # stripped string.
    raise NotImplementedError
