// AgentPay demo frontend — BNB Smart Chain Testnet (chain 97).
// Static page, no build step. Serve frontend/ with any static server,
// e.g. `python3 -m http.server`, and open index.html.
//
// Flow: read-only calls use the public RPC; writes need a connected wallet
// (MetaMask / injected provider) on BSC Testnet. Until CONFIG holds the real
// deployed addresses (wiring final from deployments.json), every on-chain
// action is disabled with a clear message — see isPlaceholder().

const $ = (id) => document.getElementById(id);

const CHAIN_ID = CONFIG.CHAIN_ID;
const EXPLORER = CONFIG.EXPLORER;
const ZERO = ZERO_ADDRESS;

let readProvider = null; // JsonRpcProvider (public RPC, reads only)
let provider = null;     // BrowserProvider (wallet)
let signer = null;
let account = null;
let agentpay = null;     // Contract with signer
let agentpayRead = null; // Contract with read provider
let currentInvoice = null;

const isPlaceholder = () =>
  !CONFIG.AGENTPAY_ADDRESS ||
  CONFIG.AGENTPAY_ADDRESS.toLowerCase() === ZERO;

const shortAddr = (a) =>
  a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";

const txLink = (hash) =>
  `<a href="${EXPLORER}/tx/${hash}" target="_blank" rel="noopener">Lihat tx di BscScan ↗</a>`;

const addrLink = (a) =>
  `<a href="${EXPLORER}/address/${a}" target="_blank" rel="noopener" class="addr">${shortAddr(a)}</a>`;

// ---- Pesan error yang dimengerti user --------------------------------------
function friendlyError(e) {
  const msg = (e && (e.reason || e.message)) || String(e || "error tidak diketahui");
  if (e && e.code === "ACTION_REJECTED") return "Transaksi dibatalkan — kamu menolak di wallet.";
  if (/insufficient funds/i.test(msg)) return "Saldo tidak cukup (cek saldo tBNB untuk jumlah + gas).";
  if (/user rejected/i.test(msg)) return "Transaksi dibatalkan — kamu menolak di wallet.";
  if (/network|chain/i.test(msg) && /mismatch|wrong|unsupported/i.test(msg))
    return "Network salah — pindah ke BSC Testnet (chain 97).";
  if (/could not coalesce|missing revert data|call revert/i.test(msg))
    return "Panggilan kontrak gagal — kemungkinan kontrak belum ter-deploy di alamat ini.";
  if (/resolver|name not found|ENS/i.test(msg)) return "Nama tidak ditemukan.";
  return "Gagal: " + msg;
}

function setMsg(el, text, isError) {
  el.innerHTML = text;
  el.className = "msg " + (isError ? "err" : "muted");
}

// ---- Init ------------------------------------------------------------------
function init() {
  $("contractAddr").textContent = isPlaceholder()
    ? CONFIG.AGENTPAY_ADDRESS + " (placeholder — belum di-deploy)"
    : CONFIG.AGENTPAY_ADDRESS;
  $("usdtAddr").textContent =
    CONFIG.MOCK_USDT_ADDRESS.toLowerCase() === ZERO
      ? CONFIG.MOCK_USDT_ADDRESS + " (placeholder)"
      : CONFIG.MOCK_USDT_ADDRESS;

  if (isPlaceholder()) {
    $("placeholderBanner").style.display = "block";
    $("deployBadge").textContent = "Status kontrak: belum di-deploy — mode preview";
  } else {
    $("deployBadge").textContent = "Status kontrak: ter-deploy di testnet";
    $("deployBadge").classList.remove("warn");
    $("placeholderBanner").style.display = "none";
  }

  try {
    readProvider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    agentpayRead = new ethers.Contract(CONFIG.AGENTPAY_ADDRESS, AGENTPAY_ABI, readProvider);
  } catch (e) {
    console.warn("read provider init failed:", e);
  }

  // Tabs
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  $("connectBtn").addEventListener("click", connect);
  $("switchBtn").addEventListener("click", switchNetwork);
  $("resolveBtn").addEventListener("click", resolveClicked);
  $("loadInvoiceBtn").addEventListener("click", loadInvoiceClicked);
  $("approveBtn").addEventListener("click", approveClicked);
  $("payBtn").addEventListener("click", payClicked);
  $("tipBtn").addEventListener("click", tipClicked);
  $("createBtn").addEventListener("click", createClicked);
  $("refreshBtn").addEventListener("click", refreshDashboard);
}

