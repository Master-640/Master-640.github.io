'use strict';

/* ============================================================
   敌方 AI：经济、建造、练兵、波次进攻
   ============================================================ */

class AIPlayer {
  constructor(game, team) {
    this.game = game;
    this.team = team;
    this.tickTimer = 0;
    this.attackTimer = CONFIG.AI_ATTACK_FIRST;
    this.waveSize = 4;
    this.wave = 0;
    this.lastAttackNotice = -99;
  }

  update(dt) {
    this.tickTimer -= dt;
    if (this.tickTimer > 0) return;
    this.tickTimer = 0.65;
    this.think();
  }

  myUnits() { return this.game.units.filter(u => u.team === this.team && !u.dead); }
  myBuildings() { return this.game.buildings.filter(b => b.team === this.team && !b.dead); }

  townhall() {
    return this.myBuildings().find(b => b.type === 'townhall' && b.complete) || null;
  }

  count(type, completeOnly) {
    let n = 0;
    for (const b of this.myBuildings()) {
      if (b.type !== type) continue;
      if (completeOnly && !b.complete) continue;
      n++;
    }
    return n;
  }

  underConstruction(type) {
    return this.myBuildings().some(b => b.type === type && !b.complete);
  }

  think() {
    const g = this.game;
    if (g.over || !g.started) return;

    const th = this.townhall();
    if (!th) return;

    const units = this.myUnits();
    const workers = units.filter(u => u.isWorker);

    /* 1. 农民分配 */
    for (const w of workers) {
      if (w.order.type === 'idle') this.assignGather(w);
    }

    /* 2. 补充农民 */
    if (workers.length < 7 && th.queue.length === 0) g.tryQueueUnit(th, 'worker');

    /* 3. 人口 / 农场 */
    const used = g.popUsed(this.team);
    const cap = g.popCap(this.team);
    if (cap - used <= 4 && this.count('farm') < 6 && !this.underConstruction('farm')) {
      this.tryBuild('farm');
    }

    /* 4. 兵营 */
    if (this.count('barracks') === 0 && !this.underConstruction('barracks')) {
      this.tryBuild('barracks');
    } else if (g.time > 240 && this.count('barracks', true) < 2 && this.count('barracks') < 2 &&
               g.res[this.team].gold > 520 && !this.underConstruction('barracks')) {
      this.tryBuild('barracks');
    }

    /* 5. 防御塔 */
    if (this.count('tower') < 2 && g.res[this.team].gold > 430 &&
        g.res[this.team].lumber > 120 && !this.underConstruction('tower')) {
      this.tryBuild('tower');
    }

    /* 6. 练兵 */
    const armyNow = units.filter(u => !u.isWorker).length;
    for (const b of this.myBuildings()) {
      if (b.type !== 'barracks' || !b.complete) continue;
      if (b.queue.length < 1 && armyNow < 12) g.tryQueueUnit(b, this.pickUnitType());
    }

    /* 7. 进攻 */
    this.attackTimer -= 0.65;
    const army = units.filter(u => !u.isWorker);
    if (this.attackTimer <= 0 && army.length >= this.waveSize) {
      this.launchAttack(army);
      this.attackTimer = CONFIG.AI_ATTACK_PERIOD;
      this.waveSize = Math.min(9, 4 + Math.floor(this.wave * 0.7));
    }

    /* 8. 基地告急提示 */
    if (th.hp < th.maxHp * 0.85 && g.time - this.lastAttackNotice > 25) {
      this.lastAttackNotice = g.time;
      g.emit('警告：我方基地正遭受攻击！', 'bad');
    }
  }

  assignGather(w) {
    const g = this.game;
    let goldWorkers = 0, lumberWorkers = 0;
    for (const u of this.myUnits()) {
      if (!u.isWorker) continue;
      if (u.order.type === 'gather') {
        if (u.order.resType === 'gold') goldWorkers++;
        else lumberWorkers++;
      }
    }

    let type = 'gold';
    if (goldWorkers >= 5 || (lumberWorkers < 2 && goldWorkers >= 3)) type = 'lumber';

    let res = g.findNearestResource(type, w.x, w.y, 70);
    if (!res) res = g.findNearestResource(type === 'gold' ? 'lumber' : 'gold', w.x, w.y, 70);
    if (res) w.gatherFrom(res);
  }

  findBuilder() {
    const workers = this.myUnits().filter(u => u.isWorker);
    if (!workers.length) return null;
    let best = null, bestScore = Infinity;
    for (const w of workers) {
      let score = 10;
      if (w.order.type === 'idle') score = 0;
      else if (w.order.type === 'gather') score = 3;
      else if (w.order.type === 'build') continue;
      else if (w.order.type === 'attack') score = 8;
      if (score < bestScore) { bestScore = score; best = w; }
    }
    return best;
  }

  tryBuild(type) {
    const g = this.game;
    const def = BUILDING_TYPES[type];
    if (!def || !def.cost) return false;
    if (!g.canAfford(this.team, def.cost)) return false;

    const th = this.townhall();
    if (!th) return false;
    const spot = this.findSpot(th, type);
    if (!spot) return false;
    const builder = this.findBuilder();
    if (!builder) return false;

    const r = g.startConstruction(this.team, type, spot.x, spot.y, [builder]);
    return r.ok;
  }

  findSpot(th, type) {
    const g = this.game;
    const cx = th.x, cy = th.y;
    const ang0 = Math.random() * Math.PI * 2;
    for (let r = 4; r <= 13; r += 0.8) {
      for (let k = 0; k < 10; k++) {
        const a = ang0 + (k / 10) * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(a) * r - 1.5);
        const ty = Math.round(cy + Math.sin(a) * r - 1.5);
        if (g.canPlace(type, tx, ty).ok) return { x: tx, y: ty };
      }
    }
    return null;
  }

  pickUnitType() {
    const gold = this.game.res[this.team].gold;
    const r = Math.random();
    if (gold > 330 && r < 0.22) return 'knight';
    if (r < 0.58) return 'footman';
    return 'archer';
  }

  launchAttack(army) {
    const g = this.game;
    const th = g.buildings.find(b => b.team === 'player' && b.type === 'townhall' && !b.dead);
    const tx = th ? th.x : g.playerBase.x;
    const ty = th ? th.y : g.playerBase.y;

    const tile = g.world.nearestWalkable(Math.floor(tx), Math.floor(ty), 10) || { x: Math.floor(tx), y: Math.floor(ty) };
    const pts = g.formationPoints(army.length, tile.x + 0.5, tile.y + 0.5);
    army.forEach((u, i) => {
      const p = pts[i] || { x: tile.x + 0.5, y: tile.y + 0.5 };
      const t = g.world.nearestWalkable(Math.floor(p.x), Math.floor(p.y), 8);
      if (t) u.attackMoveTo(t.x, t.y);
    });

    this.wave++;
    g.emit(`${TEAM_DATA[this.team].name}第 ${this.wave} 波进攻来袭（${army.length} 个单位）！`, 'warn');
  }
}

globalThis.AIPlayer = AIPlayer;
