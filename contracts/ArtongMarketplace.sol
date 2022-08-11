// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IArtongNFT {
    function setPendingWithdrawal(address) external payable;
}

contract ArtongMarketplace is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    event ItemListed(
        address indexed owner,
        address indexed nft,
        uint256 tokenId,
        uint256 price
    );
    event ItemSold(
        address indexed seller,
        address indexed buyer,
        address indexed nft,
        uint256 tokenId,
        uint256 price
    );
    event ItemUpdated(
        address indexed owner,
        address indexed nft,
        uint256 tokenId,
        uint256 newPrice
    );
    event ItemCanceled(
        address indexed owner,
        address indexed nft,
        uint256 tokenId
    );
    event OfferCreated(
        address indexed creator,
        address indexed nft,
        uint256 tokenId,
        uint256 price,
        uint256 deadline
    );
    event OfferCanceled(
        address indexed creator,
        address indexed nft,
        uint256 tokenId
    );
    event UpdatePlatformFee(uint16 platformFee);
    event UpdatePlatformFeeRecipient(address payable platformFeeRecipient);

    struct Offer {
        uint256 price;
        uint256 deadline;
    }

    struct CollectionRoyalty {
        uint16 royalty; // 2 decimals(525->5.25)
        uint256 royaltyBalance;
    }

    struct TokenRoyalty {
        uint16 royalty; // 2 decimals(525->5.25)
        uint256 royaltyBalance;
    }

    uint16 public platformFee; // 2 decimals(525->5.25)

    address payable public feeReceipient;

    /// @notice NftAddress -> Token ID -> Minter
    mapping(address => mapping(uint256 => address)) public minters;

    /// @notice NftAddress -> Token ID -> Owner -> Listing item price
    mapping(address => mapping(uint256 => mapping(address => uint256)))
        public listingPrices;

    /// @notice NftAddress -> Token ID -> Offerer -> Offer
    mapping(address => mapping(uint256 => mapping(address => Offer)))
        public offers;

    /// @notice NftAddress -> CollectionRoyalty
    mapping(address => CollectionRoyalty) public collectionRoyalties;

    /// @notice Minter -> TokenRoyalty
    mapping(address => TokenRoyalty) public tokenRoyalties;

    // IFantomAddressRegistry public addressRegistry; for other known contracts

    modifier isListed(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) {
        uint256 listingPrice = listingPrices[_nftAddress][_tokenId][_owner];
        require(listingPrice > 0, "not listed item");
        _;
    }

    modifier notListed(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) {
        uint256 listingPrice = listingPrices[_nftAddress][_tokenId][_owner];
        require(listingPrice == 0, "already listed");
        _;
    }

    modifier offerExists(
        address _nftAddress,
        uint256 _tokenId,
        address _offeror
    ) {
        Offer memory offer = offers[_nftAddress][_tokenId][_offeror];
        require(
            offer.price > 0 && offer.deadline > _getNow(),
            "offer not exists or expired"
        );
        _;
    }

    modifier offerNotExists(
        address _nftAddress,
        uint256 _tokenId,
        address _offeror
    ) {
        Offer memory offer = offers[_nftAddress][_tokenId][_offeror];
        require(
            offer.price == 0 || offer.deadline <= _getNow(),
            "offer already created"
        );
        _;
    }

    function initialize(uint16 _platformFee, address payable _feeRecipient)
        public
        initializer
    {
        platformFee = _platformFee;
        feeReceipient = _feeRecipient;

        __Ownable_init();
        __ReentrancyGuard_init();
    }

    /// @notice Method for listing NFT
    /// @param _nftAddress Address of NFT contract
    /// @param _tokenId Token ID of NFT
    /// @param _price sale price
    function listItem(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _price
    ) external notListed(_nftAddress, _tokenId, msg.sender) {
        if (IERC165(_nftAddress).supportsInterface(type(IERC721).interfaceId)) {
            IERC721 nft = IERC721(_nftAddress);
            require(nft.ownerOf(_tokenId) == msg.sender, "not owning item");
            require(
                nft.isApprovedForAll(msg.sender, address(this)),
                "artong not approved for this item"
            );
            // TODO] 보안 측면에서 허들을 두는게 좋을까? nft를 통째로 address import 한다고 해도
            // setApprovalForAll 안해주면 여기서 걸릴텐데.. 오픈씨는 어떻게 하는거지? 리스팅 하기 전에 setApprovalForAll?
        } else {
            revert("invalid nft address");
        }

        listingPrices[_nftAddress][_tokenId][msg.sender] = _price;
        emit ItemListed(
            msg.sender,
            _nftAddress,
            _tokenId,
            _price
        );
    }

    /// @notice Method for canceling listed NFT
    function cancelListing(address _nftAddress, uint256 _tokenId)
        external
        nonReentrant
        isListed(_nftAddress, _tokenId, msg.sender)
    {
        _validOwner(_nftAddress, _tokenId, msg.sender);
        _cancelListing(_nftAddress, _tokenId, msg.sender);
    }

    /// @notice Method for updating listed NFT
    /// @param _nftAddress Address of NFT contract
    /// @param _tokenId Token ID of NFT
    /// @param _newPrice New sale price
    function updateListing(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _newPrice
    ) external nonReentrant isListed(_nftAddress, _tokenId, _msgSender()) {
        _validOwner(_nftAddress, _tokenId, msg.sender);

        listingPrices[_nftAddress][_tokenId][msg.sender] = _newPrice;
        emit ItemUpdated(
            msg.sender,
            _nftAddress,
            _tokenId,
            _newPrice
        );
    }

    /// @notice Method for buying listed NFT
    /// @param _nftAddress NFT contract address
    /// @param _tokenId TokenId
    function buyItem(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    )
        external
        nonReentrant
        isListed(_nftAddress, _tokenId, _owner)
    {
        _validOwner(_nftAddress, _tokenId, _owner);

        uint256 price = listingPrices[_nftAddress][_tokenId][_owner];
        uint256 feeAmount = _calculateFeeAmount(price, platformFee);

        // Send fee to feeReceipient
        (bool success,) = feeReceipient.call{value : feeAmount}("");
        require(success, "Transfer failed");

        address minter = minters[_nftAddress][_tokenId];
        TokenRoyalty memory tokenRoyalty = tokenRoyalties[_owner];

        if (minter != address(0) && tokenRoyalty.royalty != 0) {
            uint256 royaltyFeeAmount = _calculateFeeAmount(price, tokenRoyalty.royalty);
            tokenRoyalty.royaltyBalance += royaltyFeeAmount;
            feeAmount += royaltyFeeAmount;
        }

        CollectionRoyalty memory collectionRoyalty = collectionRoyalties[_nftAddress];

        if (minter != address(0) && collectionRoyalty.royalty != 0) {
            uint256 collectionRoyaltyFeeAmount = _calculateFeeAmount(price,collectionRoyalty.royalty);
            collectionRoyalty.royaltyBalance += collectionRoyaltyFeeAmount;
            feeAmount += collectionRoyaltyFeeAmount;
        }

        // Send sold amount to seller(extract fee) TODO] ArtongNFT case / external NFT case
        IArtongNFT(_nftAddress).setPendingWithdrawal{value: price - feeAmount}(_owner);

        // Transfer NFT to buyer
        if (IERC165(_nftAddress).supportsInterface(type(IERC721).interfaceId)) {
            IERC721(_nftAddress).safeTransferFrom(_owner, msg.sender, _tokenId);
        }

        emit ItemSold(
            _owner,
            msg.sender,
            _nftAddress,
            _tokenId,
            price
        );

        delete (listingPrices[_nftAddress][_tokenId][_owner]);
    }

    function _calculateFeeAmount(uint256 price, uint16 fee) private pure returns (uint256) {
        return price * fee / 10000;
    }

    function _getNow() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    function _cancelListing(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) private {
        delete (listingPrices[_nftAddress][_tokenId][_owner]);
        emit ItemCanceled(_owner, _nftAddress, _tokenId);
    }

    function _validOwner(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) internal view {
        if (IERC165(_nftAddress).supportsInterface(type(IERC721).interfaceId)) {
            IERC721 nft = IERC721(_nftAddress);
            require(nft.ownerOf(_tokenId) == _owner, "not owning item");
        } else {
            revert("invalid nft address");
        }
    }
}
