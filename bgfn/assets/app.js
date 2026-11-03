/* BGFN 每日播报 —— 数据来自 data/brief-YYYY-MM-DD.json
   文案在这里生成，改语气不用重抓数据。 */

(function () {
  "use strict";

  var WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

  var QUOTES = [
    {
      text: "短期来看，市场是一台投票机；长期来看，它是一台称重机。",
      src: "常被归于格雷厄姆，本书多次引用"
    },
    {
      text: "投资者的主要问题，甚至他最大的敌人，很可能就是他自己。",
      src: "《聪明的投资者》第 8 章"
    },
    {
      text: "价格是你付出的，价值是你得到的。",
      src: "常被归于格雷厄姆"
    },
    {
      text: "安全边际这四个字，值得用一辈子去想。",
      src: "第 20 章「安全边际」要旨"
    }
  ];

  var el = {
    issueNo: document.getElementById("issueNo"),
    today: document.getElementById("today"),
    ticker: document.getElementById("ticker"),
    kicker: document.getElementById("kicker"),
    headline: document.getElementById("headline"),
    deck: document.getElementById("deck"),
    bulletins: document.getElementById("bulletins"),
    quote: document.getElementById("quote"),
    quoteSrc: document.getElementById("quoteSrc"),
    weather: document.getElementById("weather"),
    archive: document.getElementById("archive")
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function abs(n) { return Math.abs(n).toFixed(2); }
  function signed(n) { return (n > 0 ? "+" : "") + n.toFixed(2); }

  function fmtDate(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 · " + WEEK[d.getDay()];
  }

  function currentDateParam() {
    var m = /[?&]d=([0-9-]+)/.exec(location.search);
    return m ? m[1] : null;
  }

  function renderTicker(items) {
    el.ticker.innerHTML = '<div class="ticker-in">' + items.map(function (it) {
      var cls = it.pct < 0 ? "down" : (it.pct > 0 ? "up" : "");
      return '<div class="tick ' + cls + '">' +
        '<span class="n">' + esc(it.name) + "</span>" +
        '<span class="v">' + it.value.toFixed(2) + "</span>" +
        '<span class="p">' + signed(it.pct) + "%</span></div>";
    }).join("") + "</div>";
  }

  function compose(items) {
    var sorted = items.slice().sort(function (a, b) { return a.pct - b.pct; });
    var worst = sorted[0];
    var best = sorted[sorted.length - 1];
    var downs = items.filter(function (i) { return i.pct < 0; }).length;
    var ups = items.filter(function (i) { return i.pct > 0; }).length;
    var avg = items.reduce(function (s, i) { return s + i.pct; }, 0) / items.length;

    var lead;
    if (downs >= items.length * 0.6) {
      lead = {
        kicker: "今日头条 · 好消息",
        headline: "好消息：全市场打折，{0}力度最大，跌 {1}%".replace("{0}", worst.name).replace("{1}", abs(worst.pct)),
        deck: "今天有 " + downs + " 个指数收跌。同样的公司、同样的分红、同样的生意，今天比昨天便宜。"
          + "华尔街的分析师说可能还会跌，按这个频道的算法，这是过去一年里最好的消息。"
      };
    } else if (ups >= items.length * 0.6) {
      lead = {
        kicker: "今日头条 · 坏消息",
        headline: "坏消息：价格普遍上涨，{0} 涨 {1}%".replace("{0}", best.name).replace("{1}", abs(best.pct)),
        deck: "今天有 " + ups + " 个指数收涨。公司还是那批公司，准备买入的人要为它们多付。"
          + "已经持有的人今晚可以高兴一下，明天要买的人不行。"
      };
    } else {
      lead = {
        kicker: "今日头条 · 涨跌互现",
        headline: "涨跌互现：{0} 跌 {1}%，{2} 涨 {3}%"
          .replace("{0}", worst.name).replace("{1}", abs(worst.pct))
          .replace("{2}", best.name).replace("{3}", abs(best.pct)),
        deck: "对买家来说，今天值得高兴的是 " + worst.name + "，它比昨天便宜了 " + abs(worst.pct) + "%。"
          + "对卖家来说，今天值得高兴的是 " + best.name + "。同一个市场，两种心情，看你站在哪一边。"
      };
    }

    var bullets = sorted.map(function (it) {
      var line;
      if (Math.abs(it.pct) < 0.05) {
        line = "几乎没有动。价格没变，说明今天没人替你着急。";
      } else if (it.pct < 0) {
        line = "同一批公司，今天比昨天便宜了 " + abs(it.pct) + "%。";
      } else {
        line = "想买的人今天要为同样的东西多付 " + abs(it.pct) + "%。";
      }
      return { name: it.name, value: it.value, pct: it.pct, line: line, market: it.market };
    });

    var weather;
    if (avg <= -0.5) {
      weather = "<b>雨。</b>下得不小，" + worst.name + " 淋得最湿，跌 " + abs(worst.pct)
        + "%。出门记得带伞，也记得带钱。";
    } else if (avg >= 0.5) {
      weather = "<b>晴。</b>阳光很好，价格很贵。今天适合卖，不适合买。";
    } else {
      weather = "<b>阴。</b>不晴不雨，涨跌幅都在一个点以内，最没意思的一种天气。";
    }

    return { lead: lead, bullets: bullets, weather: weather };
  }

  function renderBulletins(bullets) {
    el.bulletins.innerHTML = bullets.map(function (b) {
      var cls = b.pct < 0 ? "down" : "";
      return "<li><div class=\"b-item-head\">" +
        '<span class="b-name">' + esc(b.name) + "</span>" +
        '<span class="b-num ' + cls + '">' + b.value.toFixed(2) + " · " + signed(b.pct) + "%</span>" +
        "</div><p class=\"b-line\">" + esc(b.line) + "</p></li>";
    }).join("");
  }

  function pickQuote(dateStr) {
    var sum = 0;
    for (var i = 0; i < dateStr.length; i++) sum += dateStr.charCodeAt(i);
    return QUOTES[sum % QUOTES.length];
  }

  function renderArchive(dates, current) {
    if (!dates || !dates.length) {
      el.archive.innerHTML = '<li class="muted">暂无往期</li>';
      return;
    }
    el.archive.innerHTML = dates.slice(0, 8).map(function (d) {
      var isCur = d === current;
      return "<li>" + (isCur
        ? "<b>" + esc(d) + "（本期）</b>"
        : '<a href="?d=' + esc(d) + '">' + esc(d) + "</a>") + "</li>";
    }).join("") + (dates.length > 8 ? '<li class="muted">共 ' + dates.length + " 期</li>" : "");
  }

  function render(payload, dates) {
    var items = payload.indices || [];
    if (!items.length) throw new Error("没有指数数据");

    el.issueNo.textContent = "第 " + (dates && dates.length ? dates.length : 1) + " 期";
    el.today.textContent = fmtDate(payload.date);

    renderTicker(items);

    var c = compose(items);
    el.kicker.textContent = c.lead.kicker;
    el.headline.textContent = c.lead.headline;
    el.deck.textContent = c.lead.deck;
    renderBulletins(c.bullets);
    el.weather.innerHTML = c.weather;

    var q = pickQuote(payload.date);
    el.quote.textContent = "「" + q.text + "」";
    el.quoteSrc.textContent = q.src;

    renderArchive(dates, payload.date);

    var us = items.filter(function (i) { return i.market === "us"; });
    var note = document.getElementById("usNote");
    if (us.length && note) {
      note.hidden = false;
      note.textContent = "美股为上一交易日收盘价（" + (us[0].quoted_at || "").slice(0, 10) + "）。A 股为当日收盘。";
    }
  }

  function load() {
    var target = currentDateParam();
    return fetch("./data/index.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : { dates: [] }; })
      .catch(function () { return { dates: [] }; })
      .then(function (idx) {
        var dates = idx.dates || [];
        var d = target || dates[0];
        var url = d ? "./data/brief-" + d + ".json" : "./data/latest.json";
        return fetch(url, { cache: "no-store" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (payload) { render(payload, dates); });
      });
  }

  load().catch(function (err) {
    el.headline.textContent = "今天的行情没有拉到";
    el.deck.textContent = "错误：" + err.message + "。行情脚本每天收盘后跑一次，稍后再刷新。";
  });
})();