// ---- Helpers ---------------------------------------------------------------
function validAiName(name) {
  if (!name || typeof name !== "string") return false;
  const n = name.trim().toLowerCase();
  if (!n.endsWith(".ai")) return false;
  const label = n.slice(0, -3);
  return label.length > 0 && /^[a-z0-9-]+$/.test(label);
}

function tokenLabel(token) {
  if (!token || token.toLowerCase() === ZERO) return CONFIG.NATIVE_SYMBOL;
  if (token.toLowerCase() === CONFIG.MOCK_USDT_ADDRESS.toLowerCase()) return "MockUSDT";
  return "Token " + shortAddr(token);
}

function formatAmount(amount, token) {
  try {
    if (!token || token.toLowerCase() === ZERO) return ethers.formatEther(amount) + " tBNB";
    if (token.toLowerCase() === CONFIG.MOCK_USDT_ADDRESS.toLowerCase())
      return ethers.formatUnits(amount, 6) + " MockUSDT";
    return ethers.formatUnits(amount, 18) + " token";
  } catch (e) {
    return String(amount);
  }
}

function parseAmountForToken(amountStr, token) {
  if (!token || token.toLowerCase() === ZERO)
    return ethers.parseEther(amountStr);
  if (token.toLowerCase() === CONFIG.MOCK_USDT_ADDRESS.toLowerCase())
    return ethers.parseUnits(amountStr, 6);
  return ethers.parseUnits(amountStr, 18);
}

async function ensureAgentpay() {
  if (isPlaceholder()) throw new Error("PLACEHOLDER");
  if (!agentpayRead) throw new Error("Kontrak belum siap — muat ulang halaman.");
  return true;
}

// ---- 5. Connect wallet ------------------------------------------------------
async function connect() {
  if (typeof window.ethers === "undefined") {
    setMsg($("walletInfo"), "Library ethers.js belum termuat — periksa koneksi lalu muat ulang halaman.", true);
    return;
  }
  if (!window.ethereum) {
    setMsg($("walletInfo"), "Wallet tidak ditemukan. Pasang MetaMask (atau wallet lain) lalu muat ulang halaman.", true);
    return;
  }
  setMsg($("walletInfo"), "Menghubungkan…", false);
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== CHAIN_ID) {
      $("switchBtn").style.display = "";
      setMsg($("walletInfo"), "Wallet terhubung tapi di network lain (chain " + Number(net.chainId) + "). Klik “Pindah ke BSC Testnet”.", true);
      signer = await provider.getSigner();
      account = await signer.getAddress();
      await updateWalletInfo();
      return;
    }
    signer = await provider.getSigner();
    account = await signer.getAddress();
    agentpay = new ethers.Contract(CONFIG.AGENTPAY_ADDRESS, AGENTPAY_ABI, signer);
    await updateWalletInfo();
  } catch (e) {
    setMsg($("walletInfo"), friendlyError(e), true);
  }
}

async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.CHAIN_ID_HEX }],
    });
    $("switchBtn").style.display = "none";
    await connect();
  } catch (e) {
    if (e && e.code === 4902) {
      // Chain belum ditambahkan di wallet — tambahkan.
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CONFIG.CHAIN_ID_HEX,
            chainName: CONFIG.CHAIN_NAME,
            nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
            rpcUrls: [CONFIG.RPC_URL],
            blockExplorerUrls: [CONFIG.EXPLORER],
          }],
        });
        $("switchBtn").style.display = "none";
        await connect();
      } catch (e2) {
        setMsg($("walletInfo"), friendlyError(e2), true);
      }
    } else {
      setMsg($("walletInfo"), friendlyError(e), true);
    }
  }
}

async function updateWalletInfo() {
  if (!account) return;
  try {
    const bal = await provider.getBalance(account);
    $("walletInfo").innerHTML =
      `Terhubung: <code>${account}</code><br>Saldo: ${ethers.formatEther(bal)} tBNB · ` +
      `<a href="${EXPLORER}/address/${account}" target="_blank" rel="noopener">BscScan ↗</a>`;
  } catch (e) {
    $("walletInfo").textContent = "Terhubung: " + account;
  }
  await checkAgentId();
  refreshDashboard();
}

async function checkAgentId() {
  const gate = $("createGateMsg");
  if (isPlaceholder()) {
    $("agentIdStatus").textContent =
      "Status Agent ID: belum bisa dicek — kontrak AgentPay belum ter-deploy (alamat placeholder).";
    gate.textContent =
      "Wallet ini belum bisa dicek — kontrak belum ter-deploy. Buat invoice aktif setelah wiring final.";
    $("createBtn").disabled = true;
    return false;
  }
  try {
    const has = await agentpayRead.hasAgentId(account);
    if (has) {
      $("agentIdStatus").innerHTML = `<span class="ok">✓ Wallet ini memegang Agent ID (.ai).</span>`;
      gate.textContent = "Wallet ini memegang Agent ID — kamu bisa buat invoice.";
      $("createBtn").disabled = false;
    } else {
      $("agentIdStatus").innerHTML =
        `<span class="err">Wallet ini tidak memegang Agent ID (.ai) — buat invoice hanya untuk pemegang Agent ID.</span>`;
      gate.textContent =
        "Wallet ini tidak memegang Agent ID (.ai) — buat invoice hanya untuk pemegang Agent ID.";
      $("createBtn").disabled = true;
    }
    return has;
  } catch (e) {
    $("agentIdStatus").textContent = "Status Agent ID tidak bisa dicek: " + friendlyError(e);
    gate.textContent = "Status Agent ID tidak bisa dicek — coba lagi.";
    $("createBtn").disabled = true;
    return false;
  }
}

// ---- 1. Pay: resolve + invoice ----------------------------------------------
async function resolveClicked() {
  const name = $("resolveName").value.trim().toLowerCase();
  if (!validAiName(name)) {
    setMsg($("resolveMsg"), "Nama tidak valid — harus berakhiran .ai (contoh: jennairafunds.ai).", true);
    return;
  }
  if (isPlaceholder()) {
    setMsg($("resolveMsg"), "Kontrak belum ter-deploy (alamat placeholder) — resolve on-chain belum bisa. Coba lagi setelah wiring final.", true);
    return;
  }
  setMsg($("resolveMsg"), "Mengecek " + name + " di kontrak…", false);
  try {
    const [owner, ok] = await agentpayRead.resolveName(name);
    if (!ok || owner.toLowerCase() === ZERO) {
      setMsg($("resolveMsg"), `Nama ${name} tidak ditemukan / tidak punya pemilik di registry.`, true);
      return;
    }
    $("resolveMsg").innerHTML =
      `<span class="ok">✓ ${name} → pemilik ${addrLink(owner)}</span>`;
  } catch (e) {
    setMsg($("resolveMsg"), friendlyError(e), true);
  }
}

async function loadInvoiceClicked() {
  const idRaw = $("payId").value.trim();
  if (idRaw === "" || Number(idRaw) < 0 || !Number.isInteger(Number(idRaw))) {
    setMsg($("payMsg"), "Masukkan ID invoice yang valid (angka ≥ 0).", true);
    return;
  }
  const id = Number(idRaw);
  if (isPlaceholder()) {
    setMsg($("payMsg"), "Kontrak belum ter-deploy (alamat placeholder) — invoice belum bisa dimuat. Coba lagi setelah wiring final.", true);
    return;
  }
  setMsg($("payMsg"), "Memuat invoice #" + id + "…", false);
  try {
    const inv = await agentpayRead.getInvoice(id);
    currentInvoice = {
      id: Number(inv[0]),
      merchant: inv[1],
      merchantName: inv[2],
      amount: inv[3],
      token: inv[4],
      memo: inv[5],
      paid: inv[6],
      payer: inv[7],
      paidAt: Number(inv[8]),
    };
    renderInvoiceDetail();
  } catch (e) {
    currentInvoice = null;
    $("invoiceDetail").innerHTML = "";
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "none";
    setMsg($("payMsg"), "Invoice #" + id + " tidak ditemukan. " + friendlyError(e), true);
  }
}

function renderInvoiceDetail() {
  const inv = currentInvoice;
  if (!inv) return;
  const status = inv.paid
    ? `<span class="pill paid">Dibayar</span>`
    : `<span class="pill unpaid">Belum dibayar</span>`;
  $("invoiceDetail").innerHTML =
    `<table>
      <tr><th>Invoice</th><td>#${inv.id} ${status}</td></tr>
      <tr><th>Merchant</th><td>${inv.merchantName ? inv.merchantName + " · " : ""}${addrLink(inv.merchant)}</td></tr>
      <tr><th>Jumlah</th><td>${formatAmount(inv.amount, inv.token)}</td></tr>
      <tr><th>Memo</th><td>${inv.memo || "—"}</td></tr>
      ${inv.paid ? `<tr><th>Payer</th><td>${addrLink(inv.payer)} · ${new Date(inv.paidAt * 1000).toLocaleString("id-ID")}</td></tr>` : ""}
    </table>`;
  if (inv.paid) {
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "none";
    setMsg($("payMsg"), "Invoice ini sudah dibayar — tidak bisa dibayar lagi.", false);
    return;
  }
  if (!account) {
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "none";
    setMsg($("payMsg"), "Hubungkan wallet dulu untuk membayar.", true);
    return;
  }
  setMsg($("payMsg"), "Invoice dimuat. Periksa merchant & jumlah di atas sebelum bayar.", false);
  if (inv.token.toLowerCase() === ZERO) {
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "";
  } else {
    // ERC20: cek allowance dulu — tombol Approve muncul bila perlu.
    $("payBtn").style.display = "none";
    $("approveBtn").style.display = "";
    checkAllowance();
  }
}

async function checkAllowance() {
  if (!currentInvoice || !account) return;
  try {
    const token = new ethers.Contract(currentInvoice.token, ERC20_ABI, provider);
    const allowance = await token.allowance(account, CONFIG.AGENTPAY_ADDRESS);
    if (allowance >= currentInvoice.amount) {
      $("approveBtn").style.display = "none";
      $("payBtn").style.display = "";
      setMsg($("payMsg"), "Allowance cukup — kamu bisa langsung bayar.", false);
    } else {
      setMsg($("payMsg"), "Token ini butuh Approve dulu sebelum dibayar (ERC20 transferFrom).", false);
    }
  } catch (e) {
    setMsg($("payMsg"), "Tidak bisa cek allowance: " + friendlyError(e), true);
  }
}

async function approveClicked() {
  if (!currentInvoice || !account || !signer) return;
  setMsg($("payMsg"), "Mengirim Approve… konfirmasi di wallet.", false);
  try {
    const token = new ethers.Contract(currentInvoice.token, ERC20_ABI, signer);
    const tx = await token.approve(CONFIG.AGENTPAY_ADDRESS, currentInvoice.amount);
    setMsg($("payMsg"), "Approve terkirim, menunggu konfirmasi… " + txLink(tx.hash), false);
    await tx.wait();
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "";
    setMsg($("payMsg"), "Approve berhasil ✓ — sekarang klik Bayar invoice.", false);
  } catch (e) {
    setMsg($("payMsg"), friendlyError(e), true);
  }
}

async function payClicked() {
  if (!currentInvoice || !account || !signer) return;
  const inv = currentInvoice;
  setMsg($("payMsg"), "Mengirim pembayaran… konfirmasi di wallet.", false);
  try {
    let tx;
    if (inv.token.toLowerCase() === ZERO) {
      tx = await agentpay.payInvoice(inv.id, { value: inv.amount });
    } else {
      tx = await agentpay.payInvoice(inv.id);
    }
    setMsg($("payMsg"), "Pembayaran terkirim, menunggu konfirmasi… " + txLink(tx.hash), false);
    const receipt = await tx.wait();
    currentInvoice.paid = true;
    renderInvoiceDetail();
    setMsg($("payMsg"), `Invoice #${inv.id} berhasil dibayar ✓ ${txLink(receipt.hash)}`, false);
    refreshDashboard();
  } catch (e) {
    setMsg($("payMsg"), friendlyError(e), true);
  }
}

