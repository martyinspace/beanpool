/**
 * HTTP Server — Trust Bootstrap / PWA Redirect (Port 8080)
 *
 * Public nodes (Let's Encrypt): Redirects to the HTTPS PWA
 * LAN nodes (self-signed): Shows QR codes + CA cert download
 *
 * Endpoints:
 *   GET /         — Landing page (redirect or trust bootstrap)
 *   GET /trust    — Downloads the Root CA certificate (.pem)  [LAN only]
 */

import Koa from 'koa';
import Router from '@koa/router';
import { getCaCertPem, isUsingLetsEncrypt } from './tls.js';
import QRCode from 'qrcode';

// Standard ports (443/80) are mapped by Docker, so URLs omit port numbers

export async function startHttpServer(port: number): Promise<void> {
    const app = new Koa();
    const router = new Router();

    // Landing page — depends on TLS mode
    router.get('/', async (ctx) => {
        // Public nodes with a domain should always redirect HTTP → HTTPS
        // (isUsingLetsEncrypt() may still be false during initial ACME acquisition)
        const publicDomain = process.env.CF_RECORD_NAME;
        if (publicDomain) {
            const pwaUrl = `https://${publicDomain}`;
            // If request is from a browser, show a nice poster; otherwise just redirect
            const qrCode = await QRCode.toDataURL(pwaUrl, { width: 400, margin: 2 });
            const hostname = publicDomain;

            ctx.type = 'html';
            ctx.body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BeanPool — Join BeanPool</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .poster {
      max-width: 420px;
      text-align: center;
    }
    .logo { font-size: 3rem; margin-bottom: 0.5rem; }
    h1 {
      font-size: 1.8rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 0.5rem;
    }
    .tagline {
      color: #888;
      font-size: 0.95rem;
      margin-bottom: 2rem;
      line-height: 1.5;
    }
    .qr-card {
      background: #fff;
      border-radius: 20px;
      padding: 1.5rem;
      display: inline-block;
      margin-bottom: 1.5rem;
      box-shadow: 0 0 40px rgba(37, 99, 235, 0.15);
    }
    .qr-card img { display: block; }
    .scan-text {
      font-size: 0.9rem;
      color: #aaa;
      margin-bottom: 1.5rem;
    }
    a.btn {
      display: inline-block;
      background: #2563eb;
      color: white;
      text-decoration: none;
      padding: 0.85rem 2rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      transition: background 0.2s, transform 0.1s;
    }
    a.btn:hover { background: #1d4ed8; transform: scale(1.02); }
    .footer {
      margin-top: 2rem;
      font-size: 0.75rem;
      color: #444;
    }
    .domain {
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #2563eb;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="poster">
    <div class="logo">🫘</div>
    <h1>Join BeanPool</h1>
    <p class="tagline">Sovereign marketplace. No accounts, no passwords.<br/>Your identity is yours.</p>

    <div class="qr-card">
      <img src="${qrCode}" alt="Scan to join" width="280" height="280" />
    </div>

    <p class="scan-text">📱 Scan with your phone camera to join</p>

    <p class="domain">${hostname}</p>
    <a href="${pwaUrl}" class="btn">Open BeanPool →</a>

    <p class="footer">Sovereign infrastructure for sovereign communities.</p>
  </div>
</body>
</html>`;
        } else {
            // LAN node — full trust bootstrap flow
            const trustUrl = `http://${ctx.host}/trust`;
            const pwaUrl = `https://beanpool.local:8443`;

            const trustQr = await QRCode.toDataURL(trustUrl, { width: 256, margin: 1 });
            const pwaQr = await QRCode.toDataURL(pwaUrl, { width: 256, margin: 1 });

            ctx.type = 'html';
            ctx.body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BeanPool — Join BeanPool</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 480px; text-align: center; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #fff; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .step {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .step-number {
      display: inline-block;
      width: 28px; height: 28px;
      background: #2563eb;
      border-radius: 50%;
      line-height: 28px;
      font-weight: bold;
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }
    .step h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .step p { font-size: 0.9rem; color: #aaa; margin-bottom: 1rem; }
    .qr { border-radius: 8px; }
    a.btn {
      display: inline-block;
      background: #2563eb;
      color: white;
      text-decoration: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      margin-top: 0.5rem;
    }
    a.btn:hover { background: #1d4ed8; }
    .footer { margin-top: 2rem; font-size: 0.8rem; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🫘 BeanPool</h1>
    <p class="subtitle">Welcome to BeanPool. Two steps to join.</p>

    <div class="step">
      <div class="step-number">1</div>
      <h2>Trust the Network</h2>
      <p>Scan this QR code or tap below to install the community certificate.</p>
      <img src="${trustQr}" alt="Trust QR" class="qr" width="200" height="200" />
      <br/>
      <a href="/trust" class="btn">Download Certificate</a>
    </div>

    <div class="step">
      <div class="step-number">2</div>
      <h2>Open BeanPool</h2>
      <p>After trusting the certificate, scan this to open the PWA.</p>
      <img src="${pwaQr}" alt="PWA QR" class="qr" width="200" height="200" />
      <br/>
      <a href="${pwaUrl}" class="btn">Open BeanPool PWA</a>
    </div>

    <p class="footer">Sovereign infrastructure for sovereign communities.</p>
  </div>
</body>
</html>`;
        }
    });

    // Trust endpoint — CA cert download (only useful for LAN/self-signed mode)
    router.get('/trust', async (ctx) => {
        if (isUsingLetsEncrypt()) {
            // Public node — no CA cert to download, redirect to PWA
            const hostname = process.env.CF_RECORD_NAME ?? ctx.hostname;
            ctx.redirect(`https://${hostname}`);
            return;
        }
        ctx.type = 'application/x-pem-file';
        ctx.set('Content-Disposition', 'attachment; filename="beanpool-ca.pem"');
        ctx.body = getCaCertPem();
    });

    app.use(router.routes());
    app.use(router.allowedMethods());

    return new Promise((resolve) => {
        app.listen(port, () => {
            console.log(`🔓 Trust Bootstrap listening on http://0.0.0.0:${port}`);
            resolve();
        });
    });
}
