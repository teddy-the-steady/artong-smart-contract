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
const thirdTokenId = 3;
const nonExistentTokenId = 99;
const zeroAddress = '0x0000000000000000000000000000000000000000';
const sampleUri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

const ACCOUNT1 = '0xacf901ebdca03c6a74ee9456727f92caff3c35a6';
const ACCOUNT2 = '0xF042403Cdf2cB073a2A371Dce25A4F94dc8660DF';
const ACCOUNT3 = '0x2A4e0CCF650815AAC184790CB9e6bD815239682e';
const ACCOUNT4 = '0xD7e17567Bd528C073f71ff174d1f706bBA424E72';
const ACCOUNT5 = '0x38f89664ABB61eD691dEb236bB984D32efd0E026';

describe('ArtongNFT', async function() {
  before(async function () {
    this.ArtongNFT = await ethers.getContractFactory('ArtongNFT');
    this.ArtongMarketplace = await ethers.getContractFactory('ArtongMarketplace');
    this.ArtongNFTFactory = await ethers.getContractFactory('ArtongNFTFactory');

    const [owner, feeReceipient, randomUser1, randomUser2, _] = await ethers.getSigners();
    // const owner = await ethers.getSigner(ACCOUNT2); // set metamask account 2
    // const feeReceipient = await ethers.getSigner(ACCOUNT1);
    // const randomUser1 = await ethers.getSigner(ACCOUNT3);
    // const randomUser2 = await ethers.getSigner(ACCOUNT4);

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

    const factory = await this.ArtongNFTFactory.deploy(
      marketplace.address,
      feeReceipient.address,
      platformFee
    );
    await factory.deployed();
    console.log('factory deployed to:', factory.address);

    this.owner = owner;
    this.feeReceipient = feeReceipient;
    this.randomUser1 = randomUser1;
    this.randomUser2 = randomUser2;
    this.marketplace = marketplace;
    this.artongNft = artongNft;
    this.factory = factory;
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
          // .to.be.revertedWith("ERC721: invalid token ID");
          .to.be.reverted;
      });

      context('when owner burns an existing token', function() {
        before(async function() {
          await this.artongNft.mint(this.randomUser1.address, sampleUri, sampleUri, 0);
        });

        it('Should fail to burn a token', async function () {
          await expect(this.artongNft.connect(this.owner).burn(firstTokenId))
            // .to.be.revertedWith('ERC721: caller is not token owner nor approved');
            .to.be.reverted;
        });
      });
    });
  });

  describe('policy', function() {
    context('when owner set policy to 1', function() {
      it('Should succeed and return policy 1', async function() {
        await expect(this.artongNft.connect(this.owner).setPolicy(1))
          .to.emit(this.artongNft, 'UpdatePolicy')
          .withArgs(1, this.owner.address);

        expect(await this.artongNft.policy()).to.equal(1);
      });
    });

    context('when policy is Immediate = 0', async function() {
      it('Should succeed to mint', async function() {
        await expect(this.artongNft.connect(this.owner).setPolicy(0))
          .to.emit(this.artongNft, 'UpdatePolicy')
          .withArgs(0, this.owner.address);

        await expect(this.artongNft.mint(this.randomUser1.address, sampleUri, sampleUri, 0))
          .to.emit(this.artongNft, 'Transfer')
          .withArgs(zeroAddress, this.randomUser1.address, secondTokenId);
      });
    });

    context('when policy is Approved = 1', async function() {
      it('Should fail to mint', async function() {
        await expect(this.artongNft.connect(this.owner).setPolicy(1))
          .to.emit(this.artongNft, 'UpdatePolicy')
          .withArgs(1, this.owner.address);

        await expect(this.artongNft.mint(this.randomUser1.address, sampleUri, sampleUri, 0))
          // .to.be.revertedWith('Policy only allows lazy minting');
          .to.be.reverted;
      });
    });

    context('when random user tries to set policy', function() {
      it('Should fail', async function() {
        await expect(this.artongNft.connect(this.randomUser1).setPolicy(0))
          // .to.be.revertedWith("Ownable: caller is not the owner");
          .to.be.reverted;
      });
    })

    context('when policy is Immediate = 0', async function() {
      context('with minted tokens', function () {
        describe('maxAmount', function() {
          context('when maximum amount is reached', function() {
            it('Should fail to mint', async function() {
              await expect(this.artongNft.connect(this.owner).setPolicy(0))
                .to.emit(this.artongNft, 'UpdatePolicy')
                .withArgs(0, this.owner.address);
              
              await this.artongNft.mint(this.randomUser2.address, sampleUri, sampleUri, 0);
              await this.artongNft.mint(this.randomUser2.address, sampleUri, sampleUri, 0);
              
              await expect(this.artongNft.mint(this.marketplace.address, sampleUri, sampleUri, 0))
                // .to.revertedWith("Maximum number of NFTs reached");
                .to.be.reverted;
            });
          });
        });
  
        describe('random user', function() {
          it('Should fail to pause contract', async function() {
            await expect(this.artongNft.connect(this.randomUser1).pause())
              // .to.be.revertedWith("Not authorized");
              .to.be.reverted;
          });
      
          it('Should fail to burn a token', async function() {
            await expect(this.artongNft.connect(this.randomUser2).burn(secondTokenId))
              // .to.be.revertedWith("ERC721: caller is not token owner nor approved");
              .to.be.reverted;
          });
        });
  
        describe('minter', function() {
          it('Should be able to burn minted token', async function() {
            await expect(this.artongNft.connect(this.randomUser1).burn(secondTokenId))
              .to.emit(this.artongNft, 'Transfer')
              .withArgs(this.randomUser1.address, zeroAddress, secondTokenId);
          });
        });
  
        describe('balanceOf', function () {
          context('when the given address owns some tokens', function () {
            it('Should return the amount of tokens owned by the given address', async function () {
              expect(await this.artongNft.balanceOf(this.randomUser1.address)).to.equal(1);
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
                // .to.be.revertedWith("ERC721: address zero is not a valid owner");
                .to.be.reverted;
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
                // .to.be.revertedWith("ERC721: invalid token ID");
                .to.be.reverted;
            });
          });
        });
      });
    });
  });

  describe('factory', function() {
    context('when name is empty', function() {
      it('Should fail to create contract', async function() {
        await expect(this.factory.createNFTContract(
          '',
          symbol,
          maxAmount,
          policy
        // )).to.be.revertedWith("Name is required");
        )).to.be.reverted;
      });
    });

    context('when symbol is empty', function() {
      it('Should fail to create contract', async function() {
        await expect(this.factory.createNFTContract(
          name,
          '',
          maxAmount,
          policy
        // )).to.be.revertedWith("Symbol is required");
        )).to.be.reverted;
      });
    });

    context('when maxAmount is less or equal to 0', function() {
      it('Should fail to create contract', async function() {
        await expect(this.factory.createNFTContract(
          name,
          symbol,
          0,
          policy
        // )).to.be.revertedWith("MaxAmount has to be positive number");
        )).to.be.reverted;
      });
    });
  
    context('when policy is neither 0 nor 1', function() {
      it('Should fail to create contract', async function() {
        await expect(this.factory.createNFTContract(
          name,
          symbol,
          maxAmount,
          3
        // )).to.be.revertedWith("function was called with incorrect parameters");
        )).to.be.reverted;
      });
    });

    context('with proper paramters', function() {
      it('Should successfully create contract', async function() {
        await expect(this.factory.createNFTContract(
            name,
            symbol,
            maxAmount,
            policy
        ))
        .to.emit(this.factory, 'ContractCreated')
        .withArgs(
          this.owner.address,
          '0x553BED26A78b94862e53945941e4ad6E4F2497da',
          name,
          symbol,
          maxAmount,
          policy
        );
      });
    });
  });

  describe('minting', function() {
    it('who has what', async function() {
      await expect(await this.artongNft.ownerOf(firstTokenId)).to.equal(this.randomUser1.address);
    });

    context('when minter already registered', function() {
      it('Should fail to register minter', async function() {
        await expect(this.marketplace.registerMinter(
          this.randomUser1.address,
          this.artongNft.address,
          firstTokenId
        // )).to.be.revertedWith('minter already registered');
        )).to.be.reverted;
      });
    });
  });

  describe('self-destruct', function() {
    context('when non owner tries to desturct', function() {
      it('Should fail to destruct NFT contract', async function() {
        await expect(this.artongNft.connect(this.randomUser2).destroy(
          this.artongNft.address
        )).to.be.reverted;

        await expect(await this.artongNft.policy()).to.equal(0);
      });

      it('Should fail to destruct factory contract', async function() {
        await expect(this.factory.connect(this.randomUser2).destroy(
          this.factory.address
        )).to.be.reverted;

        await expect(await this.factory.marketplace()).to.equal(
          this.marketplace.address
        );
      });
    });

    context('when owner tries to desturct', function() {
      it('Should successfully destruct NFT contract', async function() {
        await expect(this.artongNft.connect(this.owner).destroy(
          this.artongNft.address
        ))
        .to.emit(this.artongNft, 'Destoried')
        .withArgs(this.owner.address);
      });

      it('Should successfully destruct factory contract', async function() {
        await expect(this.factory.connect(this.owner).destroy(
          this.factory.address
        ))
        .to.emit(this.factory, 'Destoried')
        .withArgs(this.owner.address);
      });
    });
  });
});
