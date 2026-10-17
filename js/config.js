'use strict';

/* ============================================================
   全局配置 / 数值表
   ============================================================ */

const CONFIG = {
  MAP_W: 80,
  MAP_H: 80,
  TILE: 24,

  START_GOLD: 520,
  START_LUMBER: 280,
  START_WORKERS: 5,

  POP_HARD_CAP: 80,
  FOG: true,

  ZOOM_MIN: 0.5,
  ZOOM_MAX: 2.0,
  CAM_SPEED: 26,        // tiles / second at zoom 1

  SELECT_DRAG_MIN: 6,   // px
  BUILD_QUEUE_MAX: 5,
  AI_ATTACK_FIRST: 112,  // seconds
  AI_ATTACK_PERIOD: 82,
};

const TEAM_DATA = {
  player:  { name: '王国军', color: '#4a8ae0', dark: '#1f4276', light: '#b8d6ff', roof: '#7a5030', ui: '#7fb6ff' },
  enemy:   { name: '黯影军团', color: '#cf4f45', dark: '#5e211c', light: '#ffb3a8', roof: '#4a3548', ui: '#ff9a8c' },
  neutral: { name: '中立',     color: '#8f8f84', dark: '#4c4c44', light: '#deded0', roof: '#5b5142', ui: '#cfcab8' },
};

const TERRAIN = { GRASS: 0, DIRT: 1, WATER: 2, SAND: 3, ROCK: 4 };
const TERRAIN_WALKABLE = [true, true, false, true, true];

/* ---------------- 单位 ---------------- */
const UNIT_TYPES = {
  worker: {
    id: 'worker', name: '农民', icon: '⛏️', hotkey: 'Q',
    hp: 75, armor: 0, dmg: 5, atkRange: 0.95, atkCd: 1.5,
    speed: 2.5, sight: 9, radius: 0.3,
    food: 1, cost: { gold: 60, lumber: 0 }, trainTime: 10,
    gatherCapacity: 10, gatherTime: 4.0,
    desc: '采集金矿与木材，建造建筑物并与敌人战斗。',
    role: '采集 / 建造',
  },
  footman: {
    id: 'footman', name: '步兵', icon: '🛡️', hotkey: 'Q',
    hp: 190, armor: 2, dmg: 13, atkRange: 1.0, atkCd: 1.15,
    speed: 2.2, sight: 10, radius: 0.32,
    food: 2, cost: { gold: 90, lumber: 0 }, trainTime: 14,
    desc: '坚韧的近战单位，生命值与护甲较高。',
    role: '近战',
  },
  archer: {
    id: 'archer', name: '弓箭手', icon: '🏹', hotkey: 'W',
    hp: 110, armor: 1, dmg: 16, atkRange: 5.5, atkCd: 1.7,
    speed: 2.2, sight: 11, radius: 0.3, projectile: 'arrow', projSpeed: 16,
    food: 2, cost: { gold: 75, lumber: 25 }, trainTime: 14,
    desc: '远程单位，可在安全距离输出，但惧怕近战突袭。',
    role: '远程',
  },
  knight: {
    id: 'knight', name: '骑士', icon: '🐴', hotkey: 'E',
    hp: 340, armor: 5, dmg: 25, atkRange: 1.1, atkCd: 1.35,
    speed: 2.8, sight: 10, radius: 0.4,
    food: 3, cost: { gold: 170, lumber: 70 }, trainTime: 22,
    desc: '重装冲击单位：生命与伤害极高，移动迅速。',
    role: '重装',
  },
};

/* ---------------- 建筑 ---------------- */
const BUILDING_TYPES = {
  townhall: {
    id: 'townhall', name: '城镇大厅', icon: '🏛️', w: 4, h: 4,
    hp: 1500, armor: 6, sight: 15, food: 12,
    cost: null, buildTime: 60,
    trains: ['worker'], dropoff: true,
    desc: '主基地。训练农民，并作为资源存放点。',
  },
  farm: {
    id: 'farm', name: '农场', icon: '🌾', w: 3, h: 3,
    hp: 420, armor: 2, sight: 7, food: 6,
    cost: { gold: 80, lumber: 30 }, buildTime: 15,
    trains: [],
    desc: '提高 6 点人口上限。人口不足时优先建造。',
  },
  barracks: {
    id: 'barracks', name: '兵营', icon: '⚔️', w: 3, h: 3,
    hp: 850, armor: 3, sight: 10, food: 0,
    cost: { gold: 150, lumber: 70 }, buildTime: 22,
    trains: ['footman', 'archer', 'knight'],
    desc: '训练步兵、弓箭手与骑士。',
  },
  tower: {
    id: 'tower', name: '防御塔', icon: '🗼', w: 2, h: 2,
    hp: 620, armor: 4, sight: 12, food: 0,
    cost: { gold: 120, lumber: 50 }, buildTime: 18,
    trains: [],
    attack: { dmg: 20, range: 7, cd: 1.25, projectile: 'bolt', projSpeed: 18 },
    desc: '自动攻击射程内的敌人，适合守卫基地与金矿。',
  },
  goldmine: {
    id: 'goldmine', name: '金矿', icon: '💰', w: 3, h: 3,
    hp: 99999, armor: 99, sight: 4, food: 0,
    cost: null, buildTime: 1, neutral: true, trains: [],
    desc: '农民在此采集金币。',
  },
};

/* 建造菜单顺序 */
const BUILD_MENU = ['farm', 'barracks', 'tower'];

/* 资源节点参数 */
const RESOURCE_DEF = {
  tree: { name: '树木', w: 1, h: 1, amount: 80, resType: 'lumber', icon: '🌲' },
  gold: { name: '金矿', w: 3, h: 3, amount: 2600, resType: 'gold', icon: '💰' },
};
