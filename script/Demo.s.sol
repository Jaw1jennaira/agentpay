// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentPay} from "../src/AgentPay.sol";

/// @notice On-chain demo on BSC TESTNET (chain 97), run AFTER Deploy.s.sol.
/// (a) deployer creates an invoice as "merchant-demo.ai" (0.01 tBNB),
/// (b) a fresh ephemeral payer account (funded 0.05 tBNB by the deployer)
///     pays that invoice,
/// (c) the same payer tips 0.005 tBNB to "agentpay.ai".
/// The merchant cannot pay its own invoice (SelfPayment), hence the
/// separate payer account — the payer key is derived on-chain from the
/// deploy tx context and printed so the txs can be traced on BscScan.
/// Usage:
///   AGENTPAY=<addr> PRIVATE_KEY=<key> \
///     forge script script/Demo.s.sol --rpc-url bsc_testnet --broadcast
contract Demo is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        AgentPay pay = AgentPay(vm.envAddress("AGENTPAY"));
        require(block.chainid == 97, "Demo script is BSC TESTNET ONLY (chain 97)");

        // Ephemeral payer key (testnet demo only, never reuse on mainnet).
        uint256 payerKey = uint256(keccak256(abi.encodePacked("agentpay-demo-payer", deployer)));
        address payer = vm.addr(payerKey);

        vm.startBroadcast(deployerKey);
        // (a) Invoice: 0.01 tBNB, merchant name "merchant-demo.ai".
        uint256 id = pay.createInvoice(0.01 ether, address(0), "Demo invoice - kopi", "merchant-demo.ai");
        console.log("invoice id:", id);
        // Fund the payer so it can pay + tip.
        (bool funded, ) = payable(payer).call{value: 0.05 ether}("");
        require(funded, "fund payer failed");
        vm.stopBroadcast();

        vm.startBroadcast(payerKey);
        // (b) Pay the invoice in native tBNB.
        pay.payInvoice{value: 0.01 ether}(id);
        console.log("invoice paid, id:", id);
        // (c) Tip 0.005 tBNB to "agentpay.ai".
        pay.tip{value: 0.005 ether}("agentpay.ai", "Demo tip - AgentPay works!");
        console.log("tip sent to agentpay.ai");
        vm.stopBroadcast();

        console.log("deployer:", deployer);
        console.log("payer:", payer);
        console.log("agentpay:", address(pay));
    }
}
