#!/usr/bin/env python3
"""Precompute the 星云图 layout.

Each major master is the centre of a cloud. Direct disciples pack around
that centre in a spiral, and a disciple who is a major master in their own
right becomes a neighbouring cloud rather than inflating this one. Clouds
do not overlap, and every person keeps enough room for their name, so
zooming in does not pile labels together.

Partner edges do not move anyone who already has a master or students.
People with no relations at all are left out. A partner-only pair is drawn
as its own small disk. Someone whose partner is already placed sits beside
that partner.
Output: data/layout-nebula.json as {id: [x, y, diameter]}.

Rendered hub diameter matches assets/app.js, then grows with descendants:
  base = clamp(12, 70, 10 + sqrt(degree) * 6)
  if descendants >= 8: base = max(base, min(128, 20 + sqrt(descendants) * 8.4))
"""
import json, math, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = json.load(open(os.path.join(ROOT, 'data/people.json'), encoding='utf-8'))
R = json.load(open(os.path.join(ROOT, 'data/relations.json'), encoding='utf-8'))
BY = {p['id']: p for p in P}

_deg = defaultdict(int)
for _r in R:
    if _r['from'] in BY:
        _deg[_r['from']] += 1
    if _r['to'] in BY:
        _deg[_r['to']] += 1
# Only true isolates (no relation of any type) are omitted.
P = [p for p in P if _deg[p['id']] > 0]
BY = {p['id']: p for p in P}
R = [r for r in R if r['from'] in BY and r['to'] in BY]

DEG = defaultdict(int)
for r in R:
    if r['type'] == 'partner':
        continue
    DEG[r['from']] += 1
    DEG[r['to']] += 1

def visual_diameter(pid, desc):
    base = max(12.0, min(70.0, 10 + (DEG[pid] or 1) ** 0.5 * 6))
    if desc >= 8:
        base = max(base, min(128.0, 20 + desc ** 0.5 * 8.4))
    return base

def label_clearance(pid):
    """Radius that must stay clear of neighbouring labels."""
    d = DEG[pid]
    font = 16 if d >= 15 else (10 if d < 6 else 12)
    chars = len(BY[pid]['name'])
    half_w = chars * font * 0.52 + 10
    half_h = visual_diameter(pid, DESC[pid]) / 2 + font + 8
    return math.hypot(half_w, half_h)

masters = defaultdict(list)
for r in R:
    if r['type'] == 'master_disciple':
        masters[r['to']].append(r)

pref = {}
for pid in BY:
    cands = [r for r in masters.get(pid, []) if r['from'] in BY and r['from'] != pid]
    if not cands:
        continue
    cands.sort(key=lambda r: (r.get('confidence') != 'documented', r['from']))
    pref[pid] = cands[0]['from']

WHITE, GRAY, BLACK = 0, 1, 2
color = {i: WHITE for i in BY}

def dfs(pid):
    color[pid] = GRAY
    par = pref.get(pid)
    if par and color.get(par) == GRAY:
        pref.pop(pid, None)
    elif par and color.get(par) == WHITE:
        dfs(par)
    color[pid] = BLACK

for pid in list(BY):
    if color[pid] == WHITE:
        dfs(pid)

children = {}
for pid, par in pref.items():
    children.setdefault(par, []).append(pid)

DESC = {}

def desc_count(pid, stack=None):
    if pid in DESC:
        return DESC[pid]
    stack = stack or set()
    if pid in stack:
        DESC[pid] = 0
        return 0
    stack.add(pid)
    n = 0
    for c in children.get(pid, ()):
        n += 1 + desc_count(c, stack)
    stack.discard(pid)
    DESC[pid] = n
    return n

for pid in BY:
    desc_count(pid)

for pid, ch in list(children.items()):
    ch.sort(key=lambda c: (
        next((r.get('detail') or '' for r in masters[c] if r['from'] == pid), ''),
        -(len(children.get(c) or ())),
        BY[c]['name'],
    ))

