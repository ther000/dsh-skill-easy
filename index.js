/**
 * dsh-skill-easy · 宿主半边
 *
 * 四件事：
 * 1. 冷读技能目录（agentPresets.acquireScope 遍历所有预设 + 全局层），给客户端完整并集；
 * 2. 存「分类 + 中文描述 + 隐藏/排序 + 翻译模型」这份用户数据（原子写 JSON）；
 * 3. 用宿主 ctx.llm 调用用户已配置的大模型批量翻译英文描述（不碰 API key）；
 * 4. 把上面这些通过 Remote 暴露给客户端。
 *
 * 数据落在 ~/.dsh/storages/dsh-skill-easy/data.v2.json（v2 独立文件，不读旧 data.json）。
 *
 * @module dsh-skill-easy
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DocumentStore, emptyDocument, hashOf, text, MAX_ZH } from './store.js'

/** 代码版本号：界面上会显示，用来确认跑的是哪一版。 */
const CODE_VERSION = 1
/** 翻译目标语言。 */
const TARGET_LANGUAGE = 'zh-CN'
/** 一次请求合并多少条技能描述：太少费调用、太多容易格式崩，8 是折中。 */
const TRANSLATE_BATCH = 8
/** 并发批次数：公共/自建模型都可能限流，压低。 */
const TRANSLATE_CONCURRENCY = 2
/** 单次翻译的 maxTokens。 */
const TRANSLATE_MAX_TOKENS = 4096

/** 按固定并发跑完一组任务，单项失败不影响其他项。 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

/** 把异常折成一行可读文本。 */
function describe(error) {
  return `${error?.name ?? 'Error'}: ${error?.message ?? error}`
}

/** 校验并归一化翻译模型选择。 */
function normalizeModel(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const provider = text(raw.provider, 64).trim()
  const model = text(raw.model, 128).trim()
  if (provider === '' || model === '') return null
  return { provider, model }
}

/** 从模型输出里抠出 JSON 数组（容忍 ```json 包裹和前后废话）。 */
function parseJsonArray(raw) {
  const value = String(raw ?? '')
  const start = value.indexOf('[')
  const end = value.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON 数组')
  return JSON.parse(value.slice(start, end + 1))
}

/** 宿主服务：技能分类与中文描述的数据面，同时是客户端唯一的 Remote 入口。 */
export default class SkillEasyService extends TypertRemoteService {
  static inject = ['skills']

  constructor(ctx) {
    super(ctx, 'skillEasy')
    this.ctx = ctx
    this.store = new DocumentStore(join(resolveDshHome(), 'storages', 'dsh-skill-easy', 'data.v2.json'), ctx.logger)
    this.diagnosticsPath = join(dirname(this.store.path), 'diagnostics.json')
    this.ready = this.store.load().catch((error) => {
      ctx.logger?.warn?.(`dsh-skill-easy: 初始化失败：${error?.message ?? error}`)
      return emptyDocument()
    })
    ctx.logger?.info?.('dsh-skill-easy: 服务已启动')
  }

  /**
   * 取一个可选服务：先 ctx.get，再属性访问，都拿不到返回 undefined，绝不让上层崩。
   * @param name - 服务键。
   */
  service(name) {
    try {
      const value = this.ctx.get(name)
      if (value !== undefined) return value
    } catch (error) {
      // 换属性访问再试。
    }
    try {
      const value = this.ctx[name]
      if (value !== undefined) return value
    } catch (error) {
      // 确实拿不到。
    }
    return undefined
  }

  /** 把一次目录读取的实况落盘，出问题时直接看文件，不用靠界面猜。 */
  async writeDiagnostics(payload) {
    try {
      await mkdir(dirname(this.diagnosticsPath), { recursive: true })
      await writeFile(this.diagnosticsPath, JSON.stringify(payload, null, 2), 'utf8')
    } catch (error) {
      this.ctx.logger?.warn?.(`dsh-skill-easy: 写诊断文件失败：${error?.message ?? error}`)
    }
  }

  /**
   * 当前活跃 agent 的 cwd 列表；没有 agent 时给 [undefined]（只读全局层）。
   * @returns {Promise<(string|undefined)[]>}
   */
  async activeCwds() {
    const cwds = new Set()
    try {
      const agents = this.service('agents')
      const workingDirectory = this.service('workingDirectory')
      const list = typeof agents?.list === 'function' ? agents.list() : []
      for (const agent of Array.isArray(list) ? list : []) {
        try {
          const cwd = workingDirectory?.get?.(agent?.session)
          if (typeof cwd === 'string' && cwd !== '') cwds.add(cwd)
        } catch (error) {
          // 单个 agent 取不到 cwd 不影响整体。
        }
      }
    } catch (error) {
      // agents 服务不可用不致命。
    }
    return cwds.size > 0 ? [...cwds] : [undefined]
  }

  /**
   * 完整技能并集：遍历所有预设的 scope（含全局层）取并集，再兜底全局。
   * 关键：不用依赖活跃 agent，也不会再出现「只有 6 个」的残缺列表。
   * @returns {{ skills: object[], diagnostics: string[] }}
   */
  async catalog() {
    const diagnostics = []
    const seen = new Map()
    const put = (skill) => {
      const name = typeof skill?.name === 'string' ? skill.name.trim() : ''
      if (name === '') return
      const previous = seen.get(name)
      // 同名（跨预设）合并，优先保留有描述的版本。
      if (previous === undefined || (typeof previous.description !== 'string' || previous.description === '') && typeof skill.description === 'string' && skill.description !== '') {
        seen.set(name, skill)
      }
    }

    const skills = this.service('skills')
    const presets = this.service('agentPresets')
    const cwds = await this.activeCwds()

    if (skills !== undefined) {
      if (presets !== undefined && typeof presets.list === 'function') {
        let roster = []
        try {
          roster = await presets.list()
        } catch (error) {
          diagnostics.push(`presets.list 失败 ${describe(error)}`)
        }
        for (const preset of Array.isArray(roster) ? roster : []) {
          if (preset === null || typeof preset !== 'object' || preset.broken !== undefined) continue
          let lease = null
          try {
            lease = await presets.acquireScope(preset.id)
            for (const cwd of cwds) {
              try {
                const list = await skills.list(cwd === undefined ? { scope: lease.key } : { scope: lease.key, cwd })
                for (const skill of Array.isArray(list) ? list : []) put(skill)
              } catch (error) {
                diagnostics.push(`preset ${preset.id}${cwd ? ` @cwd` : ''}: ${describe(error)}`)
              }
            }
          } catch (error) {
            diagnostics.push(`preset ${preset.id} scope: ${describe(error)}`)
          } finally {
            try {
              const dispose = lease?.[Symbol.asyncDispose]
              if (typeof dispose === 'function') await dispose.call(lease)
            } catch (error) {
              // 释放失败忽略。
            }
          }
        }
      }
      // 全局兜底：scope 省略时只读全局层，保证哪怕没有预设也有数据。
      for (const cwd of cwds) {
        try {
          const list = await skills.list(cwd === undefined ? {} : { cwd })
          for (const skill of Array.isArray(list) ? list : []) put(skill)
        } catch (error) {
          diagnostics.push(`root${cwd ? ' @cwd' : ''}: ${describe(error)}`)
        }
      }
    } else {
      diagnostics.push('skills 服务不可用')
    }

    const mapped = [...seen.values()]
      .map((skill) => ({
        name: skill.name,
        description: typeof skill.description === 'string' ? skill.description : '',
        srcHash: hashOf(skill.description ?? ''),
        modelInvocable: skill.invocation?.modelInvocable !== false,
        userInvocable: skill.invocation?.userInvocable !== false,
        ...(skill.source === undefined ? {} : { source: skill.source }),
        ...(skill.path === undefined ? {} : { path: skill.path }),
        ...(typeof skill.whenToUse === 'string' ? { whenToUse: skill.whenToUse } : {}),
      }))
      // 只保留能在 `/` 菜单里出现的技能，避免设置页出现点了也用不了的条目。
      .filter((skill) => skill.userInvocable)
      .sort((left, right) => left.name.localeCompare(right.name))

    await this.writeDiagnostics({ at: new Date().toISOString(), count: mapped.length, diagnostics })
    return { skills: mapped, diagnostics }
  }

