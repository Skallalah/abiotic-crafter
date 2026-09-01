import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from colors import dominant_color  # noqa: E402


def write(tmp_path, pixels, size):
    image = Image.new("RGBA", size)
    image.putdata(pixels)
    path = tmp_path / "icon.png"
    image.save(path)
    return path


def test_ignores_the_black_outline_that_dominates_the_pixel_count(tmp_path):
    """Le pixel majoritaire d'une pastille est son contour, pas sa couleur."""
    pixels = [(0, 0, 0, 255)] * 700 + [(49, 119, 163, 255)] * 300
    assert dominant_color(write(tmp_path, pixels, (100, 10))) == "#3177a3"


def test_recomposes_a_dithered_hue(tmp_path):
    """Un PNG tramé éclate une teinte en voisines : on les moyenne."""
    pixels = ([(255, 166, 16, 255)] * 200 + [(173, 85, 0, 255)] * 200
              + [(0, 0, 0, 255)] * 600)
    assert dominant_color(write(tmp_path, pixels, (100, 10))) == "#d67e08"


def test_falls_back_to_grey_when_the_icon_has_no_colour(tmp_path):
    """Flathill est vraiment gris : pas de teinte à trouver."""
    pixels = [(170, 170, 170, 255)] * 800 + [(0, 0, 0, 255)] * 200
    assert dominant_color(write(tmp_path, pixels, (100, 10))) == "#aaaaaa"


def test_ignores_transparent_pixels(tmp_path):
    pixels = [(255, 255, 255, 0)] * 900 + [(49, 119, 163, 255)] * 100
    assert dominant_color(write(tmp_path, pixels, (100, 10))) == "#3177a3"


def test_returns_nothing_for_a_fully_transparent_image(tmp_path):
    assert dominant_color(write(tmp_path, [(0, 0, 0, 0)] * 100, (10, 10))) is None
