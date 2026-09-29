# 心灵画册 · 前端改造任务书（索引）

> 本目录是交付给实现 agent 的任务书，共三份。三份互相独立、互不干扰，但**执行顺序有要求**（见下）。

---

## 执行顺序

```
1. remove-demo-pages.md   （先删演示页，减少文件数）
2. color-scheme.md        （后做配色替换，少处理 4 个已删文件的颜色）
```

理由：先删「阿禾的两天」「节奏」两个演示页及其独享文件，再做配色替换时就不用改到这些即将删除的文件；`color-scheme.md` 里的硬编码颜色清单是全量扫描的，属于已删文件的色值自然作废、跳过即可。

---

## 文档清单

| 文档 | 用途 | 状态 |
|---|---|---|
| [`remove-demo-pages.md`](./remove-demo-pages.md) | 删除 `?demo=story`（阿禾的两天）与 `?demo=rhythm`（节奏）两个演示页，彻底清理 | 待执行 |
| [`color-scheme.md`](./color-scheme.md) | 配色替换：纸墨日记（主）+ 深色暖光（备用），含字体方案与硬编码颜色替换清单 | 待执行 |
| [`album-page-detail.md`](./album-page-detail.md) | 画册页「详情收纳」改造的现状说明 | **已完成**（无需执行） |

---

## 关键依赖与注意

1. **`album-page-detail.md` 不是任务，是现状**——画册页（`AlbumPage.tsx`）已经做过「右上角详情收纳技术小字」的改造，接手 agent 不要重复做，也不要误删新增的 `.story-detail-*` 结构。

2. **两件待办有先后**：`remove-demo-pages.md` 会改 `AlbumPage.tsx`（删 `mode` / `synthetic` 模式）；`color-scheme.md` 也会动 `AlbumPage` 的样式。务必**先删后配色**，否则配色时改到即将删除的 `synthetic` 文案。

3. **共享模块不可删**（已在 remove-demo-pages.md 第四节列明）：
   - `src/domain/selectors.ts`、`invitations.ts`、`journal.ts`
   - `src/data/behaviorSamples.ts`
   - `src/features/data/DataInsights.tsx`、`src/features/free/FreeTrial.tsx`

4. **每个任务各自的验证命令**已写在对应文档末尾（`npm test` / `npx tsc -b` / `npm run build`）。当前基准：`npm test` = 59 passed，`tsc` 零错误。

5. **视觉参考**：仓库外有临时预览 `D:\soul-album-colors.html`（可切换配色方案看效果），核心仍以 `color-scheme.md` 的色值为准。

---

## 项目当前整体状态

- 默认入口是 `FreeTrial`（对话 / 画册 / 生活数据三页）。
- 画册页简化（详情收纳）已完成、测试全绿。
- 待办：删演示页 → 换配色。
