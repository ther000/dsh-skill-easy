/**
 * / 菜单源 + 保存逻辑的回归用例。
 *
 * 新实现走公开的 `inputTriggers.registerSource` 注册自己的 `/` 源（不再猴补官方 source）。
 * 这里测的是纯逻辑 + 注册行为：候选如何按分类分段、隐藏是否生效、中文是否替换、搜索是否过滤。
 *
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const clientSource = await readFile(join(here, '..', 'client.js'), 'utf8')

/** 一个够用的 React 替身：只要工厂能建元素、hooks 能跑。 */
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
}

/** 把 client.js 当成浏览器脚本执行，取回模块定义。 */
function loadModule() {
  let definition
  globalThis.window = { __ModuleLoader__: { load: (value) => { definition = value } } }
  const run = new Function('window', 'require', clientSource)
  run(globalThis.window, (name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })
  return definition
}

const EMPTY = { version: 2, rev: 0, categories: [], skills: {}, options: { menuChinese: true, translateModel: null } }

/** 造一个客户端 ctx；记录 registerSource 注册上来的源。 */
function createHarness(options = {}) {
  const sources = []
  const ctx = {
    effects: [],
    effect(fn) {
      const dispose = fn()
      this.effects.push(dispose)
      return dispose
    },
    get(name) {
      if (name === 'inputTriggers') {
        return {
          registerSource(source) {
            sources.push(source)
            return () => {}
          },
        }
      }
      if (name === 'remote.skillEasy') return ctx.remote.skillEasy
      return undefined
    },
    inject(deps, callback) {
      callback(this)
      return { dispose: () => {} }
    },
    locale: {
      register() { return () => {} },
      bind() {
        return (key) => ({ uncategorized: '未分类', userOnly: '仅用户' }[key] ?? key)
      },
    },
    slots: { inject() {}, register() { return () => {} } },
    remote: {
      async $mount() {},
      skillEasy: {
        async overview() {
          return {
            document: options.document ?? EMPTY,
            skills: options.skills ?? [
              { name: 'check', description: 'Reviews diffs, PRs, release readiness.', srcHash: 'h-check', modelInvocable: true, userInvocable: true },
              { name: 'agent-experience', description: 'Use when writing a model-facing tool definition.', srcHash: 'h-agent', modelInvocable: true, userInvocable: true },
              { name: 'domain-modeling', description: 'Build and sharpen a project domain model.', srcHash: 'h-domain', modelInvocable: false, userInvocable: true },
            ],
            codeVersion: 1,
            catalogDiagnostics: [],
            llm: { available: true, reason: null, providers: [{ id: 'p', name: 'P' }], models: [{ provider: 'p', providerName: 'P', id: 'm', name: 'M' }], defaultModel: { provider: 'p', model: 'm' } },
          }
        },
        async save(request) { return { ok: true, document: request.document } },
        async translate() { return { results: [], failures: [], document: null, llm: { available: true, models: [] } } },
        async reset() { return { ok: true, document: EMPTY } },
      },
    },
  }
  return { ctx, sources }
}

async function settle() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 10))
}

test('模块元信息与注入声明', () => {
  const definition = loadModule()
  assert.equal(definition.id, 'dsh-skill-easy')
  assert.deepEqual(definition.factory(() => React).inject, ['slots', 'locale', 'remote'])
})

test('buildMenuItems：无分类时不加 section，只换中文描述', () => {
  const { buildMenuItems } = loadModule().factory(() => React).__test
  const t = (key) => ({ uncategorized: '未分类', userOnly: '仅用户' }[key] ?? key)
  const skills = [
    { name: 'check', description: 'Reviews diffs.', modelInvocable: true },
    { name: 'hunt', description: 'Find root cause.', modelInvocable: true },
  ]
  const doc = { categories: [], skills: { check: { zh: '审查改动', srcHash: 'h' } }, options: { menuChinese: true } }
  const items = buildMenuItems(skills, doc, t, '')
  assert.deepEqual(items.map((item) => item.name), ['check', 'hunt'])
  assert.equal(items[0].description, '审查改动')
  assert.equal(items[0].section, undefined)
})

