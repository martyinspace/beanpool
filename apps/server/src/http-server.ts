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
        const publicDomain = process.env.CF_RECORD_NAME;
        if (publicDomain) {
            const pwaUrl = `https://${publicDomain}:8443`;

            // Fetch community info for dynamic content
            const config = await import('./local-config.js').then(m => m.getLocalConfig());
            const communityName = config.communityName || config.callsign || 'BeanPool Community';
            const contactEmail = config.contactEmail || '';
            const contactPhone = config.contactPhone || '';

            const contactSection = (contactEmail || contactPhone) ? `
            <div class="card">
              <h2>📬 Contact</h2>
              <p>Need help or want to learn more about our community?</p>
              ${contactEmail ? `<a href="mailto:${contactEmail}" class="contact-link">📧 ${contactEmail}</a>` : ''}
              ${contactPhone ? `<a href="tel:${contactPhone}" class="contact-link">📞 ${contactPhone}</a>` : ''}
            </div>` : '';

            ctx.type = 'html';
            ctx.body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${communityName} — BeanPool</title>
  <meta name="description" content="Join ${communityName} on BeanPool — a sovereign marketplace powered by mutual credit.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      line-height: 1.6;
    }
    .container { max-width: 480px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }

    /* Hero */
    .hero { text-align: center; margin-bottom: 2rem; }
    .hero .logo { font-size: 3rem; margin-bottom: 0.5rem; }
    .hero h1 { font-size: 1.6rem; font-weight: 700; color: #fff; margin-bottom: 0.25rem; }
    .hero .tagline { color: #888; font-size: 0.9rem; }

    /* Cards */
    .card {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid #1e3a5f;
      border-radius: 16px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .card h2 { font-size: 1.1rem; color: #fff; margin-bottom: 0.5rem; }
    .card p { font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.75rem; }
    .card-muted { background: #111827; border-color: #1f2937; }

    /* Inputs & Buttons */
    input[type="text"] {
      width: 100%; padding: 0.75rem 1rem; background: #0f172a; border: 1px solid #334155;
      border-radius: 10px; color: #fff; font-size: 1rem; letter-spacing: 1px;
      text-align: center; font-family: 'SF Mono', 'Fira Code', monospace;
    }
    input::placeholder { color: #475569; letter-spacing: 0; font-family: inherit; }
    .btn {
      display: block; width: 100%; padding: 0.75rem; border: none; border-radius: 10px;
      font-size: 0.95rem; font-weight: 600; cursor: pointer; text-align: center;
      text-decoration: none; margin-top: 0.75rem; transition: all 0.2s;
    }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; transform: scale(1.01); }
    .btn-secondary { background: #1e293b; color: #94a3b8; }
    .btn-secondary:hover { background: #334155; color: #fff; }
    .btn-inline {
      display: inline-block; width: auto; padding: 0.5rem 1rem; font-size: 0.85rem;
      border-radius: 8px; margin-top: 0.5rem;
    }

    /* Contact */
    .contact-link {
      display: block; color: #60a5fa; text-decoration: none; font-size: 0.9rem;
      padding: 0.4rem 0; transition: color 0.2s;
    }
    .contact-link:hover { color: #93bbfc; }

    /* FAQ */
    .faq-item { border-top: 1px solid #1f2937; padding: 0.75rem 0; }
    .faq-q {
      font-size: 0.9rem; font-weight: 600; color: #e2e8f0; cursor: pointer;
      display: flex; justify-content: space-between; align-items: center;
    }
    .faq-q:hover { color: #60a5fa; }
    .faq-a {
      font-size: 0.8rem; color: #94a3b8; padding-top: 0.5rem;
      display: none; line-height: 1.5;
    }
    .faq-item.open .faq-a { display: block; }
    .faq-arrow { transition: transform 0.2s; font-size: 0.8rem; }
    .faq-item.open .faq-arrow { transform: rotate(90deg); }

    /* Recovery */
    .recovery-options { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    .recovery-opt {
      flex: 1; background: #0f172a; border: 1px solid #334155; border-radius: 10px;
      padding: 0.75rem; text-align: center; cursor: pointer; transition: all 0.2s;
      text-decoration: none; color: #e2e8f0; font-size: 0.8rem;
    }
    .recovery-opt:hover { border-color: #2563eb; background: #1a1a2e; }
    .recovery-opt .icon { font-size: 1.5rem; display: block; margin-bottom: 0.25rem; }

    /* Divider */
    .divider { border: none; border-top: 1px solid #1f2937; margin: 1.5rem 0; }

    .footer { text-align: center; font-size: 0.7rem; color: #333; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <div class="logo">🫘</div>
      <h1>${communityName}</h1>
      <p class="tagline">Sovereign marketplace. Your identity is yours.</p>
    </div>

    <!-- 1. New Member -->
    <div class="card">
      <h2>🎟️ I'm New Here</h2>
      <p>Got an invite code from someone in the community? Welcome aboard.</p>
      <input type="text" id="invite-input" placeholder="BP-XXXXXX" maxlength="20" />
      <button class="btn btn-primary" onclick="joinWithCode()">Join Community →</button>
    </div>

    <!-- 2. Add Another Device -->
    <div class="card">
      <h2>📱 Set Up Another Device</h2>
      <p>Already a member and want BeanPool on this device too? Open your existing app, go to <strong>Settings → Export Identity</strong>, then paste the link here.</p>
      <a href="${pwaUrl}?import=true" class="btn btn-secondary">I have my transfer link →</a>
    </div>

    <!-- 3. Lost Device Recovery -->
    <div class="card" style="border-color: #92400e;">
      <h2>💛 Lost Your Device?</h2>
      <p>It's okay — we've got you. Your identity lives on your device, but there are ways to get it back.</p>
      <div class="recovery-options">
        <a href="${pwaUrl}" class="recovery-opt" style="text-decoration: none; color: inherit; cursor: pointer;">
          <span class="icon">🔑</span>
          12-Word Phrase
          <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; line-height: 1.4;">
            If you wrote down your recovery phrase when you first joined, you can use it to restore your identity.<br/><br/>
            <span style="color: #22c55e; font-weight: 600;">✅ Available now — tap to recover →</span>
          </div>
        </a>
        <div class="recovery-opt" onclick="this.querySelector('.detail').style.display = this.querySelector('.detail').style.display === 'block' ? 'none' : 'block'">
          <span class="icon">👥</span>
          Ask 3 Friends
          <div class="detail" style="display:none; font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; line-height: 1.4;">
            If you set up guardians, 3 of your 5 trusted friends can help reconstruct your identity — even if everything else is lost.<br/><br/>
            <em style="color: #f59e0b;">Coming soon — this feature is being built.</em>
          </div>
        </div>
      </div>
      <p style="font-size: 0.75rem; color: #64748b; margin-top: 0.75rem; line-height: 1.4;">
        If you can't recover your identity, contact your community admin below. They may be able to help you rejoin with a new invite.
      </p>
    </div>

    <hr class="divider" />

    <!-- FAQ -->
    <div class="card card-muted" style="border: none; background: none; padding: 0;">
      <h2 style="margin-bottom: 0.75rem; padding: 0 0.25rem;">❓ Frequently Asked Questions</h2>

      <div class="faq-item" onclick="this.classList.toggle('open')">
        <div class="faq-q">What is BeanPool?<span class="faq-arrow">▶</span></div>
        <div class="faq-a">BeanPool is a mutual credit marketplace for local communities. Members can post offers and needs, trade using community credits, and build local economic resilience — all without banks or corporations.</div>
      </div>

      <div class="faq-item" onclick="this.classList.toggle('open')">
        <div class="faq-q">How do I get an invite?<span class="faq-arrow">▶</span></div>
        <div class="faq-a">Ask an existing community member to generate an invite code for you. They can share it as a link, QR code, or text. Each invite code works once.</div>
      </div>

      <div class="faq-item" onclick="this.classList.toggle('open')">
        <div class="faq-q">Is my data private?<span class="faq-arrow">▶</span></div>
        <div class="faq-a">Your identity is an Ed25519 keypair stored only on your device — never on a server. Your posts and transactions are shared within your community, but your private key never leaves your device.</div>
      </div>

      <div class="faq-item" onclick="this.classList.toggle('open')">
        <div class="faq-q">What are community credits?<span class="faq-arrow">▶</span></div>
        <div class="faq-a">Credits are a mutual credit currency. When you trade, credits transfer between members. Every member starts at zero. The system is designed to encourage reciprocity and keep value circulating locally.</div>
      </div>

      <div class="faq-item" onclick="this.classList.toggle('open')">
        <div class="faq-q">Can I use this on my phone?<span class="faq-arrow">▶</span></div>
        <div class="faq-a">Yes! BeanPool is a Progressive Web App. Open the app link in your browser, then "Add to Home Screen" for the full native-like experience — works on Android, iOS, and desktop.</div>
      </div>
    </div>

    ${contactSection}

    <p class="footer">Powered by BeanPool · Sovereign infrastructure for sovereign communities</p>
  </div>

  <script>
    function joinWithCode() {
      const code = document.getElementById('invite-input').value.trim();
      if (code) {
        window.location.href = '${pwaUrl}?invite=' + encodeURIComponent(code);
      }
    }
    document.getElementById('invite-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinWithCode();
    });
  </script>
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
