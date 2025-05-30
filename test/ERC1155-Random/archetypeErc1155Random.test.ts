import { ethers } from "hardhat";

import { expect } from "chai";
import Invitelist from "../lib/invitelist";
import {
  IArchetypeErc1155RandomConfig,
  IArchetypePayoutConfig,
} from "../lib/types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import ipfsh from "ipfsh";
import {
  ArchetypeErc1155Random,
  ArchetypeBatch,
  ArchetypeLogicErc1155Random,
  ArchetypePayouts,
  FactoryErc1155Random,
  TestErc20,
} from "../../typechain-types";
import { BaseContract } from "ethers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_NAME = "Pookie";
const DEFAULT_SYMBOL = "POOKIE";
let AFFILIATE_SIGNER: SignerWithAddress;
let FULFILLMENT_SIGNER: SignerWithAddress;
let DEFAULT_CONFIG: IArchetypeErc1155RandomConfig;
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

function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}

const randomSeedNumber = () => {
  return ethers.toBigInt(ethers.randomBytes(32));
};

const generateFulfillmentSignature = async (seed) => {
  const signature = await FULFILLMENT_SIGNER.signMessage(
    ethers.getBytes(ethers.solidityPackedKeccak256(["uint256"], [seed]))
  );
  return signature;
};

const generateSeedHash = async () => {
  const seed = randomSeedNumber();

  const seedHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [seed])
  );

  const signature = await generateFulfillmentSignature(seed);

  return { seedHash, seed: seed.toString(), signature };
};

const generateTokenPool = (x: number): number[] =>
  [].concat(...[1, 2, 3, 4, 5].map((i) => Array(x / 5).fill(i)));

