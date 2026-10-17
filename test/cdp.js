'use strict';

/* 通过 CDP 操作无头 Chrome：求值 / 截图 / 点击 */

const fs = require('fs');

async function main() {
  const args = process.argv.slice(2);
  const port = Number(process.env.CDP_PORT || 9222);
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('warcraft-lite'));
  if (!page) {
    console.error('no page found:', list.map(t => t.url));
    process.exit(1);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  const send = (method, params) => new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  const cmd = args[0];

  if (cmd === 'eval') {
    const r = await send('Runtime.evaluate', {
      expression: args[1],
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(JSON.stringify(r.result, null, 2));
  } else if (cmd === 'shot') {
    const file = args[1] || 'shot.png';
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (!r.result || !r.result.data) { console.error(JSON.stringify(r)); process.exit(1); }
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    console.log('saved', file);
  } else if (cmd === 'mouse') {
    const type = args[1];
    const x = Number(args[2]), y = Number(args[3]);
    const button = args[4] || 'left';
    const clicks = Number(args[5] || 1);
    await send('Input.dispatchMouseEvent', {
      type, x, y, button, clickCount: clicks,
      buttons: type === 'mousePressed' ? 1 : 0,
    });
  } else if (cmd === 'click') {
    const x = Number(args[1]), y = Number(args[2]);
    const button = args[3] || 'left';
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
    console.log('clicked', x, y, button);
  } else if (cmd === 'drag') {
    const x0 = Number(args[1]), y0 = Number(args[2]), x1 = Number(args[3]), y1 = Number(args[4]);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, button: 'none', clickCount: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 6; i++) {
      const x = x0 + (x1 - x0) * i / 6, y = y0 + (y1 - y0) * i / 6;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', clickCount: 0 });
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    console.log('dragged');
  } else if (cmd === 'key') {
    const key = args[1];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key.length === 1 ? key : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key });
    console.log('key', key);
  } else if (cmd === 'reload') {
    await send('Page.reload', { ignoreCache: true });
    console.log('reloaded');
  } else {
    console.error('unknown cmd');
    process.exit(1);
  }

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