# A major master gets their own cloud. Everyone else stays in the nearest
# master's cloud so a 100-person ring does not push the whole tree apart.
def is_hub(pid):
    kids = len(children.get(pid, ()))
    return pid not in pref or kids >= 8 or DESC[pid] >= 28

GAP = 16
GOLDEN = math.pi * (3 - math.sqrt(5))

def pack(hub_r, items):
    """Place (id, radius) disks on the tightest ring that still clears the hub."""
    ordered = sorted(items, key=lambda it: (-it[1], BY[it[0]]['name']))
    placed = []
    pos = {}
    for cid, rad in ordered:
        min_d = hub_r + rad + GAP
        need = rad + GAP
        lo, hi = min_d, min_d
        # Expand until some angle on the ring is free, then binary-search inward.
        while not _ring_slot(hi, need, placed):
            hi = max(min_d + 8, hi * 1.25)
            if hi > min_d + 20000:
                break
        slot = None
        for _ in range(22):
            mid = (lo + hi) / 2
            ang = _ring_slot(mid, need, placed)
            if ang is None:
                lo = mid
            else:
                slot = (mid, ang)
                hi = mid
        if slot is None:
            ang = _ring_slot(hi, need, placed) or 0.0
            slot = (hi, ang)
        dist, ang = slot
        pos[cid] = (dist * math.cos(ang), dist * math.sin(ang))
        placed.append((pos[cid][0], pos[cid][1], rad))
    return pos

def _ring_slot(dist, need, placed):
    samples = 96 if len(placed) < 40 else 160
    for s in range(samples):
        ang = s * math.tau / samples + (len(placed) % 5) * 0.017
        x = dist * math.cos(ang)
        y = dist * math.sin(ang)
        if all((x - px) ** 2 + (y - py) ** 2 >= (need + pr) ** 2 for px, py, pr in placed):
            return ang
    return None

# Cluster membership: walk down from a hub and stop at the next hub.
HUBS = [pid for pid in BY if is_hub(pid)]
HUBSET = set(HUBS)
cluster_of = {}
members = defaultdict(list)       # hub -> [ids including hub]
satellites = defaultdict(list)    # hub -> [(sat_hub, attachment_id)]
for h in HUBS:
    members[h].append(h)
    cluster_of[h] = h
    stack = list(children.get(h, ()))
    while stack:
        cur = stack.pop()
        if cur in HUBSET:
            satellites[h].append((cur, pref[cur]))
            continue
        cluster_of[cur] = h
        members[h].append(cur)
        stack.extend(children.get(cur, ()))

# Local spiral inside one cloud. Child hubs are not members, so the cloud
# stays the size of the people who actually sit in it.
LOCAL = {}
RADIUS = {}

def build_local(hub):
    ids = set(members[hub])
    local_children = {}
    for pid in ids:
        local_children[pid] = [c for c in children.get(pid, ()) if c in ids]
    disk = {}

    def disk_of(pid):
        if pid in disk:
            return disk[pid]
        ch = local_children.get(pid, [])
        for c in ch:
            disk_of(c)
        hub_r = label_clearance(pid)
        if not ch:
            disk[pid] = hub_r
            return hub_r
        pos = pack(hub_r, [(c, disk[c]) for c in ch])
        disk[pid] = max(hub_r, max(math.hypot(x, y) + disk[c] for c, (x, y) in pos.items()))
        return disk[pid]

    disk_of(hub)
    rel = {hub: (0.0, 0.0)}

    def place_local(pid, cx, cy):
        ch = local_children.get(pid, [])
        if not ch:
            return
        pos = pack(label_clearance(pid), [(c, disk[c]) for c in ch])
        for c, (x, y) in pos.items():
            rel[c] = (cx + x, cy + y)
            place_local(c, cx + x, cy + y)

    place_local(hub, 0.0, 0.0)
    LOCAL[hub] = rel
    RADIUS[hub] = disk[hub]

for h in HUBS:
    build_local(h)

POS = {}
placed_disks = []  # x, y, r

def disk_free(x, y, r, pad=28):
    for px, py, pr in placed_disks:
        if math.hypot(x - px, y - py) < r + pr + pad:
            return False
    return True