  /**
   * 可用的翻译模型：把各家 provider 的模型摊平成一张清单，附带当前默认选择。
   * @returns 模型视图，失败时 available=false 但不抛。
   */
  async llmState() {
    const llm = this.service('llm')
    if (llm === undefined) return { available: false, reason: 'llm-unavailable', providers: [], models: [], defaultModel: null }
    let providers = []
    try {
      providers = llm.listProviders()
    } catch (error) {
      return { available: false, reason: describe(error), providers: [], models: [], defaultModel: null }
    }
    const models = []
    for (const provider of Array.isArray(providers) ? providers : []) {
      try {
        const list = await llm.listModels(provider.id)
        for (const model of Array.isArray(list) ? list : []) {
          models.push({ provider: provider.id, providerName: provider.name ?? provider.id, id: model.id, name: model.name ?? model.id })
        }
      } catch (error) {
        // 某家 provider 列不出模型就跳过。
      }
    }
    let defaultModel = null
    try {
      const selection = this.service('agentDefaultModel')?.currentSelection?.()
      if (selection && typeof selection.provider === 'string' && typeof selection.model === 'string') {
        defaultModel = { provider: selection.provider, model: selection.model }
      }
    } catch (error) {
      // 默认模型读不到就不设默认。
    }
    return {
      available: models.length > 0,
      reason: models.length > 0 ? null : 'no-model',
      providers: (Array.isArray(providers) ? providers : []).map((provider) => ({ id: provider.id, name: provider.name ?? provider.id })),
      models,
      defaultModel,
    }
  }

  /**
   * 客户端首屏：一次拿齐文档、技能并集、翻译模型。
   * @returns 完整视图。
   */
  async overview() {
    await this.ready
    const document = this.store.snapshot()
    const [catalog, llm] = await Promise.all([this.catalog(), this.llmState()])
    return {
      document,
      codeVersion: CODE_VERSION,
      skills: catalog.skills,
      catalogDiagnostics: catalog.diagnostics,
      llm,
    }
  }

  /**
   * 整份保存。数据量只有几十条，整体覆盖比增量合并更不容易出错。
   * @param request - `{ document, baseRev? }`。
   */
  async save(request) {
    await this.ready
    try {
      return await this.store.save({ document: request?.document, baseRev: request?.baseRev })
    } catch (error) {
      this.ctx.logger?.warn?.(`dsh-skill-easy: 保存失败：${error?.message ?? error}`)
      return { ok: false, reason: error?.message ?? 'save-failed' }
    }
  }

