const chai = require('chai');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { LazyMinter } = require('./lib')
const { solidity } = require('ethereum-waffle');
const { before } = require('mocha');
chai.use(solidity);

const name = 'ArtongNFT';
const symbol = 'ANFT';
const platformFee = 500; // 5%
const maxAmount = 4;
const policy = 0;

const firstTokenId = 1;
const secondTokenId = 2;
const nonExistentTokenId = 99;
const zeroAddress = '0x0000000000000000000000000000000000000000';
const sampleUri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

describe('ArtongNFT', function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
    this.ArtongMarketplace = await ethers.getContractFactory('ArtongMarketplace');
  });

  beforeEach(async function () {
    const [owner, feeReceipient, randomUser1, randomUser2, _] = await ethers.getSigners();
    const marketplace = await upgrades.deployProxy(
      this.ArtongMarketplace,
      [platformFee, feeReceipient.address],
      { initializer: 'initialize' }
    );
    const artongNft = await this.ArtongNFT.deploy(
      name,
      symbol,
      marketplace.address,
      platformFee,
      feeReceipient.address,
      maxAmount,
      policy
    );

    this.owner = owner;
    this.feeReceipient = feeReceipient;
    this.marketplace = marketplace;
    this.randomUser1 = randomUser1;
    this.randomUser2 = randomUser2;
    this.artongNft = artongNft;
  });

  describe('metadata', function() {
    it('Should have a name', async function() {
      expect(await this.artongNft.name()).to.equal(name);
    });

    it('Should have a symbol', async function() {
      expect(await this.artongNft.symbol()).to.equal(symbol);
    });
  });

  describe('token URI', function() {
    context('when queried for non existent token id', function() {
      it('Should fail to query', async function () {
        await expect(this.artongNft.tokenURI(nonExistentTokenId))
          .to.be.revertedWith("ERC721: invalid token ID");
      });

      context('when owner burns an existing token', function() {
        beforeEach(async function() {
          await this.artongNft.mint(this.owner.address, sampleUri);
        });

        it('Should owner be able to burn and should fail to query a burnt token', async function () {
          await expect(await this.artongNft.connect(this.owner).burn(firstTokenId))
            .to.emit(this.artongNft, 'Transfer')
            .withArgs(this.owner.address, zeroAddress, firstTokenId);

          await expect(this.artongNft.tokenURI(firstTokenId))
            .to.be.revertedWith("ERC721: invalid token ID");
        });
      });
    });
  });

  describe('policy', function() {
    context('when owner set policy to 1', function() {
      it('Should succeed and return policy 1', async function() {
        await this.artongNft.connect(this.owner).setPolicy(1);

        expect(await this.artongNft.policy()).to.equal(1);
      });
    });

    context('when policy is Immediate = 0', async function() {
      it('Should succeed to mint', async function() {
        await this.artongNft.connect(this.owner).setPolicy(0);

        await expect(this.artongNft.mint(this.randomUser1.address, sampleUri))
          .to.emit(this.artongNft, 'Transfer')
          .withArgs(zeroAddress, this.randomUser1.address, firstTokenId);
      });
    });

    context('when policy is Approved = 1', async function() {
      it('Should fail to mint', async function() {
        await this.artongNft.connect(this.owner).setPolicy(1);

        await expect(this.artongNft.mint(this.randomUser1.address, sampleUri))
          .to.be.revertedWith('Policy only allows lazy minting');
      });
    });

    context('when random user tries to set policy', function() {
      it('Should fail', async function() {
        await expect(this.artongNft.connect(this.randomUser1).setPolicy(1))
          .to.be.revertedWith("Ownable: caller is not the owner");
      });
    })
  });

  context('when policy is Immediate = 0', async function() {
    before(async function() {
      await this.artongNft.connect(this.owner).setPolicy(0);
    });

    context('with minted tokens', function () {
      beforeEach(async function () {
        await this.artongNft.mint(this.randomUser1.address, sampleUri);
        await this.artongNft.mint(this.randomUser2.address, sampleUri);
        await this.artongNft.mint(this.randomUser1.address, sampleUri);
      });

      describe('maxAmount', function() {
        context('when maximum amount is reached', function() {
          it('Should fail to mint', async function() {
            await this.artongNft.mint(this.randomUser2.address, sampleUri);
            
            await expect(this.artongNft.mint(this.marketplace.address, sampleUri))
              .to.revertedWith("Maximum number of NFTs reached");
          });
        });
      });

      describe('random user', function() {
        it('Should fail to pause contract', async function() {
          await expect(this.artongNft.connect(this.randomUser1).pause())
            .to.be.revertedWith("Not authorized");
        });
    
        it('Should fail to burn a token', async function() {
          await expect(this.artongNft.connect(this.randomUser2).burn(firstTokenId))
            .to.be.revertedWith("ERC721: caller is not token owner nor approved");
        });
      });

      describe('minter', function() {
        it('Should be able to burn minted token', async function() {
          await expect(this.artongNft.connect(this.randomUser1).burn(firstTokenId))
            .to.emit(this.artongNft, 'Transfer')
            .withArgs(this.randomUser1.address, zeroAddress, firstTokenId);
        });
      });

      describe('balanceOf', function () {
        context('when the given address owns some tokens', function () {
          it('Should return the amount of tokens owned by the given address', async function () {
            expect(await this.artongNft.balanceOf(this.randomUser1.address)).to.equal(2);
          });
        });
  
        context('when the given address does not own any tokens', function () {
          it('Should return 0', async function () {
            expect(await this.artongNft.balanceOf(this.feeReceipient.address)).to.equal(0);
          });
        });
  
        context('when querying the zero address', function () {
          it('Should throw error', async function () {
            await expect(this.artongNft.balanceOf(zeroAddress))
              .to.be.revertedWith("ERC721: address zero is not a valid owner");
          });
        });
      });

      describe('ownerOf', function () {
        context('when the given token ID was tracked by this token', function () {
          it('Should return the owner of the given token ID', async function () {
            expect(await this.artongNft.ownerOf(firstTokenId)).to.be.equal(this.randomUser1.address)
          })
        })
  
        context('when the given token ID was not tracked by this token', function () {
          it('Should fail to return the owner', async function () {
            await expect(this.artongNft.ownerOf(nonExistentTokenId))
              .to.be.revertedWith("ERC721: invalid token ID");
          });
        });
      });
    });
  });
});

