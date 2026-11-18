// AgentPay — frontend config (single source of truth for addresses).
// BSC TESTNET only (chain 97). NEVER point this at mainnet.
//
// STATUS (2026-11-19): the testnet contracts have NOT been deployed yet
// (deployer tBNB balance is 0 — faucet is being handled separately).
// All contract addresses below are placeholders (0x000...0) on purpose.
// Fill them from deployments.json once the contract builder delivers it,
// then re-verify the live demo end-to-end. The UI detects placeholder
// addresses and disables on-chain actions with a clear message until then.

const CONFIG = {
  // Chain: BNB Smart Chain Testnet
  CHAIN_ID: 97,
  CHAIN_ID_HEX: "0x61",
  CHAIN_NAME: "BNB Smart Chain Testnet",
  RPC_URL: "https://bsc-testnet-rpc.publicnode.com",
  EXPLORER: "https://testnet.bscscan.com",
  NATIVE_SYMBOL: "tBNB",
  NATIVE_DECIMALS: 18,

  // TODO (wiring final): isi dari deployments.json
  AGENTPAY_ADDRESS: "0x0000000000000000000000000000000000000000",
  MOCK_USDT_ADDRESS: "0x0000000000000000000000000000000000000000",
  // Testnet Agent ID registry is a MOCK (SPACE ID registry lives on mainnet).
  REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000000",

  // SPACE ID Agent ID registry on BNB mainnet (reference only — NOT used on testnet).
  REGISTRY_MAINNET: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",

  // Demo merchant shown as an example on the page (NOT hardcoded as active merchant).
  DEMO_MERCHANT_NAME: "jennirafunds.ai",
};

// AgentPay ABI — built against the contract spec (2026-11-19).
// If the final ABI from the contract builder differs slightly
// (e.g. different getter/function names), update this ABI to match it.
const AGENTPAY_ABI = [
  "function resolveName(string name) view returns (address owner, bool ok)",
  "function hasAgentId(address wallet) view returns (bool)",
  "function createInvoice(uint256 amount, address token, string memo, string merchantName)",
  "function getInvoice(uint256 id) view returns (uint256 id, address merchant, string merchantName, uint256 amount, address token, string memo, bool paid, address payer, uint256 paidAt)",
  "function invoices(uint256 id) view returns (uint256 id, address merchant, string merchantName, uint256 amount, address token, string memo, bool paid, address payer, uint256 paidAt)",
  "function invoiceCount() view returns (uint256)",
  "function payInvoice(uint256 id) payable",
  "function tip(string name, string memo) payable",
  "function tipToken(address token, uint256 amount, string name, string memo)",
  "event InvoiceCreated(uint256 id, address merchant, string merchantName, uint256 amount, address token, string memo)",
  "event InvoicePaid(uint256 id, address payer, address merchant, string merchantName, uint256 amount, address token)",
  "event TipSent(address payer, address recipient, string name, uint256 amount, address token, string memo)",
];

// Minimal ERC20 ABI (MockUSDT is 6 decimals).
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address a) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
