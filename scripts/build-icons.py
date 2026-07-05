from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
SOURCE = ICONS / "uncle-sam-source.jpg"


def cover_crop(image, box, size):
    crop = image.crop(box)
    return ImageOps.fit(crop, (size, size), method=Image.Resampling.LANCZOS)


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    return mask


def add_plate(image, size, radius):
    plate = Image.new("RGBA", (size, size), "#f6f0e8")
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    inset = max(10, size // 32)
    shadow_draw.rounded_rectangle(
        (inset, inset + size // 64, size - inset, size - inset + size // 64),
        radius=radius,
        fill=(29, 37, 37, 48),
    )
    plate.alpha_composite(shadow)
    image.putalpha(rounded_mask(size, radius))
    plate.alpha_composite(image)
    return plate


def main():
    source = Image.open(SOURCE).convert("RGB")
    width, height = source.size

    # Crop to Uncle Sam's face, hat, bow tie, and pointing hand.
    box = (
        int(width * 0.16),
        int(height * 0.00),
        int(width * 0.87),
        int(height * 0.71),
    )

    for size in (192, 512):
        icon = cover_crop(source, box, size)
        add_plate(icon.convert("RGBA"), size, max(28, size // 5)).save(ICONS / f"icon-{size}.png")

        maskable_size = size
        maskable = Image.new("RGBA", (maskable_size, maskable_size), "#174447")
        inner = cover_crop(source, box, int(size * 0.76)).convert("RGBA")
        inner = add_plate(inner, inner.width, max(24, inner.width // 5))
        offset = (size - inner.width) // 2
        maskable.alpha_composite(inner, (offset, offset))
        maskable.save(ICONS / f"icon-maskable-{size}.png")


if __name__ == "__main__":
    main()
