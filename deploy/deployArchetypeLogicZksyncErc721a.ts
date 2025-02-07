import { ethers, upgrades, run } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const ArchetypeLogic = await ethers.getContractFactory(
    "ArchetypeLogicErc721a"
  );
  const archetypeLogic = await ArchetypeLogic.deploy();
  const archetypeLogicAddress = await archetypeLogic.getAddress();

  console.log("Archetype Logic deployed to:", archetypeLogicAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

//   async function deployProxy(
//   Contract: ethers.ContractFactory,
//   args: unknown[] = [],
//   opts: {
//     initializer: string | false,
//     unsafeAllow: ValidationError[],
//     kind: 'uups' | 'transparent',
//   } = {},
// ): Promise<ethers.Contract>