// ---- 2. Tip ------------------------------------------------------------------
async function tipClicked() {
  const name = $("tipName").value.trim().toLowerCase();
  const amountStr = $("tipAmount").value.trim();
  const memo = $("tipMemo").value.trim();
  const tokenKind = $("tipToken") ? $("tipToken").value : "native";
  const isUsdt = tokenKind === "usdt";
  const unit = isUsdt ? "MockUSDT" : "tBNB";
  if (!validAiName(name)) {
    setMsg($("tipMsg"), "Nama tidak valid — harus berakhiran .ai (contoh: jennairafunds.ai).", true);
    return;
  }
  if (!amountStr || Number(amountStr) <= 0) {
    setMsg($("tipMsg"), "Masukkan jumlah tip lebih dari 0 " + unit + ".", true);
    return;
  }
  if (!account || !signer) {
    setMsg($("tipMsg"), "Hubungkan wallet dulu untuk kirim tip.", true);
    return;
  }
  if (isPlaceholder()) {
    setMsg($("tipMsg"), "Kontrak belum ter-deploy (alamat placeholder) — tip belum bisa dikirim. Coba lagi setelah wiring final.", true);
    return;
  }
  if (isUsdt && CONFIG.MOCK_USDT_ADDRESS.toLowerCase() === ZERO) {
    setMsg($("tipMsg"), "Alamat MockUSDT masih placeholder — pilih tBNB untuk sementara.", true);
    return;
  }
  setMsg($("tipMsg"), "Mengecek " + name + " dulu…", false);
  try {
    const [owner, ok] = await agentpayRead.resolveName(name);
    if (!ok || owner.toLowerCase() === ZERO) {
      setMsg($("tipMsg"), `Nama ${name} tidak ditemukan / tidak punya pemilik — tip dibatalkan.`, true);
      return;
    }
    let tx;
    if (isUsdt) {
      const amount = ethers.parseUnits(amountStr, 6);
      const token = new ethers.Contract(CONFIG.MOCK_USDT_ADDRESS, ERC20_ABI, signer);
      const allowance = await token.allowance(account, CONFIG.AGENTPAY_ADDRESS);
      setMsg($("tipMsg"), `Mengirim ${amountStr} MockUSDT ke ${name} (${shortAddr(owner)})… konfirmasi di wallet.`, false);
      if (allowance < amount) {
        const atx = await token.approve(CONFIG.AGENTPAY_ADDRESS, amount);
        setMsg($("tipMsg"), "Approve MockUSDT terkirim, menunggu konfirmasi… " + txLink(atx.hash), false);
        await atx.wait();
      }
      tx = await agentpay.tipToken(CONFIG.MOCK_USDT_ADDRESS, amount, name, memo);
    } else {
      setMsg($("tipMsg"), `Mengirim ${amountStr} tBNB ke ${name} (${shortAddr(owner)})… konfirmasi di wallet.`, false);
      tx = await agentpay.tip(name, memo, { value: ethers.parseEther(amountStr) });
    }
    setMsg($("tipMsg"), "Tip terkirim, menunggu konfirmasi… " + txLink(tx.hash), false);
    const receipt = await tx.wait();
    setMsg($("tipMsg"), `Tip ${amountStr} ${unit} ke ${name} berhasil ✓ ${txLink(receipt.hash)}`, false);
  } catch (e) {
    setMsg($("tipMsg"), friendlyError(e), true);
  }
}

// ---- 3. Buat invoice ----------------------------------------------------------
async function createClicked() {
  const name = $("invName").value.trim().toLowerCase();
  const amountStr = $("invAmount").value.trim();
  const tokenKind = $("invToken").value;
  const memo = $("invMemo").value.trim();
  if (!validAiName(name)) {
    setMsg($("createMsg"), "Nama merchant tidak valid — harus berakhiran .ai dan milik wallet kamu.", true);
    return;
  }
  if (!amountStr || Number(amountStr) <= 0) {
    setMsg($("createMsg"), "Masukkan jumlah lebih dari 0.", true);
    return;
  }
  if (!account || !signer) {
    setMsg($("createMsg"), "Hubungkan wallet dulu untuk buat invoice.", true);
    return;
  }
  if (isPlaceholder()) {
    setMsg($("createMsg"), "Kontrak belum ter-deploy (alamat placeholder) — invoice belum bisa dibuat. Coba lagi setelah wiring final.", true);
    return;
  }
  const token = tokenKind === "usdt" ? CONFIG.MOCK_USDT_ADDRESS : ZERO;
  if (tokenKind === "usdt" && token.toLowerCase() === ZERO) {
    setMsg($("createMsg"), "Alamat MockUSDT masih placeholder — pilih tBNB untuk sementara.", true);
    return;
  }
  setMsg($("createMsg"), "Mengecek Agent ID wallet kamu…", false);
  try {
    const has = await agentpayRead.hasAgentId(account);
    if (!has) {
      setMsg($("createMsg"), "Wallet ini tidak memegang Agent ID (.ai) — buat invoice hanya untuk pemegang Agent ID.", true);
      return;
    }
    const [owner, ok] = await agentpayRead.resolveName(name);
    if (!ok || owner.toLowerCase() !== account.toLowerCase()) {
      setMsg($("createMsg"), `Nama ${name} bukan milik wallet ini — invoice hanya bisa dibuat atas nama .ai milikmu.`, true);
      return;
    }
    const amount = parseAmountForToken(amountStr, token);
    setMsg($("createMsg"), "Mengirim invoice… konfirmasi di wallet.", false);
    const tx = await agentpay.createInvoice(amount, token, memo, name);
    setMsg($("createMsg"), "Invoice terkirim, menunggu konfirmasi… " + txLink(tx.hash), false);
    const receipt = await tx.wait();
    let newId = null;
    try {
      for (const log of receipt.logs) {
        const parsed = agentpay.interface.parseLog(log);
        if (parsed && parsed.name === "InvoiceCreated") { newId = Number(parsed.args.id); break; }
      }
    } catch (e) { /* fallback di bawah */ }
    if (newId === null) {
      try { newId = Number(await agentpayRead.invoiceCount()) - 1; } catch (e) { /* abaikan */ }
    }
    setMsg($("createMsg"),
      `Invoice ${newId !== null ? "#" + newId : ""} berhasil dibuat ✓ ${txLink(receipt.hash)}` +
      (newId !== null ? ` — bagikan ID ${newId} ke customer.` : ""), false);
    refreshDashboard();
  } catch (e) {
    setMsg($("createMsg"), friendlyError(e), true);
  }
}

// ---- 4. Dashboard merchant ----------------------------------------------------
async function refreshDashboard() {
  const tbody = $("invTable");
  if (!account) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Hubungkan wallet, lalu muat ulang.</td></tr>`;
    return;
  }
  if (isPlaceholder()) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Kontrak belum ter-deploy (alamat placeholder) — dashboard belum bisa dimuat.</td></tr>`;
    setMsg($("dashMsg"), "Dashboard aktif setelah wiring final.", false);
    return;
  }
  setMsg($("dashMsg"), "Memuat invoice…", false);
  try {
    const count = Number(await agentpayRead.invoiceCount());
    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Belum ada invoice di kontrak ini.</td></tr>`;
      setMsg($("dashMsg"), "Belum ada invoice.", false);
      return;
    }
    const rows = [];
    const start = Math.max(0, count - 100); // batasi 100 terakhir
    for (let id = count - 1; id >= start; id--) {
      const inv = await agentpayRead.getInvoice(id);
      if (inv[1].toLowerCase() !== account.toLowerCase()) continue;
      const paid = inv[6];
      rows.push(
        `<tr>
          <td>#${Number(inv[0])}</td>
          <td>${inv[2] || "—"}<br><span class="muted">${inv[5] || ""}</span></td>
          <td>${formatAmount(inv[3], inv[4])}<br><span class="muted">${tokenLabel(inv[4])}</span></td>
          <td>${paid ? '<span class="pill paid">Dibayar</span>' : '<span class="pill unpaid">Belum</span>'}</td>
          <td>${paid ? addrLink(inv[7]) : "—"}</td>
          <td>${paid ? new Date(Number(inv[8]) * 1000).toLocaleString("id-ID") : "—"}</td>
        </tr>`);
    }
    tbody.innerHTML = rows.join("") ||
      `<tr><td colspan="6" class="muted">Wallet ini belum membuat invoice apa pun.</td></tr>`;
    setMsg($("dashMsg"), `Menampilkan ${rows.length} invoice milik wallet ini (dari ${count} total).`, false);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="err">Gagal memuat dashboard.</td></tr>`;
    setMsg($("dashMsg"), friendlyError(e), true);
  }
}

if (typeof window.ethers !== "undefined") {
  init();
} else {
  // CDN gagal — init tetap jalan untuk banner placeholder, tapi tombol
  // transaksi akan menolak dengan pesan yang jelas.
  document.addEventListener("DOMContentLoaded", () => {
    try { init(); } catch (e) { console.warn(e); }
  });
}
