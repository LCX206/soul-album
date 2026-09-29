import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('Soul Album product', () => {
  it('opens directly in the conversation and keeps its three product tabs', () => {
    render(<App />)

    expect(screen.getByRole('main', { name: '心灵画册产品' })).toBeVisible()
    expect(screen.getByRole('region', { name: '对话记录' })).toBeVisible()
    expect(screen.getByText('今天有什么想记下的？')).toBeVisible()
    const navigation = screen.getByRole('navigation', { name: '产品导航' })
    expect(within(navigation).getAllByRole('button').slice(0, 3).map((button) => button.textContent)).toEqual([
      '对话', '画册', '生活数据',
    ])
    expect(within(navigation).getByRole('button', { name: '详情' })).toBeVisible()
    expect(screen.queryByText('每天问一点，慢慢看见自己')).not.toBeInTheDocument()
  })

  it('shares a record between chat and album without losing the message draft on tab switch', () => {
    vi.useFakeTimers()
    try {
      render(<App />)
      fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), {
        target: { value: '傍晚散步时看见一朵云。' },
      })
      fireEvent.click(screen.getByRole('button', { name: '发送' }))
      expect(screen.getByRole('region', { name: '对话记录' })).toHaveTextContent('傍晚散步时看见一朵云。')
      fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), {
        target: { value: '第二句还没写完' },
      })

      fireEvent.click(screen.getByRole('button', { name: '画册' }))
      act(() => vi.advanceTimersByTime(2400))
      expect(screen.getByRole('article', { name: '第 1 天画册页' })).toHaveTextContent('傍晚散步时看见一朵云。')
      fireEvent.click(screen.getByRole('button', { name: '对话' }))
      expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveValue('第二句还没写完')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows typing before a reply and cancels the pending reply on clear', () => {
    vi.useFakeTimers()
    try {
      render(<App />)
      const conversation = screen.getByRole('region', { name: '对话记录' })
      fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), {
        target: { value: '今天去了河边。' },
      })
      fireEvent.click(screen.getByRole('button', { name: '发送' }))
      expect(conversation).toHaveTextContent('今天去了河边。')
      expect(screen.getByText('画册正在输入')).toBeVisible()
      expect(conversation).not.toHaveTextContent('第 1 天 · 第 2 题')
      act(() => vi.advanceTimersByTime(2399))
      expect(screen.getByText('画册正在输入')).toBeVisible()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.queryByText('画册正在输入')).not.toBeInTheDocument()
      expect(conversation).toHaveTextContent('第 1 天 · 第 2 题')

      fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), {
        target: { value: '只在等待中出现。' },
      })
      fireEvent.click(screen.getByRole('button', { name: '发送' }))
      fireEvent.click(screen.getByRole('button', { name: '清除本次内容' }))
      act(() => vi.advanceTimersByTime(2400))
      expect(screen.getByRole('region', { name: '对话记录' })).not.toHaveTextContent('只在等待中出现。')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the same session when browsing data and clearing it', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '生活数据' }))
    expect(screen.getByRole('region', { name: '生活数据' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '对话' }))
    expect(screen.getByRole('region', { name: '对话记录' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '清除本次内容' }))
    expect(screen.getByText('今天有什么想记下的？')).toBeVisible()
  })

  it('opens the requested tab from the url and falls back to the conversation for unknown values', () => {
    const shell = () => screen.getByRole('main', { name: '心灵画册产品' })

    window.history.replaceState({}, '', '/?tab=album')
    render(<App />)
    expect(shell()).toHaveClass('product-tab-album')
    expect(screen.getByRole('region', { name: '过往记录' })).toBeVisible()

    cleanup()
    window.history.replaceState({}, '', '/?tab=data')
    render(<App />)
    expect(shell()).toHaveClass('product-tab-data')
    expect(screen.getByRole('region', { name: '生活数据' })).toBeVisible()

    cleanup()
    window.history.replaceState({}, '', '/?tab=something-else')
    render(<App />)
    expect(shell()).toHaveClass('product-tab-chat')
    expect(screen.getByRole('region', { name: '对话记录' })).toBeVisible()
  })
})
