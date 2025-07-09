import { ethers, run } from "hardhat";
import { ArchetypeErc1155, FactoryErc1155 } from "../typechain-types";
import { BaseContract } from "ethers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}

async function main() {
  const Factory = await ethers.getContractFactory("FactoryErc1155");
  const factory = asContractType<FactoryErc1155>(
    Factory.attach("0x51b5EFA958Bfa187AD0B4B9D20c83BaCA8172018")
  );
  
  const factoryAddress = await factory.getAddress();
  console.log("ERC1155 Factory is:", factoryAddress);
  
  const [accountZero] = await ethers.getSigners();
  
  const newContract = await factory.createCollection(
    accountZero.address,
    "The Superposition OG Badge",
    "OG",
    {
      baseUri: "", // Replace with actual metadata URI
      affiliateSigner: "0x1f285dD528cf4cDE3081C6d48D9df7A4F8FA9383",
      maxSupply: [2**32 - 1], // Infinite supply for single token (tokenId 1)
      maxBatchSize: 1000,
      affiliateFee: 0,
      affiliateDiscount: 0,
      defaultRoyalty: 500,
    },
    {
      ownerBps: 9500,
      platformBps: 500,
      partnerBps: 0,
      superAffiliateBps: 0,
      partner: "0x0000000000000000000000000000000000000000",
      superAffiliate: "0x0000000000000000000000000000000000000000",
      ownerAltPayout: "0x0000000000000000000000000000000000000000",
    }
  );
  
  console.log({ newContract });
  const result = await newContract.wait();
  console.log({ result });
  
  const newCollectionAddress = result.logs[0].address || "";
  console.log({ newCollectionAddress });
  
  console.log("Collection deployed successfully!");
  console.log("Collection Address:", newCollectionAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });