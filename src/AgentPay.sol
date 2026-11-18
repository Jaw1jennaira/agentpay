// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal view of the SPACE ID Agent ID registry (ERC-721).
/// @dev Mainnet (BSC chain 56): 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
///      name() = "SPACE ID Agent ID", symbol() = "AI".
///      tokenId = uint256(keccak256(bytes(label))) where label is the name
///      WITHOUT the ".ai" suffix. Verified live: keccak256("jennairafunds")
///      = 0xd4759b93...ed47d4, ownerOf = 0xE450bAA47f6B9529E8C4135C2D95E63c9dd9f746.
interface IAgentIDRegistry {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title AgentPay — pay anyone by their Agent ID (.ai name)
/// @notice Merchants that hold an Agent ID create invoices denominated in
/// native BNB (or tBNB on testnet) or any ERC-20. Anyone can pay an invoice
/// or tip a .ai name directly. Funds settle instantly to the merchant /
/// recipient — this contract NEVER holds funds, has no owner, no withdrawal
/// function, no selfdestruct and no arbitrary calls. There is nothing to
/// steal from it.
/// @dev MAINNET-READY: this file (AgentPay.sol) is the production contract.
///      MockAgentIDRegistry.sol and MockUSDT.sol are TESTNET/TEST ONLY —
///      on mainnet the constructor takes the real SPACE ID registry address
///      and real token addresses instead.
contract AgentPay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The Agent ID registry used for name resolution.
    /// Immutable, set once at deploy time.
    IAgentIDRegistry public immutable registry;

    uint256 public invoiceCount;

    struct Invoice {
        uint256 id;
        address merchant;
        string merchantName; // e.g. "merchant-demo.ai"
        uint256 amount;
        address token; // address(0) = native BNB / tBNB
        string memo;
        bool paid;
        address payer;
        uint256 paidAt;
    }

    mapping(uint256 => Invoice) public invoices;

    event InvoiceCreated(
        uint256 indexed id,
        address indexed merchant,
        string merchantName,
        uint256 amount,
        address token,
        string memo
    );
    event InvoicePaid(
        uint256 indexed id,
        address indexed payer,
        address indexed merchant,
        string merchantName,
        uint256 amount,
        address token
    );
    event TipSent(
        address indexed payer,
        address indexed recipient,
        string name,
        uint256 amount,
        address token,
        string memo
    );

    error InvalidName(); // missing ".ai" suffix or empty label
    error NameNotFound(); // no Agent ID token exists for this name
    error NotAgentHolder(); // caller holds no Agent ID
    error NameNotOwned(); // the .ai name does not belong to the caller
    error ZeroAmount();
    error InvoiceNotFound();
    error AlreadyPaid();
    error SelfPayment();
    error WrongValue(); // msg.value does not match a native payment
    error ValueNotAllowed(); // msg.value sent on an ERC-20 payment

    constructor(address _registry) {
        require(_registry != address(0), "registry zero");
        registry = IAgentIDRegistry(_registry);
    }

    // ------------------------------------------------------------------
    // Name resolution
    // ------------------------------------------------------------------

    /// @notice Resolve a ".ai" name to its owner's address.
    /// @dev ownerOf() REVERTS for a token that does not exist, so the call
    ///      is wrapped in try/catch: an unknown name returns (0, false)
    ///      instead of reverting.
    /// @return owner The Agent ID owner's address (address(0) when unknown).
    /// @return ok True when the name exists and has an owner.
    function resolveName(string memory name) public view returns (address owner, bool ok) {
        bytes memory b = bytes(name);
        // Must be at least "<1 char>.ai" = 4 bytes, ending in ".ai".
        if (b.length < 4) return (address(0), false);
        if (b[b.length - 3] != "." || b[b.length - 2] != "a" || b[b.length - 1] != "i") {
            return (address(0), false);
        }
        bytes memory label = new bytes(b.length - 3);
        for (uint256 i = 0; i < label.length; i++) {
            label[i] = b[i];
        }
        uint256 tokenId = uint256(keccak256(label));
        try registry.ownerOf(tokenId) returns (address o) {
            if (o == address(0)) return (address(0), false);
            return (o, true);
        } catch {
            return (address(0), false);
        }
    }

    /// @notice True when `account` holds at least one Agent ID.
    function hasAgentId(address account) public view returns (bool) {
        try registry.balanceOf(account) returns (uint256 bal) {
            return bal > 0;
        } catch {
            return false;
        }
    }

