'use strict';

/* ============================================================
   通用工具函数
   ============================================================ */

const Util = (function () {

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function angleDiff(a, b) {
    let d = (b - a + Math.PI) % (Math.PI * 2);
    if (d < 0) d += Math.PI * 2;
    return d - Math.PI;
  }
  function approachAngle(a, target, step) {
    const d = angleDiff(a, target);
    if (Math.abs(d) <= step) return target;
    return a + Math.sign(d) * step;
  }

  /* 可复现随机数 */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 二叉最小堆（A* 开放列表） */
  class MinHeap {
    constructor() { this.items = []; this.prio = []; }
    get size() { return this.items.length; }
    clear() { this.items.length = 0; this.prio.length = 0; }
    push(item, priority) {
      const items = this.items, prio = this.prio;
      items.push(item); prio.push(priority);
      let i = items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (prio[p] <= prio[i]) break;
        const ti = items[p]; items[p] = items[i]; items[i] = ti;
        const tp = prio[p]; prio[p] = prio[i]; prio[i] = tp;
        i = p;
      }
    }
    pop() {
      const items = this.items, prio = this.prio;
      const n = items.length;
      if (n === 0) return undefined;
      const top = items[0];
      const lastItem = items.pop(), lastPrio = prio.pop();
      if (n > 1) {
        items[0] = lastItem; prio[0] = lastPrio;
        let i = 0;
        while (true) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < items.length && prio[l] < prio[m]) m = l;
          if (r < items.length && prio[r] < prio[m]) m = r;
          if (m === i) break;
          const ti = items[m]; items[m] = items[i]; items[i] = ti;
          const tp = prio[m]; prio[m] = prio[i]; prio[i] = tp;
          i = m;
        }
      }
      return top;
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function pick(arr, rnd) { return arr[Math.floor((rnd ? rnd() : Math.random()) * arr.length)]; }

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor((rnd ? rnd() : Math.random()) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function costText(cost) {
    if (!cost) return '';
    const p = [];
    if (cost.gold) p.push('◆' + cost.gold);
    if (cost.lumber) p.push('❖' + cost.lumber);
    return p.join(' ');
  }

  return { clamp, lerp, dist, dist2, angleDiff, approachAngle, mulberry32, MinHeap, formatTime, pick, shuffle, costText };
})();
