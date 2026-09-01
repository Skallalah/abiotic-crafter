"""Couleur dominante d'une image — fonction pure, couverte par les tests.

Sert à donner sa couleur à une zone, extraite de sa pastille ronde plutôt que
choisie à la main : le wiki en a déjà une par secteur et par monde-portail.
"""

from __future__ import annotations

import colorsys
from collections import Counter
from pathlib import Path

from PIL import Image

# 36 secteurs de 10° : assez fin pour séparer l'orange du jaune, assez large
# pour que le tramage d'un PNG indexé ne fasse pas éclater une teinte.
HUE_BINS = 36
MIN_SATURATION = 0.35
MIN_VALUE = 0.18
# en dessous, l'icône est considérée comme grise (Flathill l'est vraiment)
MIN_CHROMATIC_SHARE = 0.03
MIN_CHROMATIC_PIXELS = 40


def dominant_color(path: Path) -> str | None:
    """Couleur représentative d'une image, en `#rrggbb`.

    Prendre le pixel le plus fréquent ne marche pas : ces pastilles sont
    tramées, et leur pixel majoritaire est le noir du contour. On isole donc la
    teinte la plus présente parmi les pixels colorés, puis on moyenne ceux qui
    la portent — ce qui recompose la couleur que le tramage avait éclatée.
    """
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        raw = rgba.tobytes()

    opaque = [(raw[i], raw[i + 1], raw[i + 2])
              for i in range(0, len(raw), 4) if raw[i + 3] > 200]
    if not opaque:
        return None

    hsv = [(colorsys.rgb_to_hsv(r / 255, g / 255, b / 255), (r, g, b))
           for r, g, b in opaque]
    # pas de plafond sur la valeur : le blanc est écarté par sa saturation, et
    # un orange vif est légitimement à v = 1
    chromatic = [(h, rgb) for (h, s, v), rgb in hsv
                 if s >= MIN_SATURATION and v >= MIN_VALUE]

    enough = max(MIN_CHROMATIC_PIXELS, len(opaque) * MIN_CHROMATIC_SHARE)
    if len(chromatic) >= enough:
        histogram = Counter(int(h * HUE_BINS) % HUE_BINS for h, _ in chromatic)
        peak = histogram.most_common(1)[0][0]
        # le secteur dominant et ses deux voisins : le tramage déborde d'un cran
        keep = [rgb for h, rgb in chromatic
                if (int(h * HUE_BINS) - peak) % HUE_BINS in (0, 1, HUE_BINS - 1)]
    else:
        # icône sans couleur : on moyenne les tons moyens, en écartant le
        # contour noir et les reflets blancs qui tireraient la moyenne
        keep = [rgb for (_h, _s, v), rgb in hsv if 0.2 <= v <= 0.9]

    if not keep:
        keep = opaque
    return "#%02x%02x%02x" % tuple(
        round(sum(c[i] for c in keep) / len(keep)) for i in range(3)
    )
