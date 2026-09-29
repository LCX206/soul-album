import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Shanghai' })

test('a sent message appears at once, then the next question waits for typing', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.clock.pauseAt(await page.evaluate(() => Date.now()))
  const conversation = page.getByRole('region', { name: '对话记录' })
  await page.getByRole('textbox', { name: '发送消息' }).fill('今天去了河边。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(conversation).toContainText('今天去了河边。')
  await expect(conversation.getByText('画册正在输入')).toBeVisible()
  await expect(conversation.getByText('第 1 天 · 第 2 题')).toHaveCount(0)
  await page.clock.runFor(2399)
  await expect(conversation.getByText('画册正在输入')).toBeVisible()
  await page.clock.runFor(1)
  await expect(conversation.getByText('画册正在输入')).toHaveCount(0)
  await expect(conversation.getByText('第 1 天 · 第 2 题')).toBeVisible()
})

test('conversation bubbles keep a light left side and a theme-colored right side with small tails', async ({ page }) => {
  await page.goto('/')
  const left = page.locator('.product-bubble-row.agent.current .product-bubble')
  await expect(left).toBeVisible()
  const leftAppearance = await left.evaluate((agent) => {
    const style = getComputedStyle(agent)
    return { background: style.backgroundColor, radius: style.borderTopLeftRadius,
      padding: style.paddingLeft, tail: getComputedStyle(agent, '::after').clipPath }
  })
  await page.getByRole('textbox', { name: '发送消息' }).fill('今天看到了晚霞。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const right = page.locator('.product-bubble-row.user .product-bubble').last()
  await expect(right).toContainText('今天看到了晚霞。')
  const rightAppearance = await right.evaluate((user) => {
    const style = getComputedStyle(user)
    return { background: style.backgroundColor, color: style.color, radius: style.borderTopRightRadius,
      tail: getComputedStyle(user, '::after').clipPath }
  })
  expect(leftAppearance).toMatchObject({ background: 'rgb(250, 234, 230)', radius: '17px', padding: '17px' })
  expect(leftAppearance.tail).toContain('polygon(')
  expect(rightAppearance).toMatchObject({ background: 'rgb(192, 61, 42)', color: 'rgb(255, 255, 255)', radius: '17px' })
  expect(rightAppearance.tail).toContain('polygon(')
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('the conversation shows full dates across days and quiet time markers within a day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-23T11:42:00+08:00') })
  await page.goto('/')
  await page.clock.pauseAt(await page.evaluate(() => Date.now()))
  const conversation = page.getByRole('region', { name: '对话记录' })
  const message = page.getByRole('textbox', { name: '发送消息' })
  const send = page.getByRole('button', { name: '发送', exact: true })
  await expect(conversation.locator('.product-day-divider')).toContainText('2026年9月23日 星期三 11:42')

  await message.fill('星期三的第一句。')
  await send.click()
  await page.clock.runFor(2400)
  await page.clock.pauseAt(new Date('2026-09-23T12:05:00+08:00'))
  await message.fill('过了一会儿的第二句。')
  await send.click()
  await expect(conversation.locator('.product-time-divider')).toContainText('12:05')
  await page.clock.runFor(2400)

  await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
  await page.getByRole('button', { name: '推进到第 2 天' }).click()
  await page.clock.pauseAt(new Date('2026-09-24T17:31:00+08:00'))
  await message.fill('星期四的记录。')
  await send.click()
  await expect(conversation.locator('.product-day-divider')).toHaveCount(2)
  await expect(conversation.locator('.product-day-divider').nth(1))
    .toContainText('2026年9月24日 星期四 17:31')
  await expect(conversation.locator('.product-day-divider').nth(1)).toContainText('演示第 2 天')
  await expect(conversation).toContainText('星期三的第一句。')
  await expect(conversation).toContainText('星期四的记录。')
  await page.clock.runFor(2400)

  await page.clock.pauseAt(new Date('2026-09-25T00:03:00+08:00'))
  await message.fill('跨过午夜的这一句。')
  await send.click()
  await expect(conversation.locator('.product-time-divider').last())
    .toContainText('2026年9月25日 星期五 00:03')
  await page.clock.runFor(2400)

  await page.clock.pauseAt(new Date('2026-09-25T02:45:00+08:00'))
  await message.fill('今天先不聊了')
  await send.click()
  await page.clock.runFor(2400)
  await expect(conversation.locator('.product-time-divider').last()).toContainText('02:45')
  await expect(conversation.locator('.product-bubble-row.user').last().locator('time')).toHaveText('02:45')
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('the conversation is home and an unfinished draft survives tab changes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('region', { name: '对话记录' })).toBeVisible()
  // 三个页签 + 左下角的「清除本次内容」与「详情」
  await expect(page.getByRole('navigation', { name: '产品导航' }).getByRole('button')).toHaveCount(5)
  await expect(page.getByText('今天有什么想记下的？')).toBeVisible()
  await page.getByRole('textbox', { name: '发送消息' }).fill('今天去了河边。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('今天去了河边。')
  await page.getByRole('textbox', { name: '发送消息' }).fill('明天还想继续写')
  await page.getByRole('button', { name: '画册' }).click()
  await expect(page.getByRole('article', { name: '第 1 天画册页' })).toContainText('今天去了河边。')
  await expect(page.getByRole('navigation', { name: '有记录日期' }).getByRole('button')).toHaveCount(1)
  await page.getByRole('navigation', { name: '产品导航' }).getByRole('button', { name: '对话' }).click()
  await expect(page.getByRole('textbox', { name: '发送消息' })).toHaveValue('明天还想继续写')
})

test('historical album browsing never advances the active invitation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: '发送消息' }).fill('第一天的原话。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
  await page.getByRole('button', { name: '推进到第 2 天' }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('第 2 天 · 第 1 题')
  await page.getByRole('textbox', { name: '发送消息' }).fill('随手记：第二天的一句话。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '画册' }).click()
  await page.getByRole('button', { name: '查看第 1 天' }).click()
  await expect(page.getByRole('article', { name: '第 1 天画册页' })).toBeVisible()
  await page.getByRole('navigation', { name: '产品导航' }).getByRole('button', { name: '对话' }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('第 2 天 · 第 1 题')
  await expect(page.getByRole('textbox', { name: '发送消息' })).toBeVisible()
})

test('editing and deleting an answer updates the conversation and album together', async ({ page }) => {
  const old = '只给自己看的旧原话。'
  const revised = '重新写过的原话。'
  await page.goto('/')
  await page.getByRole('textbox', { name: '发送消息' }).fill(old)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '画册' }).click()
  await page.getByText('页面工具').click()
  await page.getByRole('button', { name: '修改这条原话' }).click()
  await page.getByRole('textbox', { name: '修改原话' }).fill(revised)
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByRole('navigation', { name: '产品导航' }).getByRole('button', { name: '对话' }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText(revised)
  await expect(page.getByRole('region', { name: '对话记录' })).not.toContainText(old)
  await page.getByRole('button', { name: '画册' }).click()
  await page.getByRole('button', { name: '删除这条原话' }).click()
  await expect(page.getByText('画册还没有第一页')).toBeVisible()
  await page.getByRole('navigation', { name: '产品导航' }).getByRole('button', { name: '对话' }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).not.toContainText(revised)
})

test('data consent is per source and refresh clears both consent and private words', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: '发送消息' }).fill('只在此页停留的字。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '生活数据' }).click()
  await expect(page.getByRole('img', { name: /七日图表/ })).toHaveCount(0)
  await page.getByRole('button', { name: '显示手表步数示例' }).click()
  await expect(page.getByRole('region', { name: '手表步数当日记录' })).toContainText('6,900 步')
  await page.getByText('查看七日数据').click()
  await expect(page.getByRole('img', { name: /手表步数七日图表/ })).toBeVisible()
  await page.getByRole('navigation', { name: '产品导航' }).getByRole('button', { name: '对话' }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('只在此页停留的字。')
  await page.getByRole('button', { name: '生活数据' }).click()
  await expect(page.getByRole('region', { name: '手表步数当日记录' })).toContainText('6,900 步')
  await expect(page.getByRole('img', { name: /手表步数七日图表/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: '对话记录' })).not.toContainText('只在此页停留的字。')
  await page.getByRole('button', { name: '生活数据' }).click()
  await expect(page.getByRole('region', { name: '手表步数当日记录' })).toContainText('未提供')
  await expect(page.getByRole('img', { name: /七日图表/ })).toHaveCount(0)
})

for (const width of [375, 1440]) {
  test(`product layout at ${width}px keeps the composer and navigation separate`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')
    await expect(page.getByRole('region', { name: '对话记录' })).toBeVisible()
    await page.getByRole('textbox', { name: '发送消息' }).fill('今天看到了窗边的一束光。')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(horizontalOverflow).toBeLessThanOrEqual(0)
    if (width === 375) {
      const nav = await page.getByRole('navigation', { name: '产品导航' }).boundingBox()
      const composer = await page.locator('.product-composer').boundingBox()
      expect(nav).not.toBeNull()
      expect(composer).not.toBeNull()
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav!.y)
    }
    await page.screenshot({ path: `test-results/product-chat-${width}.png` })
    await page.getByRole('button', { name: '画册' }).click()
    await page.screenshot({ path: `test-results/product-album-${width}.png` })
    await page.getByRole('button', { name: '生活数据' }).click()
    await page.getByRole('button', { name: '显示手表步数示例' }).click()
    await page.screenshot({ path: `test-results/product-data-${width}.png` })
    if (width === 375) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const nav = await page.getByRole('navigation', { name: '产品导航' }).boundingBox()
      const lastNote = await page.locator('.data-page-details').boundingBox()
      expect(lastNote).not.toBeNull()
      expect(lastNote!.y + lastNote!.height).toBeLessThanOrEqual(nav!.y)
    }
  })
}

