# 画册翻页 · 诊断与改进方案

> 状态：**方案稿，尚未实现**。本文件由 WorkBuddy 与 Hermes 各自独立检测后合并（检测时间 2026-09-29）。
> 实测对象：`D:\soul-album`，dev server `http://127.0.0.1:4173/`，Playwright chromium-1243。

---

## 0. 一句话结论

翻页的「不协调感」**不是性能问题**——实测稳定 60fps、无长任务、无内容裁剪。它是三处**编排错误**叠加的结果：

1. 目标页在动画**第一帧**就渲染完成，整本书高度随之瞬间跳 **276px**；
2. 翻页纸只转到 **108°** 就靠透明度**淡出**收场，从未落到对面；
3. 内容切换被甩到动画的**首帧或末帧**做硬切（向后翻硬切右页、向前翻硬切左页）；
4. 窄屏下纸会转出书框被 `overflow:hidden` 裁掉（最多 170px，≈书宽 47%）；翻页还会把右侧展开的「详情」面板顶掉。

修好的核心就一句话：**让纸真正翻满 180° 落到对面，把「内容切换」整个藏进翻页过程里。**

---

## 1. 实测证据

方法：用 Playwright 冻结 `.album-turn-sheet` 的动画（Web Animations API `pause()` + 设 `currentTime`），逐帧截图并从 `matrix3d` 反算 rotateY；另用 rAF 采样真实帧间隔、`PerformanceObserver` 抓长任务。翻页方向为「向前翻，第 8 天 → 第 2 天」。

### 1.1 角度与透明度的真实轨迹

| 时间 | rotateY | opacity | 说明 |
|---|---|---|---|
| 0 ms | 0° | 1.000 | 起手 |
| 77 ms | 39.8° | 1.000 | 加速很快 |
| 160 ms | 61.9° | 1.000 | 已走完 57% 的角度 |
| 256 ms | 67.3° | 1.000 | |
| **333 ms** | **68.0°** | 1.000 | **77ms 内只转 0.7°：纸在空中停住了** |
| 422 ms | 96.5° | 0.287 | 透明度开始崩塌 |
| 512 ms | 106.1° | 0.047 | |
| 639 ms | **108.0°** | **0.0000007** | 终点：没到 180°，而且已经看不见了 |

**读法**：40% 的时间走完 62% 的角度 → 停在 68° → 剩下 48% 的时间一边慢慢挪到 108° 一边淡出。这是一次「急冲—悬停—溶解」，不是一次翻页。

### 1.2 书本高度跳变（最严重的观感问题）

| 时刻 | 第 8 天(长) → 第 2 天(短) | 第 2 天(短) → 第 8 天(长) |
|---|---|---|
| 点击前 | 837.7 px | 562 px |
| 第 4 帧左右（51 / 60 ms） | **562 px（跳 −275.7）** | **837.7 px（跳 +275.7）** |
| 动画结束 | 562 px | 838 px |

因为 `bookBaseAlbum = bookTurnTarget ?? album`，目标页在动画第一帧就渲染完毕；`.product-album-book` 的高度由两页最高的那一页决定，于是整本书（连带下方控制条、折叠面板）在翻页中途整块跳 276px。

### 1.3 没有问题的部分（别乱改）

- **帧率**：4 次翻页实测帧间隔 p50 16.6ms / p90 17.4 / p99 18.8 / max 23ms，**无 >50ms 长任务**。屏蔽 `filter: drop-shadow` 后中位数 16.7ms，没有差别。
- **无布局抖动**：两页同高时，翻页全程 book 恒为 972×562，左右页 485×560。
- **桌面端无内容裁剪**：第 8 天堆到 ~300 字时页面自然增高到 685px，`scrollHeight === clientHeight`，没有截断。（窄屏有问题，见 C8。）
- **reduced-motion 分支正确**：`prefers-reduced-motion: reduce` 时直接跳页、不出翻页纸（实测点击后立即无 `.album-turn-sheet`）。
- **交互安全**：翻页期间纸 `inert` + `pointer-events: none`，两个按钮 `disabled`，焦点不乱跑。

