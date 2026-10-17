'use strict';

/* ============================================================
   启动
   ============================================================ */

(function () {
  const canvas = document.getElementById('gameCanvas');

  const game = new Game();
  const renderer = new Renderer(canvas, game);
  const ui = new UI(game, renderer);
  const input = new InputHandler(canvas, game, renderer, ui);

  ui.attachInput(input);
  game.onMessage = (text, kind) => ui.pushLog(text, kind);

  window.addEventListener('resize', () => {
    renderer.resize();
    ui.resizeMinimap();
  });

  /* 初始视角 */
  renderer.centerOn(game.playerBase.x, game.playerBase.y);

  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    input.update(dt);
    game.update(dt);
    renderer.render(dt, input);
    ui.tick(dt);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  /* 便于调试 */
  window.__app = { game, renderer, ui, input };

  /* 开发便利：?auto 直接开局 */
  if (location.search.indexOf('auto') >= 0) {
    setTimeout(() => ui.startGame(), 40);
  }
})();
