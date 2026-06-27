from huggingface_hub import snapshot_download

print("[s2] Downloading fishaudio/s2-pro to models/s2-pro...")
snapshot_download(
    repo_id="fishaudio/s2-pro",
    local_dir="models/s2-pro",
    allow_patterns=[
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "chat_template.jinja",
        "codec.pth",
        "model.pth",
        "model.safetensors",
        "*.ckpt",
        "*.bin",
        "*.safetensors",
        "firefly-gan-vq-fsq-8x1024-21hz-generator.pth",
    ],
    local_dir_use_symlinks=False,
)
print("[s2] Model download complete.")
