// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AgentPay} from "../src/AgentPay.sol";
import {MockAgentIDRegistry} from "../src/MockAgentIDRegistry.sol";
import {MockUSDT} from "../src/MockUSDT.sol";

/// @notice Malicious merchant that tries to re-enter payInvoice from its
/// receive() fallback to double-spend the same invoice.
contract ReentrantMerchant is IERC721Receiver {
    AgentPay public pay;
    uint256 public invoiceId;
    uint256 public reenterAttempts;

    constructor(AgentPay _pay) {
        pay = _pay;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function setTarget(uint256 _id) external {
        invoiceId = _id;
    }

    receive() external payable {
        reenterAttempts++;
        // Try to pay the same invoice again while the first payment is
        // still executing. Must fail (AlreadyPaid) or be blocked by the guard.
        try pay.payInvoice{value: 0}(invoiceId) {} catch {}
    }
}

contract AgentPayTest is Test {
    AgentPay public pay;
    MockAgentIDRegistry public registry;
    MockUSDT public usdt;

    address merchant = makeAddr("merchant");
    address payer = makeAddr("payer");
    address stranger = makeAddr("stranger"); // holds no Agent ID
    address otherHolder = makeAddr("otherHolder"); // holds a DIFFERENT name

    uint256 constant ONE_BNB = 1 ether;
    uint256 constant HUNDRED_USDT = 100_000_000; // 100 mUSDT, 6 decimals

    function setUp() public {
        registry = new MockAgentIDRegistry();
        usdt = new MockUSDT();
        pay = new AgentPay(address(registry));

        registry.mint("merchant-demo", merchant);
        registry.mint("other-name", otherHolder);

        vm.deal(merchant, 10 ether);
        vm.deal(payer, 10 ether);
        vm.deal(stranger, 10 ether);
        usdt.mint(payer, 1_000_000_000); // 1,000 mUSDT
        usdt.mint(merchant, 1_000_000_000);
    }

    // ---- Name resolution ----

    function testResolveNameKnown() public view {
        (address owner, bool ok) = pay.resolveName("merchant-demo.ai");
        assertTrue(ok);
        assertEq(owner, merchant);
    }

    function testResolveNameUnknownDoesNotRevert() public view {
        (address owner, bool ok) = pay.resolveName("no-such-name.ai");
        assertFalse(ok);
        assertEq(owner, address(0));
    }

    function testResolveNameBadSuffix() public view {
        (, bool ok1) = pay.resolveName("merchant-demo");
        (, bool ok2) = pay.resolveName("merchant-demo.AI");
        (, bool ok3) = pay.resolveName(".ai");
        (, bool ok4) = pay.resolveName("");
        assertFalse(ok1);
        assertFalse(ok2);
        assertFalse(ok3);
        assertFalse(ok4);
    }

    function testHasAgentId() public view {
        assertTrue(pay.hasAgentId(merchant));
        assertTrue(pay.hasAgentId(otherHolder));
        assertFalse(pay.hasAgentId(stranger));
        assertFalse(pay.hasAgentId(payer));
    }

    function testTokenIdDerivationMatchesRegistry() public view {
        uint256 expected = uint256(keccak256(bytes("merchant-demo")));
        assertEq(pay.tokenIdOfName("merchant-demo.ai"), expected);
        assertEq(registry.tokenIdOf("merchant-demo"), expected);
    }

    // ---- createInvoice ----

    function testCreateInvoiceSuccess() public {
        vm.prank(merchant);
        uint256 id = pay.createInvoice(ONE_BNB, address(0), "Kopi + hosting", "merchant-demo.ai");
        assertEq(id, 1);
        AgentPay.Invoice memory inv = pay.getInvoice(id);
        assertEq(inv.merchant, merchant);
        assertEq(inv.merchantName, "merchant-demo.ai");
        assertEq(inv.amount, ONE_BNB);
        assertEq(inv.token, address(0));
        assertFalse(inv.paid);
    }

    function testCreateInvoiceEmitsEvent() public {
        vm.prank(merchant);
        vm.expectEmit(true, true, false, true, address(pay));
        emit AgentPay.InvoiceCreated(1, merchant, "merchant-demo.ai", ONE_BNB, address(0), "Kopi");
        pay.createInvoice(ONE_BNB, address(0), "Kopi", "merchant-demo.ai");
    }

    function testCreateInvoiceRevertsWithoutAgentId() public {
        vm.prank(stranger);
        vm.expectRevert(AgentPay.NotAgentHolder.selector);
        pay.createInvoice(ONE_BNB, address(0), "x", "merchant-demo.ai");
    }

    function testCreateInvoiceRevertsWhenNameNotOwned() public {
        // otherHolder HAS an Agent ID, but not "merchant-demo.ai".
        vm.prank(otherHolder);
        vm.expectRevert(AgentPay.NameNotOwned.selector);
        pay.createInvoice(ONE_BNB, address(0), "x", "merchant-demo.ai");
        // merchant tries to use a name that does not exist at all.
        vm.prank(merchant);
        vm.expectRevert(AgentPay.NameNotOwned.selector);
        pay.createInvoice(ONE_BNB, address(0), "x", "ghost-name.ai");
    }

    function testCreateInvoiceRevertsZeroAmount() public {
        vm.prank(merchant);
        vm.expectRevert(AgentPay.ZeroAmount.selector);
        pay.createInvoice(0, address(0), "x", "merchant-demo.ai");
    }

    // ---- payInvoice: native ----

    function _nativeInvoice() internal returns (uint256 id) {
        vm.prank(merchant);
        id = pay.createInvoice(ONE_BNB, address(0), "Langganan", "merchant-demo.ai");
    }

    function testPayInvoiceNative() public {
        uint256 id = _nativeInvoice();
        uint256 before = merchant.balance;
        vm.prank(payer);
        pay.payInvoice{value: ONE_BNB}(id);
        AgentPay.Invoice memory inv = pay.getInvoice(id);
        assertTrue(inv.paid);
        assertEq(inv.payer, payer);
        assertGt(inv.paidAt, 0);
        assertEq(merchant.balance, before + ONE_BNB);
        assertEq(address(pay).balance, 0, "contract must never hold funds");
    }

    function testPayInvoiceNativeEmitsEvent() public {
        uint256 id = _nativeInvoice();
        vm.prank(payer);
        vm.expectEmit(true, true, true, true, address(pay));
        emit AgentPay.InvoicePaid(id, payer, merchant, "merchant-demo.ai", ONE_BNB, address(0));
        pay.payInvoice{value: ONE_BNB}(id);
    }

    function testPayInvoiceNativeWrongValueReverts() public {
        uint256 id = _nativeInvoice();
        vm.prank(payer);
        vm.expectRevert(AgentPay.WrongValue.selector);
        pay.payInvoice{value: 0.5 ether}(id);
    }

    function testPayInvoiceTwiceReverts() public {
        uint256 id = _nativeInvoice();
        vm.prank(payer);
        pay.payInvoice{value: ONE_BNB}(id);
        vm.prank(stranger);
        vm.expectRevert(AgentPay.AlreadyPaid.selector);
        pay.payInvoice{value: ONE_BNB}(id);
    }

    function testPayInvoiceUnknownReverts() public {
        vm.prank(payer);
        vm.expectRevert(AgentPay.InvoiceNotFound.selector);
        pay.payInvoice{value: ONE_BNB}(999);
    }

    function testPayInvoiceSelfPaymentReverts() public {
        uint256 id = _nativeInvoice();
        vm.prank(merchant);
        vm.expectRevert(AgentPay.SelfPayment.selector);
        pay.payInvoice{value: ONE_BNB}(id);
    }

    // ---- payInvoice: ERC-20 ----

    function testPayInvoiceERC20() public {
        vm.prank(merchant);
        uint256 id = pay.createInvoice(HUNDRED_USDT, address(usdt), "Lisensi", "merchant-demo.ai");
        vm.prank(payer);
        usdt.approve(address(pay), HUNDRED_USDT);
        uint256 before = usdt.balanceOf(merchant);
        vm.prank(payer);
        pay.payInvoice(id);
        assertEq(usdt.balanceOf(merchant), before + HUNDRED_USDT);
        assertTrue(pay.getInvoice(id).paid);
        assertEq(usdt.balanceOf(address(pay)), 0, "contract must never hold funds");
    }

    function testPayInvoiceERC20WithoutApprovalReverts() public {
        vm.prank(merchant);
        uint256 id = pay.createInvoice(HUNDRED_USDT, address(usdt), "Lisensi", "merchant-demo.ai");
        vm.prank(payer);
        vm.expectRevert();
        pay.payInvoice(id);
    }

    function testPayInvoiceERC20WithValueReverts() public {
        vm.prank(merchant);
        uint256 id = pay.createInvoice(HUNDRED_USDT, address(usdt), "Lisensi", "merchant-demo.ai");
        vm.prank(payer);
        usdt.approve(address(pay), HUNDRED_USDT);
        vm.prank(payer);
        vm.expectRevert(AgentPay.ValueNotAllowed.selector);
        pay.payInvoice{value: 0.1 ether}(id);
    }

    // ---- tip ----

    function testTipNativeByName() public {
        uint256 before = merchant.balance;
        vm.prank(payer);
        pay.tip{value: 0.25 ether}("merchant-demo.ai", "Terima kasih!");
        assertEq(merchant.balance, before + 0.25 ether);
        assertEq(address(pay).balance, 0);
    }

    function testTipNativeEmitsEvent() public {
        vm.prank(payer);
        vm.expectEmit(true, true, false, true, address(pay));
        emit AgentPay.TipSent(payer, merchant, "merchant-demo.ai", 0.25 ether, address(0), "Thanks");
        pay.tip{value: 0.25 ether}("merchant-demo.ai", "Thanks");
    }

    function testTipTokenERC20ByName() public {
        vm.prank(payer);
        usdt.approve(address(pay), HUNDRED_USDT);
        uint256 before = usdt.balanceOf(merchant);
        vm.prank(payer);
        pay.tipToken(address(usdt), HUNDRED_USDT, "merchant-demo.ai", "Tip USDT");
        assertEq(usdt.balanceOf(merchant), before + HUNDRED_USDT);
    }

    function testTipTokenUnknownNameReverts() public {
        vm.prank(payer);
        usdt.approve(address(pay), HUNDRED_USDT);
        vm.prank(payer);
        vm.expectRevert(AgentPay.NameNotFound.selector);
        pay.tipToken(address(usdt), HUNDRED_USDT, "ghost-name.ai", "hi");
    }

    function testTipUnknownNameReverts() public {
        vm.prank(payer);
        vm.expectRevert(AgentPay.NameNotFound.selector);
        pay.tip{value: 0.1 ether}("ghost-name.ai", "hi");
    }

    function testTipSelfReverts() public {
        vm.prank(merchant);
        vm.expectRevert(AgentPay.SelfPayment.selector);
        pay.tip{value: 0.1 ether}("merchant-demo.ai", "self");
    }

    function testTipZeroAmountReverts() public {
        vm.prank(payer);
        vm.expectRevert(AgentPay.ZeroAmount.selector);
        pay.tip{value: 0}("merchant-demo.ai", "zero");
    }

    // ---- Reentrancy ----

    function testReentrancyCannotDrainInvoice() public {
        // Deploy the attacker as the merchant: it holds an Agent ID and
        // creates an invoice, then tries to re-enter payInvoice from receive().
        ReentrantMerchant attacker = new ReentrantMerchant(pay);
        registry.mint("evil-merchant", address(attacker));
        vm.prank(address(attacker));
        uint256 id = pay.createInvoice(ONE_BNB, address(0), "Trap", "evil-merchant.ai");
        attacker.setTarget(id);

        uint256 before = address(attacker).balance;
        vm.prank(payer);
        pay.payInvoice{value: ONE_BNB}(id);

        // Exactly one payment landed, despite the re-entry attempt.
        assertEq(address(attacker).balance, before + ONE_BNB);
        assertTrue(pay.getInvoice(id).paid);
        assertGe(attacker.reenterAttempts(), 1, "attacker should have tried");
    }
}
