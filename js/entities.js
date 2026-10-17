'use strict';

/* ============================================================
   实体：单位 / 建筑 / 资源 / 投射物
   ============================================================ */

let _entitySeq = 0;

/* ------------------------------------------------------------------ */
/*  单位                                                              */
/* ------------------------------------------------------------------ */
class Unit {
  constructor(game, type, team, x, y) {
    this.id = ++_entitySeq;
    this.game = game;
    this.kind = 'unit';
    this.type = type;
    this.def = UNIT_TYPES[type];
    this.team = team;

    this.x = x;
    this.y = y;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.radius = this.def.radius;
    this.facing = -Math.PI / 2;

    this.order = { type: 'idle' };
    this.cd = 0;
    this.carry = 0;
    this.carryType = null;
    this.gatherTimer = 0;

    this.path = null;          // null = 尚未计算
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.scanTimer = Math.random() * 0.4;

    this.hitFlash = 0;
    this.anim = Math.random() * 8;
    this.dead = false;
    this.selected = false;
    this.wasAttacked = false;
  }

  get isWorker() { return this.type === 'worker'; }

  /* ---------- 基础移动 ---------- */
  canStand(x, y) { return this.game.world.walkablePoint(x, y); }

  /** 朝目标点走一步，返回剩余距离 */
  stepToward(tx, ty, dt) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-5) return 0;
    const step = Math.min(this.def.speed * dt, d);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    if (this.canStand(nx, ny)) {
      this.x = nx; this.y = ny;
      this.facing = Math.atan2(dy, dx);
    } else if (this.canStand(nx, this.y)) {
      this.x = nx;
      this.facing = Math.atan2(dy, dx);
    } else if (this.canStand(this.x, ny)) {
      this.y = ny;
      this.facing = Math.atan2(dy, dx);
    } else {
      return d;
    }
    return Math.max(0, d - step);
  }

  /** 沿路径移动，返回是否已走完 */
  moveAlongPath(dt) {
    if (!this.path || this.pathIndex >= this.path.length) return true;
    const node = this.path[this.pathIndex];
    const tx = node.x + 0.5, ty = node.y + 0.5;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.def.speed * dt;

    if (d <= Math.max(step, 0.13)) {
      this.x = tx; this.y = ty;
      this.pathIndex++;
      if (dx || dy) this.facing = Math.atan2(dy, dx);
      return this.pathIndex >= this.path.length;
    }

    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    if (this.canStand(nx, ny)) { this.x = nx; this.y = ny; this.facing = Math.atan2(dy, dx); }
    else if (this.canStand(nx, this.y)) { this.x = nx; this.facing = Math.atan2(dy, dx); }
    else if (this.canStand(this.x, ny)) { this.y = ny; this.facing = Math.atan2(dy, dx); }
    else { this.path = null; return true; }
    return false;
  }

  /* ---------- 命令 ---------- */
  stop() {
    this.order = { type: 'idle' };
    this.path = null;
    this.pathIndex = 0;
  }

  moveTo(tx, ty) {
    this.order = { type: 'move', tx, ty };
    this.path = null;
    this.pathIndex = 0;
    this.game.pathToPoint(this, tx, ty);
  }

  attackOrder(target) {
    this.order = { type: 'attack', target };
    this.path = null;
    this.pathIndex = 0;
  }

  attackMoveTo(tx, ty) {
    this.order = { type: 'attackMove', tx, ty, target: null };
    this.path = null;
    this.pathIndex = 0;
    this.game.pathToPoint(this, tx, ty);
  }

  gatherFrom(res) {
    this.order = {
      type: 'gather', target: res, resType: res.resType,
      phase: this.carry > 0 ? 'return' : 'go',
    };
    this.path = null;
    this.pathIndex = 0;
    this.gatherTimer = 0;
  }

  buildAt(building) {
    this.order = { type: 'build', target: building };
    this.path = null;
    this.pathIndex = 0;
  }

  gatherRange(res) {
    if (res.type === 'tree') return 0.95;
    return 1.5;
  }

  /* ---------- 每帧 ---------- */
  update(dt) {
    if (this.cd > 0) this.cd -= dt;
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3.2);
    this.anim += dt;
    if (this.wasAttacked) {
      this.wasAttacked = false;
      this.game.alertDefenders(this, this.lastAttacker, 8);
    }

    switch (this.order.type) {
      case 'move': this.updateMove(dt); break;
      case 'attack': this.updateAttack(dt); break;
      case 'attackMove': this.updateAttackMove(dt); break;
      case 'gather': this.updateGather(dt); break;
      case 'build': this.updateBuild(dt); break;
      default: this.updateIdle(dt); break;
    }
  }

  updateIdle(dt) {
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = 0.35 + Math.random() * 0.25;
    const foe = this.game.findEnemyNear(this, this.def.sight * 0.85);
    if (foe) this.attackOrder(foe);
  }

  updateMove(dt) {
    const o = this.order;
    if (this.path && this.path.length && this.pathIndex < this.path.length) {
      if (this.moveAlongPath(dt)) this.order = { type: 'idle' };
      return;
    }
    const remain = this.stepToward(o.tx + 0.5, o.ty + 0.5, dt);
    if (remain < 0.3) this.order = { type: 'idle' };
  }

  updateAttack(dt) {
    const t = this.order.target;
    if (!t || t.dead) { this.order = { type: 'idle' }; return; }
    this.attackTarget(t, dt);
  }

  updateAttackMove(dt) {
    const o = this.order;
    if (o.target && !o.target.dead) { this.attackTarget(o.target, dt); return; }
    o.target = null;

    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.35 + Math.random() * 0.2;
      const foe = this.game.findEnemyNear(this, this.def.sight);
      if (foe) { o.target = foe; return; }
    }

    if (this.path === null) this.game.pathToPoint(this, o.tx, o.ty);
    if (this.path && this.path.length && this.pathIndex < this.path.length) {
      if (this.moveAlongPath(dt)) this.order = { type: 'idle' };
    } else {
      const remain = this.stepToward(o.tx + 0.5, o.ty + 0.5, dt);
      if (remain < 0.4) this.order = { type: 'idle' };
    }
  }

  attackTarget(target, dt) {
    const range = this.def.atkRange;
    const d = this.game.edgeDistance(this.x, this.y, target);
    if (d <= range) {
      this.path = null;
      this.pathIndex = 0;
      this.facing = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.cd <= 0) {
        this.cd = this.def.atkCd;
        this.anim += 0.9;
        this.game.performAttack(this, target);
      }
      return;
    }
    this.repathTimer -= dt;
    if (this.path === null || this.repathTimer <= 0) {
      this.repathTimer = 0.5;
      this.game.pathUnitTo(this, target);
    }
    if (this.path && this.path.length && this.pathIndex < this.path.length) {
      this.moveAlongPath(dt);
    } else {
      this.stepToward(target.x, target.y, dt);
    }
  }

  updateGather(dt) {
    const o = this.order;
    let res = o.target;
    if (!res || res.dead || res.amount <= 0) {
      const next = this.game.findNearestResource(o.resType || 'gold', this.x, this.y, 24);
      if (next) { o.target = res = next; o.phase = 'go'; this.path = null; }
      else { this.order = { type: 'idle' }; return; }
    }

    if (o.phase === 'go') {
      const d = this.game.edgeDistance(this.x, this.y, res);
      if (d <= this.gatherRange(res)) {
        o.phase = 'gather';
        this.gatherTimer = 0;
        this.path = null;
        this.facing = Math.atan2(res.y - this.y, res.x - this.x);
        return;
      }
      if (this.path === null) this.game.pathUnitTo(this, res);
      if (this.path && this.path.length && this.pathIndex < this.path.length) this.moveAlongPath(dt);
      else this.stepToward(res.x, res.y, dt);
      return;
    }

    if (o.phase === 'gather') {
      this.facing = Math.atan2(res.y - this.y, res.x - this.x);
      this.gatherTimer += dt;
      if (this.gatherTimer >= this.def.gatherTime) {
        this.gatherTimer = 0;
        const take = Math.min(this.def.gatherCapacity, res.amount);
        res.amount -= take;
        this.carry = take;
        this.carryType = res.resType;
        this.game.onGatherTick(this, res);
        if (res.amount <= 0) this.game.depleteResource(res);
        o.phase = 'return';
        this.path = null;
        this.pathIndex = 0;
      }
      return;
    }

    if (o.phase === 'return') {
      const drop = this.game.findDropoff(this.team, this.x, this.y);
      if (!drop) { this.order = { type: 'idle' }; return; }
      const d = this.game.edgeDistance(this.x, this.y, drop);
      if (d <= 1.3) {
        this.game.deposit(this, this.carry, this.carryType);
        this.carry = 0;
        o.phase = 'go';
        this.path = null;
        this.pathIndex = 0;
        if (!o.target || o.target.dead || o.target.amount <= 0) {
          const next = this.game.findNearestResource(o.resType, this.x, this.y, 24);
          if (next) o.target = next;
          else this.order = { type: 'idle' };
        }
        return;
      }
      if (this.path === null) this.game.pathUnitTo(this, drop);
      if (this.path && this.path.length && this.pathIndex < this.path.length) this.moveAlongPath(dt);
      else this.stepToward(drop.x, drop.y, dt);
    }
  }

  updateBuild(dt) {
    const b = this.order.target;
    if (!b || b.dead || b.complete) { this.order = { type: 'idle' }; return; }
    const d = this.game.edgeDistance(this.x, this.y, b);
    if (d <= 1.25) {
      this.path = null;
      this.pathIndex = 0;
      this.facing = Math.atan2(b.y - this.y, b.x - this.x);
      this.anim += dt * 2;
      b.addBuildWork(dt);
      return;
    }
    if (this.path === null) this.game.pathUnitTo(this, b);
    if (this.path && this.path.length && this.pathIndex < this.path.length) this.moveAlongPath(dt);
    else this.stepToward(b.x, b.y, dt);
  }
}

