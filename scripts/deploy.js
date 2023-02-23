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

  const ArtongNFT = await ethers.getContractFactory('ArtongNFT');
  console.log('Deploying Beacon and ArtongNFT...');
  const beacon = await upgrades.deployBeacon(ArtongNFT);
  await beacon.deployed();
  console.log("Beacon deployed to:", beacon.address);

  console.log('Deploying BeaconProxy...');
  const artongNFTproxy = await upgrades.deployBeaconProxy(
    beacon,
    ArtongNFT,
    [
      'artongNFTproxy',
      'ATGP',
      marketplace.address,
      constants.PLATFORM_FEE,
      constants.TREASURY_ADDRESS,
      0,
      1,
      '0xF042403Cdf2cB073a2A371Dce25A4F94dc8660DF'
    ]
  );
  await artongNFTproxy.deployed();
  console.log('ArtongNFTproxy deployed to:', artongNFTproxy.address);

  const Factory = await ethers.getContractFactory('ArtongNFTFactory');
  console.log('Deploying Factory...');
  const factory = await Factory.deploy(
    marketplace.address,
    constants.TREASURY_ADDRESS,
    constants.PLATFORM_FEE,
    beacon.address
  );
  await factory.deployed();
  console.log('Factory deployed to:', factory.address);

  constants['MARKETPLACE'] = marketplace.address;
  constants['BEACON'] = beacon.address;
  constants['BEACONPROXY'] = artongNFTproxy.address;
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