---

## 2. 「不协调感」成因清单

| # | 现象 | 根因 | 证据 |
|---|---|---|---|
| **C1** | 整本书中途跳 276px | `bookBaseAlbum = bookTurnTarget ?? album`（FreeTrial.tsx:563）让目标页在第一帧就换好；书高由最高页决定 | §1.2 逐帧高度序列 |
| **C2** | 向后翻时右页在**第 0 帧**硬切 | 纸在左半边（`.album-turn-previous{left:0;width:50%}`），遮不住右页；而右页已是目标日 | 冻结帧：翻页期间右页文字 = 目标日 |
| **C3** | 向前翻时左页在**最后一帧**硬切 | `bookBasePreviousDay = previousAlbumDay`（:567）按「旧当前日」算，提交后按「目标日」算，两者差一天 | 翻页期间左页=第1天，结束瞬间=第2天 |
| **C4** | 向后翻时同一页被画**三遍** | C3 的连带后果：目标日恰好等于「旧当前日的前一天」，于是底层左页、翻页纸、右页全是第 2 天 | 截图 `prev-f052.png` |
| **C5** | 纸在空中停顿 ~80ms | 关键帧把 −68° 放在 52%，配合 `cubic-bezier(.32,.72,.22,1)` 这种「前段就冲到终点值」的曲线 | §1.1 333ms 行 |
| **C6** | 投影与纸不同步 | 纸用 `cubic-bezier(.32,.72,.22,1)`，`::after` 投影层用 `ease`（同一事件两套时间律）；投影是**固定位置的渐变带**，只改透明度，不随角度移动 | Web Animations API 导出的 keyframes |
| **C7** | 兜底计时器余量只有 210ms | `BOOK_TURN_FALLBACK_MS = 850`（:18）vs 动画 640ms | 实测拦截到被注册的定时器 = `[850]` |
| **C8** | **窄屏（≤760px）翻页时纸被裁掉** | `.album-turn-sheet{left:0;width:100%}`（:267）绕整页边缘转出书框，而 `.product-album-book{overflow:hidden}`（:168）直接切掉超出部分 | 390px 实测：75% 进度时纸的投影框 `[377,521]` vs 书本框 `[15,375]` → 溢出 **146px**（末帧 170px，≈书宽的 47%）。Hermes 独立提出，我已复现 |
| **C9** | **翻页瞬间右侧「详情」面板被强制关闭** | 右页 `key={bookBaseAlbum?.day}`（:1134）在 `bookTurn` 置位时改变 → `AlbumPage` 整棵卸载重挂，内部 `detailOpen` 归零 | 翻页前 `aria-expanded=true`、面板可见；翻到 30% 时变 `false`、面板消失。同一根因还会重置 `SourcePhoto` 的 `failed` 状态（Hermes 指出，未单独验证） |

---

## 3. 「AI 味」成因清单

| # | 现象 | 为什么假 |
|---|---|---|
| **A1** | 只转 108° 就淡出 | **真实纸张不会在半空中溶解。**它要么落在对面，要么被手按回去。这是最致命的一条——目标页早已在下面完整可见，所以这不是「翻页」而是「交叉溶解」 |
| **A2** | `scaleX(1 → .985 → .97)` | 纸在做 3D 旋转时会因为**透视**自然变窄，不需要额外横向缩放。加上去以后像被压扁，读起来是「卡片打滑」 |
| **A3** | `translateZ(0 → 9px → 3px)` | 整张纸平行浮起来。真实的纸是**沿书脊弯折**的，不是一块平板整体抬升 |
| **A4** | 两个方向用完全对称的参数 | 同一组数值正负互换。真实的翻页前后不对称：起始被手指带着走，末段靠自重和纸张挺度落定 |
| **A5** | 全程没有光照变化 | 纸背永远是一张固定的 `linear-gradient`；正面亮度恒定；投影只在中间闪一下。真实纸张转离光源时会**整体变暗** |
| **A6** | 背面是空白渐变 | 真实翻页时你会看到纸的另一面对应的**内容**（本次应显示「新左页」内容） |
| **A7** | 两页都是 1px 边框的平面 | 没有纸厚、没有书口、没有落页时压出的沟槽阴影 |