test('buildMenuItems：按分类顺序分段，未归类排最后，隐藏项剔除，仅用户加标记', () => {
  const { buildMenuItems } = loadModule().factory(() => React).__test
  const t = (key) => ({ uncategorized: '未分类', userOnly: '仅用户' }[key] ?? key)
  const skills = [
    { name: 'check', description: 'Reviews diffs.', modelInvocable: true },
    { name: 'agent-experience', description: 'Tool defs.', modelInvocable: true },
    { name: 'domain-modeling', description: 'Domain model.', modelInvocable: false },
    { name: 'secret', description: 'Hidden one.', modelInvocable: true },
  ]
  const doc = {
    categories: [{ id: 'review', name: '审查', order: 10 }, { id: 'dev', name: '开发', order: 20 }],
    skills: {
      check: { categoryId: 'review', zh: '审查改动', srcHash: 'h' },
      'agent-experience': { categoryId: 'dev', zh: '工具定义', srcHash: 'h' },
      'domain-modeling': { zh: '领域建模', srcHash: 'h' },
      secret: { hidden: true },
    },
    options: { menuChinese: true },
  }
  const items = buildMenuItems(skills, doc, t, '')
  assert.deepEqual(items.map((item) => item.name), ['check', 'agent-experience', 'domain-modeling'])
  assert.equal(items[0].section, '审查')
  assert.equal(items[1].section, '开发')
  assert.equal(items[2].section, '未分类')
  assert.equal(items[2].description, '仅用户 · 领域建模')
})

test('buildMenuItems：查询按名字/中文过滤', () => {
  const { buildMenuItems } = loadModule().factory(() => React).__test
  const t = (key) => ({ uncategorized: '未分类', userOnly: '仅用户' }[key] ?? key)
  const skills = [{ name: 'check', description: 'Reviews diffs.' }, { name: 'hunt', description: 'Root cause.' }]
  const doc = { categories: [], skills: { check: { zh: '审查改动' } }, options: { menuChinese: true } }
  assert.deepEqual(buildMenuItems(skills, doc, t, '审查').map((item) => item.name), ['check'])
  assert.deepEqual(buildMenuItems(skills, doc, t, 'hunt').map((item) => item.name), ['hunt'])
})

test('apply 走公开 registerSource 注册自己的 / 源，候选可分组', async () => {
  const definition = loadModule()
  const { ctx, sources } = createHarness({
    document: {
      version: 2,
      rev: 1,
      categories: [{ id: 'review', name: '审查', order: 10 }],
      skills: { check: { categoryId: 'review', zh: '审查改动', srcHash: 'h' } },
      options: { menuChinese: true, translateModel: null },
    },
  })
  const plugin = definition.factory((name) => { if (name === 'react') return React; throw new Error(name) })
  plugin.apply(ctx)
  await settle()

  assert.equal(sources.length, 1, '应只注册一个 / 源')
  const source = sources[0]
  assert.equal(source.trigger, '/')
  assert.equal(source.name, 'skill-easy')
  assert.equal(source.showGroupTitle, false)
  const items = await source.candidates({ sessionId: 's1' }, { query: '' })
  assert.equal(items[0].name, 'check')
  assert.equal(items[0].section, '审查')
  assert.equal(items[0].description, '审查改动')
  // onPick 返回 /name 以便宿主注入技能体
  assert.deepEqual(source.onPick({ candidate: { name: 'check' } }), { text: '/check ' })
})

test('保存冲突：先按最新 rev 重试，重试仍冲突才采纳服务端（回归：改名被回滚）', () => {
  const { planSave } = loadModule().factory(() => React).__test
  assert.equal(planSave({ ok: true, document: { rev: 3 } }, false, 0), 'done')
  assert.equal(planSave({ ok: false, reason: 'stale', document: { rev: 9 } }, false, 9), 'retry')
  assert.equal(planSave({ ok: false, reason: 'stale', document: { rev: 10 } }, false, 9), 'adopt')
  assert.equal(planSave({ ok: false, reason: 'stale', document: { rev: 9 } }, true, 9), 'adopt')
  assert.equal(planSave({ ok: false, reason: 'save-failed' }, false, 9), 'error')
  assert.equal(planSave(undefined, false, 9), 'error')
})

test('中文过期判断用的哈希稳定且对内容敏感', () => {
  const { hashOf } = loadModule().factory(() => React).__test
  assert.equal(hashOf('same text'), hashOf('same text'))
  assert.notEqual(hashOf('same text'), hashOf('same text.'))
  assert.match(hashOf(''), /^[0-9a-f]{8}$/)
})

test('设置页用到的每个 class 都在 SETTINGS_CSS 里有定义', () => {
  const cssBlock = clientSource.match(/const SETTINGS_CSS = \[([\s\S]*?)\]\.join\(''\)/)
  assert.ok(cssBlock, 'SETTINGS_CSS 找不到')
  const css = [...cssBlock[1].matchAll(/'([^']*)'/g)].map((match) => match[1]).join('')
  assert.ok(css.length > 500, '样式内容过短，疑似被截断')

  const used = new Set()
  for (const match of clientSource.matchAll(/className: '([^']+)'/g)) {
    for (const name of match[1].split(/\s+/)) if (name !== '') used.add(name)
  }
  assert.ok(used.size >= 15, `className 数量异常：${used.size}`)
  for (const name of used) {
    assert.ok(css.includes(`.${name}`), `设置页用了 .${name} 但样式里没有定义`)
  }
})
