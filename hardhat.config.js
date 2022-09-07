require('dotenv').config();
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.9",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 1337
    },
    // mainnet: {
    //   url: `https://rpcapi.fantom.network`,
    //   chainId: 250,
    //   accounts: [`0x${PRIVATE_KEY}`]
    // },
    // testnet: {
    //   url: `https://rpcapi-tracing.testnet.fantom.network`,
    //   chainId: 4002,
    //   accounts: [`0x${PRIVATE_KEY}`]
    // },
  },
};