/* ------------------------------------------------------------------ */
/*  建筑                                                              */
/* ------------------------------------------------------------------ */
class Building {
  constructor(game, type, team, tx, ty, complete) {
    this.id = ++_entitySeq;
    this.game = game;
    this.kind = 'building';
    this.type = type;
    this.def = BUILDING_TYPES[type];
    this.team = team;

    this.tx = tx; this.ty = ty;
    this.w = this.def.w; this.h = this.def.h;
    this.left = tx; this.top = ty;
    this.x = tx + this.w / 2;
    this.y = ty + this.h / 2;
    this.radius = Math.max(this.w, this.h) / 2;

    this.maxHp = this.def.hp;
    this.complete = !!complete;
    this.hp = complete ? this.maxHp : Math.ceil(this.maxHp * 0.35);
    this.progress = complete ? 1 : 0;

    this.queue = [];
    this.rally = null;
    this.cd = 0;
    this.scanTimer = 0;
    this.atkTarget = null;
    this.hitFlash = 0;
    this.dead = false;
    this.selected = false;
    this.buildPulse = 0;

    for (let y = ty; y < ty + this.h; y++)
      for (let x = tx; x < tx + this.w; x++)
        game.world.blockTile(x, y, this);
  }

  unblock() {
    for (let y = this.ty; y < this.ty + this.h; y++)
      for (let x = this.tx; x < this.tx + this.w; x++)
        if (this.game.world.blockers[this.game.world.idx(x, y)] === this)
          this.game.world.unblockTile(x, y);
  }

