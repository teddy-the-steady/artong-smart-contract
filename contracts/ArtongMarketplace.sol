// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IArtongNFT {
    function setPendingWithdrawal(address) external payable;

    function owner() external view returns (address);
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
    event OfferAccepted(
        address indexed nft,
        uint256 tokenId,
        address indexed creator
    );
    event UpdatePlatformFee(uint16 platformFee);
    event UpdatePlatformFeeRecipient(address payable platformFeeRecipient);
    event UpdateTokenRoyalty(
        address indexed tokenOwner,
        uint16 royalty
    );
    event UpdateCollectionRoyalty(
        address indexed collectionOwner,
        address indexed nft,
        uint16 royalty
    );

    struct Offer {
        uint256 price;
        uint256 deadline;
    }

    struct CollectionRoyalty {
        uint16 royalty; // 2 decimals(525->5.25)
        uint256 royaltyBalance;
    }

    struct ArtongBalance {
        uint256 offerBalance;
        uint256 royaltyBalance;
        uint256 etcBalance;
    }

    uint16 public platformFee; // 2 decimals(525->5.25)

    address payable public feeReceipient;

    /// @notice NftAddress -> Token ID -> Listing item price
    mapping(address => mapping(uint256 => uint256)) listingPrices;

    /// @notice NftAddress -> Token ID -> Offerer -> Offer
    mapping(address => mapping(uint256 => mapping(address => Offer)))
        public offers;

    /// @notice Offerer -> Offer[]
    mapping(address => Offer[]) public userOffers;

    /// @notice NftAddress -> CollectionRoyalty
    mapping(address => CollectionRoyalty) collectionRoyalties;

    /// @notice Minter -> Token royalty // 2 decimals(525->5.25)
    mapping(address => uint16) tokenRoyalties;

    /// @notice NftAddress -> Token ID -> Minter
    mapping(address => mapping(uint256 => address)) minters;

    /// @notice User Artong Balance
    mapping(address => ArtongBalance) artongBalances;

    modifier isListed(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) {
        uint256 listingPrice = listingPrices[_nftAddress][_tokenId];
        require(listingPrice > 0, "not listed item");
        _;
    }

    modifier notListed(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) {
        uint256 listingPrice = listingPrices[_nftAddress][_tokenId];
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

    function listItem(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _price
    ) external notListed(_nftAddress, _tokenId, msg.sender) {
        if (_isNFTValid(_nftAddress)) {
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

        listingPrices[_nftAddress][_tokenId] = _price;
        emit ItemListed(
            msg.sender,
            _nftAddress,
            _tokenId,
            _price
        );
    }

    function cancelListing(address _nftAddress, uint256 _tokenId)
        external
        nonReentrant
        isListed(_nftAddress, _tokenId, msg.sender)
    {
        _isValidOwner(_nftAddress, _tokenId, msg.sender);
        _cancelListing(_nftAddress, _tokenId, msg.sender);
    }

    function updateListing(address _nftAddress, uint256 _tokenId, uint256 _newPrice)
        external
        nonReentrant
        isListed(_nftAddress, _tokenId, msg.sender)
    {
        _isValidOwner(_nftAddress, _tokenId, msg.sender);
        listingPrices[_nftAddress][_tokenId] = _newPrice;
        emit ItemUpdated(
            msg.sender,
            _nftAddress,
            _tokenId,
            _newPrice
        );
    }

    function buyItem(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) 
        external
        payable
        nonReentrant
        isListed(_nftAddress, _tokenId, _owner)
    {
        _isValidOwner(_nftAddress, _tokenId, _owner);
        
        uint256 price = listingPrices[_nftAddress][_tokenId];
        address seller = _owner;
        address buyer = msg.sender;
        uint256 payAmount = msg.value;
        _buyItem(_nftAddress, _tokenId, seller, buyer, price, payAmount);
    }

    function _buyItem(
        address _nftAddress,
        uint256 _tokenId,
        address _seller,
        address _buyer,
        uint256 _price,
        uint256 payAmount
    )
        internal
    {
        require(payAmount >= _price, "payment amount not enough");
        require(_isNFTValid(_nftAddress), "invalid nft address");

        if (payAmount > _price) {
            (bool success,) = _buyer.call{value: payAmount - _price}("");
            require(success, "Over paid amount transfer failed");
        }

        uint256 feeAmount = _calculateFeeAmount(_price, platformFee);

        (bool success2,) = feeReceipient.call{value : feeAmount}("");
        require(success2, "Fee transfer failed");

        address minter = minters[_nftAddress][_tokenId];
        uint16 tokenRoyalty = tokenRoyalties[minter];

        if (tokenRoyalty != 0) {
            uint256 royaltyFeeAmount = _calculateFeeAmount(_price, tokenRoyalty);
            artongBalances[minter].royaltyBalance += royaltyFeeAmount;
            feeAmount += royaltyFeeAmount;
        }

        CollectionRoyalty memory collectionRoyalty = collectionRoyalties[_nftAddress];

        if (collectionRoyalty.royalty != 0) {
            uint256 collectionRoyaltyFeeAmount = _calculateFeeAmount(_price, collectionRoyalty.royalty);
            collectionRoyalty.royaltyBalance += collectionRoyaltyFeeAmount;
            collectionRoyalties[_nftAddress] = CollectionRoyalty(
                collectionRoyalty.royalty,
                collectionRoyalty.royaltyBalance
            );
            feeAmount += collectionRoyaltyFeeAmount;
        }

        // Send sold amount to seller(extract fee) TODO] ArtongNFT case / external NFT case
        IArtongNFT(_nftAddress).setPendingWithdrawal{value: _price - feeAmount}(_seller);

        // Transfer NFT to buyer
        IERC721(_nftAddress).safeTransferFrom(_seller, _buyer, _tokenId);

        emit ItemSold(
            _seller,
            _buyer,
            _nftAddress,
            _tokenId,
            _price
        );

        delete (listingPrices[_nftAddress][_tokenId]);
    }

    function createOffer(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _deadline
    ) external payable offerNotExists(_nftAddress, _tokenId, msg.sender) {
        require(msg.value > 0.001 ether, "offer amount too small");
        require(_isNFTValid(_nftAddress), "invalid nft address");
        IERC721 nft = IERC721(_nftAddress);
        require(msg.sender != nft.ownerOf(_tokenId), "cannot self offer");

        if (_deadline == 0) {
            _deadline = _getNow() - 1 days;
        } else {
            _deadline = _getNow() + 1 days;
        }

        offers[_nftAddress][_tokenId][msg.sender] = Offer(
            msg.value,
            _deadline
        );

        userOffers[msg.sender].push(Offer(
            msg.value,
            _deadline
        ));

        artongBalances[msg.sender].offerBalance += msg.value;

        emit OfferCreated(
            msg.sender,
            _nftAddress,
            _tokenId,
            msg.value,
            _deadline
        );
    }

    /// @notice Method for accepting the offer
    /// @param _creator Offer creator address
    function acceptOffer(
        address _nftAddress,
        uint256 _tokenId,
        address _creator
    )
        external
        nonReentrant
        offerExists(_nftAddress, _tokenId, _creator)
    {
        _isValidOwner(_nftAddress, _tokenId, msg.sender);

        Offer memory offer = offers[_nftAddress][_tokenId][_creator];

        uint256 moment = _getNow();
        uint256 offerBalance = getOfferBalance(moment, _creator);
        require(offerBalance >= offer.price, "offer balance not enough to buy item");

        address seller = msg.sender;
        address buyer = _creator;
        _buyItem(_nftAddress, _tokenId, seller, buyer, offer.price, offer.price);

        emit OfferAccepted(_nftAddress, _tokenId, _creator);

        delete (offers[_nftAddress][_tokenId][_creator]);
    }

    function registerMinter(
        address _minter,
        address _nftAddress,
        uint256 _tokenId
    ) external {
        require(minters[_nftAddress][_tokenId] == address(0), "minter already registered");
        minters[_nftAddress][_tokenId] = _minter;
    }

    function updateTokenRoyalty(uint16 _royalty) external {
        require(_royalty <= 10000, "invalid royalty");
        tokenRoyalties[msg.sender] = _royalty;

        emit UpdateTokenRoyalty(msg.sender, _royalty);
    }

    function updateCollectionRoyalty(
        address _nftAddress,
        uint16 _royalty
    ) external {
        require(_royalty <= 10000, "invalid royalty");
        require(_isNFTValid(_nftAddress), "invalid nft address");

        IArtongNFT nft = IArtongNFT(_nftAddress);
        require(
            msg.sender == nft.owner(),
            "user not approved for this item"
        );

        CollectionRoyalty memory collectionRoyalty = collectionRoyalties[_nftAddress];
        collectionRoyalties[_nftAddress] = CollectionRoyalty(
            _royalty,
            collectionRoyalty.royaltyBalance
        );

        emit UpdateCollectionRoyalty(msg.sender, _nftAddress, _royalty);
    }

    function updatePlatformFee(uint16 _platformFee) external onlyOwner {
        platformFee = _platformFee;
        emit UpdatePlatformFee(_platformFee);
    }

    function updatePlatformFeeRecipient(address payable _platformFeeRecipient)
        external
        onlyOwner
    {
        feeReceipient = _platformFeeRecipient;
        emit UpdatePlatformFeeRecipient(_platformFeeRecipient);
    }

    function withdraw() public {
        uint256 moment = _getNow();
        uint256 amount = getArtongBalance(moment);
        require(amount != 0, "nothing to withdraw");
        require(address(this).balance >= amount, "balance not enough to withdraw");

        ArtongBalance memory artongBalance = artongBalances[msg.sender];
        artongBalance.offerBalance = artongBalance.offerBalance - getOfferBalance(moment, msg.sender);
        artongBalance.royaltyBalance = 0;
        artongBalance.etcBalance = 0;

        _deleteOldUserOffers(moment);

        address payable receiver = payable(msg.sender);

        (bool success,) = receiver.call{value: amount}("");
        require(success, "Artong balance transfer failed");
    }
    
    function getCollectionRoyalty(address _nftAddress) external view returns (CollectionRoyalty memory) {
        return collectionRoyalties[_nftAddress];
    }

    function getArtongBalance(uint256 _moment) public view returns (uint256) {
        return getOfferBalance(_moment, msg.sender) + getRoyaltyBalance() + getEtcBalance();
    }

    function getOfferBalance(uint256 _moment, address user) public view returns (uint256) {
        Offer[] memory userOffer = userOffers[user];
        uint256 offerBalance = 0;
        for (uint256 i = 0; i < userOffer.length; i++) {
            if (userOffer[i].deadline > _moment) {
                offerBalance += userOffer[i].price;
            }
        }
        return offerBalance;
    }

    function getRoyaltyBalance() public view returns (uint256) {
        return artongBalances[msg.sender].royaltyBalance;
    }

    function getEtcBalance() public view returns (uint256) {
        return artongBalances[msg.sender].etcBalance;
    }

    function _deleteOldUserOffers(uint256 _moment) private {
        Offer[] storage userOffer = userOffers[msg.sender];
        for (uint256 i = 0; i < userOffer.length; i++) {
            if (userOffer[i].deadline < _moment) {
                userOffer[i] = userOffer[userOffer.length - 1];
                userOffer.pop();
            }
        }
    }

    function _calculateFeeAmount(uint256 _price, uint16 _fee) private pure returns (uint256) {
        return _price * _fee / 10000;
    }

    function _getNow() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    function _cancelListing(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) private {
        delete (listingPrices[_nftAddress][_tokenId]);
        emit ItemCanceled(_owner, _nftAddress, _tokenId);
    }

    function _isValidOwner(
        address _nftAddress,
        uint256 _tokenId,
        address target
    ) internal view {
        if (_isNFTValid(_nftAddress)) {
            IERC721 nft = IERC721(_nftAddress);
            require(target == nft.ownerOf(_tokenId), "not owning item");
        } else {
            revert("invalid nft address");
        }
    }

    function _isNFTValid(address _nftAddress) private view returns (bool) {
        return IERC165(_nftAddress).supportsInterface(type(IERC721).interfaceId);
    }
}
