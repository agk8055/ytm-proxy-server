// package.json deps: fastify, ytdl-core, undici
// npm i fastify ytdl-core undici

import Fastify from 'fastify';
import ytdl from '@distube/ytdl-core';
import { request } from 'undici';

const app = Fastify({ logger: true });

// Root endpoint
app.get('/', async (req, reply) => {
  return reply.send({
    message: 'YouTube Music Proxy Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      streams: '/api/streams/:id'
    }
  });
});

// Health endpoint
app.get('/api/health', async (req, reply) => {
  return reply.send({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Helper: pick the best audio-only format with a direct URL
function pickAudioFormat(info: ytdl.videoInfo) {
  const formats = info.formats
    .filter(f => f.hasAudio && !f.hasVideo && f.url)
    .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
  return formats[0] || null;
}

app.get('/api/streams/:id', async (req, reply) => {
  const { id } = req.params as { id: string };

  try {
    // 1) Resolve formats/URL
    const info = await ytdl.getInfo(id);
    const fmt = pickAudioFormat(info);

    // 2) If a direct, public URL exists, 302 redirect to it (fast path)
    if (fmt?.url) {
      // Optional: verify it’s reachable with a HEAD (fast) before redirecting
      try {
        const head = await request(fmt.url, { method: 'HEAD' });
        if (head.statusCode >= 200 && head.statusCode < 400) {
          return reply
            .header('Access-Control-Allow-Origin', '*')
            .redirect(fmt.url, 302);
        }
      } catch {
        // Fall back to proxy if HEAD fails
      }
    }

    // 3) Proxy stream (fallback). Honor Range for seeking
    const rangeHeader = (req.headers.range as string | undefined) ?? undefined;

    // ytdl can accept a range option to start at an offset; for simplicity
    // we’ll let ytdl stream and forward Range as-is to upstream via requestOptions.
    // For robust Range semantics, parse the header and set content-range/content-length.
    const ytdlStream = ytdl(id, {
      filter: 'audioonly',
      quality: 'highestaudio',
      requestOptions: { headers: rangeHeader ? { Range: rangeHeader } : {} }
    });

    // Probe basic metadata to set content-type if available
    reply
      .header('Accept-Ranges', 'bytes')
      .header('Access-Control-Allow-Origin', '*')
      .type('audio/webm'); // or derive based on format/container if you prefer

    // If you want perfect Range responses (206 + Content-Range/Length),
    // you’d parse `rangeHeader` and the upstream content length, then set headers accordingly.
    // For many clients, pass-through streaming without strict 206 still works.

    return reply.send(ytdlStream);
  } catch (err) {
    req.log.error({ err }, 'stream error');
    return reply.code(404).send({ error: 'Stream not found' });
  }
});

app.listen({ port: 8080, host: '0.0.0.0' }).then(addr => {
  app.log.info(`listening on ${addr}`);
});