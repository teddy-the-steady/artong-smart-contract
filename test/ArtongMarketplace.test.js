const chai = require('chai');
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { solidity } = require('ethereum-waffle');
const { before, it } = require('mocha');
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
const price = ethers.utils.parseEther('0.001');
const newPrice = ethers.utils.parseEther('0.002');
const pastBlockTimestamp = 0;
const futureBlockTimestamp = 1;

describe('ArtongMarketplace', function() {
  before(async function () {
    this.ArtongMarketplace = await ethers.getContractFactory('ArtongMarketplace');
    this.Nft = await ethers.getContractFactory('ArtongNFT');
  });

  beforeEach(async function () {
    const [owner, feeReceipient, randomUser1, randomUser2, _] = await ethers.getSigners();
    const marketplace = await upgrades.deployProxy(
      this.ArtongMarketplace,
      [platformFee, feeReceipient.address],
      { initializer: 'initialize' }
    );
    const nft = await this.Nft.deploy(
      name,
      symbol,
      marketplace.address,
      platformFee,
      feeReceipient.address,
      maxAmount,
      policy
    );
    
    nft.mint(randomUser1.address, sampleUri);
    nft.mint(randomUser2.address, sampleUri);

    this.owner = owner;
    this.feeReceipient = feeReceipient;
    this.randomUser1 = randomUser1;
    this.randomUser2 = randomUser2;
    this.marketplace = marketplace;
    this.nft = nft;
  });

  describe('minter', function() {
    it('Should fail to register existing minter', async function() {
      await expect(this.marketplace.registerMinter(
        this.randomUser1.address,
        this.nft.address,
        firstTokenId
      )).to.be.revertedWith('minter already registered');
    });
  });

  describe('platformFee and feeReciepient', function() {
    context('when none owner tries to update', function() {
      it('Should fail to update platformFee', async function() {
        await expect(this.marketplace.connect(this.feeReceipient)
          .updatePlatformFee(300))
          .to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('Should fail to update feeReciepient', async function() {
        await expect(this.marketplace.connect(this.feeReceipient)
          .updatePlatformFeeRecipient(this.randomUser1.address))
          .to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    context('when owner tries to update', function() {
      it('Should be able to update platformFee', async function() {
        await expect(this.marketplace.connect(this.owner)
          .updatePlatformFee(300))
          .to.emit(this.marketplace, 'UpdatePlatformFee')
          .withArgs(300);
      });

      it('Should fail to update feeReciepient', async function() {
        await expect(this.marketplace.connect(this.owner)
          .updatePlatformFeeRecipient(this.randomUser1.address))
          .to.emit(this.marketplace, 'UpdatePlatformFeeRecipient')
          .withArgs(this.randomUser1.address);
      });
    });
  });

  describe('Royalty', function() {
    context('when royalty > 10000', function() {
      it('Should fail to update tokenRoyalty', async function() {
        await expect(this.marketplace.connect(this.randomUser1).updateTokenRoyalty(30000))
          .to.be.revertedWith('invalid royalty');
      });

      it('Should fail to update collectionRoyalty', async function() {
        await expect(this.marketplace.connect(this.randomUser1).updateCollectionRoyalty(
          this.nft.address,
          10010
        )).to.be.revertedWith('invalid royalty');
      });
    });

    context('when none owner tries to set collectionRoyalty', function() {
      it('Should fail to update collectionRoyalty', async function() {
        await expect(this.marketplace.connect(this.randomUser1).updateCollectionRoyalty(
          this.nft.address,
          500
        )).to.be.revertedWith('user not approved for this item');
      });
    });

    it('Should be able to update collectionRoyalty', async function() {
      await expect(this.marketplace.connect(this.owner).updateCollectionRoyalty(
        this.nft.address,
        10000
      )).to.emit(this.marketplace, 'UpdateCollectionRoyalty')
        .withArgs(this.owner.address, this.nft.address, 10000);
    });

    it('Should be able to update tokenRoyalty', async function() {
      await expect(this.marketplace.connect(this.randomUser2).updateTokenRoyalty(
        300
      )).to.emit(this.marketplace, 'UpdateTokenRoyalty')
        .withArgs(this.randomUser2.address, 300);
    });
  });

  describe('Listing Item', function () {
    context('when not owning NFT', function() {
      it('Should revert listing', async function() {
        await expect(this.marketplace.connect(this.randomUser2).listItem(
          this.nft.address,
          firstTokenId,
          price
        )).to.be.revertedWith("not owning item");
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
        )).to.be.revertedWith("not listed item");
      });
    });

    context('when not owning the item', function() {
      it('Should fail canceling item', async function() {
        await expect(this.marketplace.connect(this.randomUser2).cancelListing(
          this.nft.address,
          firstTokenId
        )).to.be.revertedWith("not owning item");
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
        )).to.be.revertedWith("not listed item");
      });
    });

    context('when not owning the item', function() {
      it('Should fail updating item', async function() {
        await expect(this.marketplace.connect(this.randomUser1).updateListing(
          this.nft.address,
          secondTokenId,
          newPrice,
        )).to.be.revertedWith("not owning item");
      });
    });
  });

  describe('Buying Item', function() {
    beforeEach(async function() {
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

    context('when seller doesnt own the item', function() {
      it('Should fail buying item', async function() {
        await expect(this.marketplace.connect(this.randomUser2).buyItem(
          this.nft.address,
          secondTokenId,
          this.randomUser1.address
        )).to.be.revertedWith("not owning item");
      });
    });

    context('when the amount is not enough', function() {
      it('Should fail buying item', async function() {
        const amountPaid = price / 2;
        
        await expect(this.marketplace.connect(this.randomUser2).buyItem(
          this.nft.address,
          firstTokenId,
          this.randomUser1.address,
          { value: amountPaid }
        )).to.be.revertedWith("payment amount not enough");
      });
    });

    context('when the amount is enough', function() {
      context('when the amount = price', function() {
        it('Should successfully purchase item', async function() {
          await expect(await this.nft.ownerOf(firstTokenId)).to.equal(this.randomUser1.address);

          await expect(await this.marketplace.connect(this.randomUser2).buyItem(
            this.nft.address,
            firstTokenId,
            this.randomUser1.address,
            { value: price }
          )).to.emit(this.marketplace, 'ItemSold')
            .withArgs(
              this.randomUser1.address,
              this.randomUser2.address,
              this.nft.address,
              firstTokenId,
              price
            )
            .to.changeEtherBalances(
              [this.randomUser2, this.feeReceipient],
              [
                price.mul(-1),
                price * platformFee / 10000
              ]
            );

            await expect(await this.marketplace.getArtongBalance(
              parseInt(new Date().getTime() / 1000),
              this.randomUser1.address
            )).to.equal(price * (10000 - platformFee) / 10000);

            await expect(await this.nft.ownerOf(firstTokenId)).to.equal(this.randomUser2.address);
        });

        context('when tokenRoyalty, collectionRoyalty exsists', function() {
          this.beforeEach(async function() {
            await this.marketplace.updateCollectionRoyalty(this.nft.address, 250);
            await this.marketplace.connect(this.randomUser1).updateTokenRoyalty(300);
          });

          it('Should set proper amount of royalties after successful sequential purchase', async function() {
            await expect(await this.marketplace.connect(this.randomUser2).buyItem(
              this.nft.address,
              firstTokenId,
              this.randomUser1.address,
              { value: price }
            )).to.emit(this.marketplace, 'ItemSold')
              .withArgs(
                this.randomUser1.address,
                this.randomUser2.address,
                this.nft.address,
                firstTokenId,
                price
              )
              .to.changeEtherBalances(
                [this.randomUser2, this.feeReceipient],
                [
                  price.mul(-1),
                  price * platformFee / 10000
                ]
              );

            await expect(await this.marketplace.getArtongBalance(
              parseInt(new Date().getTime() / 1000),
              this.randomUser1.address
            )).to.equal(price * (10000 - platformFee - 250) / 10000);

            await expect((await this.marketplace.getCollectionRoyalty(this.nft.address))[1])
              .to.be.equal(price * 250 / 10000);

            await expect(await this.marketplace.connect(this.randomUser2).listItem(
              this.nft.address,
              firstTokenId,
              newPrice
            )).to.emit(this.marketplace, 'ItemListed')
              .withArgs(this.randomUser2.address, this.nft.address, firstTokenId, newPrice);

            await expect(await this.marketplace.connect(this.owner).buyItem(
              this.nft.address,
              firstTokenId,
              this.randomUser2.address,
              { value: newPrice }
            )).to.emit(this.marketplace, 'ItemSold')
              .withArgs(
                this.randomUser2.address,
                this.owner.address,
                this.nft.address,
                firstTokenId,
                newPrice
              )
              .to.changeEtherBalances(
                [this.owner, this.feeReceipient],
                [
                  newPrice.mul(-1),
                  newPrice * platformFee / 10000
                ]
              );

            await expect(await this.marketplace.getArtongBalance(
              parseInt(new Date().getTime() / 1000),
              this.randomUser1.address
            )).to.equal(
              price * (10000 - platformFee - 250) / 10000 +
              newPrice * 300 / 10000
            );

            await expect((await this.marketplace.getCollectionRoyalty(this.nft.address))[1])
              .to.be.equal((price * 250 / 10000) + (newPrice * 250 / 10000));
          });
        });
      });

      context('when the amount > price', function() {
        it('Should successfully purchase item', async function() {
          await expect(await this.nft.ownerOf(firstTokenId)).to.equal(this.randomUser1.address);

          await expect(await this.marketplace.connect(this.randomUser2).buyItem(
            this.nft.address,
            firstTokenId,
            this.randomUser1.address,
            { value: price.add(ethers.utils.parseEther('0.0003')) }
          )).to.emit(this.marketplace, 'ItemSold')
            .withArgs(
              this.randomUser1.address,
              this.randomUser2.address,
              this.nft.address,
              firstTokenId,
              price
            )
            .to.changeEtherBalances(
              [this.randomUser2, this.feeReceipient],
              [
                price.add(ethers.utils.parseEther('0.0003')).mul(-1),
                price * platformFee / 10000
              ]
            );

            await expect(await this.marketplace.getArtongBalance(
              parseInt(new Date().getTime() / 1000),
              this.randomUser2.address
            )).to.equal(ethers.utils.parseEther('0.0003'));

            await expect(await this.marketplace.getArtongBalance(
              parseInt(new Date().getTime() / 1000),
              this.randomUser1.address
            )).to.equal(price * (10000 - platformFee) / 10000);

            await expect(await this.nft.ownerOf(firstTokenId)).to.equal(this.randomUser2.address);
        });
      });
    });
  });

  describe('Offering Item', function() {
    const offerPrice = ethers.utils.parseEther('0.002');

    context('when self offer', function() {
      it('Should fail to create an offer', async function() {
        await expect(this.marketplace.connect(this.randomUser1).createOffer(
          this.nft.address,
          firstTokenId,
          futureBlockTimestamp,
          { value: offerPrice }
        )).to.be.revertedWith('cannot self offer');
      });
    });

    context('when offer amount < 0.001 ether', function() {
      it('Should fail to create an offer', async function() {
        await expect(this.marketplace.connect(this.randomUser1).createOffer(
          this.nft.address,
          firstTokenId,
          futureBlockTimestamp,
          { value: ethers.utils.parseEther('0.0005') }
        )).to.be.revertedWith('offer amount too small');
      });
    });

    context('when there is no offer', function() {
      it('Should be able to create an offer', async function() {
        await expect(this.marketplace.connect(this.randomUser1).createOffer(
          this.nft.address,
          secondTokenId,
          futureBlockTimestamp,
          { value: offerPrice }
        )).to.emit(this.marketplace, 'OfferCreated');
      });

      it('Should fail to accept offer', async function() {
        await expect(this.marketplace.connect(this.randomUser1).acceptOffer(
          this.nft.address,
          secondTokenId,
          this.randomUser2.address
        )).to.be.revertedWith('offer not exists or expired');
      });
    });

    context('when there are offers', function() {
      this.beforeEach(async function() {
        await this.marketplace.connect(this.randomUser1).createOffer(
          this.nft.address,
          secondTokenId,
          futureBlockTimestamp,
          { value: offerPrice }
        );
        await this.marketplace.connect(this.randomUser2).createOffer(
          this.nft.address,
          firstTokenId,
          futureBlockTimestamp,
          { value: offerPrice }
        );
        await this.marketplace.connect(this.feeReceipient).createOffer(
          this.nft.address,
          secondTokenId,
          futureBlockTimestamp,
          { value: offerPrice }
        );
        await this.marketplace.connect(this.feeReceipient).createOffer(
          this.nft.address,
          firstTokenId,
          pastBlockTimestamp,
          { value: offerPrice }
        );
      });

      it('Should fail to create offer on same token', async function() {
        await expect(this.marketplace.connect(this.randomUser1).createOffer(
          this.nft.address,
          secondTokenId,
          futureBlockTimestamp,
          { value: offerPrice }
        )).to.be.revertedWith('offer already created');
      });

      it('Should be able to create an offer over expired one', async function() {
        await expect(this.marketplace.connect(this.feeReceipient).createOffer(
          this.nft.address,
          firstTokenId,
          futureBlockTimestamp,
          { value: offerPrice }
        )).to.emit(this.marketplace, 'OfferCreated');
      });

      it('Should fail to accept offer of not owning token', async function() {
        await expect(this.marketplace.connect(this.randomUser1).acceptOffer(
          this.nft.address,
          secondTokenId,
          this.feeReceipient.address
        )).to.be.revertedWith('not owning item');
      });

      it('Should successfully accept offer and sell item', async function() {
        await expect(await this.nft.ownerOf(firstTokenId)).to.equal(this.randomUser1.address);

        await expect(await this.marketplace.getArtongBalance(
          parseInt(new Date().getTime() / 1000),
          this.randomUser1.address
        )).to.equal(0);
        
        await expect(await this.marketplace.connect(this.randomUser1).acceptOffer(
          this.nft.address,
          firstTokenId,
          this.randomUser2.address
        )).to.emit(this.marketplace, 'OfferAccepted')
          .withArgs(
            this.nft.address,
            firstTokenId,
            this.randomUser2.address,
          )
          .to.changeEtherBalances(
            [this.randomUser2, this.feeReceipient],
            [0, offerPrice * platformFee / 10000]
          );

        await expect(await this.marketplace.getArtongBalance(
          parseInt(new Date().getTime() / 1000),
          this.randomUser1.address
        )).to.equal(offerPrice * (10000 - platformFee) / 10000);

        await expect(await this.nft.ownerOf(firstTokenId)).to.equal(this.randomUser2.address);
      });
    });
  });
});