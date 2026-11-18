# AgentPay — pay to an Agent ID (.ai) name, not a 0x address

> **Tagline:** Pay to an Agent ID (.ai) name, not a 0x address.

AgentPay is a payment gateway + tipping app for holders of **SPACE ID Agent ID
(.ai)** names on BNB Chain. A merchant creates an invoice under their `.ai`
name; a customer pays it in native BNB or ERC20 without ever copying a
40-character hex address. Anyone can tip any `.ai` name directly. Invoice
creation is gated to Agent ID holders — on-chain, in the contract, and in the
UI.

Built for the **Agent ID Hackathon** (BNB Chain + Binance Wallet), GAWE #198.
Testnet only for now — no mainnet deployment yet.

---

## The problem

Crypto payments still ask humans to copy-paste `0x…` addresses. One wrong
character means lost funds, and there is no human-readable identity attached
to a payment. Agent ID (`.ai` names on BNB Chain) already gives every agent
and builder a readable on-chain identity — but almost nothing lets you **pay**
that identity.

## The solution

AgentPay resolves `.ai` names on-chain and turns them into a usable payment
rail:

- **Pay an invoice** — the customer loads an invoice by ID, the UI shows the
  merchant's resolved `.ai` name, amount, token and memo, then pays in native
  BNB or ERC20 (with an Approve step first when needed).
- **Tip a name** — send native BNB to any `.ai` name + a memo, resolved
  on-chain before sending.
- **Merchant invoices** — only wallets holding an Agent ID can create
  invoices (`hasAgentId` check in the UI *and* enforced by the contract).
  The invoice carries the merchant's `.ai` name.
- **Merchant dashboard** — every invoice created by the connected wallet,
  with Paid/Unpaid status, amount, token, memo, payer, and payment time.

No custody: funds move wallet-to-wallet through the `AgentPay` contract.
No backend, no server, no private key ever touches this repo.

## Features

| Feature | What it does |
|---|---|
| Pay invoice | Resolve `.ai` name on-chain, load invoice by ID, pay native or ERC20 (Approve → Pay), BscScan tx link |
| Tip | Native tip to any `.ai` name + memo, owner address shown before sending |
| Create invoice | Amount + token (tBNB / MockUSDT) + memo + merchant `.ai` name; gated by `hasAgentId` |
| Merchant dashboard | Lists own invoices (`invoiceCount` + `getInvoice`), status, payer, paid time |
| Connect wallet | MetaMask / injected provider, balance + Agent ID status, switch-to-BSC-Testnet button |
| Human errors | Friendly messages for: name not found, insufficient balance, rejected tx, wrong network |

## Architecture

```
┌─────────────────────────────┐
│  Frontend (static, no build)│
│  GitHub Pages               │
│  index.html + app.js +      │
│  config.js (ethers v6 CDN)  │
└──────────────┬──────────────┘
               │ ethers v6 — reads via public RPC,
               │ writes via connected wallet
               ▼
┌─────────────────────────────┐
│  AgentPay.sol (BSC Testnet) │
│  - resolveName(name)        │
│  - hasAgentId(wallet)       │
│  - createInvoice(...)       │
│  - payInvoice(id) payable   │
│  - tip(name, memo) payable  │
│  - getInvoice(id) / invoices│
│  - invoiceCount()           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  SPACE ID Agent ID registry │
│  (mainnet 0x60b9262456de011f7d15a54cdd8c48baaa8b022f) │
│  Testnet: a MOCK registry is used instead — the real │
│  registry is mainnet-only, so a mock with the same  │
│  interface (ownerOf / balanceOf) stands in for it   │
│  on BSC Testnet.                                    │
└─────────────────────────────┘
        + MockUSDT (ERC20, 6 decimals) for token payments demo
```

- **Chain:** BNB Smart Chain Testnet (chain 97, `0x61`),
  RPC `https://bsc-testnet-rpc.publicnode.com`,
  explorer `https://testnet.bscscan.com`.
- **Frontend:** vanilla HTML + JS, no build step, no heavy framework.
  `ethers@6.13.0` via jsDelivr CDN (pinned) with a clear error banner if
  the CDN fails to load.
- **Config:** all addresses live in one file, `frontend/config.js`
  (`AGENTPAY_ADDRESS`, `MOCK_USDT_ADDRESS`, `REGISTRY_ADDRESS`, `RPC_URL`,
  `CHAIN_ID`). Until the final wiring they are placeholders
  (`0x000…000`) and the UI runs in a clearly-labelled preview mode with
  on-chain actions disabled.

### Contract interface (as built against)

```solidity
resolveName(string name) -> (address owner, bool ok)   // name must end in ".ai"
hasAgentId(address wallet) -> bool                     // registry.balanceOf > 0
createInvoice(uint256 amount, address token, string memo, string merchantName)
getInvoice(uint256 id) -> (id, merchant, merchantName, amount, token, memo,
                           paid, payer, paidAt)
invoices(uint256 id) -> (same as getInvoice)
invoiceCount() -> uint256
payInvoice(uint256 id) payable                          // native: msg.value == amount;
                                                        // ERC20: approve + transferFrom
tip(string name, string memo) payable                   // native tip to .ai owner
```

`token == address(0)` means native BNB/tBNB. `tip` is native-only in the
current spec (there is no `tipToken` in the ABI — if the final ABI adds one,
the UI will offer token tips too). Events: `InvoiceCreated`, `InvoicePaid`,
`TipSent`.

