const chai = require('chai');
const { expect } = require('chai');
const { ethers } = require("hardhat");
const { solidity } = require('ethereum-waffle');
chai.use(solidity);

async function deploy() {
  const [minter, redeemer, feeReciever, _] = await ethers.getSigners()

  const ArtongNFT = await ethers.getContractFactory("ArtongNFT")
  const contract = await ArtongNFT.deploy(
    "ArtongNFT",
    "ANFT",
    minter.address,
    5,
    feeReciever.address,
    1000,
    1
  );

  // the redeemerContract is an instance of the contract that's wired up to the redeemer's signing key
  const redeemerFactory = ArtongNFT.connect(redeemer)
  const redeemerContract = redeemerFactory.attach(contract.address)

  return {
    minter,
    redeemer,
    contract,
    redeemerContract,
  }
}

describe("ArtongNFT", function() {
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