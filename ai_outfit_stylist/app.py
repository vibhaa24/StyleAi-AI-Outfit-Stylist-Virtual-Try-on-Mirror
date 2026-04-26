from pathlib import Path
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import pandas as pd
import os
import json
from urllib.parse import urlparse
from urllib.request import urlopen, Request
from PIL import Image
import io
import zlib

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "fashion_dataset.csv"
DATASET_DIR = BASE_DIR / "dataset"
LENS_ID_FILE = BASE_DIR / "lens_id.txt"
LENS_CONFIG_FILE = BASE_DIR / "lens_config.json"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
DEFAULT_IMAGE = (
    "data:image/svg+xml;utf8,"
    "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='420' viewBox='0 0 640 420'>"
    "<rect width='640' height='420' fill='%23f2eee7'/>"
    "<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' "
    "fill='%23786b5c' font-family='Arial, sans-serif' font-size='24'>Outfit Preview</text>"
    "</svg>"
)

# Create uploads folder in project directory.
os.makedirs(BASE_DIR / "uploads", exist_ok=True)


def _load_lens_id():
    # Priority: env vars -> local file.
    for env_key in ["STYLEAI_LENS_ID", "SNAP_LENS_ID", "LENS_ID"]:
        env_val = os.getenv(env_key, "").strip()
        if env_val:
            return env_val

    if LENS_ID_FILE.exists():
        try:
            file_val = LENS_ID_FILE.read_text(encoding="utf-8").strip()
            if file_val:
                return file_val
        except Exception:
            pass

    return ""