test('a narrow phone can reach the last explicit demo-day control', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
  const lastDay = page.getByRole('button', { name: '推进到第 9 天' })
  await lastDay.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/product-settings-320.png' })
  const nav = await page.getByRole('navigation', { name: '产品导航' }).boundingBox()
  const dayButton = await lastDay.boundingBox()
  expect(nav).not.toBeNull()
  expect(dayButton).not.toBeNull()
  expect(dayButton!.y + dayButton!.height).toBeLessThanOrEqual(nav!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('voice input requests permission only after a click and keeps keyboard input available on denial', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    })
  })
  await page.goto('/')
  const voice = page.getByRole('button', { name: '开始语音输入' })
  await expect(voice).toBeVisible()
  await voice.click()
  await expect(page.getByText('麦克风权限未开启，可在浏览器设置中允许。')).toBeVisible()
  await page.getByRole('textbox', { name: '发送消息' }).fill('仍然可以打字')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled()
})

test('recording replaces the draft with a real volume wave and cancellation preserves the draft', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const context = new AudioContext()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const destination = context.createMediaStreamDestination()
        gain.gain.value = 0.002
        oscillator.connect(gain).connect(destination)
        oscillator.start()
        ;(window as Window & { __voiceTestGain?: GainNode }).__voiceTestGain = gain
        return destination.stream
      },
    })
  })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await page.getByRole('textbox', { name: '发送消息' }).fill('原有草稿')
  await page.getByRole('button', { name: '开始语音输入' }).click()
  await expect(page.getByRole('button', { name: '结束聆听并转成文字' })).toBeVisible()
  await expect(page.locator('.product-recording-label')).toContainText('聆听中')
  await expect(page.getByRole('textbox', { name: '发送消息' })).toHaveCount(0)
  const wave = page.locator('.product-wave canvas')
  await expect(wave).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.waitForTimeout(1100)
  const pixelCount = () => wave.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let filled = 0
    for (let i = 3; i < data.length; i += 4) if (data[i]) filled++
    return filled
  })
  const quiet = await pixelCount()
  await page.evaluate(() => { (window as Window & { __voiceTestGain?: GainNode }).__voiceTestGain!.gain.value = 0.6 })
  await page.waitForTimeout(1600)
  expect(await pixelCount()).toBeGreaterThan(quiet * 2)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: '发送消息' })).toHaveValue('原有草稿')
  await expect(page.getByRole('button', { name: '开始语音输入' })).toBeFocused()
  await expect(page.getByText('已停止聆听，这段语音没有转成文字。草稿还在。')).toBeVisible()
})

