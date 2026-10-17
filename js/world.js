'use strict';

/* ============================================================
   世界：地形生成、阻挡、寻路、视野
   ============================================================ */

class World {
  constructor(w, h, seed) {
    this.w = w;
    this.h = h;
    this.seed = seed >>> 0;
    this.tiles = new Uint8Array(w * h);
    this.blocked = new Uint8Array(w * h);
    this.vis = new Uint8Array(w * h);
    this.explored = new Uint8Array(w * h);
    this.blockers = new Array(w * h).fill(null);
    this.rng = Util.mulberry32(this.seed || 1);
    this.generateTerrain();
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  tileAt(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : TERRAIN.WATER; }
  setTile(x, y, t) { if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t; }

  isWalkable(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    const i = ty * this.w + tx;
    return TERRAIN_WALKABLE[this.tiles[i]] && !this.blocked[i];
  }

  /** 地形可走（不考虑建筑/树木） */
  isTerrainWalkable(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return TERRAIN_WALKABLE[this.tiles[ty * this.w + tx]];
  }

  walkablePoint(px, py) { return this.isWalkable(Math.floor(px), Math.floor(py)); }

  blockTile(tx, ty, ent) {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    this.blocked[i] = 1;
    this.blockers[i] = ent || true;
  }
  unblockTile(tx, ty) {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    this.blocked[i] = 0;
    this.blockers[i] = null;
  }

  stampDisc(cx, cy, r, fn) {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!this.inBounds(x, y)) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) fn(x, y);
      }
    }
  }

  /* ---------------- 地形生成（中心对称，保证公平） ---------------- */
  generateTerrain() {
    const w = this.w, h = this.h, rng = this.rng;
    const T = TERRAIN;

    for (let i = 0; i < w * h; i++) this.tiles[i] = T.GRASS;

    const mirror = (cx, cy) => [w - cx, h - cy];

    const paint = (cx, cy, r, tile, only) => {
      this.stampDisc(cx, cy, r, (x, y) => {
        if (only && !only.includes(this.tiles[y * w + x])) return;
        this.tiles[y * w + x] = tile;
      });
    };

    /* 泥土斑块 */
    for (let i = 0; i < 22; i++) {
      const cx = 6 + rng() * (w - 12), cy = 6 + rng() * (h - 12);
      const r = 2 + rng() * 4.5;
      paint(cx, cy, r, T.DIRT, [T.GRASS]);
      const m = mirror(cx, cy);
      paint(m[0], m[1], r, T.DIRT, [T.GRASS]);
    }

    /* 碎石点缀 */
    for (let i = 0; i < 110; i++) {
      const cx = 4 + (rng() * (w - 8)) | 0, cy = 4 + (rng() * (h - 8)) | 0;
      if (this.tileAt(cx, cy) === T.GRASS) this.setTile(cx, cy, T.ROCK);
      const m = mirror(cx, cy);
      if (this.tileAt(m[0], m[1]) === T.GRASS) this.setTile(m[0], m[1], T.ROCK);
    }

    /* 湖泊：避开基地与主对角通道 */
    const diagDist = (x, y) => Math.abs((y - x)) / Math.SQRT2;
    for (let i = 0; i < 4; i++) {
      const cx = 8 + rng() * (w - 16), cy = 8 + rng() * (h - 16);
      if (cx + cy > w) continue;
      if (diagDist(cx, cy) < 8) continue;
      if (Math.hypot(cx - 9, cy - 9) < 14 || Math.hypot(cx - (w - 9), cy - (h - 9)) < 14) continue;
      const r = 2.4 + rng() * 3.2;
      paint(cx, cy, r + 1.1, T.SAND, [T.GRASS, T.DIRT]);
      paint(cx, cy, r, T.WATER);
      const m = mirror(cx, cy);
      paint(m[0], m[1], r + 1.1, T.SAND, [T.GRASS, T.DIRT]);
      paint(m[0], m[1], r, T.WATER);
    }

    /* 基地空地 */
    const clear = (cx, cy, r) => {
      this.stampDisc(cx, cy, r, (x, y) => {
        const t = this.tiles[y * w + x];
        if (t === T.WATER || t === T.SAND) this.tiles[y * w + x] = T.DIRT;
      });
    };
    clear(9, 9, 8); clear(w - 9, h - 9, 8);
    clear(14, 8, 4); clear(w - 14, h - 8, 4);
    clear(40, 40, 4);
  }

  /* ---------------- 寻路 ---------------- */
  /**
   * 多目标 A*
   * @param {number} startX 起点（格，可为小数）
   * @param {number} startY
   * @param {Set<number>} goals 目标格索引集合
   * @returns {Array<{x:number,y:number}>|null}
   */
  findPath(startX, startY, goals, maxNodes) {
    const W = this.w, H = this.h;
    const sx = Math.floor(startX), sy = Math.floor(startY);
    if (!this.inBounds(sx, sy)) return null;
    if (!goals || goals.size === 0) return null;

    const startIdx = sy * W + sx;
    if (goals.has(startIdx)) return [];

    const goalList = [];
    for (const gi of goals) goalList.push([gi % W, Math.floor(gi / W)]);

    const N = W * H;
    const gScore = new Float32Array(N).fill(Infinity);
    const cameFrom = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);

    const heuristic = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < goalList.length; i++) {
        const dx = Math.abs(x - goalList[i][0]);
        const dy = Math.abs(y - goalList[i][1]);
        const d = dx < dy ? dx * 1.41421356 + (dy - dx) : dy * 1.41421356 + (dx - dy);
        if (d < best) best = d;
      }
      return best;
    };

    const open = new Util.MinHeap();
    gScore[startIdx] = 0;
    open.push(startIdx, heuristic(sx, sy));

    const limit = maxNodes || 9000;
    let expanded = 0, found = -1;

    while (open.size > 0) {
      const cur = open.pop();
      if (closed[cur]) continue;
      if (goals.has(cur)) { found = cur; break; }
      closed[cur] = 1;
      if (++expanded > limit) break;

      const cx = cur % W, cy = (cur - cx) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!this.isWalkable(nx, ny)) continue;
          if (dx !== 0 && dy !== 0) {
            if (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy)) continue;
          }
          const ni = ny * W + nx;
          if (closed[ni]) continue;
          const step = (dx !== 0 && dy !== 0) ? 1.41421356 : 1;
          const ng = gScore[cur] + step;
          if (ng < gScore[ni] - 1e-6) {
            gScore[ni] = ng;
            cameFrom[ni] = cur;
            open.push(ni, ng + heuristic(nx, ny));
          }
        }
      }
    }

    if (found < 0) return null;
    const path = [];
    let node = found;
    let guard = 0;
    while (node !== startIdx && node >= 0 && guard++ < 3000) {
      const x = node % W, y = (node - x) / W;
      path.push({ x, y });
      node = cameFrom[node];
    }
    path.reverse();
    return path;
  }

  /* 环形搜索最近的可行走格 */
  nearestWalkable(tx, ty, maxR) {
    if (this.isWalkable(tx, ty)) return { x: tx, y: ty };
    const R = maxR || 12;
    for (let r = 1; r <= R; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx, y = ty + dy;
          if (this.isWalkable(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  /* 洪泛连通性检查 */
  reachable(ax, ay, bx, by) {
    const W = this.w, H = this.h;
    if (!this.isWalkable(ax, ay) || !this.isWalkable(bx, by)) return false;
    const seen = new Uint8Array(W * H);
    const q = [ay * W + ax];
    seen[q[0]] = 1;
    const goal = by * W + bx;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur === goal) return true;
      const cx = cur % W, cy = (cur - cx) / W;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (!this.isWalkable(nx, ny)) continue;
        const ni = ny * W + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    return false;
  }

  /* 统计格点 */
  countWalkable() {
    let n = 0;
    for (let i = 0; i < this.blocked.length; i++) {
      if (TERRAIN_WALKABLE[this.tiles[i]] && !this.blocked[i]) n++;
    }
    return n;
  }
}

globalThis.World = World;