## Run locally

```bash
# any static server works — no build step
cd frontend
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `frontend/index.html` directly in a browser (wallet injection
still works; some browsers restrict `file://` + CDN — prefer the server).

## Demo end-to-end (testnet)

Prerequisites: MetaMask on **BSC Testnet** (chain 97) with tBNB from the
faucet, and (for the merchant role) a wallet holding an Agent ID.

1. **Connect** — click *Connect MetaMask*, switch to BSC Testnet if asked.
   The page shows your address, tBNB balance, and Agent ID status.
2. **Merchant creates an invoice** — tab *Buat Invoice*: merchant `.ai`
   name (must belong to the connected wallet), amount, token (tBNB or
   MockUSDT), memo → *Buat invoice*. Note the invoice ID.
   Example merchant name: `jennirafunds.ai` (the user's Agent ID — shown as
   an example on the page, not hardcoded as the active merchant).
3. **Customer pays** — tab *Bayar*: check the merchant `.ai` name first
   (the resolved owner address is shown), load the invoice by ID, then
   *Approve* (MockUSDT only) → *Bayar*. The BscScan testnet tx link appears
   on success.
4. **Tip** — tab *Tip*: any `.ai` name + tBNB amount + memo → send.
5. **Dashboard** — tab *Dashboard Merchant*: the merchant sees the invoice
   flip to *Dibayar* with the payer address and payment time.

## Testnet status

| Item | Status |
|---|---|
| AgentPay contract | **Not deployed yet** — deployer tBNB balance is 0, faucet in progress (separate track). Addresses in `frontend/config.js` are placeholders until `deployments.json` lands. |
| Mock Agent ID registry | To be deployed with the contracts (testnet mock). |
| MockUSDT (6 decimals) | To be deployed with the contracts. |
| Frontend | Done — live on GitHub Pages (see below). |
| Final wiring | Pending: once the contract builder delivers `deployments.json` + final ABI, `config.js` is updated, the demo is re-run live (create invoice → pay → tip), and this table is filled in. |

**Live demo:** https://jaw1jennaira.github.io/agentpay/

**How to verify:**
- Open the Pages URL — the page loads with the AgentPay title, tabs
  (Bayar / Tip / Buat Invoice / Dashboard), and a preview-mode banner while
  contracts are placeholders.
- After wiring: connect a wallet on BSC Testnet, run the 5-step demo above,
  and check each tx on `testnet.bscscan.com`.
- Contract source: `src/` (+ `deployments.json` once deployed) in this repo.

## Mapping to judging criteria (Innovation Award)

| Criterion | Weight | How AgentPay maps |
|---|---|---|
| Agent ID Application Depth | 30% | `.ai` names are the core primitive, not a label: on-chain `resolveName` before every payment/tip, `hasAgentId` gating on invoice creation (UI + contract), merchant `.ai` name stored on every invoice and shown on the dashboard |
| Practicality & Feasibility | 25% | Solves a real pain (paying a readable name instead of a 0x address) with the smallest possible surface: one contract + static frontend, testnet-verifiable today, mainnet-ready by swapping the registry address |
| Product Completion | 25% | Full loop shipped: connect → create → pay (native + ERC20) → tip → dashboard; friendly error handling; live on GitHub Pages; README + demo script |
| Innovation | 20% | Turns an identity NFT into a payment rail — invoices and tips addressed to a *name*, with Agent ID ownership as the merchant credential |

## Roadmap / remaining

- [ ] Testnet deploy (blocked on deployer tBNB — faucet track) → fill
      `deployments.json`, wire `config.js`, re-verify live demo.
- [ ] Final ABI check — adapt UI if the builder's ABI differs slightly
      (e.g. getter/function names, `tipToken` if added).
- [ ] Mainnet deploy (needs real BNB) — swap registry to the real SPACE ID
      address `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`.
- [ ] Collect ~30 Agent ID addresses for the merchant directory / demo list.
- [ ] Submit the hackathon form — **do NOT submit yet** (deliberately
      deferred until the testnet demo is verified live).

## Security notes

- Non-custodial: the frontend never asks for, stores, or transmits a
  private key or seed phrase. If anything ever asks you for one, it is a
  scam.
- Always verify the resolved owner address on-screen before confirming a
  payment in your wallet.
- This is a hackathon testnet demo, not audited production code. Do not use
  it with mainnet funds until the mainnet deploy + review are done.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Jaw1jennaira.

---

## Ringkasan Indonesia (singkat)

**AgentPay** — bayar ke nama Agent ID (.ai), bukan alamat 0x. Merchant
(pemegang Agent ID) membuat invoice atas nama `.ai`-nya; customer membayar
dengan tBNB atau MockUSDT; siapa pun bisa kirim tip ke nama `.ai` mana pun;
dashboard merchant menampilkan semua invoice beserta status dan payer.
Frontend statis (HTML + JS vanilla, ethers v6) di GitHub Pages, kontrak di
BSC Testnet (chain 97). Kontrak testnet belum di-deploy (menunggu tBNB
faucet) — alamat di `frontend/config.js` masih placeholder sampai wiring
final dari `deployments.json`. Jangan submit form hackathon sebelum demo
testnet terverifikasi live.
