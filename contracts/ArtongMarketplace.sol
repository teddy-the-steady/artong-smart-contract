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
    event OfferAccepted(
        address indexed nft,
        uint256 tokenId,
        address indexed creator
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

    struct ArtongBalance {
        uint256 offerBalance;
        uint256 royaltyBalance;
        uint256 etcBalance;
    }

    uint16 public platformFee; // 2 decimals(525->5.25)

    address payable public feeReceipient;

    /// @notice NftAddress -> Token ID -> Listing item price
    mapping(address => mapping(uint256 => uint256)) public listingPrices;

    /// @notice NftAddress -> Token ID -> Offerer -> Offer
    mapping(address => mapping(uint256 => mapping(address => Offer)))
        public offers;

    /// @notice Offerer -> Offer[]
    mapping(address => Offer[]) public userOffers;

    /// @notice NftAddress -> CollectionRoyalty
    mapping(address => CollectionRoyalty) public collectionRoyalties;

    /// @notice Minter -> Token royalty // 2 decimals(525->5.25)
    mapping(address => uint16) public tokenRoyalties;

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

    /// @notice Method for listing NFT
    /// @param _nftAddress Address of NFT contract
    /// @param _tokenId Token ID of NFT
    /// @param _price sale price
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

    /// @notice Method for canceling listed NFT
    function cancelListing(address _nftAddress, uint256 _tokenId)
        external
        nonReentrant
        isListed(_nftAddress, _tokenId, msg.sender)
    {
        _isValidOwner(_nftAddress, _tokenId, msg.sender);
        _cancelListing(_nftAddress, _tokenId, msg.sender);
    }

    /// @notice Method for updating listed NFT
    /// @param _nftAddress Address of NFT contract
    /// @param _tokenId Token ID of NFT
    /// @param _newPrice New sale price
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

    /// @notice Method for buying listed NFT
    /// @param _nftAddress NFT contract address
    /// @param _tokenId TokenId
    /// @param _owner Token owner
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

        uint256 feeAmount = _calculateFeeAmount(_price, platformFee);

        // Send fee to feeReceipient
        (bool success,) = feeReceipient.call{value : feeAmount}("");
        require(success, "Fee transfer failed");

        uint16 tokenRoyalty = tokenRoyalties[_seller];

        if (tokenRoyalty != 0) {
            uint256 royaltyFeeAmount = _calculateFeeAmount(_price, tokenRoyalty);
            artongBalances[_seller].royaltyBalance += royaltyFeeAmount;
            feeAmount += royaltyFeeAmount;
        }

        CollectionRoyalty memory collectionRoyalty = collectionRoyalties[_nftAddress];

        if (collectionRoyalty.royalty != 0) {
            uint256 collectionRoyaltyFeeAmount = _calculateFeeAmount(_price, collectionRoyalty.royalty);
            collectionRoyalty.royaltyBalance += collectionRoyaltyFeeAmount;
            feeAmount += collectionRoyaltyFeeAmount;
        }

        // Send sold amount to seller(extract fee) TODO] ArtongNFT case / external NFT case
        IArtongNFT(_nftAddress).setPendingWithdrawal{value: _price - feeAmount}(_seller);

        // Transfer NFT to buyer
        if (_isNFTValid(_nftAddress)) {
            IERC721(_nftAddress).safeTransferFrom(_seller, _buyer, _tokenId);
        }

        if (payAmount > _price) {
            (bool success2,) = _buyer.call{value: payAmount - _price}("");
            if (!success2) { // TODO] revert 처리 하는게 나을까?
                artongBalances[_buyer].etcBalance += payAmount - _price;
            }
        }

        emit ItemSold(
            _seller,
            _buyer,
            _nftAddress,
            _tokenId,
            _price
        );

        delete (listingPrices[_nftAddress][_tokenId]);
    }

    /// @notice Method for offering item
    /// @param _nftAddress NFT contract address
    /// @param _tokenId TokenId
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
    /// @param _nftAddress NFT contract address
    /// @param _tokenId TokenId
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
        uint256 offerBalance = _getOfferBalance(moment, _creator);
        require(offerBalance >= offer.price, "balance not enough to buy item");

        address seller = msg.sender;
        address buyer = _creator;
        _buyItem(_nftAddress, _tokenId, seller, buyer, offer.price, offer.price);

        emit OfferAccepted(_nftAddress, _tokenId, _creator);

        delete (offers[_nftAddress][_tokenId][_creator]);
    }

    function withdraw() public {
        uint256 moment = _getNow();
        uint256 amount = getArtongBalance(moment);
        require(amount != 0, "nothing to withdraw");
        require(address(this).balance >= amount, "balance not enough to withdraw");

        ArtongBalance memory artongBalance = artongBalances[msg.sender];
        artongBalance.offerBalance = artongBalance.offerBalance - _getOfferBalance(moment, msg.sender);
        artongBalance.royaltyBalance = 0;
        artongBalance.etcBalance = 0;

        _deleteOldUserOffers(moment);

        address payable receiver = payable(msg.sender);
        receiver.transfer(amount);
    }

    function getArtongBalance(uint256 moment) public view returns (uint256) {
        return _getOfferBalance(moment, msg.sender) + _getRoyaltyBalance() + _getEtcBalance();
    }

    function _getOfferBalance(uint256 moment, address user) private view returns (uint256) {
        Offer[] memory userOffer = userOffers[user];
        uint256 offerBalance = 0;
        for (uint256 i = 0; i < userOffer.length; i++) {
            if (userOffer[i].deadline > moment) {
                offerBalance += userOffer[i].price;
            }
        }
        return offerBalance;
    }

    function _getRoyaltyBalance() private view returns (uint256) {
        ArtongBalance memory artongBalance = artongBalances[msg.sender];
        return artongBalance.royaltyBalance;
    }

    function _getEtcBalance() private view returns (uint256) {
        ArtongBalance memory artongBalance = artongBalances[msg.sender];
        return artongBalance.etcBalance;
    }

    function _deleteOldUserOffers(uint256 moment) private {
        Offer[] storage userOffer = userOffers[msg.sender];
        for (uint256 i = 0; i < userOffer.length; i++) {
            if (userOffer[i].deadline < moment) {
                userOffer[i] = userOffer[userOffer.length - 1];
                userOffer.pop();
            }
        }
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