  addBuildWork(dt) {
    if (this.complete) return;
    this.progress += dt / this.def.buildTime;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.65 * dt / this.def.buildTime);
    this.buildPulse = 1;
    if (this.progress >= 1) this.finish();
  }

  finish() {
    this.complete = true;
    this.progress = 1;
    this.hp = this.maxHp;
    this.game.onBuildingComplete(this);
  }

  getTrainProgress() {
    if (!this.queue.length) return 0;
    const item = this.queue[0];
    return Util.clamp(item.progress / UNIT_TYPES[item.type].trainTime, 0, 1);
  }

  update(dt) {
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3.2);
    if (this.buildPulse > 0) this.buildPulse = Math.max(0, this.buildPulse - dt * 2);
    if (!this.complete) return;

    /* 训练队列 */
    if (this.queue.length) {
      const item = this.queue[0];
      item.progress += dt;
      if (item.progress >= UNIT_TYPES[item.type].trainTime) {
        this.queue.shift();
        this.game.spawnFromBuilding(this, item.type);
      }
    }

    /* 防御塔 */
    const atk = this.def.attack;
    if (atk) {
      if (this.cd > 0) this.cd -= dt;
      this.scanTimer -= dt;
      if (this.scanTimer <= 0) {
        this.scanTimer = 0.3;
        this.atkTarget = this.game.findEnemyNearPoint(this.x, this.y, atk.range, this.team);
      }
      const t = this.atkTarget;
      if (t && !t.dead && this.game.edgeDistance(this.x, this.y, t) <= atk.range) {
        if (this.cd <= 0) {
          this.cd = atk.cd;
          this.game.performAttack(this, t);
        }
      } else if (t && t.dead) {
        this.atkTarget = null;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  资源节点                                                          */
/* ------------------------------------------------------------------ */
class ResourceNode {
  constructor(game, type, tx, ty) {
    const def = RESOURCE_DEF[type];
    this.id = ++_entitySeq;
    this.game = game;
    this.kind = 'resource';
    this.type = type;
    this.def = def;
    this.team = 'neutral';

    this.tx = tx; this.ty = ty;
    this.w = def.w; this.h = def.h;
    this.left = tx; this.top = ty;
    this.x = tx + this.w / 2;
    this.y = ty + this.h / 2;
    this.radius = Math.max(this.w, this.h) / 2;

    this.amount = def.amount;
    this.maxAmount = def.amount;
    this.resType = def.resType;
    this.seed = Math.random() * 1000;
    this.dead = false;
    this.selected = false;

    for (let y = ty; y < ty + this.h; y++)
      for (let x = tx; x < tx + this.w; x++)
        game.world.blockTile(x, y, this);
  }

  unblock() {
    for (let y = this.ty; y < this.ty + this.h; y++)
      for (let x = this.tx; x < this.tx + this.w; x++)
        if (this.game.world.blockers[this.game.world.idx(x, y)] === this)
          this.game.world.unblockTile(x, y);
  }
}

/* ------------------------------------------------------------------ */
/*  投射物                                                            */
/* ------------------------------------------------------------------ */
class Projectile {
  constructor(game, x, y, target, kind, speed, dmg, team) {
    this.game = game;
    this.x = x; this.y = y;
    this.target = target;
    this.kind = kind;
    this.speed = speed;
    this.dmg = dmg;
    this.team = team;
    this.angle = 0;
    this.dead = false;
  }

  update(dt) {
    if (!this.target || this.target.dead) { this.dead = true; return; }
    const tx = this.target.x, ty = this.target.y;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    this.angle = Math.atan2(dy, dx);
    const step = this.speed * dt;
    if (d <= step + 0.12) {
      this.x = tx; this.y = ty;
      this.game.projectileHit(this);
      this.dead = true;
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }
}

globalThis.Unit = Unit;
globalThis.Building = Building;
globalThis.ResourceNode = ResourceNode;
globalThis.Projectile = Projectile;