def find_slot(ax, ay, ar, r, hint):
    """First free centre for a disk of radius r outside the disk at (ax, ay)."""
    step = max(12.0, min(36.0, r * 0.08))
    for k in range(5000):
        dist = (ar + r + 42) + k * step * 0.42
        ang = hint + k * GOLDEN
        x = ax + dist * math.cos(ang)
        y = ay + dist * math.sin(ang)
        if disk_free(x, y, r):
            return x, y
    return ax + ar + r + 80, ay

def commit_hub(hub, x, y):
    for pid, (lx, ly) in LOCAL[hub].items():
        POS[pid] = [x + lx, y + ly]
    placed_disks.append((x, y, RADIUS[hub]))
    # Satellites attached to a person in this cloud open outward along that
    # person's direction. Several satellites of the hub itself share the spiral.
    groups = defaultdict(list)
    for sat, att in satellites.get(hub, ()):
        groups[att].append(sat)
    for att, sats in groups.items():
        if att == hub or att not in POS:
            base = -math.pi / 2
        else:
            base = math.atan2(POS[att][1] - y, POS[att][0] - x)
        sats.sort(key=lambda s: (-RADIUS[s], BY[s]['name']))
        for i, sat in enumerate(sats):
            hint = base + (i - (len(sats) - 1) / 2) * 0.55
            sx, sy = find_slot(x, y, RADIUS[hub], RADIUS[sat], hint)
            commit_hub(sat, sx, sy)

roots = [pid for pid in HUBS if pid not in pref or pref[pid] not in cluster_of]
# A hub whose master sits in some cloud is placed as that cloud's satellite.
# Roots are hubs with no placed master.
sat_ids = {sat for lst in satellites.values() for sat, _att in lst}
root_hubs = [h for h in HUBS if h not in sat_ids]
# A person with no master and no students is not a cloud of their own.
# Park them beside a partner after the real clouds are placed.
_touch = set()
for _r in R:
    if _r['type'] == 'master_disciple':
        _touch.add(_r['from'])
        _touch.add(_r['to'])
_partners = defaultdict(list)
for _r in R:
    if _r['type'] == 'partner':
        _partners[_r['from']].append(_r['to'])
        _partners[_r['to']].append(_r['from'])
floaters = [pid for pid in BY if pid not in _touch and _partners.get(pid)]
floater_set = set(floaters)
root_hubs = [h for h in root_hubs if h not in floater_set]
root_hubs.sort(key=lambda h: -DESC[h])

def root_of_person(pid):
    seen = set()
    while pid in pref and pid not in seen:
        seen.add(pid)
        pid = pref[pid]
    return pid

kin_roots = defaultdict(set)
root_set = set(root_hubs)
for rel in R:
    if rel['type'] not in ('kin', 'marriage'):
        continue
    a, b = root_of_person(rel['from']), root_of_person(rel['to'])
    if a != b and a in root_set and b in root_set:
        kin_roots[a].add(b)
        kin_roots[b].add(a)

for i, h in enumerate(root_hubs):
    if i == 0:
        commit_hub(h, 0.0, 0.0)
        continue
    near = [d for d in placed_disks if any(POS.get(k) and abs(POS[k][0] - d[0]) < 1 and abs(POS[k][1] - d[1]) < 1 and k in kin_roots.get(h, ()) for k in root_set)]
    # Prefer a kin root's cloud as the anchor; otherwise the largest cloud.
    anchor = placed_disks[0]
    hint = 0.0
    for kh in kin_roots.get(h, ()):
        if kh in POS:
            anchor = (POS[kh][0], POS[kh][1], RADIUS.get(kh, 40))
            hint = math.atan2(anchor[1], anchor[0]) if (anchor[0] or anchor[1]) else 0.0
            break
    x, y = find_slot(anchor[0], anchor[1], anchor[2], RADIUS[h], hint)
    commit_hub(h, x, y)

