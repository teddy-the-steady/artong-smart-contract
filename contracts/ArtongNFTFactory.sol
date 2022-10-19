// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
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

    /// @notice NFT Address => Bool
    mapping(address => bool) public exists;

    Policy public policy;

    uint256 public maxAmount;

    constructor(
        address _marketplace,
        address payable _feeRecipient,
        uint16 _platformFee
    ) {
        marketplace = _marketplace;
        feeRecipient = _feeRecipient;
        platformFee = _platformFee;
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
        ArtongNFT nft = new ArtongNFT(
            _name,
            _symbol,
            marketplace,
            platformFee,
            feeRecipient,
            _maxAmount,
            _policy
        );
        exists[address(nft)] = true;
        nft.transferOwnership(msg.sender);
        emit ContractCreated(
            msg.sender,
            address(nft),
            _name,
            _symbol,
            _maxAmount,
            _policy
        );
        return address(nft);
    }

    /// @notice Method for registering existing ArtongNFT contract
    /// @param  tokenContractAddress Address of NFT contract
    function registerTokenContract(address tokenContractAddress)
        external
        onlyOwner
    {
        require(!exists[tokenContractAddress], "NFT contract already registered");
        require(IERC165(tokenContractAddress).supportsInterface(type(IERC721).interfaceId), "Not an ERC721 contract");
        exists[tokenContractAddress] = true;
        emit ContractRegistered(msg.sender, tokenContractAddress);
    }

    /// @notice Method for disabling existing ArtongNFT contract
    /// @param  tokenContractAddress Address of NFT contract
    function disableTokenContract(address tokenContractAddress)
        external
        onlyOwner
    {
        require(exists[tokenContractAddress], "NFT contract is not registered");
        exists[tokenContractAddress] = false;
        emit ContractDisabled(msg.sender, tokenContractAddress);
    }
}