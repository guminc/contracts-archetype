import { ethers } from "hardhat";

import { expect } from "chai";
import Invitelist from "../lib/invitelist";
import {
  IArchetypeErc1155Config,
  IArchetypePayoutConfig,
} from "../lib/types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import ipfsh from "ipfsh";
import {
  ArchetypeErc1155,
  ArchetypeBatch,
  ArchetypeLogicErc1155,
  ArchetypePayouts,
  FactoryErc1155,
  TestErc20,
} from "../../typechain-types";
import { BaseContract } from "ethers";

const DEFAULT_NAME = "Pookie";
const DEFAULT_SYMBOL = "POOKIE";
let AFFILIATE_SIGNER: SignerWithAddress;
let DEFAULT_CONFIG: IArchetypeErc1155Config;
let DEFAULT_PAYOUT_CONFIG: IArchetypePayoutConfig;

// this is an IPFS content ID which stores a list of addresses ({address: string[]})
// eg: https://ipfs.io/ipfs/bafkreih2kyxirba6a6dyzt4tsdqb5iim3soprumtewq6garaohkfknqlaq
// utility for converting CID to bytes32: https://github.com/factoria-org/ipfsh
const CID_DEFAULT = "Qmbro8pnECVvjwWH6J9KyFXR8isquPFNgbUiHDGXhYnmFn";

const CID_ZERO = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const ZERO = "0x0000000000000000000000000000000000000000";
// const BURN = "0x000000000000000000000000000000000000dEaD";
const HASHONE = "0x0000000000000000000000000000000000000000000000000000000000000001";
const HASH256 = "0x00000000000000000000000000000000000000000000000000000000000000ff";

function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}

