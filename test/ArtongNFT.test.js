const chai = require('chai');
const { expect } = require('chai');
const { ethers } = require("hardhat");
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

  it("Should return policy", async function() {
    expect(await this.artongNft.getPolicy()).to.equal(1);
  });
});