// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "./ArtongNFT.sol";
import "./Enums.sol";

contract ArtongNFTFactory is Ownable {
    event ContractCreated(
        address creator,
        address nft,
        string name,
        string symbol,
        uint256 maxAmount,
        Policy policy
    );
    event ContractRegistered(address creator, address nft);
    event ContractDisabled(address caller, address nft);

    address public marketplace;

    uint16 public platformFee;

    address payable public feeRecipient;

    address[] public clonedContracts;

    address private immutable artongNFTBeacon;

    constructor(
        address _marketplace,
        address payable _feeRecipient,
        uint16 _platformFee,
        address _beacon
    ) {
        marketplace = _marketplace;
        feeRecipient = _feeRecipient;
        platformFee = _platformFee;
        artongNFTBeacon = address(_beacon);
    }

    function updateMarketplace(address _marketplace) external onlyOwner {
        marketplace = _marketplace;
    }

    function updatePlatformFee(uint16 _platformFee) external onlyOwner {
        platformFee = _platformFee;
    }

    function updateFeeRecipient(address payable _feeRecipient)
        external
        onlyOwner
    {
        feeRecipient = _feeRecipient;
    }

    /// @notice Method for deploy new ArtongNFT contract
    /// @param _name Name of NFT contract
    /// @param _symbol Symbol of NFT contract
    function createNFTContract(
      string memory _name,
      string memory _symbol,
      uint256 _maxAmount,
      Policy _policy
    )
        external
        payable
        returns (address)
    {
        BeaconProxy proxy = new BeaconProxy(
            artongNFTBeacon,
            abi.encodeWithSelector(
                ArtongNFT(address(0)).initialize.selector,
                _name,
                _symbol,
                marketplace,
                platformFee,
                feeRecipient,
                _maxAmount,
                _policy,
                msg.sender
            )
        );

        clonedContracts.push(address(proxy));

        emit ContractCreated(
            msg.sender,
            address(proxy),
            _name,
            _symbol,
            _maxAmount,
            _policy
        );
        return address(proxy);
    }

    function getClonedContracts() external view returns (address[] memory) {
        return clonedContracts;
    }
}