describe("FactoryErc1155", function () {
  let ArchetypeErc1155;
  let archetype: ArchetypeErc1155;
  let archetypeLogic: ArchetypeLogicErc1155;
  let archetypeBatch: ArchetypeBatch;
  let archetypePayouts: ArchetypePayouts;
  let factory: FactoryErc1155;

  before(async function () {
    AFFILIATE_SIGNER = (await ethers.getSigners())[4]; // account[4]
    DEFAULT_CONFIG = {
      baseUri:
        "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
      affiliateSigner: AFFILIATE_SIGNER.address,
      maxSupply: [5000],
      maxBatchSize: 20,
      affiliateFee: 1500,
      affiliateDiscount: 0,
      defaultRoyalty: 500,
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

    const ArchetypeLogicErc1155 = await ethers.getContractFactory(
      "ArchetypeLogicErc1155"
    );
    archetypeLogic = asContractType<ArchetypeLogicErc1155>(
      await ArchetypeLogicErc1155.deploy()
    );

    ArchetypeErc1155 = await ethers.getContractFactory(
      "ArchetypeErc1155",
      {
        libraries: {
          ArchetypeLogicErc1155: await archetypeLogic.getAddress(),
        },
      }
    );

    const ArchetypePayouts = await ethers.getContractFactory(
      "ArchetypePayouts"
    );
    archetypePayouts = asContractType<ArchetypePayouts>(
      await ArchetypePayouts.deploy()
    );

    archetype = await ArchetypeErc1155.deploy();
    const archetypeAddress = await archetype.getAddress();

    const Factory = await ethers.getContractFactory("FactoryErc1155");
    factory = asContractType<FactoryErc1155>(
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

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
      archetype.initialize("Wookie", DEFAULT_SYMBOL, DEFAULT_CONFIG, DEFAULT_PAYOUT_CONFIG, accountOne.address)
    ).to.be.revertedWith("Initializable: contract is already initialized");

    const newCollection = await factory.createCollection(
      accountOne.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    const symbol = await nft.symbol();
    const owner = await nft.owner();

    expect(symbol).to.equal(DEFAULT_SYMBOL);
    expect(owner).to.equal(accountOne.address);

    const ArchetypeLogicErc1155 = await ethers.getContractFactory(
      "ArchetypeLogicErc1155"
    );
    archetypeLogic = asContractType<ArchetypeLogicErc1155>(
      await ArchetypeLogicErc1155.deploy()
    );
    const NewArchetype = await ethers.getContractFactory("ArchetypeErc1155", {
      libraries: {
        ArchetypeLogicErc1155: await archetypeLogic.getAddress(),
      },
    });

    // const archetype = await upgrades.deployProxy(Archetype, []);

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

    const nft1 = ArchetypeErc1155.attach(anotherollectionAddress);

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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await expect(nft.lockURI("forever")).to.be.revertedWithCustomError(archetype, "NotOwner");
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000) - 60), // one minute ago
      end: 0,
      limit: 300,
      unitSize: 0,
      tokenIds: [],
      maxSupply: 500,
      tokenAddress: ZERO,
    });

    const invites = await nft.invites(ethers.ZeroHash);

    console.log({ invites });

    console.log("current time", Math.floor(Date.now() / 1000));

    await nft.mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
      value: ethers.parseEther("0.08"),
    });

    expect(await nft.balanceOf(accountZero.address, 1)).to.equal(1);
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

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
      start: ethers.getBigInt(Math.floor(tomorrow / 1000)),
      end: 0,
      limit: 1000,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });
    await nft.connect(owner).setInvite(root, ipfsh.ctod(CID_DEFAULT), {
      price: price,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 10,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    const invitePrivate = await nft.invites(root);
    const invitePublic = await nft.invites(ethers.ZeroHash);

    console.log({ invitePrivate, invitePublic });

    // whitelisted wallet
    await expect(
      nft.mintToken({ key: root, proof: proof }, 1, 1, ZERO, "0x", {
        value: ethers.parseEther("0.07"),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    await nft.mintToken({ key: root, proof: proof }, 1, 1, ZERO, "0x", {
      value: price,
    });

    await nft.mintToken({ key: root, proof: proof }, 5, 1, ZERO, "0x", {
      value: price * BigInt(5),
    });

    expect(await nft.balanceOf(accountZero.address, 1)).to.equal(6);

    const proofTwo = invitelist.proof(accountTwo.address);

    // non-whitelisted wallet
    // private mint rejection
    await expect(
      nft.connect(accountTwo).mintToken({ key: root, proof: proofTwo }, 2, 1, ZERO, "0x", {
        value: price * BigInt(2),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "WalletUnauthorizedToMint");

    // public mint rejection
    await expect(
      nft.connect(accountTwo).mintToken({ key: ethers.ZeroHash, proof: [] }, 2, 1, ZERO, "0x", {
        value: price * BigInt(2),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MintNotYetStarted");

    const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: price,
      start: ethers.toBigInt(blockTimestamp),
      end: ethers.toBigInt(blockTimestamp + 10),
      limit: 1000,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    await ethers.provider.send("evm_increaseTime", [20]);

    // ended list rejectiong
    await expect(
      nft.connect(accountTwo).mintToken({ key: ethers.ZeroHash, proof: [] }, 2, 1, ZERO, "0x", {
        value: price * BigInt(2),
      })
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 0,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    const invites = await nft.invites(ethers.ZeroHash);

    console.log({ invites });

    await expect(
      nft.mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
        value: ethers.parseEther("0.08"),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MintingPaused");
  });

  // reminder: If this test is failing with BalanceEmpty() errors, first ensure
  // that the PLATFORM constant in ArchetypeErc1155sol is set to local Hardhat network
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.08"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 500,
      unitSize: 0,
      tokenAddress: ZERO,
      tokenIds: [],
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
        .mintToken(
          { key: ethers.ZeroHash, proof: [] },
          1,
          1,
          affiliate.address,
          invalidReferral,
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
      .mintToken(
        { key: ethers.ZeroHash, proof: [] },
        1,
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
    ); // 15%

    // todo: test withdraw failure
    // let balance = (await ethers.provider.getBalance(owner.address));
    // await nft.connect(owner).withdraw();
    // let diff = (await ethers.provider.getBalance(owner.address)) - balance;
    // expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0")));

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
    await nft
      .connect(accountZero)
      .mintToken(
        { key: ethers.ZeroHash, proof: [] },
        1,
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
    await expect(nft.connect(owner).withdraw()).to.be.rejectedWith(
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
    const [accountZero, accountOne, accountTwo, accountThree] = await ethers.getSigners();

    const owner = accountOne;
    const platform = accountTwo;
    const affiliate = accountThree;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      // set config that has affiliate and mint tiers
      {
        baseUri: "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
        affiliateSigner: AFFILIATE_SIGNER.address,
        maxSupply: [5000],
        maxBatchSize: 20,
        affiliateFee: 1500,
        affiliateDiscount: 1000, // 10%
        defaultRoyalty: 500
      },
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(ethers.solidityPackedKeccak256(["address"], [affiliate.address]))
    );

    await nft
      .connect(accountZero)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, affiliate.address, referral, {
        value: ethers.parseEther("0.09"), // 10 % discount from using an affiliate = 0.9
      });

    await expect((await nft.ownerBalance())).to.equal(ethers.parseEther("0.0765")); // 80%
    await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
      ethers.parseEther("0.0135")
    ); // 15%
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
        baseUri: "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
        affiliateSigner: AFFILIATE_SIGNER.address,
        maxSupply: [5000],
        maxBatchSize: 20,
        affiliateFee: 1500,
        affiliateDiscount: 0,
        defaultRoyalty: 500,
      },
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // valid signature (from affiliateSigner)
    const referral = await AFFILIATE_SIGNER.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(["address"], [affiliate.address])
      )
    );

    await nft
      .connect(accountZero)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, affiliate.address, referral, {
        value: ethers.parseEther("0.1"),
      });

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
    const [accountZero, accountOne, accountFour] = await ethers.getSigners();

    const owner = accountOne;
    const ownerAltPayout = accountFour;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      DEFAULT_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();

    const newCollectionAddress = result.logs[0].address || "";

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setOwnerAltPayout(ownerAltPayout.address)

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.1"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    await nft
      .connect(accountZero)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
        value: ethers.parseEther("0.1"),
      });

    await expect((await nft.ownerBalance())).to.equal(ethers.parseEther("0.1"));

    // first scenario - owner withdraws to alt payout.

    let balance = await ethers.provider.getBalance(ownerAltPayout.address);
    await nft.connect(owner).withdraw();
    // check that eth was sent to alt address
    let diff =
      (await ethers.provider.getBalance(ownerAltPayout.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.094"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.095")));

    await nft
      .connect(accountZero)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
        value: ethers.parseEther("0.1"),
      });

    // second scenario - owner alt withdraws to himself.

    balance = await ethers.provider.getBalance(ownerAltPayout.address);
    await nft.connect(ownerAltPayout).withdraw();
    // check that eth was sent to alt address
    diff =
      (await ethers.provider.getBalance(ownerAltPayout.address)) - balance;
    expect(Number(diff)).to.greaterThan(Number(ethers.parseEther("0.094"))); // leave room for gas
    expect(Number(diff)).to.lessThanOrEqual(Number(ethers.parseEther("0.095")));
  });

  // it("allow token owner to store msg", async function () {
  //   const [accountZero, accountOne] = await ethers.getSigners();

  //   const owner = accountOne;
  //   const holder = accountZero;

  //   const newCollection = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG,
  //   );

  //   const result = await newCollection.wait();

  //   const newCollectionAddress = result.logs[0].address || "";

  //   const nft = ArchetypeErc1155.attach(newCollectionAddress);

  //   await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
  //     price: ethers.parseEther("0.02"),
  //     start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
  //     limit: 300,
  //     maxSupply: 5000,
  //     randomize: true,
  //     tokenIds: [1,2,3,4,5],
  //     tokenAddress: ZERO,
  //   });

  //   // mint tokens 1, 2, 3
  //   await nft.connect(holder).mint({ key: ethers.ZeroHash, proof: [] }, 3, ZERO, "0x", {
  //     value: ethers.parseEther("0.06"),
  //   });

  //   const msg = "Hi this is a test, I own this";

  //   // try to set as non token owner - will fail
  //   await expect(nft.connect(owner).setTokenMsg(3, msg)).to.be.revertedWithCustomError(archetype, "NotTokenOwner");

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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    // CHANGE URI
    await nft.connect(owner).setBaseURI("test uri");
    await expect((await nft.connect(owner).config()).baseUri).to.be.equal(
      "test uri"
    );
    await nft.connect(owner).lockURI("forever");
    await expect(nft.connect(owner).setBaseURI("new test uri")).to.be.reverted;

    // CHANGE MAX SUPPLY
    await nft.connect(owner).setMaxSupply([100], "forever");
    await expect(await nft.connect(owner).maxSupply()).to.deep.equal([100]);
    await nft.connect(owner).lockMaxSupply("forever");
    await expect(nft.connect(owner).setMaxSupply([20], "forever")).to.be.reverted;

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
  
    // CHANGE OWNER ALT PAYOUT
    await nft.connect(owner).setOwnerAltPayout(alt.address);
    await expect((await nft.connect(owner).payoutConfig()).ownerAltPayout).to.be.equal(alt.address);
    await nft.connect(owner).lockOwnerAltPayout("forever");
    await expect(nft.connect(owner).setOwnerAltPayout(ZERO)).to.be.reverted;

  });

  // it("test burn to mint functionality", async function () {
  //   const [accountZero, accountOne] = await ethers.getSigners();

  //   const owner = accountZero;
  //   const minter = accountOne;

  //   const newCollectionBurn = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG,
  //   );
  //   const resultBurn = await newCollectionBurn.wait();
  //   const newCollectionAddressBurn = resultBurn.logs[0].address || "";
  //   const nftBurn = ArchetypeErc1155.attach(newCollectionAddressBurn);

  //   const newCollectionMint = await factory.createCollection(
  //     owner.address,
  //     DEFAULT_NAME,
  //     DEFAULT_SYMBOL,
  //     DEFAULT_CONFIG,
  //   );
  //   const resultMint = await newCollectionMint.wait();
  //   const newCollectionAddressMint = resultMint.logs[0].address || "";
  //   const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

  //   await nftBurn.connect(owner).enableBurnToMint(nftMint.address, false, 2, 0, 5000);
  //   await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
  //     price: 0,
  //     start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
  //     limit: 300,
  //     maxSupply: 5000,
  //     tokenIds: [1,2,3,4,5],
  //     tokenAddress: ZERO,
  //   });

  //   // mint 10 tokens
  //   await nftMint
  //     .connect(minter)
  //     .mint({ key: ethers.ZeroHash, proof: [] }, 12, ZERO, "0x", {
  //       value: 0,
  //     });

  //   // approve nftBurn to transfer tokens
  //   await nftMint.connect(minter).setApprovalForAll(nftBurn.address, true);

  //   // transfer away a token
  //   await nftMint.connect(minter).transferFrom(minter.address, owner.address, 10);

  //   // try to burn unowned token
  //   await expect(nftBurn.connect(minter).burnToMint([9, 10])).to.be.revertedWithCustomError(archetype, "NotTokenOwner");

  //   // try to burn invalid number of tokens
  //   await expect(nftBurn.connect(minter).burnToMint([9])).to.be.revertedWithCustomError(archetype, 
  //     "InvalidAmountOfTokens"
  //   );

  //   // burn 2 tokens and collect 1 token in new collection
  //   await nftBurn.connect(minter).burnToMint([2, 4]);

  //   // burn 4 tokens and collect 2 tokens in new collection
  //   await nftBurn.connect(minter).burnToMint([1, 3, 5, 8]);

  //   // disable burn to mint
  //   await nftBurn.connect(owner).disableBurnToMint();

  //   // burn will fail as burn is disabled
  //   await expect(nftBurn.connect(minter).burnToMint([11, 12])).to.be.revertedWithCustomError(archetype, 
  //     "BurnToMintDisabled"
  //   );

  //   // re-enable with time set in future
  //   await nftBurn.connect(owner).enableBurnToMint(nftMint.address, false, 2, 10000000000, 5000);

  //   // burn will fail as burn is time is set in future
  //   await expect(nftBurn.connect(minter).burnToMint([11, 12])).to.be.revertedWithCustomError(archetype, 
  //     "MintNotYetStarted"
  //   );

  //   // re-enable again with valid config
  //   await nftBurn.connect(owner).enableBurnToMint(nftMint.address, false, 2, 0, 5000);

  //   // burn 4 tokens and collect 2 tokens in new collection
  //   await nftBurn.connect(minter).burnToMint([11, 12]);

  //   // re-enable again with valid reversed config
  //   await nftBurn.connect(owner).enableBurnToMint(nftMint.address, true, 4, 0, 5000);

  //   // burn 1 tokens and collect 4 tokens in new collection
  //   await nftBurn.connect(minter).burnToMint([7]);

  //   await expect(await nftMint.ownerOf(1)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(2)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(3)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(4)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(5)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(7)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(8)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(11)).to.be.equal(BURN);
  //   await expect(await nftMint.ownerOf(12)).to.be.equal(BURN);
  //   await expect(await nftMint.balanceOf(minter.address)).to.be.equal(2);

  //   await expect(await nftBurn.balanceOf(minter.address)).to.be.equal(8);
  // });

  it("test max supply checks", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();
    const default_config = { ...DEFAULT_CONFIG, maxBatchSize: 500, maxSupply: [100, 100, 100] };

    const owner = accountZero;
    const minter = accountOne;

    // const newCollectionBurn = await factory.createCollection(
    //   owner.address,
    //   DEFAULT_NAME,
    //   DEFAULT_SYMBOL,
    //   default_config
    // );
    // const resultBurn = await newCollectionBurn.wait();
    // const newCollectionAddressBurn = resultBurn.logs[0].address || "";
    // const nftBurn = ArchetypeErc1155.attach(newCollectionAddressBurn);

    const newCollectionMint = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    // await nftBurn.connect(owner).enableBurnToMint(nftMint.address, false, 2, 0, 5000);
    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 1000,
      maxSupply: 1000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });
    // await nftBurn.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
    //   price: 0,
    //   start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
    //   limit: 1000,
    //   maxSupply: 5000,
    //   tokenIds: [],
    //   tokenAddress: ZERO,
    // });

    // try to mint more than max tokens tokens
    await expect(
      nftMint.connect(minter).mintToken({ key: ethers.ZeroHash, proof: [] }, 301, 1, ZERO, "0x", {
        value: 0,
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    // mint max tokens
    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 100, 1, ZERO, "0x", {
        value: 0,
      });
    await nftMint
    .connect(minter)
    .mintToken({ key: ethers.ZeroHash, proof: [] }, 100, 2, ZERO, "0x", {
      value: 0,
    });
    await nftMint
    .connect(minter)
    .mintToken({ key: ethers.ZeroHash, proof: [] }, 100, 3, ZERO, "0x", {
      value: 0,
    });
    // // mint max tokens
    // await nftMint
    // .connect(minter)
    // .mint({ key: ethers.ZeroHash, proof: [] }, 1000, ZERO, "0x", {
    //   value: 0,
    // });
    // // mint max tokens
    // await nftMint
    // .connect(minter)
    // .mint({ key: ethers.ZeroHash, proof: [] }, 1000, ZERO, "0x", {
    //   value: 0,
    // });

    // try to mint after max reached
    await expect(
      nftMint.connect(minter).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
        value: 0,
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");
    await expect(
      nftMint.connect(minter).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 3, ZERO, "0x", {
        value: 0,
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");


    // // approve nftBurn to transfer tokens
    // await nftMint.connect(minter).setApprovalForAll(nftBurn.address, true);

    // // mint tokens on burn to mint
    // await nftBurn
    //   .connect(minter)
    //   .mint({ key: ethers.ZeroHash, proof: [] }, 4990, ZERO, "0x", {
    //     value: 0,
    //   });

    // // try burn to mint past max supply
    // await expect(
    //   nftBurn.connect(minter).burnToMint(Array.from({ length: 40 }, (_, i) => i + 1))
    // ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    // // burn to max
    // await nftBurn.connect(minter).burnToMint(Array.from({ length: 20 }, (_, i) => i + 1));

    // // try to burn past max supply
    // await expect(nftBurn.connect(minter).burnToMint([1000, 1001])).to.be.revertedWithCustomError(archetype, 
    //   "MaxSupplyExceeded"
    // );

    // await expect(await nftMint.totalSupply()).to.be.equal(5000);
    // await expect(await nftBurn.totalSupply()).to.be.equal(5000);
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.02"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 300,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // mint tokens from owner to holder address
    await nft
      .connect(owner)
      .mintTo({ key: ethers.ZeroHash, proof: [] }, 3, holder.address, 1, ZERO, "0x", {
        value: ethers.parseEther("0.06"),
      });

    // test to=zero reverts with MintToZeroAddress
    await expect(
      nft
        .connect(owner)
        .mintTo({ key: ethers.ZeroHash, proof: [] }, 1, ZERO, 0, ZERO, "0x", {
          value: ethers.parseEther("0.02"),
        })
    ).to.be.revertedWithCustomError(archetype, "MintToZeroAddress");

    await expect(await nft.balanceOf(holder.address, 1)).to.be.equal(3);
    await expect(await nft.balanceOf(owner.address, 1)).to.be.equal(0);
  });

  it("test batchMintTo Airdrop", async function () {
    const default_config = { ...DEFAULT_CONFIG, maxBatchSize: 5000, maxSupply: [5000] };

    const [accountZero, accountOne] = await ethers.getSigners();

    const owner = accountOne;

    const newCollection = await factory.createCollection(
      owner.address,
      DEFAULT_NAME,
      DEFAULT_SYMBOL,
      default_config,
      DEFAULT_PAYOUT_CONFIG
    );

    const result = await newCollection.wait();
    const newCollectionAddress = result.logs[0].address || "";
    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    const invitelist = new Invitelist([owner.address]);
    const root = invitelist.root();
    const proof = invitelist.proof(accountZero.address);

    await nft.connect(owner).setInvite(root, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.00"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 5000,
      maxSupply: 5000,
      unitSize: 0,
      randomize: false,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // mint tokens from owner to air drop list
    const airDropList: [string, number, number][] = [];
    for (let i = 0; i < 100; i++) {
      /// 100 addresses
      airDropList.push([ethers.Wallet.createRandom().address, 1, 1]);
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
        split.map(list => list[0]),
        split.map(list => list[1]),
        split.map(list => list[2]),
        ZERO,
        "0x",
        {
          value: ethers.parseEther("0.00"),
        }
      );
    }

    await expect(await nft.totalSupply()).to.be.equal(airDropList.length);
    await expect(await nft.balanceOf(airDropList[0][0], 1)).to.be.equal(1);
    await expect(await nft.balanceOf(airDropList[9][0], 1)).to.be.equal(1);
    await expect(await nft.balanceOf(airDropList[99][0], 1)).to.be.equal(1);
    // await expect(await nft.ownerOf(1)).to.be.equal(airDropList[0][0]);
    // await expect(await nft.ownerOf(10)).to.be.equal(airDropList[9][0]);
    // await expect(await nft.ownerOf(20)).to.be.equal(airDropList[19][0]);
    // await expect(await nft.ownerOf(60)).to.be.equal(airDropList[59][0]);
    // await expect(await nft.ownerOf(100)).to.be.equal(airDropList[99][0]);
  });

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
     const nft = ArchetypeErc1155.attach(newCollectionAddress);
 
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
    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    const erc20: TestErc20 = asContractType<TestErc20>(
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
      maxSupply: 500,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: tokenAddress,
    });

    // try to mint tokens without approval
    await expect(
      nft
        .connect(holder)
        .mintToken({ key: erc20PublicKey, proof: [] }, 3, 1, ZERO, "0x")
    ).to.be.revertedWithCustomError(archetypeLogic, "NotApprovedToTransfer");

    await erc20
      .connect(holder)
      .approve(await nft.getAddress(), ethers.MaxUint256);

    // mint without enough erc20
    await expect(
      nft
        .connect(holder)
        .mintToken({ key: erc20PublicKey, proof: [] }, 3, 1, ZERO, "0x")
    ).to.be.revertedWithCustomError(archetypeLogic, "Erc20BalanceTooLow");

    await erc20.connect(holder).mint(ethers.parseEther("3"));

    const balance = await erc20.balanceOf(holder.address);

    console.log({ balance: balance.toString() });

    await nft
      .connect(holder)
      .mintToken({ key: erc20PublicKey, proof: [] }, 3, 1, ZERO, "0x");

    await expect(await nft.balanceOf(holder.address, 1)).to.be.equal(3);
    await expect(await erc20.balanceOf(holder.address,)).to.be.equal(0);
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

  it("test advanced Invite", async function () {
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

    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setAdvancedInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("1"),
      reservePrice: ethers.parseEther("0.1"),
      start: 0,
      end: 0,
      limit: 300,
      interval: 1000, // 1000s,
      delta: ethers.parseEther("0.1"),
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // mint at full price
    await nft.connect(holder).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
      value: ethers.parseEther("1"),
    });

    // forward time 5000s
    await ethers.provider.send("evm_increaseTime", [5000]);

    // mint at half price
    await nft.connect(holder).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
      value: ethers.parseEther("0.5"),
    });

    // forward a long time
    await ethers.provider.send("evm_increaseTime", [50000]);

    // mint at reserve price
    await nft.connect(holder).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
      value: ethers.parseEther("0.1"),
    });

    await expect(await nft.balanceOf(holder.address, 1)).to.be.equal(3);
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
    const nft = ArchetypeErc1155.attach(newCollectionAddress);

    await nft.connect(owner).setAdvancedInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("1"),
      reservePrice: ethers.parseEther("10"),
      start: 0,
      end: 0,
      limit: 300,
      interval: 1000, // 1000s,
      delta: ethers.parseEther("1"),
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // mint at full price
    await nft.connect(holder).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
      value: ethers.parseEther("1"),
    });

    // forward time 5000s
    await ethers.provider.send("evm_increaseTime", [5000]);

    // try to mint at initial price, will revert
    await expect(
      nft.connect(holder).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
        value: ethers.parseEther("1"),
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "InsufficientEthSent");

    // mint at half price
    await nft.connect(holder).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
      value: ethers.parseEther("6"),
    });

    // forward a long time
    await ethers.provider.send("evm_increaseTime", [50000]);

    // mint at reserve price
    await nft.connect(holder).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
      value: ethers.parseEther("10"),
    });

    await expect(await nft.balanceOf(holder.address, 1)).to.be.equal(3);
  });

  it("test invite list max supply check", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: [1000, 1000, 1000, 1000, 1000],
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
      DEFAULT_PAYOUT_CONFIG,
    );
    const resultMint = await newCollectionMint.wait();
    const newCollectionAddressMint = resultMint.logs[0].address || "";
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: PublicMaxSupply - 20,
      maxSupply: PublicMaxSupply,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 40, 1, ZERO, "0x", { value: 0 });

    // try to mint past invite list max
    await expect(
      nftMint.connect(minter2).mintToken({ key: ethers.ZeroHash, proof: [] }, 60, 1, ZERO, "0x", {
        value: 0,
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "ListMaxSupplyExceeded");

    await nftMint
      .connect(minter2)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 50, 1, ZERO, "0x", { value: 0 });

    await expect(await nftMint.totalSupply()).to.be.equal(PublicMaxSupply);
  });

  it("test multiple public invite lists support in 0.5.1", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = { ...DEFAULT_CONFIG, maxSupply: [100], maxBatchSize: 100 };

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
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("1"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 100,
      maxSupply: 100,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 40, 1, ZERO, "0x", {
        value: ethers.parseEther("40"),
      });

    // set 2nd public list
    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 20,
      maxSupply: 100,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    await nftMint.connect(minter2).mintToken({ key: HASHONE, proof: [] }, 20, 1, ZERO, "0x", { value: 0 });

    // set 3rd public list
    await nftMint.connect(owner).setInvite(HASH256, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 40,
      maxSupply: 100,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    await nftMint.connect(minter2).mintToken({ key: HASH256, proof: [] }, 40, 1, ZERO, "0x", { value: 0 });

    await expect(await nftMint.totalSupply()).to.be.equal(100);
  });

  it("test erc115 specific tokenId mints", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = { ...DEFAULT_CONFIG, maxSupply: [15, 10, 5, 2, 20], maxBatchSize: 1000 };

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
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 100,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      randomize: false,
      tokenIds: [1, 2, 5],
      tokenAddress: ZERO,
    });

    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("1"),
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 100,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      randomize: false,
      tokenIds: [3, 4],
      tokenAddress: ZERO,
    });

    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 15, 1, ZERO, "0x", { value: 0 });

    // try to mint unallowed token
    await expect(
      nftMint
        .connect(minter2)
        .mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 3, ZERO, "0x", {
          value: 0,
        })
    ).to.be.revertedWithCustomError(archetypeLogic, "InvalidTokenId");

    // try to mint past max supply of list 2 token 4
    await expect(
      nftMint
        .connect(minter2)
        .mintToken({ key: HASHONE, proof: [] }, 3, 4, ZERO, "0x", { value: 0 })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    await nftMint.connect(minter2).mintToken({ key: HASHONE, proof: [] }, 2, 4, ZERO, "0x", {
      value: ethers.parseEther("2"),
    });

    await expect(await nftMint.tokenSupply(1)).to.be.equal(15);
    await expect(await nftMint.tokenSupply(4)).to.be.equal(2);
    await expect(await nftMint.totalSupply()).to.be.equal(17);
  });

  it("test unit size mint 1 get x functionality", async function () {
    const [accountZero, accountOne, accountTwo, accountThree] = await ethers.getSigners();
    const default_config = { ...DEFAULT_CONFIG, maxSupply: [36], maxBatchSize: 50 };

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
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 24,
      maxSupply: 100,
      unitSize: 12,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // mint 1 get 12
    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", { value: 0 });

    // try to mint past invite list limit
    await expect(
      nftMint.connect(minter).mintToken({ key: ethers.ZeroHash, proof: [] }, 2, 1, ZERO, "0x", {
        value: 0,
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "NumberOfMintsExceeded");

    // mint 2 get 24
    await nftMint
      .connect(minter2)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 2, 1, ZERO, "0x", { value: 0 });

    // try to mint past invite list max
    await expect(
      nftMint.connect(minter3).mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", {
        value: 0,
      })
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    await expect(await nftMint.totalSupply()).to.be.equal(36);
  });

  it("test erc1155 increasing max supply", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = { ...DEFAULT_CONFIG, maxSupply: [200], maxBatchSize: 1000 };

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
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 2 ** 32 - 1,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      randomize: false,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // mint 15 tokenId 1
    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 15, 1, ZERO, "0x", { value: 0 });

    await expect(await nftMint.totalSupply()).to.be.equal(15);

    // update max supply to have 2 tokenIds
    await nftMint.connect(owner).setMaxSupply([200, 100], "forever");

    // mint 100 tokenId 2
    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 100, 2, ZERO, "0x", { value: 0 });

    await expect(await nftMint.tokenSupply(2)).to.be.equal(100);

    // update max supply to have 5 tokenIds
    await nftMint.connect(owner).setMaxSupply([200, 100, 10, 10, 10], "forever");

    // mint 10 tokenId 5
    await nftMint
      .connect(minter2)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 10, 3, ZERO, "0x", { value: 0 });

    await expect(await nftMint.tokenSupply(3)).to.be.equal(10);
  });

  it("test erc115 large max supply of 500 tokens", async function () {
    const [accountZero, accountOne] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: new Array(500).fill(10),
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
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 2 ** 32 - 1,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // mint 1
    await nftMint
      .connect(minter)
      .mintToken({ key: ethers.ZeroHash, proof: [] }, 1, 1, ZERO, "0x", { value: 0 });

    await nftMint.connect(owner).setInvite(HASHONE, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 2 ** 32 - 1,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });
    // mint 1 random
    await nftMint.connect(minter).mintToken({ key: HASHONE, proof: [] }, 1, 500, ZERO, "0x", { value: 0 });

    await expect(await nftMint.totalSupply()).to.be.equal(2);
  });

  it("test erc115 test batch mint verification", async function () {
    const [accountZero, accountOne, accountTwo] = await ethers.getSigners();
    const default_config = {
      ...DEFAULT_CONFIG,
      maxSupply: new Array(500).fill(10),
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
    const nftMint = ArchetypeErc1155.attach(newCollectionAddressMint);

    await nftMint.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: 0,
      start: ethers.getBigInt(Math.floor(Date.now() / 1000)),
      end: 0,
      limit: 2 ** 32 - 1,
      maxSupply: 2 ** 32 - 1,
      unitSize: 0,
      randomize: false,
      tokenIds: [],
      tokenAddress: ZERO,
    });

    // expect validation to pickup that tokenId 5 is minting past its max supply
    await expect(
      nftMint
        .connect(minter)
        .batchMintTo(
          { key: ethers.ZeroHash, proof: [] },
          [minter.address, minter2.address, minter.address, owner.address],
          [10, 10, 10, 10],
          [1, 5, 240, 5],
          ZERO,
          "0x",
          { value: 0 }
        )
    ).to.be.revertedWithCustomError(archetypeLogic, "MaxSupplyExceeded");

    await nftMint
      .connect(minter)
      .batchMintTo(
        { key: ethers.ZeroHash, proof: [] },
        [minter.address, minter2.address, minter.address, owner.address],
        [10, 10, 10, 10],
        [1, 5, 240, 6],
        ZERO,
        "0x",
        { value: 0 }
      );

    await expect(await nftMint.totalSupply()).to.be.equal(40);
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
  
      const nft = ArchetypeErc1155.attach(newCollectionAddress);
  
      const mintPrice = ethers.parseEther("0.08");
      const paidPrice = ethers.parseEther("0.20");
  
      await nft.connect(owner).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
        price: mintPrice,
        start: ethers.toBigInt(Math.floor(Date.now() / 1000)),
        end: 0,
        limit: 300,
        maxSupply: 100,
        unitSize: 0,
        tokenAddress: ZERO,
        tokenIds: [1],
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
      const preUserBalance = await ethers.provider.getBalance(accountZero);
  
      await nft
        .connect(accountZero)
        .mintToken(
          { key: ethers.ZeroHash, proof: [] },
          1,
          1,
          affiliate.address,
          referral,
          {
            value: paidPrice,
          }
        );
  
      const postContractBalance = await ethers.provider.getBalance(
        await nft.getAddress()
      );
      const postUserBalance = await ethers.provider.getBalance(accountZero);
  
      const delta = ethers.parseEther("0.001");
      expect(postUserBalance).closeTo(preUserBalance - mintPrice, delta);
      expect(postContractBalance).eq(preContractBalance + mintPrice);
  
      await expect(await nft.ownerBalance()).to.equal(ethers.parseEther("0.068")); // 85%
      await expect(await nft.affiliateBalance(affiliate.address)).to.equal(
        ethers.parseEther("0.012")
      ); // 15%
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
  
      const nft = ArchetypeErc1155.attach(newCollectionAddress);
  
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