// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentPay} from "../src/AgentPay.sol";
import {MockAgentIDRegistry} from "../src/MockAgentIDRegistry.sol";
import {MockUSDT} from "../src/MockUSDT.sol";

/// @notice Deploy AgentPay + mocks to BSC TESTNET (chain 97).
/// @dev TESTNET ONLY — the registry deployed here is a MOCK. On mainnet,
///      deploy AgentPay alone with the real SPACE ID registry
///      0x60b9262456de011f7d15a54cdd8c48baaa8b022f.
/// Usage:
///   PRIVATE_KEY=<muse-evm-key> forge script script/Deploy.s.sol \
///     --rpc-url bsc_testnet --broadcast
/// The deployer receives test Agent IDs ("agentpay.ai", "jennaifunds.ai",
/// "merchant-demo.ai") and 1,000,000 mUSDT for the demo.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        require(block.chainid == 97, "Deploy script is BSC TESTNET ONLY (chain 97)");

        vm.startBroadcast(deployerKey);
        MockAgentIDRegistry registry = new MockAgentIDRegistry();
        registry.mint("agentpay", deployer);
        registry.mint("jennaifunds", deployer);
        registry.mint("merchant-demo", deployer);
        MockUSDT usdt = new MockUSDT();
        usdt.mint(deployer, 1_000_000_000_000); // 1,000,000 mUSDT (6 decimals)
        AgentPay pay = new AgentPay(address(registry));
        vm.stopBroadcast();

        console.log("chainId:", block.chainid);
        console.log("deployer:", deployer);
        console.log("MockAgentIDRegistry:", address(registry));
        console.log("MockUSDT:", address(usdt));
        console.log("AgentPay:", address(pay));
    }
}
