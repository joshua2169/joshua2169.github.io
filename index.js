import http from "http";
import express from "express";
import { createBareServer } from "@nebula-services/bare-server-node";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer();
const bareServer = createBareServer("/ca/");

const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve proxy interface
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "proxy.html"));
});

app.get("/proxy.html", (req, res) => {
  res.sendFile(path.join(__dirname, "proxy.html"));
});

const getRefererProxiedUrl = (req) => {
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    const refererUrl = new URL(referer, `http://${req.headers.host}`);
    const urlParam = refererUrl.searchParams.get('url');
    if (urlParam) return urlParam;

    // Fallback: if referer is from our proxy domain and contains /api/proxy, extract the url
    if (referer.includes('/api/proxy?url=')) {
      const proxyMatch = referer.match(/\/api\/proxy\?url=([^&]+)/);
      if (proxyMatch) {
        return decodeURIComponent(proxyMatch[1]);
      }
    }

    return null;
  } catch {
    return null;
  }
};

const proxyFetch = async (targetUrl, res) => {
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
    redirect: 'follow',
  });

  const contentType = response.headers.get('content-type') || '';
  const excludedHeaders = new Set([
    'content-encoding',
    'content-length',
    'transfer-encoding',
    'connection',
    'keep-alive',
    'x-frame-options',
    'frame-options',
    'content-security-policy',
    'strict-transport-security',
  ]);

  response.headers.forEach((value, key) => {
    if (!excludedHeaders.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  if (contentType.includes('text/html')) {
    let content = await response.text();
    const $ = cheerio.load(content, { decodeEntities: false });

    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('base').remove();

    const rewriteUrl = (originalUrl) => {
      if (!originalUrl) return originalUrl;
      const trimmed = originalUrl.trim();
      if (trimmed.startsWith('data:') || trimmed.startsWith('javascript:') || trimmed.startsWith('#') || trimmed.startsWith('mailto:')) {
        return originalUrl;
      }
      try {
        const absoluteUrl = new URL(trimmed, targetUrl).href;
        return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      } catch (e) {
        return originalUrl;
      }
    };

    ['src', 'href', 'action', 'formaction'].forEach((attr) => {
      $(`[${attr}]`).each((_, elem) => {
        const originalUrl = $(elem).attr(attr);
        if (originalUrl) {
          $(elem).attr(attr, rewriteUrl(originalUrl));
        }
      });
    });

    $('[srcset]').each((_, elem) => {
      const original = $(elem).attr('srcset');
      if (!original) return;
      const rewritten = original.split(',').map((item) => {
        const parts = item.trim().split(/\s+/);
        const urlPart = parts[0];
        const descriptor = parts.slice(1).join(' ');
        const rewrittenUrl = rewriteUrl(urlPart);
        return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
      }).join(', ');
      $(elem).attr('srcset', rewritten);
    });

    $('[style]').each((_, elem) => {
      const styleValue = $(elem).attr('style');
      if (!styleValue) return;
      $(elem).attr('style', styleValue.replace(/url\(([^)]+)\)/gi, (match, group) => {
        const cleaned = group.trim().replace(/^['\"]|['\"]$/g, '');
        return `url(${rewriteUrl(cleaned)})`;
      }));
    });

    $('style').each((_, elem) => {
      const styleText = $(elem).html();
      if (!styleText) return;
      $(elem).html(styleText.replace(/url\(([^)]+)\)/gi, (match, group) => {
        const cleaned = group.trim().replace(/^['\"]|['\"]$/g, '');
        return `url(${rewriteUrl(cleaned)})`;
      }));
    });

    content = $.html();
    res.type('html');
    res.send(content);
  } else {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    res.send(buffer);
  }
};

// Proxy endpoint
app.get('/api/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || '';
    const excludedHeaders = new Set([
      'content-encoding',
      'content-length',
      'transfer-encoding',
      'connection',
      'keep-alive',
      'x-frame-options',
      'frame-options',
      'content-security-policy',
      'strict-transport-security',
    ]);

    response.headers.forEach((value, key) => {
      if (!excludedHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    if (contentType.includes('text/html')) {
      let content = await response.text();
      const $ = cheerio.load(content, { decodeEntities: false });

      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('base').remove();

      const rewriteUrl = (originalUrl) => {
        if (!originalUrl) return originalUrl;
        const trimmed = originalUrl.trim();
        if (trimmed.startsWith('data:') || trimmed.startsWith('javascript:') || trimmed.startsWith('#') || trimmed.startsWith('mailto:')) {
          return originalUrl;
        }
        try {
          const absoluteUrl = new URL(trimmed, url).href;
          // Special handling for YouTube relative URLs
          if (url.includes('youtube.com') && trimmed.startsWith('/')) {
            return `/api/proxy?url=${encodeURIComponent('https://www.youtube.com' + trimmed)}`;
          }
          return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
          return originalUrl;
        }
      };

      ['src', 'href', 'action', 'formaction'].forEach((attr) => {
        $(`[${attr}]`).each((_, elem) => {
          const originalUrl = $(elem).attr(attr);
          if (originalUrl) {
            $(elem).attr(attr, rewriteUrl(originalUrl));
          }
        });
      });

      $('[srcset]').each((_, elem) => {
        const original = $(elem).attr('srcset');
        if (!original) return;
        const rewritten = original.split(',').map((item) => {
          const parts = item.trim().split(/\s+/);
          const urlPart = parts[0];
          const descriptor = parts.slice(1).join(' ');
          const rewrittenUrl = rewriteUrl(urlPart);
          return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
        }).join(', ');
        $(elem).attr('srcset', rewritten);
      });

      $('[style]').each((_, elem) => {
        const styleValue = $(elem).attr('style');
        if (!styleValue) return;
        $(elem).attr('style', styleValue.replace(/url\(([^)]+)\)/gi, (match, group) => {
          const cleaned = group.trim().replace(/^['"]|['"]$/g, '');
          return `url(${rewriteUrl(cleaned)})`;
        }));
      });

      $('style').each((_, elem) => {
        const styleText = $(elem).html();
        if (!styleText) return;
        $(elem).html(styleText.replace(/url\(([^)]+)\)/gi, (match, group) => {
          const cleaned = group.trim().replace(/^['"]|['"]$/g, '');
          return `url(${rewriteUrl(cleaned)})`;
        }));
      });

      content = $.html();
      res.type('html');
      res.send(content);
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      res.send(buffer);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Catch-all middleware for proxied requests
app.use(async (req, res, next) => {
  try {
    // Skip static files
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
      return next();
    }

    // Skip if it looks like a direct file request
    if (req.path === '/' || req.path === '/proxy.html') {
      return next();
    }

    const refererUrl = getRefererProxiedUrl(req);
    
    // If no referer, try to default to YouTube for common paths
    let targetUrl = null;
    if (!refererUrl) {
      // Check if it's a YouTube-like path
      if (req.path.includes('/results') || req.path.includes('/watch') || req.path.includes('/shorts') || req.path.includes('/channel') || req.path.includes('/user')) {
        targetUrl = new URL(req.originalUrl, 'https://www.youtube.com').href;
        console.log(`No referer, but detected YouTube path. Proxying to: ${targetUrl}`);
      } else {
        return next();
      }
    } else {
      const origin = new URL(refererUrl);
      targetUrl = new URL(req.originalUrl, origin).href;
    }

    if (!targetUrl) {
      return next();
    }

    console.log(`Proxying: ${req.method} ${req.originalUrl} -> ${targetUrl}`);
      
      // Handle different request methods
      if (req.method === 'GET' || req.method === 'HEAD') {
        const proxyRes = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Referer': refererUrl,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        
        const contentType = proxyRes.headers.get('content-type') || '';
        const excludedHeaders = new Set([
          'content-encoding',
          'transfer-encoding',
          'content-length',
          'x-frame-options',
          'content-security-policy',
        ]);

        proxyRes.headers.forEach((value, key) => {
          if (!excludedHeaders.has(key.toLowerCase())) {
            res.setHeader(key, value);
          }
        });

        if (req.method === 'GET') {
          let content = await proxyRes.arrayBuffer();
          
          // Rewrite HTML URLs
          if (contentType.includes('text/html')) {
            const text = Buffer.from(content).toString('utf-8');
            const $ = cheerio.load(text, { decodeEntities: false });

            $('meta[http-equiv="Content-Security-Policy"]').remove();
            $('base').remove();

            const rewriteUrl = (originalUrl) => {
              if (!originalUrl) return originalUrl;
              const trimmed = originalUrl.trim();
              if (trimmed.startsWith('data:') || trimmed.startsWith('javascript:') || trimmed.startsWith('#') || trimmed.startsWith('mailto:')) {
                return originalUrl;
              }
              try {
                const absoluteUrl = new URL(trimmed, targetUrl).href;
                return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
              } catch (e) {
                return originalUrl;
              }
            };

            ['src', 'href', 'action', 'formaction'].forEach((attr) => {
              $(`[${attr}]`).each((_, elem) => {
                const originalUrl = $(elem).attr(attr);
                if (originalUrl) {
                  $(elem).attr(attr, rewriteUrl(originalUrl));
                }
              });
            });

            $('[srcset]').each((_, elem) => {
              const original = $(elem).attr('srcset');
              if (!original) return;
              const rewritten = original.split(',').map((item) => {
                const parts = item.trim().split(/\s+/);
                const urlPart = parts[0];
                const descriptor = parts.slice(1).join(' ');
                const rewrittenUrl = rewriteUrl(urlPart);
                return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
              }).join(', ');
              $(elem).attr('srcset', rewritten);
            });

            $('[style]').each((_, elem) => {
              const styleValue = $(elem).attr('style');
              if (!styleValue) return;
              $(elem).attr('style', styleValue.replace(/url\(([^)]+)\)/gi, (match, group) => {
                const cleaned = group.trim().replace(/^['\"]|['\"]$/g, '');
                return `url(${rewriteUrl(cleaned)})`;
              }));
            });

            $('style').each((_, elem) => {
              const styleText = $(elem).html();
              if (!styleText) return;
              $(elem).html(styleText.replace(/url\(([^)]+)\)/gi, (match, group) => {
                const cleaned = group.trim().replace(/^['\"]|['\"]$/g, '');
                return `url(${rewriteUrl(cleaned)})`;
              }));
            });

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send($.html());
          } else {
            res.send(Buffer.from(content));
          }
        } else {
          res.end();
        }
      } else if (req.method === 'POST' || req.method === 'PUT') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          const proxyRes = await fetch(targetUrl, {
            method: req.method,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              'Referer': refererUrl,
              'Content-Type': req.get('content-type') || 'application/x-www-form-urlencoded',
            },
            body,
          });
          
          res.status(proxyRes.status);
          proxyRes.headers.forEach((value, key) => {
            if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
              res.setHeader(key, value);
            }
          });
          res.send(await proxyRes.text());
        });
      } else {
        next();
      }
    } catch (error) {
      console.error('Proxy error:', error.message);
      next();
    }
  } catch (error) {
    console.error('Middleware error:', error);
    next();
  }
});

app.use(express.static(path.join(__dirname)));

// Handle all other routes through BARE server
server.on("request", (req, res) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.end();
  }
});

server.on("listening", () => {
  console.log(`🌍 Proxy server running at http://localhost:${PORT}`);
  console.log(`📖 Open http://localhost:${PORT} in your browser`);
});

server.listen(PORT);
