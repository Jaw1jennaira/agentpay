// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDT — TESTNET / TEST ONLY
/// @notice 6-decimal ERC-20 stand-in for USDT on BSC testnet, for demoing
/// ERC-20 invoice payments and tips. Anyone can mint in tests/testnet.
/// @dev NEVER deploy this on mainnet. On mainnet use the real USDT address.
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
