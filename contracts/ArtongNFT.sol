// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ArtongNFT is ERC721, Ownable {
    event Minted(
        uint256 tokenId,
        address targetOwner,
        string tokenUri,
        address minter
    );
    event UpdatePlatformFee(
        uint256 platformFee
    );
    event UpdateFeeRecipient(
        address payable feeRecipient
    );

    address marketplace;
    uint256 public platformFee;
    address payable public feeReceipient;

    constructor(
        string memory _name,
        string memory _symbol,
        address _marketplace,
        uint256 _platformFee,
        address payable _feeReceipient
    ) ERC721(_name, _symbol) {
        marketplace = _marketplace;
        platformFee = _platformFee;
        feeReceipient = _feeReceipient;
    }

    // @notice Method for updating platform fee
    // @dev Only admin
    // @param _platformFee uint256 the platform fee to set
    function updatePlatformFee(uint256 _platformFee) external onlyOwner {
        platformFee = _platformFee;
        emit UpdatePlatformFee(_platformFee);
    }

    // 1. tokenId Counter 적용 여부 결정하기!
    // 2. Factory에서 new ArtongNFT 해주고 transferOwnership 하는게 맞을까?
    // 3. owner가 할수 있는 일 정하자. minting을 유보하고 여부를 결정할 수 있을까? lazy minting 써야할까?
}