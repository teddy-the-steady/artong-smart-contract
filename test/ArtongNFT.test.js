const chai = require('chai');
const { expect } = require('chai');
const { ethers } = require("hardhat");
const { LazyMinter } = require('./lib')
const { solidity } = require('ethereum-waffle');
chai.use(solidity);

const name = "ArtongNFT";
const symbol = "ANFT";
const platformFee = 500; // 5%
const maxAmount = 3;
const policy = 0;

const firstTokenId = 1;
const zeroAddress = '0x0000000000000000000000000000000000000000';
const sampleUri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

describe("ArtongNFT", function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [owner, feeReciever, marketplace, randomUser1, randomUser2, _] = await ethers.getSigners();
    const artongNft = await this.ArtongNFT.deploy(
      name,
      symbol,
      marketplace.address,
      platformFee,
      feeReciever.address,
      maxAmount,
      policy
    );
    await artongNft.deployed();

    this.owner = owner;
    this.feeReciever = feeReciever;
    this.marketplace = marketplace;
    this.randomUser1 = randomUser1;
    this.randomUser2 = randomUser2;
    this.artongNft = artongNft;
  });

  describe("policy", function() {
    context("when owner set policy to 1", function() {
      it("Should succeed and return policy 1", async function() {
        await this.artongNft.connect(this.owner).setPolicy(1);

        expect(await this.artongNft.policy()).to.equal(1);
      });

      context("when policy is Immediate = 0", async function() {
        it("Should succeed to mint", async function() {
          await this.artongNft.connect(this.owner).setPolicy(0);

          await expect(this.artongNft.mint(this.randomUser1.address, sampleUri))
            .to.emit(this.artongNft, 'Transfer')
            .withArgs(zeroAddress, this.randomUser1.address, firstTokenId);
        });
      });
  
      context("when policy is Approved = 1", async function() {
        it("Should fail to mint", async function() {
          await this.artongNft.connect(this.owner).setPolicy(1);

          await expect(this.artongNft.mint(this.randomUser1.address, sampleUri))
            .to.be.revertedWith('Policy only allows lazy minting');
        });
      });
    });

    context("when random user tries to set policy", function() {
      it("Should fail", async function() {
        await expect(this.artongNft.connect(this.randomUser1).setPolicy(1))
          .to.be.reverted;
      });
    })
  });

  context("when policy is Immediate = 0", async function() {
    before(async function() {
      await this.artongNft.connect(this.owner).setPolicy(0);
    });

    context('with minted tokens', function () {
      beforeEach(async function () {
        await this.artongNft.mint(this.randomUser1.address, sampleUri);
        await this.artongNft.mint(this.randomUser2.address, sampleUri);
      });

      describe("maxAmount", function() {
        context("when maximum amount is reached", function() {
          it("Should fail to mint", async function() {
            await this.artongNft.mint(this.randomUser2.address, sampleUri);
            
            await expect(this.artongNft.mint(this.marketplace.address, sampleUri))
              .to.reverted;
          });
        });
      });

      describe("whitelisted marketplace", function() {
        it("Should be able to pause", async function() {
          await expect(this.artongNft.connect(this.marketplace).pause())
            .to.emit(this.artongNft, 'Paused')
            .withArgs(this.marketplace.address);
        });
    
        it("Should be able to burn a token", async function() {
          await expect(this.artongNft.connect(this.marketplace).burn(firstTokenId))
            .to.emit(this.artongNft, 'Transfer')
            .withArgs(this.randomUser1.address, zeroAddress, firstTokenId);
        });

        it("Should be able to set paused = true", async function() {
          await expect(this.artongNft.connect(this.marketplace).pause())
            .to.emit(this.artongNft, 'Paused')
            .withArgs(this.marketplace.address);
        });

        context("when paused = true", function() {
          it("Should fail to mint", async function() {
            await this.artongNft.connect(this.marketplace).pause();

            await expect(this.artongNft.mint(this.randomUser1.address, sampleUri))
              .to.be.reverted;
          });
        });
      });

      describe("random user", function() {
        it("Should fail to pause contract", async function() {
          await expect(this.artongNft.connect(this.randomUser1).pause()).to.be.reverted;
        });
    
        it("Should fail to burn a token", async function() {
          await expect(this.artongNft.connect(this.randomUser2).burn(firstTokenId))
            .to.be.reverted;
        });
      });
    });
  });
});

describe("ArtongNFT Lazy minting", function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [owner, minter, marketplace, redeemer, feeReciever, randomUser, _] = await ethers.getSigners();
    const artongNft = await this.ArtongNFT.deploy(
      name,
      symbol,
      marketplace.address,
      platformFee,
      feeReciever.address,
      maxAmount,
      policy
    );
    await artongNft.deployed();

    // the redeemerContract is an instance of the contract that's wired up to the redeemer's signing key
    // TODO] this.artongNft.connect(this.redeemer).redeem 이랑 어떤점이 다르지??
    const redeemerFactory = this.ArtongNFT.connect(redeemer);
    const redeemerContract = redeemerFactory.attach(artongNft.address);

    this.owner = owner;
    this.minter = minter;
    this.marketplace = marketplace;
    this.redeemer = redeemer;
    this.feeReciever = feeReciever;
    this.artongNft = artongNft;
    this.randomUser = randomUser;
    this.redeemerContract = redeemerContract;
  });

  it("Should redeem an NFT from a signed voucher", async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: ethers.utils.parseEther("0.0001") }))
      .to.emit(this.artongNft, 'Transfer')  // transfer from null address to minter
      .withArgs(zeroAddress, this.minter.address, firstTokenId)
      .and.to.emit(this.artongNft, 'Transfer') // transfer from minter to redeemer
      .withArgs(this.minter.address, this.redeemer.address, firstTokenId);
  });

  it("Should fail to redeem an NFT voucher that's signed by an unauthorized account", async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.randomUser });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher))
      .to.be.revertedWith('Signature invalid');
  });

  context("when payment >= minPrice", function() {
    it("Should redeem", async function() {
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

  context("when payment < minPrice", function() {
    it("Should fail to redeem", async function() {
      const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
      const minPrice = ethers.constants.WeiPerEther;
      const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, minPrice);
  
      const payment = minPrice.sub(10000);
      await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: payment }))
        .to.be.revertedWith('Insufficient funds to redeem');
    });
  });

  it("Should let minter withdraw earning and feeReceipient should recieve fee", async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);
    const price = ethers.utils.parseEther('0.001');

    await expect(await this.redeemerContract.redeem(this.redeemer.address, voucher, { value: price }))
      .to.changeEtherBalances(
        [this.redeemer, this.artongNft, this.feeReciever],
        [price.mul(-1), price * (10000 - platformFee) / 10000, price * platformFee / 10000]
      );

    expect(await this.artongNft.connect(this.minter).getWithdrawal())
      .to.equal(price * (10000 - platformFee) / 10000);

    await expect(await this.artongNft.connect(this.minter).withdraw())
      .to.changeEtherBalance(this.minter, price * (10000 - platformFee) / 10000);

    expect(await this.artongNft.connect(this.minter).getWithdrawal()).to.equal(0);
  });
});