def _load_lens_config():
    # Priority: env vars -> JSON config -> legacy text file.
    env_lens_id = ""
    for env_key in ["STYLEAI_LENS_ID", "SNAP_LENS_ID", "LENS_ID"]:
        env_val = os.getenv(env_key, "").strip()
        if env_val:
            env_lens_id = env_val
            break

    env_web_url = os.getenv("STYLEAI_LENS_WEB_URL", "").strip()
    if env_lens_id:
        return {
            "lens_id": env_lens_id,
            "web_url": env_web_url,
            "available_lenses": [
                {
                    "name": "Environment Lens",
                    "lens_id": env_lens_id,
                    "web_url": env_web_url,
                }
            ],
        }

    if LENS_CONFIG_FILE.exists():
        try:
            data = json.loads(LENS_CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                available = data.get("lenses", [])
                if not isinstance(available, list):
                    available = []

                active_idx = data.get("active_index", 0)
                try:
                    active_idx = int(active_idx)
                except Exception:
                    active_idx = 0

                active = {}
                if available:
                    active_idx = max(0, min(active_idx, len(available) - 1))
                    active = available[active_idx] or {}

                lens_id = str(active.get("lens_id", "")).strip()
                web_url = str(active.get("web_url", "")).strip()

                cleaned = []
                for item in available:
                    if not isinstance(item, dict):
                        continue
                    cleaned.append(
                        {
                            "name": str(item.get("name", "Lens")).strip() or "Lens",
                            "lens_id": str(item.get("lens_id", "")).strip(),
                            "web_url": str(item.get("web_url", "")).strip(),
                        }
                    )

                return {
                    "lens_id": lens_id,
                    "web_url": web_url,
                    "available_lenses": cleaned,
                }
        except Exception:
            pass

    # Backward compatibility for previous single ID setup.
    return {
        "lens_id": _load_lens_id(),
        "web_url": "",
        "available_lenses": [],
    }


def _normalize_lens_entry(entry):
    if not isinstance(entry, dict):
        return None

    lens_id = str(entry.get("lens_id") or entry.get("id") or "").strip()
    name = str(entry.get("name", "Lens")).strip() or "Lens"
    web_url = str(entry.get("web_url") or entry.get("web_preview_url") or "").strip()
    snapchat_url = str(entry.get("snapchat_url") or "").strip()

    if lens_id and not snapchat_url:
        snapchat_url = f"snapcamera://lens/{lens_id}"

    return {
        "id": lens_id,
        "name": name,
        "lens_id": lens_id,
        "web_preview_url": web_url,
        "web_url": web_url,
        "snapchat_url": snapchat_url,
        "enabled": bool(lens_id or web_url or snapchat_url),
    }


def _to_text(value):
    if pd.isna(value):
        return ""
    return str(value).strip()


def _to_style_bucket(row):
    blob = " ".join(
        [
            _to_text(row.get("description", "")),
            _to_text(row.get("p_attributes", "")),
            _to_text(row.get("name", "")),
        ]
    ).lower()

    if any(term in blob for term in ["wedding", "festive", "ethnic", "kurta", "dupatta"]):
        return "ethnic"
    if any(term in blob for term in ["office", "formal", "blazer", "shirt", "trouser"]):
        return "formal"
    if any(term in blob for term in ["party", "evening", "cocktail", "glam"]):
        return "party"
    return "casual"


def _row_to_outfit(row):
    price_raw = row.get("price", "")
    price_val = ""
    if pd.notna(price_raw):
        try:
            price_val = f"INR {int(float(price_raw)):,}"
        except Exception:
            price_val = _to_text(price_raw)

    color = _to_text(row.get("colour", "")) or "Mixed"
    brand = _to_text(row.get("brand", ""))
    style = _to_style_bucket(row)
    item_type = "Kurta Set" if "kurta" in _to_text(row.get("name", "")).lower() else "Outfit"

    tags = [style.title(), color]
    if brand:
        tags.append(brand)

    image = _to_text(row.get("img", "")) or DEFAULT_IMAGE

    return {
        "id": int(float(row.get("p_id", 0))) if pd.notna(row.get("p_id", None)) else 0,
        "name": _to_text(row.get("name", "Untitled Outfit")),
        "image": image,
        "tags": tags,
        "type": item_type,
        "color": color,
        "price": price_val or "Price unavailable",
        "style": style,
        "source": "main_catalog",
    }


def _safe_style_from_category(category):
    label = str(category or "").strip().lower()
    if any(token in label for token in ["kurta", "saree", "lehenga", "ethnic"]):
        return "ethnic"
    if any(token in label for token in ["shirt", "blazer", "coat", "jacket", "formal"]):
        return "formal"
    if any(token in label for token in ["party", "gown", "dress"]):
        return "party"
    return "casual"


def _nice_name_from_file(file_path):
    base = file_path.stem.replace("_", " ").replace("-", " ").strip()
    return base.title() if base else "Dataset Outfit"


def _load_folder_outfits():
    outfits = []
    seen_image_names = set()
    if not DATASET_DIR.exists():
        return outfits

    for split_dir in sorted(DATASET_DIR.iterdir()):
        if not split_dir.is_dir() or split_dir.name.startswith("."):
            continue

        split_name = split_dir.name
        for class_dir in sorted(split_dir.iterdir()):
            if not class_dir.is_dir() or class_dir.name.startswith("."):
                continue

            category = class_dir.name
            style = _safe_style_from_category(category)
            readable_category = category.replace("_", " ").replace("-", " ").title()

            for image_file in sorted(class_dir.iterdir()):
                if not image_file.is_file() or image_file.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue

                # train/val often contain the same filename; keep only the first one.
                image_name_key = image_file.name.strip().lower()
                if image_name_key in seen_image_names:
                    continue
                seen_image_names.add(image_name_key)

                rel_path = image_file.relative_to(DATASET_DIR).as_posix()
                unique_id = 1_000_000 + zlib.crc32(rel_path.encode("utf-8"))
                outfits.append(
                    {
                        "id": unique_id,
                        "name": _nice_name_from_file(image_file),
                        "image": f"/api/dataset-image/{rel_path}",
                        "tags": [style.title(), readable_category, f"{split_name.title()} Split"],
                        "type": readable_category or "Outfit",
                        "color": "Mixed",
                        "price": "Dataset sample",
                        "style": style,
                        "source": "dataset_folder",
                    }
                )

    return outfits


def _csv_outfits():
    return [_row_to_outfit(row) for _, row in df.iterrows()] if not df.empty else []


def _source_outfits(source):
    source_key = str(source or "all").strip().lower()
    # Accept legacy/UI aliases used by older frontend builds.
    if source_key in {"both", "all", "main_catalog+dataset_folder"}:
        source_key = "all"
    elif source_key in {"main_catalog", "csv"}:
        source_key = "csv"
    elif source_key in {"dataset_folder", "dataset"}:
        source_key = "dataset"

    csv_outfits = _csv_outfits()
    folder_outfits = _load_folder_outfits()

    if source_key == "csv":
        return csv_outfits
    if source_key == "dataset":
        return folder_outfits
    return csv_outfits + folder_outfits


def _load_dataset():
    try:
        data = pd.read_csv(DATASET_PATH)
        print(f"Loaded {len(data)} products from {DATASET_PATH}")
        return data
    except Exception as exc:
        print(f"Dataset load error: {exc}")
        return pd.DataFrame()


df = _load_dataset()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/outfits", methods=["GET"])
def api_outfits():
    try:
        style_filter = request.args.get("style", "all").strip().lower()
        source_filter = request.args.get("source", "all").strip().lower()
        limit_raw = request.args.get("limit", "60").strip()
        try:
            limit = max(1, min(int(limit_raw), 500))
        except ValueError:
            limit = 60

        raw_source = str(source_filter or "all").strip().lower()
        if raw_source in {"main_catalog", "csv"}:
            normalized_source = "main_catalog"
        elif raw_source in {"dataset_folder", "dataset"}:
            normalized_source = "dataset_folder"
        else:
            normalized_source = "both"

        outfits = _source_outfits(source_filter)
        if not outfits:
            return jsonify(
                {
                    "success": True,
                    "items": [],
                    "outfits": [],
                    "source": normalized_source,
                    "counts": {"main_catalog": 0, "dataset_folder": 0},
                }
            )

        if style_filter and style_filter != "all":
            outfits = [item for item in outfits if item.get("style") == style_filter]

        limited = outfits[:limit]
        counts = {
            "main_catalog": sum(1 for item in limited if item.get("source") == "main_catalog"),
            "dataset_folder": sum(1 for item in limited if item.get("source") == "dataset_folder"),
        }
        return jsonify(
            {
                "success": True,
                "items": limited,
                "outfits": limited,
                "source": normalized_source,
                "counts": counts,
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc), "items": [], "outfits": []}), 500


