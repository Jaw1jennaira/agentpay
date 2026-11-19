// AgentPay demo frontend — BNB Smart Chain Testnet (chain 97).
// Static page, no build step. Serve frontend/ with any static server,
// e.g. `python3 -m http.server`, and open index.html.
//
// Flow: read-only calls use the public RPC; writes need a connected wallet
// (MetaMask / injected provider) on BSC Testnet. Until CONFIG holds the real
// deployed addresses (final wiring from deployments.json), every on-chain
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
  `<a href="${EXPLORER}/tx/${hash}" target="_blank" rel="noopener">View tx on BscScan ↗</a>`;

const addrLink = (a) =>
  `<a href="${EXPLORER}/address/${a}" target="_blank" rel="noopener" class="addr">${shortAddr(a)}</a>`;

// ---- User-friendly error messages ------------------------------------------
function friendlyError(e) {
  const msg = (e && (e.reason || e.message)) || String(e || "unknown error");
  if (e && e.code === "ACTION_REJECTED") return "Transaction cancelled — you rejected it in your wallet.";
  if (/insufficient funds/i.test(msg)) return "Insufficient balance (check your tBNB balance for amount + gas).";
  if (/user rejected/i.test(msg)) return "Transaction cancelled — you rejected it in your wallet.";
  if (/network|chain/i.test(msg) && /mismatch|wrong|unsupported/i.test(msg))
    return "Wrong network — switch to BSC Testnet (chain 97).";
  if (/SelfPayment/i.test(msg)) return "You can't pay your own invoice or tip your own name.";
  if (/AlreadyPaid/i.test(msg)) return "This invoice is already paid.";
  if (/InvoiceNotFound/i.test(msg)) return "Invoice not found — check the ID.";
  if (/could not coalesce|missing revert data|call revert/i.test(msg))
    return "Contract call failed — the contract may not be deployed at this address.";
  if (/resolver|name not found|ENS/i.test(msg)) return "Name not found.";
  return "Failed: " + msg;
}

function setMsg(el, text, isError) {
  el.innerHTML = text;
  el.className = "msg " + (isError ? "err" : "muted");
}

// ---- Init ------------------------------------------------------------------
function init() {
  $("contractAddr").textContent = isPlaceholder()
    ? CONFIG.AGENTPAY_ADDRESS + " (placeholder — not deployed yet)"
    : CONFIG.AGENTPAY_ADDRESS;
  $("usdtAddr").textContent =
    CONFIG.MOCK_USDT_ADDRESS.toLowerCase() === ZERO
      ? CONFIG.MOCK_USDT_ADDRESS + " (placeholder)"
      : CONFIG.MOCK_USDT_ADDRESS;

  if (isPlaceholder()) {
    $("placeholderBanner").style.display = "block";
    $("deployBadge").textContent = "Contract status: not deployed yet — preview mode";
  } else {
    $("deployBadge").textContent = "Contract status: deployed on testnet";
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
  if (!agentpayRead) throw new Error("Contract not ready — reload the page.");
  return true;
}

// ---- 5. Connect wallet ------------------------------------------------------
async function connect() {
  if (typeof window.ethers === "undefined") {
    setMsg($("walletInfo"), "The ethers.js library hasn't loaded — check your connection, then reload the page.", true);
    return;
  }
  if (!window.ethereum) {
    setMsg($("walletInfo"), "No wallet found. Install MetaMask (or another wallet), then reload the page.", true);
    return;
  }
  setMsg($("walletInfo"), "Connecting…", false);
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== CHAIN_ID) {
      $("switchBtn").style.display = "";
      setMsg($("walletInfo"), "Wallet connected but on another network (chain " + Number(net.chainId) + "). Click “Switch to BSC Testnet”.", true);
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
      // Chain not added in the wallet yet — add it.
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
      `Connected: <code>${account}</code><br>Balance: ${ethers.formatEther(bal)} tBNB · ` +
      `<a href="${EXPLORER}/address/${account}" target="_blank" rel="noopener">BscScan ↗</a>`;
  } catch (e) {
    $("walletInfo").textContent = "Connected: " + account;
  }
  await checkAgentId();
  refreshDashboard();
}

