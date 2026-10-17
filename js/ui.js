'use strict';

/* ============================================================
   界面：资源栏、选择面板、命令卡、小地图、消息、结算
   ============================================================ */

class UI {
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.input = null;

    const $ = id => document.getElementById(id);
    this.el = {
      resGold: $('resGold'),
      resLumber: $('resLumber'),
      resFood: $('resFood'),
      clock: $('clock'),
      log: $('log'),
      portrait: $('portrait'),
      selName: $('selName'),
      selSub: $('selSub'),
      selBar: $('selBar'),
      selBarFill: document.querySelector('#selBar i'),
      cmdGrid: $('cmdGrid'),
      cmdTitle: $('cmdTitle'),
      cmdHint: $('cmdHint'),
      minimap: $('minimap'),
      tooltip: $('tooltip'),
      overlay: $('overlay'),
      endOverlay: $('endOverlay'),
      endTitle: $('endTitle'),
      endText: $('endText'),
      btnStart: $('btnStart'),
      btnRestart: $('btnRestart'),
      btnPause: $('btnPause'),
    };

    this.mmCtx = this.el.minimap.getContext('2d');
    this.mmSize = 160;
    this.mmDragging = false;
    this.buildMenuOpen = false;
    this.panelSig = '';
    this.currentPanel = { title: '', hint: '', cmds: [] };
    this.cmdEls = {};
    this.endShown = false;
    this.stateTimer = 0;
    this.helpShown = false;

    this.bind();
    this.resizeMinimap();
    this.refresh(true);
    this.updateSelectionInfo();
  }

  attachInput(input) { this.input = input; }

  /* ---------------- 事件 ---------------- */
  bind() {
    this.el.btnStart.addEventListener('click', () => this.startGame());
    this.el.btnRestart.addEventListener('click', () => window.location.reload());
    this.el.btnPause.addEventListener('click', () => {
      if (!this.game.started || this.game.over) return;
      this.game.paused = !this.game.paused;
      this.el.btnPause.textContent = this.game.paused ? '继续' : '暂停';
      this.pushLog(this.game.paused ? '游戏已暂停' : '继续战斗', 'info');
    });

    /* 命令按钮 */
    this.el.cmdGrid.addEventListener('click', (e) => {
      const el = e.target.closest('.cmd');
      if (!el) return;
      const cmd = this.currentPanel.cmds.find(c => c.id === el.dataset.cmd);
      if (!cmd) return;
      if (!cmd.enabled) { this.pushLog(cmd.reason || '暂时无法执行', 'warn'); return; }
      cmd.action();
    });

    /* 悬停提示 */
    this.el.cmdGrid.addEventListener('mousemove', (e) => {
      const el = e.target.closest('.cmd');
      if (!el) { this.hideTooltip(); return; }
      const cmd = this.currentPanel.cmds.find(c => c.id === el.dataset.cmd);
      if (!cmd) return;
      this.showTooltip(cmd, e.clientX, e.clientY);
    });
    this.el.cmdGrid.addEventListener('mouseleave', () => this.hideTooltip());

    /* 小地图 */
    const mm = this.el.minimap;
    mm.addEventListener('contextmenu', e => e.preventDefault());
    mm.addEventListener('mousedown', (e) => {
      if (!this.game.started) return;
      e.preventDefault();
      const p = this.minimapToWorld(e);
      if (e.button === 0) {
        this.mmDragging = true;
        this.renderer.centerOn(p.x, p.y);
      } else if (e.button === 2) {
        this.renderer.centerOn(p.x, p.y);
        if (this.input) this.input.contextAt(p.x, p.y);
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.mmDragging) return;
      const p = this.minimapToWorld(e);
      this.renderer.centerOn(p.x, p.y);
    });
    window.addEventListener('mouseup', () => { this.mmDragging = false; });
    window.addEventListener('resize', () => this.resizeMinimap());
  }

  minimapToWorld(e) {
    const r = this.el.minimap.getBoundingClientRect();
    const x = Util.clamp((e.clientX - r.left) / r.width, 0, 1) * this.game.world.w;
    const y = Util.clamp((e.clientY - r.top) / r.height, 0, 1) * this.game.world.h;
    return { x, y };
  }

  resizeMinimap() {
    const rect = this.el.minimap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(80, rect.width || 160);
    this.mmSize = size;
    this.el.minimap.width = Math.round(size * dpr);
    this.el.minimap.height = Math.round(size * dpr);
    this.mmCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------- 开局 / 结算 ---------------- */
  startGame() {
    this.game.started = true;
    this.el.overlay.classList.add('hidden');
    this.renderer.centerOn(this.game.playerBase.x, this.game.playerBase.y);
    this.refresh(true);
    this.pushLog('战斗开始。右键点击金矿或树木，让农民开始采集。', 'good');
    setTimeout(() => this.pushLog('按 B 打开建造菜单：先造农场补人口，再造兵营出兵。', 'info'), 900);
    setTimeout(() => this.pushLog('按 A 再点地面可攻击移动；空格键快速回到基地。', 'info'), 2200);
  }

  showEnd() {
    if (this.endShown || !this.game.over) return;
    this.endShown = true;
    const win = this.game.over.result === 'victory';
    this.el.endTitle.textContent = win ? '胜 利' : '战 败';
    this.el.endTitle.style.color = win ? '#e6c072' : '#cf5b50';
    this.el.endText.textContent = win
      ? `敌方城镇大厅化为废墟。用时 ${Util.formatTime(this.game.time)}。`
      : `你的城镇大厅被摧毁了。坚守了 ${Util.formatTime(this.game.time)}。`;
    this.el.endOverlay.classList.remove('hidden');
  }

  /* ---------------- 每帧 ---------------- */
  tick(dt) {
    const g = this.game;

    /* 顶部资源 */
    const r = g.res.player;
    this.el.resGold.textContent = Math.floor(r.gold);
    this.el.resLumber.textContent = Math.floor(r.lumber);
    const used = g.popUsed('player');
    const cap = g.popCap('player');
    this.el.resFood.textContent = used + '/' + cap;
    this.el.resFood.parentElement.style.color =
      used >= cap ? '#e07a6a' : (used >= cap - 3 ? '#e0b96a' : '');

    this.el.clock.textContent = Util.formatTime(g.time);

    /* 命令面板 */
    const panel = this.computePanel();
    const sig = panel.title + '|' + panel.cmds.map(c => c.id).join(',');
    if (sig !== this.panelSig) {
      this.currentPanel = panel;
      this.renderCommands(panel);
      this.panelSig = sig;
    } else {
      this.currentPanel = panel;
      this.syncStates(panel);
      this.el.cmdTitle.textContent = panel.title;
      this.el.cmdHint.textContent = panel.hint || '';
    }

    /* 选择信息 */
    this.updateSelectionInfo();

    /* 小地图 */
    this.renderer.drawMinimap(this.mmCtx, this.mmSize);

    /* 结束 */
    if (g.over) {
      this.showEnd();
      this.el.btnPause.textContent = '暂停';
    }
  }

  refresh(force) {
    this.panelSig = '';
    if (force) this.updateSelectionInfo();
  }

  /* ---------------- 命令面板 ---------------- */
  computePanel() {
    const g = this.game;
    const sel = g.selection;
    const cmds = [];
    let title = '命令', hint = '';

    const units = sel.filter(e => e.kind === 'unit');
    const buildings = sel.filter(e => e.kind === 'building');
    const ownUnits = units.filter(u => u.team === 'player');
    const ownBuildings = buildings.filter(b => b.team === 'player');

    if (sel.length === 0) {
      hint = '左键框选单位 · 右键下达命令';
      return { title: '命令', hint, cmds };
    }

    if (sel.length === 1 && sel[0].kind === 'building') {
      const b = sel[0];
      title = b.def.name;
      if (b.team === 'player' && b.complete && b.def.trains.length) {
        for (const t of b.def.trains) cmds.push(this.makeTrainCmd(b, t));
        hint = '右键地面设置集结点';
      } else if (!b.complete) {
        hint = '建造中：派农民靠近可加速施工';
      } else if (b.def.attack) {
        hint = '自动攻击射程内的敌方单位';
      } else if (b.team !== 'player') {
        hint = '敌方建筑';
      }
      return { title, hint, cmds };
    }

    if (sel.length === 1 && sel[0].kind === 'resource') {
      const r = sel[0];
      return {
        title: r.type === 'tree' ? '树木' : '金矿',
        hint: '右键派遣农民前来采集',
        cmds,
      };
    }

    if (ownUnits.length) {
      title = ownUnits.length === 1 ? ownUnits[0].def.name : ownUnits.length + ' 个单位';
      const workers = ownUnits.filter(u => u.isWorker);

      if (workers.length) {
        if (this.buildMenuOpen) {
          for (const t of BUILD_MENU) cmds.push(this.makeBuildCmd(t));
        } else {
          cmds.push({
            id: 'menu-build', key: 'B', icon: '🏗️', name: '建造',
            desc: '建造农场（人口）、兵营（出兵）或防御塔。',
            enabled: true, action: () => { this.buildMenuOpen = true; this.refresh(true); },
          });
        }
      }

      cmds.push({
        id: 'attack-move', key: 'A', icon: '⚔', name: '攻击移动',
        desc: '移动到目标点，途中自动攻击发现的敌人。',
        enabled: true,
        action: () => { if (this.input) this.input.beginAim(); },
      });
      cmds.push({
        id: 'stop', key: 'S', icon: '✋', name: '停止',
        desc: '立即停止当前动作。',
        enabled: true,
        action: () => { g.commandStop(ownUnits); this.refresh(true); },
      });

      if (workers.length) hint = '右键金矿 / 树木采集，或点击地面移动';
      return { title, hint, cmds };
    }

    if (units.length) {
      title = (units[0].team === 'enemy' ? '敌方 ' : '') + units[0].def.name;
      hint = '按 Esc 取消选择';
      return { title, hint, cmds };
    }

    return { title, hint, cmds };
  }

  makeTrainCmd(b, type) {
    const g = this.game;
    const def = UNIT_TYPES[type];
    let reason = null;
    if (!b.complete) reason = '建筑尚未建成';
    else if (b.queue.length >= CONFIG.BUILD_QUEUE_MAX) reason = '训练队列已满';
    else if (!g.canAfford('player', def.cost)) reason = '资源不足';
    else if (g.popUsed('player') + def.food > g.popCap('player')) reason = '人口已满，请建造农场';

    return {
      id: 'train:' + type, key: def.hotkey, icon: def.icon, name: def.name,
      cost: def.cost, desc: def.desc, enabled: !reason, reason,
      action: () => {
        const res = g.tryQueueUnit(b, type);
        if (!res.ok) this.pushLog(res.reason, 'warn');
        else this.pushLog('开始训练：' + def.name, 'good');
        this.refresh(true);
      },
    };
  }

  makeBuildCmd(type) {
    const g = this.game;
    const def = BUILDING_TYPES[type];
    let reason = null;
    if (!g.canAfford('player', def.cost)) reason = '资源不足';

    const names = { farm: '农场', barracks: '兵营', tower: '防御塔' };
    const icons = { farm: '🌾', barracks: '⚔️', tower: '🗼' };
    const keys = { farm: 'Q', barracks: 'W', tower: 'E' };

    return {
      id: 'build:' + type, key: keys[type], icon: icons[type], name: names[type],
      cost: def.cost, desc: def.desc, enabled: !reason, reason,
      action: () => {
        if (this.input) this.input.beginPlace(type);
        this.buildMenuOpen = false;
        this.refresh(true);
      },
    };
  }

  renderCommands(panel) {
    this.el.cmdTitle.textContent = panel.title;
    this.el.cmdHint.textContent = panel.hint || '';
    this.el.cmdGrid.innerHTML = '';
    this.cmdEls = {};

    for (const cmd of panel.cmds) {
      const el = document.createElement('div');
      el.className = 'cmd' + (cmd.enabled ? '' : ' disabled');
      el.dataset.cmd = cmd.id;
      el.dataset.key = cmd.key;

      const costTxt = cmd.cost ? Util.costText(cmd.cost) : '';
      el.innerHTML =
        `<span class="key">${cmd.key}</span>` +
        `<span class="ic">${cmd.icon}</span>` +
        `<span class="nm">${cmd.name}</span>` +
        (costTxt ? `<span class="cost">${costTxt}</span>` : '<span class="cost"></span>');

      this.cmdEls[cmd.id] = el;
      this.el.cmdGrid.appendChild(el);
    }
  }

  syncStates(panel) {
    for (const cmd of panel.cmds) {
      const el = this.cmdEls[cmd.id];
      if (!el) continue;
      const dis = !cmd.enabled;
      if (el.classList.contains('disabled') !== dis) {
        el.classList.toggle('disabled', dis);
      }
      el.dataset.reason = cmd.reason || '';
    }
  }

  showTooltip(cmd, x, y) {
    const tt = this.el.tooltip;
    const cost = cmd.cost ? Util.costText(cmd.cost) : '';
    tt.innerHTML =
      `<div class="tt-name">${cmd.name} <span style="color:#8a8070;font-size:11px">[${cmd.key}]</span></div>` +
      `<div>${cmd.desc || ''}</div>` +
      (cost ? `<div class="tt-cost">消耗 ${cost}</div>` : '') +
      (cmd.reason ? `<div class="tt-reason">${cmd.reason}</div>` : '');
    tt.classList.add('on');
    const rect = tt.getBoundingClientRect();
    let px = x + 16, py = y - rect.height - 12;
    if (px + rect.width > window.innerWidth - 8) px = x - rect.width - 16;
    if (py < 8) py = y + 20;
    tt.style.left = px + 'px';
    tt.style.top = py + 'px';
  }

  hideTooltip() { this.el.tooltip.classList.remove('on'); }

  hotkey(key) {
    const cmd = this.currentPanel.cmds.find(c => c.key === key);
    if (!cmd) return false;
    if (!cmd.enabled) { this.pushLog(cmd.reason || '暂时无法执行', 'warn'); return true; }
    cmd.action();
    return true;
  }

  /* ---------------- 选择信息 ---------------- */
  updateSelectionInfo() {
    const g = this.game;
    const sel = g.selection;
    const bar = this.el.selBar;
    const fill = this.el.selBarFill;

    if (!sel.length) {
      this.el.portrait.textContent = '❔';
      this.el.selName.textContent = '未选择';
      this.el.selSub.textContent = '左键框选单位，右键下达命令';
      bar.style.display = 'none';
      return;
    }

    if (sel.length === 1) {
      const e = sel[0];
      let icon = '❔', name = '', sub = '', pct = -1;

      if (e.kind === 'unit') {
        icon = e.def.icon;
        name = e.def.name;
        sub = `${TEAM_DATA[e.team].name} · ${e.def.role}\n生命 ${Math.ceil(e.hp)}/${e.maxHp} · ${this.describeOrder(e)}`;
        pct = e.hp / e.maxHp;
      } else if (e.kind === 'building') {
        icon = e.def.icon;
        name = e.def.name + (e.complete ? '' : '（建造中）');
        if (!e.complete) {
          sub = `生命 ${Math.ceil(e.hp)}/${e.maxHp} · 进度 ${Math.floor(e.progress * 100)}%`;
          pct = e.progress;
        } else if (e.queue.length) {
          const q = e.queue[0];
          const ud = UNIT_TYPES[q.type];
          sub = `生命 ${Math.ceil(e.hp)}/${e.maxHp}\n训练中：${ud.name} ${Math.floor(q.progress / ud.trainTime * 100)}%`;
          pct = q.progress / ud.trainTime;
        } else {
          sub = `生命 ${Math.ceil(e.hp)}/${e.maxHp} · 待命`;
          pct = e.hp / e.maxHp;
        }
      } else if (e.kind === 'resource') {
        icon = e.type === 'tree' ? '🌲' : '💰';
        name = e.type === 'tree' ? '树木' : '金矿';
        sub = (e.resType === 'gold' ? '剩余黄金 ' : '剩余木材 ') + Math.floor(e.amount);
        pct = e.amount / e.maxAmount;
      }

      this.el.portrait.textContent = icon;
      this.el.selName.textContent = name;
      this.el.selSub.textContent = sub;
      bar.style.display = 'block';
      fill.style.width = Util.clamp(pct, 0, 1) * 100 + '%';
      if (e.kind === 'resource') {
        fill.style.background = '#e6c072';
      } else {
        fill.style.background = pct > 0.66
          ? 'linear-gradient(180deg,#6fd07f,#3c8f4c)'
          : pct > 0.33
            ? 'linear-gradient(180deg,#e0c060,#a8862c)'
            : 'linear-gradient(180deg,#e07060,#a03028)';
      }
      return;
    }

    /* 多选 */
    const counts = {};
    let hp = 0, maxHp = 0, icons = [];
    for (const e of sel) {
      if (e.kind === 'unit') {
        counts[e.def.name] = (counts[e.def.name] || 0) + 1;
        hp += e.hp; maxHp += e.maxHp;
        if (icons.length < 3) icons.push(e.def.icon);
      } else if (e.kind === 'building') {
        counts[e.def.name] = (counts[e.def.name] || 0) + 1;
      }
    }
    const desc = Object.keys(counts).map(k => `${k}×${counts[k]}`).join('  ');
    this.el.portrait.textContent = icons[0] || '⚔';
    this.el.selName.textContent = sel.length + ' 个目标';
    this.el.selSub.textContent = desc || '混合编队';
    bar.style.display = maxHp > 0 ? 'block' : 'none';
    if (maxHp > 0) {
      const pct = hp / maxHp;
      fill.style.width = pct * 100 + '%';
      fill.style.background = 'linear-gradient(180deg,#6fd07f,#3c8f4c)';
    }
  }

  describeOrder(u) {
    const o = u.order;
    switch (o.type) {
      case 'gather': return o.phase === 'return' ? '运送资源' : '采集中';
      case 'build': return '建造中';
      case 'move': return '移动中';
      case 'attack': return '战斗中';
      case 'attackMove': return '攻击移动';
      case 'moveTo': return '移动中';
      default: return '待命';
    }
  }

  /* ---------------- 消息 ---------------- */
  pushLog(text, kind) {
    const div = document.createElement('div');
    div.className = 'msg ' + (kind || 'info');
    div.textContent = text;
    this.el.log.appendChild(div);
    while (this.el.log.children.length > 6) this.el.log.removeChild(this.el.log.firstChild);
    setTimeout(() => {
      div.style.opacity = '0';
      setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 600);
    }, 6500);
  }
}

globalThis.UI = UI;
