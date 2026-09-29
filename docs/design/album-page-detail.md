# 画册页「详情收纳」改造 · 已完成现状说明

> 状态：**已完成**。本文件不是任务，是现状记录——让接手 agent 知道画册页已经做过什么，避免重复改造或误删。改动已通过全部测试。

---

## 一、已完成的改动

画册页（`src/features/album/AlbumPage.tsx`）已做「简约化」：把散落在页面的技术性小字（来源、发生/记录时间、修订版、授权状态、观察依据等）从主内容区剥离，统一收进**右上角「详情」浮层**。

- 翻书画册外壳（`product-album-book` 的 3D 翻页 + 投影）**保留未动**。
- 记录片段：去掉卡片背景与左边框，只留「标签 + 原话」。
- 资料卡：只留照片 + 标题 + 一句说明，元信息进详情。
- 观察区：只留标题 + 正文 +「不是这样」按钮，依据/不确定性/引用记录进详情。
- 天气保留可见（它是生活内容，且被测试要求可见）。

---

## 二、新增的 DOM 结构

`AlbumPage.tsx` 头部右侧新增「详情」开关：

```tsx
<div className="story-page-detail screen-only">
  <button className="story-detail-toggle" aria-expanded={...} aria-controls="album-detail-panel">详情 ↓</button>
  {detailOpen && (
    <div className="story-detail-panel" id="album-detail-panel" role="region">
      <p className="story-detail-label">…页面标识…</p>
      <p className="story-detail-note">…仅自己可见…</p>
      <div className="story-detail-group">
        <p className="story-detail-title">记录来源</p> …
      </div>
      <div className="story-detail-group"> …资料授权… </div>
      <div className="story-detail-group"> …观察依据（含 story-detail-evidence）… </div>
    </div>
  )}
</div>
```

对应的新 CSS 类（在 `src/styles/app.css`，追加在 `.story-page-footer` 之后）：

```
.story-page-detail  .story-detail-toggle  .story-detail-panel
.story-detail-label .story-detail-note   .story-detail-group
.story-detail-title .story-detail-item   .story-detail-evidence
```

---

## 三、被移除的旧结构（配色/后续改动的注意点）

主内容区这些旧类已不再渲染（原 JSX 已删，对应 CSS 目前是死规则，可留可清）：

- `.story-entry-source`（记录来源行）
- `.story-page-private`（「仅自己可见」标签）
- `.story-page-overline`（页面模式 overline）
- `.story-observation-basis` / `.story-observation-uncertain`（依据 / 仍不确定）
- `.story-evidence`（原「查看观察依据」的展开块）

> 提示：`print.css` 第 21–22 行仍引用 `.story-entry-source`、`.story-observation-basis` 等，现在成了死规则；做配色或清理时若见到这些类名，属预期，不必补回去。

---

## 四、对配色任务的衔接提醒

详情面板的 `.story-detail-*` 类**当前使用了少量硬编码色**（`#b5c6b9`、`#47705f`、`#f1f0e8`、`#507260` 等），做 `color-scheme.md` 的硬编码替换时，这些类**也要一并 token 化**：

- `.story-detail-toggle` 的边框 `#b5c6b9` → `var(--border)`，文字 `#47705f` → `var(--accent)`
- `.story-detail-panel` 背景 `var(--leaf)` → `var(--surface)`，边框 `var(--edge)` → `var(--border)`
- `.story-detail-evidence` 背景 `#f1f0e8` → `var(--bg)`
- `.story-detail-title` 的 `#47705f` → `var(--accent)`

---

## 五、当前测试状态

```
npm test   # 59 passed（含 AlbumPage 的 4 个契约测试）
npx tsc -b # 零错误
```

若接手 agent 后续改 `AlbumPage.tsx`，请保持这 4 个测试契约：`记录片段` 标签可见、合成照片 fallback 可见、`你的原话修正` 存在、天气 `多云 · 22℃` 可见。
