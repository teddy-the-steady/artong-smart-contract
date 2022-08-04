const chai = require('chai');
const { expect } = require('chai');
const { ethers } = require("hardhat");
const { LazyMinter } = require('./lib')
const { solidity } = require('ethereum-waffle');
chai.use(solidity);

describe("ArtongNFT Lazy minting", function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [minter, redeemer, feeReciever, _] = await ethers.getSigners();
    const artongNft = await this.ArtongNFT.deploy(
      "ArtongNFT",
      "ANFT",
      minter.address,
      5,
      feeReciever.address,
      1000,
      1
    );
    await artongNft.deployed();

    const redeemerFactory = this.ArtongNFT.connect(redeemer)
    const redeemerContract = redeemerFactory.attach(artongNft.address)

    this.minter = minter;
    this.redeemer = redeemer;
    this.feeReciever = feeReciever;
    this.artongNft = artongNft;
    this.redeemerContract = redeemerContract;
  });

  it("Should redeem an NFT from a signed voucher", async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const voucher = await lazyMinter.createVoucher(this.minter.address, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
    const firstTokenId = 1;

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher))
      .to.emit(this.artongNft, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', this.minter.address, firstTokenId)
      .and.to.emit(this.artongNft, 'Transfer') // transfer from minter to redeemer
      .withArgs(this.minter.address, this.redeemer.address, firstTokenId);
  });
});

describe("ArtongNFT", function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [deployer, feeReciever, _] = await ethers.getSigners();
    const artongNft = await this.ArtongNFT.deploy(
      "ArtongNFT",
      "ANFT",
      deployer.address,
      5,
      feeReciever.address,
      1000,
      1
    );
    await artongNft.deployed();

    this.deployer = deployer;
    this.feeReciever = feeReciever;
    this.artongNft = artongNft;
  });

  it("Should return policy", async function() {
    expect(await this.artongNft.getPolicy()).to.equal(1);
  });
});