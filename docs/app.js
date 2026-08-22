const search = document.querySelector('#doc-search')
const sections = [...document.querySelectorAll('.searchable')]
const links = [...document.querySelectorAll('.nav-link')]

document.querySelectorAll('.api-grid.three').forEach(grid => {
  if (!grid.id) grid.id = 'registries'
})

const symbolIds = {
  PortableCasePlan: 'portable-case-plan',
  PortableSuite: 'portable-suite',
  createStepRegistry: 'create-step-registry',
  createMetricRegistry: 'create-metric-registry',
  createReporterRegistry: 'create-reporter-registry',
}
document.querySelectorAll('.api-card h3').forEach(heading => {
  const id = symbolIds[heading.textContent.trim()]
  if (id && !heading.parentElement.id) heading.parentElement.id = id
})
document.querySelectorAll('.report-table').forEach(table => {
  const firstRow = table.firstElementChild
  if (firstRow && !firstRow.id) firstRow.id = 'portable-case-result'
})
document.querySelectorAll('.api-index a').forEach(link => {
  const symbol = link.textContent.trim()
  if (symbolIds[symbol]) link.href = `#${symbolIds[symbol]}`
  if (symbol === 'PortableCaseResult') link.href = '#portable-case-result'
})

const locale = document.documentElement.lang
const heroCopy = document.querySelector('.hero-copy')
if (heroCopy && locale === 'zh-CN') {
  heroCopy.innerHTML = heroCopy.textContent.replace('插件执行由你的 callback 负责。', '<span class="cjk-phrase">插件执行由你的 callback 负责。</span>')
}
const apiIndexIntro = document.querySelector('#api-index > p')
if (apiIndexIntro && locale === 'ja') {
  apiIndexIntro.innerHTML = apiIndexIntro.innerHTML.replace('識別子とシグネチャ', '<span class="cjk-phrase">識別子とシグネチャ</span>')
}

function filterDocs(value) {
  const query = value.trim().toLowerCase()
  sections.forEach(section => {
    const haystack = `${section.dataset.search ?? ''} ${section.textContent}`.toLowerCase()
    section.classList.toggle('hidden', query !== '' && !haystack.includes(query))
  })
}

search?.addEventListener('input', event => filterDocs(event.target.value))
document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement !== search) {
    event.preventDefault()
    search?.focus()
  }
})

document.querySelectorAll('.copy-button').forEach(button => {
  button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy)
    if (!source) return
    const text = source.textContent
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else throw new Error('clipboard unavailable')
    } catch {
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(source)
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.execCommand('copy')
      selection?.removeAllRanges()
    }
    const original = button.textContent
    button.textContent = button.dataset.copied ?? (document.documentElement.lang === 'zh-CN' ? '已复制' : document.documentElement.lang === 'ja' ? 'コピー済み' : 'Copied')
    window.setTimeout(() => { button.textContent = original }, 1400)
  })
})

const observer = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
  if (!visible) return
  links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`))
}, { rootMargin: '-18% 0px -70% 0px', threshold: [0, .2, .5] })
sections.forEach(section => observer.observe(section))
