// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title MockAgentIDRegistry — TESTNET / TEST ONLY
/// @notice Minimal ERC-721 stand-in for the SPACE ID Agent ID registry.
/// tokenId = uint256(keccak256(bytes(label))), label = name WITHOUT ".ai",
/// exactly like the real registry on BSC mainnet.
/// @dev NEVER deploy this on mainnet. On mainnet AgentPay takes the real
/// registry address (0x60b9262456de011f7d15a54cdd8c48baaa8b022f) instead.
contract MockAgentIDRegistry is ERC721 {
    constructor() ERC721("Mock Agent ID", "MAI") {}

    /// @notice Mint the Agent ID for `label` (e.g. "agentpay") to `to`.
    /// The full name is `label` + ".ai".
    function mint(string calldata label, address to) external returns (uint256 tokenId) {
        tokenId = uint256(keccak256(bytes(label)));
        _safeMint(to, tokenId);
    }

    /// @notice tokenId for a label (without ".ai").
    function tokenIdOf(string calldata label) external pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
}
