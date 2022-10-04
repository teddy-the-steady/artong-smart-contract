// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./Enums.sol";

interface IArtongMarketplace {
    function registerMinter(address _minter, address _nftAddress, uint256 _tokenId) external;

    function sendArtongBalance(address _user) external payable;
}

contract ArtongNFT is
    ERC721URIStorage,
    EIP712,
    Pausable,
    ERC721Burnable,
    Ownable,
    ERC721Enumerable
{
    using Counters for Counters.Counter;

    event UpdatePolicy(
        Policy policy,
        address updater
    );

    Counters.Counter private tokenIdCounter;
    uint256 public immutable maxAmount;
    
    string private constant SIGNING_DOMAIN = "ArtongNFT-Voucher";
    string private constant SIGNATURE_VERSION = "1";

    struct NFTVoucher {
        address creator;
        uint256 minPrice;
        string uri;
        bytes signature;
    }

    /// @notice Immediate: mint or lazy mint. burnable by minter
    /// @notice Approved(default): Only lazy mint. content will stay hidden until owner opens it
    Policy public policy;

    address public marketplace;
    uint16 public platformFee; // 2 decimals(525->5.25)
    address payable public feeReceipient;

    modifier checkMaxAmount() {
		require(maxAmount > tokenIdCounter.current(), "Maximum number of NFTs reached");
		_;
	}

    constructor(
        string memory _name,
        string memory _symbol,
        address _marketplace,
        uint16 _platformFee,
        address payable _feeReceipient,
        uint256 _maxAmount,
        Policy _policy
    )
    ERC721(_name, _symbol)
    EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION)
    {
        require(bytes(_name).length > 0, "Name is required");
        require(bytes(_symbol).length > 0, "Symbol is required");
        require(_maxAmount > 0, "MaxAmount has to be positive number");
        marketplace = _marketplace;
        platformFee = _platformFee;
        feeReceipient = _feeReceipient;
        maxAmount = _maxAmount;
        policy = _policy;
    }

    function mint(address _to, string calldata _tokenUri) public whenNotPaused returns (uint256) {
        require(policy == Policy.Immediate, "Policy only allows lazy minting");
        return _doMint(_to, _tokenUri);
    }

    /// @notice Redeems an NFTVoucher for an actual NFT, creating it in the process.
    /// @param redeemer The address of the account which will receive the NFT upon success.
    /// @param voucher A signed NFTVoucher that describes the NFT to be redeemed.
    function redeem(address redeemer, NFTVoucher calldata voucher)
        public
        payable
        whenNotPaused
        returns (uint256)
    {
        address signer = _verify(voucher);
        require(signer == voucher.creator, "Signature invalid");
        require(msg.value >= voucher.minPrice, "Insufficient funds to redeem");

        uint256 feeAmount = _calculatePlatformFeeAmount();

        (bool success,) = feeReceipient.call{value : feeAmount}("");
        require(success, "Transfer failed");

        uint256 newTokenId = _doMint(voucher.creator, voucher.uri);
        _transfer(voucher.creator, redeemer, newTokenId);

        IArtongMarketplace(marketplace).sendArtongBalance{value: msg.value - feeAmount}(signer);

        return newTokenId;
    }

    function setPolicy(Policy _policy) public onlyOwner {
        emit UpdatePolicy(_policy, msg.sender);
        policy = _policy;
    }

    /// @notice Returns the chain id of the current blockchain.
    /// @dev This is TEMPORARILY used to workaround an issue with ganache returning different values from the on-chain chainid() function and
    ///  the eth_chainId RPC method. See https://github.com/protocol/nft-website/issues/121 for context.
    function getChainID() external view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    function pause() public {
        require(isApprovedForAll(msg.sender, msg.sender), "Not authorized");
		_pause();
	}

	function unpause() public {
        require(isApprovedForAll(msg.sender, msg.sender), "Not authorized");
		_unpause();
	}

    /// @notice Override isApprovedForAll to whitelist Artong contracts to enable gas-less listings.
    function isApprovedForAll(address owner, address operator)
        override
        public
        view
        returns (bool)
    {
        if (marketplace == operator) {
            return true;
        }

        return super.isApprovedForAll(owner, operator);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /// @notice Override _isApprovedOrOwner to whitelist Artong contracts to enable gas-less listings.
    function _isApprovedOrOwner(address spender, uint256 tokenId) override internal view returns (bool) {
        require(_exists(tokenId), "ERC721: operator query for nonexistent token");
        address owner = ERC721.ownerOf(tokenId);
        if (isApprovedForAll(owner, spender)) return true;
        return super._isApprovedOrOwner(spender, tokenId);
    }

    function _doMint(address _to, string calldata _tokenUri) private checkMaxAmount returns (uint256) {
        tokenIdCounter.increment();
        uint256 newTokenId = tokenIdCounter.current();

        IArtongMarketplace(marketplace).registerMinter(_to, address(this), newTokenId);

        _mint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenUri);

        return newTokenId;
    }

    function _calculatePlatformFeeAmount() private view returns (uint256) {
        return msg.value * platformFee / 10000;
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    /// @notice Verifies the signature for a given NFTVoucher, returning the address of the signer.
    /// @dev Will revert if the signature is invalid.
    /// @param voucher An NFTVoucher describing an unminted NFT.
    function _verify(NFTVoucher calldata voucher) internal view returns (address) {
        bytes32 digest = _hash(voucher);
        return ECDSA.recover(digest, voucher.signature);
    }

    /// @notice Returns a hash of the given NFTVoucher, prepared using EIP712 typed data hashing rules.
    /// @param voucher An NFTVoucher to hash.
    function _hash(NFTVoucher calldata voucher) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            keccak256("NFTVoucher(address creator,uint256 minPrice,string uri)"),
            voucher.creator,
            voucher.minPrice,
            keccak256(bytes(voucher.uri))
        )));
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

// TODO
// for theGraph. 어떤 이벤트 필요한지 테스트해보고 이벤트 넣기! (이게 끝판왕)