async function checkAgentId() {
  const gate = $("createGateMsg");
  if (isPlaceholder()) {
    $("agentIdStatus").textContent =
      "Agent ID status: can't be checked yet — the AgentPay contract isn't deployed (placeholder address).";
    gate.textContent =
      "This wallet can't be checked yet — the contract isn't deployed. Creating invoices activates after the final wiring.";
    $("createBtn").disabled = true;
    return false;
  }
  try {
    const has = await agentpayRead.hasAgentId(account);
    if (has) {
      $("agentIdStatus").innerHTML = `<span class="ok">✓ This wallet holds an Agent ID (.ai).</span>`;
      gate.textContent = "This wallet holds an Agent ID — you can create invoices.";
      $("createBtn").disabled = false;
    } else {
      $("agentIdStatus").innerHTML =
        `<span class="err">This wallet doesn't hold an Agent ID (.ai) — creating invoices is for Agent ID holders only.</span>`;
      gate.textContent =
        "This wallet doesn't hold an Agent ID (.ai) — creating invoices is for Agent ID holders only.";
      $("createBtn").disabled = true;
    }
    return has;
  } catch (e) {
    $("agentIdStatus").textContent = "Agent ID status couldn't be checked: " + friendlyError(e);
    gate.textContent = "Agent ID status couldn't be checked — try again.";
    $("createBtn").disabled = true;
    return false;
  }
}

// ---- 1. Pay: resolve + invoice ----------------------------------------------
async function resolveClicked() {
  const name = $("resolveName").value.trim().toLowerCase();
  if (!validAiName(name)) {
    setMsg($("resolveMsg"), "Invalid name — it must end with .ai (e.g. jennairafunds.ai).", true);
    return;
  }
  if (isPlaceholder()) {
    setMsg($("resolveMsg"), "Contract not deployed yet (placeholder address) — on-chain resolve isn't available. Try again after the final wiring.", true);
    return;
  }
  setMsg($("resolveMsg"), "Checking " + name + " on the contract…", false);
  try {
    const [owner, ok] = await agentpayRead.resolveName(name);
    if (!ok || owner.toLowerCase() === ZERO) {
      setMsg($("resolveMsg"), `Name ${name} not found / has no owner in the registry.`, true);
      return;
    }
    $("resolveMsg").innerHTML =
      `<span class="ok">✓ ${name} → owner ${addrLink(owner)}</span>`;
  } catch (e) {
    setMsg($("resolveMsg"), friendlyError(e), true);
  }
}

async function loadInvoiceClicked() {
  const idRaw = $("payId").value.trim();
  if (idRaw === "" || Number(idRaw) < 0 || !Number.isInteger(Number(idRaw))) {
    setMsg($("payMsg"), "Enter a valid invoice ID (number ≥ 0).", true);
    return;
  }
  const id = Number(idRaw);
  if (isPlaceholder()) {
    setMsg($("payMsg"), "Contract not deployed yet (placeholder address) — invoices can't be loaded. Try again after the final wiring.", true);
    return;
  }
  setMsg($("payMsg"), "Loading invoice #" + id + "…", false);
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
    setMsg($("payMsg"), "Invoice #" + id + " not found. " + friendlyError(e), true);
  }
}

function renderInvoiceDetail() {
  const inv = currentInvoice;
  if (!inv) return;
  const status = inv.paid
    ? `<span class="pill paid">Paid</span>`
    : `<span class="pill unpaid">Unpaid</span>`;
  $("invoiceDetail").innerHTML =
    `<table>
      <tr><th>Invoice</th><td>#${inv.id} ${status}</td></tr>
      <tr><th>Merchant</th><td>${inv.merchantName ? inv.merchantName + " · " : ""}${addrLink(inv.merchant)}</td></tr>
      <tr><th>Amount</th><td>${formatAmount(inv.amount, inv.token)}</td></tr>
      <tr><th>Memo</th><td>${inv.memo || "—"}</td></tr>
      ${inv.paid ? `<tr><th>Payer</th><td>${addrLink(inv.payer)} · ${new Date(inv.paidAt * 1000).toLocaleString("en-US")}</td></tr>` : ""}
    </table>`;
  if (inv.paid) {
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "none";
    setMsg($("payMsg"), "This invoice is already paid — it can't be paid again.", false);
    return;
  }
  if (!account) {
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "none";
    setMsg($("payMsg"), "Connect your wallet first to pay.", true);
    return;
  }
  setMsg($("payMsg"), "Invoice loaded. Check the merchant & amount above before paying.", false);
  if (inv.token.toLowerCase() === ZERO) {
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "";
  } else {
    // ERC20: check allowance first — the Approve button appears if needed.
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
      setMsg($("payMsg"), "Allowance is enough — you can pay directly.", false);
    } else {
      setMsg($("payMsg"), "This token needs Approve first before paying (ERC20 transferFrom).", false);
    }
  } catch (e) {
    setMsg($("payMsg"), "Couldn't check allowance: " + friendlyError(e), true);
  }
}

