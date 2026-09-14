/* ============================================================
   BORO 🐰 — Frontend Interactions (Dark Neon Theme)
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Elements ---------- */
  const buyBtn  = document.getElementById('buyBtn');
  const copyBtn = document.getElementById('copyBtn');
  const wallet  = document.getElementById('walletAddress');
  const toast   = document.getElementById('toast');
  const ham     = document.getElementById('hamburger');
  const links   = document.getElementById('navLinks');
  const progressFill = document.getElementById('progressFill');
  const progressPct  = document.getElementById('progressPct');
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  /* ---------- Toast helper ---------- */
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg || '✅ Copied!';
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  /* ---------- Wallet copy ---------- */
  if (copyBtn && wallet) {
    copyBtn.addEventListener('click', async () => {
      const text = wallet.textContent.trim();
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showToast('✅ Wallet address copied!');
        copyBtn.textContent = '✅';
        setTimeout(() => (copyBtn.textContent = '📋'), 1500);
      } catch (e) {
        showToast('❌ Copy failed — please copy manually');
      }
    });
  }

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  revealEls.forEach((el) => io.observe(el));

  /* ---------- Stat counters ---------- */
  const counters = document.querySelectorAll('.stat-num');
  const counterIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count || '0', 10);
      const duration = 1600;
      const start = performance.now();
      function step(now) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = Math.floor(eased * target);
        el.textContent = val >= 1000000
          ? (val / 1000000).toFixed(1) + 'M'
          : val.toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      counterIO.unobserve(el);
    });
  }, { threshold: 0.4 });
  counters.forEach((c) => counterIO.observe(c));

  /* ---------- Hero coin tilt ---------- */
  const coin = document.getElementById('heroCoin');
  const orbit = coin ? coin.closest('.coin-orbit') : null;
  if (coin && orbit) {
    orbit.addEventListener('mousemove', (e) => {
      const rect = orbit.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      coin.style.transform = `rotateY(${x * 25}deg) rotateX(${-y * 25}deg)`;
    });
    orbit.addEventListener('mouseleave', () => {
      coin.style.transform = '';
    });
  }

  /* ---------- Progress bar animation ---------- */
  if (progressFill && progressPct) {
    const targetPct = parseInt(progressPct.textContent) || 74;
    const progressIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        setTimeout(() => {
          progressFill.style.width = targetPct + '%';
        }, 300);
        progressIO.unobserve(entry.target);
      });
    }, { threshold: 0.3 });
    progressIO.observe(progressFill.parentElement);
  }

  /* ---------- Mobile hamburger ---------- */
  if (ham && links) {
    ham.addEventListener('click', () => {
      ham.classList.toggle('open');
      links.classList.toggle('open');
      ham.setAttribute('aria-expanded', links.classList.contains('open'));
    });
    // Close menu when a link is clicked
    links.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        ham.classList.remove('open');
        links.classList.remove('open');
        ham.setAttribute('aria-expanded', 'false');
      });
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!ham.contains(e.target) && !links.contains(e.target)) {
        ham.classList.remove('open');
        links.classList.remove('open');
        ham.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Smooth scroll for anchor links ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

})();

