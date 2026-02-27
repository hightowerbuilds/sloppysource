const PORT = Number(process.env.PORT ?? 3001)

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const { pathname } = new URL(req.url)

    if (req.method === 'GET' && pathname === '/api/health') {
      return Response.json({ ok: true })
    }

    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    return new Response('Sloppy Source API is running.')
  },
})

console.log(`API listening on http://127.0.0.1:${server.port}`)
