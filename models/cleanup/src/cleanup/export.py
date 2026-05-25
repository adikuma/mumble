# merge the lora adapter into the base and export onnx for the rust ort path.
# see docs/HANDBOOK.md sections 5 and 6.


def merge_adapter(base_model, adapter_dir, out_dir):
    # load base AutoModelForCausalLM + PeftModel(adapter), call
    # merge_and_unload() to fold W + (alpha/r)BA back into the base weights,
    # save the standalone model + tokenizer to out_dir. return out_dir.
    raise NotImplementedError


def export_onnx(merged_dir, onnx_dir):
    # optimum ORTModelForCausalLM.from_pretrained(merged_dir, export=True),
    # save_pretrained(onnx_dir) plus the tokenizer. this is the artifact the
    # rust backend loads through the ort crate already in mumble.
    raise NotImplementedError
