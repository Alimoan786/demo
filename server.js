const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getMint, getOrCreateAssociatedTokenAccount, transferChecked } = require('@solana/spl-token');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets (css, js, images)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '16kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const sale = {
  treasury: process.env.TREASURY_WALLET || 'G4Ge4JaesjR5RcHdMatXCCXXYvB2DYLqBMG9w1CE27Fg',
  mint: process.env.BORO_MINT || 'wHwyKQMBy7gDNUrjqG1kbXNjemB3xz1cmUeEywTocrD',
  boroPerSol: BigInt(process.env.BORO_PER_SOL || '25000000'),
  minSol: Number(process.env.MIN_SOL || 0.2),
  maxSol: Number(process.env.MAX_SOL || 10)
};
const dataFile = path.join(__dirname, 'data', 'payments.json');
function readPayments() { try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return { payments: [] }; } }
function savePayments(data) { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); const temp = `${dataFile}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(temp, dataFile); }
function error(message, status = 400) { const result = new Error(message); result.status = status; return result; }
function connection() { return new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed'); }
function distributor() { if (!process.env.BORO_DISTRIBUTION_SECRET_KEY) throw error('Presale delivery is not configured yet.', 503); return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.BORO_DISTRIBUTION_SECRET_KEY))); }

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Health check (useful for hosting platforms)
app.get('/health', (req, res) => res.json({ status: 'ok', coin: 'MOONPAW' }));

app.get('/api/presale/config', (_req, res) => res.json({ network: 'mainnet-beta', treasury: sale.treasury, mint: sale.mint, boroPerSol: sale.boroPerSol.toString(), minSol: sale.minSol, maxSol: sale.maxSol }));

app.get('/api/presale/blockhash', async (_req, res, next) => {
  try { res.json(await connection().getLatestBlockhash('confirmed')); }
  catch (caught) { next(caught); }
});

app.get('/api/presale/activity', (_req, res) => {
  const payments = readPayments().payments.filter((p) => p.status === 'delivered').slice(-20).reverse().map((p) => ({
    buyer: `${p.buyer.slice(0, 4)}…${p.buyer.slice(-4)}`, sol: p.sol, boro: p.boro, deliverySignature: p.deliverySignature, createdAt: p.createdAt
  }));
  res.json({ payments });
});

app.post('/api/presale/submit', async (req, res, next) => {
  try {
    const { rawTransaction } = req.body || {};
    if (!Array.isArray(rawTransaction) || rawTransaction.length === 0) throw error('Signed transaction is required.');
    const txBuffer = Buffer.from(rawTransaction);
    const rpc = connection();
    const signature = await rpc.sendRawTransaction(txBuffer, { skipPreflight: false, preflightCommitment: 'confirmed' });
    // Wait for confirmation
    await rpc.confirmTransaction(signature, 'confirmed');
    res.json({ signature });
  } catch (caught) { next(caught); }
});

app.post('/api/presale/deliver', async (req, res, next) => {
  try {
    const { signature, buyer } = req.body || {};
    if (typeof signature !== 'string' || typeof buyer !== 'string') throw error('Payment signature and buyer wallet are required.');
    const buyerKey = new PublicKey(buyer);
    const db = readPayments();
    const previous = db.payments.find((payment) => payment.paymentSignature === signature);
    if (previous?.status === 'delivered') return res.json(previous);
    if (previous?.status === 'processing') throw error('Payment is already processing. Do not send another payment.', 409);

    const rpc = connection();
    const transaction = await rpc.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (!transaction) throw error('Transaction is awaiting confirmation.', 202);
    if (transaction.meta?.err) throw error('The payment transaction failed.');
    const transfer = transaction.transaction.message.instructions.find((instruction) => instruction.program === 'system' && instruction.parsed?.type === 'transfer' && instruction.parsed.info.source === buyerKey.toBase58() && instruction.parsed.info.destination === sale.treasury);
    if (!transfer) throw error('No direct SOL transfer to the published treasury was found.');
    const lamports = BigInt(transfer.parsed.info.lamports);
    const sol = Number(lamports) / LAMPORTS_PER_SOL;
    if (sol < sale.minSol || sol > sale.maxSol) throw error(`Payment must be between ${sale.minSol} and ${sale.maxSol} SOL.`);

    const payment = { paymentSignature: signature, buyer: buyerKey.toBase58(), sol, status: 'processing', createdAt: new Date().toISOString() };
    db.payments.push(payment); savePayments(db);
    const signer = distributor();
    const mintKey = new PublicKey(sale.mint);
    const mint = await getMint(rpc, mintKey, 'confirmed');
    const amount = (lamports * sale.boroPerSol * (10n ** BigInt(mint.decimals))) / BigInt(LAMPORTS_PER_SOL);
    const destination = await getOrCreateAssociatedTokenAccount(rpc, signer, mintKey, buyerKey, false, 'confirmed');
    const deliverySignature = await transferChecked(rpc, signer, signer.publicKey, mintKey, destination.address, signer, amount, mint.decimals, [], { commitment: 'confirmed' });
    Object.assign(payment, { status: 'delivered', boro: (sol * Number(sale.boroPerSol)).toLocaleString(), deliverySignature });
    savePayments(db);
    res.json(payment);
  } catch (caught) { next(caught); }
});

app.use((caught, _req, res, _next) => {
  console.error(caught);
  res.status(caught.status || 500).json({ error: caught.status ? caught.message : 'Delivery could not be completed. Contact support with your payment signature.' });
});

// Fallback -> home
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 MOONPAW server blasting off at http://localhost:${PORT}`);
});
