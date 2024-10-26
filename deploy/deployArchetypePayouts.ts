import { ethers } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const ArchetypePayouts = await ethers.getContractFactory("ArchetypePayouts");

  const archetypePayouts = await ArchetypePayouts.deploy();

  const address = await archetypePayouts.getAddress();

  console.log(`Contract deployed to ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