test('reduced motion replaces the live wave with a static recording line', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const context = new AudioContext()
        const oscillator = context.createOscillator()
        const destination = context.createMediaStreamDestination()
        oscillator.connect(destination)
        oscillator.start()
        return destination.stream
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '开始语音输入' }).click()
  await expect(page.locator('.product-wave canvas')).toBeHidden()
  await expect(page.locator('.product-wave-still')).toBeVisible()
  await page.getByRole('button', { name: '停止聆听并放弃本次语音' }).click()
  await expect(page.getByRole('textbox', { name: '发送消息' })).toBeVisible()
})

test('the composer toolbar keeps invitation settings available without adding unused tools', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '邀请节奏与演示日期' })
  const settings = page.getByRole('region', { name: '邀请节奏与演示日期' })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await expect(settings).toBeVisible()
  await page.screenshot({ path: 'test-results/product-toolbar-settings-375.png', animations: 'disabled' })
  await expect(settings.getByRole('radio', { name: '每日两问' })).toBeChecked()
  await settings.getByRole('radio', { name: '每周一问' }).check()
  await settings.getByRole('button', { name: '应用节奏' }).click()
  await expect(settings).toBeHidden()
  await expect(trigger).toContainText('第 2 天起每周一问')
  await trigger.click()
  await settings.getByRole('radio', { name: '仅我主动' }).check()
  await settings.getByRole('button', { name: '收起' }).click()
  await trigger.click()
  await expect(settings.getByRole('radio', { name: '每周一问' })).toBeChecked()
  await settings.getByRole('button', { name: '暂停邀请' }).click()
  await expect(trigger).toContainText('已暂停')
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

for (const [width, height] of [[375, 812], [320, 568]] as const) {
  test(`the composer and settings sheet stay above mobile navigation after status at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    for (const answer of ['第一句。', '第二句。']) {
      await page.getByRole('textbox', { name: '发送消息' }).fill(answer)
      await page.getByRole('button', { name: '发送', exact: true }).click()
    }
    await expect(page.getByRole('status')).toContainText('今天的记录已写入画册')
    const detailsTrigger = page.getByRole('navigation', { name: '产品导航' }).getByRole('button', { name: '详情' })
    await expect(detailsTrigger).toBeVisible()
    await detailsTrigger.click()
    await expect(page.getByRole('dialog', { name: '详情' })).toContainText('刷新后会清空')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '详情' })).toBeHidden()
    await expect(detailsTrigger).toBeFocused()
    const nav = await page.getByRole('navigation', { name: '产品导航' }).boundingBox()
    const composer = await page.locator('.product-composer').boundingBox()
    expect(nav).not.toBeNull()
    expect(composer).not.toBeNull()
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/product-status-chat-${width}.png` })
  })
}

test('album comparison follows its selected day and never previews later days', async ({ page }) => {
  await page.goto('/')
  for (const [day, answer] of [[1, '第一天散步。'], [2, '第二天读书。'], [8, '第八天画画。']] as const) {
    if (day > 1) {
      if (await page.getByRole('button', { name: '邀请节奏与演示日期' }).getAttribute('aria-expanded') !== 'true') {
        await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
      }
      await page.getByRole('button', { name: `推进到第 ${day} 天` }).click()
    }
    await page.getByRole('textbox', { name: '发送消息' }).fill(answer)
    await page.getByRole('button', { name: '发送', exact: true }).click()
  }
  await page.getByRole('button', { name: '画册' }).click()
  await page.getByText('页面工具').click()
  await page.getByRole('button', { name: '回望这两天' }).click()
  const comparison = page.getByRole('region', { name: '两日对照' })
  await expect(comparison).toContainText('第二天读书。')
  await expect(comparison).toContainText('第八天画画。')
  await page.getByRole('button', { name: '查看第 1 天' }).click()
  await expect(comparison).toContainText('资料不足')
  await expect(comparison).not.toContainText('第八天画画。')
  await page.getByRole('button', { name: '查看第 2 天' }).click()
  await expect(comparison).toContainText('第一天散步。')
  await expect(comparison).toContainText('第二天读书。')
  await expect(comparison).not.toContainText('第八天画画。')
})

