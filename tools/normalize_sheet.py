#!/usr/bin/env python3
"""
Normalize an AI-generated green-screen sprite sheet into clean, uniform cells.

AI sheets place the character inconsistently per cell (different size/position) and
sometimes draw white gridlines. This detects each character's bounding box, applies
ONE uniform scale across all frames (so real size ratios are preserved — no per-frame
stretching), and places each on a green-filled cell of a fixed size, FEET-ANCHORED
(feet x-centroid -> cell center, bbox bottom -> cell bottom) so the animation doesn't
jitter when a weapon/flash widens one frame.

Output is ready to drop into the game's sprite tool (green background -> chroma-keyed in-game).

Examples:
  # 8 poses -> 8 separate 1x1 single-cell sprites
  python3 tools/normalize_sheet.py in.png --cols 4 --rows 2 --mode cells --out ~/Downloads --name andromeda_pose

  # a 6-frame run -> one horizontal strip sheet
  python3 tools/normalize_sheet.py in.png --cols 6 --rows 1 --mode strip --out ~/Downloads --name vesper_run

  # auto-detect white gridlines instead of an equal split
  python3 tools/normalize_sheet.py in.png --auto-grid --mode strip --out ~/Downloads --name foo
"""
import argparse, os
from collections import deque
from PIL import Image


def is_green(r, g, b):
    return g > 90 and g > r * 1.25 and g > b * 1.25


def green_mask(im):
    """Boolean rows x cols mask: True where a pixel is the green background."""
    import numpy as np
    a = np.asarray(im).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (g > 90) & (g > r * 1.25) & (g > b * 1.25)


