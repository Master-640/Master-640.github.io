/* 投资 Skill 排行 —— 前端渲染
   数据契约见 data/rankings.json（由 scripts/fetch_rankings.py 生成）。
   所有仓库简介均来自 GitHub 外部输入，一律转义后再插入 DOM。 */

(function () {
  "use strict";

  var I18N = {
    zh: {
      brand: "投资 Skill 排行",
      navMethod: "排名方法",
      eyebrow: "每日自动更新 · GitHub Actions",
      h1a: "投资 Skill", h1b: "排行",
      lede: "每天自动发现、过滤并排名 GitHub 上服务投资研究的 Agent Skill 仓库 —— 量化交易、投研选股、财报估值、组合风控。双信号硬过滤，不做人情榜。",
      statRepos: "收录仓库", statStars: "总 Stars", statSkills: "已核验 SKILL.md", statFresh: "30 天内活跃",
      searchPh: "搜索仓库、简介、分类",
      sortLabel: "排序", sortRank: "综合排名", sortTrend: "趋势优先",
      sortStars: "Stars 优先", sortDelta: "30 天增量", sortFresh: "最近更新",
      viewTable: "表格", viewCard: "卡片",
      boardTitle: "完整榜单", thRepo: "仓库", th7d: "7d", th30d: "30d",
      thTrend: "趋势", thCat: "分类", thPush: "更新",
      empty: "没有匹配的仓库。试试清空搜索或切回「全部」分类。",
      all: "全部",
      methodTitle: "排名方法",
      m1t: "相关性加权与身份门",
      m1b: "先过「Skill 信号」（SKILL.md / agent / claude code / codex …），再算相关性分：金融词出现在仓库名 +4、topics +3、简介 +3；泛技能大合集（“380 skills”、“curated collection”）−6，跨领域合集 −4。另有身份门：金融信号必须落在仓库名或 topics 上，或简介里命中至少 2 个不同金融词 —— 只提过一句 finance 的通用基建仓库进不来。",
      m2t: "真实 Skill 核验",
      m2b: "对头部仓库递归读取 git tree，统计仓库里真实存在的 SKILL.md 数量。空壳仓库的「已核验」一栏会是 0。",
      m3t: "趋势分怎么算",
      m3b: "以历史快照做差：0.5×7d 日均新增 + 0.3×30d 日均新增 + 0.2×新鲜度。榜单默认按 Stars 排，趋势分作为第二序；也可切「趋势优先」。",
      m4t: "数据从哪来",
      m4b: "GitHub Search API，每日 UTC 00:10 由 Actions 跑一次；历史快照保留 60–90 天，用于算增量。原始数据开放下载：JSON / CSV。",
      footNote: "榜单只做信息聚合，不构成任何投资建议。条目由自动规则生成，可能误收 —— 发现漏收或错收，欢迎在 GitHub 开 issue。",
      kbd: "快捷键：/ 搜索 · v 切视图 · Esc 清空",
      count: function (shown, total, date) {
        return "显示 " + shown + " / 共 " + total + " 条 · 数据更新于 " + date;
      }
    },
    en: {
      brand: "Investment Skills",
      navMethod: "Method",
      eyebrow: "Updated daily · GitHub Actions",
      h1a: "Investment Skill", h1b: "Ranking",
      lede: "A daily, automatically filtered ranking of GitHub repositories that ship Agent Skills for investment research: quant trading, equity research, financial modeling, portfolio risk.",
      statRepos: "Repositories", statStars: "Total stars", statSkills: "Verified SKILL.md", statFresh: "Active in 30d",
      searchPh: "Search repo, description, category",
      sortLabel: "Sort", sortRank: "Overall", sortTrend: "Trend first",
      sortStars: "Stars", sortDelta: "30d gain", sortFresh: "Recently pushed",
      viewTable: "Table", viewCard: "Cards",
      boardTitle: "Full ranking", thRepo: "Repository", th7d: "7d", th30d: "30d",
      thTrend: "Trend", thCat: "Category", thPush: "Pushed",
      empty: "No repository matched. Clear the search or switch back to “All”.",
      all: "All",
      methodTitle: "Method",
      m1t: "Weighted relevance + identity gate",
      m1b: "Every candidate must first pass a skill signal (SKILL.md / agent / claude code / codex …), then a relevance score: finance term in the repo name +4, in topics +3, in the description +3; generic mega-collections (“380 skills”, “curated collection”) −6, cross-domain collections −4. An identity gate additionally requires the finance signal to sit in the name or topics, or at least two distinct finance terms in the description.",
      m2t: "Real skill verification",
      m2b: "For the top repositories we read the git tree recursively and count how many SKILL.md files actually exist. Empty shells show 0 in that column.",
      m3t: "How the trend score works",
      m3b: "Computed from historical snapshots: 0.5×7d daily gain + 0.3×30d daily gain + 0.2×freshness. The board sorts by stars by default, with trend as tiebreaker.",
      m4t: "Where the data comes from",
      m4b: "GitHub Search API, refreshed daily at 00:10 UTC by GitHub Actions. Snapshots are kept for 60–90 days to compute deltas. Raw data is downloadable as JSON / CSV.",
      footNote: "This board is an information index only and is not investment advice. Entries are produced by automated rules and may include false positives — open an issue if you spot one.",
      kbd: "Keys: / search · v view · Esc clear",
      count: function (shown, total, date) {
        return "Showing " + shown + " / " + total + " · updated " + date;
      }
    }
  };

  var DIST_COLORS = ["#0b2a6b", "#1746b4", "#2f6feb", "#6b95f3", "#9dbcfb", "#c2d6ff", "#dbe7ff"];

  var state = { data: null, q: "", cat: "all", sort: "rank", view: "table", lang: "zh" };

  var el = {
    tbody: document.getElementById("tbody"),
    cards: document.getElementById("cards"),
    table: document.getElementById("table"),
    empty: document.getElementById("empty"),
    notice: document.getElementById("notice"),
    count: document.getElementById("count"),
    q: document.getElementById("q"),
    sort: document.getElementById("sort"),
    catChips: document.getElementById("catChips"),
    dist: document.getElementById("dist"),
    generatedAt: document.getElementById("generatedAt"),
    statTotal: document.getElementById("statTotal"),
    statStars: document.getElementById("statStars"),
    statSkills: document.getElementById("statSkills"),
    statFresh: document.getElementById("statFresh"),
    langBtn: document.getElementById("langBtn"),
    viewTable: document.getElementById("viewTable"),
    viewCard: document.getElementById("viewCard")
  };

  function t(key) {
    var dict = I18N[state.lang] || I18N.zh;
    return dict[key] != null ? dict[key] : key;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function num(n) {
    if (n == null) return "—";
    return Number(n).toLocaleString("en-US");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var p = function (x) { return String(x).padStart(2, "0"); };
    if (state.lang === "en") {
      return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
    }
    return d.getUTCFullYear() + " 年 " + (d.getUTCMonth() + 1) + " 月 " + d.getUTCDate() + " 日";
  }

  function deltaCell(v) {
    if (v == null) return '<span class="delta flat">—</span>';
    if (v > 0) return '<span class="delta up"><span class="arr">▲</span>' + num(v) + "</span>";
    if (v === 0) return '<span class="delta flat">0</span>';
    return '<span class="delta flat"><span class="arr">▼</span>' + num(Math.abs(v)) + "</span>";
  }

  function trendBadge(item) {
    var id = (item.trend && item.trend.id) || "steady";
    var label = (item.trend && (item.trend[state.lang] || item.trend.zh)) || "";
    return '<span class="badge ' + esc(id) + '">' + esc(label) + "</span>";
  }

  function catLabel(item) {
    var c = item.category || {};
    return c[state.lang] || c.zh || "—";
  }

  function pushCell(days) {
    if (days == null || days > 900) return '<span class="pushdays">—</span>';
    if (days <= 0) return '<span class="pushdays">' + (state.lang === "en" ? "today" : "今天") + "</span>";
    return '<span class="pushdays">' + days + (state.lang === "en" ? "d" : " 天前") + "</span>";
  }

  function repoCell(item) {
    var parts = String(item.repo || "").split("/");
    var owner = parts.length > 1 ? parts[0] : "";
    var name = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
    var topics = (item.topics || []).slice(0, 3)
      .map(function (x) { return '<span class="tag">' + esc(x) + "</span>"; }).join("");
    return '<div class="repo-name"><span class="owner">' + esc(owner) + "/</span>" +
      '<a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(name) + "</a></div>" +
      '<p class="repo-desc">' + esc(item.description || "—") + "</p>" +
      (topics ? '<div class="repo-topics">' + topics + "</div>" : "");
  }

  function visible() {
    if (!state.data) return [];
    var q = state.q.trim().toLowerCase();
    var list = state.data.items.filter(function (it) {
      if (state.cat !== "all" && (!it.category || it.category.id !== state.cat)) return false;
      if (!q) return true;
      var hay = [it.repo, it.description, (it.topics || []).join(" "),
        it.category && it.category.zh, it.category && it.category.en].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    var sorters = {
      rank: function (a, b) { return a.rank - b.rank; },
      trend: function (a, b) { return (b.trend_score || 0) - (a.trend_score || 0); },
      stars: function (a, b) { return b.stars - a.stars; },
      delta30: function (a, b) {
        var x = a.star_delta_30d, y = b.star_delta_30d;
        if (x == null && y == null) return b.stars - a.stars;
        if (x == null) return 1;
        if (y == null) return -1;
        return y - x;
      },
      fresh: function (a, b) { return (a.days_since_push || 999) - (b.days_since_push || 999); }
    };
    return list.sort(sorters[state.sort] || sorters.rank);
  }

  function renderTable(items) {
    el.tbody.innerHTML = items.map(function (it) {
      var cls = it.rank <= 3 ? ' class="top3"' : "";
      return "<tr" + cls + ">" +
        '<td class="c-rank">' + it.rank + "</td>" +
        "<td>" + repoCell(it) + "</td>" +
        '<td class="num"><span class="stars">' + num(it.stars) + "</span></td>" +
        '<td class="num">' + deltaCell(it.star_delta_7d) + "</td>" +
        '<td class="num">' + deltaCell(it.star_delta_30d) + "</td>" +
        "<td>" + trendBadge(it) + "</td>" +
        '<td><span class="cat">' + esc(catLabel(it)) + "</span></td>" +
        '<td class="num">' + pushCell(it.days_since_push) + "</td>" +
        "</tr>";
    }).join("");
  }

  function renderCards(items) {
    el.cards.innerHTML = items.map(function (it) {
      var parts = String(it.repo || "").split("/");
      var owner = parts.length > 1 ? parts[0] : "";
      var name = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
      var topics = (it.topics || []).slice(0, 2)
        .map(function (x) { return '<span class="tag">' + esc(x) + "</span>"; }).join("");
      return '<article class="card">' +
        '<div class="card-top"><span class="card-rank">#' + it.rank + "</span>" + trendBadge(it) + "</div>" +
        "<h3><span class=\"owner\">" + esc(owner) + "/</span>" +
        '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(name) + "</a></h3>" +
        "<p>" + esc(it.description || "—") + "</p>" +
        (topics ? '<div class="repo-topics">' + topics + "</div>" : "") +
        '<div class="card-meta"><span class="stars">★ ' + num(it.stars) + "</span>" +
        "<span>" + esc(catLabel(it)) + "</span>" +
        "<span>" + pushCell(it.days_since_push) + "</span></div>" +
        "</article>";
    }).join("");
  }

  function renderChips(items) {
    var counts = {};
    items.forEach(function (it) {
      var id = it.category ? it.category.id : "other";
      counts[id] = (counts[id] || 0) + 1;
    });
    var cats = [];
    var seen = {};
    items.forEach(function (it) {
      var c = it.category;
      if (c && !seen[c.id]) { seen[c.id] = 1; cats.push(c); }
    });
    var html = '<button class="chip' + (state.cat === "all" ? " on" : "") +
      '" data-cat="all" type="button">' + esc(t("all")) +
      '<span class="n">' + items.length + "</span></button>";
    cats.forEach(function (c) {
      html += '<button class="chip' + (state.cat === c.id ? " on" : "") +
        '" data-cat="' + esc(c.id) + '" type="button">' + esc(c[state.lang] || c.zh) +
        '<span class="n">' + (counts[c.id] || 0) + "</span></button>";
    });
    el.catChips.innerHTML = html;
  }

  function renderDist(items) {
    var order = [], counts = {}, meta = {};
    items.forEach(function (it) {
      var c = it.category || { id: "other", zh: "其他", en: "Other" };
      if (!meta[c.id]) { meta[c.id] = c; order.push(c.id); }
      counts[c.id] = (counts[c.id] || 0) + 1;
    });
    var total = items.length || 1;
    var bars = "", legend = "";
    order.forEach(function (id, i) {
      var color = DIST_COLORS[i % DIST_COLORS.length];
      var pct = (counts[id] / total) * 100;
      bars += '<i style="width:' + pct.toFixed(2) + "%;background:" + color + '"></i>';
      legend += '<span><i class="sw" style="background:' + color + '"></i>' +
        esc(meta[id][state.lang] || meta[id].zh) + " <b>" + counts[id] + "</b></span>";
    });
    el.dist.innerHTML = '<div class="dist-bar">' + bars + "</div>" +
      '<div class="dist-legend">' + legend + "</div>";
  }

  function applyStatic() {
    document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (I18N[state.lang][key] != null && typeof I18N[state.lang][key] === "string") {
        nodes[i].textContent = I18N[state.lang][key];
      }
    }
    var phs = document.querySelectorAll("[data-i18n-ph]");
    for (var j = 0; j < phs.length; j++) {
      phs[j].setAttribute("placeholder", I18N[state.lang][phs[j].getAttribute("data-i18n-ph")]);
    }
    el.langBtn.textContent = state.lang === "zh" ? "EN" : "中";
    document.title = state.lang === "en"
      ? "Investment Agent Skills · Leaderboard"
      : "投资 Skill 排行 · Investment Agent Skills";
  }

  function render() {
    if (!state.data) return;
    var items = visible();
    el.table.parentNode.hidden = state.view !== "table";
    el.table.hidden = state.view !== "table";
    el.cards.hidden = state.view !== "card";
    el.empty.hidden = items.length !== 0;

    if (state.view === "table") renderTable(items); else renderCards(items);
    renderChips(state.data.items);

    var meta = state.data.metadata || {};
    el.count.textContent = I18N[state.lang].count(items.length, state.data.items.length,
      fmtDate(meta.generated_at));

    el.viewTable.classList.toggle("on", state.view === "table");
    el.viewTable.setAttribute("aria-pressed", String(state.view === "table"));
    el.viewCard.classList.toggle("on", state.view === "card");
    el.viewCard.setAttribute("aria-pressed", String(state.view === "card"));

    // 首期：还没有历史快照，7d/30d 增量全空，说明一下免得看着像坏了
    var hasHistory = state.data.items.some(function (it) {
      return it.star_delta_7d != null || it.star_delta_30d != null;
    });
    el.notice.hidden = hasHistory;
    if (!hasHistory) {
      el.notice.innerHTML = state.lang === "en"
        ? "<b>First issue.</b> 7d / 30d star deltas need historical snapshots — they start filling in from tomorrow's run."
        : "<b>首期收录。</b>7d / 30d 增量要靠历史快照做差，从明天的定时抓取开始累积。";
    }
  }

  function bootstrap(data) {
    state.data = data;
    var items = data.items || [];
    var meta = data.metadata || {};
    var totalStars = items.reduce(function (s, it) { return s + (it.stars || 0); }, 0);
    var verified = items.filter(function (it) { return it.has_skill_md === true; }).length;
    var fresh = items.filter(function (it) { return (it.days_since_push || 999) <= 30; }).length;

    el.statTotal.textContent = num(items.length);
    el.statStars.textContent = num(totalStars);
    el.statSkills.textContent = verified ? num(verified) : "—";
    el.statFresh.textContent = num(fresh);
    el.generatedAt.textContent = fmtDate(meta.generated_at);

    renderDist(items);
    render();
  }

  function bind() {
    el.q.addEventListener("input", function () { state.q = el.q.value; render(); });
    el.sort.addEventListener("change", function () { state.sort = el.sort.value; render(); });
    el.catChips.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-cat]");
      if (!btn) return;
      state.cat = btn.getAttribute("data-cat");
      render();
    });
    el.viewTable.addEventListener("click", function () { state.view = "table"; render(); });
    el.viewCard.addEventListener("click", function () { state.view = "card"; render(); });
    el.langBtn.addEventListener("click", function () {
      state.lang = state.lang === "zh" ? "en" : "zh";
      applyStatic(); render(); renderDist(state.data.items);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") {
        if (ev.key === "Escape") { el.q.value = ""; state.q = ""; render(); el.q.blur(); }
        return;
      }
      if (ev.key === "/") { ev.preventDefault(); el.q.focus(); el.q.select(); }
      if (ev.key === "v" || ev.key === "V") {
        state.view = state.view === "table" ? "card" : "table"; render();
      }
      if (ev.key === "Escape") { state.q = ""; el.q.value = ""; state.cat = "all"; render(); }
    });
  }

  applyStatic();
  bind();

  fetch("./data/rankings.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(bootstrap)
    .catch(function (err) {
      el.count.textContent = "数据加载失败 / failed to load: " + err.message;
      el.empty.hidden = false;
      el.empty.textContent = "数据加载失败：请确认 data/rankings.json 存在。" +
        "若在本地打开，需用 http 服务（file:// 会被 CORS 拦）。";
    });
})();
