'use strict';

/* ============================================================
   渲染层
   ============================================================ */

class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.cam = { x: game.playerBase.x, y: game.playerBase.y, zoom: 1.45 };
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.terrain = null;
    this.fogCanvas = null;
    this.fogCtx = null;
    this.fogImage = null;
    this.fogDrawn = -1;
    this.treeSprites = [];
    this.vignette = null;

    this.resize();
    this.buildTerrain();
    this.buildTreeSprites();
    this.initFog();
    this.clampCam();
  }

  /* ---------------- 尺寸 / 相机 ---------------- */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    this.vignette = g;

    this.clampCam();
  }

  viewTiles() {
    const z = this.cam.zoom, T = CONFIG.TILE;
    return { w: this.w / (z * T), h: this.h / (z * T) };
  }

  clampCam() {
    const v = this.viewTiles();
    const mw = this.game.world.w, mh = this.game.world.h;
    if (v.w >= mw) this.cam.x = mw / 2;
    else this.cam.x = Util.clamp(this.cam.x, v.w / 2, mw - v.w / 2);
    if (v.h >= mh) this.cam.y = mh / 2;
    else this.cam.y = Util.clamp(this.cam.y, v.h / 2, mh - v.h / 2);
  }

  panBy(dx, dy) {
    this.cam.x += dx;
    this.cam.y += dy;
    this.clampCam();
  }

  centerOn(x, y) {
    this.cam.x = x;
    this.cam.y = y;
    this.clampCam();
  }

  screenToWorld(sx, sy) {
    const z = this.cam.zoom, T = CONFIG.TILE;
    return {
      x: (sx - this.w / 2) / (z * T) + this.cam.x,
      y: (sy - this.h / 2) / (z * T) + this.cam.y,
    };
  }

  worldToScreen(wx, wy) {
    const z = this.cam.zoom, T = CONFIG.TILE;
    return {
      x: (wx - this.cam.x) * z * T + this.w / 2,
      y: (wy - this.cam.y) * z * T + this.h / 2,
    };
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Util.clamp(this.cam.zoom * factor, CONFIG.ZOOM_MIN, CONFIG.ZOOM_MAX);
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  /* ---------------- 地形 ---------------- */
  buildTerrain() {
    const world = this.game.world, T = CONFIG.TILE;
    const W = world.w * T, H = world.h * T;

    const base = document.createElement('canvas');
    base.width = W; base.height = H;
    const ctx = base.getContext('2d');

    const palette = {
      [TERRAIN.GRASS]: ['#4b6a3b', '#4f6e3e', '#486636', '#527041'],
      [TERRAIN.DIRT]: ['#6b5940', '#6f5d44', '#66553b', '#736147'],
      [TERRAIN.WATER]: ['#28495f', '#2b4f68', '#244457'],
      [TERRAIN.SAND]: ['#a1916a', '#a5966d', '#9a8a62'],
      [TERRAIN.ROCK]: ['#5e6153', '#65685a', '#575a4d'],
    };

    const hash = (x, y) => {
      let h = (x * 73856093) ^ (y * 19349663) ^ (world.seed * 83492791);
      h = (h ^ (h >>> 13)) * 1274126177;
      return ((h ^ (h >>> 16)) >>> 0);
    };

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const t = world.tiles[y * world.w + x];
        const h = hash(x, y);
        const colors = palette[t] || palette[0];
        ctx.fillStyle = colors[(h >>> 3) % colors.length];
        ctx.fillRect(x * T, y * T, T, T);
      }
    }

    /* 大块明暗，制造自然起伏 */
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 90; i++) {
      const h = hash(i * 7, i * 13);
      const cx = (h % W), cy = ((h >>> 8) % H);
      const r = 40 + (h >>> 16) % 110;
      ctx.fillStyle = (h & 1) ? '#6d8f4e' : '#2f4a26';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.6, (h % 10) / 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* 细节层（清晰，不模糊） */
    const detail = document.createElement('canvas');
    detail.width = W; detail.height = H;
    const dc = detail.getContext('2d');

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const t = world.tiles[y * world.w + x];
        const h = hash(x, y);
        const n = h % 100;

        if (t === TERRAIN.GRASS) {
          if (n < 42) {
            dc.strokeStyle = 'rgba(126,166,92,0.30)';
            dc.lineWidth = 1;
            const gx = x * T + (n % 17) + 3, gy = y * T + ((n * 7) % 17) + 3;
            dc.beginPath();
            dc.moveTo(gx, gy + 4);
            dc.lineTo(gx + 1.5, gy);
            dc.stroke();
          }
          if (n > 93) {
            dc.fillStyle = 'rgba(170,190,110,0.22)';
            dc.beginPath();
            dc.arc(x * T + 7, y * T + 9, 2.6, 0, Math.PI * 2);
            dc.fill();
          }
        } else if (t === TERRAIN.DIRT) {
          if (n < 45) {
            dc.fillStyle = 'rgba(52,40,26,0.22)';
            dc.fillRect(x * T + (n % 19), y * T + ((n * 3) % 19), 2, 2);
          }
        } else if (t === TERRAIN.SAND) {
          if (n < 40) {
            dc.fillStyle = 'rgba(232,216,172,0.30)';
            dc.fillRect(x * T + (n % 20), y * T + ((n * 11) % 20), 1.6, 1.6);
          }
        } else if (t === TERRAIN.WATER) {
          dc.strokeStyle = 'rgba(130,190,225,0.20)';
          dc.lineWidth = 1;
          dc.beginPath();
          dc.moveTo(x * T + 3, y * T + 8 + (n % 6));
          dc.lineTo(x * T + 12, y * T + 8 + (n % 6));
          dc.stroke();
          dc.beginPath();
          dc.moveTo(x * T + 10, y * T + 17 - (n % 5));
          dc.lineTo(x * T + 19, y * T + 17 - (n % 5));
          dc.stroke();
        } else if (t === TERRAIN.ROCK) {
          dc.fillStyle = 'rgba(32,34,28,0.28)';
          dc.beginPath();
          dc.ellipse(x * T + 12, y * T + 15, 7, 4, 0, 0, Math.PI * 2);
          dc.fill();
          dc.fillStyle = 'rgba(158,163,146,0.34)';
          dc.beginPath();
          dc.ellipse(x * T + 10, y * T + 9, 4, 3, 0, 0, Math.PI * 2);
          dc.fill();
        }
      }
    }

    /* 水岸描边 */
    dc.strokeStyle = 'rgba(206,224,222,0.22)';
    dc.lineWidth = 2;
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        if (world.tiles[y * world.w + x] !== TERRAIN.WATER) continue;
        const up = world.tileAt(x, y - 1), dn = world.tileAt(x, y + 1);
        const lf = world.tileAt(x - 1, y), rt = world.tileAt(x + 1, y);
        dc.beginPath();
        if (up !== TERRAIN.WATER) { dc.moveTo(x * T, y * T + 1); dc.lineTo(x * T + T, y * T + 1); }
        if (dn !== TERRAIN.WATER) { dc.moveTo(x * T, y * T + T - 1); dc.lineTo(x * T + T, y * T + T - 1); }
        if (lf !== TERRAIN.WATER) { dc.moveTo(x * T + 1, y * T); dc.lineTo(x * T + 1, y * T + T); }
        if (rt !== TERRAIN.WATER) { dc.moveTo(x * T + T - 1, y * T); dc.lineTo(x * T + T - 1, y * T + T); }
        dc.stroke();
      }
    }

    /* 柔化基础地形，消除方块感 */
    const soft = document.createElement('canvas');
    soft.width = W; soft.height = H;
    const sc = soft.getContext('2d');
    sc.filter = 'blur(3px)';
    sc.drawImage(base, 0, 0);
    sc.filter = 'none';

    this.terrain = soft;
    this.terrainDetail = detail;
  }

  /* ---------------- 树精灵 ---------------- */
  buildTreeSprites() {
    const variants = 5;
    for (let v = 0; v < variants; v++) {
      const cvs = document.createElement('canvas');
      cvs.width = 52; cvs.height = 62;
      const c = cvs.getContext('2d');
      const cx = 26, base = 58;
      const green = ['#2e4a2a', '#35532e', '#3d5f35', '#2a4526', '#375a31'][v];
      const light = ['#41693a', '#4a7440', '#517f46', '#3d6536', '#48753d'][v];

      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      c.ellipse(cx + 3, base - 1, 13, 5.5, 0, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#4b3623';
      c.fillRect(cx - 2.5, base - 20, 5, 20);
      c.fillStyle = '#3a2919';
      c.fillRect(cx + 0.5, base - 20, 2, 20);

      const blobs = [
        [cx - 8, base - 30, 13],
        [cx + 8, base - 31, 12],
        [cx, base - 42, 14],
        [cx - 3, base - 26, 11],
        [cx + 5, base - 24, 9],
      ];
      c.fillStyle = green;
      for (const [bx, by, br] of blobs) {
        c.beginPath();
        c.arc(bx, by, br, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = light;
      for (let i = 0; i < 5; i++) {
        const [bx, by, br] = blobs[i];
        c.beginPath();
        c.arc(bx - br * 0.28, by - br * 0.32, br * 0.55, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = 'rgba(150,190,110,0.22)';
      c.beginPath();
      c.arc(cx - 4, base - 46, 5, 0, Math.PI * 2);
      c.fill();

      this.treeSprites.push(cvs);
    }
  }

  /* ---------------- 迷雾 ---------------- */
  initFog() {
    const world = this.game.world;
    const cvs = document.createElement('canvas');
    cvs.width = world.w * 2;
    cvs.height = world.h * 2;
    const ctx = cvs.getContext('2d');
    this.fogCanvas = cvs;
    this.fogCtx = ctx;
    this.fogImage = ctx.createImageData(cvs.width, cvs.height);

    const soft = document.createElement('canvas');
    soft.width = cvs.width;
    soft.height = cvs.height;
    this.fogSoft = soft;
    this.fogSoftCtx = soft.getContext('2d');
  }

  updateFogCanvas() {
    const world = this.game.world;
    const fw = this.fogCanvas.width, fh = this.fogCanvas.height;
    const data = this.fogImage.data;
    const scale = fw / world.w;

    for (let y = 0; y < fh; y++) {
      const wy = Math.min(world.h - 1, Math.floor(y / scale));
      for (let x = 0; x < fw; x++) {
        const wx = Math.min(world.w - 1, Math.floor(x / scale));
        const i = wy * world.w + wx;
        let a;
        if (world.vis[i]) a = 0;
        else if (world.explored[i]) a = 122;
        else a = 255;
        const o = (y * fw + x) * 4;
        data[o] = 5; data[o + 1] = 4; data[o + 2] = 6; data[o + 3] = a;
      }
    }
    this.fogCtx.putImageData(this.fogImage, 0, 0);

    /* 柔化边缘 */
    const sc = this.fogSoftCtx;
    sc.clearRect(0, 0, fw, fh);
    sc.filter = 'blur(2.5px)';
    sc.drawImage(this.fogCanvas, 0, 0);
    sc.filter = 'none';

    this.fogDrawn = this.game.fogVersion;
  }

  /* ---------------- 主渲染 ---------------- */
  render(dt, input) {
    const ctx = this.ctx, g = this.game, T = CONFIG.TILE, z = this.cam.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x * T, -this.cam.y * T);

    if (this.terrain) ctx.drawImage(this.terrain, 0, 0);
    if (this.terrainDetail) ctx.drawImage(this.terrainDetail, 0, 0);

    /* 绘制列表（按 y 排序） */
    const list = [];
    for (const r of g.resources) {
      if (!g.entityVisible(r)) continue;
      list.push(r);
    }
    for (const b of g.buildings) {
      if (!g.entityVisible(b)) continue;
      list.push(b);
    }
    for (const u of g.units) {
      if (!g.entityVisible(u)) continue;
      list.push(u);
    }
    list.sort((a, b) => a.y - b.y);

    for (const e of list) {
      if (e.kind === 'unit') this.drawUnit(e);
      else if (e.kind === 'building') this.drawBuilding(e, z);
      else this.drawResource(e);
    }

    this.drawProjectiles();
    this.drawParticles();

    /* 迷雾 */
    if (CONFIG.FOG) {
      if (this.fogDrawn !== g.fogVersion) this.updateFogCanvas();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fogSoft, 0, 0, g.world.w * T, g.world.h * T);
    }

    /* 集结点 */
    for (const b of g.buildings) {
      if (!b.selected || !b.rally) continue;
      this.drawRally(b);
    }

    /* 建造预览 */
    if (input && input.placing) this.drawGhost(input.placing);

    /* 攻击移动落点 */
    if (input && input.aimPoint) this.drawAimPoint(input.aimPoint);

    this.drawFloaters();

    ctx.restore();

    /* 屏幕空间 */
    if (input && input.box) {
      const b = input.box;
      ctx.save();
      ctx.strokeStyle = 'rgba(140,220,140,0.95)';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(120,220,130,0.12)';
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
      const w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.restore();
    }

    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /* ---------------- 单位 ---------------- */
  drawUnit(u) {
    const ctx = this.ctx, T = CONFIG.TILE;
    const px = u.x * T, py = u.y * T;
    const r = Math.max(4.5, u.radius * T * 1.2);
    const moving = u.order.type === 'move' || u.order.type === 'attackMove' ||
      (u.order.type === 'attack' && (!u.path || u.pathIndex < (u.path ? u.path.length : 0)));
    const bob = Math.sin(u.anim * (moving ? 11 : 3)) * (moving ? 1.2 : 0.45);
    const team = TEAM_DATA[u.team];
    const pulse = 0.5 + 0.5 * Math.sin(this.game.time * 5);

    ctx.save();
    ctx.translate(px, py + bob);

    /* 影子 */
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.55, r * 1.0, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    /* 选中圈 */
    if (u.selected) {
      ctx.strokeStyle = u.team === 'player' ? 'rgba(140,235,150,' + (0.55 + pulse * 0.4) + ')' : 'rgba(255,140,120,0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.55, r * 1.28, r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* 武器 */
    ctx.save();
    ctx.rotate(u.facing);
    if (u.type === 'archer') {
      ctx.strokeStyle = '#c9a06a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(r * 0.9, 0, r * 0.85, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,230,230,0.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(r * 1.26, -r * 0.76);
      ctx.lineTo(r * 1.26, r * 0.76);
      ctx.stroke();
    } else if (u.type === 'worker') {
      ctx.strokeStyle = '#8a6a45';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r * 0.4, -r * 0.2);
      ctx.lineTo(r * 1.55, -r * 0.5);
      ctx.stroke();
      ctx.strokeStyle = '#b9c0c8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(r * 1.15, -r * 0.95);
      ctx.lineTo(r * 1.5, -r * 0.15);
      ctx.stroke();
    } else if (u.type === 'knight') {
      ctx.strokeStyle = '#d8d8d8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, r * 0.15);
      ctx.lineTo(r * 2.0, -r * 0.25);
      ctx.stroke();
      ctx.fillStyle = team.dark;
      ctx.beginPath();
      ctx.ellipse(r * 0.55, r * 0.55, r * 0.55, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#cfd6dd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r * 0.25, r * 0.1);
      ctx.lineTo(r * 1.45, -r * 0.35);
      ctx.stroke();
      ctx.fillStyle = team.dark;
      ctx.beginPath();
      ctx.ellipse(r * 0.1, -r * 0.75, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* 身体 */
    ctx.fillStyle = team.color;
    ctx.strokeStyle = team.dark;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (u.type === 'knight') {
      ctx.ellipse(0, 0, r * 1.05, r * 0.8, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, 0, r * 0.82, r * 0.92, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    /* 肩甲 */
    ctx.fillStyle = team.light;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(-r * 0.5, -r * 0.1, r * 0.3, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.5, -r * 0.1, r * 0.3, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* 头 */
    ctx.fillStyle = '#e4c39a';
    ctx.beginPath();
    ctx.arc(0, -r * 0.5, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = u.type === 'worker' ? '#7a5a3a' : '#b9c0c8';
    ctx.beginPath();
    ctx.arc(0, -r * 0.62, r * 0.5, Math.PI, Math.PI * 2);
    ctx.fill();

    /* 受击闪白 */
    if (u.hitFlash > 0) {
      ctx.globalAlpha = u.hitFlash * 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* 携带资源 */
    if (u.carry > 0) {
      ctx.fillStyle = u.carryType === 'gold' ? '#f0c451' : '#8fbe6a';
      ctx.beginPath();
      ctx.arc(-r * 0.75, r * 0.55, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 血条 */
    if (u.selected || u.hp < u.maxHp) {
      const bw = r * 2.4, bh = 3;
      const pct = Util.clamp(u.hp / u.maxHp, 0, 1);
      const bx = -bw / 2, by = -r * 2.35;
      ctx.fillStyle = 'rgba(8,6,4,0.85)';
      ctx.fillRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
      ctx.fillStyle = pct > 0.66 ? '#5fc46b' : pct > 0.33 ? '#d9b448' : '#cf4b42';
      ctx.fillRect(bx, by, bw * pct, bh);
    }

    ctx.restore();
  }

  /* ---------------- 建筑 ---------------- */
  drawBuilding(b, z) {
    const ctx = this.ctx, T = CONFIG.TILE;
    const x = b.left * T, y = b.top * T, w = b.w * T, h = b.h * T;
    const team = TEAM_DATA[b.team];

    ctx.save();

    /* 影子 */
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.94, w * 0.52, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    if (b.selected) {
      ctx.strokeStyle = b.team === 'player' ? 'rgba(140,235,150,0.85)' : 'rgba(255,140,120,0.85)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x + 1, y + h * 0.72, w - 2, h * 0.26);
    }

    ctx.globalAlpha = b.complete ? 1 : 0.55;
    this.drawBuildingShape(ctx, b, x, y, w, h, team);
    ctx.globalAlpha = 1;

    /* 施工覆盖 */
    if (!b.complete) {
      ctx.save();
      ctx.strokeStyle = 'rgba(230,192,114,0.55)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.restore();

      const pct = Util.clamp(b.progress, 0, 1);
      const bw = w * 0.62, bx = x + (w - bw) / 2, by = y - 5;
      ctx.fillStyle = 'rgba(8,6,4,0.72)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#e6c072';
      ctx.fillRect(bx, by, bw * pct, 3);
    } else if (b.hp < b.maxHp || b.selected) {
      const bw = w * 0.72, bx = x + (w - bw) / 2, by = y - 7;
      const pct = Util.clamp(b.hp / b.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(8,6,4,0.85)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = pct > 0.66 ? '#5fc46b' : pct > 0.33 ? '#d9b448' : '#cf4b42';
      ctx.fillRect(bx, by, bw * pct, 3);
    }

    /* 训练进度 */
    if (b.complete && b.queue.length) {
      const pct = b.getTrainProgress();
      const bw = w * 0.7, bx = x + (w - bw) / 2, by = y + h - 5;
      ctx.fillStyle = 'rgba(8,6,4,0.8)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#7fc4e8';
      ctx.fillRect(bx, by, bw * pct, 3);
    }

    if (b.hitFlash > 0) {
      ctx.globalAlpha = b.hitFlash * 0.35;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  drawBuildingShape(ctx, b, x, y, w, h, team) {
    const cx = x + w / 2;

    switch (b.type) {
      case 'townhall': {
        ctx.fillStyle = '#46403a';
        this.roundRect(ctx, x + w * 0.04, y + h * 0.2, w * 0.92, h * 0.78, 3);
        ctx.fill();

        ctx.fillStyle = '#8a7051';
        ctx.fillRect(x + w * 0.16, y + h * 0.34, w * 0.68, h * 0.5);
        ctx.fillStyle = '#77603f';
        ctx.fillRect(x + w * 0.16, y + h * 0.34, w * 0.68, h * 0.1);

        /* 屋顶 */
        ctx.fillStyle = team.roof;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.08, y + h * 0.36);
        ctx.lineTo(cx, y + h * 0.04);
        ctx.lineTo(x + w * 0.92, y + h * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.moveTo(cx, y + h * 0.04);
        ctx.lineTo(x + w * 0.92, y + h * 0.36);
        ctx.lineTo(x + w * 0.66, y + h * 0.36);
        ctx.closePath();
        ctx.fill();

        /* 塔楼 */
        for (const tx of [x + w * 0.04, x + w * 0.79]) {
          ctx.fillStyle = '#7d6749';
          ctx.fillRect(tx, y + h * 0.4, w * 0.17, h * 0.44);
          ctx.fillStyle = team.roof;
          ctx.beginPath();
          ctx.moveTo(tx - w * 0.02, y + h * 0.41);
          ctx.lineTo(tx + w * 0.085, y + h * 0.22);
          ctx.lineTo(tx + w * 0.19, y + h * 0.41);
          ctx.closePath();
          ctx.fill();
        }

        /* 门与窗 */
        ctx.fillStyle = '#241a11';
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.07, y + h * 0.84);
        ctx.lineTo(cx - w * 0.07, y + h * 0.68);
        ctx.arc(cx, y + h * 0.68, w * 0.07, Math.PI, 0);
        ctx.lineTo(cx + w * 0.07, y + h * 0.84);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,205,120,0.75)';
        ctx.fillRect(x + w * 0.3, y + h * 0.56, w * 0.07, h * 0.08);
        ctx.fillRect(x + w * 0.63, y + h * 0.56, w * 0.07, h * 0.08);

        /* 旗帜 */
        ctx.strokeStyle = '#3a2c1c';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx, y + h * 0.04);
        ctx.lineTo(cx, y - h * 0.06);
        ctx.stroke();
        ctx.fillStyle = team.color;
        ctx.beginPath();
        ctx.moveTo(cx, y - h * 0.06);
        ctx.lineTo(cx + w * 0.13, y - h * 0.02);
        ctx.lineTo(cx, y + h * 0.03);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'barracks': {
        ctx.fillStyle = '#4a4238';
        this.roundRect(ctx, x + w * 0.05, y + h * 0.24, w * 0.9, h * 0.72, 3);
        ctx.fill();

        ctx.fillStyle = '#7e6748';
        ctx.fillRect(x + w * 0.12, y + h * 0.4, w * 0.76, h * 0.44);

        ctx.fillStyle = team.roof;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.04, y + h * 0.42);
        ctx.lineTo(x + w * 0.24, y + h * 0.12);
        ctx.lineTo(x + w * 0.76, y + h * 0.12);
        ctx.lineTo(x + w * 0.96, y + h * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x + w * 0.24, y + h * 0.12, w * 0.52, h * 0.05);

        ctx.fillStyle = '#241a11';
        ctx.fillRect(cx - w * 0.1, y + h * 0.58, w * 0.2, h * 0.26);

        /* 交叉武器 */
        ctx.strokeStyle = '#cfd6dd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.34, y + h * 0.28);
        ctx.lineTo(x + w * 0.46, y + h * 0.18);
        ctx.moveTo(x + w * 0.46, y + h * 0.28);
        ctx.lineTo(x + w * 0.34, y + h * 0.18);
        ctx.stroke();

        ctx.fillStyle = team.color;
        ctx.fillRect(x + w * 0.7, y + h * 0.2, w * 0.06, h * 0.22);
        break;
      }

      case 'farm': {
        /* 田地 */
        ctx.fillStyle = '#7d6a45';
        this.roundRect(ctx, x + w * 0.06, y + h * 0.3, w * 0.88, h * 0.64, 3);
        ctx.fill();
        ctx.fillStyle = '#8d7950';
        this.roundRect(ctx, x + w * 0.09, y + h * 0.33, w * 0.5, h * 0.58, 2);
        ctx.fill();

        /* 田垄 */
        ctx.strokeStyle = 'rgba(126,168,74,0.85)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.11, y + h * 0.38 + i * h * 0.13);
          ctx.lineTo(x + w * 0.57, y + h * 0.38 + i * h * 0.13);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(70,96,42,0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.11, y + h * 0.405 + i * h * 0.13);
          ctx.lineTo(x + w * 0.57, y + h * 0.405 + i * h * 0.13);
          ctx.stroke();
        }

        /* 小屋 */
        ctx.fillStyle = '#a08757';
        ctx.fillRect(x + w * 0.62, y + h * 0.3, w * 0.28, h * 0.3);
        ctx.fillStyle = team.roof;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.57, y + h * 0.32);
        ctx.lineTo(x + w * 0.76, y + h * 0.1);
        ctx.lineTo(x + w * 0.95, y + h * 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(x + w * 0.7, y + h * 0.44, w * 0.1, h * 0.16);

        /* 麦垛 */
        ctx.fillStyle = '#caa94f';
        ctx.beginPath();
        ctx.arc(x + w * 0.7, y + h * 0.78, w * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b8943f';
        ctx.beginPath();
        ctx.arc(x + w * 0.7, y + h * 0.78, w * 0.04, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'tower': {
        ctx.fillStyle = '#4c4a42';
        this.roundRect(ctx, x + w * 0.1, y + h * 0.34, w * 0.8, h * 0.62, 3);
        ctx.fill();

        ctx.fillStyle = '#8a836f';
        ctx.beginPath();
        ctx.arc(cx, y + h * 0.52, w * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#6f6a5a';
        ctx.fillRect(x + w * 0.16, y + h * 0.44, w * 0.68, h * 0.16);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = '#7f7a68';
          ctx.fillRect(x + w * 0.16 + i * w * 0.18, y + h * 0.38, w * 0.1, h * 0.1);
        }

        ctx.fillStyle = team.roof;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.1, y + h * 0.38);
        ctx.lineTo(cx, y + h * 0.04);
        ctx.lineTo(x + w * 0.9, y + h * 0.38);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,225,160,0.85)';
        ctx.fillRect(cx - w * 0.04, y + h * 0.52, w * 0.08, h * 0.08);
        break;
      }

      case 'goldmine': {
        ctx.fillStyle = '#5a5145';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.06, y + h * 0.86);
        ctx.lineTo(x + w * 0.2, y + h * 0.4);
        ctx.lineTo(x + w * 0.42, y + h * 0.2);
        ctx.lineTo(x + w * 0.7, y + h * 0.24);
        ctx.lineTo(x + w * 0.92, y + h * 0.55);
        ctx.lineTo(x + w * 0.88, y + h * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#6d6353';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y + h * 0.4);
        ctx.lineTo(x + w * 0.42, y + h * 0.2);
        ctx.lineTo(x + w * 0.5, y + h * 0.46);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#16120e';
        ctx.beginPath();
        ctx.ellipse(cx, y + h * 0.68, w * 0.16, h * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          ctx.fillStyle = 'rgba(240,196,81,0.9)';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * w * 0.26, y + h * 0.55 + Math.sin(a) * h * 0.16, w * 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default: {
        ctx.fillStyle = '#6b5b45';
        this.roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 3);
        ctx.fill();
      }
    }
  }

  /* ---------------- 资源 ---------------- */
  drawResource(r) {
    const ctx = this.ctx, T = CONFIG.TILE;
    const px = r.x * T, py = r.y * T;

    if (r.type === 'tree') {
      const spr = this.treeSprites[Math.floor(r.seed) % this.treeSprites.length];
      const scale = 0.95 + ((Math.floor(r.seed * 7) % 10) / 40);
      const w = spr.width * scale, h = spr.height * scale;
      ctx.drawImage(spr, px - w / 2, py - h + T * 0.62, w, h);

      if (r.selected) {
        ctx.strokeStyle = 'rgba(150,235,150,0.8)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(px, py + T * 0.3, T * 0.5, T * 0.26, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    /* 金矿 */
    const fake = {
      type: 'goldmine', left: r.left, top: r.top, w: r.w, h: r.h,
      x: r.x, y: r.y, complete: true, selected: r.selected, team: 'neutral',
      hitFlash: 0, queue: [],
    };
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py + r.h * T * 0.42, r.w * T * 0.5, r.h * T * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawBuildingShape(ctx, fake, r.left * T, r.top * T, r.w * T, r.h * T, TEAM_DATA.neutral);

    if (r.selected) {
      ctx.strokeStyle = 'rgba(150,235,150,0.85)';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(r.left * T + 2, r.top * T + 2, r.w * T - 4, r.h * T - 4);
    }
    const pct = Util.clamp(r.amount / r.maxAmount, 0, 1);
    if (pct < 0.6 || r.selected) {
      const bw = r.w * T * 0.6, bx = r.x * T - bw / 2, by = r.top * T - 6;
      ctx.fillStyle = 'rgba(8,6,4,0.8)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#f0c451';
      ctx.fillRect(bx, by, bw * pct, 3);
    }
  }

  /* ---------------- 投射物 / 粒子 ---------------- */
  drawProjectiles() {
    const ctx = this.ctx, T = CONFIG.TILE;
    for (const p of this.game.projectiles) {
      const px = p.x * T, py = p.y * T;
      if (p.kind === 'arrow') {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.angle);
        ctx.strokeStyle = '#d9cba6';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(5, 0);
        ctx.stroke();
        ctx.fillStyle = '#b9c0c8';
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(2, -2);
        ctx.lineTo(2, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(160,210,255,0.95)';
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,210,255,0.25)';
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawParticles() {
    const ctx = this.ctx, T = CONFIG.TILE;
    for (const p of this.game.particles) {
      const a = Util.clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * T, p.y * T, Math.max(0.6, p.size * (0.6 + a * 0.7)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters() {
    const ctx = this.ctx, T = CONFIG.TILE;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
    for (const f of this.game.floaters) {
      const a = Util.clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.text, f.x * T + 1, f.y * T + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * T, f.y * T);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  drawRally(b) {
    const ctx = this.ctx, T = CONFIG.TILE;
    const x0 = b.x * T, y0 = (b.top + b.h) * T;
    const x1 = b.rally.x * T, y1 = b.rally.y * T;
    ctx.save();
    ctx.strokeStyle = 'rgba(140,220,140,0.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(140,220,140,0.9)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + 10, y1 + 3);
    ctx.lineTo(x1, y1 + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawGhost(pl) {
    const ctx = this.ctx, T = CONFIG.TILE, g = this.game;
    const def = BUILDING_TYPES[pl.type];
    if (!def) return;
    const x = pl.tx * T, y = pl.ty * T, w = def.w * T, h = def.h * T;
    const ok = pl.valid;

    ctx.save();
    ctx.globalAlpha = 0.45;
    const fake = {
      type: pl.type, left: pl.tx, top: pl.ty, w: def.w, h: def.h,
      x: pl.tx + def.w / 2, y: pl.ty + def.h / 2, complete: true, selected: false,
      team: 'player', hitFlash: 0, queue: [],
    };
    this.drawBuildingShape(ctx, fake, x, y, w, h, TEAM_DATA.player);
    ctx.globalAlpha = 1;

    ctx.fillStyle = ok ? 'rgba(90,200,110,0.18)' : 'rgba(210,70,60,0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ok ? 'rgba(120,230,140,0.9)' : 'rgba(240,90,80,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    /* 网格 */
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < def.w; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * T, y);
      ctx.lineTo(x + i * T, y + h);
      ctx.stroke();
    }
    for (let i = 1; i < def.h; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + i * T);
      ctx.lineTo(x + w, y + i * T);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAimPoint(p) {
    const ctx = this.ctx, T = CONFIG.TILE;
    const x = p.x * T, y = p.y * T;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,90,80,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, T * 0.6, T * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 小地图 ---------------- */
  drawMinimap(ctx, size) {
    const g = this.game, world = g.world;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;

    if (this.terrain) ctx.drawImage(this.terrain, 0, 0, size, size);

    const sx = size / world.w, sy = size / world.h;

    /* 资源 */
    for (const r of g.resources) {
      if (!g.entityVisible(r)) continue;
      if (r.type === 'tree') {
        ctx.fillStyle = 'rgba(40,70,35,0.9)';
        ctx.fillRect(r.x * sx - 0.5, r.y * sy - 0.5, 1.8, 1.8);
      } else {
        ctx.fillStyle = '#e6c072';
        ctx.fillRect(r.left * sx, r.top * sy, r.w * sx, r.h * sy);
      }
    }

    /* 建筑 */
    for (const b of g.buildings) {
      if (!g.entityVisible(b)) continue;
      const c = TEAM_DATA[b.team].color;
      ctx.fillStyle = c;
      ctx.fillRect(b.left * sx, b.top * sy, Math.max(3, b.w * sx), Math.max(3, b.h * sy));
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.left * sx, b.top * sy, Math.max(3, b.w * sx), Math.max(3, b.h * sy));
    }

    /* 单位 */
    for (const u of g.units) {
      if (!g.entityVisible(u)) continue;
      ctx.fillStyle = TEAM_DATA[u.team].ui;
      const s = u.type === 'knight' ? 3 : 2;
      ctx.fillRect(u.x * sx - s / 2, u.y * sy - s / 2, s, s);
    }

    /* 迷雾 */
    if (CONFIG.FOG) {
      if (this.fogDrawn !== g.fogVersion) this.updateFogCanvas();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.fogCanvas, 0, 0, size, size);
      ctx.globalAlpha = 1;
    }

    /* 视野框 */
    const v = this.viewTiles();
    const rx = (this.cam.x - v.w / 2) * sx;
    const ry = (this.cam.y - v.h / 2) * sy;
    ctx.strokeStyle = 'rgba(240,225,180,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, v.w * sx, v.h * sy);
  }

  /* ---------------- 工具 ---------------- */
  roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }
}

globalThis.Renderer = Renderer;
