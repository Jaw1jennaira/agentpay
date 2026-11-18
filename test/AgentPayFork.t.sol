// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPay} from "../src/AgentPay.sol";

/// @notice Fork test against the REAL SPACE ID Agent ID registry on BSC
/// mainnet (chain 56). Run with:
///   forge test --fork-url https://bsc-dataseed1.defibit.io --match-contract AgentPayForkTest
/// Verified live 2026-11-19: tokenId = keccak256("jennairafunds") is owned
/// by the Binance wallet 0xE450bAA47f6B9529E8C4135C2D95E63c9dd9f746.
contract AgentPayForkTest is Test {
    address constant REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address constant BINANCE_WALLET = 0xE450bAA47f6B9529E8C4135C2D95E63c9dd9f746;
    address constant MUSE_EVM = 0xFdE48E9AcC441cBC726A88CFD05c859AE5A0b84e;

    AgentPay public pay;

    function setUp() public {
        pay = new AgentPay(REGISTRY);
    }

    function testForkResolveJennairafunds() public view {
        (address owner, bool ok) = pay.resolveName("jennairafunds.ai");
        assertTrue(ok, "jennairafunds.ai must resolve");
        assertEq(owner, BINANCE_WALLET);
    }

    function testForkHasAgentIdBinanceTrue() public view {
        assertTrue(pay.hasAgentId(BINANCE_WALLET));
    }

    function testForkHasAgentIdMuseFalse() public view {
        assertFalse(pay.hasAgentId(MUSE_EVM));
    }

    function testForkUnknownNameReturnsFalseNotRevert() public view {
        (address owner, bool ok) = pay.resolveName("definitely-not-a-real-agent-id-xyz.ai");
        assertFalse(ok);
        assertEq(owner, address(0));
    }

    function testForkTokenIdMatchesVerifiedValue() public view {
        uint256 expected = 96098118761522187127057456771445518540455688092902882723305172908584318355412;
        assertEq(pay.tokenIdOfName("jennairafunds.ai"), expected);
    }
}