test('the album opens as a dated two-page book and turns between recorded days', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: '发送消息' }).fill('第一天看见了晚霞。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
  await page.getByRole('button', { name: '推进到第 2 天' }).click()
  await page.getByRole('textbox', { name: '发送消息' }).fill('第二天在窗边读书。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '画册' }).click()

  const book = page.getByRole('group', { name: '双页翻书画册' })
  await expect(book).toContainText('09.28')
  await expect(book).toContainText('2026年9月29日 · 第 2 天')
  await expect(book.getByRole('complementary', { name: '天气记录' })).toContainText('固定演示天气')

  await page.getByRole('button', { name: '翻到前一个有记录日期' }).click()
  const previousTurn = page.locator('.album-turn-sheet')
  await expect(previousTurn).toContainText('第一天看见了晚霞。')
  await expect(previousTurn).not.toContainText('第二天在窗边读书。')
  await expect(previousTurn).toHaveClass(/album-turn-previous/)
  await expect(page.locator('.album-book-page-left')).toContainText('第一天看见了晚霞。')
  await expect(page.getByRole('article', { name: '第 1 天画册页' })).toBeVisible()
  await expect(previousTurn).toHaveCount(0)
  await expect(page.locator('.album-book-page-left')).toContainText('谢谢你，愿意为今天停一停')

  await page.getByRole('button', { name: '翻到后一个有记录日期' }).click()
  const nextTurn = page.locator('.album-turn-sheet')
  await expect(nextTurn).toContainText('第一天看见了晚霞。')
  await expect(nextTurn).not.toContainText('第二天在窗边读书。')
  await expect(page.locator('.album-book-page-left')).toContainText('谢谢你，愿意为今天停一停')
  await expect(page.getByRole('article', { name: '第 2 天画册页' })).toBeVisible()
  await expect(nextTurn).toHaveCount(0)
  await expect(page.locator('.album-book-page-left')).toContainText('第一天看见了晚霞。')
})

test('one message composer handles brief control phrases without putting them in the album', async ({ page }) => {
  await page.goto('/')
  const message = page.getByRole('textbox', { name: '发送消息' })
  const send = page.getByRole('button', { name: '发送', exact: true })
  await expect(send).toBeDisabled()
  await expect(page.getByRole('button', { name: '回答问题' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '主动分享' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '跳过这一题' })).toHaveCount(0)
  await message.fill('换个问题')
  await send.click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('换个问题')
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('今天有没有一个小瞬间想留在画册里？')
  await message.fill('今天先不聊了')
  await send.click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('今天先不聊了')
  await page.getByRole('button', { name: '画册' }).click()
  await expect(page.getByText('画册还没有第一页')).toBeVisible()
})