  /** 用一次大模型调用完成一批翻译，返回 Map<name, zh>。 */
  async translateBatch(model, batch) {
    const llm = this.service('llm')
    const system = '你是专业的技术文档翻译。把每个技能描述翻译成简洁、准确、自然的中文，保留专有名词（如 DSH、PR、API、Git）不译，不要加解释。只返回 JSON 数组。'
    const lines = batch.map((item, index) => `${index + 1}. ${item.description}`).join('\n')
    const user = `把下面 ${batch.length} 条技能描述逐条翻译成简体中文。\n返回严格 JSON 数组，元素形如 {"i":序号,"zh":"译文"}，序号对应上面的 1..${batch.length}，不要输出任何多余文字。\n\n${lines}`
    const prepared = await llm.prepareCall({ provider: model.provider, model: model.model, maxTokens: TRANSLATE_MAX_TOKENS })
    let raw = ''
    const stream = prepared.stream({
      ...prepared.config,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    })
    for await (const chunk of stream) {
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') raw += chunk.text
    }
    const parsed = parseJsonArray(raw)
    const byName = new Map()
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      if (entry === null || typeof entry !== 'object') continue
      const position = Number(entry.i)
      const index = Number.isInteger(position) ? position - 1 : -1
      const item = batch[index]
      if (item === undefined) continue
      const zh = text(String(entry.zh ?? '').replace(/\s+/g, ' ').trim(), MAX_ZH)
      if (zh !== '') byName.set(item.name, zh)
    }
    return byName
  }

  /** 单条翻译（批量失败时的兜底）。 */
  async translateOne(model, description) {
    const llm = this.service('llm')
    const system = '你是专业的技术文档翻译。把技能描述翻译成简洁、准确、自然的中文，保留专有名词不译，只输出译文本身。'
    const prepared = await llm.prepareCall({ provider: model.provider, model: model.model, maxTokens: TRANSLATE_MAX_TOKENS })
    let raw = ''
    const stream = prepared.stream({
      ...prepared.config,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: description }] }],
    })
    for await (const chunk of stream) {
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') raw += chunk.text
    }
    return text(String(raw).replace(/\s+/g, ' ').trim(), MAX_ZH)
  }

  /**
   * 翻译指定技能的英文描述。逐条/逐批独立：某条失败只进 failures，其余照常返回。
   * @param request - `{ names?: string[], skills?: {name,description}[], model?: {provider,model} }`。
   */
  async translate(request) {
    await this.ready
    const document = this.store.snapshot()
    const provided = Array.isArray(request?.skills)
      ? request.skills.filter((skill) => skill !== null && typeof skill === 'object' && typeof skill.name === 'string')
      : null
    const catalog = provided === null ? (await this.catalog()).skills : provided
    const byName = new Map(catalog.map((skill) => [skill.name, skill]))
    const wanted = Array.isArray(request?.names) && request.names.length > 0
      ? request.names.filter((name) => typeof name === 'string' && byName.has(name))
      : catalog.map((skill) => skill.name)

    const llm = this.service('llm')
    const state = await this.llmState()
    const model = normalizeModel(request?.model) ?? document.options.translateModel ?? state.defaultModel
    if (llm === undefined || model === null) {
      const reason = llm === undefined ? 'llm-unavailable' : 'no-model'
      return { results: [], failures: wanted.map((name) => ({ name, reason })), document: this.store.snapshot(), model, llm: state }
    }

    const items = wanted.map((name) => ({
      name,
      description: String(byName.get(name)?.description ?? '').trim(),
    }))
    const results = []
    const failures = []
    const withText = []
    for (const item of items) {
      if (item.description === '') failures.push({ name: item.name, reason: 'empty-description' })
      else withText.push(item)
    }

    const batches = []
    for (let index = 0; index < withText.length; index += TRANSLATE_BATCH) batches.push(withText.slice(index, index + TRANSLATE_BATCH))

    await mapLimit(batches, TRANSLATE_CONCURRENCY, async (batch) => {
      try {
        const translated = await this.translateBatch(model, batch)
        for (const item of batch) {
          const zh = translated.get(item.name)
          if (typeof zh === 'string' && zh !== '') results.push({ name: item.name, zh, srcHash: hashOf(item.description) })
          else failures.push({ name: item.name, reason: 'missing-translation' })
        }
      } catch (error) {
        // 整批失败：退回逐条，尽量救回来。
        for (const item of batch) {
          try {
            const zh = await this.translateOne(model, item.description)
            if (zh !== '') results.push({ name: item.name, zh, srcHash: hashOf(item.description) })
            else failures.push({ name: item.name, reason: 'empty-translation' })
          } catch (singleError) {
            failures.push({ name: item.name, reason: singleError?.code ?? singleError?.message ?? 'translate-failed' })
          }
        }
      }
    })

    // 翻译结果顺手落盘，避免客户端还没保存就丢了；同时记住这次用的模型。
    if (results.length > 0 || model !== null) {
      const next = { ...document, skills: { ...document.skills }, options: { ...document.options, translateModel: model } }
      for (const entry of results) {
        const current = next.skills[entry.name] ?? {}
        next.skills[entry.name] = { ...current, zh: entry.zh, srcHash: entry.srcHash }
      }
      try {
        await this.store.save({ document: next, baseRev: document.rev })
      } catch (error) {
        this.ctx.logger?.warn?.(`dsh-skill-easy: 翻译结果保存失败：${error?.message ?? error}`)
      }
    }
    return { results, failures, document: this.store.snapshot(), model, llm: await this.llmState() }
  }

  /**
   * 清空所有分类和中文描述。
   * @returns `{ ok, document }`。
   */
  async reset() {
    await this.ready
    const current = this.store.snapshot()
    const outcome = await this.store.save({ document: emptyDocument(), baseRev: current.rev })
    return { ok: outcome.ok === true, document: outcome.document }
  }
}

/** 把服务方法登记成客户端可调用的 Remote 方法（等价于逐个加 @Remote 装饰器）。 */
{
  const methods = ['overview', 'save', 'translate', 'reset']
  const prototype = SkillEasyService.prototype
  for (const name of methods) {
    Remote(name)(prototype[name], {
      name,
      private: false,
      static: false,
      addInitializer(fn) {
        fn.call(Object.create(prototype))
      },
    })
  }
}
