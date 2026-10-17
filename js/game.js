'use strict';

/* ============================================================
   游戏主逻辑：状态、命令、战斗、经济、视野
   ============================================================ */

class Game {
  constructor(seed) {
    this.seed = seed || ((Math.random() * 1e9) | 0);
    this.world = new World(CONFIG.MAP_W, CONFIG.MAP_H, this.seed);

    this.units = [];
    this.buildings = [];
    this.resources = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.selection = [];

    this.res = {
      player: { gold: CONFIG.START_GOLD, lumber: CONFIG.START_LUMBER },
      enemy: { gold: CONFIG.START_GOLD, lumber: CONFIG.START_LUMBER },
    };

    this.time = 0;
    this.fogTimer = 0;
    this.fogVersion = 0;
    this.started = false;
    this.paused = false;
    this.over = null;
    this.messages = [];
    this.selectionChanged = true;

    this.playerBase = { x: 9, y: 9 };
    this.enemyBase = { x: 71, y: 71 };

    this.setup();
    this.ai = new AIPlayer(this, 'enemy');
    this.updateFog(true);
  }

  /* ================= 初始化 ================= */
  setup() {
    /* 主基地 */
    this.createBuilding('player', 'townhall', 7, 7, true);
    this.createBuilding('enemy', 'townhall', 69, 69, true);

    /* 资源 */
    this.placeResources();

    /* 起始单位 */
    for (let i = 0; i < CONFIG.START_WORKERS; i++) {
      const p = this.findSpawnNear(9.5, 10.6, 6) || { x: 9.5, y: 10.6 };
      this.spawnUnit('worker', 'player', p.x, p.y);
    }
    for (let i = 0; i < 2; i++) {
      const p = this.findSpawnNear(11.5, 12.8, 6) || { x: 11.5, y: 12.8 };
      this.spawnUnit('footman', 'player', p.x, p.y);
    }
    for (let i = 0; i < 5; i++) {
      const p = this.findSpawnNear(70.5, 68.4, 6) || { x: 70.5, y: 68.4 };
      this.spawnUnit('worker', 'enemy', p.x, p.y);
    }
    for (let i = 0; i < 2; i++) {
      const p = this.findSpawnNear(70.5, 67.2, 6) || { x: 70.5, y: 67.2 };
      this.spawnUnit('footman', 'enemy', p.x, p.y);
    }

    /* 连通性保障：主基地之间必须有路 */
    this.ensureConnectivity();

    /* 初始选择 */
    const workers = this.units.filter(u => u.team === 'player' && u.type === 'worker');
    this.setSelection(workers);
  }

  createBuilding(team, type, tx, ty, complete) {
    const b = new Building(this, type, team, tx, ty, complete);
    this.buildings.push(b);
    return b;
  }

