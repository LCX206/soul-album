export type BehaviorSource = 'steps' | 'spending' | 'screenTime'
type CareBand = { maxInclusive: number; range: string; message: string }

export type BehaviorSample = {
  id: BehaviorSource
  label: string
  source: string
  unit: string
  values: readonly number[]
  careBands: readonly [CareBand, ...CareBand[]]
}

export function careBandForValue(sample: BehaviorSample, value: number): CareBand {
  return sample.careBands.find((band) => value <= band.maxInclusive) ?? sample.careBands[sample.careBands.length - 1]
}

// Fixed, invented numbers for the product prototype. No device, account or app data is read.
export const sampleDays = [
  { date: '9月22日', short: '22' },
  { date: '9月23日', short: '23' },
  { date: '9月24日', short: '24' },
  { date: '9月25日', short: '25' },
  { date: '9月26日', short: '26' },
  { date: '9月27日', short: '27' },
  { date: '9月28日', short: '28' },
] as const

export const behaviorSamples: readonly BehaviorSample[] = [
  {
    id: 'steps',
    label: '手表步数',
    source: '模拟手表',
    unit: '步',
    values: [4320, 6870, 5210, 8040, 7440, 11300, 6900],
    careBands: [
      { maxInclusive: 4999, range: '少于 5,000 步', message: '这一天的脚步记录不多。慢一点走，也是一种自己的节奏。' },
      { maxInclusive: 8999, range: '5,000–8,999 步', message: '这些脚步把一天串了起来。若愿意，记下途中一件小事。' },
      { maxInclusive: Infinity, range: '9,000 步及以上', message: '这一天留下的脚步较多。愿意的话，给这段路一个名字。' },
    ],
  },
  {
    id: 'spending',
    label: '手机消费记录',
    source: '模拟手机消费记录',
    unit: '元',
    values: [32.5, 78.2, 0, 116.9, 24.8, 52, 39.9],
    careBands: [
      { maxInclusive: 0, range: '0 元', message: '这一天没有消费记录，也无需为零解释什么。' },
      { maxInclusive: 50, range: '0 元以上至 50 元', message: '这一天有一些日常开销；只记录数字，不替你评判选择。' },
      { maxInclusive: Infinity, range: '超过 50 元', message: '这一天的消费数字留在这里；不必因为金额给自己下结论。' },
    ],
  },
  {
    id: 'screenTime',
    label: '应用时长',
    source: '模拟系统使用统计',
    unit: '分钟',
    values: [206, 179, 231, 188, 155, 212, 165],
    careBands: [
      { maxInclusive: 179, range: '少于 180 分钟', message: '屏幕只记录了这段时间；没被记录的生活也一样重要。' },
      { maxInclusive: 210, range: '180–210 分钟', message: '一天不只由屏幕时间组成，想记下别的片刻也可以。' },
      { maxInclusive: Infinity, range: '超过 210 分钟', message: '这一天记录的应用时长较长。想说说屏幕之外的事，也可以。' },
    ],
  },
] as const
