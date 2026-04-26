from __future__ import annotations

import random
import shutil
from pathlib import Path


def main() -> None:
    project_root = Path(__file__).resolve().parent
    train_dir = project_root / "dataset" / "train"
    val_dir = project_root / "dataset" / "val"

    val_dir.mkdir(parents=True, exist_ok=True)

    if not train_dir.exists():
        print(f"Train directory not found: {train_dir}")
        return

    random.seed(42)

    for category_dir in sorted(p for p in train_dir.iterdir() if p.is_dir()):
        target_dir = val_dir / category_dir.name
        target_dir.mkdir(parents=True, exist_ok=True)

        images = [p for p in category_dir.iterdir() if p.is_file()]
        if not images:
            print(f"[INFO] No images found in {category_dir}")
            continue

        random.shuffle(images)
        split_index = int(0.2 * len(images))
        moved = 0

        for image_path in images[:split_index]:
            destination = target_dir / image_path.name
            shutil.move(str(image_path), str(destination))
            moved += 1

        print(f"[OK] {category_dir.name}: moved {moved} of {len(images)} images to val")


if __name__ == "__main__":
    main()