---

## 4. 改进方案

### P0 · 协调性（必修，改完「不协调感」基本消失）

#### P0-1 让底层两页在整段动画里就等于最终状态

只要搞清楚真实书籍的拓扑，规则就很明确：**被翻的那张纸，正面是「翻走的那页」，背面是「翻到的那页」**；底层两页在整个过程中保持最终内容。

| 方向 | 底层左页 | 底层右页 | 纸正面 | 纸背面 |
|---|---|---|---|---|
| 向前 next（A→T） | `prev(A)`（**不用改**） | `T`（**不用改**） | A 的完整页（**不用改**） | **`AlbumPreviewPage(A)`（要加）** |
| 向后 previous（A→T） | **`prev(T)`（要改）** | `T`（不用改） | `prev(A)` 预览（**不用改**） | **T 的完整页（要加）** |

改法（`src/features/free/FreeTrial.tsx`）：把 `bookBasePreviousDay` 在**向后翻**时按目标日推导：

```
const bookBaseAlbumDay = bookBaseAlbum?.day ?? albumDay
const bookBaseIndex2 = recordedDays.indexOf(bookBaseAlbumDay)
const bookBasePreviousDay = bookBaseIndex2 > 0 ? recordedDays[bookBaseIndex2 - 1] : null
```

并给 `<BookTurn>` 增加两个字段，让纸的两面拿到正确内容：

```
type BookTurn = {
  direction: 'next' | 'previous'
  fromDay: number
  toDay: number
  frontDay: number            // 纸正面 = 翻走的那页
  backIsPreview: boolean      // 纸背面是「预览」还是「完整页」
  backDay: number             // 纸背面承载的日
}
```

- next：`frontDay = fromDay`、`backIsPreview = true`、`backDay = fromDay`（背面 = 旧日的预览 = 新左页）
- previous：`frontDay = prev(fromDay)`、`backIsPreview = false`、`backDay = toDay`（背面 = 目标日的完整页 = 新右页）

> 验收：翻页**任意一帧**，底层左页/右页的文字都必须等于动画结束后的最终内容。

#### P0-2 动画期间锁住书高

翻页纸挂载时记下当前高度，写进行内样式，`animationend` 后再释放：

- 起手：`bookTurn` 置位的同一帧读 `bookRef.current.getBoundingClientRect().height`，存进 state；
- 渲染：`<div className="product-album-book" style={bookLockHeight ? { height: bookLockHeight } : undefined}>`
- `.product-album-book` 已有 `overflow: hidden`；两页需要 `align-self: stretch` 才能跟着拉伸（`.album-book-page` 补一条）。
- 释放后如果新高度不同，用 `transition: height .22s ease-out` 平滑过去（这一步属 P1，可后做）。

> 验收：翻页全程 book 高度变化 < 2px。

#### P0-3 纸真正翻满 180°，并去掉淡出

```css
.album-turn-next     { animation: album-turn-next .64s both; }
.album-turn-previous { animation: album-turn-previous .64s both; }

@keyframes album-turn-next {
  0%   { transform: rotateY(0deg);    animation-timing-function: cubic-bezier(.36, 0, .74, .52); }
  18%  { transform: rotateY(-24deg);  animation-timing-function: cubic-bezier(.24, .06, .48, .98); }
  52%  { transform: rotateY(-92deg);  animation-timing-function: cubic-bezier(.3, .1, .4, 1); }
  84%  { transform: rotateY(-184deg); animation-timing-function: cubic-bezier(.34, .05, .3, 1); }
  100% { transform: rotateY(-180deg); }
}
@keyframes album-turn-previous {
  0%   { transform: rotateY(0deg);    animation-timing-function: cubic-bezier(.36, 0, .74, .52); }
  18%  { transform: rotateY(24deg);   animation-timing-function: cubic-bezier(.24, .06, .48, .98); }
  52%  { transform: rotateY(92deg);   animation-timing-function: cubic-bezier(.3, .1, .4, 1); }
  84%  { transform: rotateY(184deg);  animation-timing-function: cubic-bezier(.34, .05, .3, 1); }
  100% { transform: rotateY(180deg); }
}
```

