# AGENTS.md

给接手这个仓库的 AI agent 看的操作说明。人是唯一读者时不必读它。

## 这是什么

`Master-640.github.io` 是个人 GitHub Pages 站点，纯静态，没有构建步骤。

根目录是一张主页加一个文章存档，下面三个子站各自独立。

- `index.html` 主页，文章索引与「关于」，`https://master-640.github.io/`
- `posts/` 文章页，一篇一个 HTML，文件名 `YYYY-MM-DD-slug.html`
- `invest-skills/` 每天自动更新的投资类 AI Skill 仓库排行榜，`https://master-640.github.io/invest-skills/`
- `failures/` 投资失败故事征集站，收个人和企业的真实亏损经历，`https://master-640.github.io/failures/`
- `bgfn/` 仿《聪明的投资者》第 8 章的虚构电视台，每交易日收盘后播报

下文所有路径都相对**仓库根目录**。本地源码目录 `invest-skill-board/` 是 `invest-skills/`
的镜像，`failure-stories/` 是 `failures/` 的镜像，都少一层前缀，改完要同步推过去。

## 目录

```
.github/workflows/invest-rankings.yml   每日抓取工作流
.nojekyll                               GitHub Pages 跳过 Jekyll
index.html                              主页，文章索引 + 关于 + 项目
assets/style.css                        主页与文章页共用的样式
posts/_template.html                    文章模板，复制改名即可
posts/YYYY-MM-DD-slug.html              文章正文
invest-skills/
  index.html                            页面结构
  assets/style.css                      全部样式（蓝白配色）
  assets/app.js                         渲染、筛选、排序、i18n
  data/rankings.json                    榜单数据（脚本生成，勿手改）
  data/rankings.csv                     同上，导出用
  data/history/YYYY-MM-DD.json          每日星数快照，用于算增量
  scripts/fetch_rankings.py             抓取与筛选脚本
failures/
  index.html                            故事站页面
  assets/style.css                      杂志式排版，衬线标题
  assets/app.js                         故事渲染、主体/类型筛选
  data/stories.json                     故事数据（手工维护）
```

## 怎么写一篇新文章

没有构建步骤，文章就是一份 HTML。

1. 复制 `posts/_template.html` 成 `posts/2026-11-13-slug.html`
2. 改 `<title>`、`<h1>`、`<time>`、`<p class="meta">`，正文从 `<!-- 正文从这里开始 -->` 往下写
3. 打开根目录 `index.html`，照 `<!-- 每发一篇 -->` 注释里那块抄一个 `<li>`，填日期、标题、一句摘要，`datetime` 和文件名里的日期要对得上
4. push 到 `main`

正文只用 `assets/style.css` 里 `.prose` 已定义的标签：`p` `h2` `h3` `blockquote` `ul`/`ol`
`figure` `table` `hr` `code`/`pre`。要加新样式先看根 `assets/style.css`，别在文章里写 `style=`。

模板带 `noindex`，不要把 `_template.html` 当文章改，复制出来再动。

摘要 `dek` 控制在 40 字内，主页上一行放得下；`<title>` 用「标题 · Master-640」的格式。

## 事故：根路径 404

曾经 `https://master-640.github.io/` 返回 404，而子站都正常。原因不是 Pages 没开，
是根目录没有 `index.html`。报错页的原文是
`The site configured at this address does not contain the requested file`——
出现这句说明 Pages 是通的，缺的是文件本身。补一个 `index.html` 即可，不用去动 Pages 设置。

## 失败故事站怎么维护

`failures/data/stories.json` 是唯一的数据源，手工编辑，没有脚本生成。

每条故事字段固定，`subject` 取 `personal` 或 `company`，`type` 取 `leverage` / `derivative` /
`chase` / `rumor` / `fraud` / `business` / `sideline` / `other`。缺字段不会报错，卡片上对应那行不显示。

`kind` 有两种取值，决定卡片的身份标签。

- `case` 公开报道整理的案例，**必须带 `source`**（`name` / `url` / `date`），卡片底部会渲染成可点的出处链接，不显示作者
- `submission` 读者投稿，带 `author`，默认匿名

公开案例只转述事实，不整段转载原文，链接必须回原文。数字和日期以来源为准，宁可不写也不要估。

