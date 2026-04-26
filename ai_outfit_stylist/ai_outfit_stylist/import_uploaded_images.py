from __future__ import annotations

import json
import shutil
from pathlib import Path


VALID_CLASSES = {"tshirt", "dress", "jacket", "casual"}


def resolve_upload_source(raw_dir: Path, filename: str) -> Path | None:
    exact = raw_dir / filename
    if exact.exists():
        return exact

    filename_variants = {filename, Path(filename).stem}
    stem_matches = [
        path
        for path in raw_dir.iterdir()
        if path.is_file() and (path.name in filename_variants or path.stem in filename_variants)
    ]
    if len(stem_matches) == 1:
        return stem_matches[0]

    if stem_matches:
        preferred = sorted(stem_matches, key=lambda path: (path.suffix.lower() != ".jpg", path.suffix.lower() != ".jpeg", path.suffix.lower() != ".png", path.name))
        return preferred[0]

    return None


def main() -> None:
    project_root = Path(__file__).resolve().parent
    uploads_dir = project_root / "uploads"
    raw_dir = uploads_dir / "raw"
    labels_file = uploads_dir / "labels.json"
    dataset_train = project_root / "dataset" / "train"

    dataset_train.mkdir(parents=True, exist_ok=True)

    if not labels_file.exists():
        print(f"Missing labels file: {labels_file}")
        print("Create a JSON file like: {\"image1.jpg\": \"dress\", \"image2.png\": \"tshirt\"}")
        return

    if not raw_dir.exists():
        print(f"Missing upload source folder: {raw_dir}")
        print("Place your image files in uploads/raw first.")
        return

    labels = json.loads(labels_file.read_text(encoding="utf-8"))
    if not isinstance(labels, dict):
        print("labels.json must contain a JSON object mapping filenames to class names.")
        return

    copied = 0
    skipped = 0

    for filename, class_name in labels.items():
        if not isinstance(filename, str) or not isinstance(class_name, str):
            skipped += 1
            continue

        normalized_class = class_name.strip().lower()
        if normalized_class not in VALID_CLASSES:
            skipped += 1
            continue

        source = resolve_upload_source(raw_dir, filename)
        if source is None:
            skipped += 1
            continue

        destination_dir = dataset_train / normalized_class
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / source.name
        shutil.copy2(source, destination)
        copied += 1

    print(f"Copied {copied} uploaded images into dataset/train")
    print(f"Skipped {skipped} entries")


if __name__ == "__main__":
    main()