const chai = require('chai');
const { expect } = require('chai');
const { ethers } = require("hardhat");
const { LazyMinter } = require('./lib')
const { solidity } = require('ethereum-waffle');
chai.use(solidity);

const platformFee = 500; // 5%
const maxAmount = 1000;
const policy = 0;

const firstTokenId = 1;
const zeroAddress = '0x0000000000000000000000000000000000000000';
const sampleUri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

describe("ArtongNFT", function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [deployer, feeReciever, marketplace, randomUser, _] = await ethers.getSigners();
    const artongNft = await this.ArtongNFT.deploy(
      "ArtongNFT",
      "ANFT",
      marketplace.address,
      platformFee,
      feeReciever.address,
      maxAmount,
      policy
    );
    await artongNft.deployed();

    this.deployer = deployer;
    this.feeReciever = feeReciever;
    this.marketplace = marketplace;
    this.randomUser = randomUser;
    this.artongNft = artongNft;
  });

  it("Should fail to mint if policy is 1 or succeed if 0", async function() {
    if (await this.artongNft.getPolicy() === 1) {
      await expect(this.artongNft.mint(this.deployer.address, sampleUri))
        .to.be.revertedWith('Policy only allows lazy minting');
    } else {
      await expect(this.artongNft.mint(this.deployer.address, sampleUri))
        .to.emit(this.artongNft, 'Transfer')
        .withArgs(zeroAddress, this.deployer.address, firstTokenId);
    }
  });

  it("Should whitelisted marketplace be able to pause", async function() {
    await expect(this.artongNft.connect(this.marketplace).pause())
      .to.emit(this.artongNft, 'Paused')
      .withArgs(this.marketplace.address);
  });

  it("Should randomUser fail to pause contract", async function() {
    await expect(this.artongNft.connect(this.randomUser).pause()).to.be.reverted;
  });

  it("Should fail to call whenNotPaused functions if paused true", async function() {
    await expect(this.artongNft.connect(this.marketplace).pause())
      .to.emit(this.artongNft, 'Paused')
      .withArgs(this.marketplace.address);

    await expect(this.artongNft.mint(this.deployer.address, sampleUri))
      .to.be.reverted;
  });

  it("Should authorized adress fail to burn a token", async function() {
    await expect(this.artongNft.mint(this.marketplace.address, sampleUri))
      .to.emit(this.artongNft, 'Transfer')
      .withArgs(zeroAddress, this.marketplace.address, firstTokenId);

    await expect(this.artongNft.connect(this.randomUser).burn(firstTokenId))
      .to.be.reverted;
  });

  it("Should marketplace be able to burn a token", async function() {
    await expect(this.artongNft.mint(this.randomUser.address, sampleUri))
      .to.emit(this.artongNft, 'Transfer')
      .withArgs(zeroAddress, this.randomUser.address, firstTokenId);

    await expect(this.artongNft.connect(this.marketplace).burn(firstTokenId))
      .to.emit(this.artongNft, 'Transfer')
      .withArgs(this.randomUser.address, zeroAddress, firstTokenId);
  });
});

describe("ArtongNFT Lazy minting", function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [minter, redeemer, feeReciever, randomUser, _] = await ethers.getSigners();
    const artongNft = await this.ArtongNFT.deploy(
      "ArtongNFT",
      "ANFT",
      minter.address,
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

    this.minter = minter;
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
      .to.be.revertedWith('Signature invalid')
  });

  it("Should redeem if payment is >= minPrice", async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const minPrice = ethers.constants.WeiPerEther; // charge 1 Eth
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: minPrice }))
      .to.emit(this.artongNft, 'Transfer')
      .withArgs(zeroAddress, this.minter.address, firstTokenId)
      .and.to.emit(this.artongNft, 'Transfer')
      .withArgs(this.minter.address, this.redeemer.address, firstTokenId)
  });

  it("Should fail to redeem if payment is < minPrice", async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const minPrice = ethers.constants.WeiPerEther;
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, minPrice);

    const payment = minPrice.sub(10000);
    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: payment }))
      .to.be.revertedWith('Insufficient funds to redeem')
  });

  it("Should make payments available to minter for withdrawal and fee available for feeReceipient", async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri);
    const price = ethers.utils.parseEther('0.001');

    await expect(await this.redeemerContract.redeem(this.redeemer.address, voucher, { value: price }))
      .to.changeEtherBalances(
        [this.redeemer, this.artongNft, this.feeReciever],
        [price.mul(-1), price * (10000 - platformFee) / 10000, price * platformFee / 10000]
      );

    expect(await this.artongNft.getWithdrawal()).to.equal(price * (10000 - platformFee) / 10000);

    await expect(await this.artongNft.withdraw())
      .to.changeEtherBalance(this.minter, price * (10000 - platformFee) / 10000)

    expect(await this.artongNft.getWithdrawal()).to.equal(0)
  });
});
