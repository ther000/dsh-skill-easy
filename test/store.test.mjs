/**
 * 宿主存储的回归用例。
 *
 * 这里能测的是「保存序列」本身：连续两次保存时，第二次必须用最新 rev 通过乐观锁。
 * 旧实现拿「启动时读到的文档」做比较，第二次永远判 stale 并把旧文档回传，
 * 界面表现就是「改完又弹回原来的名字」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATA_VERSION, DocumentStore, emptyDocument, normalizeDocument } from '../store.js'

/** 造一份只有分类的文档，省得每处都写全字段。 */
function doc(rev, names) {
  return {
    version: DATA_VERSION,
    rev,
    categories: names.map((name, index) => ({ id: `c${index + 1}`, name, order: (index + 1) * 10 })),
    skills: {},
    options: { menuChinese: true, translateModel: null },
  }
}

test('连续保存：第二次带最新 rev 必须成功（回归：rev 比较用启动快照）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skill-easy-'))
  const path = join(dir, 'data.json')
  try {
    const writer = new DocumentStore(path)
    await writer.load()
    await writer.save({ document: doc(0, ['第一版']), baseRev: 0 })
    await writer.save({ document: doc(1, ['第二版']), baseRev: 1 })

    // 模拟插件重启：新实例读同一份文件
    const restarted = new DocumentStore(path)
    await restarted.load()
    assert.equal(restarted.snapshot().rev, 2)
    assert.equal(restarted.snapshot().categories[0].name, '第二版')

    const first = await restarted.save({ document: doc(2, ['改一次']), baseRev: 2 })
    assert.equal(first.ok, true)
    assert.equal(first.document.rev, 3)

    // 关键断言：紧接着用上一步返回的 rev 再存一次。
    // 旧实现会拿启动快照的 rev 2 比较 → 判 stale → 回传旧文档，改名因此「弹回去」。
    const second = await restarted.save({ document: doc(3, ['改两次']), baseRev: 3 })
    assert.equal(second.ok, true, '第二次保存不能被判成 stale')
    assert.equal(second.document.rev, 4)
    assert.equal(second.document.categories[0].name, '改两次')

    // 真正的旧版本仍然要拒绝，并把当前文档一起回传
    const third = await restarted.save({ document: doc(2, ['过期版本']), baseRev: 2 })
    assert.equal(third.ok, false)
    assert.equal(third.reason, 'stale')
    assert.equal(third.document.rev, 4)
    assert.equal(third.document.categories[0].name, '改两次')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('归一化：空名分类、悬空分类引用、越界值都安全处理，合法条目与隐藏/排序保留', () => {
  const normalized = normalizeDocument({
    rev: 5,
    categories: [
      { id: 'c1', name: '写作', order: 10 },
      { id: 'c2', name: '   ', order: 20 },
      { id: 'c1', name: '重复', order: 30 },
    ],
    skills: {
      check: { categoryId: 'c1', zh: '审查改动', srcHash: 'abcd1234', hidden: true, order: 20 },
      hunt: { categoryId: 'missing', zh: '' },
      '': { zh: '无效名字' },
      mole: { hidden: false, order: 5 },
    },
    options: { menuChinese: false, translateModel: { provider: 'deepseek-official', model: 'deepseek-flash' } },
  })

  assert.equal(normalized.version, DATA_VERSION)
  assert.equal(normalized.rev, 5)
  assert.deepEqual(normalized.categories.map((category) => category.name), ['写作'])
  assert.equal(normalized.skills.check.categoryId, 'c1')
  assert.equal(normalized.skills.check.zh, '审查改动')
  assert.equal(normalized.skills.check.hidden, true)
  assert.equal(normalized.skills.check.order, 20)
  // 悬空分类引用被丢弃；hidden:false 不落库，只保留 order
  assert.equal(normalized.skills.hunt, undefined)
  assert.deepEqual(normalized.skills.mole, { order: 5 })
  assert.equal(normalized.options.menuChinese, false)
  assert.deepEqual(normalized.options.translateModel, { provider: 'deepseek-official', model: 'deepseek-flash' })
})

test('翻译模型缺字段或非法时归成 null', () => {
  assert.equal(normalizeDocument({ options: { translateModel: { provider: 'x' } } }).options.translateModel, null)
  assert.equal(normalizeDocument({ options: { translateModel: null } }).options.translateModel, null)
  assert.equal(normalizeDocument({ options: {} }).options.translateModel, null)
})

test('空文档起始 rev 为 0，保存后递增', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skill-easy-'))
  try {
    const store = new DocumentStore(join(dir, 'data.json'))
    await store.load()
    assert.equal(store.snapshot().rev, 0)
    assert.deepEqual(store.snapshot(), emptyDocument())
    const saved = await store.save({ document: { ...store.snapshot(), ...doc(0, ['写作']) }, baseRev: 0 })
    assert.equal(saved.ok, true)
    assert.equal(saved.document.rev, 1)
    assert.deepEqual(saved.document, { ...emptyDocument(), rev: 1, categories: [{ id: 'c1', name: '写作', order: 10 }] })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