@app.route("/api/catalog", methods=["GET"])
def api_catalog():
    return api_outfits()


@app.route("/api/recommend", methods=["POST"])
def api_recommend():
    try:
        payload = request.get_json(silent=True) or {}
        style = str(payload.get("style", "casual")).strip().lower() or "casual"
        source_filter = str(payload.get("source", "all")).strip().lower() or "all"

        outfits = _source_outfits(source_filter)
        filtered = [item for item in outfits if item.get("style") == style]
        if not filtered:
            filtered = outfits

        tips_map = {
            "casual": ["Keep layers light", "Choose breathable fabrics", "Add one statement accessory"],
            "formal": ["Prefer clean silhouettes", "Use neutral base colors", "Focus on fit first"],
            "ethnic": ["Balance print and texture", "Coordinate dupatta tones", "Use handcrafted accents"],
            "party": ["Highlight one focal piece", "Mix shine with solids", "Use contrast thoughtfully"],
        }

        return jsonify(
            {
                "success": True,
                "message": f"Found {len(filtered[:12])} outfits for your {style} vibe.",
                "style_tips": tips_map.get(style, tips_map["casual"]),
                "outfits": filtered[:12],
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc), "outfits": []}), 500


@app.route("/api/lens-config", methods=["GET"])
def lens_config():
    lens_data = _load_lens_config()
    lens_id = lens_data.get("lens_id", "")
    web_url = lens_data.get("web_url", "")
    available_lenses = lens_data.get("available_lenses", [])
    lenses = [item for item in (_normalize_lens_entry(entry) for entry in available_lenses) if item]
    if not lenses and (lens_id or web_url):
        lenses = [
            {
                "id": lens_id,
                "name": "Active Lens",
                "lens_id": lens_id,
                "web_preview_url": web_url,
                "web_url": web_url,
                "snapchat_url": f"snapcamera://lens/{lens_id}" if lens_id else "",
                "enabled": bool(lens_id or web_url),
            }
        ]

    selected_lens_id = lens_data.get("selected_lens_id", "") or (lenses[0]["id"] if lenses else "")
    has_lens = bool(lens_id)

    return jsonify(
        {
            "success": True,
            "lens_id": lens_id,
            "selected_lens_id": selected_lens_id,
            "has_lens": has_lens,
            "web_url": web_url
            or (
                f"https://www.snapchat.com/unlock/?type=SNAPCODE&uuid={lens_id}"
                if has_lens
                else ""
            ),
            "snapcamera_url": f"snapcamera://lens/{lens_id}" if has_lens else "",
            "message": "Lens configured" if has_lens else "Lens ID not configured",
            "available_lenses": available_lenses,
            "lenses": lenses,
        }
    )


# Backward-compatible aliases.
@app.route("/catalog", methods=["GET"])
def catalog_alias():
    return api_outfits()


@app.route("/recommend", methods=["POST"])
def recommend_alias():
    return api_recommend()


@app.route("/lens-config", methods=["GET"])
def lens_config_alias():
    return lens_config()


@app.route("/api/image-proxy", methods=["GET"])
def image_proxy():
    image_url = (request.args.get("url") or "").strip()
    if not image_url:
        return jsonify({"success": False, "error": "Missing url parameter"}), 400

    parsed = urlparse(image_url)
    if parsed.scheme not in {"http", "https"}:
        return jsonify({"success": False, "error": "Only http/https URLs are allowed"}), 400

    try:
        req = Request(image_url, headers={"User-Agent": "StyleAI/1.0"})
        with urlopen(req, timeout=8) as upstream:
            data = upstream.read()
            content_type = upstream.headers.get_content_type() or "image/jpeg"

        return Response(data, mimetype=content_type, headers={"Cache-Control": "public, max-age=86400"})
    except Exception as exc:
        return jsonify({"success": False, "error": f"Proxy fetch failed: {exc}"}), 502


