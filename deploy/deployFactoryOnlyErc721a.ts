import { ethers, upgrades, run } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    // Change this to your deployed marketplace contract address before running deployment.
    const marketplaceAddress = ethers.ZeroAddress;
    if (marketplaceAddress === ethers.ZeroAddress) {
      throw new Error("marketplaceAddress is zero; set it to deployed marketplace contract address");
    }

    const archetypeAddress = '0xA4e86E9D918FB8bD642c1a1Ea688B7aa557082b1'
    console.log("Archetype deployed to:", archetypeAddress);

    const Factory = await ethers.getContractFactory("FactoryErc721a");

    const factory = await Factory.deploy(archetypeAddress, marketplaceAddress);

    const factoryAddress = await factory.getAddress();

    console.log("Contract Factory deployed to:", factoryAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
