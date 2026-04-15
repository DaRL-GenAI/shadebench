"""
prepare_assets.py — fetch a sample city from ShadeBench and extract
demo frames into assets/ for the interactive web demo.

Usage:
    python prepare_assets.py                              # default: phoenix, tile row0_col0
    python prepare_assets.py --city tokyo
    python prepare_assets.py --city phoenix --tile row3_col5
    python prepare_assets.py --city phoenix --thumbs phoenix tokyo paris cairo

Key property: for the time-of-day slider, all hourly frames come from
the SAME tile (row_col), so scrubbing the slider shows the *same location*
as the sun moves across the sky. Satellite/mask/source/target modalities
are pulled from the same tile too, so the compare slider stays spatially
consistent.

Inside a ShadeBench city zip, filenames look like:
    <city>/target/newscreenshot_{HH}h_row{R}_col{C}.png      # shade at time HH
    <city>/source/newscreenshot_{HH}h_row{R}_col{C}.png      # shade at a paired time
    <city>/satellite/newscreenshot_{HH}h_row{R}_col{C}.png   # real-world RGB
    <city>/masked/maskedimage_row{R}_col{C}.png              # building footprint mask
    <city>/obj_grids/... (.obj etc.)

Requires:  pip install huggingface_hub pillow
"""
from __future__ import annotations

import argparse
import io
import re
import shutil
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
ASSETS = ROOT / "assets"
DEMO = ASSETS / "demo"
THUMBS = ASSETS / "cities"
REPO = "DARL-ASU/ShadeBench"
ALL_CITIES = [
    "abuja", "aswan", "auckland", "aversa", "beijing", "brasilia", "buenosaires", "cairo",
    "calgary", "capetown", "guadalajara", "jaipur", "johannesburg", "lagos", "madrid", "mexico",
    "mumbai", "nagoya", "nimes", "outback", "paris", "phoenix", "rome", "rotorua",
    "salta", "santiago", "saupaulo", "seville", "sydney", "tempe", "tokyo", "toronto",
    "valparaiso", "xian",
]

HOUR_RX = re.compile(r"_(\d+)h_(row\d+_col\d+)\.png$", re.I)
TILE_RX = re.compile(r"(row\d+_col\d+)", re.I)


def download_city_zip(city: str) -> Path:
    from huggingface_hub import hf_hub_download
    print(f"[dl] {city}.zip …")
    return Path(hf_hub_download(repo_id=REPO, filename=f"{city}.zip", repo_type="dataset"))


def _index_targets(zf: zipfile.ZipFile) -> dict[str, dict[int, str]]:
    """Returns {tile_id: {hour: member_name}} for every target image."""
    out: dict[str, dict[int, str]] = defaultdict(dict)
    for n in zf.namelist():
        if "/target/" not in n or not n.lower().endswith(".png"):
            continue
        m = HOUR_RX.search(n)
        if m:
            hour, tile = int(m.group(1)), m.group(2).lower()
            out[tile][hour] = n
    return out


def _find_tile_member(zf: zipfile.ZipFile, tile: str, *, contains: str | tuple[str, ...]) -> str | None:
    tile_l = tile.lower()
    markers = (contains,) if isinstance(contains, str) else contains
    for n in zf.namelist():
        n_l = n.lower()
        if any(m in n_l for m in markers) and tile_l in n_l and n_l.endswith((".png", ".jpg", ".jpeg")):
            return n
    return None


def _extract_resized(zf: zipfile.ZipFile, member: str, out_path: Path, size: int = 768):
    from PIL import Image
    with zf.open(member) as fh:
        img = Image.open(io.BytesIO(fh.read())).convert("RGB")
    img.thumbnail((size, size))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, quality=86, optimize=True)


def choose_tile(targets_by_tile: dict[str, dict[int, str]], preferred: str | None) -> str:
    if preferred and preferred in targets_by_tile:
        return preferred
    if preferred:
        print(f"  ! requested tile {preferred!r} not found — picking best-covered tile instead")
    # tile with most hours; tie-break: lowest row/col for determinism
    return max(
        targets_by_tile.keys(),
        key=lambda t: (len(targets_by_tile[t]), -sum(int(x) for x in re.findall(r"\d+", t))),
    )


