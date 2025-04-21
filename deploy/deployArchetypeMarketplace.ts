import { ethers } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BID_TOKEN_ADDRESSES: { [chainId: number]: string } = {
  // Base mainnet
  8453: "0x4200000000000000000000000000000000000006",
};

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  console.log(`Deploying to network with chain ID: ${chainId}`);
  
  // Get the bid token address based on chain ID
  const bidTokenAddress = BID_TOKEN_ADDRESSES[chainId]
  console.log(`Using bid token address: ${bidTokenAddress}`);

  const ArchetypeMarketplace = await ethers.getContractFactory("ArchetypeMarketplace");

  const archetypeMarketplace = await ArchetypeMarketplace.deploy(bidTokenAddress);

  const address = await archetypeMarketplace.getAddress();

  console.log(`Contract deployed to ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