/* ---------- Verified Solana presale ---------- */
(function () {
  'use strict';
  const amountInput = document.getElementById('presaleAmount');
  const quote = document.getElementById('presaleQuote');
  const buy = document.getElementById('buyBtn');
  const status = document.getElementById('presaleStatus');
  const activity = document.getElementById('presaleActivity');
  const refresh = document.getElementById('activityRefresh');
  if (!amountInput || !quote || !buy || !status || !activity) return;

  let config;
  let connectedWallet = null;
  const pendingKey = 'boroPresalePendingPayment';
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const say = (message, isError) => { status.textContent = message; status.classList.toggle('is-error', Boolean(isError)); };
  const updateQuote = () => {
    const sol = Number(amountInput.value);
    quote.textContent = Number.isFinite(sol) ? `You will receive ${(sol * Number(config.boroPerSol)).toLocaleString()} $BORO` : 'Enter a valid SOL amount';
  };

  /* ---------- Mobile Phantom deep-link ---------- */
/* ---------- Phantom wallet detection + mobile support ---------- */
function phantomDeepLink() {
  const currentUrl = window.location.href;
  const ref = window.location.origin;

  window.location.href =
    `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(ref)}`;
}

function getProvider() {
  // Phantom browser / extension
  if (window.phantom?.solana?.isPhantom) {
    return window.phantom.solana;
  }

  // Older Phantom injection
  if (window.solana?.isPhantom) {
    return window.solana;
  }

  return null;
}

  function getProvider() {
    // Phantom injects window.solana on both desktop extension and mobile in-app browser
    if (window.solana?.isPhantom) return window.solana;
    // Some mobile wallets inject window.phantom.solana instead
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    return null;
  }

  /* ---------- Connection helpers ---------- */
  async function connectWallet(provider) {
    const wallet = await provider.connect({ onlyIfTrusted: false });
    return wallet.publicKey;
  }

  async function signAndSend(provider, transaction) {
    // Mobile Phantom works better with signTransaction + sendRawTransaction
    // Desktop Phantom supports both; we use signTransaction universally for consistency
    if (isMobile || !provider.signAndSendTransaction) {
      const { blockhash } = await fetch('/api/presale/blockhash').then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not prepare the Solana payment.');
        return body;
      });
      transaction.recentBlockhash = blockhash;
      const signed = await provider.signTransaction(transaction);
      const rawTx = signed.serialize();
      const response = await fetch('/api/presale/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawTransaction: Array.from(rawTx) })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Transaction submission failed.');
      return { signature: body.signature };
    }
    // Desktop: use signAndSendTransaction
    const blockhash = await fetch('/api/presale/blockhash').then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not prepare the Solana payment.');
      return body;
    });
    transaction.recentBlockhash = blockhash.blockhash;
    return provider.signAndSendTransaction(transaction);
  }
  async function loadActivity() {
    try {
      const response = await fetch('/api/presale/activity');
      const { payments } = await response.json();
      activity.innerHTML = payments.length ? payments.map((payment) => `<div class="presale-activity-row"><span><b>${payment.buyer}</b><small>${payment.sol} SOL → ${payment.boro} BORO</small></span><a href="https://solscan.io/tx/${payment.deliverySignature}" target="_blank" rel="noreferrer">View ↗</a></div>`).join('') : '<p>No confirmed deliveries yet.</p>';
    } catch { activity.innerHTML = '<p>Activity is temporarily unavailable.</p>'; }
  }
  async function requestDelivery(payment) {
    const response = await fetch('/api/presale/deliver', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payment) });
    const body = await response.json();
    if (response.status === 202) return null;
    if (!response.ok) throw new Error(body.error || 'Delivery verification failed.');
    return body;
  }
  async function waitForDelivery(payment) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await requestDelivery(payment);
      if (result) return result;
      say(`Payment received. Waiting for confirmation (${attempt + 1}/30)…`);
      await wait(2000);
    }
    throw new Error(`Your payment is still confirming. Do not pay again. Save this signature: ${payment.signature}`);
  }
  async function startPurchase() {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
      buy.disabled = true;
      if (pending) {
        say('Checking your existing payment. Do not pay again.');
        const delivered = await waitForDelivery(pending);
        sessionStorage.removeItem(pendingKey);
        say(`$BORO delivered: ${delivered.deliverySignature}`);
        loadActivity();
        return;
      }
      const sol = Number(amountInput.value);
      if (!Number.isFinite(sol) || sol < config.minSol || sol > config.maxSol) throw new Error(`Enter an amount from ${config.minSol} to ${config.maxSol} SOL.`);

      const provider = getProvider();
      if (!provider) {
        if (isMobile) {
          say('Opening Phantom wallet…');
          phantomDeepLink();
          return;
        }
        throw new Error('Phantom Wallet is required. Install Phantom, then try again.');
      }

      if (!connectedWallet) {
        say('Connecting to Phantom…');
        connectedWallet = await connectWallet(provider);
        buy.textContent = 'Buy $BORO with Phantom';
        say(`Connected: ${connectedWallet.toBase58().slice(0, 4)}…${connectedWallet.toBase58().slice(-4)}. Review your amount, then click Buy.`);
        return;
      }

      say('Preparing transaction…');
      const transaction = new solanaWeb3.Transaction().add(
        solanaWeb3.SystemProgram.transfer({
          fromPubkey: connectedWallet,
          toPubkey: new solanaWeb3.PublicKey(config.treasury),
          lamports: Math.round(sol * solanaWeb3.LAMPORTS_PER_SOL)
        })
      );
      transaction.feePayer = connectedWallet;

      say('Approve the exact amount in Phantom.');
      const signed = await signAndSend(provider, transaction);
      const payment = { signature: signed.signature, buyer: connectedWallet.toBase58() };
      sessionStorage.setItem(pendingKey, JSON.stringify(payment));
      say('Payment sent. Verifying and delivering $BORO…');
      const delivered = await waitForDelivery(payment);
      sessionStorage.removeItem(pendingKey);
      say(`$BORO delivered: ${delivered.deliverySignature}`);
      loadActivity();
    } catch (caught) { say(caught.message || 'Purchase could not be completed.', true); }
    finally { buy.disabled = false; }
  }
  (async () => {
    try {
      config = await fetch('/api/presale/config').then((response) => response.json());
      amountInput.addEventListener('input', updateQuote);
      document.querySelectorAll('[data-sol]').forEach((button) => button.addEventListener('click', () => { amountInput.value = button.dataset.sol; updateQuote(); }));
      buy.addEventListener('click', startPurchase);
      refresh?.addEventListener('click', loadActivity);
      updateQuote(); loadActivity();
    } catch {
      say(location.protocol === 'file:' ? 'Run npm start, then open http://localhost:3000 — payments cannot work from a file.' : 'Presale configuration is currently unavailable.', true);
      buy.disabled = true;
    }
  })();
})();
