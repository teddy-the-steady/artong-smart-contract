require('dotenv').config();
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  mocha: {
    timeout: 100000000
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 1337
    },
    ropsten: {
      url: 'https://ropsten.infura.io/v3/c60789555fff407eabc1c2bfa1330684',
      accounts: [
        process.env.PRIVATE_KEY_2,
        process.env.PRIVATE_KEY_1,
        process.env.PRIVATE_KEY_3,
        process.env.PRIVATE_KEY_4,
        process.env.PRIVATE_KEY_5,
      ],
      gas: 2100000,
      gasPrice: 8000000000,
    }
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
