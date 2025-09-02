# YouTube Music Proxy Server

A production-ready YouTube Music proxy server optimized for Vercel deployment. This server provides audio streaming capabilities with proper CORS support, range request handling, and error management.

## Features

- 🎵 Audio streaming from YouTube Music
- 🌐 CORS-enabled for web applications
- ⚡ Optimized for Vercel serverless functions
- 🔄 Range request support for seeking
- 🛡️ Production-ready error handling
- 📊 Health check endpoint
- 🚀 Fast redirects for direct URLs

## API Endpoints

### Health Check
```
GET /health
```
Returns server health status and uptime information.

### Stream Audio
```
GET /v1/streams/:id
```
Streams audio from a YouTube video ID.

**Parameters:**
- `id` (string): YouTube video ID

**Headers:**
- `Range` (optional): For seeking support (e.g., `bytes=0-1023`)

**Response:**
- `302 Redirect`: Direct URL if available
- `200 Stream`: Proxied audio stream
- `404`: Video not found
- `500`: Server error

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

4. **Start production server:**
   ```bash
   npm start
   ```

## Vercel Deployment

### Prerequisites
- Vercel account
- Node.js 18+ (specified in package.json)

### Deployment Steps

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy to Vercel:**
   ```bash
   vercel
   ```

3. **Follow the prompts:**
   - Link to existing project or create new
   - Confirm build settings
   - Deploy

### Environment Variables

Set these in your Vercel dashboard under Project Settings > Environment Variables:

- `NODE_ENV`: Set to `production`

### Custom Domain (Optional)

1. Go to your Vercel project dashboard
2. Navigate to Settings > Domains
3. Add your custom domain
4. Configure DNS as instructed

## Configuration

The server is configured via `vercel.json`:

- **Function timeout**: 30 seconds (maximum for Vercel)
- **Routes**: Automatic routing to API functions
- **CORS**: Enabled for all origins

## Usage Examples

### Basic Stream Request
```javascript
const response = await fetch('https://your-domain.vercel.app/v1/streams/dQw4w9WgXcQ');
const audioBlob = await response.blob();
```

### With Range Request (Seeking)
```javascript
const response = await fetch('https://your-domain.vercel.app/v1/streams/dQw4w9WgXcQ', {
  headers: {
    'Range': 'bytes=0-1023'
  }
});
```

### Health Check
```javascript
const health = await fetch('https://your-domain.vercel.app/health');
const status = await health.json();
console.log(status); // { status: 'healthy', timestamp: '...', uptime: 123.45 }
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │───▶│  Vercel Function │───▶│  YouTube Music  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Audio Stream    │
                       │  (Direct/Proxy)  │
                       └──────────────────┘
```

## Performance Optimizations

1. **Direct URL Redirects**: When possible, redirects to direct YouTube URLs
2. **Range Request Support**: Enables seeking without full download
3. **Serverless Scaling**: Automatic scaling with Vercel
4. **Caching**: Vercel's edge caching for improved performance

## Error Handling

- **404**: Video not found or invalid ID
- **405**: Method not allowed (only GET supported)
- **500**: Server or stream errors
- **CORS**: Proper CORS headers for all responses

## Security

- CORS enabled for web applications
- Input validation for video IDs
- Error messages don't expose internal details
- Rate limiting handled by Vercel

## Monitoring

Monitor your deployment through:
- Vercel dashboard analytics
- Function logs in Vercel dashboard
- Health check endpoint for uptime monitoring

## Troubleshooting

### Common Issues

1. **Function timeout**: Increase timeout in `vercel.json` (max 30s)
2. **CORS errors**: Ensure proper headers are set
3. **Stream errors**: Check YouTube video availability
4. **Build failures**: Verify Node.js version compatibility

### Debug Mode

For local debugging, use:
```bash
NODE_ENV=development npm run dev
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section
- Review Vercel documentation
- Open an issue in the repository
