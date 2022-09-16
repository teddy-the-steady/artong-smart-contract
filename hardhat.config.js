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
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 1337
    },
    rinkeby: {
      url: 'https://rinkeby.infura.io/v3/c60789555fff407eabc1c2bfa1330684',
      accounts: [process.env.privateKey],
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
