// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockArchetypeMarketplace {
  bool public shouldRevert;
  address public test__lastToken;
  uint256 public test__enableCalls;

  function test__setShouldRevert(bool value) external {
    shouldRevert = value;
  }

  function enableRoyalty(address tokenAddress) external {
    if (shouldRevert) {
      revert("mock-revert");
    }

    test__lastToken = tokenAddress;
    test__enableCalls += 1;
  }
}
