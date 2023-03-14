require('dotenv').config();
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-etherscan');
require("hardhat-gas-reporter");

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
    timeout: 1000000000
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 1337
    },
    // goerli: {
    //   url: 'https://goerli.infura.io/v3/c60789555fff407eabc1c2bfa1330684',
    //   accounts: [
    //     process.env.PRIVATE_KEY_2,
    //     process.env.PRIVATE_KEY_1,
    //     process.env.PRIVATE_KEY_3,
    //     process.env.PRIVATE_KEY_4,
    //     process.env.PRIVATE_KEY_5,
    //   ],
    //   gas: 2100000,
    //   gasPrice: 8000000000,
    // },
    mainnet: {
      url: 'https://mainnet.infura.io/v3/ae3e3f39ab144c7b9a0ef19d3ff80aa9',
      accounts: [process.env.MAINNET_PRIVATE_KEY]
    },
  },
  etherscan: {
    apiKey: "4YV6C97YRA8G12NBTQZXMXYUZVWIJI4JM8"
  }
};