def prepare_city(city: str, zip_path: Path, *, tile: str | None = None, timeline: bool = True) -> str:
    print(f"[ex] {city}")
    out_dir = DEMO / city
    out_dir.mkdir(parents=True, exist_ok=True)
    chosen_tile = ""

    with zipfile.ZipFile(zip_path) as zf:
        targets = _index_targets(zf)
        if not targets:
            print(f"    ! no target images found — skipping {city}")
            return ""

        chosen_tile = choose_tile(targets, tile)
        hours = sorted(targets[chosen_tile])
        print(f"    tile={chosen_tile}  hours={hours}")

        # 1) Time-of-day timeline: every available hour for this single tile.
        if timeline:
            for h, member in targets[chosen_tile].items():
                _extract_resized(zf, member, out_dir / f"shade_{h:02d}.jpg")
            # write a manifest the frontend can read to know which hours exist
            (out_dir / "hours.json").write_text(
                "[" + ",".join(f'"{h:02d}"' for h in hours) + "]"
            )
            print(f"    timeline  ← {len(hours)} frames ({hours[0]:02d}:00 → {hours[-1]:02d}:00)")

        # 2) Same-tile satellite / mask / source / target for the compare + modality grid.
        mid_hour = hours[len(hours) // 2]   # a noon-ish hour for single-image modalities
        tgt_member = targets[chosen_tile][mid_hour]
        _extract_resized(zf, tgt_member, out_dir / "target.jpg")

        src_member = _find_tile_member(zf, chosen_tile, contains="/source/")
        if src_member:
            _extract_resized(zf, src_member, out_dir / "source.jpg")

        sat_member = _find_tile_member(zf, chosen_tile, contains="/satellite/")
        if sat_member:
            _extract_resized(zf, sat_member, out_dir / "satellite.jpg")

        # some archives use /masked/, others use /mask/
        mask_member = _find_tile_member(zf, chosen_tile, contains=("/masked/", "/mask/"))
        if mask_member:
            _extract_resized(zf, mask_member, out_dir / "mask.jpg")

        # 3) Gallery thumbnail: prefer the satellite tile, fall back to target.
        thumb_src = out_dir / "satellite.jpg"
        if not thumb_src.exists():
            thumb_src = out_dir / "target.jpg"
        if thumb_src.exists():
            THUMBS.mkdir(parents=True, exist_ok=True)
            shutil.copy(thumb_src, THUMBS / f"{city}.jpg")

    return chosen_tile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="phoenix", help="city whose full timeline we extract")
    ap.add_argument("--tile", default=None, help="tile id like row0_col0 (auto-picked if omitted)")
    ap.add_argument("--thumbs", nargs="*", default=[],
                    help="extra cities to download just for gallery thumbnails")
    ap.add_argument(
        "--all-cities",
        action="store_true",
        help="download and prepare timeline + modalities + thumbnail for every city in app.js",
    )
    args = ap.parse_args()

    try:
        import huggingface_hub  # noqa: F401
        from PIL import Image    # noqa: F401
    except ImportError:
        print("install deps first:  pip install huggingface_hub pillow", file=sys.stderr)
        sys.exit(1)

    if args.all_cities:
        print(f"[all] preparing {len(ALL_CITIES)} cities")
        for city in ALL_CITIES:
            zp = download_city_zip(city)
            prepare_city(city, zp, timeline=True)
    else:
        zp = download_city_zip(args.city)
        prepare_city(args.city, zp, tile=args.tile, timeline=True)

        for extra in args.thumbs:
            if extra == args.city:
                continue
            zp2 = download_city_zip(extra)
            prepare_city(extra, zp2, timeline=False)

    print("[ok] open index.html")


if __name__ == "__main__":
    main()
