// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract ArtongNFT is ERC721URIStorage, EIP712, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private tokenIdCounter;
    uint256 private maxAmount;
    
    string private constant SIGNING_DOMAIN = "ArtongNFT-Voucher";
    string private constant SIGNATURE_VERSION = "1";

    struct NFTVoucher {
        address creator;
        uint256 minPrice;
        string uri;
        bytes signature;
    }

    /// @notice Immediate(default): mint or lazy mint. burnable by owner
    /// @notice Approved: Only lazy mint. content will stay hidden until owner opens it
    enum Policy {
        Immediate,
        Approved
    }
    Policy private policy;

    address public marketplace;
    uint16 public platformFee; // 2 decimals(525->5.25)
    address payable public feeReceipient;
    
    /// @notice Creator Earnings made by selling tokens
    mapping (address => uint256) pendingWithdrawals;

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
        marketplace = _marketplace;
        platformFee = _platformFee;
        feeReceipient = _feeReceipient;
        maxAmount = _maxAmount;
        policy = _policy;
    }

    // @dev Mints a token to an address with a tokenURI.
    // @param _to address of the future owner of the token
    function mint(address _to, string calldata _tokenUri) public returns (uint256) {
        tokenIdCounter.increment();
        uint256 newTokenId = tokenIdCounter.current();
        _mint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenUri);

        return newTokenId;
    }

    /// @notice Redeems an NFTVoucher for an actual NFT, creating it in the process.
    /// @param redeemer The address of the account which will receive the NFT upon success.
    /// @param voucher A signed NFTVoucher that describes the NFT to be redeemed.
    function redeem(address redeemer, NFTVoucher calldata voucher) public payable returns (uint256) {
        address signer = _verify(voucher);
        require(signer == voucher.creator, "Signature invalid");
        require(msg.value >= voucher.minPrice, "Insufficient funds to redeem");

        uint256 newTokenId = mint(voucher.creator, voucher.uri);
        _transfer(voucher.creator, redeemer, newTokenId);

        uint256 feeAmount = _calculatePlatformAmount(msg.value);

        pendingWithdrawals[signer] += msg.value - feeAmount;

        (bool success,) = feeReceipient.call{value : feeAmount}("");
        require(success, "Transfer failed"); // TODO] 실패해도 revert 안하는 방향으로?

        return newTokenId;
    }

    /// @notice Transfers all pending withdrawal balance to the caller. Reverts if the caller is not an authorized minter.
    function withdraw() public {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount != 0);
        require(address(this).balance >= amount);
        
        address payable receiver = payable(msg.sender);
        pendingWithdrawals[msg.sender] = 0;
        receiver.transfer(amount);
    }

    function getPolicy() public view returns (Policy) {
      return policy;
    }

    /// @notice Retuns the amount of Ether available to the caller to withdraw.
    function availableToWithdraw() public view returns (uint256) {
        return pendingWithdrawals[msg.sender];
    }

    /// @notice Returns the chain id of the current blockchain.
    /// @dev This is used to workaround an issue with ganache returning different values from the on-chain chainid() function and
    ///  the eth_chainId RPC method. See https://github.com/protocol/nft-website/issues/121 for context.
    function getChainID() external view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    function _calculatePlatformAmount(uint256 value) private view returns (uint256) {
        return value * (platformFee / 10000);
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
}

// TODO
// collaborator 설정 (AccessControl 로 함수마다 role 설정?) isApproved쪽은 설정하면 이점이 뭔지 araboza
// pausable burnable 하면 어떤 장점이?? 권한도 엮여있음
// IPFS랑 tokenURI 설정도 테스트 해봐야함

// 끝판왕? 테스팅 로직. 아니면 테스트도 같이 할까? 같이 하는게 맞을듯..
// for theGraph. 어떤 이벤트 필요한지 테스트해보고 이벤트 넣기! (이게 끝판왕)