要点：
- **删掉 `opacity` 关键帧**（不再淡出）；
- **删掉 `scaleX`**；
- 角度分布按「松手加速 → 90° 附近角速度最大 → 过冲 4° → 回正落定」，与真实纸张一致；
- 84% 的过冲是「纸落定」的关键，机械感主要就是**没有过冲**造成的；
- 反面朝上时正面被 `backface-visibility: hidden` 藏掉，背面露出——此时背面已经有正确内容（P0-1）。

#### P0-4 兜底计时器与事件去重

- `BOOK_TURN_FALLBACK_MS`：`850 → 1000`（给动画留 360ms 余量）。
- `onAnimationEnd` 现在挂在纸上；一旦纸内部再加带动画的元素，`animationend` 会**冒泡**上来重复触发。加一道判断：

```
onAnimationEnd={(event) => {
  if (event.target !== event.currentTarget) return
  if (event.animationName !== 'album-turn-next' && event.animationName !== 'album-turn-previous') return
  completeBookTurn()
}}
```

#### P0-5 修窄屏裁切（C8）

窄屏（≤760px）不要再用「绕整页边缘做 3D 旋转」——纸一定会转出书框。二选一：

- **省事**：窄屏改用 2D 过渡，`.album-turn-sheet` 保持 `left:0;width:100%`，动画改成 `translateX(0 → -14%) + opacity(1 → 0)`（或 `scaleX` 轻微压缩），不做 rotateY。窄屏失去纵深，但换来不裁切。
- **保留 3D**：`.product-album-book` 的 `overflow: hidden` 改成 `overflow: clip`；同时把窄屏的 rotateY 上限压到 ±90°、去掉 `translateZ`，让纸始终留在框内。

> 验收：390px 视口下翻页全程，纸的投影框不得超出书框左右边界。

#### P0-6 保住「详情」面板状态（C9）

根因是右页的 `key={bookBaseAlbum?.day}` 在翻页瞬间变化，导致 `AlbumPage` 整棵重挂。`key` 大概率是**故意加的**（用来在换日时重置图片 `failed` 等 per-day 状态），所以不要简单删掉，推荐把「详情开关」提升为受控：

- `FreeTrial` 持有 `detailOpenDay: number | null`，传给 `AlbumPage`；
- `AlbumPage` 的 `detailOpen` 改成由 props 控制（受控组件）；
- `key` 保留，仍会在换日时重置图片等内部状态。

> 验收：展开「详情」后点翻页，面板在整段动画中保持展开，动画结束后若换到了新的一天再按新一天的状态显示。



### P1 · 物理与光照（纯 CSS，观感从「能用」到「像纸」）

#### P1-1 光照随角度走

给纸里加一个跟随旋转的阴影层（它和纸一起在 3D 里转，所以光照是「跟着纸」的）：

```tsx
<span className="album-turn-shade" aria-hidden="true" />
```

```css
.album-turn-shade {
  position: absolute; z-index: 3; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(36,36,36,.26), rgba(36,36,36,0) 62%);
  animation: album-turn-shade .64s both;
}
@keyframes album-turn-shade { 0% { opacity: 0 } 46% { opacity: .85 } 88% { opacity: .18 } 100% { opacity: 0 } }
```

#### P1-2 投影改为随角度扫过、并与纸同律

`.product-album-book::after` 的 `ease` 改成与纸同分布，并把两个方向的渐变镜像开：

