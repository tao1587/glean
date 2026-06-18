import http from 'node:http'
import { URL } from 'node:url'

const PORT = Number(process.env.MOCK_PORT || 8787)

const now = new Date()
const iso = (offsetMinutes = 0) => new Date(now.getTime() + offsetMinutes * 60_000).toISOString()

const state = {
  user: {
    id: 'user-demo',
    email: 'demo@example.com',
    name: 'Demo User',
    username: 'demo',
    phone: null,
    avatar_url: null,
    is_active: true,
    is_verified: true,
    primary_auth_provider: 'local',
    settings: {
      read_later_days: 7,
      show_read_later_remaining: true,
      translation_provider: 'google',
      translation_target_language: 'zh-CN',
      list_translation_auto_enabled: true,
      translation_api_key: '',
      translation_model: 'gpt-4o-mini',
      translation_base_url: '',
    },
    created_at: iso(-60 * 24 * 30),
  },
  folders: {
    feed: [
      {
        id: 'folder-tech',
        name: 'Tech',
        type: 'feed',
        position: 0,
        children: [
          {
            id: 'folder-ai',
            name: 'AI',
            type: 'feed',
            position: 0,
            children: [],
          },
        ],
      },
      {
        id: 'folder-design',
        name: 'Design',
        type: 'feed',
        position: 1,
        children: [],
      },
    ],
    bookmark: [],
  },
  subscriptions: [
    {
      id: 'sub-1',
      user_id: 'user-demo',
      feed_id: 'feed-1',
      custom_title: null,
      folder_id: 'folder-ai',
      created_at: iso(-3000),
      unread_count: 12,
      feed: {
        id: 'feed-1',
        url: 'https://openai.com/blog/rss.xml',
        title: 'OpenAI Blog',
        site_url: 'https://openai.com/blog',
        description: 'OpenAI updates and research notes.',
        icon_url: 'https://openai.com/favicon.ico',
        language: 'en',
        status: 'active',
        error_count: 0,
        fetch_error_message: null,
        last_fetch_attempt_at: iso(-15),
        last_fetch_success_at: iso(-15),
        last_fetched_at: iso(-15),
        last_entry_at: iso(-180),
        created_at: iso(-4000),
        updated_at: iso(-15),
      },
    },
    {
      id: 'sub-2',
      user_id: 'user-demo',
      feed_id: 'feed-2',
      custom_title: 'Hacker News',
      folder_id: 'folder-tech',
      created_at: iso(-2800),
      unread_count: 4,
      feed: {
        id: 'feed-2',
        url: 'https://news.ycombinator.com/rss',
        title: 'Hacker News',
        site_url: 'https://news.ycombinator.com',
        description: 'Technology headlines.',
        icon_url: null,
        language: 'en',
        status: 'active',
        error_count: 0,
        fetch_error_message: null,
        last_fetch_attempt_at: iso(-22),
        last_fetch_success_at: iso(-22),
        last_fetched_at: iso(-22),
        last_entry_at: iso(-80),
        created_at: iso(-4000),
        updated_at: iso(-22),
      },
    },
    {
      id: 'sub-3',
      user_id: 'user-demo',
      feed_id: 'feed-3',
      custom_title: null,
      folder_id: 'folder-design',
      created_at: iso(-2600),
      unread_count: 0,
      feed: {
        id: 'feed-3',
        url: 'https://www.smashingmagazine.com/feed/',
        title: 'Smashing Magazine',
        site_url: 'https://www.smashingmagazine.com',
        description: 'Design and frontend articles.',
        icon_url: null,
        language: 'en',
        status: 'active',
        error_count: 0,
        fetch_error_message: null,
        last_fetch_attempt_at: iso(-45),
        last_fetch_success_at: iso(-45),
        last_fetched_at: iso(-45),
        last_entry_at: iso(-240),
        created_at: iso(-4000),
        updated_at: iso(-45),
      },
    },
    {
      id: 'sub-4',
      user_id: 'user-demo',
      feed_id: 'feed-4',
      custom_title: '独立博客',
      folder_id: null,
      created_at: iso(-2400),
      unread_count: 7,
      feed: {
        id: 'feed-4',
        url: 'https://example.com/feed.xml',
        title: 'Indie Notes',
        site_url: 'https://example.com',
        description: 'Personal essays and notes.',
        icon_url: null,
        language: 'zh-CN',
        status: 'active',
        error_count: 0,
        fetch_error_message: null,
        last_fetch_attempt_at: iso(-60),
        last_fetch_success_at: iso(-60),
        last_fetched_at: iso(-60),
        last_entry_at: iso(-140),
        created_at: iso(-4000),
        updated_at: iso(-60),
      },
    },
  ],
  tokens: [],
}

