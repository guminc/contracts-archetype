import * as dotenv from "dotenv";
import { HardhatUserConfig, task } from "hardhat/config";

import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@matterlabs/hardhat-zksync";
import "@matterlabs/hardhat-zksync-deploy";
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
          ArchetypeLogicErc721a: "0x0000000000000000000000000000000000000000", // update
        },
        "contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol": {
          ArchetypeLogicErc1155Random:
            "0x0000000000000000000000000000000000000000", // update
        },
        "contracts/BRG404/ArchetypeLogicBrg404.sol": {
          ArchetypeLogicBrg404: "0x0000000000000000000000000000000000000000", // update
        },
      },
    },
  },
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  sourcify: {
    enabled: true,
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
    },
  },
};

export default config;
