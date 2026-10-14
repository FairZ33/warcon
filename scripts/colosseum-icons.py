"""Generate fork icons; requires Pillow. Upstream branding assets stay in branding/."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "static"
for filename, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    # Draw at 4x and downsample for clean edges.
    scale = size * 4 / 64
    image = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    points = lambda coords: [(round(x * scale), round(y * scale)) for x, y in coords]
    draw.polygon(points([(0, 0), (48, 0), (64, 16), (64, 64), (16, 64), (0, 48)]), fill="#F4D447")
    for coords in [[(10,52),(10,22),(32,12),(54,22),(54,52),(10,52)], [(10,27),(54,27)], [(22,27),(22,52)], [(42,27),(42,52)], [(28,52),(28,39),(28,35),(36,35),(36,39),(36,52)]]:
        draw.line(points(coords), fill="#080C09", width=round(5 * scale), joint="curve")
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / filename)
