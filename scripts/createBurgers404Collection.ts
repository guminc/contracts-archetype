import { ethers, run } from "hardhat";
import { ArchetypeBurgers404, FactoryBurgers404 } from "../typechain-types";
import { BaseContract } from "ethers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}

async function main() {
  // const Factory = await ethers.getContractFactory("FactoryBurgers404");

  // const factory = asContractType<FactoryBurgers404>(
  //   Factory.attach("0x3778BEd5e413005fA62FDc615CF7d9FaDb70B307")
  // );
  // const factoryAddress = await factory.getAddress();

  // console.log("Contract Factory is:", factoryAddress);

  // const [accountZero] = await ethers.getSigners();

  // const ERC20RATIO = 1000;
  // const newContract = await factory.createCollection(
  //   accountZero.address,
  //   "milkshake 404",
  //   "MILK",
  //   {
  //     baseUri:
  //       "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
  //     affiliateSigner: "0x1f285dD528cf4cDE3081C6d48D9df7A4F8FA9383",
  //     maxSupply: 25000 * ERC20RATIO,
  //     maxBatchSize: 1000 * ERC20RATIO,
  //     affiliateFee: 1500,
  //     affiliateDiscount: 0,
  //     defaultRoyalty: 500,
  //     remintPremium: 2500, // 25%
  //     erc20Ratio: ERC20RATIO,
  //   },
  //   {
  //     ownerBps: 9500,
  //     platformBps: 500,
  //     partnerBps: 0,
  //     superAffiliateBps: 0,
  //     partner: "0x0000000000000000000000000000000000000000",
  //     superAffiliate: "0x0000000000000000000000000000000000000000",
  //     ownerAltPayout: "0xdB143f70eC87a1dA6C5888eEA93b63f3BA9E4DF4",
  //   }
  // );

  // console.log({ newContract });

  // const result = await newContract.wait();

  // console.log({ result });

  // const newCollectionAddress = result.logs[0].address || "";
  // console.log({ newCollectionAddress });

  // const newCollectionAddress = "0x335b87CE157b2408248c0da05b224451Cfd26457";
  // console.log({ newCollectionAddress });

  // const ArchetypeLogic = await ethers.getContractFactory(
  //   "ArchetypeLogicBurgers404"
  // );
  // const archetypeLogic = await ArchetypeLogic.attach(
  //   "0xc31a98256D3FE041C3DeF27Faa213Fa230bE7B92"
  // );
  // const Archetype = await ethers.getContractFactory("ArchetypeBurgers404", {
  //   libraries: {
  //     ArchetypeLogicBurgers404: await archetypeLogic.getAddress(),
  //   },
  // });
  // const archetype = asContractType<ArchetypeBurgers404>(
  //   Archetype.attach(newCollectionAddress)
  // );

  // await archetype.setBonusInvite(
  //   ethers.ZeroHash,
  //   ethers.ZeroHash,
  //   {
  //     price: ethers.parseEther("0.000001"),
  //     start: 0,
  //     end: 0,
  //     limit: 2 ** 32 - 1,
  //     maxSupply: 2 ** 32 - 1,
  //     unitSize: 1,
  //     tokenAddress: ethers.ZeroAddress,
  //     isBlacklist: false,
  //     interval: 0,
  //     delta: 0,
  //     reservePrice: 0,
  //   },
  //   [
  //     {
  //       numMints: 10,
  //       numBonusMints: 4,
  //     },
  //     {
  //       numMints: 3,
  //       numBonusMints: 1,
  //     },
  //   ]
  // );

  const res = await archetype.mint(
    { key: ethers.ZeroHash, proof: [] },
    300,
    ethers.ZeroAddress,
    "0x",
    {
      value: ethers.parseEther("0.000001") * BigInt(3000),
    }
  );
  console.log(res);

  // await sleep(1000 * 120);

  // await run("verify:verify", {
  //   address: newCollectionAddress,
  //   constructorArguments: [],
  // });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// const _accounts = [
//   "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
//   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
//   "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
//   "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
//   "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
//   "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
//   "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
//   "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
//   "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
//   "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
//   "0xBcd4042DE499D14e55001CcbB24a551F3b954096",
//   "0x71bE63f3384f5fb98995898A86B02Fb2426c5788",
//   "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a",
//   "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec",
//   "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
//   "0xcd3B766CCDd6AE721141F452C550Ca635964ce71",
//   "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",
//   "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E",
//   "0xdD2FD4581271e230360230F9337D5c0430Bf44C0",
//   "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
// ];
