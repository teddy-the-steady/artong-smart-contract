const chai = require('chai');
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
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
const price = ethers.utils.parseEther('0.0001');
const newPrice = ethers.utils.parseEther('0.0002')

describe('ArtongMarketplace', function() {
  before(async function () {
    this.ArtongMarketplace = await ethers.getContractFactory('ArtongMarketplace');
    this.Nft = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [owner, feeReciever, randomUser1, randomUser2, _] = await ethers.getSigners();
    const marketplace = await upgrades.deployProxy(
      this.ArtongMarketplace,
      [platformFee, feeReciever.address],
      { initializer: 'initialize' }
    );
    const nft = await this.Nft.deploy(
      name,
      symbol,
      marketplace.address,
      platformFee,
      feeReciever.address,
      maxAmount,
      policy
    );
    
    nft.mint(randomUser1.address, sampleUri);
    nft.mint(randomUser2.address, sampleUri);

    this.owner = owner;
    this.feeReciever = feeReciever;
    this.randomUser1 = randomUser1;
    this.randomUser2 = randomUser2;
    this.marketplace = marketplace;
    this.nft = nft;
  });

  describe('Listing Item', function () {
    context('when not owning NFT', function() {
      it('Should revert listing', async function() {
        await expect(this.marketplace.connect(this.randomUser2).listItem(
          this.nft.address,
          firstTokenId,
          price
        )).to.be.reverted;
      });
    });

    context('when not approved', function() {
      beforeEach(async function() {
        const nft2 = await this.Nft.deploy(
          name,
          symbol,
          zeroAddress, // set marketplace zeroAddress
          platformFee,
          this.feeReciever.address,
          maxAmount,
          policy
        );
        nft2.mint(this.randomUser1.address, sampleUri);

        this.nft2 = nft2;
      });
      
      it('Should revert listing', async function() {
        await expect(this.marketplace.connect(this.randomUser1).listItem(
          this.nft2.address,
          firstTokenId,
          price
        )).to.be.reverted;
      });

      it('Should approve marketplace and successfuly list item', async function() {
        await expect(this.nft2.connect(this.randomUser1).setApprovalForAll(this.marketplace.address, true))
          .to.emit(this.nft2, 'ApprovalForAll')
          .withArgs(this.randomUser1.address, this.marketplace.address, true);

        await expect(this.marketplace.connect(this.randomUser1).listItem(
          this.nft2.address,
          firstTokenId,
          price
        )).to.emit(this.marketplace, 'ItemListed')
          .withArgs(this.randomUser1.address, this.nft2.address, firstTokenId, price);
      });
    });

    context('when marketplace is whitelisted', function() {
      it('Should successfuly list item', async function() {
        await expect(this.marketplace.connect(this.randomUser1).listItem(
          this.nft.address,
          firstTokenId,
          price
        )).to.emit(this.marketplace, 'ItemListed')
          .withArgs(this.randomUser1.address, this.nft.address, firstTokenId, price);
      });
    });
  });

  describe('Canceling Item', function() {
    this.beforeEach(async function() {
      await this.marketplace.connect(this.randomUser1).listItem(
        this.nft.address,
        firstTokenId,
        price
      );
    });

    it('Should successfully cancel the item', async function() {
      await expect(this.marketplace.connect(this.randomUser1).cancelListing(
        this.nft.address,
        firstTokenId
      )).to.emit(this.marketplace, 'ItemCanceled')
        .withArgs(this.randomUser1.address, this.nft.address, firstTokenId);
    });

    context('when item is not listed', function() {
      it('Should fail canceling item', async function() {
        await expect(this.marketplace.cancelListing(
          this.nft.address,
          secondTokenId
        )).to.be.reverted;
      });
    });

    context('when not owning the item', function() {
      it('Should fail canceling item', async function() {
        await expect(this.marketplace.cancelListing(
          this.nft.address,
          firstTokenId
        )).to.be.reverted;
      });
    });
  });

  describe('Updating Item Price', function() {
    this.beforeEach(async function() {
      await this.marketplace.connect(this.randomUser1).listItem(
        this.nft.address,
        firstTokenId,
        price
      );
      await this.marketplace.connect(this.randomUser2).listItem(
        this.nft.address,
        secondTokenId,
        price
      );
    });

    it('Should successfully update the item', async function() {
      await expect(this.marketplace.connect(this.randomUser1).updateListing(
          this.nft.address,
          firstTokenId,
          newPrice,
      )).to.emit(this.marketplace, 'ItemUpdated')
        .withArgs(this.randomUser1.address, this.nft.address, firstTokenId, newPrice);
    });

    context('when item is not listed', function() {
      it('Should fail updating item', async function() {
        await expect(this.marketplace.connect(this.randomUser1).updateListing(
          this.nft.address,
          nonExistentTokenId,
          newPrice,
        )).to.be.reverted;
      });
    });

    context('when not owning the item', function() {
      it('Should fail updating item', async function() {
        await expect(this.marketplace.connect(this.randomUser1).updateListing(
          this.nft.address,
          secondTokenId,
          newPrice,
        )).to.be.reverted;
      });
    });
  });
});