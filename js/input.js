'use strict';

/* ============================================================
   输入：选择、命令、建造放置、镜头控制
   ============================================================ */

class InputHandler {
  constructor(canvas, game, renderer, ui) {
    this.canvas = canvas;
    this.game = game;
    this.renderer = renderer;
    this.ui = ui;

    this.mouse = { x: 0, y: 0, over: false };
    this.world = { x: 0, y: 0 };
    this.keys = new Set();

    this.box = null;
    this.dragStart = null;
    this.panning = null;
    this.placing = null;
    this.aimMode = false;
    this.aimPoint = null;

    this.lastClick = { time: 0, entity: null };

    this.bind();
  }

  /* ---------------- 事件绑定 ---------------- */
  bind() {
    const cvs = this.canvas;

    cvs.addEventListener('contextmenu', e => e.preventDefault());

    cvs.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    cvs.addEventListener('mouseleave', () => { this.mouse.over = false; });
    cvs.addEventListener('mouseenter', () => { this.mouse.over = true; });

    cvs.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.renderer.zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.panning = null; this.dragStart = null; this.box = null; });
  }

  updateMouse(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.over = e.clientX >= 0 && e.clientY >= 0 &&
      e.clientX <= window.innerWidth && e.clientY <= window.innerHeight;
    const w = this.renderer.screenToWorld(e.clientX, e.clientY);
    this.world.x = w.x;
    this.world.y = w.y;
  }

  /* ---------------- 鼠标 ---------------- */
  onMouseDown(e) {
    if (!this.game.started || this.game.over) return;
    this.updateMouse(e);

    if (e.button === 1) {
      e.preventDefault();
      this.panning = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 2) {
      this.onRightClick();
      return;
    }
    if (e.button !== 0) return;

    if (this.placing) { this.confirmPlace(); return; }
    if (this.aimMode) { this.confirmAim(); return; }

    this.dragStart = { x: e.clientX, y: e.clientY, add: e.shiftKey };
    this.box = null;
    this.hideTooltip();
  }

  onMouseMove(e) {
    this.updateMouse(e);

    if (this.panning) {
      const z = this.renderer.cam.zoom, T = CONFIG.TILE;
      const dx = (e.clientX - this.panning.x) / (z * T);
      const dy = (e.clientY - this.panning.y) / (z * T);
      this.renderer.panBy(-dx, -dy);
      this.panning = { x: e.clientX, y: e.clientY };
    }

    if (this.dragStart) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      if (Math.hypot(dx, dy) > CONFIG.SELECT_DRAG_MIN) {
        this.box = {
          x0: this.dragStart.x, y0: this.dragStart.y,
          x1: e.clientX, y1: e.clientY,
        };
      }
    }

    if (this.placing) this.updatePlacement();
    if (this.aimMode) this.aimPoint = { x: this.world.x, y: this.world.y };
  }

  onMouseUp(e) {
    if (e.button === 1) { this.panning = null; return; }
    if (e.button !== 0) return;
    if (!this.dragStart) return;

    if (this.box) this.finishBox(this.dragStart.add);
    else this.clickSelect(e.shiftKey);

    this.dragStart = null;
    this.box = null;
  }

  onRightClick() {
    if (this.placing || this.aimMode) { this.cancelModes(); return; }
    if (this.game.over) return;
    this.game.contextCommand(this.world.x, this.world.y);
    this.ui.refresh(true);
  }

  /** 小地图右键 */
  contextAt(x, y) {
    if (!this.game.started || this.game.over) return;
    this.game.contextCommand(x, y);
    this.ui.refresh(true);
  }

  clickSelect(additive) {
    const g = this.game;
    const ent = g.pickEntity(this.world.x, this.world.y);
    const now = performance.now();

    if (!ent) {
      if (!additive) g.clearSelection();
      this.ui.refresh(true);
      return;
    }

    const isDouble = this.lastClick.entity === ent && (now - this.lastClick.time) < 360;
    this.lastClick = { time: now, entity: ent };

    if (isDouble && ent.kind === 'unit' && ent.team === 'player') {
      this.selectSameTypeOnScreen(ent);
    } else if (additive && ent.kind === 'unit' && ent.team === 'player') {
      if (g.selection.indexOf(ent) >= 0) {
        g.removeFromSelection(ent);
      } else {
        g.addToSelection([ent]);
      }
    } else {
      g.setSelection([ent]);
    }
    this.ui.refresh(true);
  }

  selectSameTypeOnScreen(ref) {
    const g = this.game;
    const v = { x0: 0, y0: 44, x1: window.innerWidth, y1: window.innerHeight - 156 };
    const picked = [];
    for (const u of g.units) {
      if (u.team !== 'player' || u.type !== ref.type || u.dead) continue;
      const s = this.renderer.worldToScreen(u.x, u.y);
      if (s.x >= v.x0 && s.x <= v.x1 && s.y >= v.y0 && s.y <= v.y1) picked.push(u);
    }
    if (picked.length) g.setSelection(picked);
  }

  finishBox(additive) {
    const g = this.game;
    const b = this.box;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);

    const picked = [];
    for (const u of g.units) {
      if (u.team !== 'player' || u.dead) continue;
      const s = this.renderer.worldToScreen(u.x, u.y);
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) picked.push(u);
    }

    if (picked.length) {
      if (additive) g.addToSelection(picked);
      else g.setSelection(picked);
    } else if (!additive) {
      g.clearSelection();
    }
    this.ui.refresh(true);
  }

  /* ---------------- 建造 / 攻击移动 ---------------- */
  beginPlace(type) {
    const def = BUILDING_TYPES[type];
    if (!def) return;
    this.placing = { type, tx: 0, ty: 0, valid: false };
    this.aimMode = false;
    this.aimPoint = null;
    this.canvas.style.cursor = 'crosshair';
    this.updatePlacement();
  }

  updatePlacement() {
    if (!this.placing) return;
    const def = BUILDING_TYPES[this.placing.type];
    const tx = Math.round(this.world.x - def.w / 2);
    const ty = Math.round(this.world.y - def.h / 2);
    this.placing.tx = tx;
    this.placing.ty = ty;
    this.placing.valid = this.game.canPlace(this.placing.type, tx, ty).ok &&
      this.game.canAfford('player', def.cost);
  }

  confirmPlace() {
    const p = this.placing;
    if (!p) return;
    const def = BUILDING_TYPES[p.type];

    const workers = this.game.selection.filter(e => e.kind === 'unit' && e.isWorker && e.team === 'player');
    if (!workers.length) {
      this.ui.pushLog('需要选中农民才能建造', 'warn');
      this.cancelModes();
      return;
    }

    const res = this.game.startConstruction('player', p.type, p.tx, p.ty, workers);
    if (!res.ok) {
      this.ui.pushLog(res.reason, 'warn');
      this.ui.pushLog(`按 Esc 取消建造 ${def.name}`, 'info');
      return;
    }
    this.cancelModes();
    this.ui.refresh(true);
  }

  beginAim() {
    const units = this.game.selection.filter(e => e.team === 'player' && e.kind === 'unit');
    if (!units.length) return;
    this.placing = null;
    this.aimMode = true;
    this.aimPoint = { x: this.world.x, y: this.world.y };
    this.canvas.style.cursor = 'crosshair';
  }

  confirmAim() {
    const units = this.game.selection.filter(e => e.team === 'player' && e.kind === 'unit');
    if (units.length) {
      this.game.commandAttackMove(units, this.world.x, this.world.y);
    }
    this.cancelModes();
    this.ui.refresh(true);
  }

  cancelModes() {
    this.placing = null;
    this.aimMode = false;
    this.aimPoint = null;
    this.canvas.style.cursor = 'default';
  }

  /* ---------------- 键盘 ---------------- */
  onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (k === 'escape') {
      e.preventDefault();
      if (this.placing || this.aimMode) this.cancelModes();
      else if (this.ui.buildMenuOpen) { this.ui.buildMenuOpen = false; this.ui.refresh(true); }
      else this.game.clearSelection();
      return;
    }

    if (!this.game.started || this.game.over) return;

    if (k === ' ') {
      e.preventDefault();
      const th = this.game.buildings.find(b => b.team === 'player' && b.type === 'townhall' && !b.dead);
      if (th) this.renderer.centerOn(th.x, th.y);
      return;
    }

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
      this.keys.add(k);
      return;
    }

    if (k === 'p') {
      e.preventDefault();
      this.ui.el.btnPause.click();
      return;
    }

    if (k === 'a') {
      if (this.game.selection.some(s => s.team === 'player' && s.kind === 'unit')) {
        this.beginAim();
        this.ui.refresh(true);
      }
      return;
    }

    if (k === 's') {
      const units = this.game.selection.filter(s => s.team === 'player' && s.kind === 'unit');
      if (units.length) {
        this.game.commandStop(units);
        this.ui.refresh(true);
      }
      return;
    }

    /* 命令卡快捷键 */
    if (/^[a-z0-9]$/.test(k)) {
      if (this.ui.hotkey(k.toUpperCase())) e.preventDefault();
    }
  }

  hideTooltip() { this.ui.hideTooltip(); }

  /* ---------------- 每帧 ---------------- */
  update(dt) {
    if (!this.game.started) return;

    /* 方向键 */
    let dx = 0, dy = 0;
    if (this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('arrowdown')) dy += 1;

    /* 鼠标贴边（指针在 HUD 上时不滚动） */
    if (this.mouse.over && !this.dragStart && !this.panning) {
      const el = document.elementFromPoint(this.mouse.x, this.mouse.y);
      const overCanvas = el && el.id === 'gameCanvas';
      if (overCanvas) {
        const m = 14;
        if (this.mouse.x < m) dx -= 1;
        else if (this.mouse.x > window.innerWidth - m) dx += 1;
        if (this.mouse.y < m) dy -= 1;
        else if (this.mouse.y > window.innerHeight - m) dy += 1;
      }
    }

    if (dx || dy) {
      const speed = CONFIG.CAM_SPEED * dt / Math.max(0.6, this.renderer.cam.zoom);
      const len = Math.hypot(dx, dy) || 1;
      this.renderer.panBy((dx / len) * speed, (dy / len) * speed);
    }

    if (this.placing) this.updatePlacement();
    if (this.aimMode) this.aimPoint = { x: this.world.x, y: this.world.y };
  }
}

globalThis.InputHandler = InputHandler;
