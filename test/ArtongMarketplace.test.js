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
const zeroAddress = '0x0000000000000000000000000000000000000000';
const sampleUri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

describe('ArtongMarketplace', function() {
  before(async function () {
    this.ArtongMarketplace = await ethers.getContractFactory('ArtongMarketplace');
    this.Nft = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [owner, feeReciever, randomUser1, randomUser2, _] = await ethers.getSigners();
    const artongMarketplace = await upgrades.deployProxy(
      this.ArtongMarketplace,
      [platformFee, feeReciever.address],
      { initializer: 'initialize' }
    );
    const nft = await this.Nft.deploy(
      name,
      symbol,
      artongMarketplace.address,
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
    this.artongMarketplace = artongMarketplace;
    this.nft = nft;
  });

  describe('metadata', function() {
    it('Should have a name', async function() {
      expect(await this.nft.name()).to.equal(name);
    });

    it('Should have a symbol', async function() {
      expect(await this.nft.symbol()).to.equal(symbol);
    });
  });
});