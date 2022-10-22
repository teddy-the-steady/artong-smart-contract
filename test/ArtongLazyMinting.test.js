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
const thirdTokenId = 3;
const zeroAddress = '0x0000000000000000000000000000000000000000';
const sampleUri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

const ACCOUNT1 = '0xacf901ebdca03c6a74ee9456727f92caff3c35a6';
const ACCOUNT2 = '0xF042403Cdf2cB073a2A371Dce25A4F94dc8660DF';
const ACCOUNT3 = '0x2A4e0CCF650815AAC184790CB9e6bD815239682e';
const ACCOUNT4 = '0xD7e17567Bd528C073f71ff174d1f706bBA424E72';
const ACCOUNT5 = '0x38f89664ABB61eD691dEb236bB984D32efd0E026';

describe('ArtongNFT Lazy minting', function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
    this.ArtongMarketplace = await ethers.getContractFactory('ArtongMarketplace');

    // const [owner, minter, redeemer, feeReceipient, randomUser, _] = await ethers.getSigners();
    const owner = await ethers.getSigner(ACCOUNT2);
    const minter = await ethers.getSigner(ACCOUNT1);
    const redeemer = await ethers.getSigner(ACCOUNT3);
    const feeReceipient = await ethers.getSigner(ACCOUNT4);
    const randomUser = await ethers.getSigner(ACCOUNT5);

    const marketplace = await upgrades.deployProxy(
      this.ArtongMarketplace,
      [platformFee, feeReceipient.address],
      { initializer: 'initialize' }
    );
    await marketplace.deployed();
    console.log('marketplace deployed to:', marketplace.address);

    const artongNft = await this.ArtongNFT.deploy(
      name,
      symbol,
      marketplace.address,
      platformFee,
      feeReceipient.address,
      maxAmount,
      policy
    );
    await artongNft.deployed();
    console.log('artongNft deployed to:', artongNft.address);

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
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, sampleUri);

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: ethers.utils.parseEther('0.0001') }))
      .to.emit(this.artongNft, 'Transfer')  // transfer from null address to minter
      .withArgs(zeroAddress, this.minter.address, firstTokenId)
      .and.to.emit(this.artongNft, 'Transfer') // transfer from minter to redeemer
      .withArgs(this.minter.address, this.redeemer.address, firstTokenId);
  });

  it('Should let minter withdraw earning and feeReceipient should recieve fee', async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, sampleUri);
    const price = ethers.utils.parseEther('0.0001');

    await expect(await this.redeemerContract.redeem(this.redeemer.address, voucher, { value: price }))
      .to.changeEtherBalances(
        [this.redeemer, this.feeReceipient],
        [price.mul(-1), price * platformFee / 10000]
      );

    await expect(await this.marketplace.getArtongBalance(
      parseInt(new Date().getTime() / 1000),
      this.minter.address
    )).to.equal(
      price * (10000 - platformFee) / 10000 +
      price * (10000 - platformFee) / 10000
    );
  });

  it('Should fail to redeem an NFT voucher thats signed by an unauthorized account', async function() {
    const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.randomUser });
    const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, sampleUri);

    await expect(this.redeemerContract.redeem(this.redeemer.address, voucher))
      // .to.be.revertedWith('Signature invalid');
      .to.be.reverted;
  });

  context('when payment >= minPrice', function() {
    it('Should redeem', async function() {
      const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
      const minPrice = ethers.utils.parseEther('0.0001');
      const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, sampleUri);
  
      await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: minPrice }))
        .to.emit(this.artongNft, 'Transfer')
        .withArgs(zeroAddress, this.minter.address, thirdTokenId)
        .and.to.emit(this.artongNft, 'Transfer')
        .withArgs(this.minter.address, this.redeemer.address, thirdTokenId);
    });
  });

  context('when payment < minPrice', function() {
    it('Should fail to redeem', async function() {
      const lazyMinter = new LazyMinter({ contract: this.artongNft, signer: this.minter });
      const minPrice = ethers.utils.parseEther('0.0001');
      const voucher = await lazyMinter.createVoucher(this.minter.address, sampleUri, sampleUri, minPrice);
  
      const payment = minPrice.sub(10000);
      await expect(this.redeemerContract.redeem(this.redeemer.address, voucher, { value: payment }))
        // .to.be.revertedWith('Insufficient funds to redeem');
        .to.be.reverted;
    });
  });
});
