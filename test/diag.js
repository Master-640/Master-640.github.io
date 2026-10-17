'use strict';

/* 诊断：采集速率、战斗结算、建造流程 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = ['js/config.js', 'js/util.js', 'js/world.js', 'js/entities.js', 'js/game.js', 'js/ai.js'];
const ctx = { console, Math, Date, performance: { now: () => Date.now() } };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

const Game = ctx.Game;
const BUILDING_TYPES = vm.runInContext('BUILDING_TYPES', ctx);

function makeGame(seed) {
  const g = new Game(seed);
  g.started = true;
  g.ai = null;                    // 隔离 AI
  g.units = g.units.filter(u => u.team === 'player');
  return g;
}

function step(g, seconds, dt = 1 / 30) {
  const n = Math.ceil(seconds / dt);
  for (let i = 0; i < n; i++) g.update(dt);
}

/* ---------- 1. 采集速率 ---------- */
{
  const g = makeGame(1);
  const workers = g.units.filter(u => u.type === 'worker');
  const gold = g.findNearestResource('gold', 9, 9, 40);
  const wood = g.findNearestResource('lumber', 9, 9, 40);
  console.log('金矿位置', gold && [gold.tx, gold.ty], '树木', wood && [wood.tx, wood.ty]);
  const g0 = g.res.player.gold, l0 = g.res.player.lumber;
  workers.slice(0, 4).forEach(w => w.gatherFrom(gold));
  workers.slice(4).forEach(w => w.gatherFrom(wood));

  step(g, 60);
  console.log(`采集 60s: 金 +${Math.floor(g.res.player.gold - g0)}  木 +${Math.floor(g.res.player.lumber - l0)}  ` +
    `（${workers.length} 农民）`);
  const states = {};
  for (const w of workers) {
    const k = w.order.type + '/' + (w.order.phase || '');
    states[k] = (states[k] || 0) + 1;
  }
  console.log('农民状态:', states, ' 金矿剩余', gold && Math.floor(gold.amount));
  console.log('携带:', workers.map(w => Math.floor(w.carry)).join(','));
  console.log('位置:', workers.map(w => `${w.x.toFixed(1)},${w.y.toFixed(1)} d=${g.edgeDistance(w.x, w.y, w.order.target).toFixed(2)}`).join(' | '));
}

/* ---------- 2. 战斗结算 ---------- */
{
  const g = makeGame(2);
  g.units = g.units.filter(u => u.type !== 'footman');
  const spot = { x: 30, y: 30 };
  const atk = [];
  for (let i = 0; i < 4; i++) atk.push(g.spawnUnit('footman', 'player', spot.x + i * 0.8, spot.y));
  const def = [];
  for (let i = 0; i < 3; i++) def.push(g.spawnUnit('footman', 'enemy', spot.x + 4 + i * 0.8, spot.y + 1));

  console.log('\n战斗前 玩家', atk.length, '敌方', def.length);
  atk.forEach(u => u.attackOrder(def[0]));
  step(g, 30);
  console.log('30s 后 玩家', atk.filter(u => !u.dead).length, '敌方', def.filter(u => !u.dead).length);

  /* 弓箭手射程 */
  const g2 = makeGame(3);
  g2.units = [];
  const archer = g2.spawnUnit('archer', 'player', 30, 30);
  const target = g2.spawnUnit('footman', 'enemy', 34, 30);
  archer.attackOrder(target);
  let shots = 0;
  const oldPerform = g2.performAttack.bind(g2);
  g2.performAttack = (a, t) => { shots++; oldPerform(a, t); };
  step(g2, 12);
  console.log('\n弓箭手 12s 内攻击次数:', shots, ' 目标血量:', Math.ceil(target.hp), '/', target.maxHp,
    ' 距离:', g2.edgeDistance(archer.x, archer.y, target).toFixed(2));
}

/* ---------- 3. 建筑摧毁 / 胜负 ---------- */
{
  const g = makeGame(4);
  const eth = g.buildings.find(b => b.team === 'enemy' && b.type === 'townhall');
  const army = [];
  for (let i = 0; i < 8; i++) {
    const p = g.findSpawnNear(eth.x - 6, eth.y, 6);
    army.push(g.spawnUnit('knight', 'player', p.x, p.y));
  }
  army.forEach(u => u.attackOrder(eth));
  step(g, 60);
  console.log('\n攻城 60s: 敌方大厅血量', Math.ceil(eth.hp), '/', eth.maxHp, ' 已摧毁:', eth.dead,
    ' 游戏状态:', g.over && g.over.result);
}

/* ---------- 4. 建造流程 ---------- */
{
  const g = makeGame(5);
  const w = g.units.find(u => u.type === 'worker');
  const th = g.buildings.find(b => b.team === 'player' && b.type === 'townhall');
  const spot = { x: th.tx - 4, y: th.ty - 4 };
  const r = g.startConstruction('player', 'farm', spot.x, spot.y, [w]);
  console.log('\n建造 farm:', r.ok, r.reason || '', ' 花费后金', g.res.player.gold, '木', g.res.player.lumber);
  if (r.ok) {
    step(g, 25);
    console.log('25s 后完成:', r.building.complete, ' 进度', (r.building.progress * 100).toFixed(0) + '%',
      ' 人口上限', g.popCap('player'));
  }

  const th2 = g.buildings.find(b => b.team === 'player' && b.type === 'townhall');
  const q = g.tryQueueUnit(th2, 'worker');
  console.log('训练农民:', q.ok, q.reason || '');
  const before = g.units.length;
  step(g, 12);
  console.log('12s 后单位数变化:', before, '->', g.units.length, ' 人口', g.popUsed('player') + '/' + g.popCap('player'));
}
