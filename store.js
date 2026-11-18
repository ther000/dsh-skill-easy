/**
 * dsh-skill-easy · 文档存储
 *
 * 这份文件不依赖任何宿主包，可以单独在 Node 里跑测试：
 * 它是「分类 + 中文描述 + 菜单状态」的唯一真相，服务的读写都经过它。
 *
 * v2 相比 v1 新增：技能可隐藏（hidden）、分类内可排序（order）、
 * 记录翻译用的模型（options.translateModel）。
 * 不做旧数据迁移——v2 用独立文件，旧 data.json 原样保留。
 *
 * @module dsh-skill-easy/store
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 数据格式版本；字段语义变化时递增。 */
export const DATA_VERSION = 2
export const MAX_CATEGORIES = 40
export const MAX_CATEGORY_NAME = 24
export const MAX_SKILL_NAME = 128
export const MAX_ZH = 200
export const MAX_PROVIDER = 64
export const MAX_MODEL = 128

/** 空文档：没有分类、没有中文描述，此时菜单只挂官方那份。 */
export function emptyDocument() {
  return {
    version: DATA_VERSION,
    rev: 0,
    categories: [],
    skills: {},
    options: { menuChinese: true, translateModel: null },
  }
}

/**
 * 英文描述的短指纹，用来判断已存的中文是否过期。
 * 用 FNV-1a：客户端也要算同一个值，而浏览器里没有同步的 sha256。
 * 只用来比对相等，不需要抗碰撞。
 */
export function hashOf(value) {
  let hash = 0x811c9dc5
  const source = String(value ?? '')
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function text(value, max) {
  if (typeof value !== 'string') return ''
  return value.length > max ? value.slice(0, max) : value
}

function normalizeTranslateModel(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const provider = text(raw.provider, MAX_PROVIDER).trim()
  const model = text(raw.model, MAX_MODEL).trim()
  if (provider === '' || model === '') return null
  return { provider, model }
}

/**
 * 归一化一份来自客户端或磁盘的文档。
 * 只保留认识的结构，越界值一律截断而不是抛错——用户数据不该因为一次编辑就整份作废。
 * @param raw - 待归一化的值。
 * @returns 可安全持久化和下发的文档。
 */
export function normalizeDocument(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const rawCategories = Array.isArray(source.categories) ? source.categories : []
  const seenIds = new Set()
  const categories = []
  for (const entry of rawCategories.slice(0, MAX_CATEGORIES)) {
    if (entry === null || typeof entry !== 'object') continue
    const id = text(entry.id, 64).trim()
    const name = text(entry.name, MAX_CATEGORY_NAME).trim()
    if (id === '' || name === '' || seenIds.has(id)) continue
    seenIds.add(id)
    const order = Number.isFinite(entry.order) ? entry.order : categories.length * 10
    categories.push({ id, name, order })
  }
  categories.sort((left, right) => left.order - right.order)

  const skills = {}
  const rawSkills = source.skills !== null && typeof source.skills === 'object' ? source.skills : {}
  for (const [name, entry] of Object.entries(rawSkills)) {
    const key = text(name, MAX_SKILL_NAME).trim()
    if (key === '' || entry === null || typeof entry !== 'object') continue
    const next = {}
    const categoryId = text(entry.categoryId, 64).trim()
    if (categoryId !== '' && seenIds.has(categoryId)) next.categoryId = categoryId
    const zh = text(entry.zh, MAX_ZH).trim()
    if (zh !== '') {
      next.zh = zh
      const srcHash = text(entry.srcHash, 32).trim()
      if (srcHash !== '') next.srcHash = srcHash
    }
    if (entry.hidden === true) next.hidden = true
    if (Number.isFinite(entry.order)) next.order = entry.order
    if (Object.keys(next).length > 0) skills[key] = next
  }

  const options = source.options !== null && typeof source.options === 'object' ? source.options : {}
  return {
    version: DATA_VERSION,
    // 乐观锁版本号：每次保存 +1，客户端带旧版本号来保存时拒绝，避免多开页面互相覆盖。
    rev: Number.isFinite(source.rev) ? source.rev : 0,
    categories,
    skills,
    options: {
      menuChinese: options.menuChinese !== false,
      translateModel: normalizeTranslateModel(options.translateModel),
    },
  }
}

/**
 * 原子写的 JSON 存储。
 *
 * 注意：`save()` 比较的是**内存里的当前文档**（`snapshot()`），不是启动时读盘的那一份。
 * 用启动快照做比较会让第二次保存永远判 stale，并把旧文档回传给客户端，界面看起来就像「改完又弹回去」。
 */
export class DocumentStore {
  #path
  #data = emptyDocument()
  #queue = Promise.resolve()

  /**
   * @param path - data.json 的绝对路径。
   * @param logger - 可选日志。
   */
  constructor(path, logger) {
    this.#path = path
    this.logger = logger
  }

  get path() {
    return this.#path
  }

  /** 读盘；文件不存在或损坏时回落到空文档，不阻塞插件启动。 */
  async load() {
    try {
      const raw = await readFile(this.#path, 'utf8')
      this.#data = normalizeDocument(JSON.parse(raw))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger?.warn?.(`dsh-skill-easy: 读取数据失败，改用空数据：${error?.message ?? error}`)
      }
      this.#data = emptyDocument()
    }
    return this.#data
  }

  /** 当前内存文档（永远是最新一次成功写入的版本）。 */
  snapshot() {
    return this.#data
  }

  /**
   * 带乐观锁的整份保存。
   * @param input - `{ document, baseRev? }`。
   * @returns `{ ok: true, document }` 或 `{ ok: false, reason, document }`。
   */
  async save(input) {
    const document = input?.document
    if (document === null || typeof document !== 'object') return { ok: false, reason: 'invalid-document', document: this.#data }
    const baseRev = Number.isFinite(input?.baseRev) ? input.baseRev : null
    // 关键：拿当前内存文档做比较，而不是启动时的快照。
    if (baseRev !== null && baseRev !== this.#data.rev) {
      return { ok: false, reason: 'stale', document: this.#data }
    }
    const next = normalizeDocument({ ...document, rev: this.#data.rev + 1 })
    this.#data = next
    this.#queue = this.#queue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true })
      const tmp = `${this.#path}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
      await rename(tmp, this.#path)
    })
    await this.#queue
    return { ok: true, document: this.#data }
  }
}