```css
.is-turning-next::after     { animation: album-turn-cast-next .64s both; }
.is-turning-previous::after { animation: album-turn-cast-previous .64s both; }
@keyframes album-turn-cast-next {
  0%   { opacity: 0 }
  46%  { opacity: .26; background: linear-gradient(90deg, rgba(36,36,36,.14) 0%, transparent 46%); }
  100% { opacity: 0 }
}
@keyframes album-turn-cast-previous {
  0%   { opacity: 0 }
  46%  { opacity: .26; background: linear-gradient(90deg, transparent 54%, rgba(36,36,36,.14) 100%); }
  100% { opacity: 0 }
}
```

#### P1-3 清理与性能

- `.album-turn-sheet` 的 `will-change: transform, filter, opacity` → `will-change: transform`；
- **移除 `filter: drop-shadow()`**：它是 grouping 属性，按规范会让同元素的 `transform-style: preserve-3d` **失效**（计算值仍显示 `preserve-3d`，但实际被展平），而且每帧重算阴影。本机实测没掉帧，但这是白付的代价。

### P2 · 纸感增强（可选）

1. **纸厚与书口**：`.album-turn-face` 的迎边（远离书脊那一侧）加 2px 渐变边，模拟纸的厚度。
2. **落页沟槽**：纸落到对面后，书脊一侧 6-10px 加一条向内渐深的阴影。
3. **纸背镜像文字**（很轻，`opacity: .06`）：让背面像真的透光。
4. **窄屏单页模式**（`≤` 断点时 `.album-turn-sheet` 变 `left:0;width:100%`）：书脊锚点在左边缘，翻页像掀整页而不是翻书，建议单独一套 origin 或直接改成淡入淡出 + 位移。
5. **三片式卷曲**（最像纸、成本最高）：把纸拆成 3 条竖带，各自角度差 3-6°，做出纸张弯曲。放最后做。

---

## 5. 验收与测试

**新增 e2e（把现有的缺陷断言反过来说）**

1. `翻页任意一帧，底层左页/右页内容 === 动画结束后的最终内容`（覆盖 C2/C3/C4）
2. `翻页期间 .product-album-book 高度变化 < 2px`（覆盖 C1）
3. `向前翻时，纸的背面含 prev(旧日) 的内容`（覆盖 A6/P0-1）
4. `390px 视口下翻页全程，纸的投影框不超出书框左右边界`（覆盖 C8）
5. `展开「详情」后点翻页，面板在动画期间保持展开`（覆盖 C9）

**现有 63 条 e2e 需要改的只有 1 处**：`tests/product-shell.spec.ts:399`

```
- await expect(page.locator('.album-book-page-left')).toContainText('第一天看见了晚霞。')
+ await expect(page.locator('.album-book-page-left')).toContainText('谢谢你，愿意为今天停一停')
```

理由：向后翻（第 2 天 → 第 1 天）时，底层左页改为按目标日推导（第 1 天没有前一天 → 扉页）。400/402/408/411 行的断言与修改后一致，不用动。

**逐帧复验脚本**：`_backup/turn_probe.cjs` 复跑，要求末帧 `rotateY ≥ 178°`、`opacity = 1`、逐帧角速度无平台期。

---

## 6. 与 Hermes 的独立检测交叉核对

两边各自独立读了同一份代码（我在 `D:\soul-album`，Hermes 在它那份副本），结论高度重合，又各自补上了对方漏掉的东西。

### 6.1 一致项（相互独立确认，可信度高）

1. **108° + 淡出是首要问题**，且「补满 180° + 删掉淡出 + 背面放内容」是杠杆最高的一处改动；
2. 向后翻时同一页被渲染**三遍**、当前日整个消失；
3. 左页/右页在动画**首帧或末帧硬切**；
4. 投影层（`ease`）与翻页纸（`cubic-bezier`）**缓动不一致**，且渐变方向不随翻页方向翻转；
5. 纸的**背面是空白渐变**；
6. 关键帧里动 `drop-shadow` + `will-change` 列了 filter/opacity；
7. next / previous **纯镜像对称**，`scaleX`/`translateZ` 是无感的「摆件参数」；
8. 全程**没有动态光照**，纸是刚体、不弯曲。

