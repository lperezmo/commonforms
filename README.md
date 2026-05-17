# CommonForms

🪄 Automatically convert a PDF into a fillable form.

[💻 Hosted Models (detect.semanticdocs.org)](https://detect.semanticdocs.org) | [📄 CommonForms Paper](https://arxiv.org/abs/2509.16506) | [🤗 Dataset](https://huggingface.co/datasets/jbarrow/CommonForms) | [🤗 FFDNet-L](https://huggingface.co/jbarrow/FFDNet-L) | [🤗 FFDNet-S](https://huggingface.co/jbarrow/FFDNet-S)

![Pipeline](https://raw.githubusercontent.com/jbarrow/commonforms/main/assets/pipeline.png)

This repo contains three things:
1. the pip-installable `commonforms` package, which has a CLI and API for converting PDFs into fillable forms
2. the FFDNet-S and FFDNet-L models from the paper [CommonForms: A Large, Diverse Dataset for Form Field Detection](https://arxiv.org/abs/2509.16506) 
3. the preprocessing code for the CommonForms dataset, which is hosted on HuggingFace: https://huggingface.co/datasets/jbarrow/CommonForms


## Installation

CommonForms can be installed with either `uv` or `pip`, feel free to choose your package manager flavor:

```sh
uv pip install commonforms
```

Once it's installed, you should be able to run the CLI command on ~any PDF.

## Web GUI (Docker)

A self-hosted web interface is published at [`lperezmo05/commonforms-web`](https://hub.docker.com/r/lperezmo05/commonforms-web). Pull, run, open the URL on your phone over the LAN, drop a PDF, get back a fillable one. FFDNet-L and FFDNet-S weights (both `.pt` and `.onnx`) are baked in, so the container runs fully offline.

```sh
docker pull lperezmo05/commonforms-web:latest
docker run -d --name commonforms-web -p 8000:8000 -v cf-data:/data \
    lperezmo05/commonforms-web:latest
```

Then visit `http://<your-host-ip>:8000` from any device on your LAN. Inside the container the server listens on `0.0.0.0:8000`; pick whatever host port you want with `-p HOSTPORT:8000`.

Environment variables:

| Var | Default | Purpose |
|---|---|---|
| `CF_AUTH_PASSWORD` | unset | If set, gates the UI behind a shared password (LAN safety) |
| `CF_MAX_UPLOAD_MB` | `100` | Reject larger uploads |
| `CF_JOB_TTL_MINUTES` | `60` | Auto-delete uploaded + output PDFs after this |
| `CF_DEVICE` | `cpu` | Inference device |
| `CF_DATA_DIR` | `/data` | Where uploads/outputs live (mount a volume here) |

Example with password and a bigger upload limit:

```sh
docker run -d --name commonforms-web -p 8000:8000 -v cf-data:/data \
    -e CF_AUTH_PASSWORD=hunter2 -e CF_MAX_UPLOAD_MB=250 \
    lperezmo05/commonforms-web:latest
```

The web UI exposes the same knobs as the CLI: model (`FFDNet-L` / `FFDNet-S`), fast mode, confidence threshold, image size, keep-existing-fields, signature widgets, and multiline text boxes.

## Docker

A self-contained image is published at [`lperezmo05/commonforms`](https://hub.docker.com/r/lperezmo05/commonforms) on Docker Hub. The FFDNet-L weights (both `.pt` and `.onnx` for `--fast`) are baked in, so the container runs fully offline once pulled.

```sh
docker pull lperezmo05/commonforms:latest
```

Mount a directory containing your PDFs and call the CLI exactly like you would on the host. The image's working directory is `/work`:

```sh
docker run --rm -v "$PWD:/work" lperezmo05/commonforms:latest input.pdf output.pdf
```

CLI flags work the same way:

```sh
docker run --rm -v "$PWD:/work" lperezmo05/commonforms:latest \
    input.pdf output.pdf --fast --confidence 0.4
```

On Windows PowerShell:

```powershell
docker run --rm -v "${PWD}:/work" lperezmo05/commonforms:latest input.pdf output.pdf
```

Tags:
- `latest` and `0.1.6` track the current package version.

### Building locally

If you want to rebuild from source:

```sh
docker build -t commonforms .
docker run --rm -v "$PWD:/work" commonforms input.pdf output.pdf
```

## CommonForms CLI

The simplest usage will run inference on your CPU using the default suggested settings:

```
commonforms <input.pdf> <output.pdf>
```

| Input | Output |
|-------|--------|
| ![Input PDF](https://raw.githubusercontent.com/jbarrow/commonforms/main/assets/input.png) | ![Output PDF](https://raw.githubusercontent.com/jbarrow/commonforms/main/assets/output.png) |

### Command Line Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `input` | Path | Required | Path to the input PDF file |
| `output` | Path | Required | Path to save the output PDF file |
| `--model` | str | `FFDNet-L` | Model name (FFDNet-L/FFDNet-S) or path to custom .pt file |
| `--keep-existing-fields` | flag | `False` | Keep existing form fields in the PDF |
| `--use-signature-fields` | flag | `False` | Use signature fields instead of text fields for detected signatures |
| `--device` | str | `cpu` | Device for inference (e.g., `cpu`, `cuda`, `0`) |
| `--image-size` | int | `1600` | Image size for inference |
| `--confidence` | float | `0.3` | Confidence threshold for detection |
| `--fast` | flag | `False` | If running on a CPU, you can trade off accuracy for speed and run in about half the time |
| `--multiline` | flag | `False` | If you want the detected textboxes to allow multiline inputs |


## CommonForms API

In addition to the CLI, you can use

```py
from commonforms import prepare_form

prepare_form(
    "path/to/input.pdf",
    "path/to/output.pdf"
)
```

All of the above arguments are keyword arguments to the `prepare_form` function.

## Dataset Prep

🚧 Code for dataset prep exists in the `dataset` folder.


# Citation

If you use the tool, models, or code in an academic paper, please cite the CommonForms paper:
```
@misc{barrow2025commonforms,
  title        = {CommonForms: A Large, Diverse Dataset for Form Field Detection},
  author       = {Barrow, Joe},
  year         = {2025},
  eprint       = {2509.16506},
  archivePrefix= {arXiv},
  primaryClass = {cs.CV},
  doi          = {10.48550/arXiv.2509.16506},
  url          = {https://arxiv.org/abs/2509.16506}
}
```

If you use it in a non-academic setting, please reach out to the author (joseph.d.barrow [at] gmail.com)!
I love to hear when people are using my work!
