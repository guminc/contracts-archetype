import * as dotenv from "dotenv";
import { HardhatUserConfig, task } from "hardhat/config";

import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@matterlabs/hardhat-zksync";
import "@matterlabs/hardhat-zksync-deploy";
import "hardhat-gas-reporter";
require("hardhat-contract-sizer");

dotenv.config();

const privateKey = process.env.PRIVATE_KEY || "";

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      zksync: false, //true,
    },
    sepolia: {
      accounts: [privateKey],
      url: "https://sepolia.infura.io/v3/569cee6284754b9e86ff2e5e55a0dc22",
      chainId: 11155111,
    },
    mainnet: {
      accounts: [privateKey],
      url: "https://mainnet.infura.io/v3/569cee6284754b9e86ff2e5e55a0dc22",
      chainId: 1,
    },
    blast_sepolia: {
      accounts: [privateKey],
      url: "https://sepolia.blast.io",
      chainId: 168587773,
    },
    blast_mainnet: {
      accounts: [privateKey],
      url: "https://rpc.blast.io",
      chainId: 81457,
    },
    base_sepolia: {
      url: "https://sepolia.base.org",
      accounts: [privateKey],
      chainId: 84532,
    },
    base_mainnet: {
      url: "https://mainnet.base.org",
      accounts: [privateKey],
      chainId: 8453,
    },
    berachain_bartio: {
      url: "https://bartio.rpc.berachain.com",
      accounts: [privateKey],
      chainId: 80084,
    },
    sanko_mainnet: {
      accounts: [privateKey],
      url: "https://mainnet.sanko.xyz",
      chainId: 1996,
    },
    arbitrum_mainnet: {
      accounts: [privateKey],
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
    },
    soneium_minato: {
      accounts: [privateKey],
      url: "https://rpc.minato.soneium.org",
      chainId: 1946,
    },
    polygon_mainnet: {
      accounts: [privateKey],
      url: "https://polygon-rpc.com",
      chainId: 137,
    },
    apechain_mainnet: {
      accounts: [privateKey],
      url: "https://rpc.apechain.com",
      chainId: 33139,
    },
    soneium_mainnet: {
      accounts: [privateKey],
      url: "https://soneium.rpc.scs.startale.com?apikey=orREnyi7m4OGukzUGgFnOXGvzsEzIzct",
      chainId: 1868,
    },
    superposition: {
      accounts: [privateKey],
      url: "https://rpc.superposition.so",
      chainId: 55244,
    },
    abstract_testnet: {
      accounts: [privateKey],
      url: "https://api.testnet.abs.xyz",
      verifyURL:
        "https://api-explorer-verify.testnet.abs.xyz/contract_verification",
      chainId: 11124,
      ethNetwork: "sepolia",
      zksync: true,
    },
  },
  zksolc: {
    version: "latest",
    settings: {
      // find all available options in the official documentation
      // https://docs.zksync.io/build/tooling/hardhat/hardhat-zksync-solc#configuration
      libraries: {
        "contracts/ERC721a/ArchetypeLogicErc721a.sol": {
          ArchetypeLogicErc721a: "0x9Ddc454ca1169CEf98D5D8572B02994b66e53CEe", // update
        },
        "contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol": {
          ArchetypeLogicErc1155Random:
            "0x9Ddc454ca1169CEf98D5D8572B02994b66e53CEe", // update
        },
        "contracts/BURGERS404/ArchetypeLogicBurgers404.sol": {
          ArchetypeLogicBurgers404:
            "0x9Ddc454ca1169CEf98D5D8572B02994b66e53CEe", // update
        },
      },
    },
  },
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  sourcify: {
    enabled: false,
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      blast_mainnet: process.env.BLASTSCAN_API_KEY || "",
      arbitrum_mainnet: process.env.ARBSCAN_API_KEY || "",
      polygon_mainnet: process.env.POLYSCAN_API_KEY || "",
      sanko_mainnet: "abc",
      berachain_bartio: "abc",
      soneium_minato: "abc",
      apechain_mainnet: "533JYG2IWFR2YA8RS7WR5NA9W8I79XATPU",
      soneium_mainnet: "abc",
      superposition: "abc"

    },
    customChains: [
      {
        network: "blast_mainnet",
        chainId: 81457,
        urls: {
          apiURL: "https://api.blastscan.io/api",
          browserURL: "https://blastscan.io",
        },
      },
      {
        network: "sanko_mainnet",
        chainId: 1996,
        urls: {
          apiURL: "https://explorer.sanko.xyz/api",
          browserURL: "https://explorer.sanko.xyz",
        },
      },
      {
        network: "arbitrum_mainnet",
        chainId: 42161,
        urls: {
          apiURL: "https://api.arbiscan.io/api",
          browserURL: "https://arbiscan.io",
        },
      },
      {
        network: "berachain_bartio",
        chainId: 80084,
        urls: {
          apiURL:
            "https://api.routescan.io/v2/network/testnet/evm/80084/etherscan",
          browserURL: "https://bartio.beratrail.io",
        },
      },
      {
        network: "soneium_minato",
        chainId: 1946,
        urls: {
          apiURL: "https://explorer-testnet.soneium.org/api",
          browserURL: "https://explorer-testnet.soneium.org",
        },
      },
      {
        network: "polygon_mainnet",
        chainId: 137,
        urls: {
          apiURL: "https://api.polygonscan.com/api",
          browserURL: "https://polygonscan.com",
        },
      },
      {
        network: "apechain_mainnet",
        chainId: 33139,
        urls: {
          apiURL: "https://api.apescan.io/api",
          browserURL: "https://apescan.io/",
        },
      },
      {
        network: "soneium_mainnet",
        chainId: 1868,
        urls: {
          // https://soneium.blockscout.com/
          // superbridge.app/soneium
          apiURL: "https://xckc3jvrzboyo8w4.blockscout.com/api",
          browserURL: "https://xckc3jvrzboyo8w4.blockscout.com",
        },
      },
      ,
      {
        network: "superposition",
        chainId: 55244,
        urls: {
          apiURL: "https://explorer.superposition.so/api",
          browserURL: "https://explorer.superposition.so",
        },
      },
    ],
  },
};

export default config;