describe('ArtongNFT Lazy minting', function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
    this.ArtongMarketplace = await ethers.getContractFactory('ArtongMarketplace');
  });

  beforeEach(async function () {
    const [owner, minter, redeemer, feeReceipient, randomUser, _] = await ethers.getSigners();
    const marketplace = await upgrades.deployProxy(
      this.ArtongMarketplace,
      [platformFee, feeReceipient.address],
      { initializer: 'initialize' }
    );
    const artongNft = await this.ArtongNFT.deploy(
      name,
      symbol,
      marketplace.address,
      platformFee,
      feeReceipient.address,
      maxAmount,
      policy
    );

    // the redeemerContract is an instance of the contract that's wired up to the redeemer's signing key
    // TODO] this.artongNft.connect(this.redeemer).redeem 이랑 어떤점이 다르지??
    const redeemerFactory = this.ArtongNFT.connect(redeemer);
    const redeemerContract = redeemerFactory.attach(artongNft.address);

    this.owner = owner;
    this.minter = minter;
    this.marketplace = marketplace;
    this.redeemer = redeemer;
    this.feeReceipient = feeReceipient;
    this.artongNft = artongNft;
    this.randomUser = randomUser;
    this.redeemerContract = redeemerContract;
  });

  it('Should redeem an NFT from a signed voucher', async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: ethers.utils.parseEther('0.0001') }))
      .to.emit(this.artongNft, 'Transfer')  // transfer from null address to minter
      .withArgs(zeroAddress, this.minter.address, firstTokenId)
      .and.to.emit(this.artongNft, 'Transfer') // transfer from minter to redeemer
      .withArgs(this.minter.address, this.redeemer.address, firstTokenId);
  });

  it('Should fail to redeem an NFT voucher thats signed by an unauthorized account', async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.randomUser });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher))
      .to.be.revertedWith('Signature invalid');
  });

  context('when payment >= minPrice', function() {
    it('Should redeem', async function() {
      const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
      const minPrice = ethers.constants.WeiPerEther; // charge 1 Eth
      const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);
  
      await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: minPrice }))
        .to.emit(this.artongNft, 'Transfer')
        .withArgs(zeroAddress, this.minter.address, firstTokenId)
        .and.to.emit(this.artongNft, 'Transfer')
        .withArgs(this.minter.address, this.redeemer.address, firstTokenId);
    });
  });

  context('when payment < minPrice', function() {
    it('Should fail to redeem', async function() {
      const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
      const minPrice = ethers.constants.WeiPerEther;
      const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, minPrice);
  
      const payment = minPrice.sub(10000);
      await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: payment }))
        .to.be.revertedWith('Insufficient funds to redeem');
    });
  });

  it('Should let minter withdraw earning and feeReceipient should recieve fee', async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);
    const price = ethers.utils.parseEther('0.0001');

    await expect(await this.redeemerContract.redeem(this.redeemer.address, voucher, { value: price }))
      .to.changeEtherBalances(
        [this.redeemer, this.artongNft, this.feeReceipient],
        [price.mul(-1), price * (10000 - platformFee) / 10000, price * platformFee / 10000]
      );

    expect(await this.artongNft.connect(this.minter).getWithdrawal())
      .to.equal(price * (10000 - platformFee) / 10000);

    await expect(await this.artongNft.connect(this.minter).withdraw())
      .to.changeEtherBalance(this.minter, price * (10000 - platformFee) / 10000);

    expect(await this.artongNft.connect(this.minter).getWithdrawal()).to.equal(0);
  });
});
