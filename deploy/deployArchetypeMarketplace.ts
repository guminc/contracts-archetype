import { ethers } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const ArchetypeMarketplace = await ethers.getContractFactory("ArchetypeMarketplace");

  const archetypeMarketplace = await ArchetypeMarketplace.deploy();

  const address = await archetypeMarketplace.getAddress();

  console.log(`Contract deployed to ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