def find_components(im, rows, min_px):
    """Find each character as a connected non-green blob (full extent, NEVER clipped by a grid),
    then return their bboxes in reading order (top->bottom rows, left->right within a row).
    Robust for big/rotated poses that overflow an equal-split cell."""
    import numpy as np
    mask = ~green_mask(im)                 # True where character
    H, W = mask.shape
    seen = np.zeros((H, W), dtype=bool)
    comps = []
    for y in range(H):
        row = mask[y]
        for x in range(W):
            if row[x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True
                pts = []
                minx = maxx = x; miny = maxy = y
                while q:
                    cy, cx = q.popleft(); pts.append((cy, cx))
                    if cx < minx: minx = cx
                    if cx > maxx: maxx = cx
                    if cy < miny: miny = cy
                    if cy > maxy: maxy = cy
                    for dy in (-1, 0, 1):
                        ny = cy + dy
                        if ny < 0 or ny >= H: continue
                        for dx in (-1, 0, 1):
                            nx = cx + dx
                            if 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; q.append((ny, nx))
                if len(pts) >= min_px:
                    # per-component mask over its OWN bbox so a neighbour overlapping this bbox
                    # rectangle isn't copied in (that's the "phantom blob" bug)
                    m = np.zeros((maxy - miny + 1, maxx - minx + 1), dtype=bool)
                    for (cy, cx) in pts:
                        m[cy - miny, cx - minx] = True
                    comps.append((minx, miny, maxx, maxy, len(pts), m))
    # reading order: cluster by centroid-y into `rows` bands, sort each band by centroid-x
    comps.sort(key=lambda c: (c[1] + c[3]) / 2)
    rows = max(1, rows or 1)
    per = max(1, round(len(comps) / rows))
    out = []
    for r in range(rows):
        band = comps[r * per:(r + 1) * per] if r < rows - 1 else comps[r * per:]
        band.sort(key=lambda c: (c[0] + c[2]) / 2)
        out.extend(band)
    return out


def sample_green(px, W, H):
    # most-common-ish green from the four corners
    cands = [px[2, 2], px[W - 3, 2], px[2, H - 3], px[W - 3, H - 3]]
    greens = [c for c in cands if is_green(*c)]
    return greens[0] if greens else (11, 224, 26)


def white_bands(px, W, H, axis):
    # runs (start,end) where >50% of the perpendicular line is white — i.e. a gridline
    def is_white(r, g, b): return r > 200 and g > 200 and b > 200
    runs, inb, start = [], False, 0
    span = W if axis == 'col' else H
    other = H if axis == 'col' else W
    for i in range(span):
        if axis == 'col':
            frac = sum(1 for y in range(0, other, 3) if is_white(*px[i, y])) / (other / 3)
        else:
            frac = sum(1 for x in range(0, other, 3) if is_white(*px[x, i])) / (other / 3)
        hot = frac > 0.5
        if hot and not inb:
            start, inb = i, True
        if not hot and inb:
            runs.append((start, i - 1)); inb = False
    if inb:
        runs.append((start, span - 1))
    return runs


def cells_from_bands(bands, span):
    # interiors BETWEEN consecutive white bands (plus the edges)
    edges = [0]
    for (s, e) in bands:
        edges.append(s); edges.append(e + 1)
    edges.append(span)
    cells = []
    for i in range(0, len(edges) - 1, 2):
        a, b = edges[i], edges[i + 1]
        if b - a > span * 0.05:
            cells.append((a, b))
    return cells


def char_bbox(px, x0, y0, x1, y1, pad=2):
    minx, maxx, miny, maxy, cnt = 10**9, -1, 10**9, -1, 0
    for y in range(y0 + pad, y1 - pad):
        for x in range(x0 + pad, x1 - pad):
            if not is_green(*px[x, y]):
                cnt += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    return (minx, miny, maxx, maxy, cnt)


def foot_cx(px, minx, miny, maxx, maxy):
    band = max(8, int((maxy - miny) * 0.08))
    xs = [x for y in range(maxy - band, maxy + 1) for x in range(minx, maxx + 1) if not is_green(*px[x, y])]
    return (sum(xs) / len(xs)) if xs else (minx + maxx) / 2


def main():
    ap = argparse.ArgumentParser(description="Normalize a green-screen sprite sheet into uniform cells.")
    ap.add_argument('input')
    ap.add_argument('--cols', type=int, default=None, help='grid columns (equal split)')
    ap.add_argument('--rows', type=int, default=None, help='grid rows (equal split / row count for component ordering)')
    ap.add_argument('--auto-grid', action='store_true', help='detect white gridlines instead of an equal split')
    ap.add_argument('--detect', choices=['grid', 'components'], default='grid',
                    help='components = find each character as a blob (NEVER clips poses that overflow a cell); best for big/rotated/tumbling sheets')
    ap.add_argument('--cell', type=int, default=240, help='output cell size (square)')
    ap.add_argument('--margin', type=float, default=0.92, help='tallest char fills this fraction of cell height')
    ap.add_argument('--anchor', choices=['feet', 'center'], default='feet')
    ap.add_argument('--fit', choices=['height', 'safe'], default='height',
                    help="height = scale by tallest (consistent size); safe = also fit width so a long weapon/wide pose never clips the cell edge")
    ap.add_argument('--mode', choices=['strip', 'cells'], default='strip', help='one strip sheet, or one file per frame')
    ap.add_argument('--out', default='.')
    ap.add_argument('--name', default='sheet')
    ap.add_argument('--green', default=None, help='R,G,B override for fill/key color')
    ap.add_argument('--min-px', type=int, default=200, help='min non-green px for a cell to count as occupied')
    a = ap.parse_args()

    im = Image.open(a.input).convert('RGB'); W, H = im.size; px = im.load()
    GREEN = tuple(int(v) for v in a.green.split(',')) if a.green else sample_green(px, W, H)

    # --- collect each frame's character bbox (reading order) ---
    if a.detect == 'components':
        frames = find_components(im, a.rows or 1, a.min_px)   # blob per character — overflow-safe
    else:
        if a.auto_grid:
            cbands, rbands = white_bands(px, W, H, 'col'), white_bands(px, W, H, 'row')
            xcells, ycells = cells_from_bands(cbands, W), cells_from_bands(rbands, H)
        else:
            if not a.cols or not a.rows:
                ap.error('give --cols and --rows (or use --auto-grid / --detect components)')
            cw, ch = W / a.cols, H / a.rows
            xcells = [(int(c * cw), int((c + 1) * cw)) for c in range(a.cols)]
            ycells = [(int(r * ch), int((r + 1) * ch)) for r in range(a.rows)]
        frames = []
        for (y0, y1) in ycells:
            for (x0, x1) in xcells:
                bb = char_bbox(px, x0, y0, x1, y1)
                if bb[4] >= a.min_px:
                    frames.append(bb)
    if not frames:
        ap.error('no characters found — check the grid / green threshold')

    CELL = a.cell
    # pre-compute the foot x per frame (used for feet anchor + the clip-safe horizontal extent)
    fcx = {i: foot_cx(px, *bb[:4]) for i, bb in enumerate(frames)}
    maxh = max(b[3] - b[1] for b in frames)
    SCALE = (CELL * a.margin) / maxh
    if a.fit == 'safe':
        # also bound by the worst horizontal half-extent so nothing reaches past the cell edge
        if a.anchor == 'feet':
            half = max(max(fcx[i] - b[0], b[2] - fcx[i]) for i, b in enumerate(frames))
        else:
            half = max((b[2] - b[0]) / 2 for b in frames)
        SCALE = min(SCALE, (CELL * a.margin / 2) / half)

    def render_cell(i, bb):
        minx, miny, maxx, maxy = bb[0], bb[1], bb[2], bb[3]
        crop = im.crop((minx, miny, maxx + 1, maxy + 1)).convert('RGB')
        mask = bb[5] if len(bb) > 5 else None
        if mask is not None:   # keep ONLY this character's blob; wipe any overlapping neighbour to green
            import numpy as np
            arr = np.asarray(crop).copy(); arr[~mask] = GREEN
            crop = Image.fromarray(arr.astype('uint8'))
        nw, nh = max(1, round(crop.width * SCALE)), max(1, round(crop.height * SCALE))
        crop = crop.resize((nw, nh), Image.LANCZOS)
        cell = Image.new('RGB', (CELL, CELL), GREEN)
        if a.anchor == 'feet':
            ox = round(CELL / 2 - (fcx[i] - minx) * SCALE)
        else:
            ox = (CELL - nw) // 2
        oy = CELL - nh - 3
        cell.paste(crop, (ox, oy))
        return cell

    os.makedirs(a.out, exist_ok=True)
    if a.mode == 'cells':
        for i, bb in enumerate(frames):
            p = os.path.join(a.out, f'{a.name}_{i + 1}.png')
            render_cell(i, bb).save(p)
        print(f'wrote {len(frames)} single-cell sprites -> {a.out}/{a.name}_1..{len(frames)}.png '
              f'({CELL}x{CELL}, uniform scale {SCALE:.3f}, anchor={a.anchor}, green={GREEN})')
    else:
        sheet = Image.new('RGB', (CELL * len(frames), CELL), GREEN)
        for i, bb in enumerate(frames):
            sheet.paste(render_cell(i, bb), (i * CELL, 0))
        p = os.path.join(a.out, f'{a.name}.png')
        sheet.save(p)
        print(f'wrote strip -> {p}  ({sheet.size[0]}x{sheet.size[1]} | cols={len(frames)} rows=1 '
              f'cw=ch={CELL} frames={len(frames)} | uniform scale {SCALE:.3f}, anchor={a.anchor}, green={GREEN})')


if __name__ == '__main__':
    main()