test('a mixed-content sentence and a later unsolicited message both become ordinary records', async ({ page }) => {
  await page.goto('/')
  const message = page.getByRole('textbox', { name: '发送消息' })
  const send = page.getByRole('button', { name: '发送', exact: true })
  await message.fill('今天不想答但我想记一件事：去了公园。')
  await send.click()
  await message.fill('第二句。')
  await send.click()
  await message.fill('今天的问题说完了，我还想留下一句。')
  await send.click()
  await page.getByRole('button', { name: '画册' }).click()
  const album = page.getByRole('article', { name: '第 1 天画册页' })
  await expect(album).toContainText('今天不想答但我想记一件事：去了公园。')
  await expect(album).toContainText('今天的问题说完了，我还想留下一句。')
  await album.getByRole('button', { name: /详情/ }).click()
  await expect(album.getByRole('region', { name: '页面详情' })).toContainText('本次页面对话')
})

test('an optional third question can be requested and declined without settling another invitation', async ({ page }) => {
  await page.goto('/')
  const message = page.getByRole('textbox', { name: '发送消息' })
  const send = page.getByRole('button', { name: '发送', exact: true })
  for (const answer of ['先记一句。', '再记一句。']) {
    await message.fill(answer)
    await send.click()
  }
  await message.fill('再问我一个问题')
  await send.click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('主动第 3 题')
  await message.fill('今天不想回答')
  await send.click()
  await expect(page.getByRole('region', { name: '对话记录' })).not.toContainText('主动第 3 题')
  await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
  await page.getByRole('button', { name: '推进到第 2 天' }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('第 2 天 · 第 1 题')
  // 页头已删除，当前节奏改由「邀请节奏与演示日期」按钮内的状态文本承载
  await expect(page.getByRole('button', { name: '邀请节奏与演示日期' })).toContainText('每日两问')
})

test('an unrelated note does not rewrite the question already shown in the conversation', async ({ page }) => {
  await page.goto('/')
  const message = page.getByRole('textbox', { name: '发送消息' })
  const send = page.getByRole('button', { name: '发送', exact: true })
  await message.fill('随手记：下班时看到晚霞。')
  await send.click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('今天有什么想记下的？')
  await expect(page.getByRole('region', { name: '对话记录' })).not.toContainText('你之前说“随手记：下班时看到晚霞。”')
  await message.fill('今天整理了书桌。')
  await send.click()
  await page.getByRole('button', { name: '画册' }).click()
  await page.getByText('页面工具').click()
  await page.getByRole('button', { name: '今天聊过的' }).click()
  await expect(page.getByRole('region', { name: '已回答问题' })).toContainText('今天有什么想记下的？')
})

test('editing a quoted record withdraws its old wording from a skipped-question bubble', async ({ page }) => {
  const old = '仅自己知道的旧词。'
  await page.goto('/')
  const message = page.getByRole('textbox', { name: '发送消息' })
  const send = page.getByRole('button', { name: '发送', exact: true })
  await message.fill(old)
  await send.click()
  await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
  await page.getByRole('button', { name: '推进到第 2 天' }).click()
  await message.fill('跳过这一题')
  await send.click()
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText(old)
  await page.getByRole('button', { name: '画册' }).click()
  await page.getByText('页面工具').click()
  await page.getByRole('button', { name: '查看第 1 天' }).click()
  await page.getByRole('button', { name: '修改这条原话' }).click()
  await page.getByRole('textbox', { name: '修改原话' }).fill('现在保留的新词。')
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByRole('navigation', { name: '产品导航' }).getByRole('button', { name: '对话' }).click()
  await expect(page.getByRole('region', { name: '对话记录' })).not.toContainText(old)
  await expect(page.getByRole('region', { name: '对话记录' })).toContainText('旧提问已撤下')
})

test('album controls rest in a quiet grayscale and warm up when reached for', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: '发送消息' }).fill('第一天看见了晚霞。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '邀请节奏与演示日期' }).click()
  await page.getByRole('button', { name: '推进到第 2 天' }).click()
  await page.getByRole('textbox', { name: '发送消息' }).fill('第二天在窗边读书。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '画册' }).click()

  const filterOf = (selector: string) =>
    page.locator(selector).first().evaluate((el) => getComputedStyle(el).filter)
  const print = '.product-album-bar .guided-print'
  const current = '.product-album-days button[aria-current="date"]'
  const other = '.product-album-days button:not([aria-current])'

  // 默认：画册页的可点元素统一压灰
  expect(await filterOf(print)).toBe('grayscale(0.65)')
  expect(await filterOf('.product-album-foldout > summary')).toBe('grayscale(0.65)')
  // 日期标签整组静息都压灰 —— 当前正在看的那一枚也不例外（2026-09-29 改）
  expect(await filterOf(current)).toBe('grayscale(0.65)')
  expect(await filterOf(other)).toBe('grayscale(0.65)')
  // 静息时「还没跳过去的那几天」是墨黑字、没有底色
  expect(await page.locator(other).evaluate((el) => getComputedStyle(el).color)).toBe('rgb(36, 36, 36)')
  expect(await page.locator(other).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  // 已按下的工具 tab 保持全彩
  expect(await filterOf('.product-album-tool-tabs button[aria-pressed="true"]')).toBe('grayscale(0)')
  // 作用域不外溢：对话页的发送按钮不受影响
  expect(await filterOf('.product-send')).toBe('none')

  // 悬停回暖（过渡 .18s，等它走完），且文字保持朱红 —— 不是把颜色变深变灰
  await page.locator(print).hover()
  await expect.poll(() => filterOf(print)).toBe('grayscale(0.25)')
  await expect(page.locator(print)).toHaveCSS('color', 'rgb(192, 61, 42)')

  // 按下全彩；移开再松开，避免真的触发打印提示（趁折叠区还没展开，坐标是稳的）
  const box = await page.locator(print).boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await expect.poll(() => filterOf(print)).toBe('grayscale(0)')
  await page.mouse.move(0, 0)
  await page.mouse.up()

  // 日期标签悬停同样回暖：粉底与 2px 朱红下划线都还在，只是不再被压灰
  await page.locator(current).hover()
  await expect.poll(() => filterOf(current)).toBe('grayscale(0.25)')
  await expect(page.locator(current)).toHaveCSS('background-color', 'rgb(250, 234, 230)')
  await expect(page.locator(current)).toHaveCSS('border-bottom-color', 'rgb(192, 61, 42)')

  // 还没跳过去的那几天：鼠标碰到时「显示灰度」—— 数字转灰、浮出一层中性灰底
  const daysH = () =>
    page.locator('.product-album-days').evaluate((el) => Math.round(el.getBoundingClientRect().height))
  const restDaysH = await daysH()
  await page.locator(other).hover()
  await expect(page.locator(other)).toHaveCSS('color', 'rgb(117, 117, 117)')
  await expect(page.locator(other)).toHaveCSS('background-color', 'rgb(231, 228, 222)')
  // 悬停不能让行高变：不加边框、不改内边距
  expect(await daysH()).toBe(restDaysH)

  // 「页面工具」标题行：静息墨黑，碰到就转主色（标题 + 右侧计数一起）
  const summary = '.product-album-foldout > summary'
  expect(await page.locator(summary).evaluate((el) => getComputedStyle(el).color)).toBe('rgb(36, 36, 36)')
  await page.locator(summary).hover()
  await expect.poll(() => filterOf(summary)).toBe('grayscale(0.25)')
  await expect(page.locator(summary)).toHaveCSS('color', 'rgb(192, 61, 42)')
  await expect(page.locator(summary + ' small')).toHaveCSS('color', 'rgb(192, 61, 42)')

  // 点开就是全彩主色；展开后的工具 tab 悬停同样走主色（不再是「碰到只是变深」）
  await page.locator(summary).click()
  await expect.poll(() => filterOf(summary)).toBe('grayscale(0)')
  const idleTab = page.locator('.product-album-tool-tabs button[aria-pressed="false"]').first()
  await idleTab.hover()
  await expect(idleTab).toHaveCSS('color', 'rgb(192, 61, 42)')
})
