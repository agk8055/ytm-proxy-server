import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'YouTube Music Proxy Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      streams: '/api/streams/:id'
    }
  });
}