def _park(pid, anchor):
    ax, ay = POS[anchor]
    need = label_clearance(pid) + label_clearance(anchor) + 8
    for radius in (need, need + 24, need + 56, need + 100, need + 160):
        for s in range(48):
            ang = s * math.tau / 48 + (sum(ord(c) for c in pid) % 7) * 0.2
            x = ax + radius * math.cos(ang)
            y = ay + radius * math.sin(ang)
            if all(math.hypot(x - px, y - py) >= label_clearance(pid) + label_clearance(other) + 6
                   for other, (px, py) in POS.items()):
                POS[pid] = [x, y]
                return
    POS[pid] = [ax + need, ay]

for pid in floaters:
    if pid in POS:
        continue
    anchor = next((q for q in _partners[pid] if q in POS), None)
    if anchor:
        _park(pid, anchor)
        continue
    # Partner-only pair: neither person is in a master tree. Drop the pair
    # in the first free slot beside the forest, then sit the partner next to them.
    rad = label_clearance(pid) + 24
    ax, ay, ar = placed_disks[0] if placed_disks else (0.0, 0.0, 0.0)
    x, y = find_slot(ax, ay, ar, rad, (sum(ord(c) for c in pid) % 9) * 0.4)
    POS[pid] = [x, y]
    placed_disks.append((x, y, rad))
    other = next((q for q in _partners[pid] if q not in POS), None)
    if other:
        _park(other, pid)

missed = [pid for pid in BY if pid not in POS]
if missed:
    ys = [p[1] for p in POS.values()] or [0]
    y0 = max(ys) + 240
    for i, pid in enumerate(sorted(missed)):
        POS[pid] = [i * 90.0, y0]

# Label circles of every person. Report genuine overlaps (not just disk padding).
ids = list(POS)
clear = {pid: label_clearance(pid) for pid in ids}
label_bad = 0
# Grid so this stays cheap.
cell = 80.0
grid = defaultdict(list)
for pid in ids:
    x, y = POS[pid]
    grid[(int(math.floor(x / cell)), int(math.floor(y / cell)))].append(pid)
for pid in ids:
    x, y = POS[pid]
    ix, iy = int(math.floor(x / cell)), int(math.floor(y / cell))
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            for other in grid.get((ix + dx, iy + dy), ()):
                if other <= pid:
                    continue
                ox, oy = POS[other]
                if math.hypot(x - ox, y - oy) + 0.4 < clear[pid] + clear[other]:
                    label_bad += 1

out = {
    pid: [round(xy[0], 1), round(xy[1], 1), round(visual_diameter(pid, DESC.get(pid, 0)), 1)]
    for pid, xy in POS.items()
}
dest = os.path.join(ROOT, 'data/layout-nebula.json')
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')

xs = [v[0] for v in out.values()]
ys = [v[1] for v in out.values()]
print('people', len(out), 'hubs', len(HUBS), 'roots', len(root_hubs), 'missed', len(missed),
      'label_overlaps', label_bad)
print('span x', round(max(xs) - min(xs)), 'y', round(max(ys) - min(ys)))

def report(name):
    pid = next(p['id'] for p in P if p['name'] == name)
    hub = cluster_of.get(pid, pid)
    kids = [c for c in children.get(pid, ()) if cluster_of.get(c) == hub]
    far = 0
    if kids:
        far = max(math.hypot(POS[c][0] - POS[pid][0], POS[c][1] - POS[pid][1]) for c in kids)
    print(f'{name} id={pid} hub={hub == pid} cluster={len(members.get(hub, []))} '
          f'sats={len(satellites.get(pid, ()))} local_kids={len(kids)} '
          f'farthest={far:.0f} radius={RADIUS.get(hub, 0):.0f} '
          f'hub_d={visual_diameter(pid, DESC[pid]):.0f}')

for n in ('郭德纲', '侯宝林', '马三立', '何九华', '计九霄'):
    report(n)
if 'p1807' in POS and 'p0903' in POS:
    print('何九华 dist', round(math.hypot(POS['p1807'][0] - POS['p0903'][0], POS['p1807'][1] - POS['p0903'][1])))
    print('计九霄 dist', round(math.hypot(POS['p1811'][0] - POS['p0903'][0], POS['p1811'][1] - POS['p0903'][1])))
