import { ethers, upgrades, run } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const archetypeAddress = '0x3C24Cd3CB12408C0f9350917ad4d85496f2D68e1'
    console.log("Archetype deployed to:", archetypeAddress);

    const Factory = await ethers.getContractFactory("FactoryZksyncErc721a");

    // const factory = await Factory.deploy(archetypeAddress);

    // const factoryAddress = await factory.getAddress();

    const factory = await Factory.attach('0x38A781410E4ba53899E3A19207C4c02DC8b9c18A')

    const result = await factory.setDeployFee(BigInt(1500000000000000))
    console.log("Contract Factory deployed to:", result);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
