/**
 * dsh-skill-easy · 客户端半边
 *
 * 两个界面，共用一份数据：
 * 1. 设置 → 技能分类：分类管理、技能归组/中文、批量、隐藏、详情、翻译模型；
 * 2. 输入框的 `/` 菜单：注册一个属于本插件的 source，按分类分段显示，描述用中文。
 *
 * 菜单这一半**不再**猴补官方 source，而是走公开的 `inputTriggers.registerSource`
 * 注册我们自己的 `/` 源（官方 `skill` 组保留，故菜单里会同时有两份——这是选定的 B 方案）。
 *
 * 不导入任何 Harness Client 包：控件自己写，样式只用主题 token。
 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-easy',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PLUGIN_ID = 'dsh-skill-easy'
    const NS = 'skill-easy'
    const SECTION_ID = 'dsh-skill-easy'
    const SOURCE_NAME = 'skill-easy'
    /** 客户端版本号：和宿主的 CODE_VERSION 一起显示，用来确认页面跑的是哪一版。 */
    const CLIENT_VERSION = 1

    /* ───────────────────────── 文案 ───────────────────────── */

    const UI_zh = {
      nav: '技能分类',
      title: '技能分类',
      intro: '给技能分组、写中文描述。输入 / 时按分类显示，描述用中文。',
      categories: '分类',
      categoriesHint: '分类顺序就是 / 菜单顺序；没归类的排最后。拖动手柄可调整。',
      skills: '技能',
      newCategory: '新建分类',
      categoryName: '分类名',
      moveUp: '上移',
      moveDown: '下移',
      remove: '删除',
      searchSkills: '搜索技能名或中文',
      zhPlaceholder: '留空显示英文原文',
      uncategorized: '未分类',
      hiddenSection: '已隐藏',
      hiddenHint: '这些技能不会出现在 / 菜单里，点「恢复」放回来。',
      restore: '恢复',
      hide: '隐藏',
      details: '详情',
      translateOne: '翻译',
      retranslate: '重翻',
      translateAll: '一键翻译',
      translating: '翻译中…',
      selectMode: '选择',
      selectExit: '取消选择',
      selectAll: '全选',
      selectedCount: '已选',
      batchAssign: '归组到',
      batchTranslate: '翻译',
      batchClear: '清除中文',
      batchHide: '隐藏',
      model: '翻译模型',
      modelUnavailable: '翻译服务不可用',
      modelUnavailableHint: '仍可手动填写中文。',
      reset: '全部重置',
      resetConfirm: '确定清空所有分类和中文描述？此操作不可撤销。',
      saved: '已保存',
      saving: '保存中…',
      saveFailed: '保存失败：',
      loading: '正在读取技能目录…',
      loadFailed: '读取失败：',
      retry: '重试',
      menuOn: '菜单已生效',
      menuOff: '菜单未生效',
      menuOffHint: '设置照常可用，只是 / 菜单不会分组。',
      userOnly: '仅用户',
      stale: '原文已变',
      emptySkills: '没有发现技能。',
      emptyCategories: '还没有分类。建两个，/ 菜单里就会分段。',
      noMatch: '没有匹配的技能',
      confirmHint: '原文',
      pathLabel: '路径',
      sourceLabel: '来源',
      modelInvocableLabel: '模型可调用',
      whenToUseLabel: '使用时机',
      detailClose: '收起',
      doneCount: '已翻译',
      failedCount: '条失败',
      noTargets: '没有需要翻译的技能',
      yes: '是',
      no: '否',
    }

    const UI_en = {
      nav: 'Skill Groups',
      title: 'Skill Groups',
      intro: 'Group your skills and give them a Chinese description. The / menu shows them grouped, in Chinese.',
      categories: 'Groups',
      categoriesHint: 'Group order is / menu order; ungrouped come last. Drag the handle to reorder.',
      skills: 'Skills',
      newCategory: 'New group',
      categoryName: 'Group name',
      moveUp: 'Move up',
      moveDown: 'Move down',
      remove: 'Remove',
      searchSkills: 'Search name or Chinese text',
      zhPlaceholder: 'Empty shows the English text',
      uncategorized: 'Ungrouped',
      hiddenSection: 'Hidden',
      hiddenHint: 'These skills are hidden from the / menu. Click Restore to bring them back.',
      restore: 'Restore',
      hide: 'Hide',
      details: 'Details',
      translateOne: 'Translate',
      retranslate: 'Translate again',
      translateAll: 'Translate untranslated',
      translating: 'Translating…',
      selectMode: 'Select',
      selectExit: 'Done',
      selectAll: 'Select all',
      selectedCount: 'selected',
      batchAssign: 'Move to',
      batchTranslate: 'Translate',
      batchClear: 'Clear Chinese',
      batchHide: 'Hide',
      model: 'Translation model',
      modelUnavailable: 'Translation unavailable',
      modelUnavailableHint: 'You can still type Chinese by hand.',
      reset: 'Reset all',
      resetConfirm: 'Clear every group and Chinese description? This cannot be undone.',
      saved: 'Saved',
      saving: 'Saving…',
      saveFailed: 'Save failed: ',
      loading: 'Loading skill catalog…',
      loadFailed: 'Load failed: ',
      retry: 'Retry',
      menuOn: 'Menu active',
      menuOff: 'Menu inactive',
      menuOffHint: 'Settings still work; the / menu just stays ungrouped.',
      userOnly: 'user-only',
      stale: 'source changed',
      emptySkills: 'No skills found.',
      emptyCategories: 'No groups yet. Create two and the / menu starts grouping.',
      noMatch: 'No matching skills',
      confirmHint: 'Source',
      pathLabel: 'Path',
      sourceLabel: 'Source',
      modelInvocableLabel: 'Model invocable',
      whenToUseLabel: 'When to use',
      detailClose: 'Close',
      doneCount: 'translated',
      failedCount: 'failed',
      noTargets: 'Nothing to translate',
      yes: 'yes',
      no: 'no',
    }

    /* ───────────────────────── Remote 描述表 ───────────────────────── */

    const codec = () => ({
      mode: 'strict',
      typeSymbol: `${PLUGIN_ID}#json`,
      create: () => ({
        parse: (value) => value,
        safeParse: (value) => ({ success: true, data: value }),
      }),
    })

    function descriptor(method, hasParams) {
      return {
        id: `${PLUGIN_ID}#skillEasy/${method}`,
        service: 'skillEasy',
        namespace: 'skillEasy',
        method,
        invocation: { kind: 'direct' },
        ...(hasParams
          ? { parameters: [{ name: 'request', wire: 'request', source: 'json', codec: codec() }] }
          : { parameters: [] }),
        result: { mode: 'src-json' },
        cancellation: { parameter: 'signal' },
      }
    }

    const TYPERT_REMOTE = {
      package: PLUGIN_ID,
      descriptors: [
        descriptor('overview', false),
        descriptor('save', true),
        descriptor('translate', true),
        descriptor('reset', false),
      ],
    }

    /* ───────────────────────── 数据模型 ───────────────────────── */

    function createModel() {
      let snapshot = {
        status: 'loading',
        document: null,
        skills: [],
        catalogDiagnostics: [],
        codeVersion: null,
        llm: null,
        error: null,
        menuActive: false,
        menuReason: null,
      }
      const listeners = new Set()
      return {
        /** 注入上下文里的 remote.skillEasy 服务；首屏就绪后由 boot 填入。 */
        namespace: null,
        get: () => snapshot,
        set(patch) {
          snapshot = { ...snapshot, ...patch }
          for (const listener of [...listeners]) {
            try {
              listener()
            } catch (error) {
              console.error('[dsh-skill-easy] 订阅者抛错', error)
            }
          }
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        doc: () => snapshot.document,
        skills: () => snapshot.skills,
      }
    }

    function useSnapshot(model) {
      const [snapshot, setSnapshot] = useState(model.get())
      useEffect(() => {
        setSnapshot(model.get())
        return model.subscribe(() => setSnapshot(model.get()))
      }, [model])
      return snapshot
    }

    /** 空文档：宿主返回异常时也能把设置页渲染出来。 */
    function emptyDocument() {
      return { version: 2, rev: 0, categories: [], skills: {}, options: { menuChinese: true, translateModel: null } }
    }

    /** 把异常折成一行可读文本，直接展示给用户。 */
    function describeError(error) {
      if (error === null || error === undefined) return 'unknown error'
      if (typeof error === 'string') return error
      const name = error.name ?? 'Error'
      const message = error.message ?? String(error)
      return message === '' ? name : `${name}: ${message}`
    }

    /** 远程调用返回的是信封 `{ ok, value }`：成功取 value，失败抛错。 */
    function unwrap(result) {
      if (result === null || result === undefined) throw new Error('远程调用没有返回结果')
      if (result.ok === false) {
        const failure = result.error ?? {}
        throw new Error(failure.message ?? failure.code ?? '远程调用失败')
      }
      return 'value' in result ? result.value : result
    }

    /** 英文描述的短指纹，和宿主用同一套算法（FNV-1a），用来判断中文是否过期。 */
    function hashOf(value) {
      let hash = 0x811c9dc5
      const source = String(value ?? '')
      for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
      return hash.toString(16).padStart(8, '0')
    }

    /**
     * 一次保存结果 → 下一步动作。
     * `stale` 有两种含义：自己推进的 rev（重试）/ 别的页面改过（采纳）。
     */
    function planSave(outcome, retried, ownRev) {
      if (outcome?.ok === true) return 'done'
      if (outcome?.reason !== 'stale') return 'error'
      if (retried === true) return 'adopt'
      const serverRev = outcome?.document?.rev
      return Number.isFinite(serverRev) && serverRev === ownRev ? 'retry' : 'adopt'
    }

    /**
     * 挂载 Remote 命名空间，取回命名空间服务。两条路一起等：直接取 + ctx.inject。
     */
    function openRemote(ctx) {
      return new Promise((resolve, reject) => {
        let settled = false
        let mountState = 'pending'
        let mountError = null
        const describeMount = () => {
          if (mountState === 'ok') return '挂载已返回，但命名空间未注册'
          if (mountState === 'failed') return `挂载失败：${describeError(mountError)}`
          return '挂载调用一直没返回'
        }
        const finish = (settle, value) => {
          if (settled) return
          settled = true
          settle(value)
        }
        const timer = setTimeout(() => {
          finish(reject, new Error(`remote.skillEasy 在 20 秒内未就绪（${describeMount()}）`))
        }, 20000)

        try {
          const direct = ctx.get('remote.skillEasy')
          if (direct !== undefined && direct !== null) {
            clearTimeout(timer)
            finish(resolve, direct)
            return
          }
        } catch (error) {
          // 服务还没注册，走 inject。
        }

        try {
          ctx.inject(['remote.skillEasy'], (child) => {
            clearTimeout(timer)
            finish(resolve, child.remote.skillEasy)
          })
        } catch (error) {
          clearTimeout(timer)
          finish(reject, error)
          return
        }

        Promise.resolve()
          .then(() => ctx.remote.$mount(TYPERT_REMOTE))
          .then(() => {
            mountState = 'ok'
          })
          .catch((error) => {
            mountState = 'failed'
            mountError = error
            console.error('[dsh-skill-easy] Remote 命名空间挂载失败', error)
          })
      })
    }

    /** 取已就绪的数据通道；没就绪就抛一个能看懂的错。 */
    function channel(ctx, model) {
      const namespace = model.namespace ?? ctx.get('remote.skillEasy')
      if (namespace === undefined || namespace === null) throw new Error('数据通道尚未就绪，请点「重试」')
      return namespace
    }

    /* ───────────────────────── `/` 菜单源 ───────────────────────── */

    /**
     * 把技能 + 文档合成菜单候选：过滤隐藏、按分类排序、加 section、描述用中文。
     * 纯函数，便于单测。
     */
    function buildMenuItems(skills, doc, t, query) {
      const list = Array.isArray(skills) ? skills : []
      if (list.length === 0) return []
      const zhEnabled = doc?.options?.menuChinese !== false
      const meta = doc?.skills !== null && typeof doc?.skills === 'object' ? doc.skills : {}
      const categories = Array.isArray(doc?.categories) ? doc.categories : []
      const byId = new Map()
      categories.forEach((category, index) => {
        byId.set(category.id, { name: category.name, order: Number.isFinite(category.order) ? category.order : index * 10 })
      })
      const needle = String(query ?? '').trim().toLowerCase()
      const rows = []
      for (const skill of list) {
        const entry = meta[skill.name] ?? {}
        if (entry.hidden === true) continue
        const zh = zhEnabled && typeof entry.zh === 'string' ? entry.zh : ''
        if (needle !== '') {
          const haystack = `${skill.name} ${zh} ${skill.description ?? ''}`.toLowerCase()
          if (!haystack.includes(needle)) continue
        }
        const category = entry.categoryId === undefined ? undefined : byId.get(entry.categoryId)
        rows.push({
          skill,
          entry,
          category,
          description: skill.modelInvocable === false ? `${t('userOnly')} · ${zh || skill.description || ''}` : (zh || skill.description || ''),
        })
      }
      const grouped = rows.some((row) => row.category !== undefined)
      rows.sort((left, right) => {
        const leftOrder = left.category === undefined ? Number.MAX_SAFE_INTEGER : left.category.order
        const rightOrder = right.category === undefined ? Number.MAX_SAFE_INTEGER : right.category.order
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        const leftSkillOrder = Number.isFinite(left.entry.order) ? left.entry.order : Number.MAX_SAFE_INTEGER
        const rightSkillOrder = Number.isFinite(right.entry.order) ? right.entry.order : Number.MAX_SAFE_INTEGER
        if (leftSkillOrder !== rightSkillOrder) return leftSkillOrder - rightSkillOrder
        return left.skill.name.localeCompare(right.skill.name)
      })
      return rows.map((row) => {
        const item = { name: row.skill.name, description: row.description }
        if (grouped) item.section = row.category === undefined ? t('uncategorized') : row.category.name
        return item
      })
    }

    /**
     * 注册我们自己的 `/` 源（公开 API，不碰私有字段）。
     * @returns 还原函数。
     */
    function installMenuSource(ctx, model, t) {
      let dispose = null
      let stopped = false
      let timer = null
      let attempts = 0

      const tryInstall = () => {
        if (stopped || dispose !== null) return
        attempts += 1
        let triggers
        try {
          triggers = ctx.get('inputTriggers')
        } catch (error) {
          triggers = undefined
        }
        if (triggers === undefined || triggers === null || typeof triggers.registerSource !== 'function') {
          if (attempts < 20) {
            timer = setTimeout(tryInstall, 250)
          } else {
            model.set({ menuActive: false, menuReason: 'input-triggers-missing' })
          }
          return
        }
        const source = {
          trigger: '/',
          name: SOURCE_NAME,
          order: 1,
          showGroupTitle: false,
          async candidates(session, request) {
            const doc = model.doc()
            const skills = model.skills()
            if (doc === null || !Array.isArray(skills) || skills.length === 0) return []
            try {
              return buildMenuItems(skills, doc, t, request?.query ?? '')
            } catch (error) {
              console.warn('[dsh-skill-easy] 菜单候选生成失败', error)
              return []
            }
          },
          onPick({ candidate }) {
            return { text: `/${candidate.name} ` }
          },
        }
        try {
          dispose = triggers.registerSource(source)
          model.set({ menuActive: true, menuReason: null })
        } catch (error) {
          model.set({ menuActive: false, menuReason: String(error?.message ?? error) })
          console.warn('[dsh-skill-easy] 注册 / 源失败', error)
        }
      }

      tryInstall()
      return () => {
        stopped = true
        if (timer !== null) clearTimeout(timer)
        if (typeof dispose === 'function') {
          try {
            dispose()
          } catch (error) {
            // 忽略。
          }
        }
      }
    }

    /* ───────────────────────── 样式 ───────────────────────── */

    const SETTINGS_CSS = [
      '.ske-page{display:flex;flex-direction:column;gap:16px;padding:2px 0 60px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
      '.ske-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.ske-title{margin:0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.01em}',
      '.ske-intro{margin:6px 0 0;max-width:62ch;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
      '.ske-status{display:inline-flex;flex:none;align-items:center;gap:6px;height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;cursor:pointer}',
      '.ske-status:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.ske-dot{width:6px;height:6px;border-radius:50%;flex:none}',
      '.ske-status[data-tone="ok"] .ske-dot{background:var(--dsw-alias-state-success-primary)}',
      '.ske-status[data-tone="warn"] .ske-dot{background:var(--dsw-alias-state-warn-primary)}',
      '.ske-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.ske-search{box-sizing:border-box;flex:0 1 220px;min-width:130px;height:30px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
      '.ske-search::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.ske-model{box-sizing:border-box;max-width:220px;height:30px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;color-scheme:light}',
      '@media (prefers-color-scheme:dark){.ske-model{color-scheme:dark}}',
      '.ske-model option{background-color:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.ske-spacer{flex:1}',
      '.ske-btn{flex:none;height:30px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}',
      '.ske-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.ske-btn:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.ske-btn--primary{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent);color:var(--dsw-alias-brand-primary)}',
      '.ske-btn--primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}',
      '.ske-btn--quiet{border-color:transparent;padding:0 8px;color:var(--dsw-alias-label-secondary)}',
      '.ske-btn--quiet:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.ske-line{min-height:18px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}',
      '.ske-line[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}',
      '.ske-line[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}',
      '.ske-section{display:flex;flex-direction:column;gap:6px}',
      '.ske-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.ske-sectionTitle{margin:0;font-size:13px;font-weight:600;line-height:20px}',
      '.ske-count{margin-left:6px;color:var(--dsw-alias-label-tertiary);font-weight:400;font-variant-numeric:tabular-nums}',
      '.ske-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ske-empty{margin:0;padding:10px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
      '.ske-note{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}',
      '.ske-catList{display:flex;flex-direction:column}',
      '.ske-catRow{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.ske-catRow[data-drop="1"],.ske-group[data-drop="1"]{outline:2px dashed var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.ske-drag{flex:none;width:16px;color:var(--dsw-alias-label-tertiary);cursor:grab;user-select:none;font-size:12px;line-height:1}',
      '.ske-drag:active{cursor:grabbing}',
      '.ske-catName{flex:1;min-width:0;height:28px;padding:0 8px;margin-left:-8px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px}',
      '.ske-catName:hover{border-color:var(--dsw-alias-border-l1)}',
      '.ske-catName:focus{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l4)}',
      '.ske-catCount{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;font-variant-numeric:tabular-nums}',
      '.ske-catTools{display:flex;align-items:center;gap:2px}',
      '.ske-iconBtn{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer}',
      '.ske-iconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.ske-iconBtn:disabled{opacity:.35;cursor:default}',
      '.ske-textBtn{height:24px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.ske-textBtn:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}',
      '.ske-group{margin-top:10px;border-radius:var(--dsw-radius-md)}',
      '.ske-groupHead{display:flex;align-items:baseline;gap:8px;padding:4px 0 2px}',
      '.ske-groupName{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.ske-groupCount{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.ske-skillRow{display:grid;grid-template-columns:16px minmax(0,1fr) minmax(0,1.1fr) 120px auto;align-items:center;gap:8px;padding:3px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.ske-check{width:15px;height:15px;flex:none;accent-color:var(--dsw-alias-brand-primary)}',
      '.ske-nameCell{display:flex;align-items:center;gap:6px;min-width:0}',
      '.ske-skillName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-secondary);background:none;border:none;padding:0;cursor:pointer;text-align:left}',
      '.ske-skillName:hover{color:var(--dsw-alias-label-primary)}',
      '.ske-tag{flex:none;padding:0 5px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);color:var(--dsw-alias-state-warn-primary);font-size:10px;line-height:16px;white-space:nowrap}',
      '.ske-zh{box-sizing:border-box;width:100%;height:28px;padding:0 8px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
      '.ske-zh::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.ske-zh:hover{border-color:var(--dsw-alias-border-l1)}',
      '.ske-zh:focus{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l4)}',
      '.ske-select{box-sizing:border-box;width:100%;height:28px;padding:0 6px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;color-scheme:light}',
      '@media (prefers-color-scheme:dark){.ske-select{color-scheme:dark}}',
      '.ske-select option{background-color:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.ske-select:hover{border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.ske-actions{display:flex;align-items:center;gap:2px;justify-content:flex-end}',
      '.ske-miniBtn{height:24px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.ske-miniBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.ske-miniBtn:disabled{opacity:.35;cursor:default}',
      '.ske-detail{grid-column:1/-1;padding:6px 8px 10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7;display:flex;flex-direction:column;gap:4px}',
      '.ske-detailRow{display:flex;gap:8px}',
      '.ske-detailKey{flex:none;min-width:64px;color:var(--dsw-alias-label-tertiary)}',
      '.ske-detailVal{min-width:0;overflow-wrap:anywhere}',
      '.ske-hiddenRow{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.ske-hiddenName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.ske-batchBar{position:sticky;bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);box-shadow:0 6px 20px rgba(0,0,0,.12)}',
      '.ske-batchCount{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.ske-batchBtn{height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.ske-batchBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.ske-batchBtn:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.ske-debug{margin:4px 0 0;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}',
      '@media (max-width:720px){.ske-skillRow{grid-template-columns:16px minmax(0,1fr) auto}.ske-skillRow .ske-zh{grid-column:1/-1}.ske-skillRow .ske-select{grid-column:1/-1}.ske-search{flex:1 1 auto}}',
      '.ske-btn:focus-visible,.ske-status:focus-visible,.ske-iconBtn:focus-visible,.ske-textBtn:focus-visible,.ske-search:focus-visible,.ske-zh:focus-visible,.ske-select:focus-visible,.ske-model:focus-visible,.ske-catName:focus-visible,.ske-miniBtn:focus-visible,.ske-batchBtn:focus-visible,.ske-skillName:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
    ].join('')

    /* ───────────────────────── 设置页 ───────────────────────── */

    function nextCategoryId(categories) {
      const taken = new Set(categories.map((category) => category.id))
      let index = categories.length + 1
      while (taken.has(`c${index}`)) index += 1
      return `c${index}`
    }

    function modelKeyOf(model) {
      return model !== null && model !== undefined && typeof model.provider === 'string' && typeof model.model === 'string'
        ? `${model.provider}::${model.model}`
        : ''
    }

    function modelFromKey(key) {
      const value = String(key ?? '')
      const split = value.indexOf('::')
      if (split < 0) return null
      const provider = value.slice(0, split)
      const model = value.slice(split + 2)
      return provider !== '' && model !== '' ? { provider, model } : null
    }

    function SettingsView(props) {
      const { ctx, t, model } = props
      const snapshot = useSnapshot(model)
      const [draft, setDraft] = useState(null)
      const [saveState, setSaveState] = useState('idle')
      const [saveError, setSaveError] = useState('')
      const [busy, setBusy] = useState('')
      const [report, setReport] = useState(null)
      const [query, setQuery] = useState('')
      const [selectMode, setSelectMode] = useState(false)
      const [selected, setSelected] = useState(() => new Set())
      const [openDetails, setOpenDetails] = useState(() => new Set())
      const [dropTarget, setDropTarget] = useState(null)
      const drag = useRef(null)

      const timer = useRef(null)
      const dirty = useRef(false)
      const editSeq = useRef(0)
      const revRef = useRef(0)
      const lastWritten = useRef(0)
      const adoptedRev = useRef(0)

      useEffect(() => {
        if (snapshot.document !== null && Number.isFinite(snapshot.document.rev)) {
          revRef.current = snapshot.document.rev
          adoptedRev.current = Math.max(adoptedRev.current, snapshot.document.rev)
        }
        if (dirty.current) return
        if (snapshot.document !== null) setDraft(snapshot.document)
        else if (snapshot.status === 'ready') setDraft(emptyDocument())
      }, [snapshot.document, snapshot.status])

      useEffect(() => () => {
        if (timer.current !== null) clearTimeout(timer.current)
      }, [])

      const saveNow = useCallback((next) => {
        if (timer.current !== null) {
          clearTimeout(timer.current)
          timer.current = null
        }
        // 分类名暂时为空时不发请求：宿主会丢弃空名分类，返回文档再覆盖草稿会造成"边打字边消失"。
        const invalid = (Array.isArray(next?.categories) ? next.categories : [])
          .some((category) => typeof category?.name !== 'string' || category.name.trim() === '')
        if (invalid) {
          setSaveState('invalid')
          setSaveError('分类名不能为空')
          return Promise.resolve(false)
        }
        const at = editSeq.current
        setSaveState('saving')
        const send = (baseRev, retried) => Promise.resolve()
          .then(() => channel(ctx, model).save({ document: next, baseRev }))
          .then((result) => unwrap(result))
          .then((result) => {
            const step = planSave(result, retried, lastWritten.current)
            if (step === 'done') {
              if (Number.isFinite(result.document?.rev)) {
                if (result.document.rev < adoptedRev.current) return true
                revRef.current = result.document.rev
                lastWritten.current = result.document.rev
                adoptedRev.current = result.document.rev
              }
              if (editSeq.current !== at) return true
              dirty.current = false
              model.set({ document: result.document })
              setSaveState('saved')
              setSaveError('')
              return true
            }
            if (step === 'retry') {
              const serverRev = Number.isFinite(result?.document?.rev) ? result.document.rev : revRef.current
              revRef.current = serverRev
              return send(serverRev, true)
            }
            if (step === 'adopt') {
              dirty.current = false
              if (result.document !== undefined && result.document !== null) {
                if (Number.isFinite(result.document.rev)) revRef.current = result.document.rev
                model.set({ document: result.document })
              }
              setSaveState('error')
              setSaveError('数据已被另一个页面改过，已载入最新内容，请重试这次修改')
              return false
            }
            setSaveState('error')
            setSaveError(String(result?.reason ?? 'save-failed'))
            return false
          })
        return send(revRef.current, false).catch((error) => {
          setSaveState('error')
          setSaveError(String(error?.message ?? error))
          return false
        })
      }, [ctx, model])

      const persist = useCallback((next) => {
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          timer.current = null
          saveNow(next)
        }, 450)
      }, [saveNow])

      const commit = useCallback((next) => {
        dirty.current = true
        editSeq.current += 1
        setDraft(next)
        persist(next)
      }, [persist])

      const categories = draft?.categories ?? []
      const meta = draft?.skills ?? {}
      const llm = snapshot.llm
      const models = Array.isArray(llm?.models) ? llm.models : []
      const currentModel = draft?.options?.translateModel ?? llm?.defaultModel ?? null
      const currentModelKey = modelKeyOf(currentModel)
      const llmOff = llm !== null && llm !== undefined && llm.available === false

      const orderedSkills = useMemo(() => {
        const orderOf = new Map(categories.map((category, index) => [category.id, Number.isFinite(category.order) ? category.order : index * 10]))
        return [...snapshot.skills].sort((left, right) => {
          const leftCat = meta[left.name]?.categoryId
          const rightCat = meta[right.name]?.categoryId
          const leftOrder = leftCat === undefined || !orderOf.has(leftCat) ? Number.MAX_SAFE_INTEGER : orderOf.get(leftCat)
          const rightOrder = rightCat === undefined || !orderOf.has(rightCat) ? Number.MAX_SAFE_INTEGER : orderOf.get(rightCat)
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
          const leftSkillOrder = Number.isFinite(meta[left.name]?.order) ? meta[left.name].order : Number.MAX_SAFE_INTEGER
          const rightSkillOrder = Number.isFinite(meta[right.name]?.order) ? meta[right.name].order : Number.MAX_SAFE_INTEGER
          if (leftSkillOrder !== rightSkillOrder) return leftSkillOrder - rightSkillOrder
          return left.name.localeCompare(right.name)
        })
      }, [snapshot.skills, meta, categories])

      const visibleSkills = useMemo(() => orderedSkills.filter((skill) => meta[skill.name]?.hidden !== true), [orderedSkills, meta])
      const hiddenSkills = useMemo(() => orderedSkills.filter((skill) => meta[skill.name]?.hidden === true), [orderedSkills, meta])

      const pendingNames = useMemo(
        () => snapshot.skills
          .filter((skill) => {
            if (meta[skill.name]?.hidden === true) return false
            const entry = meta[skill.name] ?? {}
            if (typeof entry.zh !== 'string' || entry.zh === '') return true
            return entry.srcHash !== skill.srcHash
          })
          .map((skill) => skill.name),
        [snapshot.skills, meta],
      )

      // ── 分类操作 ──
      const addCategory = () => {
        const id = nextCategoryId(categories)
        const maxOrder = categories.reduce((max, category) => Math.max(max, Number.isFinite(category.order) ? category.order : 0), 0)
        commit({ ...draft, categories: [...categories, { id, name: t('newCategory'), order: maxOrder + 10 }] })
      }

      const patchCategory = (id, patch) => {
        commit({ ...draft, categories: categories.map((category) => (category.id === id ? { ...category, ...patch } : category)) })
      }

      const removeCategory = (id) => {
        const skills = {}
        for (const [name, entry] of Object.entries(meta)) {
          if (entry.categoryId === id) {
            const { categoryId, ...rest } = entry
            if (Object.keys(rest).length > 0) skills[name] = rest
          } else {
            skills[name] = entry
          }
        }
        commit({ ...draft, categories: categories.filter((category) => category.id !== id), skills })
      }

      const moveCategory = (id, delta) => {
        const index = categories.findIndex((category) => category.id === id)
        const target = index + delta
        if (index < 0 || target < 0 || target >= categories.length) return
        const next = [...categories]
        const [moved] = next.splice(index, 1)
        next.splice(target, 0, moved)
        commit({ ...draft, categories: next.map((category, position) => ({ ...category, order: position * 10 })) })
      }

      const moveCategoryTo = (sourceId, targetId) => {
        if (sourceId === targetId) return
        const from = categories.findIndex((category) => category.id === sourceId)
        const to = categories.findIndex((category) => category.id === targetId)
        if (from < 0 || to < 0) return
        const next = [...categories]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        commit({ ...draft, categories: next.map((category, position) => ({ ...category, order: position * 10 })) })
      }

      // ── 技能操作 ──
      const patchSkill = (name, patch) => {
        const current = meta[name] ?? {}
        const merged = { ...current, ...patch }
        const skills = { ...meta }
        if (merged.zh === undefined || merged.zh === '') {
          delete merged.zh
          delete merged.srcHash
        }
        if (merged.categoryId === undefined || merged.categoryId === '') delete merged.categoryId
        if (merged.hidden !== true) delete merged.hidden
        if (Object.keys(merged).length === 0) delete skills[name]
        else skills[name] = merged
        commit({ ...draft, skills })
      }

      /** 把技能移动到某个分类（或未归类），beforeName 指定插在哪条前面。 */
      const moveSkillTo = (name, catId, beforeName) => {
        const same = (other) => (meta[other]?.categoryId ?? null) === (catId ?? null)
        const members = snapshot.skills.map((skill) => skill.name).filter((other) => other !== name && same(other))
        const orderOf = (other) => (Number.isFinite(meta[other]?.order) ? meta[other].order : Number.MAX_SAFE_INTEGER)
        members.sort((left, right) => orderOf(left) - orderOf(right) || left.localeCompare(right))
        let index = beforeName === null || beforeName === undefined ? members.length : members.indexOf(beforeName)
        if (index < 0) index = members.length
        members.splice(index, 0, name)
        const skills = { ...meta }
        members.forEach((member, position) => {
          const entry = { ...(skills[member] ?? {}) }
          if (catId === undefined || catId === null) delete entry.categoryId
          else entry.categoryId = catId
          entry.order = position * 10
          skills[member] = entry
        })
        commit({ ...draft, skills })
      }

      const translate = (names) => {
        const targets = Array.isArray(names) ? names : pendingNames
        if (targets.length === 0) {
          setReport({ text: t('noTargets') })
          return
        }
        if (llmOff || models.length === 0) {
          setReport({ text: t('modelUnavailable'), error: true })
          return
        }
        setBusy('translate')
        setReport(null)
        const flushed = dirty.current && draft !== null ? saveNow(draft) : Promise.resolve(true)
        flushed
          .then(() => channel(ctx, model).translate({
            names: targets,
            model: currentModel,
            skills: snapshot.skills.map((skill) => ({ name: skill.name, description: skill.description })),
          }))
          .then((result) => unwrap(result))
          .then((result) => {
            if (result?.document !== undefined && result.document !== null) {
              dirty.current = false
              if (Number.isFinite(result.document.rev)) {
                revRef.current = result.document.rev
                lastWritten.current = result.document.rev
              }
              const local = draft
              const localValid = local !== null
                && !(local.categories ?? []).some((category) => typeof category?.name !== 'string' || category.name.trim() === '')
              model.set({
                document: localValid
                  ? { ...local, skills: result.document.skills ?? local.skills, rev: result.document.rev, options: result.document.options ?? local.options }
                  : result.document,
                llm: result.llm ?? snapshot.llm,
              })
            }
            const done = Array.isArray(result?.results) ? result.results.length : 0
            const failed = Array.isArray(result?.failures) ? result.failures : []
            setReport({
              text: failed.length === 0
                ? `${t('doneCount')} ${done}`
                : `${t('doneCount')} ${done} · ${failed.length} ${t('failedCount')}：${failed.slice(0, 3).map((entry) => `${entry.name}（${entry.reason}）`).join('，')}`,
              error: failed.length > 0 && done === 0,
            })
          })
          .catch((error) => setReport({ text: `${t('saveFailed')}${String(error?.message ?? error)}`, error: true }))
          .finally(() => setBusy(''))
      }

      const reset = () => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('resetConfirm'))) return
        setBusy('reset')
        Promise.resolve()
          .then(() => channel(ctx, model).reset())
          .then((result) => unwrap(result))
          .then((result) => {
            if (result?.ok === true) {
              dirty.current = false
              if (Number.isFinite(result.document?.rev)) {
                revRef.current = result.document.rev
                lastWritten.current = result.document.rev
              }
              model.set({ document: result.document })
              setSaveState('saved')
            }
          })
          .catch((error) => setReport({ text: String(error?.message ?? error), error: true }))
          .finally(() => setBusy(''))
      }

      // ── 批量 ──
      const toggleSelected = (name) => {
        setSelected((previous) => {
          const next = new Set(previous)
          if (next.has(name)) next.delete(name)
          else next.add(name)
          return next
        })
      }
      const selectAllVisible = () => setSelected(new Set(visibleSkills.map((skill) => skill.name)))
      const exitSelect = () => { setSelectMode(false); setSelected(new Set()) }

      const batchAssign = (catId) => {
        const names = [...selected]
        if (names.length === 0) return
        const skills = { ...meta }
        const orderBase = snapshot.skills.length * 10
        names.forEach((name, index) => {
          const entry = { ...(skills[name] ?? {}) }
          if (catId === '') delete entry.categoryId
          else entry.categoryId = catId
          entry.order = orderBase + index * 10
          skills[name] = entry
        })
        commit({ ...draft, skills })
        setReport({ text: `${t('batchAssign')} ${names.length}` })
      }

      const batchClearZh = () => {
        const names = [...selected]
        if (names.length === 0) return
        const skills = { ...meta }
        for (const name of names) {
          const entry = { ...(skills[name] ?? {}) }
          delete entry.zh
          delete entry.srcHash
          if (Object.keys(entry).length === 0) delete skills[name]
          else skills[name] = entry
        }
        commit({ ...draft, skills })
        setReport({ text: `${t('batchClear')} ${names.length}` })
      }

      const batchHide = () => {
        const names = [...selected]
        if (names.length === 0) return
        const skills = { ...meta }
        for (const name of names) skills[name] = { ...(skills[name] ?? {}), hidden: true }
        commit({ ...draft, skills })
        setSelected(new Set())
        setReport({ text: `${t('batchHide')} ${names.length}` })
      }

      const toggleDetails = (name) => {
        setOpenDetails((previous) => {
          const next = new Set(previous)
          if (next.has(name)) next.delete(name)
          else next.add(name)
          return next
        })
      }

      const themeMode = (() => {
        try {
          const theme = ctx.get('theme')
          const id = theme?.getTheme?.()?.active?.id
          return id === 'dark' ? 'dark' : id === 'light' ? 'light' : undefined
        } catch (error) {
          return undefined
        }
      })()

      const statusText = (() => {
        if (report !== null && typeof report.text === 'string' && report.text !== '') return { text: report.text, tone: report.error === true ? 'error' : 'info' }
        if (saveState === 'saving') return { text: t('saving'), tone: 'info' }
        if (saveState === 'saved') return { text: t('saved'), tone: 'info' }
        if (saveState === 'invalid') return { text: saveError, tone: 'warn' }
        if (saveState === 'error') return { text: `${t('saveFailed')}${saveError}`, tone: 'error' }
        return null
      })()

      const header = h('header', { className: 'ske-head' },
        h('div', null,
          h('h2', { className: 'ske-title' }, t('title')),
          h('p', { className: 'ske-intro' }, t('intro')),
        ),
        h('span', { className: 'ske-status', 'data-tone': snapshot.menuActive ? 'ok' : 'warn', title: snapshot.menuReason ?? '' },
          h('span', { className: 'ske-dot' }),
          `${snapshot.menuActive ? t('menuOn') : t('menuOff')} · v${snapshot.codeVersion ?? '?'}/${CLIENT_VERSION}`,
        ),
      )

      if (snapshot.status === 'loading' || draft === null) {
        if (snapshot.status === 'error') {
          return h('div', { className: 'ske-page' },
            h('style', { dangerouslySetInnerHTML: { __html: SETTINGS_CSS } }),
            header,
            h('p', { className: 'ske-line', 'data-tone': 'error' }, `${t('loadFailed')}${snapshot.error ?? ''}`),
            h('div', null, h('button', { type: 'button', className: 'ske-btn ske-btn--primary', onClick: () => model.reload?.() }, t('retry'))),
          )
        }
        return h('div', { className: 'ske-page' },
          h('style', { dangerouslySetInnerHTML: { __html: SETTINGS_CSS } }),
          header,
          h('p', { className: 'ske-note' }, t('loading')),
        )
      }

      // 分组
      const needle = query.trim().toLowerCase()
      const groupOrder = categories.map((category) => ({ key: category.id, catId: category.id, name: category.name, skills: [] }))
      const ungrouped = { key: '__ungrouped__', catId: undefined, name: t('uncategorized'), skills: [] }
      const groupMap = new Map(groupOrder.map((group) => [group.key, group]))
      for (const skill of visibleSkills) {
        const entry = meta[skill.name] ?? {}
        if (needle !== '') {
          const haystack = `${skill.name} ${typeof entry.zh === 'string' ? entry.zh : ''} ${skill.description ?? ''}`.toLowerCase()
          if (!haystack.includes(needle)) continue
        }
        const bucket = entry.categoryId !== undefined ? groupMap.get(entry.categoryId) : undefined
        ;(bucket ?? ungrouped).skills.push(skill)
      }
      const groups = groupOrder.filter((group) => group.skills.length > 0)
      if (ungrouped.skills.length > 0) groups.push(ungrouped)
      const totalVisible = groups.reduce((total, group) => total + group.skills.length, 0)

      const countOf = (id) => snapshot.skills.reduce((total, skill) => (meta[skill.name]?.categoryId === id && meta[skill.name]?.hidden !== true ? total + 1 : total), 0)

      const modelOptions = []
      let lastProvider = null
      for (const candidate of models) {
        if (candidate.provider !== lastProvider) {
          modelOptions.push({ provider: candidate.provider, providerName: candidate.providerName })
          lastProvider = candidate.provider
        }
      }

      const toolbar = h('div', { className: 'ske-toolbar' },
        h('input', {
          className: 'ske-search', value: query, placeholder: t('searchSkills'), 'aria-label': t('searchSkills'),
          onChange: (event) => setQuery(event.target.value),
        }),
        h('span', { className: 'ske-spacer' }),
        h('select', {
          className: 'ske-model', value: currentModelKey, disabled: llmOff || models.length === 0,
          'aria-label': t('model'), title: t('model'), style: themeMode === undefined ? undefined : { colorScheme: themeMode },
          onChange: (event) => commit({ ...draft, options: { ...draft.options, translateModel: modelFromKey(event.target.value) } }),
        }, [
          models.length === 0 ? h('option', { key: '__none__', value: '' }, t('modelUnavailable')) : null,
          ...modelOptions.length === 0
            ? []
            : modelOptions.map((provider) => h('optgroup', { key: provider.provider, label: provider.providerName },
              models.filter((candidate) => candidate.provider === provider.provider).map((candidate) =>
                h('option', { key: `${candidate.provider}::${candidate.id}`, value: `${candidate.provider}::${candidate.id}` }, candidate.name))),
            ),
        ]),
        h('button', {
          type: 'button', className: 'ske-btn ske-btn--primary', disabled: busy !== '' || pendingNames.length === 0 || llmOff,
          onClick: () => translate(),
        }, busy === 'translate' ? t('translating') : `${t('translateAll')}${pendingNames.length > 0 ? ` (${pendingNames.length})` : ''}`),
        h('button', { type: 'button', className: 'ske-btn', disabled: busy !== '', onClick: () => (selectMode ? exitSelect() : setSelectMode(true)) }, selectMode ? t('selectExit') : t('selectMode')),
        h('button', { type: 'button', className: 'ske-btn', disabled: busy !== '', onClick: reset }, t('reset')),
      )

      const categorySection = h('section', { className: 'ske-section' },
        h('div', { className: 'ske-sectionHead' },
          h('h3', { className: 'ske-sectionTitle' }, t('categories'), h('span', { className: 'ske-count' }, String(categories.length))),
          h('button', { type: 'button', className: 'ske-btn ske-btn--quiet', onClick: addCategory }, `+ ${t('newCategory')}`),
        ),
        categories.length === 0
          ? h('p', { className: 'ske-empty' }, t('emptyCategories'))
          : h('div', { className: 'ske-catList' }, categories.map((category, index) => h('div', {
            key: category.id,
            className: 'ske-catRow',
            'data-drop': dropTarget === category.id ? '1' : undefined,
            onDragOver: (event) => { if (drag.current?.kind === 'cat') { event.preventDefault(); setDropTarget(category.id) } },
            onDragLeave: () => setDropTarget((current) => (current === category.id ? null : current)),
            onDrop: (event) => { if (drag.current?.kind === 'cat') { event.preventDefault(); moveCategoryTo(drag.current.id, category.id); drag.current = null; setDropTarget(null) } },
          },
            h('span', {
              className: 'ske-drag', title: '拖动排序', draggable: selectMode ? undefined : true,
              onDragStart: () => { drag.current = { kind: 'cat', id: category.id } },
              onDragEnd: () => { drag.current = null; setDropTarget(null) },
            }, '⠿'),
            h('input', {
              className: 'ske-catName', value: category.name, 'aria-label': t('categoryName'), maxLength: 24,
              onFocus: (event) => event.currentTarget.select(),
              onChange: (event) => patchCategory(category.id, { name: event.target.value }),
            }),
            h('span', { className: 'ske-catCount' }, String(countOf(category.id))),
            h('div', { className: 'ske-catTools' },
              h('button', { type: 'button', className: 'ske-iconBtn', disabled: index === 0, 'aria-label': t('moveUp'), title: t('moveUp'), onClick: () => moveCategory(category.id, -1) }, '↑'),
              h('button', { type: 'button', className: 'ske-iconBtn', disabled: index === categories.length - 1, 'aria-label': t('moveDown'), title: t('moveDown'), onClick: () => moveCategory(category.id, 1) }, '↓'),
              h('button', { type: 'button', className: 'ske-textBtn', onClick: () => removeCategory(category.id) }, t('remove')),
            ),
          ))),
        h('p', { className: 'ske-hint' }, t('categoriesHint')),
      )

      const renderSkillRow = (skill) => {
        const entry = meta[skill.name] ?? {}
        const stale = typeof entry.zh === 'string' && entry.zh !== '' && entry.srcHash !== skill.srcHash
        const isOpen = openDetails.has(skill.name)
        const rows = [
          h('div', {
            key: skill.name,
            className: 'ske-skillRow',
            onDragOver: (event) => { if (drag.current?.kind === 'skill') { event.preventDefault() } },
            onDrop: (event) => { if (drag.current?.kind === 'skill' && drag.current.name !== skill.name) { event.preventDefault(); const group = entry.categoryId; moveSkillTo(drag.current.name, group, skill.name); drag.current = null; setDropTarget(null) } },
          },
            selectMode
              ? h('input', { className: 'ske-check', type: 'checkbox', checked: selected.has(skill.name), 'aria-label': skill.name, onChange: () => toggleSelected(skill.name) })
              : h('span', {
                className: 'ske-drag', title: '拖动', draggable: true,
                onDragStart: () => { drag.current = { kind: 'skill', name: skill.name } },
                onDragEnd: () => { drag.current = null; setDropTarget(null) },
              }, '⠿'),
            h('span', { className: 'ske-nameCell' },
              h('button', { type: 'button', className: 'ske-skillName', title: skill.description, onClick: () => toggleDetails(skill.name) }, skill.name),
              stale ? h('span', { className: 'ske-tag' }, t('stale')) : null,
            ),
            h('input', {
              className: 'ske-zh', value: entry.zh ?? '', placeholder: t('zhPlaceholder'), 'aria-label': `${skill.name} 中文`, maxLength: 200,
              onChange: (event) => patchSkill(skill.name, { zh: event.target.value, srcHash: skill.srcHash }),
            }),
            h('select', {
              className: 'ske-select', value: entry.categoryId ?? '', 'aria-label': `${skill.name} 分类`,
              style: themeMode === undefined ? undefined : { colorScheme: themeMode },
              onChange: (event) => patchSkill(skill.name, { categoryId: event.target.value === '' ? undefined : event.target.value }),
            },
              h('option', { value: '' }, t('uncategorized')),
              categories.map((category) => h('option', { key: category.id, value: category.id }, category.name)),
            ),
            h('div', { className: 'ske-actions' },
              h('button', { type: 'button', className: 'ske-miniBtn', disabled: busy !== '' || llmOff, onClick: () => translate([skill.name]) }, entry.zh ? t('retranslate') : t('translateOne')),
              h('button', { type: 'button', className: 'ske-miniBtn', onClick: () => patchSkill(skill.name, { hidden: true }) }, t('hide')),
            ),
          ),
        ]
        if (isOpen) {
          rows.push(h('div', { key: `${skill.name}__detail`, className: 'ske-detail' },
            h('div', { className: 'ske-detailRow' },
              h('span', { className: 'ske-detailKey' }, t('confirmHint')),
              h('span', { className: 'ske-detailVal' }, skill.description || '—'),
            ),
            skill.path !== undefined ? h('div', { className: 'ske-detailRow' }, h('span', { className: 'ske-detailKey' }, t('pathLabel')), h('span', { className: 'ske-detailVal' }, String(skill.path))) : null,
            skill.source !== undefined ? h('div', { className: 'ske-detailRow' }, h('span', { className: 'ske-detailKey' }, t('sourceLabel')), h('span', { className: 'ske-detailVal' }, String(skill.source))) : null,
            skill.whenToUse !== undefined ? h('div', { className: 'ske-detailRow' }, h('span', { className: 'ske-detailKey' }, t('whenToUseLabel')), h('span', { className: 'ske-detailVal' }, String(skill.whenToUse))) : null,
            h('div', { className: 'ske-detailRow' },
              h('span', { className: 'ske-detailKey' }, t('modelInvocableLabel')),
              h('span', { className: 'ske-detailVal' }, skill.modelInvocable === false ? t('no') : t('yes')),
            ),
          ))
        }
        return rows
      }

      const skillsSection = h('section', { className: 'ske-section' },
        h('div', { className: 'ske-sectionHead' },
          h('h3', { className: 'ske-sectionTitle' }, t('skills'), h('span', { className: 'ske-count' }, String(visibleSkills.length))),
          selectMode ? h('button', { type: 'button', className: 'ske-btn ske-btn--quiet', onClick: selectAllVisible }, t('selectAll')) : null,
        ),
        visibleSkills.length === 0
          ? h('div', null,
            h('p', { className: 'ske-empty' }, t('emptySkills')),
            h('p', { className: 'ske-note' }, `诊断：${Array.isArray(snapshot.catalogDiagnostics) && snapshot.catalogDiagnostics.length > 0 ? snapshot.catalogDiagnostics.join(' · ') : '（宿主没有返回任何来源信息）'}`),
          )
          : groups.length === 0
            ? h('p', { className: 'ske-empty' }, `${t('noMatch')}「${query}」`)
            : h('div', null, groups.map((group) => h('div', {
              key: group.key,
              className: 'ske-group',
              'data-drop': dropTarget === group.key ? '1' : undefined,
              onDragOver: (event) => { if (drag.current?.kind === 'skill') { event.preventDefault(); setDropTarget(group.key) } },
              onDragLeave: () => setDropTarget((current) => (current === group.key ? null : current)),
              onDrop: (event) => {
                if (drag.current?.kind === 'skill') {
                  event.preventDefault()
                  const fromEntry = meta[drag.current.name] ?? {}
                  if ((fromEntry.categoryId ?? null) !== (group.catId ?? null)) moveSkillTo(drag.current.name, group.catId, null)
                  drag.current = null
                  setDropTarget(null)
                }
              },
            },
              h('div', { className: 'ske-groupHead' },
                h('span', { className: 'ske-groupName' }, group.name),
                h('span', { className: 'ske-groupCount' }, String(group.skills.length)),
              ),
              ...group.skills.flatMap((skill) => renderSkillRow(skill)),
            ))),
        totalVisible === 0 && visibleSkills.length > 0 ? h('p', { className: 'ske-note' }, `${t('noMatch')}「${query}」`) : null,
      )

      const hiddenSection = hiddenSkills.length > 0
        ? h('section', { className: 'ske-section' },
          h('div', { className: 'ske-sectionHead' },
            h('h3', { className: 'ske-sectionTitle' }, t('hiddenSection'), h('span', { className: 'ske-count' }, String(hiddenSkills.length))),
          ),
          h('p', { className: 'ske-hint' }, t('hiddenHint')),
          h('div', { className: 'ske-catList' }, hiddenSkills.map((skill) => h('div', { key: skill.name, className: 'ske-hiddenRow' },
            h('span', { className: 'ske-hiddenName', title: skill.description }, skill.name),
            h('button', { type: 'button', className: 'ske-miniBtn', onClick: () => patchSkill(skill.name, { hidden: false }) }, t('restore')),
          ))),
        )
        : null

      const batchBar = selectMode
        ? h('div', { className: 'ske-batchBar' },
          h('span', { className: 'ske-batchCount' }, `${t('selectedCount')} ${selected.size}`),
          h('select', {
            className: 'ske-select', style: { width: '150px' }, value: '', 'aria-label': t('batchAssign'),
            onChange: (event) => {
              const value = event.target.value
              if (value !== '') batchAssign(value === '__none__' ? '' : value)
            },
          }, [
            h('option', { key: '__pick__', value: '' }, t('batchAssign')),
            h('option', { key: '__none__', value: '__none__' }, t('uncategorized')),
            ...categories.map((category) => h('option', { key: category.id, value: category.id }, category.name)),
          ]),
          h('button', { type: 'button', className: 'ske-batchBtn', disabled: busy !== '' || llmOff || selected.size === 0, onClick: () => translate([...selected]) }, t('batchTranslate')),
          h('button', { type: 'button', className: 'ske-batchBtn', disabled: selected.size === 0, onClick: batchClearZh }, t('batchClear')),
          h('button', { type: 'button', className: 'ske-batchBtn', disabled: selected.size === 0, onClick: batchHide }, t('batchHide')),
          h('button', { type: 'button', className: 'ske-batchBtn', onClick: exitSelect }, t('selectExit')),
        )
        : null

      return h('div', { className: 'ske-page' },
        h('style', { dangerouslySetInnerHTML: { __html: SETTINGS_CSS } }),
        header,
        toolbar,
        h('div', { className: 'ske-line', 'data-tone': statusText === null ? 'info' : statusText.tone }, statusText === null ? '' : statusText.text),
        llmOff ? h('p', { className: 'ske-note' }, `${t('modelUnavailable')} · ${t('modelUnavailableHint')}`) : null,
        categorySection,
        skillsSection,
        hiddenSection,
        batchBar,
      )
    }

    /* ───────────────────────── 插件入口 ───────────────────────── */

    const inject = ['slots', 'locale', 'remote']

    function apply(ctx) {
      const model = createModel()

      ctx.effect(() => ctx.locale.register(NS, { zh: UI_zh, en: UI_en }), 'dsh-skill-easy: locale')
      const t = ctx.locale.bind(NS)

      let generation = 0
      const boot = () => {
        const mine = ++generation
        model.set({ status: 'loading', error: null })
        Promise.resolve()
          .then(() => openRemote(ctx))
          .then(async (namespace) => {
            model.namespace = namespace
            return unwrap(await namespace.overview())
          })
          .then((view) => {
            if (mine !== generation) return
            model.set({
              status: 'ready',
              document: view?.document ?? null,
              skills: Array.isArray(view?.skills) ? view.skills : [],
              catalogDiagnostics: Array.isArray(view?.catalogDiagnostics) ? view.catalogDiagnostics : [],
              codeVersion: view?.codeVersion ?? null,
              llm: view?.llm ?? null,
            })
          })
          .catch((error) => {
            if (mine !== generation) return
            console.error('[dsh-skill-easy] 初始化失败', error)
            model.set({ status: 'error', error: describeError(error) })
          })
      }
      model.reload = boot
      ctx.effect(() => {
        boot()
        return () => {
          generation += 1
        }
      }, 'dsh-skill-easy: overview')

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register({
          name: 'settings.section',
          id: SECTION_ID,
          order: 46,
          label: () => t('nav'),
          locale: NS,
          inject: () => ({ t }),
        }, (ownerProps) => h(SettingsView, { ctx, t, model, ...ownerProps })))

      ctx.effect(() => installMenuSource(ctx, model, t), 'dsh-skill-easy: slash menu')
    }

    // `__test` 只给 test/ 下的回归用例用，运行时不读它。
    return { inject, apply, __test: { planSave, hashOf, unwrap, buildMenuItems } }
  },
})
