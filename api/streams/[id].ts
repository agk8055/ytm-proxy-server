import { VercelRequest, VercelResponse } from '@vercel/node';
import ytdl from '@distube/ytdl-core';
import { request } from 'undici';

// Array of realistic user agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

// Get a random user agent
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Add a small random delay to avoid rate limiting
function randomDelay(): Promise<void> {
  const delay = Math.random() * 1000 + 500; // 500-1500ms
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Helper: pick the best audio-only format with a direct URL
function pickAudioFormat(info: ytdl.videoInfo) {
  const formats = info.formats
    .filter(f => f.hasAudio && !f.hasVideo && f.url)
    .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
  return formats[0] || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configure for read-only filesystem environment
  process.env.YTDL_NO_UPDATE = 'true';
  process.env.TMPDIR = '/tmp';
  
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
    // Add a small delay to avoid rate limiting
    await randomDelay();
    
    // 1) Resolve formats/URL with proper headers to avoid bot detection
    const userAgent = getRandomUserAgent();
    const info = await ytdl.getInfo(id, {
      requestOptions: {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      }
    });
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

    // Create ytdl stream with proper headers
    const ytdlStream = ytdl(id, {
      filter: 'audioonly',
      quality: 'highestaudio',
      requestOptions: { 
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          ...(rangeHeader ? { Range: rangeHeader } : {})
        }
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
    
    // Handle specific bot detection error
    if (err instanceof Error && err.message.includes('Sign in to confirm you\'re not a bot')) {
      return res.status(429).json({ 
        error: 'YouTube bot detection triggered. Please try again later.',
        code: 'BOT_DETECTED'
      });
    }
    
    // Handle other errors
    if (err instanceof Error && err.message.includes('Video unavailable')) {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }
    
    return res.status(500).json({ error: 'Internal server error' });
  }
}