@app.route("/api/dataset-image/<path:relative_path>", methods=["GET"])
def dataset_image(relative_path):
    try:
        rel = Path(relative_path)
        if rel.is_absolute() or ".." in rel.parts:
            return jsonify({"success": False, "error": "Invalid image path"}), 400

        full_path = (DATASET_DIR / rel).resolve()
        dataset_root = DATASET_DIR.resolve()
        if not full_path.exists() or not full_path.is_file():
            return jsonify({"success": False, "error": "Image not found"}), 404

        if dataset_root != full_path and dataset_root not in full_path.parents:
            return jsonify({"success": False, "error": "Invalid image path"}), 400

        if full_path.suffix.lower() not in IMAGE_EXTENSIONS:
            return jsonify({"success": False, "error": "Unsupported image type"}), 400

        return send_from_directory(DATASET_DIR, rel.as_posix())
    except Exception as exc:
        return jsonify({"success": False, "error": f"Could not load image: {exc}"}), 500


def _analyze_skin_tone(image):
    """Analyze image to detect skin tone and return skin tone category with color suggestions."""
    try:
        # Resize for faster processing
        img = image.convert('RGB')
        img.thumbnail((200, 200))
        
        # Get pixel data
        pixels = list(img.getdata())
        
        if not pixels:
            return "neutral", "Default skin tone", ["Cream", "Beige", "Taupe"]
        
        # Calculate average color (skin tone approximation)
        avg_r = sum(p[0] for p in pixels) // len(pixels)
        avg_g = sum(p[1] for p in pixels) // len(pixels)
        avg_b = sum(p[2] for p in pixels) // len(pixels)
        
        # Determine skin tone category based on RGB values
        # This is a simplified analysis - actual skin tone detection is more complex
        red_intensity = avg_r
        green_intensity = avg_g
        blue_intensity = avg_b
        
        # Calculate undertone (warm vs cool)
        warm_score = red_intensity - blue_intensity
        
        # Categorize skin tone
        luminance = (0.299 * red_intensity + 0.587 * green_intensity + 0.114 * blue_intensity) / 255.0
        
        if luminance < 0.35:
            tone = "deep"
            colors = ["Gold", "Burgundy", "Emerald", "Coral Red"]
            message = "Your deep skin tone looks stunning in jewel tones and warm metallics!"
        elif luminance < 0.55:
            tone = "medium"
            colors = ["Terracotta", "Olive", "Rust", "Caramel"]
            message = "Medium tones suit warm earthiness and rich saturated colors beautifully!"
        elif luminance < 0.75:
            tone = "light"
            colors = ["Soft Peach", "Warm Beige", "Honey", "Pale Gold"]
            message = "Light skin tones shine with soft warm hues and pastels!"
        else:
            tone = "fair"
            colors = ["Cream", "Rose Gold", "Champagne", "Soft Pink"]
            message = "Fair skin tones are complemented by delicate and cool-toned pastels!"
        
        # Adjust for undertone
        if warm_score > 10:
            # Warm undertone - add warm color suggestions
            colors.extend(["Warm Brown", "Golden Yellow"])
        elif warm_score < -10:
            # Cool undertone - add cool color suggestions
            colors.extend(["Silver", "Cool Pink"])
        else:
            # Neutral - balanced suggestions
            colors.extend(["Navy", "Burgundy"])
        
        return tone, message, colors[:4]
        
    except Exception as e:
        return "neutral", "Unable to analyze - using default suggestions", ["Cream", "Beige", "Taupe", "Gold"]


@app.route("/api/analyze-photo", methods=["POST"])
def analyze_photo():
    """Analyze uploaded photo for skin tone and color suggestions."""
    try:
        if 'photo' not in request.files:
            return jsonify({"success": False, "error": "No photo uploaded"}), 400
        
        file = request.files['photo']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"}), 400
        
        # Check file type
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        if '.' not in file.filename or file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
            return jsonify({"success": False, "error": "Invalid image format"}), 400
        
        # Read and process image
        try:
            img = Image.open(io.BytesIO(file.read()))
        except Exception:
            return jsonify({"success": False, "error": "Could not read image file"}), 400
        
        # Analyze skin tone
        skin_tone, message, colors = _analyze_skin_tone(img)
        
        return jsonify({
            "success": True,
            "skin_tone": skin_tone,
            "message": message,
            "color_suggestions": colors
        })
        
    except Exception as exc:
        return jsonify({"success": False, "error": f"Photo analysis failed: {str(exc)}"}), 500


if __name__ == "__main__":
    try:
        app.run(debug=True, port=5000, use_reloader=False)
    except KeyboardInterrupt:
        pass