文件顶层的 `demo: true` 打开时，标了 `"sample": true` 的条目会打「示例」标签，故事墙顶部
会提示这是演示数据。当前 `demo` 已关闭，五条全部是带出处的公开案例，站上没有示例条目。
只有在需要重新演示版式时才把它打开。

投稿邮箱 `2447831422@qq.com` 出现在两处，`index.html` 的投稿区（明文加 mailto）和页脚。
换邮箱要同时改这两处，还有投稿区那个 `mailto:` 里的 `subject` 参数。

## 数据流水线

`scripts/fetch_rankings.py` 只用标准库，不需要装依赖。

1. 六路 GitHub Search 查询取候选池
2. 加权相关性打分加身份门，低于阈值丢弃
3. 可选，递归读 git tree 数真实的 `SKILL.md`
4. 与历史快照做差，算 1d / 7d / 30d 星标增量
5. 写出 `data/rankings.json`、`data/rankings.csv`、当日快照

本地跑：

```bash
python invest-skills/scripts/fetch_rankings.py --min-stars 10 --verify 0
```

有 `GITHUB_TOKEN` 时把 `--verify` 提到 60，否则核验那步会吃掉额度。

工作流每天 UTC 00:10 触发，用仓库自带 token，跑完自动 commit `data/`。

## 改东西之前先看这几条

**数据文件不要手改。** `data/` 下三个位置都由脚本生成，下次 Actions 会整体覆盖。要改排名就改脚本里的权重。

**筛选阈值是一个常量。** `scripts/fetch_rankings.py` 里的 `RELEVANCE_THRESHOLD`，现在是 3。权重在 `relevance()` 里，仓库名 +4、topics +3、简介 +3、泛技能合集 −6、跨领域合集 −4。调松调紧改这里，别在数据里挑。

**文案要改两处。** 页面上可见的中文写在 `index.html` 的 `data-i18n` 属性里，实际文本在 `assets/app.js` 的 `I18N` 对象。只改 HTML 不生效，`applyStatic()` 会用字典覆盖。

**配色只有蓝和灰。** 新增样式一律从 `:root` 的 `--blue-*` 和 `--ink-*` 里取，不要引入第二个强调色。涨跌也用蓝色，不用红绿。

## 踩过的坑

**文件名不能带回车。** 这个仓库曾经有个 `.nojekyll\r` 的文件，Windows 上 `git clone` 直接失败，报 `invalid path`。任何提交前确认文件名是干净的。

**CRLF 警告可以忽略。** 仓库里存的是 LF，Windows 检出变 CRLF，`git add` 时会刷一屏 `LF will be replaced by CRLF`。不影响部署。

**搜索接口单查询最多 5 个 AND / OR / NOT。** 超了返回 `HTTP Error 422`，不是语法错，是运算符数量超了。

**未认证额度很低。** search 10 次每分钟，core 60 次每小时。递归读 tree 很费额度，30 个仓库就能把 core 打满，脚本会开始打印等待。

**访问统计依赖第三方。** 页脚 PV/UV 来自不蒜子，脚本异步加载。拉不到时整块保持隐藏，这是预期的降级行为，不要改成显示 0。主页和文章页不装统计，也不引任何外部资源。

**Chrome headless 的窗口最窄 500px。** `--window-size=390,844` 会被夹到 500，截出来的图右侧像被切了，其实是渲染宽度和截图宽度不一致，不是布局溢出。验窄屏从 500 起。

## 部署

没有构建步骤。改完直接 push 到 `main`，GitHub Pages 自动发布，大约 40 秒生效。

```bash
git add -A
git commit -m "feat(invest-skills): 说明改了什么"
git push origin main
```

改完到线上确认一次，`https://master-640.github.io/invest-skills/` 返回 200 且内容确实变了。本地 `file://` 打开会因为 CORS 拿不到 JSON，要预览就起个 `python -m http.server`。

根目录主页和文章页不拉任何 JSON，双击本地文件就能看，不用起服务；上线后照样在 `https://master-640.github.io/` 上确认一次 200。

## 已知的欠账

- 榜单头部第一页的 7d / 30d 增量要等历史快照攒够才有数，首期为空属于正常
- `EverMind-AI/SkillCorpus` 疑似误收，靠 topics 里的擦边词进来的，阈值调整可以剔掉
- 访问统计只有页面显示，没有 API，拿不到原始数据做每日汇总