const entriesByFeedId = {
  'feed-1': [
    {
      id: 'entry-1',
      feed_id: 'feed-1',
      guid: 'entry-1',
      url: 'https://openai.com/index/new-tools',
      title: 'OpenAI introduces new tools for building agents',
      author: 'OpenAI',
      content: null,
      summary: 'A summary of new models, tools, and agent-building primitives.',
      published_at: iso(-200),
      created_at: iso(-200),
      is_read: false,
      read_later: false,
      read_later_until: null,
      read_at: null,
      is_bookmarked: false,
      bookmark_id: null,
      feed_title: 'OpenAI Blog',
      feed_icon_url: 'https://openai.com/favicon.ico',
    },
    {
      id: 'entry-2',
      feed_id: 'feed-1',
      guid: 'entry-2',
      url: 'https://openai.com/index/science',
      title: 'Research update on multimodal reasoning',
      author: 'OpenAI',
      content: null,
      summary: 'A deeper look at multimodal reasoning progress and evaluation.',
      published_at: iso(-500),
      created_at: iso(-500),
      is_read: false,
      read_later: false,
      read_later_until: null,
      read_at: null,
      is_bookmarked: false,
      bookmark_id: null,
      feed_title: 'OpenAI Blog',
      feed_icon_url: 'https://openai.com/favicon.ico',
    },
  ],
  'feed-2': [
    {
      id: 'entry-3',
      feed_id: 'feed-2',
      guid: 'entry-3',
      url: 'https://news.ycombinator.com/item?id=1',
      title: 'Show HN: Fast local search for large note collections',
      author: 'hn-user',
      content: null,
      summary: 'A note indexing engine tuned for offline-first workflows.',
      published_at: iso(-90),
      created_at: iso(-90),
      is_read: false,
      read_later: false,
      read_later_until: null,
      read_at: null,
      is_bookmarked: false,
      bookmark_id: null,
      feed_title: 'Hacker News',
      feed_icon_url: null,
    },
  ],
  'feed-3': [
    {
      id: 'entry-4',
      feed_id: 'feed-3',
      guid: 'entry-4',
      url: 'https://smashingmagazine.com/2026/design-systems',
      title: 'Design systems that stay useful after launch',
      author: 'Smashing Magazine',
      content: null,
      summary: 'Practical advice for keeping a design system alive in product teams.',
      published_at: iso(-260),
      created_at: iso(-260),
      is_read: true,
      read_later: false,
      read_later_until: null,
      read_at: iso(-120),
      is_bookmarked: false,
      bookmark_id: null,
      feed_title: 'Smashing Magazine',
      feed_icon_url: null,
    },
  ],
  'feed-4': [
    {
      id: 'entry-5',
      feed_id: 'feed-4',
      guid: 'entry-5',
      url: 'https://example.com/notes/ui',
      title: '如何让设置页更像工作台而不是表单',
      author: 'Demo Author',
      content: null,
      summary: '从信息架构、留白和批量操作三个角度整理设置页设计。',
      published_at: iso(-320),
      created_at: iso(-320),
      is_read: false,
      read_later: false,
      read_later_until: null,
      read_at: null,
      is_bookmarked: false,
      bookmark_id: null,
      feed_title: 'Indie Notes',
      feed_icon_url: null,
    },
  ],
}

function allEntries() {
  return Object.values(entriesByFeedId).flat()
}

function entriesForFolder(folderId) {
  const feedIds = state.subscriptions
    .filter((sub) => sub.folder_id === folderId)
    .map((sub) => sub.feed_id)
  return feedIds.flatMap((id) => entriesByFeedId[id] || [])
}