### 6.2 Hermes 补上、我漏掉的两条（我已逐条复现，见 §2 的 C8 / C9）

- **窄屏翻页被 `overflow:hidden` 裁掉** —— 且比它估计的更严重（它估算 ~30% 宽度，实测末帧溢出 170px ≈ 47%）；
- **翻页瞬间右侧「详情」面板状态被 React key 重挂清零**。

### 6.3 我补上、Hermes 漏掉的三条

- **整本书高度跳 276px**（§1.2）。Hermes 提到了「内容高度跳动」，但归因于 key 重挂，没量到这个量级——它才是第一眼就能看到的那条；
- **空中停顿 80ms 的量化轨迹**（§1.1）。Hermes 指出了 52% 这个中点，但没测出「256→333ms 只转 0.7°」的平台期；
- **性能不是当前症状**。实测 p50 16.6ms、无长任务、屏蔽 `filter` 后中位数无变化。所以 Hermes 关于「52% 附近 paint/raster 高峰造成抽动」的判断**在本机未复现**，它属于弱机风险而非现有问题——**但它主张移除 `filter` 仍然正确**：按规范 `filter` 是 grouping 属性，会让同元素的 `transform-style: preserve-3d` 失效，这是白付的代价。

### 6.4 一处实质性分歧（希望你裁定）

**向后翻时，纸的落点怎么处理：**

| | Hermes 的 P0-1 | 我的 P0-1 |
|---|---|---|
| 做法 | 右页全程保持旧日 N，左页提前露出 N-2，纸片（旧左页预览）飞走 | 右页就是目标日，纸的**背面承载目标日的完整页**，转满 180° 落成新右页 |
| 效果 | 三重重影消失 | 三重重影消失 + **首末帧都没有硬切** |
| 遗留 | 右页仍在动画**末帧**硬切 N→N-1；纸面是「预览」却落在「完整页」的位置，格式不一致（它自己也标注为部分修复） | 需要 P0-3 的 180° 与背面内容一起做 |
| 定位 | **降级方案**：如果决定「先小改一步」就用它 | 目标方案 |

两者不冲突：不做 180° 大改时用 Hermes 那版；做 P0-3 时用我这版，一次到位。

### 6.5 两边数值差异的成因（已查明，不是错误）

Hermes 报的 `#dedbd0` / `#fffefa` / `rgba(31,42,35,…)`、投影关键帧在 52% 且带 `0%,100%` —— 那是**它那份 `D:\CodexProjects\soul-album` 的配色尚未迁移**（仍是旧配色），且两份 `product.css` 相似度仅 55%。角度、`translateZ`、`scaleX`、`perspective:1900px`、`perspective-origin:50% 48%`、760px 断点、850ms 兜底这些关键数值两边**完全吻合**。

---

## 7. 需要你裁定

1. **做到哪一档**：只做 P0（协调性，6 处改动、风险最低）／P0+P1（加光照，观感质变）／全做（含纸感，工作量最大）？
2. **向后翻的落点**：用我的 P0-1（配 180° 一次到位，首末帧都无硬切），还是先上 Hermes 那版小改动降级方案（只消三重重影，末帧仍硬切）？
3. **时长**：维持 640ms，还是改 560ms（更利落）或 720ms（更从容，Hermes 建议 720ms）？
4. **窄屏改法**（C8 已实测被裁，这条不修不行）：改用 2D 滑动（省事、丢纵深）还是保留 3D 但把书框改 `overflow: clip` 并压低角度上限？
5. 改完是否**同步到 Hermes 那份** `D:\CodexProjects\soul-album`（按你定的规则，写它侧文件要你点头）。
