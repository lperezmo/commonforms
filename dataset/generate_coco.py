import json
import sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import formalpdf
import logging
import pypdfium2.raw as pdfium_c
import ctypes


logging.getLogger("pypdfium2").setLevel(logging.ERROR)

def process_pdf(pdf_path, output_dir):
    """Process all pages of a PDF and generate JSON annotation files"""
    json_dir = output_dir / "json"
    images_dir = output_dir / "images"
    pdf_name = pdf_path.stem

    # Check if first page JSON exists - if so, skip entire PDF
    first_page_json = json_dir / f"{pdf_name}-0.json"

    if first_page_json.exists():
        return f"Skipped {pdf_name} (already processed)"

    try:
        document = formalpdf.open(str(pdf_path))
        num_pages = len(document)
        total_widgets = 0

        for page_idx in range(num_pages):
            page = document[page_idx]
            pdfium_page = document.document[page_idx]

            width_pt, height_pt = pdfium_page.get_size()
            target_px = 1680
            # Scale based on the smaller dimension
            scale = target_px / min(width_pt, height_pt)

            image = pdfium_page.render(scale=scale, may_draw_forms=False).to_pil()
            widgets = page.widgets()

            image_filename = f"{pdf_name}-{page_idx}.jpg"

            # Create image info
            image_info = {
                    "file_name": image_filename,
                    "width": image.width,
                    "height": image.height,
                    }

            # Save image
            image.save(images_dir / image_filename, format="JPEG")

            # Process annotations
            annotations = []
            for widget in widgets:
                # Use pypdfium2's page-to-device coordinate transformation
                # to properly convert PDF coordinates to image pixel coordinates
                page_x1, page_y1 = widget.rect.left, widget.rect.bottom
                page_x2, page_y2 = widget.rect.right, widget.rect.top

                # Convert page coordinates to device coordinates
                # using pypdfium2's FPDF_PageToDevice function
                dev_x1 = ctypes.c_int()
                dev_y1 = ctypes.c_int()
                dev_x2 = ctypes.c_int()
                dev_y2 = ctypes.c_int()

                # FPDF_PageToDevice(page, start_x, start_y, size_x, size_y, rotate, page_x, page_y, device_x, device_y)
                pdfium_c.FPDF_PageToDevice(
                        pdfium_page.raw, 0, 0, image.width, image.height, 0,
                        page_x1, page_y1, ctypes.byref(dev_x1), ctypes.byref(dev_y1)
                        )
                pdfium_c.FPDF_PageToDevice(
                        pdfium_page.raw, 0, 0, image.width, image.height, 0,
                        page_x2, page_y2, ctypes.byref(dev_x2), ctypes.byref(dev_y2)
                        )

                # Convert to Python ints
                left = float(dev_x1.value)
                bottom = float(dev_y1.value)
                right = float(dev_x2.value)
                top = float(dev_y2.value)

                # Device coordinates have top-left origin, so y values are already correct
                y0 = min(top, bottom)
                y1 = max(top, bottom)

                # try for the category, otherwise "Text"
                categories = { "Text": 0,
                               "ComboBox": 0,
                               "CheckBox": 1,
                               "RadioButton": 1,
                               "Signature": 2,
                               "PushButton": 3,
                               "ListBox": 3,
                               "Unknown": 3 }

                category_id = categories.get(widget.field_type_string, 3)

                if category_id > 2:
                    continue

                bbox_width = right - left
                bbox_height = y1 - y0

                annotations.append({
                    "category_id": category_id,
                    "bbox": [left, y0, bbox_width, bbox_height],
                    "area": bbox_width * bbox_height,
                    "iscrowd": 0,
                    "segmentation": [],
                    })

            # Create per-page JSON
            page_data = {
                    "image": image_info,
                    "annotations": annotations,
                    }

            # Save JSON
            json_path = json_dir / f"{pdf_name}-{page_idx}.json"

            with json_path.open("w") as fp:
                json.dump(page_data, fp, indent=2)

            total_widgets += len(widgets)

        return f"Processed {pdf_name}: {num_pages} pages, {total_widgets} widgets"

    except Exception as e:
        return f"Error processing {pdf_name}: {str(e)}"
    
    finally:
        document.document.close()


def main():
    pdfs_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("pdfs")
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("coco")
    json_dir = output_dir / "json"
    images_dir = output_dir / "images"

    # Create directories
    output_dir.mkdir(exist_ok=True)
    json_dir.mkdir(exist_ok=True)
    images_dir.mkdir(exist_ok=True)

    # Find all PDF files
    pdf_files = list(pdfs_dir.rglob("*.pdf"))
    total_pdfs = len(pdf_files)
    print(f"Found {total_pdfs} PDF files")

    # Check which PDFs are already processed
    skipped_count = 0
    tasks = []

    for pdf_path in pdf_files:
        pdf_name = pdf_path.stem
        first_page_json = json_dir / f"{pdf_name}-0.json"

        if first_page_json.exists():
            skipped_count += 1
        else:
            tasks.append(pdf_path)

    print(f"Already processed (skipped): {skipped_count} PDFs")
    print(f"New PDFs to process: {len(tasks)}")

    if tasks:
        # Process PDFs in parallel
        with ProcessPoolExecutor() as executor:
            futures = {executor.submit(process_pdf, pdf_path, output_dir): pdf_path for pdf_path in tasks}

            completed = 0
            for future in as_completed(futures):
                completed += 1
                result = future.result()
                print(f"[{completed}/{len(tasks)}] {result}")


if __name__ == "__main__":
    main()
