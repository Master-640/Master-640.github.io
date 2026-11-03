/* 投资失败故事 —— 渲染与筛选
   数据在 data/stories.json。
   kind=case 为公开报道整理的案例，必须带 source；kind=submission 为读者投稿，带 author。 */

(function () {
  "use strict";

  var SUBJECT = {
    personal: "个人",
    company: "企业"
  };

  var TYPES = {
    leverage: "杠杆爆仓",
    derivative: "衍生品投机",
    chase: "追涨杀跌",
    rumor: "听消息",
    fraud: "被骗",
    business: "经营失血",
    sideline: "主业外投资",
    other: "其他"
  };

  var KIND = {
    case: "公开报道",
    submission: "投稿"
  };

  var ISSUE_BASE = "https://github.com/Master-640/Master-640.github.io/issues/new";

  var state = { data: null, filter: "all" };

  var el = {
    stories: document.getElementById("stories"),
    chips: document.getElementById("chips"),
    note: document.getElementById("wallNote"),
    statStories: document.getElementById("statStories"),
    statPersonal: document.getElementById("statPersonal"),
    statCompany: document.getElementById("statCompany"),
    statTop: document.getElementById("statTop"),
    issueBtn: document.getElementById("issueBtn"),
    tpl: document.getElementById("tpl")
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function all() { return (state.data && state.data.stories) || []; }

  function visible() {
    var list = all();
    if (state.filter === "all") return list;
    var parts = state.filter.split(":");
    var kind = parts[0], value = parts[1];
    return list.filter(function (it) { return String(it[kind]) === value; });
  }

  function counts() {
    var c = { personal: 0, company: 0, types: {}, cases: 0, subs: 0 };
    all().forEach(function (it) {
      if (it.subject === "company") c.company++; else c.personal++;
      c.types[it.type] = (c.types[it.type] || 0) + 1;
      if (it.kind === "case") c.cases++; else c.subs++;
    });
    return c;
  }

  function renderChips() {
    var c = counts();
    var items = [{ key: "all", label: "全部", n: all().length }];
    if (c.personal || c.company) {
      items.push({ key: "subject:personal", label: "个人", n: c.personal });
      items.push({ key: "subject:company", label: "企业", n: c.company });
    }
    Object.keys(c.types).forEach(function (t) {
      if (!c.types[t]) return;
      items.push({ key: "type:" + t, label: TYPES[t] || t, n: c.types[t] });
    });
    el.chips.innerHTML = items.map(function (it) {
      return '<button type="button" class="chip' + (state.filter === it.key ? " on" : "") +
        '" data-filter="' + esc(it.key) + '">' + esc(it.label) +
        '<span class="n">' + it.n + "</span></button>";
    }).join("");
  }

  function storyCard(it) {
    var isCase = it.kind === "case";
    var tags = '<span class="tag subject">' + esc(SUBJECT[it.subject] || "个人") + "</span>" +
      '<span class="tag">' + esc(TYPES[it.type] || TYPES.other) + "</span>" +
      '<span class="tag ' + (isCase ? "src" : "own") + '">' + esc(KIND[it.kind] || "投稿") + "</span>";
    if (it.sample) tags += '<span class="tag sample">示例</span>';

    var meta = [];
    if (it.loss) meta.push("<span>亏损 <b>" + esc(it.loss) + "</b></span>");
    if (it.period) meta.push("<span>周期 <b>" + esc(it.period) + "</b></span>");
    if (it.hold) meta.push("<span>持仓 <b>" + esc(it.hold) + "</b></span>");
    if (!isCase && it.author) meta.push("<span>作者 <b>" + esc(it.author) + "</b></span>");

    var source = "";
    if (isCase && it.source && it.source.url) {
      source = '<p class="story-source">来源 <a href="' + esc(it.source.url) +
        '" target="_blank" rel="noopener">' + esc(it.source.name) + "</a>" +
        (it.source.date ? " · " + esc(it.source.date) : "") + "</p>";
    }

    return '<article class="story">' +
      '<div class="story-top">' + tags + "</div>" +
      "<h3>" + esc(it.title) + "</h3>" +
      "<p>" + esc(it.summary) + "</p>" +
      (it.lesson ? '<p class="lesson"><b>事后看</b>　' + esc(it.lesson) + "</p>" : "") +
      (meta.length ? '<div class="story-meta">' + meta.join("") + "</div>" : "") +
      source +
      "</article>";
  }

  function renderStories() {
    var list = visible();
    if (!list.length) {
      el.stories.innerHTML =
        '<div class="empty"><h3>还没有这一类的故事</h3>' +
        "<p>第一篇总是最难的。你的经历可能就是别人最需要看到的那一条。</p>" +
        '<a class="btn primary" href="#submit">我来写第一篇</a></div>';
      return;
    }
    el.stories.innerHTML = list.map(storyCard).join("");
  }

  function renderNote() {
    var c = counts();
    var d = state.data || {};
    if (d.demo) {
      el.note.innerHTML = "演示模式。当前标了「示例」的条目是格式样例，不是真实经历。";
      return;
    }
    var bits = [];
    if (c.cases) bits.push(c.cases + " 条来自公开报道，均附出处链接");
    if (c.subs) bits.push(c.subs + " 条为读者投稿");
    if (!c.subs) bits.push("投稿通道开放中，收到后单独标注作者");
    el.note.textContent = bits.join("。") + "。";
  }

  function renderCounters() {
    var c = counts();
    el.statStories.textContent = all().length;
    el.statPersonal.textContent = c.personal;
    el.statCompany.textContent = c.company;
    var top = null, topN = 0;
    Object.keys(c.types).forEach(function (t) {
      if (c.types[t] > topN) { topN = c.types[t]; top = t; }
    });
    el.statTop.textContent = top ? (TYPES[top] || top) : "—";
  }

  function render() {
    renderChips();
    renderStories();
  }

  function wireIssueLink() {
    if (!el.issueBtn || !el.tpl) return;
    var body = el.tpl.textContent.trim();
    el.issueBtn.href = ISSUE_BASE +
      "?title=" + encodeURIComponent("投稿：我的亏损故事") +
      "&body=" + encodeURIComponent(body) +
      "&labels=" + encodeURIComponent("story");
  }

  function bind() {
    el.chips.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-filter]");
      if (!btn) return;
      state.filter = btn.getAttribute("data-filter");
      render();
    });
  }

  wireIssueLink();
  bind();

  fetch("./data/stories.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      state.data = { stories: data.stories || [], demo: !!data.demo };
      renderNote();
      renderCounters();
      render();
    })
    .catch(function (err) {
      el.note.textContent = "故事数据加载失败（" + err.message + "）。";
      el.stories.innerHTML =
        '<div class="empty"><h3>数据没加载出来</h3><p>请通过 http 打开页面，本地 file:// 会被浏览器拦。</p></div>';
    });
})();