    /// @notice tokenId for a name (0 when the name is malformed).
    function tokenIdOfName(string memory name) public pure returns (uint256) {
        bytes memory b = bytes(name);
        if (b.length < 4) return 0;
        if (b[b.length - 3] != "." || b[b.length - 2] != "a" || b[b.length - 1] != "i") return 0;
        bytes memory label = new bytes(b.length - 3);
        for (uint256 i = 0; i < label.length; i++) {
            label[i] = b[i];
        }
        return uint256(keccak256(label));
    }

    // ------------------------------------------------------------------
    // Invoices
    // ------------------------------------------------------------------

    /// @notice Create an invoice. ONLY wallets holding an Agent ID, and the
    /// merchant name MUST belong to the caller (ownerOf(name) == msg.sender).
    /// The merchant address is stored at creation and never re-resolved at
    /// payment time, so a later name transfer cannot redirect funds.
    function createInvoice(
        uint256 amount,
        address token,
        string calldata memo,
        string calldata merchantName
    ) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (!hasAgentId(msg.sender)) revert NotAgentHolder();
        (address owner, bool ok) = resolveName(merchantName);
        if (!ok || owner != msg.sender) revert NameNotOwned();

        id = ++invoiceCount;
        invoices[id] = Invoice({
            id: id,
            merchant: msg.sender,
            merchantName: merchantName,
            amount: amount,
            token: token,
            memo: memo,
            paid: false,
            payer: address(0),
            paidAt: 0
        });
        emit InvoiceCreated(id, msg.sender, merchantName, amount, token, memo);
    }

    /// @notice Pay an invoice. Native: send exactly `amount` as msg.value.
    /// ERC-20: approve this contract for `amount` first, send no value.
    /// Funds go payer -> merchant directly; the contract holds nothing.
    function payInvoice(uint256 id) external payable nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.merchant == address(0)) revert InvoiceNotFound();
        if (inv.paid) revert AlreadyPaid();
        if (msg.sender == inv.merchant) revert SelfPayment();
        // Validate payment shape BEFORE any state change (checks first).
        if (inv.token == address(0)) {
            if (msg.value != inv.amount) revert WrongValue();
        } else {
            if (msg.value != 0) revert ValueNotAllowed();
        }

        // Effects: mark paid BEFORE moving funds.
        inv.paid = true;
        inv.payer = msg.sender;
        inv.paidAt = block.timestamp;
        emit InvoicePaid(id, msg.sender, inv.merchant, inv.merchantName, inv.amount, inv.token);

        if (inv.token == address(0)) {
            (bool sent, ) = payable(inv.merchant).call{value: inv.amount}("");
            require(sent, "native transfer failed");
        } else {
            IERC20(inv.token).safeTransferFrom(msg.sender, inv.merchant, inv.amount);
        }
    }

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        if (invoices[id].merchant == address(0)) revert InvoiceNotFound();
        return invoices[id];
    }

    // ------------------------------------------------------------------
    // Tips (second payment flow: pay any .ai name directly)
    // ------------------------------------------------------------------

    /// @notice Tip a .ai name directly in NATIVE BNB/tBNB.
    /// `msg.value` is the tip amount. Funds go payer -> name owner directly;
    /// the contract holds nothing. For an ERC-20 tip use `tipToken`.
    function tip(string calldata name, string calldata memo) external payable nonReentrant {
        (address recipient, bool ok) = resolveName(name);
        if (!ok) revert NameNotFound();
        if (msg.sender == recipient) revert SelfPayment();
        if (msg.value == 0) revert ZeroAmount();
        emit TipSent(msg.sender, recipient, name, msg.value, address(0), memo);
        (bool sent, ) = payable(recipient).call{value: msg.value}("");
        require(sent, "native transfer failed");
    }

    /// @notice Tip a .ai name directly in an ERC-20 token. Approve this
    /// contract for `amount` first, send no native value. Funds go
    /// payer -> name owner directly; the contract holds nothing.
    function tipToken(
        address token,
        uint256 amount,
        string calldata name,
        string calldata memo
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (token == address(0)) revert ValueNotAllowed();
        (address recipient, bool ok) = resolveName(name);
        if (!ok) revert NameNotFound();
        if (msg.sender == recipient) revert SelfPayment();
        emit TipSent(msg.sender, recipient, name, amount, token, memo);
        IERC20(token).safeTransferFrom(msg.sender, recipient, amount);
    }
}
