const search = document.querySelector('#doc-search')
const sections = [...document.querySelectorAll('.searchable')]
const links = [...document.querySelectorAll('.nav-link')]

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
    button.textContent = 'Copied'
    window.setTimeout(() => { button.textContent = original }, 1400)
  })
})

const observer = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
  if (!visible) return
  links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`))
}, { rootMargin: '-18% 0px -70% 0px', threshold: [0, .2, .5] })
sections.forEach(section => observer.observe(section))
