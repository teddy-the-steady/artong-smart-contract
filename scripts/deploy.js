const constants = require('./constants');
const { ethers, upgrades } = require('hardhat');
const fs = require('fs');

async function main() {
  const Marketplace = await ethers.getContractFactory('ArtongMarketplace');
  console.log('Deploying Marketplace...');
  const marketplace = await upgrades.deployProxy(
    Marketplace,
    [constants.PLATFORM_FEE, constants.TREASURY_ADDRESS],
    { initializer: 'initialize' }
  );
  await marketplace.deployed();
  console.log('Marketplace deployed to:', marketplace.address);

  const Factory = await ethers.getContractFactory('ArtongNFTFactory');
  console.log('Deploying Factory...');
  const factory = await Factory.deploy(
    marketplace.address,
    constants.TREASURY_ADDRESS,
    constants.PLATFORM_FEE
  );
  await factory.deployed();
  console.log('Factory deployed to:', factory.address);

  constants['MARKETPLACE'] = marketplace.address;
  constants['FACTORY'] = factory.address;
    
  fs.writeFileSync(
    'scripts/constants.js',
    `module.exports = ${JSON.stringify(constants, null, "\t")}
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });