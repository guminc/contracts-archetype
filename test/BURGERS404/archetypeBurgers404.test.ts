import { ethers } from "hardhat";

import { expect } from "chai";
import Invitelist from "../lib/invitelist";
import {
  IArchetypeBurgers404Config,
  IArchetypePayoutConfig,
} from "../lib/types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import ipfsh from "ipfsh";
import {
  ArchetypeBurgers404,
  ArchetypeBatch,
  ArchetypeLogicBurgers404,
  ArchetypePayouts,
  FactoryBurgers404,
  TestErc20,
} from "../../typechain-types";
import { BaseContract, Contract } from "ethers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_NAME = "Pookie";
const DEFAULT_SYMBOL = "POOKIE";
let AFFILIATE_SIGNER: SignerWithAddress;
let DEFAULT_CONFIG: IArchetypeBurgers404Config;
let DEFAULT_PAYOUT_CONFIG: IArchetypePayoutConfig;

// this is an IPFS content ID which stores a list of addresses ({address: string[]})
// eg: https://ipfs.io/ipfs/bafkreih2kyxirba6a6dyzt4tsdqb5iim3soprumtewq6garaohkfknqlaq
// utility for converting CID to bytes32: https://github.com/factoria-org/ipfsh
const CID_DEFAULT = "Qmbro8pnECVvjwWH6J9KyFXR8isquPFNgbUiHDGXhYnmFn";

const CID_ZERO = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const ZERO = "0x0000000000000000000000000000000000000000";
const BURN = "0x000000000000000000000000000000000000dEaD";
const HASHONE =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const HASH256 =
  "0x00000000000000000000000000000000000000000000000000000000000000ff";

const ERC20RATIO = 1000;
const ERC20UNIT = 10 ** 18;
const NFTUNIT = ERC20UNIT * ERC20RATIO;
const UINT32_MAX = 2 ** 32 - 1;

function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}
async function balanceOfNFT(
  contract: Contract,
  account: string,
  id: number
): Promise<number> {
  const ABI = ["function balanceOf(address,uint256) view returns (uint256)"];
  const erc1155interface = new ethers.Interface(ABI);
  const data = erc1155interface.encodeFunctionData("balanceOf", [account, id]);
  const result = await ethers.provider.call({
    to: await contract.getAddress(),
    data: data,
  });
  return Number(ethers.toBigInt(result));
}