async function approveClicked() {
  if (!currentInvoice || !account || !signer) return;
  setMsg($("payMsg"), "Sending Approve… confirm in your wallet.", false);
  try {
    const token = new ethers.Contract(currentInvoice.token, ERC20_ABI, signer);
    const tx = await token.approve(CONFIG.AGENTPAY_ADDRESS, currentInvoice.amount);
    setMsg($("payMsg"), "Approve sent, waiting for confirmation… " + txLink(tx.hash), false);
    await tx.wait();
    $("approveBtn").style.display = "none";
    $("payBtn").style.display = "";
    setMsg($("payMsg"), "Approve succeeded ✓ — now click Pay invoice.", false);
  } catch (e) {
    setMsg($("payMsg"), friendlyError(e), true);
  }
}

async function payClicked() {
  if (!currentInvoice || !account || !signer) return;
  const inv = currentInvoice;
  setMsg($("payMsg"), "Sending payment… confirm in your wallet.", false);
  try {
    let tx;
    if (inv.token.toLowerCase() === ZERO) {
      tx = await agentpay.payInvoice(inv.id, { value: inv.amount });
    } else {
      tx = await agentpay.payInvoice(inv.id);
    }
    setMsg($("payMsg"), "Payment sent, waiting for confirmation… " + txLink(tx.hash), false);
    const receipt = await tx.wait();
    currentInvoice.paid = true;
    renderInvoiceDetail();
    setMsg($("payMsg"), `Invoice #${inv.id} paid successfully ✓ ${txLink(receipt.hash)}`, false);
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
    setMsg($("tipMsg"), "Invalid name — it must end with .ai (e.g. jennairafunds.ai).", true);
    return;
  }
  if (!amountStr || Number(amountStr) <= 0) {
    setMsg($("tipMsg"), "Enter a tip amount greater than 0 " + unit + ".", true);
    return;
  }
  if (!account || !signer) {
    setMsg($("tipMsg"), "Connect your wallet first to send a tip.", true);
    return;
  }
  if (isPlaceholder()) {
    setMsg($("tipMsg"), "Contract not deployed yet (placeholder address) — tips can't be sent. Try again after the final wiring.", true);
    return;
  }
  if (isUsdt && CONFIG.MOCK_USDT_ADDRESS.toLowerCase() === ZERO) {
    setMsg($("tipMsg"), "The MockUSDT address is still a placeholder — choose tBNB for now.", true);
    return;
  }
  setMsg($("tipMsg"), "Checking " + name + " first…", false);
  try {
    const [owner, ok] = await agentpayRead.resolveName(name);
    if (!ok || owner.toLowerCase() === ZERO) {
      setMsg($("tipMsg"), `Name ${name} not found / has no owner — tip cancelled.`, true);
      return;
    }
    let tx;
    if (isUsdt) {
      const amount = ethers.parseUnits(amountStr, 6);
      const token = new ethers.Contract(CONFIG.MOCK_USDT_ADDRESS, ERC20_ABI, signer);
      const allowance = await token.allowance(account, CONFIG.AGENTPAY_ADDRESS);
      setMsg($("tipMsg"), `Sending ${amountStr} MockUSDT to ${name} (${shortAddr(owner)})… confirm in your wallet.`, false);
      if (allowance < amount) {
        const atx = await token.approve(CONFIG.AGENTPAY_ADDRESS, amount);
        setMsg($("tipMsg"), "MockUSDT Approve sent, waiting for confirmation… " + txLink(atx.hash), false);
        await atx.wait();
      }
      tx = await agentpay.tipToken(CONFIG.MOCK_USDT_ADDRESS, amount, name, memo);
    } else {
      setMsg($("tipMsg"), `Sending ${amountStr} tBNB to ${name} (${shortAddr(owner)})… confirm in your wallet.`, false);
      tx = await agentpay.tip(name, memo, { value: ethers.parseEther(amountStr) });
    }
    setMsg($("tipMsg"), "Tip sent, waiting for confirmation… " + txLink(tx.hash), false);
    const receipt = await tx.wait();
    setMsg($("tipMsg"), `Tip of ${amountStr} ${unit} to ${name} sent ✓ ${txLink(receipt.hash)}`, false);
  } catch (e) {
    setMsg($("tipMsg"), friendlyError(e), true);
  }
}

