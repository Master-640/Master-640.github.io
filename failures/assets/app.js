/* 投资失败故事 —— 渲染与筛选
   数据在 data/stories.json，投稿入口按模板动态生成 issue 链接。 */

(function () {
  "use strict";

  var SUBJECT = {
    personal: { zh: "个人", cls: "subject" },
    company: { zh: "企业", cls: "subject" }
  };

  var TYPES = {
    leverage: "杠杆爆仓",
    chase: "追涨杀跌",
    rumor: "听消息",
    fraud: "被骗",
    business: "经营失血",
    other: "其他"
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

  function subjectOf(item) {
    return SUBJECT[item.subject] || SUBJECT.personal;
  }

  function typeOf(item) {
    return TYPES[item.type] || TYPES.other;
  }

  function visible() {
    if (!state.data) return [];
    var list = state.data.stories || [];
    if (state.filter === "all") return list;
    var parts = state.filter.split(":");
    var kind = parts[0], value = parts[1];
    return list.filter(function (it) {
      return String(it[kind]) === value;
    });
  }

  function counts() {
    var c = { personal: 0, company: 0, types: {} };
    (state.data.stories || []).forEach(function (it) {
      if (it.subject === "company") c.company++; else c.personal++;
      c.types[it.type] = (c.types[it.type] || 0) + 1;
    });
    return c;
  }

  function renderChips() {
    var list = state.data.stories || [];
    var c = counts();
    var items = [{ key: "all", label: "全部", n: list.length }];

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

  function renderStories() {
    var list = visible();
    if (!list.length) {
      el.stories.innerHTML =
        '<div class="empty">' +
        "<h3>还没有这一类的故事</h3>" +
        "<p>第一篇总是最难的。你的经历可能就是别人最需要看到的那一条。</p>" +
        '<a class="btn primary" href="#submit">我来写第一篇</a>' +
        "</div>";
      return;
    }

    el.stories.innerHTML = list.map(function (it) {
      var s = subjectOf(it);
      var tags = '<span class="tag ' + s.cls + '">' + esc(s.zh) + "</span>" +
        '<span class="tag">' + esc(typeOf(it)) + "</span>";
      if (it.sample) tags += '<span class="tag sample">示例</span>';

      var meta = [];
      if (it.loss) meta.push("<span>亏损 <b>" + esc(it.loss) + "</b></span>");
      if (it.period) meta.push("<span>周期 <b>" + esc(it.period) + "</b></span>");
      if (it.hold) meta.push("<span>持仓 <b>" + esc(it.hold) + "</b></span>");
      if (it.author) meta.push("<span>作者 <b>" + esc(it.author) + "</b></span>");

      return '<article class="story">' +
        '<div class="story-top">' + tags + "</div>" +
        "<h3>" + esc(it.title) + "</h3>" +
        "<p>" + esc(it.summary) + "</p>" +
        (it.lesson ? '<p class="lesson"><b>事后看</b>　' + esc(it.lesson) + "</p>" : "") +
        (meta.length ? '<div class="story-meta">' + meta.join("") + "</div>" : "") +
        "</article>";
    }).join("");
  }

  function renderNote() {
    var d = state.data || {};
    var list = d.stories || [];
    var samples = list.filter(function (it) { return it.sample; }).length;
    if (d.demo && samples) {
      el.note.innerHTML = "演示模式。当前 " + samples +
        " 条为格式示例，不是真实投稿，收满第一批真实故事后统一替换。";
      el.note.hidden = false;
    } else {
      el.note.textContent = "按主体和类型筛选。故事均经本人同意发布，细节做过脱敏。";
      el.note.hidden = false;
    }
  }

  function renderCounters() {
    var c = counts();
    el.statStories.textContent = (state.data.stories || []).length;
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
