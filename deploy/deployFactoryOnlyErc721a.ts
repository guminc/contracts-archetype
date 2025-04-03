import { ethers, upgrades, run } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const archetypeAddress = '0x1a357b2246aa7A620A0d4F044e28CDC4f10800F8'
    console.log("Archetype deployed to:", archetypeAddress);

    const Factory = await ethers.getContractFactory("FactoryZksyErc721a");

    const factory = await Factory.deploy(archetypeAddress);

    const factoryAddress = await factory.getAddress();

    console.log("Contract Factory deployed to:", factoryAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });