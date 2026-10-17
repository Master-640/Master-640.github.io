'use strict';

/* 通过 CDP 自动操作游戏，验证交互链路 */

const fs = require('fs');

async function connect(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('warcraft-lite'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params) => new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  return { send, ws };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const { send, ws } = await connect(9222);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      console.error('EVAL ERROR:', JSON.stringify(r.result.exceptionDetails));
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  const click = async (x, y, button = 'left') => {
    const mask = button === 'left' ? 1 : 2;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1, buttons: mask });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1, buttons: 0 });
  };

  const move = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  };

  const key = async (k) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k.length === 1 ? k : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
  };

  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  };

  const pos = async (wx, wy) => evalJs(`(()=>{const s=__app.renderer.worldToScreen(${wx},${wy});return {x:Math.round(s.x),y:Math.round(s.y)};})()`);
  const btnPos = async (id) => evalJs(`(()=>{const el=document.querySelector('[data-cmd="${id}"]'); if(!el)return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);

  const log = (...a) => console.log(...a);

  /* 等待游戏开始 */
  await evalJs('(()=>{ if(!__app.game.started) __app.ui.startGame(); return 1; })()');
  await sleep(600);

  /* 0. 初始状态 */
  log('0) 开局:', JSON.stringify(await evalJs('(()=>{const g=__app.game;return {gold:Math.floor(g.res.player.gold),lumber:Math.floor(g.res.player.lumber),units:g.units.filter(u=>u.team==="player").length, sel:g.selection.length};})()')));

  /* 1. 右键金矿采集 */
  const mine = await pos(14.5, 8.5);
  await click(mine.x, mine.y, 'right');
  await sleep(9000);
  const gather = await evalJs('(()=>{const g=__app.game; const ws=g.units.filter(u=>u.team==="player"&&u.isWorker); return {gold:Math.floor(g.res.player.gold), states:ws.map(w=>w.order.type+"/"+(w.order.phase||"")), carry:ws.map(w=>w.carry)};})()');
  log('1) 采集 9s 后:', JSON.stringify(gather));
  await shot('.tmp-step1.png');

  /* 2. 按 B 打开建造菜单 */
  await key('b');
  await sleep(300);
  const menu = await evalJs('(()=>Array.from(document.querySelectorAll("#cmdGrid .cmd")).map(e=>e.dataset.cmd))()');
  log('2) 建造菜单:', JSON.stringify(menu));

  /* 3. 按 Q 选农场，检查幽灵预览 */
  await key('q');
  await sleep(200);
  const place = await evalJs('(()=>{const pl=__app.input.placing;return pl?{type:pl.type,tx:pl.tx,ty:pl.ty,valid:pl.valid}:null;})()');
  log('3) 放置模式:', JSON.stringify(place));

  const spot = await pos(12.5, 14.5);
  await move(spot.x, spot.y);
  await sleep(300);
  const place2 = await evalJs('(()=>{const pl=__app.input.placing;return pl?{type:pl.type,tx:pl.tx,ty:pl.ty,valid:pl.valid}:null;})()');
  log('3b) 移动后:', JSON.stringify(place2));
  await shot('.tmp-step2.png');

  /* 4. 点击放置 */
  await click(spot.x, spot.y);
  await sleep(500);
  const built = await evalJs('(()=>{const g=__app.game;const f=g.buildings.find(b=>b.team==="player"&&b.type==="farm");return {exists:!!f,complete:f&&f.complete,progress:f?+f.progress.toFixed(2):null,placing:!!__app.input.placing, builders:g.units.filter(u=>u.order.type==="build").length,gold:Math.floor(g.res.player.gold)};})()');
  log('4) 放置农场:', JSON.stringify(built));
  await shot('.tmp-step3.png');

  /* 5. 等建造完成 */
  await sleep(17000);
  const done = await evalJs('(()=>{const g=__app.game;const f=g.buildings.find(b=>b.team==="player"&&b.type==="farm");return {complete:f&&f.complete,progress:f?+f.progress.toFixed(2):null,popCap:g.popCap("player")};})()');
  log('5) 17s 后:', JSON.stringify(done));

  /* 6. 选中大厅并训练农民 */
  const th = await pos(9, 9);
  await click(th.x, th.y);
  await sleep(300);
  const thPanel = await evalJs('(()=>({sel:__app.game.selection.map(e=>e.type||e.kind), cmds:Array.from(document.querySelectorAll("#cmdGrid .cmd")).map(e=>e.dataset.cmd)}))()');
  log('6) 选中大厅:', JSON.stringify(thPanel));

  const trainBtn = await btnPos('train:worker');
  if (trainBtn) { await click(trainBtn.x, trainBtn.y); await sleep(400); }
  const queue = await evalJs('(()=>{const b=__app.game.buildings.find(b=>b.team==="player"&&b.type==="townhall");return {queue:b.queue.map(q=>q.type),pop:__app.game.popUsed("player")+"/"+__app.game.popCap("player")};})()');
  log('6b) 训练队列:', JSON.stringify(queue));

  await sleep(12000);
  const after = await evalJs('(()=>{const g=__app.game;return {workers:g.units.filter(u=>u.team==="player"&&u.isWorker).length,pop:g.popUsed("player")+"/"+g.popCap("player")};})()');
  log('6c) 12s 后:', JSON.stringify(after));

  /* 7. 框选 + 攻击移动 */
  await evalJs('(()=>{const g=__app.game;const ws=g.units.filter(u=>u.team==="player"&&u.isWorker);g.setSelection(ws);__app.ui.refresh(true);return ws.length;})()');
  await sleep(200);
  await key('a');
  await sleep(200);
  const aim = await evalJs('(()=>({aim:__app.input.aimMode,point:__app.input.aimPoint}))()');
  log('7) 攻击移动模式:', JSON.stringify(aim));

  const target = await pos(16, 13);
  await click(target.x, target.y);
  await sleep(500);
  const moved = await evalJs('(()=>{const g=__app.game;return {aim:__app.input.aimMode, orders:g.selection.map(u=>u.order.type)};})()');
  log('7b) 下达后:', JSON.stringify(moved));

  /* 8. 敌方 AI 状态 */
  const aiState = await evalJs('(()=>{const g=__app.game;return {time:+g.time.toFixed(1), enemyUnits:g.units.filter(u=>u.team==="enemy").length, enemyBuildings:g.buildings.filter(b=>b.team==="enemy").length, over:g.over};})()');
  log('8) 局势:', JSON.stringify(aiState));

  await shot('.tmp-step4.png');
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
