FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf-cache \
    HF_HUB_DISABLE_TELEMETRY=1 \
    YOLO_CONFIG_DIR=/tmp/Ultralytics \
    MPLCONFIGDIR=/tmp/matplotlib

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# CPU-only torch first, so ultralytics does not pull the CUDA wheels.
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu \
        "torch==2.5.1" "torchvision==0.20.1"

WORKDIR /app
COPY pyproject.toml README.md ./
COPY commonforms ./commonforms

RUN pip install .

# Pre-download model weights so the container runs offline.
# FFDNet-L (.pt) is the CLI default; FFDNet-L (.onnx) covers --fast.
RUN python -c "from huggingface_hub import hf_hub_download; \
hf_hub_download(repo_id='jbarrow/FFDNet-L', filename='FFDNet-L.pt'); \
hf_hub_download(repo_id='jbarrow/FFDNet-L-cpu', filename='FFDNet-L.onnx')"

WORKDIR /work
ENTRYPOINT ["commonforms"]
CMD ["--help"]
