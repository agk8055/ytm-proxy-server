import { VercelRequest, VercelResponse } from '@vercel/node';
import ytdl from '@distube/ytdl-core';
import { request } from 'undici';

// Helper: pick the best audio-only format with a direct URL
function pickAudioFormat(info: ytdl.videoInfo) {
  const formats = info.formats
    .filter(f => f.hasAudio && !f.hasVideo && f.url)
    .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
  return formats[0] || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query as { id: string };

  if (!id) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  try {
    // 1) Resolve formats/URL
    const info = await ytdl.getInfo(id);
    const fmt = pickAudioFormat(info);

    // 2) If a direct, public URL exists, 302 redirect to it (fast path)
    if (fmt?.url) {
      // Optional: verify it's reachable with a HEAD (fast) before redirecting
      try {
        const head = await request(fmt.url, { method: 'HEAD' });
        if (head.statusCode >= 200 && head.statusCode < 400) {
          return res.redirect(302, fmt.url);
        }
      } catch {
        // Fall back to proxy if HEAD fails
      }
    }

    // 3) Proxy stream (fallback). Honor Range for seeking
    const rangeHeader = req.headers.range as string | undefined;

    // Set appropriate headers
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/webm');
    
    // Handle range requests
    if (rangeHeader) {
      res.setHeader('Content-Range', rangeHeader);
    }

    // Create ytdl stream
    const ytdlStream = ytdl(id, {
      filter: 'audioonly',
      quality: 'highestaudio',
      requestOptions: { 
        headers: rangeHeader ? { Range: rangeHeader } : {} 
      }
    });

    // Handle stream errors
    ytdlStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error occurred' });
      }
    });

    // Pipe the stream to response
    ytdlStream.pipe(res);
    
    // Return undefined since we're streaming the response
    return;

  } catch (err) {
    console.error('Stream error:', err);
    return res.status(404).json({ error: 'Stream not found' });
  }
}
