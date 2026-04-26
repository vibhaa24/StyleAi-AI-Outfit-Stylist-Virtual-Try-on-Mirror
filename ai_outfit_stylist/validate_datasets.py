from __future__ import annotations

from pathlib import Path
import json


def count_files(path: Path, patterns: list[str]) -> int:
    total = 0
    for pattern in patterns:
        total += sum(1 for _ in path.rglob(pattern))
    return total


def sample_category_ids(annos_dir: Path, max_files: int = 20) -> list[int]:
    ids: set[int] = set()
    if not annos_dir.exists():
        return []

    for idx, anno_file in enumerate(annos_dir.rglob("*.json")):
        if idx >= max_files:
            break
        try:
            data = json.loads(anno_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        if isinstance(data, dict):
            for v in data.values():
                if isinstance(v, dict) and "category_id" in v:
                    cid = v.get("category_id")
                    if isinstance(cid, int):
                        ids.add(cid)
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, dict):
                            cid = item.get("category_id")
                            if isinstance(cid, int):
                                ids.add(cid)

    return sorted(ids)


def print_section(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def validate_deepfashion2(root: Path) -> bool:
    df_root = root / "DeepFashion2-master"

    print_section("DeepFashion2 Check")
    print(f"Root: {df_root}")

    required = {
        "train/image": df_root / "train" / "image",
        "train/annos": df_root / "train" / "annos",
        "validation/image": df_root / "validation" / "image",
        "validation/annos": df_root / "validation" / "annos",
    }

    all_present = True
    for name, path in required.items():
        exists = path.exists()
        print(f"- {name:<18} -> {exists}")
        all_present = all_present and exists

    if all_present:
        train_images = count_files(required["train/image"], ["*.jpg", "*.jpeg", "*.png"])
        val_images = count_files(required["validation/image"], ["*.jpg", "*.jpeg", "*.png"])
        train_annos = count_files(required["train/annos"], ["*.json"])
        val_annos = count_files(required["validation/annos"], ["*.json"])

        print("\nCounts:")
        print(f"- train images      : {train_images}")
        print(f"- train annotations : {train_annos}")
        print(f"- val images        : {val_images}")
        print(f"- val annotations   : {val_annos}")

        cids = sample_category_ids(required["train/annos"])
        print(f"- sample category_id values (train annos): {cids if cids else 'None found'}")

        ready = all(
            [
                train_images > 0,
                val_images > 0,
                train_annos > 0,
                val_annos > 0,
            ]
        )
        print(f"- classification-ready: {ready}")
        return ready

    print("\nDeepFashion2 full data not detected yet.")
    return False


def validate_dress_code(root: Path) -> bool:
    dc_root = root / "dress-code-main"

    print_section("Dress Code Check")
    print(f"Root: {dc_root}")

    categories = ["dresses", "upper_body", "lower_body"]

    found_categories: list[Path] = []
    for cat in categories:
        matches = list(dc_root.rglob(cat))
        if matches:
            found_categories.extend([m for m in matches if m.is_dir()])

    found_category_names = sorted({p.name for p in found_categories})
    print(f"- category dirs found: {found_category_names if found_category_names else 'None'}")

    # Typical metadata files use names like pairs/list/train/val/test with txt/csv/json.
    metadata_patterns = [
        "*pair*.txt",
        "*pairs*.txt",
        "*list*.txt",
        "*train*.txt",
        "*val*.txt",
        "*test*.txt",
        "*pair*.json",
        "*pairs*.json",
        "*pair*.csv",
        "*pairs*.csv",
    ]

    metadata_files: list[Path] = []
    for pattern in metadata_patterns:
        metadata_files.extend(dc_root.rglob(pattern))

    metadata_files = sorted(set(metadata_files))
    print(f"- pair/list metadata files: {len(metadata_files)}")
    for p in metadata_files[:10]:
        print(f"  - {p.relative_to(root)}")

    # Count likely images inside detected category dirs.
    category_image_count = 0
    for cat_dir in found_categories:
        category_image_count += count_files(cat_dir, ["*.jpg", "*.jpeg", "*.png"]) 

    print(f"- category image count: {category_image_count}")

    ready = (
        {"dresses", "upper_body", "lower_body"}.issubset(set(found_category_names))
        and category_image_count > 0
        and len(metadata_files) > 0
    )
    print(f"- try-on-data-ready: {ready}")

    if not ready:
        print("\nDress Code full dataset payload not detected yet.")

    return ready


def main() -> None:
    project_root = Path(__file__).resolve().parent

    print("Dataset Validation Report")
    print(f"Project root: {project_root}")

    deepfashion_ready = validate_deepfashion2(project_root)
    dresscode_ready = validate_dress_code(project_root)

    print_section("Overall Status")
    print(f"- DeepFashion2 ready: {deepfashion_ready}")
    print(f"- Dress Code ready : {dresscode_ready}")
    print(f"- Training-ready   : {deepfashion_ready and dresscode_ready}")


if __name__ == "__main__":
    main()
