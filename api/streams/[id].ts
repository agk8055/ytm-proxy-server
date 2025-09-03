import { VercelRequest, VercelResponse } from '@vercel/node';
import { request } from 'undici';

// Set environment variables before importing ytdl-core
process.env.YTDL_NO_UPDATE = 'true';
process.env.TMPDIR = '/tmp';

// Import ytdl-core after setting environment variables
import ytdl from '@distube/ytdl-core';

// Array of realistic user agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  // Android user agents that might work better
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
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
    
    let info;
    // Try multiple approaches in sequence
    const approaches = [
      // Approach 1: Full headers
      () => ytdl.getInfo(id, {
        requestOptions: {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
          }
        }
      }),
      // Approach 2: Minimal headers
      () => ytdl.getInfo(id, {
        requestOptions: {
          headers: {
            'User-Agent': userAgent,
          }
        }
      }),
      // Approach 3: No options at all
      () => ytdl.getInfo(id)
    ];

    for (let i = 0; i < approaches.length; i++) {
      try {
        console.log(`Trying approach ${i + 1}...`);
        info = await approaches[i]();
        console.log(`Approach ${i + 1} succeeded!`);
        break;
      } catch (error: any) {
        console.log(`Approach ${i + 1} failed:`, error.message);
        if (i === approaches.length - 1) {
          // If all approaches fail, throw the last error
          throw error;
        }
      }
    }
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

    // Create ytdl stream with multiple fallback approaches
    let ytdlStream;
    const streamApproaches = [
      // Approach 1: Full headers
      () => ytdl(id, {
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
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
            ...(rangeHeader ? { Range: rangeHeader } : {})
          }
        }
      }),
      // Approach 2: Minimal headers
      () => ytdl(id, {
        filter: 'audioonly',
        quality: 'highestaudio',
        requestOptions: { 
          headers: {
            'User-Agent': userAgent,
            ...(rangeHeader ? { Range: rangeHeader } : {})
          }
        }
      }),
      // Approach 3: No options at all
      () => ytdl(id, {
        filter: 'audioonly',
        quality: 'highestaudio'
      })
    ];

    for (let i = 0; i < streamApproaches.length; i++) {
      try {
        console.log(`Trying stream approach ${i + 1}...`);
        ytdlStream = streamApproaches[i]();
        console.log(`Stream approach ${i + 1} succeeded!`);
        break;
      } catch (error: any) {
        console.log(`Stream approach ${i + 1} failed:`, error.message);
        if (i === streamApproaches.length - 1) {
          // If all approaches fail, throw the last error
          throw error;
        }
      }
    }

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
