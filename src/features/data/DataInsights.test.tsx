import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { behaviorSamples, careBandForValue } from '../../data/behaviorSamples'
import DataInsights, { type BehaviorConsents, type BehaviorSource } from './DataInsights'

afterEach(cleanup)

const noConsent: BehaviorConsents = { steps: false, spending: false, screenTime: false }

function ControlledInsights() {
  const [consents, setConsents] = useState<BehaviorConsents>(noConsent)
  const onToggle = (source: BehaviorSource) => {
    setConsents((current) => ({ ...current, [source]: !current[source] }))
  }
  return <DataInsights consents={consents} onToggle={onToggle} />
}

it('shows one daily report without inventing values for disabled sources', () => {
  render(<DataInsights consents={noConsent} onToggle={vi.fn()} />)

  // 大标题只为读屏保留（左侧导航已经写着「生活数据」），视觉上不再重复
  expect(screen.getByRole('heading', { name: '生活数据' })).toBeInTheDocument()
  expect(screen.getByText(/固定的演示数据/)).not.toBeVisible()
  fireEvent.click(screen.getByText('详情'))
  expect(screen.getByText(/固定的演示数据，没有连接真实手机或手表/)).toBeVisible()
  expect(screen.getByText(/报告不会自动进入画册。刷新页面会清除本次模拟授权/)).toBeVisible()
  expect(screen.getByRole('heading', { name: '2026年9月28日' })).toBeVisible()
  expect(screen.getByRole('region', { name: '手表步数当日记录' })).toHaveTextContent('未提供')
  expect(screen.getByRole('region', { name: '手机消费记录当日记录' })).toHaveTextContent('未提供')
  expect(screen.getByRole('region', { name: '应用时长当日记录' })).toHaveTextContent('未提供')
  // 开关就在这一行里，不再单独占一节
  for (const sample of behaviorSamples) {
    const row = screen.getByRole('region', { name: `${sample.label}当日记录` })
    expect(within(row).getByRole('button', { name: `显示${sample.label}示例` })).toBeVisible()
  }
  expect(screen.queryByRole('heading', { name: '选择要看的内容' })).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /七日图表/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^显示.*示例$/ })).toHaveLength(3)
})

it('changes one combined report by date and keeps source data separate', () => {
  render(<ControlledInsights />)

  fireEvent.click(screen.getByRole('button', { name: '显示手表步数示例' }))
  const report = screen.getByRole('region', { name: '手表步数当日记录' })
  expect(report).toHaveTextContent('6,900 步')
  expect(report).not.toHaveTextContent('5,000–8,999 步')
  expect(report).toHaveTextContent('这些脚步把一天串了起来')
  expect(screen.getByRole('region', { name: '手机消费记录当日记录' })).toHaveTextContent('未提供')

  fireEvent.click(screen.getByRole('button', { name: '9月22日' }))
  expect(screen.getByRole('heading', { name: '2026年9月22日' })).toBeVisible()
  expect(report).toHaveTextContent('4,320 步')
  expect(report).toHaveTextContent('慢一点走')
  fireEvent.click(screen.getByRole('button', { name: '9月27日' }))
  expect(report).toHaveTextContent('11,300 步')
  expect(report).toHaveTextContent('给这段路一个名字')

  fireEvent.click(screen.getByText('查看七日数据'))
  const history = screen.getByRole('region', { name: '手表步数七日数据' })
  expect(within(history).getByRole('img', { name: /手表步数七日图表/ })).toBeVisible()
  expect(within(history).getByRole('img', { name: /2026年9月22日至9月28日/ })).toBeVisible()
  const table = within(history).getByRole('table', { name: '手表步数每日数值' })
  expect(within(table).getAllByRole('row')).toHaveLength(8)
  expect(within(table).getByText('4,320 步')).toBeVisible()
  // 数值改挂在柱子上，表格只做读屏数据层
  expect(within(history).getByText('4320')).toBeVisible()
  expect(within(history).getByText('11300')).toBeVisible()
  expect(screen.queryByRole('region', { name: '应用时长七日数据' })).not.toBeInTheDocument()
})

it('combines three enabled sources while revocation hides only the withdrawn one', () => {
  render(<ControlledInsights />)
  fireEvent.click(screen.getByRole('button', { name: '显示手表步数示例' }))
  fireEvent.click(screen.getByRole('button', { name: '显示手机消费记录示例' }))
  fireEvent.click(screen.getByRole('button', { name: '显示应用时长示例' }))
  fireEvent.click(screen.getByRole('button', { name: '9月24日' }))

  expect(screen.getByRole('region', { name: '手表步数当日记录' })).toHaveTextContent('5,210 步')
  expect(screen.getByRole('region', { name: '手机消费记录当日记录' })).toHaveTextContent('0.00 元')
  expect(screen.getByRole('region', { name: '手机消费记录当日记录' })).toHaveTextContent('无需为零解释')
  expect(screen.getByRole('region', { name: '应用时长当日记录' })).toHaveTextContent('231 分钟')
  expect(screen.getByRole('region', { name: '应用时长当日记录' })).toHaveTextContent('想说说屏幕之外的事')

  fireEvent.click(screen.getByRole('button', { name: '隐藏手表步数示例' }))
  expect(screen.getByRole('region', { name: '手表步数当日记录' })).toHaveTextContent('未提供')
  expect(screen.getByRole('region', { name: '手表步数当日记录' })).not.toHaveTextContent('5,210')
  expect(screen.getByRole('region', { name: '手机消费记录当日记录' })).toHaveTextContent('0.00 元')
  fireEvent.click(screen.getByText('查看七日数据'))
  expect(screen.queryByRole('region', { name: '手表步数七日数据' })).not.toBeInTheDocument()
  const spendingHistory = screen.getByRole('region', { name: '手机消费记录七日数据' })
  expect(within(spendingHistory).getByRole('img', { name: /手机消费记录七日图表/ })).toBeVisible()
  const spendingTable = within(spendingHistory).getByRole('table', { name: '手机消费记录每日数值' })
  expect(spendingTable).toBeInTheDocument()
  expect(within(spendingTable).getAllByRole('row')).toHaveLength(8)
})

it('keeps consent under parent control and avoids behavioral judgments', () => {
  const onToggle = vi.fn()
  const { rerender } = render(<DataInsights consents={noConsent} onToggle={onToggle} />)
  fireEvent.click(screen.getByRole('button', { name: '显示手机消费记录示例' }))
  expect(onToggle).toHaveBeenCalledWith('spending')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  rerender(<DataInsights consents={{ ...noConsent, spending: true }} onToggle={onToggle} />)
  expect(screen.getByRole('region', { name: '手机消费记录当日记录' })).toHaveTextContent('39.90 元')
  expect(screen.getByRole('region', { name: '手机消费记录当日记录' })).not.toHaveTextContent(/焦虑|抑郁|人格|冲动消费|不健康/)
})

it('uses distinct, explicit care bands at every boundary', () => {
  const [steps, spending, screenTime] = behaviorSamples
  const cases = [
    [steps, [4999, 5000, 8999, 9000]],
    [spending, [0, 0.01, 50, 50.01]],
    [screenTime, [179, 180, 210, 211]],
  ] as const
  for (const [sample, values] of cases) {
    const messages = values.map((value) => careBandForValue(sample, value).message)
    expect(messages.every(Boolean)).toBe(true)
    expect(messages[0]).not.toBe(messages[1])
    expect(messages[1]).toBe(messages[2])
    expect(messages[2]).not.toBe(messages[3])
  }
})