  spawnResource(type, tx, ty) {
    const def = RESOURCE_DEF[type];
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        if (!this.world.inBounds(x, y)) return null;
        if (!TERRAIN_WALKABLE[this.world.tileAt(x, y)]) return null;
        if (this.world.blocked[this.world.idx(x, y)]) return null;
      }
    }
    const node = new ResourceNode(this, type, tx, ty);
    this.resources.push(node);
    return node;
  }

  placeResources() {
    const w = this.world, rng = w.rng;

    /* 金矿（中心对称） */
    const mines = [[13, 7], [39, 39], [22, 16], [16, 58]];
    for (const [mx, my] of mines) {
      this.spawnResource('gold', mx, my);
      this.spawnResource('gold', w.w - 1 - (mx + 2), w.h - 1 - (my + 2));
    }

    /* 树丛 */
    const safeZones = [[9, 9], [71, 71], [14, 8], [66, 72], [40, 40], [24, 18], [18, 60], [56, 62], [62, 20]];
    const half = (w.w + w.h) / 2;
    let placed = 0, tries = 0;

    while (placed < 26 && tries < 1200) {
      tries++;
      const cx = 5 + Math.floor(rng() * (w.w - 10));
      const cy = 5 + Math.floor(rng() * (w.h - 10));
      if (cx + cy > w.w - 4) continue;         // 只生成半张图，再镜像

      let tooClose = false;
      for (const [zx, zy] of safeZones) {
        if (Math.hypot(cx - zx, cy - zy) < 7) { tooClose = true; break; }
      }
      if (tooClose) continue;

      const r = 1.5 + rng() * 1.4;
      const density = 0.40 + rng() * 0.28;
      const tiles = [];
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
          if (!w.inBounds(x, y)) continue;
          if (rng() > density) continue;
          const t = w.tileAt(x, y);
          if (t === TERRAIN.WATER || t === TERRAIN.SAND) continue;
          if (w.blocked[w.idx(x, y)]) continue;
          tiles.push([x, y]);
        }
      }
      if (tiles.length < 3) continue;

      for (const [tx, ty] of tiles) {
        this.spawnResource('tree', tx, ty);
        this.spawnResource('tree', w.w - 1 - tx, w.h - 1 - ty);
      }
      placed++;
    }
  }

  /** 若主路被挡，沿两基地连线开辟通道 */
  ensureConnectivity() {
    const w = this.world;
    const ax = 9, ay = 9, bx = 71, by = 71;
    for (let attempt = 0; attempt < 12; attempt++) {
      if (w.reachable(ax, ay, bx, by)) return true;

      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const tx = Math.round(px) + dx, ty = Math.round(py) + dy;
            if (!w.inBounds(tx, ty)) continue;
            const idx = w.idx(tx, ty);
            const blocker = w.blockers[idx];
            if (blocker && blocker !== true && blocker.kind === 'resource' && blocker.type === 'tree') {
              this.depleteResource(blocker, true);
            }
            if (!TERRAIN_WALKABLE[w.tiles[idx]]) w.tiles[idx] = TERRAIN.DIRT;
          }
        }
      }
    }
    return w.reachable(ax, ay, bx, by);
  }

  /* ================= 查询 ================= */
  idx(x, y) { return this.world.idx(x, y); }

  isVisible(x, y) {
    if (!CONFIG.FOG) return true;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!this.world.inBounds(tx, ty)) return false;
    return this.world.vis[ty * this.world.w + tx] === 1;
  }

  isExplored(x, y) {
    if (!CONFIG.FOG) return true;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!this.world.inBounds(tx, ty)) return false;
    return this.world.explored[ty * this.world.w + tx] === 1;
  }

  entityVisible(e) {
    if (e.team === 'player') return true;
    if (e.kind === 'resource') return this.isExplored(e.x, e.y);
    return this.isVisible(e.x, e.y);
  }

  canSee(team, e) {
    if (team !== 'player') return true;
    return this.isVisible(e.x, e.y);
  }

  /** 点到实体边缘的距离（格） */
  edgeDistance(x, y, e) {
    if (e.w && e.h) {
      const dx = Math.max(e.left - x, 0, x - (e.left + e.w));
      const dy = Math.max(e.top - y, 0, y - (e.top + e.h));
      return Math.hypot(dx, dy);
    }
    const r = e.radius || 0.3;
    return Math.max(0, Math.hypot(e.x - x, e.y - y) - r);
  }

  pickEntity(wx, wy) {
    /* 单位优先 */
    let best = null, bestScore = Infinity;
    for (const u of this.units) {
      if (u.dead || !this.entityVisible(u)) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      const hit = Math.max(0.42, u.radius + 0.2);
      if (d <= hit && d < bestScore) { best = u; bestScore = d; }
    }
    if (best) return best;

    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.dead || !this.entityVisible(b)) continue;
      if (wx >= b.left - 0.1 && wx <= b.left + b.w + 0.1 &&
          wy >= b.top - 0.1 && wy <= b.top + b.h + 0.1) return b;
    }
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const r = this.resources[i];
      if (r.dead || !this.entityVisible(r)) continue;
      if (wx >= r.left - 0.1 && wx <= r.left + r.w + 0.1 &&
          wy >= r.top - 0.1 && wy <= r.top + r.h + 0.1) return r;
    }
    return null;
  }

  /* ================= 选择 ================= */
  setSelection(arr) {
    for (const e of this.selection) e.selected = false;
    this.selection = [];
    for (const e of arr) {
      if (!e || e.dead) continue;
      if (this.selection.indexOf(e) >= 0) continue;
      e.selected = true;
      this.selection.push(e);
    }
    this.selectionChanged = true;
  }

  addToSelection(arr) {
    const cur = this.selection.slice();
    for (const e of arr) {
      if (!e || e.dead || cur.indexOf(e) >= 0) continue;
      e.selected = true;
      cur.push(e);
    }
    this.selection = cur;
    this.selectionChanged = true;
  }

  clearSelection() {
    this.setSelection([]);
  }

  removeFromSelection(e) {
    const i = this.selection.indexOf(e);
    if (i >= 0) {
      this.selection.splice(i, 1);
      e.selected = false;
      this.selectionChanged = true;
    }
  }

  /* ================= 人口 / 资源 ================= */
  popCap(team) {
    let cap = 0;
    for (const b of this.buildings) {
      if (b.team === team && b.complete) cap += b.def.food || 0;
    }
    return Math.min(cap, CONFIG.POP_HARD_CAP);
  }

  popUsed(team) {
    let used = 0;
    for (const u of this.units) if (u.team === team) used += u.def.food;
    for (const b of this.buildings) {
      if (b.team !== team) continue;
      for (const q of b.queue) used += UNIT_TYPES[q.type].food;
    }
    return used;
  }

  canAfford(team, cost) {
    if (!cost) return true;
    const r = this.res[team];
    return r.gold >= (cost.gold || 0) && r.lumber >= (cost.lumber || 0);
  }

  pay(team, cost) {
    const r = this.res[team];
    r.gold -= cost.gold || 0;
    r.lumber -= cost.lumber || 0;
  }

  /* ================= 命令 ================= */
  commandMove(units, wx, wy) {
    if (!units.length) return;
    const pts = this.formationPoints(units.length, wx, wy);
    units.forEach((u, i) => {
      const p = pts[i] || { x: wx, y: wy };
      const tile = this.world.nearestWalkable(Math.floor(p.x), Math.floor(p.y), 8);
      if (tile) u.moveTo(tile.x, tile.y);
    });
  }

  commandAttackMove(units, wx, wy) {
    if (!units.length) return;
    const pts = this.formationPoints(units.length, wx, wy);
    units.forEach((u, i) => {
      const p = pts[i] || { x: wx, y: wy };
      const tile = this.world.nearestWalkable(Math.floor(p.x), Math.floor(p.y), 8);
      if (tile) u.attackMoveTo(tile.x, tile.y);
    });
    this.addParticles(wx, wy, '#e6c072', 8, 0.9);
  }

  commandStop(units) {
    units.forEach(u => u.stop());
  }

  commandAttack(units, target) {
    units.forEach(u => {
      if (u.team !== 'player' && u.team !== 'enemy') return;
      u.attackOrder(target);
    });
  }

  commandGather(units, res) {
    let any = false;
    for (const u of units) {
      if (u.isWorker) { u.gatherFrom(res); any = true; }
      else {
        const tile = this.world.nearestWalkable(Math.floor(res.x), Math.floor(res.y) + 2, 6);
        if (tile) u.moveTo(tile.x, tile.y);
      }
    }
    if (!any && units.length) {
      this.commandMove(units, res.x, res.y + res.h / 2 + 1.5);
    }
  }

  contextCommand(wx, wy) {
    const sel = this.selection;
    const units = sel.filter(e => e.kind === 'unit' && e.team === 'player');
    const ownBuildings = sel.filter(e => e.kind === 'building' && e.team === 'player');

    if (!units.length && ownBuildings.length === 1) {
      this.setRally(ownBuildings[0], wx, wy);
      return;
    }
    if (!units.length) return;

    const target = this.pickEntity(wx, wy);
    if (target) {
      if (target.kind === 'resource') { this.commandGather(units, target); return; }
      if (target.team === 'enemy' && this.isVisible(target.x, target.y)) {
        this.commandAttack(units, target);
        this.addParticles(target.x, target.y, '#e05a4a', 6, 0.8);
        return;
      }
      if (target.kind === 'building' && target.team === 'player' && !target.complete) {
        const workers = units.filter(u => u.isWorker);
        if (workers.length) {
          workers.forEach(w => w.buildAt(target));
          return;
        }
      }
    }
    this.commandMove(units, wx, wy);
  }

  setRally(b, wx, wy) {
    const target = this.pickEntity(wx, wy);
    b.rally = { x: wx, y: wy, resource: target && target.kind === 'resource' ? target : null };
    this.addParticles(wx, wy, '#7bd18b', 8, 0.8);
    if (b.team === 'player') this.emit('已设置集结点', 'good');
  }

  formationPoints(n, x, y) {
    const pts = [];
    const spacing = 0.8;
    pts.push({ x, y });
    let ring = 1;
    while (pts.length < n) {
      const count = Math.min(10, 6 * ring);
      const rad = ring * spacing * 1.35;
      for (let i = 0; i < count && pts.length < n; i++) {
        const a = (i / count) * Math.PI * 2 + ring * 0.5;
        pts.push({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad * 0.85 });
      }
      ring++;
      if (ring > 8) break;
    }
    return pts;
  }

  /* ================= 寻路辅助 ================= */
  pathGoalsFor(entity) {
    const w = this.world;
    const goals = new Set();
    if (entity.kind === 'unit') {
      const tx = Math.floor(entity.x), ty = Math.floor(entity.y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (w.isWalkable(tx + dx, ty + dy)) goals.add((ty + dy) * w.w + (tx + dx));
        }
      }
    } else {
      const L = entity.left, T = entity.top;
      const R = entity.left + entity.w - 1, B = entity.top + entity.h - 1;
      const add = (x, y) => { if (w.isWalkable(x, y)) goals.add(y * w.w + x); };
      for (let x = L - 1; x <= R + 1; x++) { add(x, T - 1); add(x, B + 1); }
      for (let y = T; y <= B; y++) { add(L - 1, y); add(R + 1, y); }
    }
    return goals;
  }

  pathUnitTo(u, entity) {
    const goals = this.pathGoalsFor(entity);
    if (!goals.size) { u.path = []; u.pathIndex = 0; return false; }
    const p = this.world.findPath(u.x, u.y, goals, 7000);
    u.path = p || [];
    u.pathIndex = 0;
    return !!p;
  }

  pathToPoint(u, tx, ty) {
    const goal = this.world.nearestWalkable(tx, ty, 10);
    if (!goal) { u.path = []; u.pathIndex = 0; return false; }
    const p = this.world.findPath(u.x, u.y, new Set([goal.y * this.world.w + goal.x]), 6000);
    u.path = p || [];
    u.pathIndex = 0;
    return !!p;
  }

  /* ================= 战斗 ================= */
  findEnemyNear(unit, radius) {
    const foe = unit.team === 'player' ? 'enemy' : 'player';
    let best = null, bestD = radius * radius;
    for (const e of this.units) {
      if (e.team !== foe || e.dead) continue;
      if (!this.canSee(unit.team, e)) continue;
      const d = Util.dist2(unit.x, unit.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const b of this.buildings) {
      if (b.team !== foe || b.dead) continue;
      if (!this.canSee(unit.team, b)) continue;
      const d = Util.dist2(unit.x, unit.y, b.x, b.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  findEnemyNearPoint(x, y, radius, team) {
    const foe = team === 'player' ? 'enemy' : 'player';
    let best = null, bestD = radius * radius;
    for (const e of this.units) {
      if (e.team !== foe || e.dead) continue;
      const d = Util.dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const b of this.buildings) {
      if (b.team !== foe || b.dead) continue;
      const d = Util.dist2(x, y, b.x, b.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  alertDefenders(unit, attacker, radius) {
    if (!attacker || attacker.dead) return;
    for (const u of this.units) {
      if (u === unit || u.dead || u.team !== unit.team) continue;
      if (u.isWorker) continue;
      if (u.order.type !== 'idle') continue;
      if (Util.dist(u.x, u.y, unit.x, unit.y) > radius) continue;
      if (!this.canSee(u.team, attacker)) continue;
      u.attackOrder(attacker);
    }
  }

  performAttack(attacker, target) {
    const isBuilding = attacker.kind === 'building';
    const ad = isBuilding ? attacker.def.attack : attacker.def;
    if (!ad) return;
    const dmg = ad.dmg;
    const proj = isBuilding ? ad.projectile : attacker.def.projectile;

    if (proj) {
      const speed = (isBuilding ? ad.projSpeed : attacker.def.projSpeed) || 15;
      this.projectiles.push(new Projectile(this, attacker.x, attacker.y, target, proj, speed, dmg, attacker.team));
    } else {
      this.dealDamage(target, dmg, attacker);
      this.addParticles(
        (attacker.x + target.x) / 2,
        (attacker.y + target.y) / 2,
        '#ffe1a8', 3, 0.5
      );
    }
  }

  projectileHit(p) {
    this.dealDamage(p.target, p.dmg, { team: p.team, x: p.x, y: p.y, kind: 'projectile' });
  }

  dealDamage(target, amount, source) {
    if (!target || target.dead || target.kind === 'resource') return;
    const armor = (target.def && target.def.armor) || 0;
    const dmg = Math.max(1, Math.round(amount - armor));
    target.hp -= dmg;
    target.hitFlash = 1;

    if (target.kind === 'unit') {
      target.wasAttacked = true;
      target.lastAttacker = source;
      this.addParticles(target.x, target.y, '#c0392b', 3, 0.7);
    } else {
      this.addParticles(target.x + (Math.random() - 0.5) * 2, target.y + (Math.random() - 0.5) * 2, '#d8b070', 3, 0.9);
    }

    if (target.hp <= 0) this.kill(target, source);
  }

  kill(e, source) {
    if (!e || e.dead) return;
    e.dead = true;

    if (e.kind === 'building') {
      e.unblock();
      e.queue.length = 0;
      this.addParticles(e.x, e.y, '#c9a86a', 18, 1.8);
      this.addParticles(e.x, e.y, '#4a4a4a', 12, 2.2);
      if (e.type === 'townhall') {
        this.emit(`${TEAM_DATA[e.team].name}的城镇大厅被摧毁！`, e.team === 'player' ? 'bad' : 'good');
      } else if (e.team === 'player') {
        this.emit(`${e.def.name} 被摧毁`, 'bad');
      }
    } else if (e.kind === 'unit') {
      this.addParticles(e.x, e.y, e.team === 'player' ? '#6f9ad6' : '#b34a42', 8, 1.1);
      if (e.team === 'player' && (e.type === 'knight' || e.type === 'footman')) {
        /* 只提示重要单位损失 */
      }
    } else if (e.kind === 'resource') {
      e.unblock();
      this.addParticles(e.x, e.y, e.type === 'tree' ? '#5a7a3a' : '#c8a24a', 8, 1.0);
    }

    this.removeFromSelection(e);
    if (e.kind === 'building' && e.type === 'townhall') {
      this.onTownhallDown(e.team);
    }
  }

  onBuildingComplete(b) {
    if (b.team === 'player') this.emit(`${b.def.name} 建造完成`, 'good');
    this.addParticles(b.x, b.y, '#e6c072', 12, 1.3);
    if (b.team === 'player') this.updateFog(true);
  }

  onTownhallDown(team) {    if (this.over) return;
    if (team === 'player') this.over = { result: 'defeat' };
    else this.over = { result: 'victory' };
  }

  checkVictory() {
    if (this.over || !this.started) return;
    const playerTH = this.buildings.some(b => b.team === 'player' && b.type === 'townhall' && !b.dead);
    const enemyTH = this.buildings.some(b => b.team === 'enemy' && b.type === 'townhall' && !b.dead);
    if (!enemyTH) this.over = { result: 'victory' };
    else if (!playerTH) this.over = { result: 'defeat' };
  }

  /* ================= 经济 ================= */
  findDropoff(team, x, y) {
    let best = null, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.team !== team || !b.complete || !b.def.dropoff) continue;
      const d = Util.dist2(x, y, b.x, b.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  findNearestResource(resType, x, y, maxDist) {
    let best = null, bestD = (maxDist || 30) * (maxDist || 30);
    for (const r of this.resources) {
      if (r.dead || r.amount <= 0 || r.resType !== resType) continue;
      const d = Util.dist2(x, y, r.x, r.y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  findResourceOfType(resType) {
    let best = null;
    for (const r of this.resources) {
      if (r.dead || r.amount <= 0 || r.resType !== resType) continue;
      if (!best || r.amount > best.amount) best = r;
    }
    return best;
  }

  deposit(unit, amount, type) {
    if (!amount) return;
    const r = this.res[unit.team];
    if (type === 'gold') r.gold += amount;
    else r.lumber += amount;
    this.addFloater(unit.x, unit.y - 0.5, '+' + amount, type === 'gold' ? '#f0c451' : '#9ad06f');
    this.addParticles(unit.x, unit.y, type === 'gold' ? '#f0c451' : '#9ad06f', 3, 0.6);
  }

  onGatherTick(unit, res) {
    this.addParticles(res.x, res.y, res.resType === 'gold' ? '#f0c451' : '#8fbe6a', 3, 0.7);
  }

  depleteResource(res, silent) {
    if (!res || res.dead) return;
    res.dead = true;
    res.unblock();
    if (!silent) this.addParticles(res.x, res.y, res.type === 'tree' ? '#6b7a3a' : '#8a7a4a', 8, 1.1);
    this.removeFromSelection(res);
  }

  /* ================= 生产 ================= */
  findSpawnNear(x, y, maxR) {
    const w = this.world;
    const bx = Math.floor(x), by = Math.floor(y);

    const free = (tx, ty) => {
      if (!w.isWalkable(tx, ty)) return false;
      for (const u of this.units) {
        if (u.dead) continue;
        if (Math.hypot(u.x - (tx + 0.5), u.y - (ty + 0.5)) < 0.6) return false;
      }
      return true;
    };

    if (free(bx, by)) return { x: bx + 0.5, y: by + 0.5 };
    for (let r = 1; r <= (maxR || 6); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (free(bx + dx, by + dy)) return { x: bx + dx + 0.5, y: by + dy + 0.5 };
        }
      }
    }
    /* 实在没有空位就返回任意可走格 */
    for (let r = 1; r <= (maxR || 6); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (w.isWalkable(bx + dx, by + dy)) return { x: bx + dx + 0.5, y: by + dy + 0.5 };
        }
      }
    }
    return null;
  }

  spawnUnit(type, team, x, y) {
    const u = new Unit(this, type, team, x, y);
    const w = this.world;
    if (!w.isWalkable(Math.floor(x), Math.floor(y))) {
      const p = this.findSpawnNear(x, y, 6);
      if (!p) { this.units.push(u); return u; }
      u.x = p.x; u.y = p.y;
    }
    this.units.push(u);
    return u;
  }

  spawnFromBuilding(b, type) {
    const p = this.findSpawnNear(b.x, b.y + b.h / 2 + 0.8, 6) ||
      this.findSpawnNear(b.x, b.y, 6) || { x: b.x, y: b.y + b.h / 2 + 1 };
    const u = this.spawnUnit(type, b.team, p.x, p.y);
    if (b.rally) {
      if (u.isWorker && b.rally.resource && !b.rally.resource.dead) {
        u.gatherFrom(b.rally.resource);
      } else {
        const tile = this.world.nearestWalkable(Math.floor(b.rally.x), Math.floor(b.rally.y), 6);
        if (tile) u.moveTo(tile.x, tile.y);
      }
    }
    return u;
  }

  tryQueueUnit(b, type) {
    if (!b || b.kind !== 'building' || b.dead) return { ok: false, reason: '无效建筑' };
    if (!b.complete) return { ok: false, reason: '建筑尚未建成' };
    const def = UNIT_TYPES[type];
    if (!def) return { ok: false, reason: '未知单位' };
    if (!b.def.trains || b.def.trains.indexOf(type) < 0) return { ok: false, reason: '该建筑无法训练此单位' };
    if (b.queue.length >= CONFIG.BUILD_QUEUE_MAX) return { ok: false, reason: '训练队列已满' };
    if (!this.canAfford(b.team, def.cost)) return { ok: false, reason: '资源不足' };
    if (this.popUsed(b.team) + def.food > this.popCap(b.team)) return { ok: false, reason: '人口已满，请建造农场' };
    this.pay(b.team, def.cost);
    b.queue.push({ type, progress: 0 });
    return { ok: true };
  }

  canPlace(type, tx, ty) {
    const def = BUILDING_TYPES[type];
    if (!def) return { ok: false, reason: '未知建筑' };
    if (tx < 0 || ty < 0 || tx + def.w > this.world.w || ty + def.h > this.world.h) {
      return { ok: false, reason: '超出地图范围' };
    }
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        if (!this.world.isWalkable(x, y)) return { ok: false, reason: '此处无法建造' };
      }
    }
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.x > tx - 0.35 && u.x < tx + def.w + 0.35 &&
          u.y > ty - 0.35 && u.y < ty + def.h + 0.35) {
        return { ok: false, reason: '有单位阻挡' };
      }
    }
    return { ok: true };
  }

  startConstruction(team, type, tx, ty, builders) {
    const check = this.canPlace(type, tx, ty);
    if (!check.ok) return check;
    const def = BUILDING_TYPES[type];
    if (!def.cost) return { ok: false, reason: '无法建造该建筑' };
    if (!this.canAfford(team, def.cost)) return { ok: false, reason: '资源不足' };

    this.pay(team, def.cost);
    const b = this.createBuilding(team, type, tx, ty, false);
    if (builders) builders.forEach(w => w.buildAt(b));
    if (team === 'player') this.emit(`开始建造：${def.name}`, 'info');
    return { ok: true, building: b };
  }

  /* ================= 视野 ================= */
  updateFog(force) {
    if (!CONFIG.FOG) { this.fogVersion++; return; }
    const w = this.world;
    w.vis.fill(0);

    const mark = (cx, cy, r) => {
      w.stampDisc(cx, cy, r, (x, y) => {
        const i = y * w.w + x;
        w.vis[i] = 1;
        w.explored[i] = 1;
      });
    };

    for (const u of this.units) {
      if (u.team !== 'player' || u.dead) continue;
      mark(u.x, u.y, u.def.sight);
    }
    for (const b of this.buildings) {
      if (b.team !== 'player' || b.dead) continue;
      mark(b.x, b.y, b.complete ? b.def.sight : Math.max(3, b.def.sight - 4));
    }
    this.fogVersion++;
  }

  /* ================= 特效 ================= */
  addParticles(x, y, color, count, scale) {
    const n = count || 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.5 + Math.random() * 1.6) * (scale || 1);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.4,
        life: 0.35 + Math.random() * 0.5,
        maxLife: 0.85,
        color,
        size: (1.5 + Math.random() * 2.6) * (scale || 1) * 0.6,
      });
    }
  }

  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
  }

  emit(text, kind) {
    this.messages.push({ text, kind: kind || 'info', time: this.time });
    if (this.messages.length > 40) this.messages.shift();
    if (this.onMessage) this.onMessage(text, kind);
  }

  /* ================= 主循环 ================= */
  update(dt) {
    if (this.over || this.paused || !this.started) return;
    const s = Math.min(dt, 0.05);
    this.time += s;

    for (const b of this.buildings) b.update(s);
    for (const u of this.units) u.update(s);
    for (const p of this.projectiles) p.update(s);

    this.separateUnits(s);

    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.units = this.units.filter(u => !u.dead);
    this.buildings = this.buildings.filter(b => !b.dead);
    this.resources = this.resources.filter(r => !r.dead);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= s;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += 1.2 * s;
      p.vx *= 0.98;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= s;
      f.y -= s * 1.2;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }

    this.selection = this.selection.filter(e => !e.dead);

    this.fogTimer -= s;
    if (this.fogTimer <= 0) {
      this.fogTimer = 0.22;
      this.updateFog();
    }

    if (this.ai) this.ai.update(s);
    this.checkVictory();
  }

  separateUnits(dt) {
    const us = this.units;
    const maxPush = Math.max(0.004, 1.3 * (dt || 0.016));
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead) continue;
        const rr = a.radius + b.radius;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const push = Math.min((rr - d) * 0.5, maxPush);
        const ux = dx / d, uy = dy / d;
        this.nudge(a, -ux * push, -uy * push);
        this.nudge(b, ux * push, uy * push);
      }
    }
  }

  nudge(e, dx, dy) {
    if (!dx && !dy) return;
    const nx = e.x + dx, ny = e.y + dy;
    if (this.world.walkablePoint(nx, ny)) { e.x = nx; e.y = ny; }
    else if (this.world.walkablePoint(nx, e.y)) { e.x = nx; }
    else if (this.world.walkablePoint(e.x, ny)) { e.y = ny; }
  }

  /* ================= 统计 ================= */
  stats(team) {
    let army = 0, workers = 0, value = 0;
    for (const u of this.units) {
      if (u.team !== team) continue;
      if (u.isWorker) workers++;
      else { army++; value += (u.def.cost.gold || 0) + (u.def.cost.lumber || 0); }
    }
    return { army, workers, value };
  }
}

globalThis.Game = Game;
