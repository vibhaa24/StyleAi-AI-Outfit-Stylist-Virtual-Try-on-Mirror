from __future__ import annotations

import json
import shutil
from pathlib import Path


def get_class(category_id: int) -> str:
    if category_id in [1, 2, 3]:
        return "tshirt"
    if category_id in [4, 5, 6]:
        return "dress"
    if category_id in [7, 8]:
        return "jacket"
    return "casual"


def pick_source_root(project_root: Path) -> Path:
    # Support both DeepFashion2 and DeepFashion2-master folder names.
    candidates = [project_root / "DeepFashion2", project_root / "DeepFashion2-master"]
    for c in candidates:
        if c.exists():
            return c
    return candidates[-1]


def process_split(source_root: Path, split_name: str, output_split_dir: Path) -> tuple[int, int, int]:
    image_dir = source_root / split_name / "image"
    anno_dir = source_root / split_name / "annos"

    if not image_dir.exists() or not anno_dir.exists():
        print(f"[WARN] Missing input folders for split '{split_name}':")
        print(f"       - {image_dir}")
        print(f"       - {anno_dir}")
        return 0, 0, 0

    output_split_dir.mkdir(parents=True, exist_ok=True)

    json_files = sorted(anno_dir.glob("*.json"))
    copied = 0
    skipped_missing_image = 0
    skipped_invalid_json = 0

    for anno_file in json_files:
        try:
            data = json.loads(anno_file.read_text(encoding="utf-8"))
        except Exception:
            skipped_invalid_json += 1
            continue

        classes_for_image = set()
        if isinstance(data, dict):
            for item in data.values():
                if isinstance(item, dict) and "category_id" in item:
                    category_id = item.get("category_id")
                    if isinstance(category_id, int):
                        classes_for_image.add(get_class(category_id))

        img_name = anno_file.with_suffix(".jpg").name
        src = image_dir / img_name

        if not src.exists():
            # Some datasets may store png; fallback to png for same basename.
            png_src = image_dir / anno_file.with_suffix(".png").name
            if png_src.exists():
                src = png_src
                img_name = png_src.name
            else:
                skipped_missing_image += 1
                continue

        # If no valid category_id found, place in casual class by default.
        if not classes_for_image:
            classes_for_image = {"casual"}

        for class_name in classes_for_image:
            class_dir = output_split_dir / class_name
            class_dir.mkdir(parents=True, exist_ok=True)
            dst = class_dir / img_name

            # Avoid duplicate copy work for re-runs.
            if not dst.exists():
                shutil.copy2(src, dst)
                copied += 1

    return len(json_files), copied, skipped_missing_image + skipped_invalid_json


def copy_dress_code_images(project_root: Path, output_train_dir: Path) -> int:
    dress_code_root = project_root / "dress-code-main"
    if not dress_code_root.exists():
        return 0

    category_map = {
        "dresses": "dress",
        "upper_body": "tshirt",
        "lower_body": "jacket",
    }

    copied = 0
    for source_category, target_category in category_map.items():
        matching_dirs = [p for p in dress_code_root.rglob(source_category) if p.is_dir()]
        for category_dir in matching_dirs:
            for image_path in category_dir.rglob("*"):
                if not image_path.is_file() or image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                    continue

                target_dir = output_train_dir / target_category
                target_dir.mkdir(parents=True, exist_ok=True)

                destination = target_dir / image_path.name
                if not destination.exists():
                    shutil.copy2(image_path, destination)
                    copied += 1

    return copied


def main() -> None:
    project_root = Path(__file__).resolve().parent
    source_root = pick_source_root(project_root)

    dataset_root = project_root / "dataset"
    train_out = dataset_root / "train"
    val_out = dataset_root / "val"
    train_out.mkdir(parents=True, exist_ok=True)
    val_out.mkdir(parents=True, exist_ok=True)

    print(f"Using DeepFashion2 root: {source_root}")

    train_seen, train_copied, train_skipped = process_split(source_root, "train", train_out)
    val_seen, val_copied, val_skipped = process_split(source_root, "validation", val_out)
    dress_code_copied = copy_dress_code_images(project_root, train_out)

    print("\nSummary")
    print(f"- train annos seen : {train_seen}")
    print(f"- train images copied : {train_copied}")
    print(f"- train skipped : {train_skipped}")
    print(f"- val annos seen : {val_seen}")
    print(f"- val images copied : {val_copied}")
    print(f"- val skipped : {val_skipped}")
    print(f"- dress code images copied : {dress_code_copied}")
    print(f"- output root : {dataset_root}")


if __name__ == "__main__":
    main()