function findEntry(entryId) {
  for (const entries of Object.values(entriesByFeedId)) {
    const entry = entries.find((item) => item.id === entryId)
    if (entry) return entry
  }
  return null
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}

function sendText(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  })
  res.end(payload)
}

function notFound(res) {
  sendJson(res, 404, { detail: 'Not found' })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) return notFound(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    })
    res.end()
    return
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const { pathname, searchParams } = url

  try {
    if (pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', mode: 'local-mock' })
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      return sendJson(res, 200, {
        user: state.user,
        tokens: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
        },
      })
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      return sendJson(res, 200, {
        user: state.user,
        tokens: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
        },
      })
    }

    if (pathname === '/api/auth/refresh' && req.method === 'POST') {
      return sendJson(res, 200, {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
      })
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      return sendJson(res, 200, { message: 'ok' })
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      return sendJson(res, 200, state.user)
    }

    if (pathname === '/api/auth/me' && req.method === 'PATCH') {
      const body = await readBody(req)
      state.user = {
        ...state.user,
        ...body,
        settings: {
          ...(state.user.settings || {}),
          ...(body.settings || {}),
        },
      }
      return sendJson(res, 200, state.user)
    }

    if (pathname === '/api/folders' && req.method === 'GET') {
      const type = searchParams.get('type') || 'feed'
      return sendJson(res, 200, { folders: state.folders[type] || [] })
    }

    if (pathname === '/api/feeds/sync/all' && req.method === 'GET') {
      return sendJson(
        res,
        200,
        {
          items: state.subscriptions,
          etag: 'mock-etag-v1',
        },
        { ETag: '"mock-etag-v1"' }
      )
    }

    if (pathname === '/api/feeds/refresh-all' && req.method === 'POST') {
      return sendJson(res, 200, {
        status: 'queued',
        queued_count: state.subscriptions.length,
        jobs: state.subscriptions.map((sub) => ({
          subscription_id: sub.id,
          feed_id: sub.feed_id,
          job_id: `job-${sub.feed_id}`,
          feed_title: sub.feed.title,
        })),
      })
    }

    if (pathname === '/api/feeds/refresh-status' && req.method === 'POST') {
      const body = await readBody(req)
      return sendJson(res, 200, {
        items: (body.items || []).map((item) => ({
          feed_id: item.feed_id,
          job_id: item.job_id,
          status: 'complete',
          result_status: 'success',
          new_entries: 2,
          total_entries: 12,
          message: 'Mock refresh completed.',
          last_fetch_attempt_at: iso(-1),
          last_fetch_success_at: iso(-1),
          last_fetched_at: iso(-1),
          error_count: 0,
          fetch_error_message: null,
        })),
      })
    }

    if (pathname.startsWith('/api/feeds/') && pathname.endsWith('/refresh') && req.method === 'POST') {
      const id = pathname.split('/')[3]
      const sub = state.subscriptions.find((item) => item.id === id)
      return sendJson(res, 200, {
        status: 'queued',
        job_id: `job-${sub?.feed_id || id}`,
        feed_id: sub?.feed_id || id,
        feed_title: sub?.feed.title || 'Mock Feed',
      })
    }

    if (pathname.startsWith('/api/feeds/') && req.method === 'DELETE') {
      const id = pathname.split('/')[3]
      state.subscriptions = state.subscriptions.filter((item) => item.id !== id)
      return sendJson(res, 200, { ok: true })
    }

    if (pathname === '/api/feeds/batch-delete' && req.method === 'POST') {
      const body = await readBody(req)
      const ids = new Set(body.subscription_ids || [])
      const before = state.subscriptions.length
      state.subscriptions = state.subscriptions.filter((item) => !ids.has(item.id))
      return sendJson(res, 200, {
        deleted_count: before - state.subscriptions.length,
        failed_count: 0,
      })
    }

    if (/^\/api\/feeds\/[^/]+$/.test(pathname) && req.method === 'PATCH') {
      const id = pathname.split('/')[3]
      const body = await readBody(req)
      const index = state.subscriptions.findIndex((item) => item.id === id)
      if (index === -1) return notFound(res)
      state.subscriptions[index] = {
        ...state.subscriptions[index],
        ...body,
      }
      return sendJson(res, 200, state.subscriptions[index])
    }

    if (pathname === '/api/feeds/import' && req.method === 'POST') {
      return sendJson(res, 200, {
        success: 4,
        failed: 0,
        total: 4,
        folders_created: 0,
      })
    }

    if (pathname === '/api/feeds/export' && req.method === 'GET') {
      return sendText(res, 200, '<opml version="2.0"><body /></opml>', {
        'Content-Type': 'text/xml; charset=utf-8',
      })
    }

    if (pathname === '/api/entries/today' && req.method === 'GET') {
      const feedId = searchParams.get('feed_id')
      const folderId = searchParams.get('folder_id')
      const limit = Number(searchParams.get('limit') || 500)
      let items = []

      if (feedId) {
        items = entriesByFeedId[feedId] || []
      } else if (folderId) {
        items = entriesForFolder(folderId)
      } else {
        items = allEntries()
      }

      items = items
        .slice()
        .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at))
        .slice(0, limit)

      return sendJson(res, 200, {
        items,
        total: items.length,
        page: 1,
        per_page: limit,
        total_pages: 1,
      })
    }

    if (pathname === '/api/entries' && req.method === 'GET') {
      const feedId = searchParams.get('feed_id')
      const folderId = searchParams.get('folder_id')
      let items = []

      if (feedId) {
        items = entriesByFeedId[feedId] || []
      } else if (folderId) {
        items = entriesForFolder(folderId)
      } else {
        items = allEntries()
      }

      return sendJson(res, 200, {
        items,
        total: items.length,
        page: 1,
        per_page: Number(searchParams.get('per_page') || items.length || 10),
        total_pages: 1,
      })
    }

    if (/^\/api\/entries\/[^/]+$/.test(pathname) && req.method === 'GET') {
      const entryId = pathname.split('/')[3]
      const entry = findEntry(entryId)
      if (!entry) return notFound(res)
      return sendJson(res, 200, entry)
    }

    if (/^\/api\/entries\/[^/]+$/.test(pathname) && req.method === 'PATCH') {
      const entryId = pathname.split('/')[3]
      const entry = findEntry(entryId)
      if (!entry) return notFound(res)
      const body = await readBody(req)
      Object.assign(entry, body)
      if (body.is_read === true) {
        entry.read_at = iso()
      }
      return sendJson(res, 200, entry)
    }

    if (pathname === '/api/entries/translate-texts' && req.method === 'POST') {
      const body = await readBody(req)
      const target = body.target_language || 'zh-CN'
      return sendJson(res, 200, {
        translations: (body.texts || []).map((text) =>
          target === 'zh-CN' ? `[中] ${text}` : `[EN] ${text}`
        ),
      })
    }

    if (pathname === '/api/entries/mark-all-read' && req.method === 'POST') {
      return sendJson(res, 200, { message: 'Marked all as read' })
    }

    if (pathname === '/api/tokens' && req.method === 'GET') {
      return sendJson(res, 200, { tokens: state.tokens })
    }

    if (pathname === '/api/tokens' && req.method === 'POST') {
      const body = await readBody(req)
      const token = {
        id: `token-${Date.now()}`,
        name: body.name || 'New Token',
        token_prefix: 'gl_mock',
        last_used_at: null,
        expires_at: body.expires_in_days ? iso(body.expires_in_days * 24 * 60) : null,
        created_at: iso(),
      }
      state.tokens.unshift(token)
      return sendJson(res, 200, { token: 'gl_mock_demo_token_value', api_token: token })
    }

    if (/^\/api\/tokens\/[^/]+$/.test(pathname) && req.method === 'DELETE') {
      const id = pathname.split('/')[3]
      state.tokens = state.tokens.filter((item) => item.id !== id)
      return sendJson(res, 200, { ok: true })
    }

    return notFound(res)
  } catch (error) {
    console.error('[local-mock-server]', error)
    return sendJson(res, 500, { detail: error instanceof Error ? error.message : 'Mock error' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[local-mock-server] listening on http://127.0.0.1:${PORT}`)
})