describe("FactoryErc1155Random", function () {
  let ArchetypeErc1155Random;
  let archetype: ArchetypeErc1155Random;
  let archetypeLogic: ArchetypeLogicErc1155Random;
  let archetypeBatch: ArchetypeBatch;
  let archetypePayouts: ArchetypePayouts;
  let factory: FactoryErc1155Random;

  before(async function () {
    AFFILIATE_SIGNER = (await ethers.getSigners())[4]; // account[4]
    FULFILLMENT_SIGNER = (await ethers.getSigners())[5]; // account[5]
    DEFAULT_CONFIG = {
      baseUri:
        "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
      affiliateSigner: AFFILIATE_SIGNER.address,
      fulfillmentSigner: FULFILLMENT_SIGNER.address,
      maxSupply: 50,
      maxBatchSize: 20,
      affiliateFee: 1500,
      affiliateDiscount: 0,
      defaultRoyalty: 500,
      tokenPool: generateTokenPool(50),
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

    const ArchetypeLogicErc1155Random = await ethers.getContractFactory(
      "ArchetypeLogicErc1155Random"
    );
    archetypeLogic = asContractType<ArchetypeLogicErc1155Random>(
      await ArchetypeLogicErc1155Random.deploy()
    );

    ArchetypeErc1155Random = await ethers.getContractFactory(
      "ArchetypeErc1155Random",
      {
        libraries: {
          ArchetypeLogicErc1155Random: await archetypeLogic.getAddress(),
        },
      }
    );

    const ArchetypePayouts = await ethers.getContractFactory(
      "ArchetypePayouts"
    );
    archetypePayouts = asContractType<ArchetypePayouts>(
      await ArchetypePayouts.deploy()
    );

    archetype = await ArchetypeErc1155Random.deploy();
    const archetypeAddress = await archetype.getAddress();

    const Factory = await ethers.getContractFactory("FactoryErc1155Random");
    factory = asContractType<FactoryErc1155Random>(
      await Factory.deploy(archetypeAddress)
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    const symbol = await nft.symbol();
    const owner = await nft.owner();

    expect(symbol).to.equal(DEFAULT_SYMBOL);
    expect(owner).to.equal(accountOne.address);
  });

  it("should initialize once and continue to work after initialized", async function () {
    const [_, accountOne] = await ethers.getSigners();

    const res = await archetype.initialize(
      "Flookie",
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG,
      accountOne.address
    );
    await res.wait();

    expect(await archetype.name()).to.equal("Flookie");

    await expect(
      archetype.initialize(
        "Wookie",
        DEFAULT_SYMBOL,
        DEFAULT_CONFIG,
        DEFAULT_PAYOUT_CONFIG,
        accountOne.address
      )
    ).to.be.rejectedWith("Initializable: contract is already initialized");

    const newCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    const symbol = await nft.symbol();
    const owner = await nft.owner();

    expect(symbol).to.equal(DEFAULT_SYMBOL);
    expect(owner).to.equal(accountOne.address);

    const ArchetypeLogicErc1155Random = await ethers.getContractFactory(
      "ArchetypeLogicErc1155Random"
    );
    archetypeLogic = asContractType<ArchetypeLogicErc1155Random>(
      await ArchetypeLogicErc1155Random.deploy()
    );
    const NewArchetype = await ethers.getContractFactory(
      "ArchetypeErc1155Random",
      {
        libraries: {
          ArchetypeLogicErc1155Random: await archetypeLogic.getAddress(),
        },
      }
    );

    // const archetype = await upgrades.deployProxy(ArchetypeErc1155Random, []);

    const newArchetype = await NewArchetype.deploy();

    const newArchetypeAddress = await newArchetype.getAddress();

    await factory.setArchetype(newArchetypeAddress);

    const myArchetype = await factory.archetype();

    expect(myArchetype).to.equal(newArchetypeAddress);

    const anotherCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result1 = await anotherCollection.wait();

    const anotherollectionAddress = result1.logs[0].address || "";

    const nft1 = ArchetypeErc1155Random.attach(anotherollectionAddress);

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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000) - 60), // one minute ago
      end: 0,
      limit: 300,
      unitSize: 0,
      tokenIdsExcluded: [],
      maxSupply: 500,
      tokenAddress: ZERO,
    });

    const invites = await nft.invites(ethers.ZeroHash);

    console.log({ invites });

    console.log("current time", Math.floor(Date.now() / 1000));

    const { seedHash, seed, signature } = await generateSeedHash();

    await nft.mint(
      { key: ethers.ZeroHash, proof: [] },
      1,
      ZERO,
      "0x",
      seedHash,
      {
        value: ethers.parseEther("0.08"),
      }
    );

    // supply will be set
    expect(await nft.totalSupply()).to.equal(1);

    // mint only fullfilled with original seed
    await nft.fulfillRandomMint(seed, signature);
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    const addresses = [accountZero.address, accountOne.address];
    // const addresses = [...Array(5000).keys()].map(() => accountZero.address);

    const invitelist = new Invitelist(addresses);

    const root = invitelist.root();
    const proof = invitelist.proof(accountZero.address);

    const price = ethers.parseEther("0.08");

    const today = new Date();
    const tomorrow = today.setDate(today.getDate() + 1);
    const yesterday = today.setDate(today.getDate() + -1);

    console.log({ toda: Math.floor(Date.now() / 1000) });
    console.log({ tomo: Math.floor(tomorrow / 1000) });

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(tomorrow / 1000)),
      end: 0,
      limit: 1000,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });
    await nft.connect(owner).setInvite(root, ipfsh.ctod(CID_DEFAULT), {
      price: price,
      start: 0,
      end: 0,
      limit: 10,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    const invitePrivate = await nft.invites(root);
    const invitePublic = await nft.invites(ethers.ZeroHash);

    console.log({ invitePrivate, invitePublic });

    const { seedHash, seed, signature } = await generateSeedHash();

    // whitelisted wallet
    await expect(
      nft.mint({ key: root, proof: proof }, 1, ZERO, "0x", seedHash, {
        value: ethers.parseEther("0.07"),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    await nft.mint({ key: root, proof: proof }, 1, ZERO, "0x", seedHash, {
      value: price,
    });

    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();

    await nft.mint({ key: root, proof: proof }, 5, ZERO, "0x", seedHashTwo, {
      value: price * BigInt(5),
    });

    expect(await nft.totalSupply()).to.equal(6);

    const proofTwo = invitelist.proof(accountTwo.address);

    // non-whitelisted wallet
    // private mint rejection
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();

    await expect(
      nft
        .connect(accountTwo)
        .mint({ key: root, proof: proofTwo }, 2, ZERO, "0x", seedHashThree, {
          value: price * BigInt(2),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "WalletUnauthorizedToMint");

    // public mint rejection
    await expect(
      nft
        .connect(accountTwo)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          2,
          ZERO,
          "0x",
          seedHashThree,
          {
            value: price * BigInt(2),
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "MintNotYetStarted");

    const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(blockTimestamp),
      end: ethers.toBigInt(blockTimestamp + 10),
      limit: 1000,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    await ethers.provider.send("evm_increaseTime", [20]);
    // ended list rejectiong
    await expect(
      nft
        .connect(accountTwo)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          2,
          ZERO,
          "0x",
          seedHashThree,
          {
            value: price * BigInt(2),
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "MintEnded");

    expect(await nft.balanceOf(accountTwo.address, 1)).to.equal(0);
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 0,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    const invites = await nft.invites(ethers.ZeroHash);

    console.log({ invites });

    const { seedHash, seed, signature } = await generateSeedHash();

    await expect(
      nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: ethers.parseEther("0.08"),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MintingPaused");
  });

  // reminder: If this test is failing with BalanceEmpty() errors, first ensure
  // that the PLATFORM constant in ArchetypeErc1155Random.sol is set to local Hardhat network
  // account[2]
  it("should validate affiliate signatures and withdraw to correct account", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    // test invalid signature
    const invalidReferral = await accountZero.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    const { seedHash, seed, signature } = await generateSeedHash();

    await expect(
      nft
        .connect(accountZero)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          1,
          affiliate.address,
          invalidReferral,
          seedHash,
          {
            value: ethers.parseEther("0.08"),
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "InvalidSignature()");

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
        seedHash,
        {
          value: ethers.parseEther("0.08"),
        }
      );
    await nft.fulfillRandomMint(seed, signature);

    await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.068")); // 85%
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.012")
    ); // 15%

    // todo: test withdraw failure
    // let balance = (await ethers.provider.getBalance(owner.address));
    // await nft.connect(owner).withdraw();
    // let diff = (await ethers.provider.getBalance(owner.address)) - balance;
    // expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0")));

    // withdraw owner balance
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
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.064"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.0648"))
    );

    // mint again
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1,
        affiliate.address,
        referral,
        seedHashTwo,
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
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.064"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.0648"))
    );

    // withdraw platform balance
    balance = await ethers.provider.getBalance(platform.address);
    await archetypePayouts.connect(platform).withdraw();
    diff = (await ethers.provider.getBalance(platform.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.006")));
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.0068"))
    );

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
    await expect(nft.connect(owner).withdraw()).to.be.revertedWithCustomError(
      archetypeLogic,
      "BalanceEmpty"
    );

    // withdraw empty owner balance
    await expect(
      archetypePayouts.connect(owner).withdraw()
    ).to.be.revertedWithCustomError(archetypeLogic, "BalanceEmpty");

    // withdraw empty affiliate balance
    await expect(
      nft.connect(affiliate).withdrawAffiliate()
    ).to.be.revertedWithCustomError(archetypeLogic, "BalanceEmpty");

    // withdraw unused affiliate balance
    await expect(
      nft.connect(accountThree).withdrawAffiliate()
    ).to.be.revertedWithCustomError(archetypeLogic, "BalanceEmpty");
  });

  it("should set correct discounts - mint tiers and affiliate", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
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
        fulfillmentSigner: FULFILLMENT_SIGNER.address,
        maxSupply: 50,
        tokenPool: generateTokenPool(50),
        maxBatchSize: 200,
        affiliateFee: 1500,
        affiliateDiscount: 1000, // 10%
        defaultRoyalty: 500,
      },
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = asContractType<ArchetypeErc1155Random>(
      ArchetypeErc1155Random.attach(newCollectionAddress)
    );

    await nft.connect(owner).setAdvancedInvite(
      ethers.ZeroHash,
      ipfsh.ctod(CID_ZERO),
      {
        price: ethers.parseEther("0.1"),
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 300,
        maxSupply: 5000,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
        reservePrice: 0,
        delta: 0,
        interval: 0,
      }
    );

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    const { seedHash, seed, signature } = await generateSeedHash();

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        5,
        affiliate.address,
        referral,
        seedHash,
        {
          value: ethers.parseEther("0.09") * BigInt(5), // 10 % discount from using an affiliate = 0.9
        }
      );

    await expect(await nft.ownerBalance()).to.equal(
      ethers.parseEther("0.0765") * BigInt(5)
    ); // 85%
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.0135") * BigInt(5)
    ); // 15%
    await expect(await nft.totalSupply()).to.equal(5);

    await nft.fulfillRandomMint(seed, signature);

    // reset balances by withdrawing
    await nft.connect(platform).withdraw();
    await nft.connect(affiliate).withdrawAffiliate();

    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        9,
        affiliate.address,
        referral,
        seedHashTwo,
        {
          value: ethers.parseEther((0.1 * 9).toString()),
        }
      );

    await expect(await nft.totalSupply()).to.equal(14);

    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        21,
        affiliate.address,
        referral,
        seedHashThree,
        {
          value: ethers.parseEther((0.1 * 22).toString()),
        }
      );

    await expect(await nft.totalSupply()).to.equal(35);

    await nft.fulfillRandomMint(seedTwo, signatureTwo);
    await nft.fulfillRandomMint(seedThree, signatureThree);
  });

  it("should withdraw and credit correct amount - super affiliate", async function () {
    const [
      accountZero,
      accountOne,
      accountTwo,
      accountThree,
      accountFour,
      accountFive,
    ] = await ethers.getSigners();

    const owner = accountOne;
    const platform = accountTwo;
    const affiliate = accountThree;
    const superAffiliate = accountFour;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      {
        ownerBps: 9250,
        platformBps: 500,
        partnerBps: 0,
        superAffiliateBps: 250,
        partner: ZERO,
        superAffiliate: superAffiliate.address,
        ownerAltPayout: ZERO,
      }
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: 0,
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    const { seedHash, seed, signature } = await generateSeedHash();
    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1,
        affiliate.address,
        referral,
        seedHash,
        {
          value: ethers.parseEther("0.1"),
        }
      );

    await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.085")); // 85%
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.015")
    ); // 15%

    // withdraw to split
    await nft.connect(owner).withdraw();

    await expect(await archetypePayouts.balance(owner.address)).to.equal(
      ethers.parseEther("0.078625")
    ); // 92.5%
    await expect(
      await archetypePayouts.balance(superAffiliate.address)
    ).to.equal(ethers.parseEther("0.002125")); // 2.5%
    await expect(await archetypePayouts.balance(platform.address)).to.equal(
      ethers.parseEther("0.00425")
    ); // 5%

    // withdraw owner balance
    let balance = await ethers.provider.getBalance(owner.address);
    await archetypePayouts.connect(owner).withdraw();
    let diff = (await ethers.provider.getBalance(owner.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.0785"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.079")));

    // withdraw platform balance
    balance = await ethers.provider.getBalance(platform.address);
    await archetypePayouts.connect(platform).withdraw(); // partial withdraw
    diff = (await ethers.provider.getBalance(platform.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.004")));
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.00425"))
    );

    // withdraw super affiliate balance
    balance = await ethers.provider.getBalance(superAffiliate.address);
    await archetypePayouts.connect(superAffiliate).withdraw(); // partial withdraw
    diff = (await ethers.provider.getBalance(superAffiliate.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.002")));
    expect(Number(diff)).to.lessThanOrEqual(
      Number(ethers.parseEther("0.00225"))
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
        fulfillmentSigner: FULFILLMENT_SIGNER.address,
        maxSupply: 50,
        tokenPool: generateTokenPool(50),
        maxBatchSize: 20,
        affiliateFee: 1500,
        affiliateDiscount: 0,
        defaultRoyalty: 500,
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: DEFAULT_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      tokenIdsExcluded: [],
    });

    const { seedHash, seed, signature } = await generateSeedHash();

    await nft
      .connect(accountZero)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
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

    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();

    await nft
      .connect(accountZero)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
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

  //   const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

  //   await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
  //     price: ethers.parseEther("0.02"),
  //     start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
  //     limit: 300,
  //     maxSupply: 5000,
  //     randomize: true,
  //     tokenIdsExcluded: [1,2,3,4,5],
  //     tokenAddress: ZERO,
  //   });

  //   // mint tokens 1, 2, 3
  //   await nft.connect(holder).mint({ key: ethers.ZeroHash, proof: [] }, 3, ZERO, "0x", {
  //     value: ethers.parseEther("0.06"),
  //   });

  //   const msg = "Hi this is a test, I own this";

  //   // try to set as non token owner - will fail
  //   await expect(nft.connect(owner).setTokenMsg(3, msg)).to.be.revertedWithCustomError(archetypeLogic, "NotTokenOwner");

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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    // CHANGE URI
    await nft.connect(owner).setBaseURI("test uri");
    await expect((await nft.connect(owner).config()).baseUri).to.be.equal(
      "test uri"
    );
    await nft.connect(owner).lockURI("forever");
    await expect(nft.connect(owner).setBaseURI("new test uri")).to.be.reverted;

    // CHANGE TOKEN POOL
    await nft.connect(owner).appendTokenPool([6, 6, 6, 7], "forever");
    await expect(await nft.connect(owner).tokenPool()).to.deep.equal(
      DEFAULT_CONFIG.tokenPool.concat([6, 6, 6, 7])
    );
    await nft.connect(owner).lockTokenPool("forever");
    await expect(nft.connect(owner).appendTokenPool([8, 8, 9, 9], "forever")).to
      .be.reverted;

    // CHANGE MAX SUPPLY
    await nft.connect(owner).setMaxSupply(4, "forever");
    await expect((await nft.connect(owner).config()).maxSupply).to.equal(4);
    await nft.connect(owner).lockMaxSupply("forever");
    await expect(nft.connect(owner).setMaxSupply(5, "forever")).to.be.reverted;

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
    await nft.connect(owner).lockAffiliateFee("forever");
    await expect(nft.connect(owner).setAffiliateFee(20)).to.be.reverted;
    await expect(nft.connect(owner).setAffiliateDiscount(20)).to.be.reverted;
  });

  // it("test burn to mint functionality", async function () {
  //   const [accountZero, accountOne] = await ethers.getSigners();

  //   const owner = accountZero;
  //   const minter = accountOne;

  //   const default_config = {
  //     ...DEFAULT_CONFIG,
  //     maxBatchSize: 10,
  //     maxSupply: 10,
  //     tokenPool: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2], // all tokens minted will be tokenId 1, 2
  //   };

  //   const newCollectionBurn = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     default_config,
  //     DEFAULT_PAYOUT_CONFIG
  //   );
  //   const resultBurn = await newCollectionBurn.wait();
  //   const newCollectionAddressBurn = resultBurn.logs[0].address || "";
  //   const nftBurn = ArchetypeErc1155Random.attach(newCollectionAddressBurn);

  //   const newCollectionMint = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     default_config,
  //     DEFAULT_PAYOUT_CONFIG
  //   );
  //   const resultMint = await newCollectionMint.wait();
  //   const newCollectionAddressMint = resultMint.logs[0].address || "";
  //   const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

  //   await nftBurn.connect(owner).enableBurnToMint(await nftMint.getAddress(), BURN);
  //   await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
  //     price: 0,
  //     start: 0,
  //     end: 0,
  //     limit: 300,
  //     maxSupply: 5000,
  //     unitSize: 0,
  //     tokenIdsExcluded: [],
  //     tokenAddress: ZERO,
  //   });

  //   // mint 10 tokens
  //   await nftMint
  //     .connect(minter)
  //     .mint({ key: ethers.ZeroHash, proof: [] }, 10, ZERO, "0x", {
  //       value: 0,
  //     });

  //   // approve nftBurn to transfer tokens
  //   await nftMint.connect(minter).setApprovalForAll(nftBurn.address, true);

  //   // transfer away a token
  //   await nftMint.connect(minter).safeTransferFrom(minter.address, owner.address, 2, 1, "0x");

  //   // try to burn unowned token
  //   await expect(nftBurn.connect(minter).burnToMint([3], [1])).to.be.revertedWithCustomError(archetypeLogic,
  //     "ERC1155: insufficient balance for transfer"
  //   );

  //   // try to burn invalid number of tokens
  //   await expect(nftBurn.connect(minter).burnToMint([1, 2], [30, 30])).to.be.revertedWithCustomError(archetypeLogic,
  //     "ERC1155: insufficient balance for transfer"
  //   );

  //   // burn 1 of each tokenId
  //   await nftBurn.connect(minter).burnToMint([1, 2], [1, 1]);

  //   // burn 2 of token 1 and 3 of token 2
  //   await nftBurn.connect(minter).burnToMint([1, 2], [2, 3]);

  //   // disable burn to mint
  //   await nftBurn.connect(owner).disableBurnToMint();

  //   // burn will fail as burn is disabled
  //   await expect(nftBurn.connect(minter).burnToMint([1, 2], [1, 1])).to.be.revertedWithCustomError(archetypeLogic,
  //     "BurnToMintDisabled"
  //   );

  //   await expect(await nftMint.balanceOf(BURN, 1)).to.be.equal(3);
  //   await expect(await nftMint.balanceOf(BURN, 2)).to.be.equal(4);
  //   await expect(await nftBurn.balanceOf(minter.address, 1)).to.be.equal(3);
  //   await expect(await nftBurn.balanceOf(minter.address, 2)).to.be.equal(4);
  //   await expect(await nftBurn.totalSupply()).to.be.equal(7);
  // });

  it("test max supply checks", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxBatchSize: 500,
      maxSupply: 50,
      tokenPool: generateTokenPool(50),
    };

    const owner = accountZero;
    const minter = accountOne;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 500,
        maxSupply: 500,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    // try to mint more than max tokens tokens
    const { seedHash, seed, signature } = await generateSeedHash();

    await expect(
      nftMint
        .connect(minter)
        .mint({ key: ethers.ZeroHash, proof: [] }, 51, ZERO, "0x", seedHash, {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    // mint max tokens
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 50, ZERO, "0x", seedHash, {
        value: 0,
      });

    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    // try to mint after max reached
    await expect(
      nftMint
        .connect(minter)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    await expect(await nftMint.totalSupply()).to.be.equal(50);
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.02"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    // mint tokens from owner to holder address
    const { seedHash, seed, signature } = await generateSeedHash();
    await nft
      .connect(owner)
      .mintTo(
        { key: ethers.ZeroHash, proof: [] },
        3,
        holder.address,
        ZERO,
        "0x",
        seedHash,
        {
          value: ethers.parseEther("0.06"),
        }
      );
    // fulfill mint
    await nft.fulfillRandomMint(seed, signature);

    // test to=zero reverts with MintToZeroAddress
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    await expect(
      nft
        .connect(owner)
        .mintTo(
          { key: ethers.ZeroHash, proof: [] },
          1,
          ZERO,
          ZERO,
          "0x",
          seedHashTwo,
          {
            value: ethers.parseEther("0.02"),
          }
        )
    ).to.be.revertedWithCustomError(archetype, "MintToZeroAddress");

    let userBalance = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      userBalance += await nft.balanceOf(holder.address, i);
    }
    await expect(userBalance).to.be.equal(3);
    await expect(await nft.balanceOf(owner.address, 1)).to.be.equal(0);
  });

  // it("test batchMintTo Airdrop", async function () {
  //   const default_config = { ...DEFAULT_CONFIG, maxBatchSize: 5000, maxSupply: [5000] };

  //   const [accountZero, accountOne] = await ethers.getSigners();

  //   const owner = accountOne;

  //   const newCollection = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     default_config
  //   );

  //   const result = await newCollection.wait();
  //   const newCollectionAddress = result.logs[0].address || "";
  //   const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

  //   const invitelist = new Invitelist([owner.address]);
  //   const root = invitelist.root();
  //   const proof = invitelist.proof(accountZero.address);

  //   await nft.connect(owner).setInvite(root, ipfsh.ctod(CID_ZERO), {
  //     price: ethers.parseEther("0.00"),
  //     start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
  //     end: 0,
  //     limit: 5000,
  //     maxSupply: 5000,
  //     unitSize: 0,
  //     tokenIdsExcluded: [],
  //     tokenAddress: ZERO,
  //   });

  //   // mint tokens from owner to air drop list
  //   const airDropList: [string, number, number][] = [];
  //   for (let i = 0; i < 100; i++) {
  //     /// 100 addresses
  //     airDropList.push([ethers.Wallet.createRandom().address, 1, 1]);
  //   }

  //   // mint in n txs (can handle about 500 owners per tx with 3mil gas limit)
  //   const splits = 2;
  //   function splitToChunks(array, parts) {
  //     const copied = [...array];
  //     const result = [];
  //     for (let i = parts; i > 0; i--) {
  //       result.push(copied.splice(0, Math.ceil(copied.length / i)));
  //     }
  //     return result;
  //   }
  //   const airDropListSplit = splitToChunks(airDropList, splits);
  //   for (const split of airDropListSplit) {
  //     await nft.connect(owner).batchMintTo(
  //       { key: root, proof: proof },
  //       split.map(list => list[0]),
  //       split.map(list => list[1]),
  //       split.map(list => list[2]),
  //       ZERO,
  //       "0x",
  //       {
  //         value: ethers.parseEther("0.00"),
  //       }
  //     );
  //   }

  //   await expect(await nft.totalSupply()).to.be.equal(airDropList.length);
  //   await expect(await nft.balanceOf(airDropList[0][0], 1)).to.be.equal(1);
  //   await expect(await nft.balanceOf(airDropList[9][0], 1)).to.be.equal(1);
  //   await expect(await nft.balanceOf(airDropList[99][0], 1)).to.be.equal(1);
  //   // await expect(await nft.ownerOf(1)).to.be.equal(airDropList[0][0]);
  //   // await expect(await nft.ownerOf(10)).to.be.equal(airDropList[9][0]);
  //   // await expect(await nft.ownerOf(20)).to.be.equal(airDropList[19][0]);
  //   // await expect(await nft.ownerOf(60)).to.be.equal(airDropList[59][0]);
  //   // await expect(await nft.ownerOf(100)).to.be.equal(airDropList[99][0]);
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
    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();

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
    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
      maxSupply: 5000,
      tokenAddress: tokenAddress,
      unitSize: 0,
      tokenIdsExcluded: [],
    });

    // try to mint tokens without approval
    const { seedHash, seed, signature } = await generateSeedHash();
    await expect(
      nft
        .connect(holder)
        .mint({ key: erc20PublicKey, proof: [] }, 3, ZERO, "0x", seedHash)
    ).to.be.revertedWithCustomError(archetypeLogic, "NotApprovedToTransfer");

    await erc20
      .connect(holder)
      .approve(await nft.getAddress(), ethers.MaxUint256);

    // mint without enough erc20
    await expect(
      nft
        .connect(holder)
        .mint({ key: erc20PublicKey, proof: [] }, 3, ZERO, "0x", seedHash)
    ).to.be.revertedWithCustomError(archetypeLogic, "Erc20BalanceTooLow");

    await erc20.connect(holder).mint(ethers.parseEther("3"));

    const balance = await erc20.balanceOf(holder.address);

    console.log({ balance: balance.toString() });

    await nft
      .connect(holder)
      .mint({ key: erc20PublicKey, proof: [] }, 3, ZERO, "0x", seedHash);
    await nft.connect(holder).fulfillRandomMint(seed, signature);

    let userBalance = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      userBalance += await nft.balanceOf(holder.address, i);
    }
    await expect(userBalance).to.be.equal(3);
    await expect(await erc20.balanceOf(holder.address)).to.be.equal(0);
    await expect(await erc20.balanceOf(await nft.getAddress())).to.be.equal(
      ethers.parseEther("3")
    );

    await expect(
      await nft.ownerBalanceToken(await erc20.getAddress())
    ).to.be.equal(ethers.parseEther("3")); // 100%

    await nft.connect(owner).withdrawTokens([await erc20.getAddress()]);
    await expect(
      await erc20.balanceOf(await archetypePayouts.getAddress())
    ).to.be.equal(ethers.parseEther("3"));
    await archetypePayouts
      .connect(owner)
      .withdrawTokens([await erc20.getAddress()]);
    await expect(
      await erc20.balanceOf(await archetypePayouts.getAddress())
    ).to.be.equal(ethers.parseEther("0.15"));
    await archetypePayouts
      .connect(platform)
      .withdrawTokens([await erc20.getAddress()]);

    await expect(await erc20.balanceOf(owner.address)).to.be.equal(
      ethers.parseEther("2.85")
    );
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
        maxSupply: 5000,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    // mint at full price
    const { seedHash, seed, signature } = await generateSeedHash();
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: ethers.parseEther("1"),
      });

    // forward time 5000s
    await ethers.provider.send("evm_increaseTime", [5000]);

    // mint at half price
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
        value: ethers.parseEther("0.5"),
      });

    // forward a long time
    await ethers.provider.send("evm_increaseTime", [50000]);

    // mint at reserve price
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashThree, {
        value: ethers.parseEther("0.1"),
      });

    await nft.fulfillRandomMint(seed, signature);
    await nft.fulfillRandomMint(seedTwo, signatureTwo);
    await nft.fulfillRandomMint(seedThree, signatureThree);

    let userBalance = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      userBalance += await nft.balanceOf(holder.address, i);
    }
    await expect(userBalance).to.be.equal(3);
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
    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
        maxSupply: 5000,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    // mint at full price
    const { seedHash, seed, signature } = await generateSeedHash();

    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: ethers.parseEther("1"),
      });

    // forward time 5000s
    await ethers.provider.send("evm_increaseTime", [5000]);

    // try to mint at initial price, will revert
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();

    await expect(
      nft
        .connect(holder)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
          value: ethers.parseEther("1"),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    // mint at half price
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
        value: ethers.parseEther("6"),
      });

    // forward a long time
    await ethers.provider.send("evm_increaseTime", [50000]);

    // mint at reserve price
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();

    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashThree, {
        value: ethers.parseEther("10"),
      });

    await nft.fulfillRandomMint(seed, signature);
    await nft.fulfillRandomMint(seedTwo, signatureTwo);
    await nft.fulfillRandomMint(seedThree, signatureThree);

    let userBalance = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      userBalance += await nft.balanceOf(holder.address, i);
    }
    await expect(userBalance).to.be.equal(3);
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
        maxSupply: DEFAULT_CONFIG.maxSupply - 1,
        unitSize: 0,
        tokenAddress: ZERO,
        tokenIdsExcluded: [],
      });

    // mint at full price
    const { seedHash, seed, signature } = await generateSeedHash();
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: ethers.parseEther("1"),
      });

    // try to mint at initial price, will revert
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();

    await expect(
      nft
        .connect(holder)
        .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
          value: ethers.parseEther("1"),
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    // mint at current price (1.01) in a linear curve
    await nft
      .connect(holder)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
        value: ethers.parseEther("1.01"),
      });

    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();

    // mint 10 nfts, current price=1.02 and the price of 10 nfts = 1.02*10 + 0.01*10*9/2=10.65
    await nft
      .connect(holder)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        10,
        ZERO,
        "0x",
        seedHashThree,
        {
          value: ethers.parseEther("10.65"),
        }
      );

    await nft.fulfillRandomMint(seed, signature);
    await nft.fulfillRandomMint(seedTwo, signatureTwo);
    await nft.fulfillRandomMint(seedThree, signatureThree);

    let userBalance = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      userBalance += await nft.balanceOf(holder.address, i);
    }
    await expect(userBalance).to.be.equal(12);
  });

  it("test invite list max supply check", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: 2000,
      tokenPool: generateTokenPool(2000),
      maxBatchSize: 1000,
    };

    const PublicMaxSupply = 90;

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: PublicMaxSupply - 20,
        maxSupply: PublicMaxSupply,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    const { seedHash, seed, signature } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 40, ZERO, "0x", seedHash, {
        value: 0,
      });

    // try to mint past invite list max
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    await expect(
      nftMint
        .connect(minter2)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          60,
          ZERO,
          "0x",
          seedHashTwo,
          {
            value: 0,
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "ListMaxSupplyExceeded");

    await nftMint
      .connect(minter2)
      .mint({ key: ethers.ZeroHash, proof: [] }, 50, ZERO, "0x", seedHashTwo, {
        value: 0,
      });

    await expect(await nftMint.totalSupply()).to.be.equal(PublicMaxSupply);
  });

  it("test multiple public invite lists support in 0.5.1", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: 200,
      tokenPool: generateTokenPool(200),
      maxBatchSize: 100,
    };

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: ethers.parseEther("1"),
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 100,
        maxSupply: 100,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    const { seedHash, seed, signature } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 40, ZERO, "0x", seedHash, {
        value: ethers.parseEther("40"),
      });

    // set 2nd public list
    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 20,
      maxSupply: 100,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    await nftMint
      .connect(minter2)
      .mint({ key: HASHONE, proof: [] }, 20, ZERO, "0x", seedHashTwo, {
        value: 0,
      });

    // set 3rd public list
    await nftMint.connect(owner).setInvite(HASH256, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 40,
      maxSupply: 100,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();
    await nftMint
      .connect(minter2)
      .mint({ key: HASH256, proof: [] }, 40, ZERO, "0x", seedHashThree, {
        value: 0,
      });

    await expect(await nftMint.totalSupply()).to.be.equal(100);
  });

  it("test erc1155 random tokenId mints", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: 50,
      tokenPool: new Array(50).fill(100),
      maxBatchSize: 1000,
    };

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 100,
        maxSupply: 2 ** 32 - 1,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    // mint 1 random tokenIds
    const { seedHash, seed, signature } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: 0,
      });

    await expect(await nftMint.totalSupply()).to.be.equal(1);

    // mint 10 more random tokenIds
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 10, ZERO, "0x", seedHashTwo, {
        value: 0,
      });

    await expect(await nftMint.totalSupply()).to.be.equal(11);

    // mint last tokenIds
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        39,
        ZERO,
        "0x",
        seedHashThree,
        {
          value: 0,
        }
      );

    // try to mint past max supply
    const {
      seedHash: seedHashFour,
      seed: seedFour,
      signature: signatureFour,
    } = await generateSeedHash();
    await expect(
      nftMint
        .connect(minter2)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          1,
          ZERO,
          "0x",
          seedHashFour,
          {
            value: 0,
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    await expect(await nftMint.totalSupply()).to.be.equal(50);
  });

  it("test unit size mint 1 get x functionality", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] =
      await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      tokenPool: generateTokenPool(50),
      maxBatchSize: 50,
    };

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;
    const minter3 = accountThree;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 24,
        maxSupply: 40,
        unitSize: 12,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    // mint 1 get 12
    const { seedHash, seed, signature } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: 0,
      });

    // try to mint past invite list limit
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    await expect(
      nftMint
        .connect(minter)
        .mint({ key: ethers.ZeroHash, proof: [] }, 2, ZERO, "0x", seedHashTwo, {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "NumberOfMintsExceeded");

    // mint 2 get 24
    await nftMint
      .connect(minter2)
      .mint({ key: ethers.ZeroHash, proof: [] }, 2, ZERO, "0x", seedHashTwo, {
        value: 0,
      });

    // try to mint past invite list max
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();
    await expect(
      nftMint
        .connect(minter3)
        .mint(
          { key: ethers.ZeroHash, proof: [] },
          1,
          ZERO,
          "0x",
          seedHashThree,
          {
            value: 0,
          }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "ListMaxSupplyExceeded");

    await expect(await nftMint.totalSupply()).to.be.equal(36);
  });

  it("test erc1155 increasing token pool supply", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      tokenPool: generateTokenPool(50),
      maxBatchSize: 1000,
    };

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 2 ** 32 - 1,
        maxSupply: 2 ** 32 - 1,
        unitSize: 0,
        tokenIdsExcluded: [],
        tokenAddress: ZERO,
      });

    // mint 50
    const { seedHash, seed, signature } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 50, ZERO, "0x", seedHash, {
        value: 0,
      });
    await nftMint.fulfillRandomMint(seed, signature);

    await expect(await nftMint.totalSupply()).to.be.equal(50);

    // update tokenPool with more tokenIds
    await nftMint.connect(owner).setMaxSupply(57, "forever");
    await nftMint
      .connect(owner)
      .appendTokenPool([6, 6, 6, 7, 7, 7, 1], "forever");

    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();

    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 7, ZERO, "0x", seedHashTwo, {
        value: 0,
      });
    await nftMint.fulfillRandomMint(seedTwo, signatureTwo);

    await expect(await nftMint.balanceOf(minter.address, 1)).to.be.equal(11); // 10 from initial + 1 from expansion
    await expect(await nftMint.balanceOf(minter.address, 6)).to.be.equal(3);
    await expect(await nftMint.balanceOf(minter.address, 7)).to.be.equal(3);

    // update again
    await nftMint.connect(owner).setMaxSupply(61, "forever");
    await nftMint.connect(owner).appendTokenPool([20, 20, 20, 20], "forever");

    // mint 4 tof okenId 20
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();
    await nftMint
      .connect(minter2)
      .mint({ key: ethers.ZeroHash, proof: [] }, 4, ZERO, "0x", seedHashThree, {
        value: 0,
      });
    await nftMint.fulfillRandomMint(seedThree, signatureThree);

    await expect(await nftMint.balanceOf(minter2.address, 20)).to.be.equal(4);
  });

  it("test erc1155 large token pool of 10000 tokens", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      tokenPool: generateTokenPool(5000),
      maxBatchSize: 1000,
    };

    const owner = accountZero;
    const minter = accountOne;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    // Due to gas limit of 30 million in tx, need to split in two txs
    await nftMint
      .connect(owner)
      .appendTokenPool(generateTokenPool(5000), "forever");

    const tokenPool = await nftMint.connect(owner).tokenPool();
    await expect(tokenPool.length).to.be.equal(10000);

    // mint 1
    const { seedHash, seed, signature } = await generateSeedHash();

    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 2 ** 32 - 1,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });
    // mint 1 random
    await nftMint
      .connect(minter)
      .mint({ key: HASHONE, proof: [] }, 1, ZERO, "0x", seedHash, { value: 0 });

    await expect(await nftMint.totalSupply()).to.be.equal(1);
  });

  it("test erc1155 batch mint owner airdrop", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: 400,
    };
    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    // expect to throw when not called by owner
    await expect(
      nftMint
        .connect(minter)
        .airdropTo(
          [minter.address, minter2.address, minter.address, owner.address],
          [10, 10, 10, 10],
          [1, 5, 240, 5],
          { value: 0 }
        )
    ).to.be.revertedWithCustomError(archetype, "NotOwner");

    // expect validation to pickup that mint is passed max supply
    await expect(
      nftMint
        .connect(owner)
        .airdropTo(
          [minter.address, minter2.address, minter.address, owner.address],
          [100, 100, 100, 101],
          [1, 5, 240, 6],
          { value: 0 }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    // expect payment not to be allowed
    await expect(
      nftMint
        .connect(owner)
        .airdropTo(
          [minter.address, minter2.address, minter.address, owner.address],
          [100, 100, 100, 101],
          [1, 5, 240, 6],
          { value: 1 }
        )
    ).to.be.reverted;

    await nftMint
      .connect(owner)
      .airdropTo(
        [minter.address, minter2.address, minter.address, owner.address],
        [100, 100, 100, 100],
        [1, 5, 240, 6],
        { value: 0 }
      );

    // test lock
    await nftMint.connect(owner).lockAirdrop("forever");
    await expect(
      nftMint
        .connect(owner)
        .airdropTo(
          [minter.address, minter2.address, minter.address, owner.address],
          [100, 100, 100, 101],
          [1, 5, 240, 6],
          { value: 0 }
        )
    ).to.be.revertedWithCustomError(archetype, "LockedForever");

    await expect(await nftMint.totalSupply()).to.be.equal(400);
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
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

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
        tokenIdsExcluded: [],
      });

    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 100,
      maxSupply: 100,
      unitSize: 0,
      tokenAddress: ZERO,
      tokenIdsExcluded: [],
    });
    const nftMintAddress = await nftMint.getAddress();

    const targets = [
      nftMintAddress,
      nftMintAddress,
      nftMintAddress,
      nftMintAddress,
      nftMintAddress,
    ];

    const values = [
      0,
      0,
      0,
      ethers.parseEther("0.2"),
      ethers.parseEther("0.3"),
    ];

    const { seedHash, seed, signature } = await generateSeedHash();
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();
    const {
      seedHash: seedHashFour,
      seed: seedFour,
      signature: signatureFour,
    } = await generateSeedHash();
    const {
      seedHash: seedHashFive,
      seed: seedFive,
      signature: signatureFive,
    } = await generateSeedHash();

    const datas = [
      nftMint.interface.encodeFunctionData("mintTo", [
        { key: ethers.ZeroHash, proof: [] },
        1,
        minter3.address,
        ZERO,
        "0x",
        seedHash,
      ]),
      nftMint.interface.encodeFunctionData("mint", [
        { key: ethers.ZeroHash, proof: [] },
        2,
        ZERO,
        "0x",
        seedHashTwo,
      ]),
      nftMint.interface.encodeFunctionData("mintTo", [
        { key: ethers.ZeroHash, proof: [] },
        5,
        minter2.address,
        ZERO,
        "0x",
        seedHashThree,
      ]),
      nftMint.interface.encodeFunctionData("mint", [
        { key: HASHONE, proof: [] },
        2,
        ZERO,
        "0x",
        seedHashFour,
      ]),
      nftMint.interface.encodeFunctionData("mintTo", [
        { key: HASHONE, proof: [] },
        3,
        minter2.address,
        ZERO,
        "0x",
        seedHashFive,
      ]),
    ];

    // Execute batch transactions
    await archetypeBatch.connect(minter).executeBatch(targets, values, datas, {
      value: ethers.parseEther("0.6"),
    });

    await nftMint.fulfillRandomMint(seed, signature);
    await nftMint.fulfillRandomMint(seedTwo, signatureTwo);
    await nftMint.fulfillRandomMint(seedThree, signatureThree);
    await nftMint.fulfillRandomMint(seedFour, signatureFour);
    await nftMint.fulfillRandomMint(seedFive, signatureFive);

    let balanceOfMinter = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      balanceOfMinter += await nftMint.balanceOf(minter.address, i);
    }
    let balanceOfMinter2 = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      balanceOfMinter2 += await nftMint.balanceOf(minter2.address, i);
    }
    const totalSupply = await nftMint.totalSupply();

    expect(balanceOfMinter).to.be.equal(4);
    expect(balanceOfMinter2).to.be.equal(8);
    expect(totalSupply).to.be.equal(13);

    let balanceOfMinter3 = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      balanceOfMinter3 += await nftMint.balanceOf(minter3.address, i);
    }
    expect(balanceOfMinter3).to.be.equal(1);

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
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

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
      tokenIdsExcluded: [],
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
        tokenIdsExcluded: [],
      });

    const { seedHash, seed, signature } = await generateSeedHash();
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    const targets = [await nftMint.getAddress(), await nftMint.getAddress()];
    const values = [ethers.parseEther("0.5"), 0];
    const datas = [
      nftMint.interface.encodeFunctionData("mint", [
        { key: ethers.ZeroHash, proof: [] },
        5,
        ZERO,
        "0x",
        seedHash,
      ]),
      nftMint.interface.encodeFunctionData("mint", [
        { key: root, proof: proof },
        5,
        ZERO,
        "0x",
        seedHashTwo,
      ]),
    ];

    // Execute batch transactions
    await archetypeBatch.connect(minter).executeBatch(targets, values, datas, {
      value: ethers.parseEther("0.5"),
    });

    await nftMint.fulfillRandomMint(seed, signature);
    await nftMint.fulfillRandomMint(seedTwo, signatureTwo);

    // minter is validated through tx.origin
    let balanceOfMinter = BigInt(0);
    for (let i = 0; i <= 5; i++) {
      balanceOfMinter += await nftMint.balanceOf(minter.address, i);
    }
    const totalSupply = await nftMint.totalSupply();
    expect(balanceOfMinter).to.be.equal(10);
    expect(totalSupply).to.be.equal(10);
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
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);
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
          tokenIdsExcluded: [],
        },
      ]),
      nftMint.interface.encodeFunctionData("appendTokenPool", [
        [8, 10, 10],
        "forever",
      ]),
      nftMint.interface.encodeFunctionData("setBaseURI", ["test"]),
    ];

    // Execute batch transactions
    await archetypeBatch.connect(owner).executeBatch(targets, values, datas, {
      value: ethers.parseEther("0.0"),
    });

    await expect(await nftMint.connect(owner).tokenPool()).to.deep.equal(
      DEFAULT_CONFIG.tokenPool.concat([8, 10, 10])
    );
    await expect((await nftMint.connect(owner).config()).baseUri).to.be.equal(
      "test"
    );
  });

  it("test erc1155 multiple rounds of token pools w/ tokenPool clearing", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: 500,
      tokenPool: Array(10)
        .fill(1)
        .concat(Array(20).fill(2))
        .concat(Array(40).fill(3))
        .concat(Array(30).fill(4))
        .concat(Array(100).fill(5)),
      maxBatchSize: 1000,
    };

    const owner = accountZero;
    const minter = accountOne;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 2 ** 32 - 1,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });

    const { seedHash, seed, signature } = await generateSeedHash();
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();

    await nftMint
      .connect(minter)
      .mint({ key: HASHONE, proof: [] }, 1, ZERO, "0x", seedHash, { value: 0 });
    await expect(await nftMint.totalSupply()).to.be.equal(1);

    await nftMint
      .connect(minter)
      .mint({ key: HASHONE, proof: [] }, 99, ZERO, "0x", seedHashTwo, {
        value: 0,
      });
    await expect(await nftMint.totalSupply()).to.be.equal(100);

    await nftMint
      .connect(minter)
      .mint({ key: HASHONE, proof: [] }, 50, ZERO, "0x", seedHashThree, {
        value: 0,
      });
    await expect(await nftMint.totalSupply()).to.be.equal(150);

    // lets add 100 more tokens to the pool
    await nftMint.connect(owner).appendTokenPool(Array(100).fill(6), "forever");

    const {
      seedHash: seedHashFour,
      seed: seedFour,
      signature: signatureFour,
    } = await generateSeedHash();

    // mint 75 tokens
    await nftMint
      .connect(minter)
      .mint({ key: HASHONE, proof: [] }, 75, ZERO, "0x", seedHashFour, {
        value: 0,
      });
    await expect(await nftMint.totalSupply()).to.be.equal(225);

    // fulfill mints
    await nftMint.fulfillRandomMint(seed, signature);
    await nftMint.fulfillRandomMint(seedTwo, signatureTwo);
    await nftMint.fulfillRandomMint(seedThree, signatureThree);
    await nftMint.fulfillRandomMint(seedFour, signatureFour);

    // should be 75 tokens left
    let tokenPool = await nftMint.connect(owner).tokenPool();
    await expect(tokenPool.length).to.be.equal(75);

    // lets clear the pool for new release
    await nftMint.connect(owner).replaceTokenPool(Array(10).fill(7), "forever");

    tokenPool = await nftMint.connect(owner).tokenPool();
    await expect(tokenPool.length).to.be.equal(10);

    const {
      seedHash: seedHashFive,
      seed: seedFive,
      signature: signatureFive,
    } = await generateSeedHash();

    // try to mint past token pool length
    await expect(
      nftMint
        .connect(minter)
        .mint({ key: HASHONE, proof: [] }, 11, ZERO, "0x", seedHashFive, {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "TokenPoolEmpty");
  });

  it("test erc1155 random tokenId exclusion mints", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: 100,
      tokenPool: generateTokenPool(100),
      maxBatchSize: 100,
    };

    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: 0,
        end: 0,
        limit: 2 ** 32 - 1,
        maxSupply: 2 ** 32 - 1,
        unitSize: 0,
        tokenIdsExcluded: [1], // tokenIds 1 cannot be minted - 20% of the supply
        tokenAddress: ZERO,
      });

    // mint 20 tokens
    // we allow excluded tokens on the 10th retry
    // At worst case on the 20th mint, the number of excluded tokens is 20/80 (25%)
    // 0.25^(10 retries) = tiny chance that mint includes excluded
    const { seedHash, seed, signature } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 20, ZERO, "0x", seedHash, {
        value: 0,
      });
    await nftMint.fulfillRandomMint(seed, signature);

    await expect(await nftMint.totalSupply()).to.be.equal(20);
    await expect(await nftMint.balanceOf(minter.address, 1)).to.be.equal(0);
  });

  it("test erc1155 random tokenId exclusion large scale mint", async function () {
    const generateTokenPool = (tokenIds: number[], x: number): number[] =>
      [].concat(...tokenIds.map((i) => Array(x).fill(i)));
    const tokenPool = generateTokenPool([130, 131, 135, 137, 138], 100)
      .concat(generateTokenPool([132, 134, 139, 140, 141], 50))
      .concat(generateTokenPool([142, 136], 10))
      .concat(generateTokenPool([133, 143], 1));

    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: tokenPool.length,
      tokenPool: tokenPool,
      maxBatchSize: tokenPool.length,
    };

    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const owner = accountZero;
    const minter = accountOne;
    const minter2 = accountTwo;

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155Random.attach(newCollectionAddressMint);

    await nftMint
      .connect(owner)
      .setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: 0,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 2 ** 32 - 1,
        maxSupply: 2 ** 32 - 1,
        unitSize: 0,
        tokenIdsExcluded: [133, 143], // 133 and 143 are both 1/1s, 2/772 tokens excluded
        tokenAddress: ZERO,
      });

    // mint entire supply
    const { seedHash, seed, signature } = await generateSeedHash();
    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    const {
      seedHash: seedHashThree,
      seed: seedThree,
      signature: signatureThree,
    } = await generateSeedHash();
    const {
      seedHash: seedHashFour,
      seed: seedFour,
      signature: signatureFour,
    } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 20, ZERO, "0x", seedHash, {
        value: 0,
      });
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 700, ZERO, "0x", seedHashTwo, {
        value: 0,
      });
    await nftMint
      .connect(minter)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        30,
        ZERO,
        "0x",
        seedHashThree,
        {
          value: 0,
        }
      );
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 10, ZERO, "0x", seedHashFour, {
        value: 0,
      });

    nftMint.fulfillRandomMint(seed, signature);
    nftMint.fulfillRandomMint(seedTwo, signatureTwo);
    nftMint.fulfillRandomMint(seedThree, signatureThree);
    nftMint.fulfillRandomMint(seedFour, signatureFour);

    // the only tokens left at this point are 10 tokens + the excluded 2 tokens 133 and 143
    await expect(await nftMint.totalSupply()).to.be.equal(760);
    await expect(await nftMint.balanceOf(minter.address, 133)).to.be.equal(0);
    await expect(await nftMint.balanceOf(minter.address, 143)).to.be.equal(0);

    // mint 12 tokens, the excluded tokens will be minted due to being last available tokens
    const {
      seedHash: seedHashFive,
      seed: seedFive,
      signature: signatureFive,
    } = await generateSeedHash();
    await nftMint
      .connect(minter)
      .mint({ key: ethers.ZeroHash, proof: [] }, 12, ZERO, "0x", seedHashFive, {
        value: 0,
      });

    await nftMint.fulfillRandomMint(seedFive, signatureFive);

    await expect(await nftMint.totalSupply()).to.be.equal(772);
    await expect(await nftMint.balanceOf(minter.address, 133)).to.be.equal(1);
    await expect(await nftMint.balanceOf(minter.address, 143)).to.be.equal(1);
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
    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
        tokenIdsExcluded: [],
      })
      .then((tx) => tx.wait());

    const preContractBalance = await ethers.provider.getBalance(
      await nft.getAddress()
    );
    const preUserBalance = await ethers.provider.getBalance(user.address);

    const { seedHash, seed, signature } = await generateSeedHash();

    await nft
      .connect(user)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
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
    const dev = accountFour;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
      tokenIdsExcluded: [],
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

    const { seedHash, seed, signature } = await generateSeedHash();

    await nft
      .connect(accountZero)
      .mint(
        { key: ethers.ZeroHash, proof: [] },
        1,
        affiliate.address,
        referral,
        seedHash,
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
    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

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
        tokenIdsExcluded: [],
      })
      .then((tx) => tx.wait());

    const { seedHash, seed, signature } = await generateSeedHash();

    await nft
      .connect(accountOne)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
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

    const {
      seedHash: seedHashTwo,
      seed: seedTwo,
      signature: signatureTwo,
    } = await generateSeedHash();
    await nft
      .connect(accountOne)
      .mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHashTwo, {
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

  it("test seed fulfillment and signing", async function () {
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

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: 0,
      end: 0,
      limit: 300,
      unitSize: 0,
      tokenIdsExcluded: [],
      maxSupply: 500,
      tokenAddress: ZERO,
    });

    const invites = await nft.invites(ethers.ZeroHash);

    console.log({ invites });

    console.log("current time", Math.floor(Date.now() / 1000));

    const { seedHash, seed, signature } = await generateSeedHash();

    await nft.mint(
      { key: ethers.ZeroHash, proof: [] },
      1,
      ZERO,
      "0x",
      seedHash,
      {
        value: ethers.parseEther("0.08"),
      }
    );

    // supply will be set
    expect(await nft.totalSupply()).to.equal(1);

    //seed hash cant be reused
    await expect(
      nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: ethers.parseEther("0.08"),
      })
    ).to.be.revertedWithCustomError(archetype, "SeedHashAlreadyExists");

    const fakeSignature = await accountZero.signMessage(
      ethers.getBytes(ethers.solidityPackedKeccak256(["uint256"], [seed]))
    );

    // mint only fullfilled with original seed
    await expect(
      nft.fulfillRandomMint(seed, fakeSignature)
    ).to.be.revertedWithCustomError(archetypeLogic, "InvalidSignature");
    nft.fulfillRandomMint(seed, signature);

    //seed hash cant be reused
    await await expect(
      nft.mint({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash, {
        value: ethers.parseEther("0.08"),
      })
    ).to.be.revertedWithCustomError(archetype, "SeedHashAlreadyExists");
  });

  it("should require a fee to deploy a collection", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();

    const owner = accountOne;
    const holder = accountZero;
    const platform = accountTwo;

    const deployPrice = ethers.parseEther('0.05')

    await factory.connect(accountZero).setDeployFee(deployPrice)

    expect(await factory.deployFee()).to.equal(deployPrice)

    await expect(factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG,
    )).to.be.revertedWithCustomError(factory, "InsufficientDeployFee");

    const newCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG,
      { value: deployPrice }
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);

    const symbol = await nft.symbol();

    await expect(await archetypePayouts.balance(platform.address)).to.equal(deployPrice);

    // test overpay and refund

    const preUserBalance = await ethers.provider.getBalance(accountOne.address);

    const newCollectionTwo = await factory.connect(accountOne).createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG,
      { value: ethers.parseEther("0.1") }
    );

    const postFactoryBalance = await ethers.provider.getBalance(
      await factory.getAddress()
    );
    const postUserBalance = await ethers.provider.getBalance(accountOne.address);

    const delta = ethers.parseEther("0.001");
    expect(postUserBalance).closeTo(preUserBalance - deployPrice, delta);
    expect(postFactoryBalance).eq(0);

    await expect(await archetypePayouts.balance(platform.address)).to.equal(deployPrice * BigInt(2));

    await factory.connect(accountZero).setDeployFee(0)

  });

  it("test unrevealed token listing, delisting and buying", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] = await ethers.getSigners();
  
    const owner = accountOne;
    const platform = accountTwo;
    const buyer = accountThree;

  
    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
  
    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);
  
    // Set up the price for minting
    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });
  
    // Mint four unrevealed tokens
    const { seedHash: seedHash1, seed: seed1, signature: signature1 } = await generateSeedHash();
    const { seedHash: seedHash2, seed: seed2, signature: signature2 } = await generateSeedHash();
    const { seedHash: seedHash3, seed: seed3, signature: signature3 } = await generateSeedHash();
    const { seedHash: seedHash4, seed: seed4, signature: signature4 } = await generateSeedHash();
  
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash1,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash2,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash3,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash4,
      { value: ethers.parseEther("0.1") }
    );
  
    // Check total supply
    expect(await nft.totalSupply()).to.equal(4);
  
    // List the first unrevealed token for sale
    await nft.connect(accountZero).listUnrevealedToken(seedHash1, ethers.parseEther("0.5"));
    
    // List the second unrevealed token for a lower price
    await nft.connect(accountZero).listUnrevealedToken(seedHash2, ethers.parseEther("0.3"));
    
    // List the third unrevealed token for an even lower price
    await nft.connect(accountZero).listUnrevealedToken(seedHash3, ethers.parseEther("0.2"));
  
    // Check that the lowest price hash is set correctly
    expect(await nft.lowestPriceHash()).to.equal(seedHash3);
    
    // Delist the lowest priced token
    await nft.connect(accountZero).delistUnrevealedToken(seedHash3);
    
    // Check that the lowest price hash is updated
    expect(await nft.lowestPriceHash()).to.equal(seedHash2);
  
    // Try to delist a token that isn't owned by the sender
    await expect(
      nft.connect(buyer).delistUnrevealedToken(seedHash2)
    ).to.be.revertedWithCustomError(archetype, "NotTokenOwner");
  
    // Get balances before the purchase
    const sellerBalanceBefore = await ethers.provider.getBalance(accountZero.address);
    const platformBalanceBefore = await archetypePayouts.balance(platform.address);
    
    // Buy the lowest priced token (now seedHash2)
    await nft.connect(buyer).buyLowestPricedUnrevealedToken({
      value: ethers.parseEther("0.5") // Sending more than needed
    });
    
    // Check that the ownership was transferred
    expect(await nft.seedHashOwner(seedHash2)).to.equal(buyer.address);
    
    // Check that the price was set to 0 (not for sale anymore)
    expect(await nft.seedHashPrice(seedHash2)).to.equal(0);
    
    // Check that the lowest price hash is updated
    expect(await nft.lowestPriceHash()).to.equal(seedHash1);
    
    // Check that the seller received payment (minus platform fee)
    const sellerBalanceAfter = await ethers.provider.getBalance(accountZero.address);
    const platformBalanceAfter = await archetypePayouts.balance(platform.address);
    
    // Platform fee is 5% (500 bps) of 0.3 ETH = 0.015 ETH
    // Seller should receive 0.3 - 0.015 = 0.285 ETH
    const platformFee = ethers.parseEther("0.3") * BigInt(500) / BigInt(10000);
    const sellerPayment = ethers.parseEther("0.3") - platformFee;
    
    // Check that the seller received the correct amount
    expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(sellerPayment);
    
    // Check that the platform fee was credited in the payout contract
    expect(platformBalanceAfter - platformBalanceBefore).to.equal(platformFee);
    
    // Try to buy a non-existent or delisted token
    await nft.connect(accountZero).fulfillRandomMint(seed3, signature3);
    
    // List the fourth token
    await nft.connect(accountZero).listUnrevealedToken(seedHash4, ethers.parseEther("0.4"));
    
    // Check buying tokens with insufficient ETH
    await expect(
      nft.connect(buyer).buyLowestPricedUnrevealedToken({
        value: ethers.parseEther("0.1")
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");
    
    // Fulfill the tokens and verify that they can't be listed anymore
    await nft.connect(accountZero).fulfillRandomMint(seed1, signature1);
    
    // Try to list a token that has been revealed (should fail)
    await expect(
      nft.connect(accountZero).listUnrevealedToken(seedHash1, ethers.parseEther("0.5"))
    ).to.be.revertedWithCustomError(archetype, "TokenAlreadyRevealed");
    
    // Try to buy when no tokens are available
    await nft.connect(accountZero).fulfillRandomMint(seed4, signature4);
    
    await expect(
      nft.connect(buyer).buyLowestPricedUnrevealedToken({
        value: ethers.parseEther("0.5")
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "NotListed");
    
    // Test full flow
    const { seedHash: seedHash5, seed: seed5, signature: signature5 } = await generateSeedHash();
    
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash5,
      { value: ethers.parseEther("0.1") }
    );
    
    // List the token
    await nft.connect(accountZero).listUnrevealedToken(seedHash5, ethers.parseEther("0.25"));
    
    // Buy the token using the buyAvailableToken function
    await nft.connect(buyer).buyLowestPricedUnrevealedToken({
      value: ethers.parseEther("0.25")
    });
    
    // Check that the ownership was transferred
    expect(await nft.seedHashOwner(seedHash5)).to.equal(buyer.address);
  });

  it("test getAvailableUnrevealedTokens for unrevealed tokens", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] = await ethers.getSigners();
  
    const owner = accountOne;
    const buyer = accountTwo;
    const platform = accountThree;
  
    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
  
    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeErc1155Random.attach(newCollectionAddress);
  
    // Set up the price for minting
    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIdsExcluded: [],
      tokenAddress: ZERO,
    });
  
    // Mint six unrevealed tokens
    const { seedHash: seedHash1, seed: seed1, signature: signature1 } = await generateSeedHash();
    const { seedHash: seedHash2, seed: seed2, signature: signature2 } = await generateSeedHash();
    const { seedHash: seedHash3, seed: seed3, signature: signature3 } = await generateSeedHash();
    const { seedHash: seedHash4, seed: seed4, signature: signature4 } = await generateSeedHash();
    const { seedHash: seedHash5, seed: seed5, signature: signature5 } = await generateSeedHash();
    const { seedHash: seedHash6, seed: seed6, signature: signature6 } = await generateSeedHash();
  
    // Mint tokens with different owners
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash1,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash2,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(buyer).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash3,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(buyer).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash4,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash5,
      { value: ethers.parseEther("0.1") }
    );
  
    await nft.connect(accountZero).mint(
      { key: ethers.ZeroHash, proof: [] }, 1, ZERO, "0x", seedHash6,
      { value: ethers.parseEther("0.1") }
    );
  
    // Check total supply
    expect(await nft.totalSupply()).to.equal(6);
  
    // List the tokens for sale at different prices
    await nft.connect(accountZero).listUnrevealedToken(seedHash1, ethers.parseEther("0.5"));
    await nft.connect(accountZero).listUnrevealedToken(seedHash2, ethers.parseEther("0.3"));
    await nft.connect(buyer).listUnrevealedToken(seedHash3, ethers.parseEther("0.2"));
    await nft.connect(buyer).listUnrevealedToken(seedHash4, ethers.parseEther("0.6"));
    await nft.connect(accountZero).listUnrevealedToken(seedHash5, ethers.parseEther("0.4"));
    // Note: seedHash6 is not listed
  
    // Make sure the lowest price hash is correctly set
    expect(await nft.lowestPriceHash()).to.equal(seedHash3);
  
    // Test with count = 0
    const [emptyTokens, emptyPrices, emptySellers] = await nft.getAvailableUnrevealedTokens(0);
    expect(emptyTokens.length).to.equal(0);
    expect(emptyPrices.length).to.equal(0);
    expect(emptySellers.length).to.equal(0);
  
    // Test with count = 2
    const [twoTokens, twoPrices, twoSellers] = await nft.getAvailableUnrevealedTokens(2);
    expect(twoTokens.length).to.equal(2);
    expect(twoPrices.length).to.equal(2);
    expect(twoSellers.length).to.equal(2);
    
    // Verify the tokens are returned in order of price (lowest first)
    expect(twoTokens[0]).to.equal(seedHash3);
    expect(twoPrices[0]).to.equal(ethers.parseEther("0.2"));
    expect(twoSellers[0]).to.equal(buyer.address);
    
    expect(twoTokens[1]).to.equal(seedHash2);
    expect(twoPrices[1]).to.equal(ethers.parseEther("0.3"));
    expect(twoSellers[1]).to.equal(accountZero.address);
  
    // Test with count = 10 (more than available, should return all 5 listed tokens)
    const [allTokens, allPrices, allSellers] = await nft.getAvailableUnrevealedTokens(10);
    expect(allTokens.length).to.equal(5);
    expect(allPrices.length).to.equal(5);
    expect(allSellers.length).to.equal(5);
  
    // Verify the tokens are in correct order (by price)
    expect(allTokens[0]).to.equal(seedHash3);  // 0.2 ETH
    expect(allTokens[1]).to.equal(seedHash2);  // 0.3 ETH
    expect(allTokens[2]).to.equal(seedHash5);  // 0.4 ETH
    expect(allTokens[3]).to.equal(seedHash1);  // 0.5 ETH
    expect(allTokens[4]).to.equal(seedHash4);  // 0.6 ETH
  
    // Verify the prices match
    expect(allPrices[0]).to.equal(ethers.parseEther("0.2"));
    expect(allPrices[1]).to.equal(ethers.parseEther("0.3"));
    expect(allPrices[2]).to.equal(ethers.parseEther("0.4"));
    expect(allPrices[3]).to.equal(ethers.parseEther("0.5"));
    expect(allPrices[4]).to.equal(ethers.parseEther("0.6"));
  
    // Verify the sellers match
    expect(allSellers[0]).to.equal(buyer.address);
    expect(allSellers[1]).to.equal(accountZero.address);
    expect(allSellers[2]).to.equal(accountZero.address);
    expect(allSellers[3]).to.equal(accountZero.address);
    expect(allSellers[4]).to.equal(buyer.address);
  
    // Test that revealed tokens are not included
    await nft.connect(accountZero).fulfillRandomMint(seed3, signature3);
  
    const [afterRevealTokens, afterRevealPrices, afterRevealSellers] = await nft.getAvailableUnrevealedTokens(10);
    expect(afterRevealTokens.length).to.equal(4); // One less than before
    expect(afterRevealPrices.length).to.equal(4);
    expect(afterRevealSellers.length).to.equal(4);
    
    // seedHash3 should no longer be in the list
    for (let i = 0; i < afterRevealTokens.length; i++) {
      expect(afterRevealTokens[i]).to.not.equal(seedHash3);
    }
  
    // Now the lowest price should be 0.3 ETH (seedHash2)
    expect(afterRevealTokens[0]).to.equal(seedHash2);
    expect(afterRevealPrices[0]).to.equal(ethers.parseEther("0.3"));
  
    // Test after delisting a token
    await nft.connect(accountZero).delistUnrevealedToken(seedHash2);
    
    const [afterDelistTokens, afterDelistPrices, afterDelistSellers] = await nft.getAvailableUnrevealedTokens(10);
    expect(afterDelistTokens.length).to.equal(3); // One less than before
    expect(afterDelistPrices.length).to.equal(3);
    expect(afterDelistSellers.length).to.equal(3);
    
    // seedHash2 should no longer be in the list
    for (let i = 0; i < afterDelistTokens.length; i++) {
      expect(afterDelistTokens[i]).to.not.equal(seedHash2);
    }
  
    // Now the lowest price should be 0.4 ETH (seedHash5)
    expect(afterDelistTokens[0]).to.equal(seedHash5);
    expect(afterDelistPrices[0]).to.equal(ethers.parseEther("0.4"));
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
