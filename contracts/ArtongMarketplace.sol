// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract ArtongMarketplace is Initializable {
  address private owner;

  function initialize(address _owner) initializer public {
    owner = _owner;
  }
}