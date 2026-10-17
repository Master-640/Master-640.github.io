'use strict';

/* 无头模拟测试：加载纯逻辑模块，跑完整对局，检查稳定性与平衡性 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = ['js/config.js', 'js/util.js', 'js/world.js', 'js/entities.js', 'js/game.js', 'js/ai.js'];

const ctx = { console, Math, Date, performance: { now: () => Date.now() } };
vm.createContext(ctx);
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}

const Game = ctx.Game;
const BUILDING_TYPES = vm.runInContext('BUILDING_TYPES', ctx);

/* ---------------- 玩家机器人 ---------------- */
const botState = { attackTimer: 80, wave: 0 };

function playerBot(g, t) {
  const my = g.units.filter(u => u.team === 'player' && !u.dead);
  const workers = my.filter(u => u.isWorker);

  for (const w of workers) {
    if (w.order.type !== 'idle') continue;
    const goldCount = workers.filter(u => u.order.type === 'gather' && u.order.resType === 'gold').length;
    const type = goldCount < 5 ? 'gold' : 'lumber';
    let res = g.findNearestResource(type, w.x, w.y, 60);
    if (!res) res = g.findNearestResource(type === 'gold' ? 'lumber' : 'gold', w.x, w.y, 60);
    if (res) w.gatherFrom(res);
  }

  const th = g.buildings.find(b => b.team === 'player' && b.type === 'townhall' && b.complete);
  if (!th) return;

  if (workers.length < 11 && th.queue.length === 0) g.tryQueueUnit(th, 'worker');

  const findFreeWorker = () => workers.find(w => w.order.type === 'idle') ||
    workers.find(w => w.order.type === 'gather');

  const spotNear = (type, cx, cy, maxR) => {
    for (let r = 3; r <= maxR; r++) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(a) * r);
        const ty = Math.round(cy + Math.sin(a) * r);
        if (g.canPlace(type, tx, ty).ok) return { x: tx, y: ty };
      }
    }
    return null;
  };

  const tryBuild = (type, maxR) => {
    const def = BUILDING_TYPES[type];
    if (!g.canAfford('player', def.cost)) return false;
    const spot = spotNear(type, th.x, th.y, maxR);
    const w = findFreeWorker();
    if (!spot || !w) return false;
    return g.startConstruction('player', type, spot.x, spot.y, [w]).ok;
  };

  const cap = g.popCap('player'), used = g.popUsed('player');
  const farmBuilding = g.buildings.some(b => b.team === 'player' && b.type === 'farm' && !b.complete);
  const farmCount = g.buildings.filter(b => b.team === 'player' && b.type === 'farm').length;
  if (cap - used <= 6 && farmCount < 6 && !farmBuilding) tryBuild('farm', 9);

  const barracksBuilding = g.buildings.some(b => b.team === 'player' && b.type === 'barracks' && !b.complete);
  const barracksCount = g.buildings.filter(b => b.team === 'player' && b.type === 'barracks').length;
  if (barracksCount === 0 && !barracksBuilding) tryBuild('barracks', 9);
  else if (barracksCount < 2 && g.res.player.gold > 500 && !barracksBuilding && barracksCount >= 1) tryBuild('barracks', 10);

  const towerCount = g.buildings.filter(b => b.team === 'player' && b.type === 'tower').length;
  if (towerCount < 2 && g.res.player.gold > 500) tryBuild('tower', 8);

  const barracks = g.buildings.filter(b => b.team === 'player' && b.type === 'barracks' && b.complete);
  for (const b of barracks) {
    if (b.queue.length < 2) {
      const type = g.res.player.gold > 340 ? 'knight' : (Math.random() < 0.55 ? 'footman' : 'archer');
      g.tryQueueUnit(b, type);
    }
  }

  /* 进攻 */
  botState.attackTimer -= 0.5;
  const army = my.filter(u => !u.isWorker);
  if (botState.attackTimer <= 0 && army.length >= 8) {
    botState.attackTimer = 55;
    botState.wave++;
    const eth = g.buildings.find(b => b.team === 'enemy' && b.type === 'townhall' && !b.dead);
    if (eth) {
      const pts = g.formationPoints(army.length, eth.x, eth.y + 4);
      army.forEach((u, i) => {
        const p = pts[i] || { x: eth.x, y: eth.y + 4 };
        const tile = g.world.nearestWalkable(Math.floor(p.x), Math.floor(p.y), 8);
        if (tile) u.attackMoveTo(tile.x, tile.y);
      });
      console.log(`[bot] 第 ${botState.wave} 波进攻，${army.length} 单位`);
    }
  }
}

/* ---------------- 运行 ---------------- */
const g = new Game(20240517);
g.started = true;

const dt = 1 / 30;
const maxT = 1800;
let t = 0;
let frames = 0;
const t0 = Date.now();
let botTimer = 0;
let errors = 0;

while (t < maxT && !g.over) {
  try {
    g.update(dt);
  } catch (err) {
    console.error('UPDATE ERROR at t=' + t.toFixed(1), err);
    errors++;
    if (errors > 3) break;
  }
  botTimer -= dt;
  if (botTimer <= 0) { botTimer = 0.5; playerBot(g, t); }

  t += dt;
  frames++;

  if (Math.abs(t % 120) < dt) {
    const s = g.stats('player'), e = g.stats('enemy');
    console.log(
      `t=${t.toFixed(0).padStart(4)}s  ` +
      `玩家 金${Math.floor(g.res.player.gold)} 木${Math.floor(g.res.player.lumber)} 人口${g.popUsed('player')}/${g.popCap('player')} 兵${s.army} 农${s.workers} | ` +
      `敌方 金${Math.floor(g.res.enemy.gold)} 兵${e.army} 农${e.workers} | ` +
      `单位${g.units.length} 建筑${g.buildings.length}`
    );
  }

  for (const u of g.units) {
    if (!isFinite(u.x) || !isFinite(u.y)) {
      console.error('NaN position!', u.type, u.team, u.x, u.y);
      process.exit(1);
    }
  }
}

const ms = Date.now() - t0;
console.log('---- 结果 ----');
console.log('模拟时长:', t.toFixed(1), 's  帧数:', frames, ' 墙钟:', ms + 'ms',
  ' 平均帧耗时:', (ms / frames).toFixed(3) + 'ms');
console.log('游戏状态:', g.over ? g.over.result : '未结束');
console.log('玩家 金:', Math.floor(g.res.player.gold), '木:', Math.floor(g.res.player.lumber),
  '人口:', g.popUsed('player') + '/' + g.popCap('player'));
console.log('敌方 金:', Math.floor(g.res.enemy.gold), '木:', Math.floor(g.res.enemy.lumber),
  '人口:', g.popUsed('enemy') + '/' + g.popCap('enemy'));
console.log('单位数:', g.units.length, '建筑数:', g.buildings.length, '资源节点:', g.resources.length);
console.log('玩家城镇大厅:', g.buildings.some(b => b.team === 'player' && b.type === 'townhall'));
console.log('敌方城镇大厅:', g.buildings.some(b => b.team === 'enemy' && b.type === 'townhall'));
console.log('剩余树:', g.resources.filter(r => r.type === 'tree').length,
  ' 剩余矿:', g.resources.filter(r => r.type === 'gold').length);

if (errors) process.exit(1);
