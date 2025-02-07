import { ethers, run } from "hardhat";
import { ArchetypeErc721a, FactoryErc721a } from "../typechain-types";
import { BaseContract } from "ethers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}

async function main() {
    
  const Factory = await ethers.getContractFactory("FactoryZksyncErc721a");
  const factory = asContractType<FactoryErc721a>(
    Factory.attach("0xFeC3d38CCed2d70a10Be08ea7c245f5c6E5DceA1")
  );
  const factoryAddress = await factory.getAddress();
  console.log("Contract Factory is:", factoryAddress);

  const [accountZero] = await ethers.getSigners();

  console.log("Creating collection...");
//   const createTx = await factory.createCollection(
//     accountZero.address,
//     "test main",
//     "TESTM",
//     {
//       baseUri: "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
//       affiliateSigner: "0x1f285dD528cf4cDE3081C6d48D9df7A4F8FA9383",
//       maxSupply: 5000,
//       maxBatchSize: 20,
//       affiliateFee: 1500,
//       affiliateDiscount: 0,
//       defaultRoyalty: 500,
//     },
//     {
//       ownerBps: 9500,
//       platformBps: 250,
//       partnerBps: 250,
//       superAffiliateBps: 0,
//       partner: "0xC80A1105CA41506A758F19489FDCBAfF8ad84ed1",
//       superAffiliate: ethers.ZeroAddress,
//       ownerAltPayout: ethers.ZeroAddress,
//     },
//     {
//       gasLimit: 1000000
//     }
//   );

//   console.log("Creation transaction sent:", createTx.hash);
//   const receipt = await createTx.wait();
  
//   // Find ContractDeployed event and get contract address
//   const contractDeployedEvent = receipt.logs.find(
//     (log: any) => log.topics[0] === "0x290afdae231a3fc0bbae8b1af63698b0a1d79b21ad17df0342dfb952fe74f8e5"
//   );
  
//   if (!contractDeployedEvent) {
//     throw new Error("ContractDeployed event not found in logs");
//   }
  
//   console.log(contractDeployedEvent)
//   const newCollectionAddress = contractDeployedEvent.topics[3];
//   console.log("New collection deployed at:", newCollectionAddress);
  const newCollectionAddress = "0x46ac46fdf9a24e66306bbe0dd298f14c50a69786"

  // Attach to the new contract
  const ArchetypeLogic = await ethers.getContractFactory("ArchetypeLogicErc721a");
  const archetypeLogic = await ArchetypeLogic.attach(
    "0x9Ddc454ca1169CEf98D5D8572B02994b66e53CEe"
  );
  
  const Archetype = await ethers.getContractFactory("ArchetypeErc721a", {
    libraries: {
      ArchetypeLogicErc721a: await archetypeLogic.getAddress(),
    },
  });
  
  const archetype = asContractType<ArchetypeErc721a>(
    Archetype.attach(newCollectionAddress)
  );

  console.log("Setting invite...");
//   const inviteTx = await archetype.setInvite(
//     ethers.ZeroHash,
//     ethers.ZeroHash,
//     {
//       price: ethers.parseEther("0.010"),
//       start: 0,
//       end: 0,
//       limit: 2 ** 32 - 1,
//       maxSupply: 2 ** 32 - 1,
//       unitSize: 1,
//       tokenAddress: ethers.ZeroAddress,
//       isBlacklist: false,
//     },
//     {
//       gasLimit: 1000000
//     }
//   );

//   console.log("SetInvite transaction sent:", inviteTx.hash);
//   await inviteTx.wait();
//   console.log("Invite set successfully");

  console.log("Minting...");
  const mintTx = await archetype.mint(
    { key: ethers.ZeroHash, proof: [] },
    10,
    ethers.ZeroAddress,
    "0x",
    {
      value: ethers.parseEther("0.01"),
      gasLimit: 1000000
    }
  );

  console.log("Mint transaction sent:", mintTx.hash);
  const mintReceipt = await mintTx.wait();
  console.log("Mint successful!");

  await sleep(120 * 1000); // Wait 2 minutes before verification

  try {
    await run("verify:verify", {
      address: newCollectionAddress,
      constructorArguments: [],
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.error("Verification failed:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });