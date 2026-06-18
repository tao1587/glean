import type { HLJSApi } from 'highlight.js'

let loaderPromise: Promise<HLJSApi> | null = null

export function loadHighlightCore(): Promise<HLJSApi> {
  if (loaderPromise) return loaderPromise

  loaderPromise = (async () => {
    const [{ default: hljs }, js, ts, py, bash, json, xml, css, sql, yaml, md, go, rust] =
      await Promise.all([
        import('highlight.js/lib/core'),
        import('highlight.js/lib/languages/javascript'),
        import('highlight.js/lib/languages/typescript'),
        import('highlight.js/lib/languages/python'),
        import('highlight.js/lib/languages/bash'),
        import('highlight.js/lib/languages/json'),
        import('highlight.js/lib/languages/xml'),
        import('highlight.js/lib/languages/css'),
        import('highlight.js/lib/languages/sql'),
        import('highlight.js/lib/languages/yaml'),
        import('highlight.js/lib/languages/markdown'),
        import('highlight.js/lib/languages/go'),
        import('highlight.js/lib/languages/rust'),
      ])

    hljs.registerLanguage('javascript', js.default)
    hljs.registerLanguage('js', js.default)
    hljs.registerLanguage('typescript', ts.default)
    hljs.registerLanguage('ts', ts.default)
    hljs.registerLanguage('python', py.default)
    hljs.registerLanguage('py', py.default)
    hljs.registerLanguage('bash', bash.default)
    hljs.registerLanguage('sh', bash.default)
    hljs.registerLanguage('json', json.default)
    hljs.registerLanguage('xml', xml.default)
    hljs.registerLanguage('html', xml.default)
    hljs.registerLanguage('css', css.default)
    hljs.registerLanguage('sql', sql.default)
    hljs.registerLanguage('yaml', yaml.default)
    hljs.registerLanguage('yml', yaml.default)
    hljs.registerLanguage('markdown', md.default)
    hljs.registerLanguage('md', md.default)
    hljs.registerLanguage('go', go.default)
    hljs.registerLanguage('rust', rust.default)
    hljs.registerLanguage('rs', rust.default)

    hljs.configure({ ignoreUnescapedHTML: true })
    return hljs
  })().catch((err) => {
    loaderPromise = null // Clear on failure, allowing retry next time
    throw err
  })

  return loaderPromise
}