// ---- 3. Create invoice ----------------------------------------------------------
async function createClicked() {
  const name = $("invName").value.trim().toLowerCase();
  const amountStr = $("invAmount").value.trim();
  const tokenKind = $("invToken").value;
  const memo = $("invMemo").value.trim();
  if (!validAiName(name)) {
    setMsg($("createMsg"), "Invalid merchant name — it must end with .ai and belong to your wallet.", true);
    return;
  }
  if (!amountStr || Number(amountStr) <= 0) {
    setMsg($("createMsg"), "Enter an amount greater than 0.", true);
    return;
  }
  if (!account || !signer) {
    setMsg($("createMsg"), "Connect your wallet first to create an invoice.", true);
    return;
  }
  if (isPlaceholder()) {
    setMsg($("createMsg"), "Contract not deployed yet (placeholder address) — invoices can't be created. Try again after the final wiring.", true);
    return;
  }
  const token = tokenKind === "usdt" ? CONFIG.MOCK_USDT_ADDRESS : ZERO;
  if (tokenKind === "usdt" && token.toLowerCase() === ZERO) {
    setMsg($("createMsg"), "The MockUSDT address is still a placeholder — choose tBNB for now.", true);
    return;
  }
  setMsg($("createMsg"), "Checking your wallet's Agent ID…", false);
  try {
    const has = await agentpayRead.hasAgentId(account);
    if (!has) {
      setMsg($("createMsg"), "This wallet doesn't hold an Agent ID (.ai) — creating invoices is for Agent ID holders only.", true);
      return;
    }
    const [owner, ok] = await agentpayRead.resolveName(name);
    if (!ok || owner.toLowerCase() !== account.toLowerCase()) {
      setMsg($("createMsg"), `Name ${name} doesn't belong to this wallet — invoices can only be created under your own .ai name.`, true);
      return;
    }
    const amount = parseAmountForToken(amountStr, token);
    setMsg($("createMsg"), "Sending invoice… confirm in your wallet.", false);
    const tx = await agentpay.createInvoice(amount, token, memo, name);
    setMsg($("createMsg"), "Invoice sent, waiting for confirmation… " + txLink(tx.hash), false);
    const receipt = await tx.wait();
    let newId = null;
    try {
      for (const log of receipt.logs) {
        const parsed = agentpay.interface.parseLog(log);
        if (parsed && parsed.name === "InvoiceCreated") { newId = Number(parsed.args.id); break; }
      }
    } catch (e) { /* fallback below */ }
    if (newId === null) {
      try { newId = Number(await agentpayRead.invoiceCount()); } catch (e) { /* ignore */ }
    }
    setMsg($("createMsg"),
      `Invoice ${newId !== null ? "#" + newId : ""} created ✓ ${txLink(receipt.hash)}` +
      (newId !== null ? ` — share ID ${newId} with the customer.` : ""), false);
    refreshDashboard();
  } catch (e) {
    setMsg($("createMsg"), friendlyError(e), true);
  }
}

// ---- 4. Merchant dashboard ----------------------------------------------------
async function refreshDashboard() {
  const tbody = $("invTable");
  if (!account) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Connect your wallet, then reload.</td></tr>`;
    return;
  }
  if (isPlaceholder()) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Contract not deployed yet (placeholder address) — the dashboard can't be loaded.</td></tr>`;
    setMsg($("dashMsg"), "The dashboard activates after the final wiring.", false);
    return;
  }
  setMsg($("dashMsg"), "Loading invoices…", false);
  try {
    const count = Number(await agentpayRead.invoiceCount());
    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No invoices on this contract yet.</td></tr>`;
      setMsg($("dashMsg"), "No invoices yet.", false);
      return;
    }
    const rows = [];
    const start = Math.max(1, count - 99); // limit to the latest 100 (IDs are 1-based)
    for (let id = count; id >= start; id--) {
      const inv = await agentpayRead.getInvoice(id);
      if (inv[1].toLowerCase() !== account.toLowerCase()) continue;
      const paid = inv[6];
      rows.push(
        `<tr>
          <td>#${Number(inv[0])}</td>
          <td>${inv[2] || "—"}<br><span class="muted">${inv[5] || ""}</span></td>
          <td>${formatAmount(inv[3], inv[4])}<br><span class="muted">${tokenLabel(inv[4])}</span></td>
          <td>${paid ? '<span class="pill paid">Paid</span>' : '<span class="pill unpaid">Not yet</span>'}</td>
          <td>${paid ? addrLink(inv[7]) : "—"}</td>
          <td>${paid ? new Date(Number(inv[8]) * 1000).toLocaleString("en-US") : "—"}</td>
        </tr>`);
    }
    tbody.innerHTML = rows.join("") ||
      `<tr><td colspan="6" class="muted">This wallet hasn't created any invoices yet.</td></tr>`;
    setMsg($("dashMsg"), `Showing ${rows.length} invoices from this wallet (of ${count} total).`, false);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="err">Failed to load the dashboard.</td></tr>`;
    setMsg($("dashMsg"), friendlyError(e), true);
  }
}

if (typeof window.ethers !== "undefined") {
  init();
} else {
  // CDN failed — init still runs for the placeholder banner, but transaction
  // buttons will refuse with a clear message.
  document.addEventListener("DOMContentLoaded", () => {
    try { init(); } catch (e) { console.warn(e); }
  });
}