describe("Factory", function () {
  let ArchetypeBurgers404;
  let archetype: ArchetypeBurgers404;
  let archetypeLogic: ArchetypeLogicBurgers404;
  let archetypeBatch: ArchetypeBatch;
  let archetypePayouts: ArchetypePayouts;
  let factory: FactoryBurgers404;

  before(async function () {
    AFFILIATE_SIGNER = (await ethers.getSigners())[4]; // account[4]
    DEFAULT_CONFIG = {
      baseUri:
        "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
      affiliateSigner: AFFILIATE_SIGNER.address,
      maxSupply: 5000 * ERC20RATIO,
      maxBatchSize: 100 * ERC20RATIO,
      affiliateFee: 1500,
      affiliateDiscount: 0,
      defaultRoyalty: 500,
      erc20Ratio: ERC20RATIO,
      remintPremium: 2000, // 20%
    };
    DEFAULT_PAYOUT_CONFIG = {
      ownerBps: 9500,
      platformBps: 500,
      partnerBps: 0,
      superAffiliateBps: 0,
      partner: ZERO,
      superAffiliate: ZERO,
      ownerAltPayout: ZERO,
    };

    const ArchetypeBatch = await ethers.getContractFactory("ArchetypeBatch");
    archetypeBatch = asContractType<ArchetypeBatch>(
      await ArchetypeBatch.deploy()
    );

    const ArchetypeLogicBurgers404 = await ethers.getContractFactory(
      "ArchetypeLogicBurgers404"
    );
    archetypeLogic = asContractType<ArchetypeLogicBurgers404>(
      await ArchetypeLogicBurgers404.deploy()
    );

    ArchetypeBurgers404 = await ethers.getContractFactory(
      "ArchetypeBurgers404",
      {
        libraries: {
          ArchetypeLogicBurgers404: await archetypeLogic.getAddress(),
        },
      }
    );

    const ArchetypePayouts = await ethers.getContractFactory(
      "ArchetypePayouts"
    );
    archetypePayouts = asContractType<ArchetypePayouts>(
      await ArchetypePayouts.deploy()
    );
    console.log(await archetypePayouts.getAddress());

    archetype = await ArchetypeBurgers404.deploy();
    const archetypeAddress = await archetype.getAddress();

    const FactoryBurgers404 = await ethers.getContractFactory(
      "FactoryBurgers404"
    );
    factory = asContractType<FactoryBurgers404>(
      await FactoryBurgers404.deploy(archetypeAddress)
    );
    const factoryAddress = await factory.getAddress();

    console.log({
      factoryAddress: factoryAddress,
      archetypeAddress: archetypeAddress,
    });
  });

  beforeEach(async function () {
    const [accountZero, owner, platform] = await ethers.getSigners();
    // reset split balances between tests
    if ((await archetypePayouts.balance(owner.address)) > ethers.toBigInt(0))
      await archetypePayouts.connect(owner).withdraw();
    if ((await archetypePayouts.balance(platform.address)) > ethers.toBigInt(0))
      await archetypePayouts.connect(platform).withdraw();
  });

  it("should have platform set to test account", async function () {
    const [_, _accountOne, accountTwo] = await ethers.getSigners();

    const contractPlatform = await archetype.platform();

    console.log({ accountTwo, contractPlatform });

    expect(accountTwo.address).to.equal(contractPlatform);
  });

  it("should create a collection", async function () {
    const [_, accountOne] = await ethers.getSigners();

    const newCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    const symbol = await nft.symbol();
    const owner = await nft.owner();

    expect(symbol).to.equal(DEFAULT_SYMBOL);
    expect(owner).to.equal(accountOne.address);
  });

  it("should let you change the archetype implementation", async function () {
    const [_, accountOne] = await ethers.getSigners();

    const newCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    const symbol = await nft.symbol();
    const owner = await nft.owner();

    expect(symbol).to.equal(DEFAULT_SYMBOL);
    expect(owner).to.equal(accountOne.address);

    const ArchetypeLogic = await ethers.getContractFactory(
      "ArchetypeLogicBurgers404"
    );
    archetypeLogic = asContractType<ArchetypeLogicBurgers404>(
      await ArchetypeLogic.deploy()
    );
    const NewArchetype = await ethers.getContractFactory(
      "ArchetypeBurgers404",
      {
        libraries: {
          ArchetypeLogicBurgers404: await archetypeLogic.getAddress(),
        },
      }
    );

    // const archetype = await upgrades.deployProxy(ArchetypeBurgers404, []);

    const newArchetype = await NewArchetype.deploy();

    await factory.setArchetype(await newArchetype.getAddress());

    const myArchetype = await factory.archetype();

    expect(myArchetype).to.equal(await newArchetype.getAddress());

    const anotherCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result1 = await anotherCollection.wait();

    const anotherollectionAddress = result1.logs[0].address || "";

    const nft1 = ArchetypeBurgers404.attach(anotherollectionAddress);

    const symbol1 = await nft1.symbol();
    const owner1 = await nft1.owner();

    expect(symbol1).to.equal(DEFAULT_SYMBOL);
    expect(owner1).to.equal(accountOne.address);
  });

  it("should fail if owner method called by non-owner", async function () {
    const [_, accountOne] = await ethers.getSigners();

    const newCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await expect(nft.lockURI("forever")).to.be.revertedWithCustomError(
      archetype,
      "NotOwner"
    );
  });

  it("should mint if public sale is set", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    const invites = await nft.invites(ethers.ZeroHash);

    console.log({ invites });

    await sleep(1000);

    console.log("current time", Math.floor(Date.now() / 1000));

    await nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
      value: ethers.parseEther("0.08"),
    });

    expect(await nft.balanceOf(accountZero.address)).to.equal(
      BigInt(1 * ERC20UNIT)
    );
  });

  it("should mint if user is on valid list, throw appropriate errors otherwise", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);
    const addresses = [accountZero.address, accountOne.address];
    // const addresses = [...Array(5000).keys()].map(() => accountZero.address);

    const invitelist = new Invitelist(addresses);

    const root = invitelist.root();
    const proof = invitelist.proof(accountZero.address);

    const price = ethers.parseEther("0.0008");

    const today = new Date();
    const tomorrow = today.setDate(today.getDate() + 1);
    const yesterday = today.setDate(today.getDate() + -1);

    console.log({ toda: Math.floor(Date.now() / 1000) });
    console.log({ tomo: Math.floor(tomorrow / 1000) });

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.0001"),
      start: ethers.toBigInt(Math.floor(tomorrow / 1000)),
      end: 0,
      limit: 10 * ERC20RATIO,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });
    await nft.connect(owner).setInvite(root, ipfsh.ctod(CID_DEFAULT), {
      price: price,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 10 * ERC20RATIO,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    const invitePrivate = await nft.invites(root);
    const invitePublic = await nft.invites(ethers.ZeroHash);

    console.log({ invitePrivate, invitePublic });

    // whitelisted wallet
    await expect(
      nft.mint({ key: root, proof: proof }, 1000, ZERO, "0x", {
        value: ethers.parseEther("0.07"),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    await nft.mint({ key: root, proof: proof }, 1000, ZERO, "0x", {
      value: price * BigInt(1000),
    });

    await nft.mint({ key: root, proof: proof }, 5000, ZERO, "0x", {
      value: price * BigInt(1000) * BigInt(5),
    });

    expect(await nft.balanceOf(accountZero.address)).to.equal(
      BigInt(6000 * ERC20UNIT)
    );

    await expect(await nft.owns(accountZero.address, 1)).to.be.true;
    await expect(await nft.owns(accountZero.address, 2)).to.be.true;
    await expect(await nft.owns(accountZero.address, 3)).to.be.true;
    await expect(await nft.owns(accountZero.address, 4)).to.be.true;
    await expect(await nft.owns(accountZero.address, 5)).to.be.true;
    await expect(await nft.owns(accountZero.address, 6)).to.be.true;

    await expect(await balanceOfNFT(nft, accountZero.address, 1)).to.equal(1);
    await expect(await balanceOfNFT(nft, accountZero.address, 2)).to.equal(1);
    await expect(await balanceOfNFT(nft, accountZero.address, 3)).to.equal(1);
    await expect(await balanceOfNFT(nft, accountZero.address, 4)).to.equal(1);
    await expect(await balanceOfNFT(nft, accountZero.address, 5)).to.equal(1);
    await expect(await balanceOfNFT(nft, accountZero.address, 6)).to.equal(1);

    const proofTwo = invitelist.proof(accountTwo.address);

    // non-whitelisted wallet
    // private mint rejection
    await expect(
      nft
        .connect(accountTwo)
        .mint({ key: root, proof: proofTwo }, 2, ZERO, "0x", {
          value: price * BigInt(2),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "WalletUnauthorizedToMint");

    // public mint rejection
    await expect(
      nft
        .connect(accountTwo)
        .mint({ key: ethers.ZeroHash, proof: [] }, 2, ZERO, "0x", {
          value: price * BigInt(2),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "MintNotYetStarted");

    const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(blockTimestamp),
      end: ethers.toBigInt(blockTimestamp + 10),
      limit: 1000,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await ethers.provider.send("evm_increaseTime", [20]);

    // ended list rejectiong
    await expect(
      nft
        .connect(accountTwo)
        .mint({ key: ethers.ZeroHash, proof: [] }, 2, ZERO, "0x", {
          value: price * BigInt(2),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "MintEnded");

    expect(await nft.balanceOf(accountTwo.address)).to.equal(0);
  });

  it("should fail to mint if public limit is 0", async function () {
    const [_, accountOne] = await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    // await nft.connect(owner).setPaused(false);

    const invites = await nft.invites(ethers.ZeroHash);

    console.log({ invites });

    await expect(
      nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.08"),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MintingPaused");
  });

  // reminder: If this test is failing with BalanceEmpty() errors, first ensure
  // that the PLATFORM constant in ArchetypeBurgers404.sol is set to local Hardhat network
  // account[2]
  it("should validate affiliate signatures and withdraw to correct account", async function () {
    const [accountZero, accountOne, accountTwo, accountThree, accountFour] =
      await ethers.getSigners();

    const owner = accountOne;
    const platform = accountTwo;
    const affiliate = accountThree;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    // test invalid signature
    const invalidReferral = await accountZero.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    await expect(
      nft
        .connect(accountZero)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          1,
          affiliate.address,
          invalidReferral,
          {
            value: ethers.parseEther("0.08"),
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "InvalidSignature");

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1,
        affiliate.address,
        referral,
        {
          value: ethers.parseEther("0.08"),
        }
      );

    await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.068")); // 85%
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.012")
    ); // 15%0067

    // withdraw owner balance
    await nft.connect(owner).withdraw();
    await expect(await archetypePayouts.balance(owner.address)).to.equal(
      ethers.parseEther("0.0646")
    );
    await expect(await archetypePayouts.balance(platform.address)).to.equal(
      ethers.parseEther("0.0034")
    );

    // withdraw owner from split contract
    let balance = await ethers.provider.getBalance(owner.address);
    await archetypePayouts.connect(owner).withdraw();
    let diff = (await ethers.provider.getBalance(owner.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.0645"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.0646"))
    );

    // mint again
    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1,
        affiliate.address,
        referral,
        {
          value: ethers.parseEther("0.08"),
        }
      );

    await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.068"));
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.024")
    ); // 15% x 2 mints

    await nft.connect(platform).withdraw();
    await expect(await archetypePayouts.balance(owner.address)).to.equal(
      ethers.parseEther("0.0646")
    );
    await expect(await archetypePayouts.balance(platform.address)).to.equal(
      ethers.parseEther("0.0068") // accumulated from last withdraw to split
    );

    // withdraw owner balance again
    balance = await ethers.provider.getBalance(owner.address);
    await archetypePayouts.connect(owner).withdraw();
    diff = (await ethers.provider.getBalance(owner.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.060"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.0646"))
    );

    // withdraw platform balance
    balance = await ethers.provider.getBalance(platform.address);
    await archetypePayouts.connect(platform).withdraw();
    diff = (await ethers.provider.getBalance(platform.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.0064")));
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.068")));

    // withdraw affiliate balance
    balance = await ethers.provider.getBalance(affiliate.address);
    await expect(
      nft.connect(affiliate).withdraw()
    ).to.be.revertedWithCustomError(archetypeLogic, "NotShareholder");
    await nft.connect(affiliate).withdrawAffiliate();
    diff = (await ethers.provider.getBalance(affiliate.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.020")));
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.024")));

    // withdraw empty owner balance
    await expect(
      archetypePayouts.connect(owner).withdraw()
    ).to.be.revertedWithCustomError(archetypePayouts, "BalanceEmpty");

    // withdraw empty affiliate balance
    await expect(
      archetypePayouts.connect(affiliate).withdraw()
    ).to.be.revertedWithCustomError(archetypePayouts, "BalanceEmpty");

    // withdraw unused affiliate balance
    await expect(
      archetypePayouts.connect(accountThree).withdraw()
    ).to.be.revertedWithCustomError(archetypePayouts, "BalanceEmpty");
  });

  it("should set correct discounts - mint tiers and affiliate", async function () {
    const [accountZero, accountOne, accountTwo, accountThree, accountFour] =
      await ethers.getSigners();

    const owner = accountOne;
    const platform = accountTwo;
    const affiliate = accountThree;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      // set config that has affiliate and mint tiers
      {
        baseUri:
          "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
        affiliateSigner: AFFILIATE_SIGNER.address,
        maxSupply: 5000 * ERC20RATIO,
        maxBatchSize: 100 * ERC20RATIO,
        affiliateFee: 1500,
        affiliateDiscount: 1000, // 10%
        defaultRoyalty: 500,
        erc20Ratio: ERC20RATIO,
        remintPremium: 2000,
      },
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = asContractType<ArchetypeBurgers404>(
      ArchetypeBurgers404.attach(newCollectionAddress)
    );

    await nft.connect(owner).setBonusInvite(
      ethers.ZeroHash,
      ipfsh.ctod(CID_ZERO),
      {
        price: ethers.parseEther("0.0001"),
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 300 * ERC20RATIO,
        maxSupply: DEFAULT_CONFIG.maxSupply,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
        reservePrice: 0,
        delta: 0,
        interval: 0,
      },
      [
        {
          numMints: 20,
          numBonusMints: 10,
        },
        {
          numMints: 10,
          numBonusMints: 4,
        },
        {
          numMints: 3,
          numBonusMints: 1,
        },
      ]
    );

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    // mint 3.5 nfts should get one free
    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        3500,
        affiliate.address,
        referral,
        {
          value: ethers.parseEther("0.00009") * BigInt(3500), // affiliate discount
        }
      );

    expect(
      await nft.connect(accountZero).balanceOf(accountZero.address)
    ).to.equal(BigInt(4500) * BigInt(ERC20UNIT));

    // mint 8.2 nfts should get one free
    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        8200,
        ethers.ZeroAddress,
        ethers.ZeroHash,
        {
          value: ethers.parseEther("0.0001") * BigInt(8200),
        }
      );

    expect(
      await nft.connect(accountZero).balanceOf(accountZero.address)
    ).to.equal(
      BigInt(4500) * BigInt(ERC20UNIT) + BigInt(9200) * BigInt(ERC20UNIT)
    );

    // mint 21 nfts should get ten free
    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        21000,
        ethers.ZeroAddress,
        ethers.ZeroHash,
        {
          value: ethers.parseEther("0.0001") * BigInt(21000),
        }
      );

    expect(
      await nft.connect(accountZero).owns(accountZero.address, 44)
    ).to.equal(true);
  });

  it("should withdraw and credit correct amount - super affiliate", async function () {
    const [accountZero, accountOne, accountTwo, accountThree, accountFour] =
      await ethers.getSigners();

    const owner = accountOne;
    const platform = accountTwo;
    const affiliate = accountThree;
    const superAffiliate = accountFour;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      // set config that has super affiliate set
      {
        baseUri:
          "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
        affiliateSigner: AFFILIATE_SIGNER.address,
        maxSupply: 5000 * ERC20RATIO,
        maxBatchSize: 100 * ERC20RATIO,
        affiliateFee: 1500,
        affiliateDiscount: 0,
        defaultRoyalty: 500,
        erc20Ratio: ERC20RATIO,
        remintPremium: 0,
        bonusDiscounts: {
          bonusTiers: [],
        },
      },
      {
        ownerBps: 9000,
        platformBps: 500,
        partnerBps: 0,
        superAffiliateBps: 500,
        partner: ZERO,
        superAffiliate: superAffiliate.address,
        ownerAltPayout: ZERO,
      }
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1,
        affiliate.address,
        referral,
        {
          value: ethers.parseEther("0.1"),
        }
      );

    await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.085")); // 85%
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.015")
    ); // 15%

    await nft.connect(owner).withdraw();

    // withdraw owner balance
    let balance = await ethers.provider.getBalance(owner.address);
    await archetypePayouts.connect(owner).withdraw();
    let diff = (await ethers.provider.getBalance(owner.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.0760"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.765")));

    // withdraw platform balance
    balance = await ethers.provider.getBalance(platform.address);
    await archetypePayouts.connect(platform).withdraw(); // partial withdraw
    diff = (await ethers.provider.getBalance(platform.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.0042")));
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.0425"))
    );

    // withdraw super affiliate balance
    balance = await ethers.provider.getBalance(superAffiliate.address);
    await archetypePayouts.connect(superAffiliate).withdraw(); // partial withdraw
    diff = (await ethers.provider.getBalance(superAffiliate.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.0042")));
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.0425"))
    );

    // withdraw affiliate balance
    balance = await ethers.provider.getBalance(affiliate.address);
    await nft.connect(affiliate).withdrawAffiliate();
    diff = (await ethers.provider.getBalance(affiliate.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.014")));
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.015")));
  });

  it("should withdraw to alt owner address", async function () {
    const [accountZero, accountOne, accountTwo, accountFour] =
      await ethers.getSigners();

    const partner = accountZero;
    const owner = accountOne;
    const ownerAltPayout = accountFour;
    const platform = accountTwo;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      // set config that has alt owner payout
      {
        baseUri:
          "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
        affiliateSigner: AFFILIATE_SIGNER.address,
        maxSupply: 5000,
        maxBatchSize: 20,
        affiliateFee: 1500,
        affiliateDiscount: 0,
        defaultRoyalty: 500,
        erc20Ratio: ERC20RATIO,
        remintPremium: 2000,
        bonusDiscounts: {
          bonusTiers: [],
        },
      },
      {
        ownerBps: 9000,
        platformBps: 500,
        partnerBps: 500,
        superAffiliateBps: 0,
        partner: partner.address,
        superAffiliate: ZERO,
        ownerAltPayout: ownerAltPayout.address,
      }
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await nft
      .connect(accountZero)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.1"),
      });

    await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.1")); // 100%

    // withdraw

    let balance = await ethers.provider.getBalance(ownerAltPayout.address);

    await nft.connect(owner).withdraw();

    // owner share will go directly to owner alt
    let diff =
      (await ethers.provider.getBalance(ownerAltPayout.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.089"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.090")));

    // rest will go to payout contract
    await expect(await archetypePayouts.balance(owner.address)).to.equal(
      ethers.parseEther("0")
    );
    await expect(
      await archetypePayouts.balance(ownerAltPayout.address)
    ).to.equal(ethers.parseEther("0"));
    await expect(await archetypePayouts.balance(platform.address)).to.equal(
      ethers.parseEther("0.005")
    );
    await expect(await archetypePayouts.balance(partner.address)).to.equal(
      ethers.parseEther("0.005")
    );

    await nft
      .connect(accountZero)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.1"),
      });

    await nft.connect(ownerAltPayout).withdraw();

    // owner share will go directly to owner alt
    diff = (await ethers.provider.getBalance(ownerAltPayout.address)) - balance;

    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.179"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.18")));

    // rest will go to payout contract
    await expect(await archetypePayouts.balance(owner.address)).to.equal(
      ethers.parseEther("0")
    );
    await expect(
      await archetypePayouts.balance(ownerAltPayout.address)
    ).to.equal(ethers.parseEther("0"));
    await expect(await archetypePayouts.balance(platform.address)).to.equal(
      ethers.parseEther("0.01")
    );
    await expect(await archetypePayouts.balance(partner.address)).to.equal(
      ethers.parseEther("0.01")
    );

    await nft.connect(owner).setOwnerAltPayout(ethers.ZeroAddress);
    await expect(
      nft.connect(ownerAltPayout).withdraw()
    ).to.be.revertedWithCustomError(archetypeLogic, "NotShareholder");
  });

  // it("allow token owner to store msg", async function () {
  //   const [accountZero, accountOne] = await ethers.getSigners();

  //   const owner = accountOne;
  //   const holder = accountZero;

  //   const newCollection = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG
  //   );

  //   const result = await newCollection.wait();

  //   const newCollectionAddress = result.logs[0].address || "";

  //   const nft = ArchetypeBurgers404.attach(newCollectionAddress);

  //   await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
  //     price: ethers.parseEther("0.02"),
  //     start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
  //     end: 0,
  //     limit: 300,
  //     maxSupply: DEFAULT_CONFIG.maxSupply,
  //     unitSize: 0,
  //     tokenAddress: ZERO,
  //   });

  //   // mint tokens 1, 2, 3
  //   await nft.connect(holder).mint({ key: ethers.ZeroHash, proof: [] }, 3, ZERO, "0x", {
  //     value: ethers.parseEther("0.06"),
  //   });

  //   const msg = "Hi this is a test, I own this";

  //   // try to set as non token owner - will fail
  //   await expect(nft.connect(owner).setTokenMsg(3, msg)).to.be.revertedWith("NotTokenOwner");

  //   // try to set as token owner - will succeed
  //   await nft.connect(holder).setTokenMsg(3, msg + msg + msg + msg + msg);

  //   // try to set as token owner - will succeed
  //   await nft.connect(holder).setTokenMsg(3, msg);

  //   // check that msgs match
  //   await expect(await nft.getTokenMsg(3)).to.be.equal(msg);
  // });

  it("test config changes and locking", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;
    const alt = accountZero;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    // CHANGE URI
    await nft.connect(owner).setBaseURI("test uri");
    await expect((await nft.connect(owner).config()).baseUri).to.be.equal(
      "test uri"
    );
    await nft.connect(owner).lockURI("forever");
    await expect(nft.connect(owner).setBaseURI("new test uri")).to.be.reverted;

    // CHANGE MAX SUPPLY
    await nft.connect(owner).setMaxSupply(100);
    await expect((await nft.connect(owner).config()).maxSupply).to.be.equal(
      100
    );
    await nft.connect(owner).lockMaxSupply("forever");
    await expect(nft.connect(owner).setMaxSupply(20)).to.be.reverted;

    // CHANGE AFFILIATE FEE
    await nft.connect(owner).setAffiliateFee(1000);
    await expect((await nft.connect(owner).config()).affiliateFee).to.be.equal(
      1000
    );

    // CHANGE AFFILIATE DISCOUNT
    await nft.connect(owner).setAffiliateDiscount(1000);
    await expect(
      (
        await nft.connect(owner).config()
      ).affiliateDiscount
    ).to.be.equal(1000);

    await nft.connect(owner).lockAffiliateFee();
    await expect(nft.connect(owner).setAffiliateFee(20)).to.be.reverted;
    await expect(nft.connect(owner).setAffiliateDiscount(20)).to.be.reverted;
  });

  // it("test burn to mint functionality", async function () {
  //   const [accountZero, accountOne] = await ethers.getSigners();

  //   const owner = accountZero;
  //   const minter = accountOne;

  //   const newCollectionBurn = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG
  //   );
  //   const resultBurn = await newCollectionBurn.wait();
  //   const newCollectionAddressBurn = resultBurn.logs[0].address || "";
  //   const nftBurn = ArchetypeBurgers404.attach(newCollectionAddressBurn);

  //   const newCollectionMint = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG
  //   );
  //   const resultMint = await newCollectionMint.wait();
  //   const newCollectionAddressMint = resultMint.logs[0].address || "";
  //   const nftMint = ArchetypeBurgers404.attach(newCollectionAddressMint);

  //   let DN404Mirror = await ethers.getContractFactory("DN404Mirror");
  //   const mirror = DN404Mirror.attach(await nftMint.mirrorERC721());

  //   await nftBurn.connect(owner).enableBurnToMint(await nftMint.getAddress(), BURN, false, 2, 0, 5000);
  //   await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
  //     price: 0,
  //     start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
  //     end: 0,
  //     limit: 300,
  //     maxSupply: DEFAULT_CONFIG.maxSupply,
  //     unitSize: 0,
  //     tokenAddress: ZERO,
  //     isBlacklist: false,
  //   });

  //   // mint 10 tokens
  //   await nftMint
  //     .connect(minter)
  //     .mint({ key: ethers.ZeroHash, proof: [] }, 12, ZERO, "0x", {
  //       value: 0,
  //     });

  //   // approve nftBurn to transfer tokens
  //   await mirror.connect(minter).setApprovalForAll(nftBurn.address, true);

  //   // transfer away a token
  //   await mirror.connect(minter).transferFrom(minter.address, owner.address, 10);

  //   // try to burn unowned token
  //   await expect(nftBurn.connect(minter).burnToMint([9, 10])).to.be.reverted();

  //   // try to burn invalid number of tokens
  //   await expect(nftBurn.connect(minter).burnToMint([9])).to.be.revertedWith(
  //     "InvalidAmountOfTokens"
  //   );

  //   // burn 2 tokens and collect 1 token in new collection
  //   await nftBurn.connect(minter).burnToMint([2, 4]);

  //   // burn 4 tokens and collect 2 tokens in new collection
  //   await nftBurn.connect(minter).burnToMint([1, 3, 5, 8]);

  //   // disable burn to mint
  //   await nftBurn.connect(owner).disableBurnToMint();

  //   // burn will fail as burn is disabled
  //   await expect(nftBurn.connect(minter).burnToMint([11, 12])).to.be.revertedWith(
  //     "BurnToMintDisabled"
  //   );

  //   // re-enable with time set in future
  //   await nftBurn
  //     .connect(owner)
  //     .enableBurnToMint(await nftMint.getAddress(), BURN, false, 2, 10000000000, 5000);

  //   // burn will fail as burn is time is set in future
  //   await expect(nftBurn.connect(minter).burnToMint([11, 12])).to.be.revertedWith(
  //     "MintNotYetStarted"
  //   );

  //   // re-enable again with valid config
  //   await nftBurn.connect(owner).enableBurnToMint(await nftMint.getAddress(), BURN, false, 2, 0, 5000);

  //   // burn 4 tokens and collect 2 tokens in new collection
  //   await nftBurn.connect(minter).burnToMint([11, 12]);

  //   // re-enable again with valid reversed config
  //   await nftBurn.connect(owner).enableBurnToMint(await nftMint.getAddress(), BURN, true, 4, 0, 5000);

  //   // burn 1 tokens and collect 4 tokens in new collection
  //   await nftBurn.connect(minter).burnToMint([7]);

  //   await expect(await mirror.ownerOf(1)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(2)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(3)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(4)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(5)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(7)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(8)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(11)).to.be.equal(BURN);
  //   await expect(await mirror.ownerOf(12)).to.be.equal(BURN);
  //   await expect(await nftMint.balanceOf(minter.address)).to.be.equal(BigInt(2 * ERC20UNIT));
  //   await expect(await nftBurn.balanceOf(minter.address)).to.be.equal(8);
  // });

  // it("test platform only modifier", async function () {
  //   const [accountZero, accountOne, accountTwo] = await ethers.getSigners();

  //   const owner = accountZero;
  //   const minter = accountOne;
  //   const platform = accountTwo;

  //   const newCollection = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG
  //   );
  //   const result = await newCollection.wait();
  //   const newCollectionAddress = result.logs[0].address || "";
  //   const nft = ArchetypeBurgers404.attach(newCollectionAddress);

  //   await expect(nft.connect(owner).setSuperAffiliatePayout(minter.address)).to.be.revertedWith(
  //     "NotPlatform"
  //   );
  //   await nft.connect(platform).setSuperAffiliatePayout(minter.address);

  //   await expect((await nft.connect(minter).config()).superAffiliatePayout).to.be.equal(
  //     minter.address
  //   );
  // });

  it("test max supply checks", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();
    DEFAULT_CONFIG.maxBatchSize = 5000 * ERC20RATIO;
    DEFAULT_CONFIG.maxSupply = 5000 * ERC20RATIO;

    const owner = accountZero;
    const minter = accountOne;

    const newCollectionBurn = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = asContractType<ArchetypeBurgers404>(
      ArchetypeBurgers404.attach(newCollectionAddressMint)
    );

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: 0,
        end: 0,
        limit: 10000 * ERC20RATIO,
        maxSupply: DEFAULT_CONFIG.maxSupply,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    // mint some tokens
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 10 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    // try to mint more than max tokens tokens
    await expect(
      nftMint
        .connect(minter)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          4991 * ERC20RATIO,
          ZERO,
          "0x",
          {
            value: 0,
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    // mint max tokens
    await nftMint
      .connect(minter)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1000 * ERC20RATIO,
        ZERO,
        "0x",
        {
          value: 0,
        }
      );
    await nftMint
      .connect(minter)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1000 * ERC20RATIO,
        ZERO,
        "0x",
        {
          value: 0,
        }
      );
    await nftMint
      .connect(minter)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1000 * ERC20RATIO,
        ZERO,
        "0x",
        {
          value: 0,
        }
      );
    await nftMint
      .connect(minter)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1000 * ERC20RATIO,
        ZERO,
        "0x",
        {
          value: 0,
        }
      );

    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 989 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    // do some burn to remints make sure it doesnt imppact max supply check
    await nftMint.connect(minter).burnToRemint([1, 2]);
    await nftMint.connect(minter).burnToRemint([4, 6]);
    await nftMint.connect(minter).burnToRemint([100, 5]);
    // first one is a double nft with change
    const change = (ERC20RATIO * DEFAULT_CONFIG.remintPremium) / 10000;
    const burnToRemintSupplyBump =
      (3 * ERC20RATIO + (ERC20RATIO - change * 1)) * ERC20UNIT;

    // make sure free mints are counted in max supply
    await nftMint.setBonusDiscounts(ethers.ZeroHash, [
      { numMints: 1, numBonusMints: 1 },
    ]);

    // free mint will make max supply exceed
    await expect(
      nftMint
        .connect(minter)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1 * ERC20RATIO, ZERO, "0x", {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    await nftMint.setBonusDiscounts(ethers.ZeroHash, [
      { numMints: 0, numBonusMints: 0 },
    ]);

    // mint last nft
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    // try to mint after max reached
    await expect(
      nftMint
        .connect(minter)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    await expect(await nftMint.totalSupply()).to.be.equal(
      BigInt(DEFAULT_CONFIG.maxSupply) * BigInt(ERC20UNIT) +
        BigInt(burnToRemintSupplyBump)
    );
    await expect(await nftMint.numErc20Minted()).to.be.equal(
      DEFAULT_CONFIG.maxSupply
    );
  });

  it("test minting to another wallet", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;
    const holder = accountZero;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.02"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: UINT32_MAX,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    // mint tokens from owner to holder address
    await nft
      .connect(owner)
      .mintTo(
        { key: ethers.ZeroHash, proof: [] },
        3,
        holder.address,
        ZERO,
        "0x",
        {
          value: ethers.parseEther("0.06"),
        }
      );

    // test to=zero reverts with MintToZeroAddress
    await expect(
      nft
        .connect(owner)
        .mintTo({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, ZERO, "0x", {
          value: ethers.parseEther("0.02"),
        })
    ).to.be.revertedWithCustomError(archetype, "TransferToZeroAddress");

    await expect(await nft.balanceOf(holder.address)).to.be.equal(
      BigInt(3 * ERC20UNIT)
    );
    await expect(await nft.balanceOf(owner.address)).to.be.equal(0);
  });

  it("test batchMintTo Airdrop", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;

    DEFAULT_CONFIG.maxBatchSize = 100 * ERC20RATIO;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    const invitelist = new Invitelist([owner.address]);
    const root = invitelist.root();
    const proof = invitelist.proof(accountZero.address);

    await nft.connect(owner).setInvite(root, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.00"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 5000 * ERC20RATIO,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    // mint tokens from owner to air drop list
    const airDropList: [string, number][] = [];
    for (let i = 0; i < 100; i++) {
      /// 100 addresses
      airDropList.push([ethers.Wallet.createRandom().address, 1 * ERC20RATIO]);
    }

    // mint in n txs (can handle about 500 owners per tx with 3mil gas limit)
    const splits = 2;
    function splitToChunks(array, parts) {
      const copied = [...array];
      const result = [];
      for (let i = parts; i > 0; i--) {
        result.push(copied.splice(0, Math.ceil(copied.length / i)));
      }
      return result;
    }
    const airDropListSplit = splitToChunks(airDropList, splits);
    for (const split of airDropListSplit) {
      await nft.connect(owner).batchMintTo(
        { key: root, proof: proof },
        split.map((list) => list[0]),
        split.map((list) => list[1]),
        ZERO,
        "0x",
        {
          value: ethers.parseEther("0.00"),
        }
      );
    }

    await expect(await nft.totalSupply()).to.be.equal(
      BigInt(airDropList.length) * BigInt(ERC20RATIO) * BigInt(ERC20UNIT)
    );
    await expect(await nft.numErc20Minted()).to.be.equal(
      BigInt(airDropList.length) * BigInt(ERC20RATIO)
    );
    await expect(await nft.numNftsMinted()).to.be.equal(airDropList.length);
    await expect(await nft.owns(airDropList[0][0], 1)).to.be.equal(true);
    await expect(await nft.owns(airDropList[9][0], 10)).to.be.equal(true);
    await expect(await nft.owns(airDropList[19][0], 20)).to.be.equal(true);
    await expect(await nft.owns(airDropList[59][0], 60)).to.be.equal(true);
    await expect(await nft.owns(airDropList[99][0], 100)).to.be.equal(true);
  });

  // it("test royalty enforcement enabling and lock", async function () {
  //   const [_accountZero, accountOne] = await ethers.getSigners();

  //   const owner = accountOne;

  //   const newCollection = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG
  //   );

  //   const result = await newCollection.wait();
  //   const newCollectionAddress = result.logs[0].address || "";
  //   const nft = ArchetypeBurgers404.attach(newCollectionAddress);

  //   // // mock opensea default block list addresses
  //   // ///The default OpenSea operator blocklist subscription.
  //   // const _DEFAULT_SUBSCRIPTION = "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6";
  //   // const Subscription = await ethers.getContractFactory("OwnedRegistrant");
  //   // const subscription = await Subscription.deploy(opensea.address);
  //   // await subscription.deployed();

  //   // /// @dev The OpenSea operator filter registry.
  //   // const _OPERATOR_FILTER_REGISTRY = "0x000000000000AAeB6D7670E522A718067333cd4E";
  //   // const Filter = await ethers.getContractFactory("OperatorFilterRegistry");
  //   // const filter = await Filter.deploy();
  //   // await filter.deployed();

  //   // await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
  //   //   price: ethers.parseEther("0.00"),
  //   //   start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
  //   //   limit: 5000,
  //   //   unitSize:0,
  //   // tokenAddress: ZERO
  //   // });

  //   await expect((await nft.options()).royaltyEnforcementEnabled).to.be.equal(false);
  //   await nft.connect(owner).enableRoyaltyEnforcement();
  //   await expect((await nft.options()).royaltyEnforcementEnabled).to.be.equal(true);
  //   await nft.connect(owner).disableRoyaltyEnforcement();
  //   await expect((await nft.options()).royaltyEnforcementEnabled).to.be.equal(false);
  //   await expect((await nft.options()).royaltyEnforcementLocked).to.be.equal(false);
  //   await nft.connect(owner).lockRoyaltyEnforcement("forever");
  //   await expect((await nft.options()).royaltyEnforcementLocked).to.be.equal(true);
  //   await expect(nft.connect(owner).enableRoyaltyEnforcement()).to.be.reverted;
  // });

  it("test default royalty eip 2981", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;
    const holder = accountZero;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    // console.log(owner.address);
    // console.log(holder.address);

    function bigIntReplacer(key, value) {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    }

    await nft.royaltyInfo(0, ethers.parseEther("1"));
    await expect(
      JSON.stringify(
        await nft.royaltyInfo(0, ethers.parseEther("1")),
        bigIntReplacer
      )
    ).to.be.equal(
      JSON.stringify([owner.address, ethers.parseEther("0.05")], bigIntReplacer)
    ); // 5% default royalty to owner

    await nft.connect(owner).setDefaultRoyalty(holder.address, 1000);
    await expect(
      JSON.stringify(
        await nft.royaltyInfo(0, ethers.parseEther("1")),
        bigIntReplacer
      )
    ).to.be.equal(
      JSON.stringify(
        [holder.address, ethers.parseEther("0.10")],
        bigIntReplacer
      )
    ); // 10% royalty to holder
  });

  it("test minting with erc20 list", async function () {
    const [accountZero, accountOne, accountTwo, _, accountFour] =
      await ethers.getSigners();

    const owner = accountOne;
    const holder = accountZero;
    const platform = accountTwo;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    const erc20 = asContractType<TestErc20>(
      await (await ethers.getContractFactory("TestErc20")).deploy()
    );
    const tokenAddress = await erc20.getAddress();

    const balanceBefore = await erc20.balanceOf(holder.address);

    console.log({ balanceBefore: balanceBefore.toString() });

    const erc20PublicKey = ethers.solidityPackedKeccak256(
      ["address"],
      [tokenAddress]
    );

    await nft.connect(owner).setInvite(erc20PublicKey, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: tokenAddress,
      isBlacklist: false,
    });

    // try to mint tokens without approval
    await expect(
      nft
        .connect(holder)
        .mint({ key: erc20PublicKey, proof: [] }, 3, ZERO, "0x")
    ).to.be.revertedWithCustomError(archetypeLogic, "NotApprovedToTransfer");

    await erc20
      .connect(holder)
      .approve(await nft.getAddress(), ethers.MaxUint256);

    // mint without enough erc20
    await expect(
      nft
        .connect(holder)
        .mint({ key: erc20PublicKey, proof: [] }, 3, ZERO, "0x")
    ).to.be.revertedWithCustomError(archetypeLogic, "Erc20BalanceTooLow");

    await erc20.connect(holder).mint(ethers.parseEther("3"));

    const balance = await erc20.balanceOf(holder.address);

    console.log({ balance: balance.toString() });

    await nft
      .connect(holder)
      .mint({ key: erc20PublicKey, proof: [] }, 3, ZERO, "0x");

    await expect(await nft.balanceOf(holder.address)).to.be.equal(
      BigInt(3 * ERC20UNIT)
    );
    await expect(await erc20.balanceOf(holder.address)).to.be.equal(0);
    await expect(await erc20.balanceOf(await nft.getAddress())).to.be.equal(
      ethers.parseEther("3")
    );

    await expect(
      await nft.ownerBalanceToken(await erc20.getAddress())
    ).to.be.equal(ethers.parseEther("3.0")); // 100%

    await nft.connect(owner).withdrawTokens([await erc20.getAddress()]);

    await expect(await erc20.balanceOf(await nft.getAddress())).to.be.equal(
      ethers.parseEther("0")
    );
    await archetypePayouts
      .connect(owner)
      .withdrawTokens([await erc20.getAddress()]);
    await expect(
      await erc20.balanceOf(await archetypePayouts.getAddress())
    ).to.be.equal(ethers.parseEther("0.15"));
    await expect(await erc20.balanceOf(owner.address)).to.be.equal(
      ethers.parseEther("2.85")
    );

    await archetypePayouts
      .connect(platform)
      .withdrawTokens([await erc20.getAddress()]);

    await expect(await erc20.balanceOf(platform.address)).to.be.equal(
      ethers.parseEther("0.15")
    );
  });

  it("test dutch Invite", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;
    const holder = accountZero;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft
      .connect(owner)
      .setAdvancedInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: ethers.parseEther("1"),
        reservePrice: ethers.parseEther("0.1"),
        start: 0,
        end: 0,
        limit: 300,
        interval: 1000, // 1000s,
        delta: ethers.parseEther("0.1"),
        maxSupply: DEFAULT_CONFIG.maxSupply,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    // mint at full price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("1"),
      });

    // try to mint at half price, will revert
    await expect(
      nft
        .connect(holder)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
          value: ethers.parseEther("0.5"),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    // forward time 5000s
    await ethers.provider.send("evm_increaseTime", [5000]);

    // mint at half price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.5"),
      });

    // forward a long time
    await ethers.provider.send("evm_increaseTime", [50000]);

    // mint at reserve price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.1"),
      });

    await expect(await nft.balanceOf(holder.address)).to.be.equal(
      BigInt(3 * ERC20UNIT)
    );
  });

  it("test increasing dutch Invite", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;
    const holder = accountZero;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft
      .connect(owner)
      .setAdvancedInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: ethers.parseEther("1"),
        reservePrice: ethers.parseEther("10"),
        start: 0,
        end: 0,
        limit: 300,
        interval: 1000, // 1000s,
        delta: ethers.parseEther("1"),
        maxSupply: DEFAULT_CONFIG.maxSupply,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    // mint at full price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("1"),
      });

    // forward time 5000s
    await ethers.provider.send("evm_increaseTime", [5000]);

    // try to mint at initial price, will revert
    await expect(
      nft
        .connect(holder)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
          value: ethers.parseEther("1"),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    // mint at half price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("6"),
      });

    // forward a long time
    await ethers.provider.send("evm_increaseTime", [50000]);

    // mint at reserve price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("10"),
      });

    await expect(await nft.balanceOf(holder.address)).to.be.equal(
      BigInt(3 * ERC20UNIT)
    );
  });

  it("test linear pricing curve", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;
    const holder = accountZero;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft
      .connect(owner)
      .setAdvancedInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: ethers.parseEther("1"),
        reservePrice: ethers.parseEther("0.1"),
        start: 0,
        end: 0,
        limit: 300,
        interval: 0, // 1000s,
        delta: ethers.parseEther("0.01"),
        maxSupply: DEFAULT_CONFIG.maxSupply,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    // mint at full price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("1"),
      });

    // try to mint at initial price, will revert
    await expect(
      nft
        .connect(holder)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
          value: ethers.parseEther("1"),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    // mint at current price (1.01) in a linear curve
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("1.01"),
      });

    // mint 10 nfts, current price=1.02 and the price of 10 nfts = 1.02*10 + 0.01*10*9/2=10.65
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 10, ZERO, "0x", {
        value: ethers.parseEther("10.65"),
      });

    await expect(await nft.balanceOf(holder.address)).to.be.equal(
      BigInt(12 * ERC20UNIT)
    );
  });

  it("test invite list max supply check", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    DEFAULT_CONFIG.maxSupply = 100 * ERC20RATIO;
    const PublicMaxSupply = 90 * ERC20RATIO;

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeBurgers404.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: PublicMaxSupply - 20,
        maxSupply: PublicMaxSupply,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 40 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    // try to mint past invite list max
    await expect(
      nftMint
        .connect(minter2)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          60 * ERC20RATIO,
          ZERO,
          "0x",
          {
            value: 0,
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "ListMaxSupplyExceeded");

    await nftMint
      .connect(minter2)
      .mint({ key: ethers.ZeroHash, proof: [] }, 50 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    await expect(await nftMint.totalSupply()).to.be.equal(
      BigInt(PublicMaxSupply) * BigInt(ERC20UNIT)
    );
    await expect(await nftMint.numErc20Minted()).to.be.equal(PublicMaxSupply);
  });

  it("test multiple public invite lists support in 0.5.1", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const defaultConfig = { ...DEFAULT_CONFIG };
    defaultConfig.maxSupply = 100;

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      defaultConfig,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeBurgers404.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: ethers.parseEther("1"),
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: defaultConfig.maxSupply,
        maxSupply: defaultConfig.maxSupply,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 40, ZERO, "0x", {
        value: ethers.parseEther("40"),
      });

    // set 2nd public list
    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 20,
      maxSupply: defaultConfig.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await nftMint
      .connect(minter2)
      .mint({ key: HASHONE, proof: [] }, 20, ZERO, "0x", { value: 0 });

    // set 3rd public list
    await nftMint.connect(owner).setInvite(HASH256, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 40,
      maxSupply: defaultConfig.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await nftMint
      .connect(minter2)
      .mint({ key: HASH256, proof: [] }, 40, ZERO, "0x", { value: 0 });

    await expect(await nftMint.totalSupply()).to.be.equal(
      BigInt(defaultConfig.maxSupply) * BigInt(ERC20UNIT)
    );
    await expect(await nftMint.numErc20Minted()).to.be.equal(
      defaultConfig.maxSupply
    );
  });

  it("test unit size mint 1 get x functionality", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
      await ethers.getSigners();

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;
    const minter3 = accountThree;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeBurgers404.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 24 * ERC20RATIO,
        maxSupply: 36 * ERC20RATIO,
        unitSize: 12,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    // mint 1 get 12
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    // try to mint past invite list limit
    await expect(
      nftMint
        .connect(minter)
        .mint({ key: ethers.ZeroHash, proof: [] }, 2 * ERC20RATIO, ZERO, "0x", {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "NumberOfMintsExceeded");

    // mint 2 get 24
    await nftMint
      .connect(minter2)
      .mint({ key: ethers.ZeroHash, proof: [] }, 2 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    // try to mint past invite list max
    await expect(
      nftMint
        .connect(minter3)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1 * ERC20RATIO, ZERO, "0x", {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "ListMaxSupplyExceeded");

    await expect(await nftMint.balanceOf(minter.address)).to.be.equal(
      BigInt(12 * NFTUNIT)
    );
    await expect(await nftMint.balanceOf(minter2.address)).to.be.equal(
      BigInt(24 * NFTUNIT)
    );
    await expect(await nftMint.totalSupply()).to.be.equal(BigInt(36 * NFTUNIT));
    await expect(await nftMint.numErc20Minted()).to.be.equal(
      BigInt(36 * ERC20RATIO)
    );
    await expect(await nftMint.numNftsMinted()).to.be.equal(36);
  });

  it("test batchTransactions method logic", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
      await ethers.getSigners();

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;
    const minter3 = accountThree;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeBurgers404.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 100,
        maxSupply: 100,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 100,
      maxSupply: 100,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    const targets = [
      await nftMint.getAddress(),
      await nftMint.getAddress(),
      await nftMint.getAddress(),
      await nftMint.getAddress(),
      await nftMint.getAddress(),
    ];
    const values = [
      0,
      0,
      0,
      ethers.parseEther("0.2"),
      ethers.parseEther("0.3"),
    ];
    const datas = [
      nftMint.interface.encodeFunctionData("mintTo", [
        { key: ethers.ZeroHash, proof: [] },
        1,
        await archetypeBatch.getAddress(),
        ZERO,
        "0x",
      ]),
      nftMint.interface.encodeFunctionData("mint", [
        { key: ethers.ZeroHash, proof: [] },
        2,
        ZERO,
        "0x",
      ]),
      nftMint.interface.encodeFunctionData("mintTo", [
        { key: ethers.ZeroHash, proof: [] },
        5,
        minter2.address,
        ZERO,
        "0x",
      ]),
      nftMint.interface.encodeFunctionData("mintTo", [
        { key: HASHONE, proof: [] },
        2,
        minter.address,
        ZERO,
        "0x",
      ]),
      nftMint.interface.encodeFunctionData("mintTo", [
        { key: HASHONE, proof: [] },
        3,
        minter2.address,
        ZERO,
        "0x",
      ]),
    ];

    // Execute batch transactions
    await archetypeBatch.connect(minter).executeBatch(targets, values, datas, {
      value: ethers.parseEther("0.6"),
    });

    const balanceOfContract = await nftMint.balanceOf(
      await archetypeBatch.getAddress()
    );
    const balanceOfMinter = await nftMint.balanceOf(minter.address);
    const balanceOfMinter2 = await nftMint.balanceOf(minter2.address);
    const totalSupply = await nftMint.totalSupply();
    const numMinted = await nftMint.numErc20Minted();

    expect(balanceOfContract).to.be.equal(BigInt(1 * ERC20UNIT));
    expect(balanceOfMinter).to.be.equal(BigInt(4 * ERC20UNIT));
    expect(balanceOfMinter2).to.be.equal(BigInt(8 * ERC20UNIT));
    expect(totalSupply).to.be.equal(BigInt(13 * ERC20UNIT));
    expect(numMinted).to.be.equal(13);

    // batchTransaction tx sent 0.1 extra eth
    // Use rescueETH method to save eth
    const recipient_ = minter2.address;
    let ethbalance = await ethers.provider.getBalance(minter2.address);
    await archetypeBatch.connect(owner).rescueETH(recipient_);
    let diff = (await ethers.provider.getBalance(minter2.address)) - ethbalance;

    expect(Number(diff)).to.be.equal(Number(ethers.parseEther("0.1")));
  });

  it("test batch msg sender vs tx origin logic", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
      await ethers.getSigners();

    const owner = accountZero;
    const minter = accountOne;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeBurgers404.attach(newCollectionAddressMint);

    const addresses = [minter.address];
    const invitelist = new Invitelist(addresses);
    const root = invitelist.root();
    const proof = invitelist.proof(accountZero.address);

    // private invite list with only minter
    await nftMint.connect(owner).setInvite(root, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.0"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 100,
      maxSupply: 100,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: ethers.parseEther("0.1"),
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 100,
        maxSupply: 100,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      });

    const targets = [await nftMint.getAddress(), await nftMint.getAddress()];
    const values = [ethers.parseEther("0.5"), 0];
    const datas = [
      nftMint.interface.encodeFunctionData("mint", [
        { key: ethers.ZeroHash, proof: [] },
        5,
        ZERO,
        "0x",
      ]),
      nftMint.interface.encodeFunctionData("mint", [
        { key: root, proof: proof },
        5,
        ZERO,
        "0x",
      ]),
    ];

    // Execute batch transactions
    await archetypeBatch.connect(minter).executeBatch(targets, values, datas, {
      value: ethers.parseEther("0.5"),
    });

    // minter is validated through tx.origin
    const balanceOfMinter = await nftMint.balanceOf(minter.address);
    const totalSupply = await nftMint.totalSupply();
    const numMinted = await nftMint.numErc20Minted();
    expect(balanceOfMinter).to.be.equal(BigInt(10 * ERC20UNIT));
    expect(totalSupply).to.be.equal(BigInt(10 * ERC20UNIT));
    expect(numMinted).to.be.equal(10);
  });

  it("test batching owner method", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
      await ethers.getSigners();

    const owner = accountZero;
    const minter = accountOne;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeBurgers404.attach(newCollectionAddressMint);

    const nftMintAddress = await nftMint.getAddress();
    const targets = [nftMintAddress, nftMintAddress, nftMintAddress];
    const values = [0, 0, 0];
    const datas = [
      nftMint.interface.encodeFunctionData("setInvite", [
        ethers.ZeroHash,
        ipfsh.ctod(CID_ZERO),
        {
          price: ethers.parseEther("0.0"),
          start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
          end: 0,
          limit: 100,
          maxSupply: 100,
          unitSize: 0,
          tokenAddress: ZERO,
          isBlacklist: false,
        },
      ]),
      nftMint.interface.encodeFunctionData("setMaxSupply", [1000]),
      nftMint.interface.encodeFunctionData("setBaseURI", ["test"]),
    ];

    // Execute batch transactions
    await archetypeBatch.connect(owner).executeBatch(targets, values, datas, {
      value: ethers.parseEther("0.0"),
    });

    await expect((await nftMint.connect(owner).config()).maxSupply).to.be.equal(
      1000
    );
    await expect((await nftMint.connect(owner).config()).baseUri).to.be.equal(
      "test"
    );
  });

  it("test blacklist checks", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await sleep(1000);

    const invitelist = new Invitelist([accountZero.address]);

    const root = invitelist.root();
    const proof = invitelist.proof(accountZero.address);

    const price = ethers.parseEther("0.08");

    const today = new Date();
    const tomorrow = today.setDate(today.getDate() + 1);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(tomorrow / 1000)),
      end: 0,
      limit: 1000,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await nft.connect(owner).setInvite(root, ipfsh.ctod(CID_DEFAULT), {
      price: price,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 10,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: true,
    });

    // account zero is blacklisted
    await expect(
      nft
        .connect(accountZero)
        .mint({ key: root, proof: proof }, 1, ZERO, "0x", {
          value: price * BigInt(1),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "Blacklisted");

    const proof2 = invitelist.proof(accountOne.address);

    // account one is not blacklisted
    await nft
      .connect(accountOne)
      .mint({ key: root, proof: proof2 }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.08"),
      });

    expect(await nft.balanceOf(accountOne.address)).to.equal(
      BigInt(1 * ERC20UNIT)
    );
  });

  it("test dn420 edge cases", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
      await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await sleep(1000);

    const invitelist = new Invitelist([accountZero.address]);

    const today = new Date();
    const tomorrow = today.setDate(today.getDate() + 1);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: 0,
      end: 0,
      limit: 1000 * ERC20RATIO,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await nft
      .connect(accountZero)
      .mint({ key: ethers.ZeroHash, proof: [] }, 10 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    // minted up to token id 10
    expect(await balanceOfNFT(nft, accountZero.address, 10)).to.equal(1);

    await nft
      .connect(accountZero)
      .transfer(accountOne.address, BigInt(3.5 * NFTUNIT));

    await nft
      .connect(accountOne)
      .transfer(accountTwo.address, BigInt(1.6 * NFTUNIT));

    await nft
      .connect(accountThree)
      .mint({ key: ethers.ZeroHash, proof: [] }, 3 * ERC20RATIO, ZERO, "0x", {
        value: 0,
      });

    expect(await nft.balanceOfNFT(accountZero.address)).to.equal(6);
    expect(await balanceOfNFT(nft, accountZero.address, 1)).to.equal(1);
    expect(await balanceOfNFT(nft, accountZero.address, 6)).to.equal(1);
    expect(await nft.exists(7)).to.equal(false);
    expect(await balanceOfNFT(nft, accountOne.address, 8)).to.equal(1);
    expect(await nft.exists(9)).to.equal(false);
    expect(await balanceOfNFT(nft, accountTwo.address, 10)).to.equal(1);
    expect(await balanceOfNFT(nft, accountThree.address, 11)).to.equal(1);
    expect(await balanceOfNFT(nft, accountThree.address, 12)).to.equal(1);
    expect(await balanceOfNFT(nft, accountThree.address, 13)).to.equal(1);

    // even up some balances account zero = 5.0, account one = 3, account two = 2
    // 8,9 will remint
    await nft
      .connect(accountZero)
      .transfer(accountOne.address, BigInt(1 * NFTUNIT + (1 * NFTUNIT) / 10));
    await nft
      .connect(accountZero)
      .transfer(accountTwo.address, BigInt((4 * NFTUNIT) / 10));

    console.log(await nft.balanceOf(accountZero.address));
    console.log(await nft.balanceOf(accountOne.address));
    console.log(await nft.balanceOf(accountTwo.address));

    expect(await balanceOfNFT(nft, accountOne.address, 6)).to.equal(1);
    expect(await balanceOfNFT(nft, accountOne.address, 7)).to.equal(1);
    expect(await balanceOfNFT(nft, accountTwo.address, 9)).to.equal(1);
  });

  it("test right minted supply on normal mints", async () => {
    const [, accountOne] = await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.0008"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 50,
      maxSupply: 50,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    expect(await nft.numErc20Minted()).eq(0);

    await nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
      value: ethers.parseEther("0.0008"),
    });

    expect(await nft.numErc20Minted()).eq(1);

    await nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
      value: ethers.parseEther("0.0008"),
    });

    expect(await nft.numErc20Minted()).eq(2);

    await nft.mint({ key: ethers.ZeroHash, proof: [] }, 20, ZERO, "0x", {
      value: ethers.parseEther("0.0008") * BigInt(20),
    });

    expect(await nft.numErc20Minted()).eq(22);

    await nft.mint({ key: ethers.ZeroHash, proof: [] }, 15, ZERO, "0x", {
      value: ethers.parseEther("0.0008") * BigInt(15),
    });

    expect(await nft.numErc20Minted()).eq(37);

    await nft.mint({ key: ethers.ZeroHash, proof: [] }, 13, ZERO, "0x", {
      value: ethers.parseEther("0.0008") * BigInt(13),
    });

    expect(await nft.numErc20Minted()).eq(50);

    await expect(
      nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.0008"),
      })
    ).reverted;
  });

  it("should refund overpaid mints", async () => {
    const [, accountOne, user] = await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    const mintPrice = ethers.parseEther("0.08");
    const paidPrice = ethers.parseEther("0.12");
    const delta = ethers.parseEther("0.001");

    await nft
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: mintPrice,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 50,
        maxSupply: 50,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      })
      .then((tx) => tx.wait());

    const preContractBalance = await ethers.provider.getBalance(
      await nft.getAddress()
    );
    const preUserBalance = await ethers.provider.getBalance(user.address);

    await nft
      .connect(user)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: paidPrice,
      })
      .then((tx) => tx.wait());

    const postContractBalance = await ethers.provider.getBalance(
      await nft.getAddress()
    );
    const postUserBalance = await ethers.provider.getBalance(user.address);

    expect(postUserBalance).closeTo(preUserBalance - mintPrice, delta);
    expect(postContractBalance).eq(preContractBalance + mintPrice);
  });

  it("should account overpaid mints and refunds correctly", async () => {
    const [accountZero, accountOne, accountTwo, accountThree, accountFour] =
      await ethers.getSigners();

    const owner = accountOne;
    const platform = accountTwo;
    const affiliate = accountThree;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    const mintPrice = ethers.parseEther("0.08");
    const paidPrice = ethers.parseEther("0.20");

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    const preContractBalance = await ethers.provider.getBalance(
      await nft.getAddress()
    );
    const preUserBalance = await ethers.provider.getBalance(
      accountZero.address
    );

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1,
        affiliate.address,
        referral,
        {
          value: ethers.parseEther("0.20"),
        }
      );

    const postContractBalance = await ethers.provider.getBalance(
      await nft.getAddress()
    );
    const postUserBalance = await ethers.provider.getBalance(
      accountZero.address
    );

    const delta = ethers.parseEther("0.001");
    expect(postUserBalance).closeTo(preUserBalance - mintPrice, delta);
    expect(postContractBalance).eq(preContractBalance + mintPrice);

    await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.068")); // 85%
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.012")
    ); // 15%
  });

  it("test payouts approval functionality", async () => {
    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;
    const ownerAlt = accountZero;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await nft
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: ethers.parseEther("0.2"),
        start: 0,
        end: 0,
        limit: 50,
        maxSupply: 50,
        unitSize: 0,
        tokenAddress: ZERO,
        isBlacklist: false,
      })
      .then((tx) => tx.wait());

    await nft
      .connect(accountOne)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.2"),
      })
      .then((tx) => tx.wait());

    await nft.connect(owner).withdraw();

    // cant withdraw from other persons account
    await expect(
      archetypePayouts
        .connect(ownerAlt)
        .withdrawFrom(owner.address, ownerAlt.address)
    ).to.be.revertedWithCustomError(archetypePayouts, "NotApprovedToWithdraw");

    await expect(
      archetypePayouts
        .connect(ownerAlt)
        .withdrawTokensFrom(owner.address, ownerAlt.address, [ZERO])
    ).to.be.revertedWithCustomError(archetypePayouts, "NotApprovedToWithdraw");

    // can withdraw from own account to another address
    await archetypePayouts
      .connect(owner)
      .withdrawFrom(owner.address, ownerAlt.address);

    await nft
      .connect(accountOne)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", {
        value: ethers.parseEther("0.2"),
      })
      .then((tx) => tx.wait());

    await nft.connect(owner).withdraw();

    // can withdraw from other persons account when approved
    await archetypePayouts
      .connect(owner)
      .approveWithdrawal(ownerAlt.address, true);
    archetypePayouts
      .connect(ownerAlt)
      .withdrawFrom(owner.address, ownerAlt.address);
    await expect(
      archetypePayouts
        .connect(ownerAlt)
        .withdrawTokensFrom(owner.address, ownerAlt.address, [ZERO])
    ).to.be.revertedWithCustomError(archetypePayouts, "BalanceEmpty");
  });

  it("test dn420 burn to remint", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
      await ethers.getSigners();

    const owner = accountOne;

    let defaultConfig = DEFAULT_CONFIG;
    defaultConfig.maxBatchSize = 5000 * ERC20RATIO;
    defaultConfig.maxSupply = 5000 * ERC20RATIO;
    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      defaultConfig,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeBurgers404.attach(newCollectionAddress);

    await sleep(1000);

    const invitelist = new Invitelist([accountZero.address]);

    const today = new Date();
    const tomorrow = today.setDate(today.getDate() + 1);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: 0,
      end: 0,
      limit: UINT32_MAX,
      maxSupply: UINT32_MAX,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        5000 * ERC20RATIO,
        ZERO,
        "0x",
        {
          value: 0,
        }
      );

    // minted up to token id 5000
    expect(await balanceOfNFT(nft, accountZero.address, 1)).to.equal(1);
    expect(await balanceOfNFT(nft, accountZero.address, 5000)).to.equal(1);

    // burn to remint new token, this will burn both tokens and give back change
    let prebalance = await nft.balanceOf(accountZero.address);
    await nft.connect(accountZero).burnToRemint([1, 2]);
    let postbalance = await nft.balanceOf(accountZero.address);

    expect(await nft.owns(accountZero.address, 1)).to.equal(false);
    expect(await nft.owns(accountZero.address, 2)).to.equal(false);
    expect(await nft.owns(accountZero.address, 5001)).to.equal(true);
    expect(postbalance - prebalance).to.equal(
      -(BigInt(NFTUNIT) * BigInt(defaultConfig.remintPremium)) / BigInt(10000)
    );

    // burn to remint agains, will only transfer first token because change is there
    prebalance = await nft.balanceOf(accountZero.address);
    await nft.connect(accountZero).burnToRemint([8, 4]);
    postbalance = await nft.balanceOf(accountZero.address);

    expect(await nft.owns(accountZero.address, 8)).to.equal(false);
    expect(await nft.owns(accountZero.address, 4)).to.equal(true);
    expect(await nft.owns(accountZero.address, 5002)).to.equal(true);
    expect(postbalance - prebalance).to.equal(
      -(BigInt(NFTUNIT) * BigInt(defaultConfig.remintPremium)) / BigInt(10000)
    );

    // burn should have 3200 tokens now
    expect(await nft.balanceOf(BURN)).to.equal(
      BigInt(3200) * BigInt(ERC20UNIT)
    );
  });
});

// todo: add test to ensure affiliate signer can't be zero address

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
