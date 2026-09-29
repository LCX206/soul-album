# 心灵画册 · 配色与字体规范（交付实现）

> **状态：方案 A「纸墨日记」已于 2026-09-29 16:42 在 `D:\soul-album` 落地**，四项验证全绿（单测 61 / e2e 63 / lint 0 / build 2.57s）。
> 实现范围、三处对本文的有意偏离、以及数据页三色区分的补充决定，见 `AGENTS.md` 第五节。
> `D:\CodexProjects\soul-album`（Hermes 侧）**仍是旧配色**，尚未跟进。

> 目标：替换当前「治愈系大地色」（暖米 `#f7f4ed` + 墨绿 `#24332e` + 灰绿 `#5c8c7b` + 暖棕 `#ba9360` + 衬线标题），落地两套方案。
>
> - **方案 A「纸墨日记」**：浅色，主推。
> - **方案 B「深色暖光」**：深色，备用（以后做深色模式用）。

---

## 一、设计 Token

### 方案 A · 纸墨日记（主推）

```css
:root {
  --bg: #fbfaf7;              /* 页面背景：纸白，极淡暖（不是米黄） */
  --surface: #ffffff;         /* 卡片/表面 */
  --text: #242424;            /* 主文字：深灰墨 */
  --muted: #757575;           /* 次要文字：淡墨 */
  --border: #e7e4de;          /* 边框/分隔线：纸纹暖灰 */
  --accent: #c03d2a;          /* 强调色：正朱红（印章） */
  --accent-soft: #faeae6;     /* 强调色浅底（选中态 / hover） */
  --on-accent: #ffffff;       /* 强调色上的文字（按钮/气泡内） */

  --serif: "Noto Serif SC", "Songti SC", "STSong", serif;                       /* 仅用于记录原文 */
  --sans: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;     /* 界面主体 */
}
```

`:root` 顶部的 `color` / `background` 同步改为：

```css
color: #242424;
background: #fbfaf7;
```

### 方案 B · 深色暖光（备用）

```css
:root {
  --bg: #161616;
  --surface: #222224;
  --text: #f5f5f7;
  --muted: #a1a1a6;
  --border: #333336;
  --accent: #ff7a3d;
  --accent-soft: #3a2a1e;
  --on-accent: #161616;

  --serif: "Noto Serif SC", "Songti SC", "STSong", serif;
  --sans: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
}
```

> 落地时先落方案 A 作为默认 `:root`；方案 B 保存备用，将来做深色模式时用 `[data-theme="dark"]` 或 `@media (prefers-color-scheme: dark)` 挂载。

---

## 二、旧 Token → 新 Token 映射

改 `src/styles/tokens.css` 时用这张表（全项目 `var()` 引用一并替换）：

| 旧 token | 新 token | 说明 |
|---|---|---|
| `--paper` | `--bg` | 页面背景 |
| `--leaf` | `--surface` | 卡片表面 |
| `--ink` | `--text` | 主文字 |
| `--muted` | `--muted` | 名字保留，值改为 `#757575` |
| `--edge` | `--border` | 边框/分隔线 |
| `--green` | `--accent` | 原强调绿 → 朱红 |
| `--warm` | `--accent` | 原暖棕点缀并入强调色 |
| `--display` | `--sans` | 标题去衬线（加粗区分层级） |
| `--body` | `--sans` | 正文 |
| （新增） | `--accent-soft` | 强调色浅底 |
| （新增） | `--on-accent` | 强调色上的文字 |
| （新增） | `--serif` | 记录原文衬线 |

---

## 三、字体方案

- **界面主体**（标题、导航、按钮、标签、正文）：统一 `--sans` 无衬线。标题用 `font-weight` 与字号区分层级，**不再用衬线**。
- **记录原文 / 观察正文**（用户亲手写下的原话）：用 `--serif` 衬线，营造"手写原话"的日记质感。

需要改为 `--serif` 的类（在 `app.css` 中）：

```
.story-entry blockquote
.story-observation-text
.story-user-correction p
.story-agent-reading p
.story-evidence blockquote
.quote-block blockquote
```

其余所有用到 `font-family: var(--display)` 的地方（`.product-brand strong`、`.story-page-header h2`、`.product-header h1`、`.album-date strong`、`.hero-copy h2` 等）一律改为 `var(--sans)`。

---

## 四、硬编码颜色替换（按语义归类）

> 原则：`product.css` / `app.css` 里所有散落的硬编码色值，按下面归类替换成对应 `var()`；不要保留旧色值。

### A. 绿色强调 → `var(--accent)`（朱红 / 暖橙）

深绿实心按钮背景、深强调文字、选中态文字：

```
#416f58  #3f6755  #264d3b  #3a5a4d  #385a4c  #376556
#456d5d  #426554  #48745e  #47705f  #527663  #527661
#527262  #4e6758  #507260  #537b6a  #57806c  #648573
#789183  #8aa392  #8fa797  #98ad9e  #9db1a3  #9eb2a2  #a9b9ad
```

### B. 浅绿背景（选中态 / hover）→ `var(--accent-soft)`

```
#d0e1d3  #dce9dd  #e9efe9  #e6eee6  #e7eee6  #edf2ea
#eef3ea  #eef2ea  #ebf0e8  #eaf0e8  #eaf0e9  #e0ebe0
#dfeddf  #edf3ed  #eef3ee  #f0f3ec  #eef3ea
```

### C. 米色 / 纸感背景 → `var(--bg)` 或 `var(--surface)`

> 卡片浅底、分隔块背景：主卡片用 `--surface`，页内浅背景块用 `--bg`。

```
#f8f6f0  #faf8f2  #f7f6f0  #f4f1e9  #f1f0e8  #fcfbf6
#fbfaf5  #faf9f4  #f2f6ef  #f4f6f1  #f8faf5  #f2f0e8
#fffefa  #efede5  #ebe5d9  #eae4d8  #e9e4d8  #ecece6
```

### D. 灰绿文字 → `var(--muted)`

```
#66736c  #71847a  #69766f  #65746c  #52685b  #7e8c80  #7b877f
```

### E. 灰绿边框 / 分隔线 → `var(--border)`

```
#b9c7ba  #b5c6b9  #bdcabc  #bbcbbd  #b9c9bd  #b3c4b5
#afc8b7  #adc3b1  #a7bdb1  #a1b5a5  #abb9af  #bac6bd
#bacbbf  #bdcdbf  #cad8cc  #c8cabc  #d2ddcf  #cfD7cc
#dcded6  #dde2dc  #e1e5df  #e2e2d8  #dfdfd4  #dedbd0
#d9e3d8  #cfdecf  #cfd8cb  #bed4c4  #cfe1cf
```

### F. 特殊项

```
#8a704d   → var(--accent)   /* story-agent-reading 标题，原暖棕 */
#cfD7cc   → var(--border)   /* story-source-card 边框，注意大写 D */
#e9eee8   → var(--bg)       /* 旧 hover */
#e9e4d8   → var(--border)   /* landing 装饰线 */
#efece3   → var(--bg)       /* landing 引文背景 */
```

---

## 五、落地步骤（建议顺序）

1. **改 `src/styles/tokens.css`**：用方案 A 的 token 替换现有 `:root`（含 `color` / `background` / `font-family`），并新增 `--accent-soft`、`--on-accent`、`--serif`、`--sans`。
2. **全局替换旧 token 名**：按第二节映射表，把 `var(--paper)`→`var(--bg)`、`var(--leaf)`→`var(--surface)`、`var(--ink)`→`var(--text)`、`var(--edge)`→`var(--border)`、`var(--green)`→`var(--accent)`、`var(--warm)`→`var(--accent)`、`var(--display)`→`var(--sans)`、`var(--body)`→`var(--sans)`。
3. **替换硬编码颜色**：按第四节归类，把 `product.css` / `app.css` 里的色值换成对应 `var()`。
4. **字体微调**：按第三节，把记录原文/观察正文的 `blockquote` 与 `p` 改为 `--serif`。
5. **验证**：
   ```bash
   npm test          # 期望 59 passed（当前基准）
   npx tsc -b        # 期望零错误
   npm run build     # 期望构建通过
   ```

---

## 六、注意

- `--accent-soft` 用于「选中导航」「hover 背景」「头像浅底」这类需要淡强调底的地方。
- 深色方案 B 的 `--on-accent` 是深色（`#161616`），浅色方案 A 是白色（`#ffffff`）；替换按钮/气泡时用 `var(--on-accent)` 而不是写死白字。
- 不要新增任何新的硬编码颜色；后续一律用 token。
