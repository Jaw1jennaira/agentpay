// AgentPay — frontend config (single source of truth for addresses).
// BSC TESTNET only (chain 97). NEVER point this at mainnet.
//
// STATUS (2026-11-19 ~03:10 WIB): contracts DEPLOYED on BSC testnet + demo
// on-chain OK (invoice #1 paid, tip sent). Addresses below filled from
// deployments.json. Sourcify verification still PENDING (retry separately).

const CONFIG = {
  // Chain: BNB Smart Chain Testnet
  CHAIN_ID: 97,
  CHAIN_ID_HEX: "0x61",
  CHAIN_NAME: "BNB Smart Chain Testnet",
  RPC_URL: "https://bsc-testnet-rpc.publicnode.com",
  EXPLORER: "https://testnet.bscscan.com",
  NATIVE_SYMBOL: "tBNB",
  NATIVE_DECIMALS: 18,

  // Wired 2026-11-19 ~03:10 WIB from deployments.json (testnet deploy OK).
  AGENTPAY_ADDRESS: "0x2882D2406B660cF697221c52C616992bD6d0539f",
  MOCK_USDT_ADDRESS: "0x88b8Aee182D2de2B62a0e0a458006608B2bA9b46",
  // Testnet Agent ID registry is a MOCK (SPACE ID registry lives on mainnet).
  REGISTRY_ADDRESS: "0x2eF0A9708182eB988f20C0C278224908e0Bc2FA9",

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
  "function getInvoice(uint256 id) view returns (tuple(uint256 id, address merchant, string merchantName, uint256 amount, address token, string memo, bool paid, address payer, uint256 paidAt))",
  "function invoices(uint256 id) view returns (tuple(uint256 id, address merchant, string merchantName, uint256 amount, address token, string memo, bool paid, address payer, uint256 paidAt))",
  "function invoiceCount() view returns (uint256)",
  "function payInvoice(uint256 id) payable",
  "function tip(string name, string memo) payable",
  "function tipToken(address token, uint256 amount, string name, string memo)",
  "event InvoiceCreated(uint256 indexed id, address indexed merchant, string merchantName, uint256 amount, address token, string memo)",
  "event InvoicePaid(uint256 indexed id, address indexed payer, address indexed merchant, string merchantName, uint256 amount, address token)",
  "event TipSent(address indexed payer, address indexed recipient, string name, uint256 amount, address token, string memo)",
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
