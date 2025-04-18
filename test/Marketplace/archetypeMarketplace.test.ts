import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  ArchetypeMarketplace,
  ArchetypeErc721a,
  ArchetypeErc1155,
  FactoryErc721a,
  FactoryErc1155,
  ArchetypeLogicErc721a,
  ArchetypeLogicErc1155,
  ArchetypePayouts
} from "../../typechain-types";
import { IArchetypeErc721aConfig, IArchetypePayoutConfig, IArchetypeErc1155Config } from "../lib/types";
import ipfsh from "ipfsh";
import { BaseContract } from "ethers";

function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const BURN = "0x000000000000000000000000000000000000dEaD";


describe("ArchetypeMarketplace Tests", function () {
  // Contract instances
  let marketplace: ArchetypeMarketplace;
  let factory721: FactoryErc721a;
  let factory1155: FactoryErc1155;
  let archetypeLogic721: ArchetypeLogicErc721a;
  let archetypeLogic1155: ArchetypeLogicErc1155;
  let archetypePayouts: ArchetypePayouts;
  
  // Test accounts
  let owner: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer: SignerWithAddress;
  let platform: SignerWithAddress;
  let unauthorizedUser: SignerWithAddress;
  
  // Test NFT contracts
  let nft721: ArchetypeErc721a;
  let nft1155: ArchetypeErc1155;
  
  // Constants
  const CID_ZERO = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  let AFFILIATE_SIGNER: SignerWithAddress;
  let DEFAULT_721_CONFIG: IArchetypeErc721aConfig;
  let DEFAULT_1155_CONFIG: IArchetypeErc1155Config;
  let DEFAULT_PAYOUT_CONFIG: IArchetypePayoutConfig;

  // Helper functions
  async function createNFT721Collection() {
    const tx721 = await factory721.createCollection(
      seller.address,
      "NFT721Collection",
      "NFT721",
      DEFAULT_721_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const receipt721 = await tx721.wait();
    const newCollectionAddress721 = receipt721?.logs[0].address || "";
    
    const ArchetypeErc721a = await ethers.getContractFactory("ArchetypeErc721a", {
      libraries: {
        ArchetypeLogicErc721a: await archetypeLogic721.getAddress(),
      },
    });
    
    const tokenContract = ArchetypeErc721a.attach(newCollectionAddress721);
    
    // Setup invite for minting
    await tokenContract.connect(seller).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.01"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000) - 60),
      end: 0,
      limit: 5000,
      maxSupply: DEFAULT_721_CONFIG.maxSupply,
      unitSize: 0,
      tokenAddress: ZERO,
      isBlacklist: false,
    });
    
    return tokenContract;
  }
  
  async function createNFT1155Collection() {
    const tx1155 = await factory1155.createCollection(
      seller.address,
      "NFT1155Collection",
      "NFT1155",
      DEFAULT_1155_CONFIG,
      DEFAULT_PAYOUT_CONFIG
    );
    const receipt1155 = await tx1155.wait();
    const newCollectionAddress1155 = receipt1155?.logs[0].address || "";
    
    const ArchetypeErc1155 = await ethers.getContractFactory("ArchetypeErc1155", {
      libraries: {
        ArchetypeLogicErc1155: await archetypeLogic1155.getAddress(),
      },
    });
    
    const tokenContract = ArchetypeErc1155.attach(newCollectionAddress1155);
    
    // Setup invite for minting
    await tokenContract.connect(seller).setInvite(ethers.ZeroHash, ipfsh.ctod(CID_ZERO), {
      price: ethers.parseEther("0.01"),
      start: ethers.toBigInt(Math.floor(Date.now() / 1000) - 60),
      end: 0,
      limit: 5000,
      maxSupply: 5000,
      unitSize: 0,
      tokenIds: [],
      tokenAddress: ZERO,
    });
    
    return tokenContract;
  }
  
  async function mintNFT721(tokenContract, count) {
    await tokenContract.connect(seller).mint(
      { key: ethers.ZeroHash, proof: [] },
      count,
      ZERO,
      "0x",
      { value: ethers.parseEther((0.01 * count).toString()) }
    );
  }
  
  async function mintNFT1155(tokenContract, tokenId, amount) {
    await tokenContract.connect(seller).mintToken(
      { key: ethers.ZeroHash, proof: [] },
      amount,
      tokenId,
      ZERO,
      "0x",
      { value: ethers.parseEther((0.01 * amount).toString()) }
    );
  }

  before(async function () {
    [owner, seller, platform, buyer, unauthorizedUser] = await ethers.getSigners();
    
    AFFILIATE_SIGNER = platform; // For simplicity
    
    DEFAULT_721_CONFIG = {
      baseUri: "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
      affiliateSigner: AFFILIATE_SIGNER.address,
      maxSupply: 5000,
      maxBatchSize: 20,
      affiliateFee: 1500,
      affiliateDiscount: 0,
      defaultRoyalty: 500,
    };
    
    DEFAULT_1155_CONFIG = {
      baseUri: "ipfs://bafkreieqcdphcfojcd2vslsxrhzrjqr6cxjlyuekpghzehfexi5c3w55eq",
      affiliateSigner: AFFILIATE_SIGNER.address,
      maxSupply: [1000, 1000, 1000, 1000, 1000],
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
    
    // Deploy required library contracts
    const ArchetypeLogicErc721a = await ethers.getContractFactory("ArchetypeLogicErc721a");
    archetypeLogic721 = asContractType<ArchetypeLogicErc721a>(await ArchetypeLogicErc721a.deploy());

    const ArchetypeLogicErc1155 = await ethers.getContractFactory("ArchetypeLogicErc1155");
    archetypeLogic1155 = asContractType<ArchetypeLogicErc1155>(await ArchetypeLogicErc1155.deploy());

    const ArchetypePayouts = await ethers.getContractFactory(
        "ArchetypePayouts"
    );
    archetypePayouts = asContractType<ArchetypePayouts>(
        await ArchetypePayouts.deploy()
    );

    // Deploy NFT factories
    const ArchetypeErc721a = await ethers.getContractFactory("ArchetypeErc721a", {
      libraries: {
        ArchetypeLogicErc721a: await archetypeLogic721.getAddress(),
      },
    });
    const nftImplementation721 = await ArchetypeErc721a.deploy();
    
    const FactoryErc721a = await ethers.getContractFactory("FactoryErc721a");
    factory721 = asContractType<FactoryErc721a>(await FactoryErc721a.deploy(await nftImplementation721.getAddress()));
    
    // ERC1155
    const ArchetypeErc1155 = await ethers.getContractFactory("ArchetypeErc1155", {
      libraries: {
        ArchetypeLogicErc1155: await archetypeLogic1155.getAddress(),
      },
    });
    const nftImplementation1155 = await ArchetypeErc1155.deploy();
    
    const FactoryErc1155 = await ethers.getContractFactory("FactoryErc1155");
    factory1155 = asContractType<FactoryErc1155>(await FactoryErc1155.deploy(await nftImplementation1155.getAddress()));
    
    // Deploy marketplace (reused across tests)
    const ArchetypeMarketplace = await ethers.getContractFactory("ArchetypeMarketplace");
    marketplace = asContractType<ArchetypeMarketplace>(await ArchetypeMarketplace.deploy());
  });

  // Fresh setup for each test
  beforeEach(async function () {
    // Create fresh NFT collections for each test
    nft721 = await createNFT721Collection();
    nft1155 = await createNFT1155Collection();
    
    // Mint some tokens for testing
    await mintNFT721(nft721, 5);
    await mintNFT1155(nft1155, 1, 10);
    await mintNFT1155(nft1155, 2, 10);
    
    // Approve marketplace to transfer NFTs
    await nft721.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await nft1155.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
  });

  describe("Collection Linked List Management", function () {
    it("should correctly update collection order when price changes", async function () {
      // List three tokens in ascending price order
      const lowPrice = ethers.parseEther("0.1");
      const mediumPrice = ethers.parseEther("0.5");
      const highPrice = ethers.parseEther("1.0");
      
      // List token #1 at low price
      await marketplace.connect(seller).listItem(
        await nft721.getAddress(),
        1,
        lowPrice
      );
      const lowListingId = await marketplace.totalListings();
      
      // List token #2 at medium price
      await marketplace.connect(seller).listItem(
        await nft721.getAddress(),
        2,
        mediumPrice
      );
      const mediumListingId = await marketplace.totalListings();
      
      // List token #3 at high price
      await marketplace.connect(seller).listItem(
        await nft721.getAddress(),
        3,
        highPrice
      );
      const highListingId = await marketplace.totalListings();
      
      // Check initial order: low -> medium -> high
      expect(await marketplace.collectionLowestPriceListingId(await nft721.getAddress())).to.equal(lowListingId);
      
      const nextAfterLow = await marketplace.nextLowestCollectionListing(
        await nft721.getAddress(),
        lowListingId
      );
      expect(nextAfterLow).to.equal(mediumListingId);
      
      const nextAfterMedium = await marketplace.nextLowestCollectionListing(
        await nft721.getAddress(),
        mediumListingId
      );
      expect(nextAfterMedium).to.equal(highListingId);
      
      // Update low price to be the highest
      const newHigherPrice = ethers.parseEther("1.5");
      await marketplace.connect(seller).updateListingPrice(lowListingId, newHigherPrice);
      
      // Check new order: medium -> high -> (formerly low, now highest)
      expect(await marketplace.collectionLowestPriceListingId(await nft721.getAddress())).to.equal(mediumListingId);
      
      const nextAfterMediumNew = await marketplace.nextLowestCollectionListing(
        await nft721.getAddress(),
        mediumListingId
      );
      expect(nextAfterMediumNew).to.equal(highListingId);
      
      const nextAfterHigh = await marketplace.nextLowestCollectionListing(
        await nft721.getAddress(),
        highListingId
      );
      expect(nextAfterHigh).to.equal(lowListingId);
    });
    
    it("should handle removal of listings from the middle of linked list", async function () {
      // Create a linked list with 3 listings
      const price1 = ethers.parseEther("0.1");
      const price2 = ethers.parseEther("0.5");
      const price3 = ethers.parseEther("1.0");
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 1, price1);
      const listingId1 = await marketplace.totalListings();
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 2, price2);
      const listingId2 = await marketplace.totalListings();
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 3, price3);
      const listingId3 = await marketplace.totalListings();
      
      // Cancel the middle listing
      await marketplace.connect(seller).cancelListing(listingId2);
      
      // Verify the linked list skips the canceled listing
      const nextAfterFirst = await marketplace.nextLowestCollectionListing(
        await nft721.getAddress(),
        listingId1
      );
      expect(nextAfterFirst).to.equal(listingId3);
    });
    
    it("should handle removal of the lowest priced listing", async function () {
      // Create a linked list with 3 listings
      const price1 = ethers.parseEther("0.1");
      const price2 = ethers.parseEther("0.5");
      const price3 = ethers.parseEther("1.0");
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 1, price1);
      const listingId1 = await marketplace.totalListings();
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 2, price2);
      const listingId2 = await marketplace.totalListings();
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 3, price3);
      const listingId3 = await marketplace.totalListings();
      
      // Cancel the lowest-priced listing
      await marketplace.connect(seller).cancelListing(listingId1);
      
      // Check that the collection's lowest-priced listing has been updated
      expect(await marketplace.collectionLowestPriceListingId(await nft721.getAddress())).to.equal(listingId2);
    });
  });

  describe("Security and Access Control", function () {
    it("should prevent non-platform address from changing fee percentage", async function () {
      await expect(
        marketplace.connect(seller).setFeePercentage(500)
      ).to.be.revertedWithCustomError(marketplace, "NotPlatform");
      
      await expect(
        marketplace.connect(buyer).setFeePercentage(500)
      ).to.be.revertedWithCustomError(marketplace, "NotPlatform");
      
      await expect(
        marketplace.connect(owner).setFeePercentage(500)
      ).to.be.revertedWithCustomError(marketplace, "NotPlatform");
    });
    
    it("should prevent listing a token with zero price", async function () {
      await expect(
        marketplace.connect(seller).listItem(
          await nft721.getAddress(),
          1,
          0
        )
      ).to.be.revertedWithCustomError(marketplace, "PriceTooLow");
      
      await expect(
        marketplace.connect(seller).updateListingPrice(1, 0)
      ).to.be.revertedWithCustomError(marketplace, "PriceTooLow");
    });
  });

  describe("Error Handling and Edge Cases", function () {
    it("should handle unsupported token interfaces", async function () {
      // Try to list a non-NFT contract
      await expect(
        marketplace.connect(seller).listItem(
          await marketplace.getAddress(), // Any non-NFT contract address
          1,
          ethers.parseEther("1.0")
        )
      ).to.be.revertedWithCustomError(marketplace, "UnsupportedToken");
    });
    
    it("should handle ERC721 tokens that no longer exist", async function () {
      // List token
      await marketplace.connect(seller).listItem(
        await nft721.getAddress(),
        5,
        ethers.parseEther("1.0")
      );
      
      const listingId = await marketplace.totalListings();
      
      // Burn the token
      await nft721.connect(seller).transferFrom(seller.address, BURN, 5);
      
      // Try to buy the burned token
      await expect(
        marketplace.connect(buyer).buyItem(listingId, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWithCustomError(marketplace, "OwnershipChanged");
    });
    
    it("should refund excess payment when buying an item", async function () {
      // List a token
      const price = ethers.parseEther("1.0");
      await marketplace.connect(seller).listItem(
        await nft721.getAddress(),
        1,
        price
      );
      
      const listingId = await marketplace.totalListings();
      
      // Prepare to send excess payment
      const excessAmount = ethers.parseEther("0.5");
      const totalPayment = price + excessAmount;
      
      // Check buyer's balance before purchase
      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
      
      // Buy with excess payment
      const tx = await marketplace.connect(buyer).buyItem(listingId, { value: totalPayment });
      
      // Get gas cost
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed || BigInt(0);
      const gasPrice = receipt?.gasPrice || BigInt(0);
      const gasCost = gasUsed * gasPrice;
      
      // Check buyer's balance after purchase (should be refunded the excess minus gas)
      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      const expectedBalance = buyerBalanceBefore - price - gasCost;
      
      // Allow for some small rounding errors
      const tolerance = ethers.parseEther("0.001");
      expect(buyerBalanceAfter).to.be.closeTo(expectedBalance, tolerance);
    });
    
    it("should handle getListingDetails for non-existent listings gracefully", async function () {
      // For non-existent listings, we expect default empty values
      const nonExistentId = 999;
      const listing = await marketplace.getListingDetails(nonExistentId);
      
      // Verify default values
      expect(listing.seller).to.equal(ethers.ZeroAddress);
      expect(listing.active).to.equal(false);
      expect(listing.price).to.equal(0);
    });
  });

  describe("Complex Scenarios", function () {
    it("should handle a full marketplace lifecycle for multiple tokens", async function () {
      // 1. Create multiple listings with various prices
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 1, ethers.parseEther("0.3"));
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 2, ethers.parseEther("0.2"));
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 3, ethers.parseEther("0.5"));
      
      await marketplace.connect(seller).listItem(await nft1155.getAddress(), 1, ethers.parseEther("0.4"));
      await marketplace.connect(seller).listItem(await nft1155.getAddress(), 2, ethers.parseEther("0.1"));
      
      // 2. Query collections to verify ordering
      // Check ERC721 listings
      const [erc721ListingIds, erc721Prices, erc721Sellers] = await marketplace.getAvailableCollectionListings(
        await nft721.getAddress(),
        5
      );
      
      // Verify price order for ERC721 collection
      for (let i = 0; i < erc721Prices.length - 1; i++) {
        expect(erc721Prices[i]).to.be.lessThanOrEqual(erc721Prices[i + 1]);
      }
      
      // Check ERC1155 listings
      const [erc1155ListingIds, erc1155Prices, erc1155Sellers] = await marketplace.getAvailableCollectionListings(
        await nft1155.getAddress(),
        5
      );
      
      // Verify price order for ERC1155 collection
      for (let i = 0; i < erc1155Prices.length - 1; i++) {
        expect(erc1155Prices[i]).to.be.lessThanOrEqual(erc1155Prices[i + 1]);
      }
      
      // 3. Buy the lowest priced items from each collection
      await marketplace.connect(buyer).buyLowestPricedCollectionItem(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.5") } // Send enough to cover any price
      );
      
      await marketplace.connect(buyer).buyLowestPricedCollectionItem(
        await nft1155.getAddress(),
        { value: ethers.parseEther("0.5") } // Send enough to cover any price
      );
      
      // 4. Verify token ownership
      expect(await nft721.ownerOf(2)).to.equal(buyer.address); // Token #2 had lowest price
      expect(await nft1155.balanceOf(buyer.address, 2)).to.equal(1); // Token #2 had lowest price
      
      // 5. Check that the collection's lowest priced listing was updated
      const newLowestErc721Id = await marketplace.collectionLowestPriceListingId(await nft721.getAddress());
      const newLowestErc721Listing = await marketplace.listings(newLowestErc721Id);
      expect(newLowestErc721Listing.tokenId).to.not.equal(2); // Not the one we bought
      
      const newLowestErc1155Id = await marketplace.collectionLowestPriceListingId(await nft1155.getAddress());
      const newLowestErc1155Listing = await marketplace.listings(newLowestErc1155Id);
      expect(newLowestErc1155Listing.tokenId).to.not.equal(2); // Not the one we bought
    });

    it("should handle price updates that change sort order correctly", async function () {
      // Create a sequence of listings with clear price differences
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 1, ethers.parseEther("0.1")); // Lowest
      const listingId1 = await marketplace.totalListings();
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 2, ethers.parseEther("0.3")); // Middle
      const listingId2 = await marketplace.totalListings();
      
      await marketplace.connect(seller).listItem(await nft721.getAddress(), 3, ethers.parseEther("0.5")); // Highest
      const listingId3 = await marketplace.totalListings();
      
      // Verify initial order (1 -> 2 -> 3)
      expect(await marketplace.collectionLowestPriceListingId(await nft721.getAddress())).to.equal(listingId1);
      
      const next1 = await marketplace.nextLowestCollectionListing(await nft721.getAddress(), listingId1);
      expect(next1).to.equal(listingId2);
      
      const next2 = await marketplace.nextLowestCollectionListing(await nft721.getAddress(), listingId2);
      expect(next2).to.equal(listingId3);
      
      // Update price of listing 1 to be highest
      await marketplace.connect(seller).updateListingPrice(listingId1, ethers.parseEther("0.7"));
      
      // Verify new order (2 -> 3 -> 1)
      expect(await marketplace.collectionLowestPriceListingId(await nft721.getAddress())).to.equal(listingId2);
      
      const newNext2 = await marketplace.nextLowestCollectionListing(await nft721.getAddress(), listingId2);
      expect(newNext2).to.equal(listingId3);
      
      const newNext3 = await marketplace.nextLowestCollectionListing(await nft721.getAddress(), listingId3);
      expect(newNext3).to.equal(listingId1);
      
      // Update price of listing 3 to be lowest
      await marketplace.connect(seller).updateListingPrice(listingId3, ethers.parseEther("0.05"));
      
      // Verify final order (3 -> 2 -> 1)
      expect(await marketplace.collectionLowestPriceListingId(await nft721.getAddress())).to.equal(listingId3);
      
      const finalNext3 = await marketplace.nextLowestCollectionListing(await nft721.getAddress(), listingId3);
      expect(finalNext3).to.equal(listingId2);
      
      const finalNext2 = await marketplace.nextLowestCollectionListing(await nft721.getAddress(), listingId2);
      expect(finalNext2).to.equal(listingId1);
    });

    it("should allow creating and canceling bids", async function () {
      
      // Create a bid
      const bidAmount = ethers.parseEther("0.5");
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: bidAmount }
      );
      
      const bidId = await marketplace.totalBids();
      expect(bidId).to.equal(1);
      
      // Verify bid details
      const bid = await marketplace.getBidDetails(bidId);
      expect(bid.bidder).to.equal(buyer.address);
      expect(bid.tokenAddress).to.equal(await nft721.getAddress());
      expect(bid.price).to.equal(bidAmount);
      expect(bid.active).to.equal(true);
      
      // Record balance after creating bid but before canceling
      const balanceAfterBidding = await ethers.provider.getBalance(buyer.address);
      
      // Cancel the bid
      const cancelTx = await marketplace.connect(buyer).cancelBid(bidId);
      const cancelReceipt = await cancelTx.wait();
      
      // Calculate gas costs for the cancel transaction
      const gasCost = cancelReceipt.gasUsed * cancelReceipt.gasPrice;
      
      // Verify bid is canceled
      const updatedBid = await marketplace.getBidDetails(bidId);
      expect(updatedBid.active).to.equal(false);
      
      // Get final balance
      const finalBalance = await ethers.provider.getBalance(buyer.address);
      
      // Final balance should be approximately: initial balance - gas costs for both transactions
      // Allow a small tolerance for rounding errors
      const tolerance = ethers.parseEther("0.001");
      
      // The bidAmount should have been refunded
      const expectedBalance = balanceAfterBidding + bidAmount - gasCost;
      expect(finalBalance).to.be.closeTo(expectedBalance, tolerance);
    });
    
    it("should reject bid creation with zero price", async function () {
      await expect(
        marketplace.connect(buyer).createBid(await nft721.getAddress(), { value: 0 })
      ).to.be.revertedWithCustomError(marketplace, "BidTooLow");
    });
    
    it("should reject unauthorized bid cancellation", async function () {
      // Create a bid
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.5") }
      );
      
      const bidId = await marketplace.totalBids();
      
      // Try to cancel someone else's bid
      await expect(
        marketplace.connect(seller).cancelBid(bidId)
      ).to.be.revertedWithCustomError(marketplace, "NotAuthorized");
    });
    
    it("should allow increasing bid price", async function () {
      // Create a bid
      const initialBidAmount = ethers.parseEther("0.5");
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: initialBidAmount }
      );
      
      const bidId = await marketplace.totalBids();
      
      // Increase the bid
      const additionalAmount = ethers.parseEther("0.3");
      await marketplace.connect(buyer).increaseBidPrice(bidId, { value: additionalAmount });
      
      // Verify bid price was updated
      const updatedBid = await marketplace.getBidDetails(bidId);
      expect(updatedBid.price).to.equal(initialBidAmount + additionalAmount);
    });
    
    it("should allow seller to fulfill a bid", async function () {
      // Create a bid
      const bidAmount = ethers.parseEther("0.5");
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: bidAmount }
      );
      
      const bidId = await marketplace.totalBids();
      
      // Check seller and buyer balances before fulfilling
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      
      // Fulfill the bid with token #1
      const tx = await marketplace.connect(seller).fulfillBid(bidId, 1);
      const receipt = await tx.wait();
      
      // Calculate gas costs
      const gasUsed = receipt?.gasUsed || BigInt(0);
      const gasPrice = receipt?.gasPrice || BigInt(0);
      const gasCost = gasUsed * gasPrice;
      
      // Check ownership transferred
      expect(await nft721.ownerOf(1)).to.equal(buyer.address);
      
      // Check seller received payment (minus fee and gas)
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      const fee = (bidAmount * BigInt(250)) / BigInt(10000); // 2.5% fee
      const expectedSellerBalance = sellerBalanceBefore + bidAmount - fee - gasCost;
      
      // Allow for some small rounding errors
      const tolerance = ethers.parseEther("0.001");
      expect(sellerBalanceAfter).to.be.closeTo(expectedSellerBalance, tolerance);
      
      // Check bid is no longer active
      const updatedBid = await marketplace.getBidDetails(bidId);
      expect(updatedBid.active).to.equal(false);
    });
    
    it("should handle collection-wide bids correctly", async function () {
      // Create multiple bids of different prices
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.2") }
      );
      const lowBidId = await marketplace.totalBids();
      
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.5") }
      );
      const highBidId = await marketplace.totalBids();
      
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.3") }
      );
      const mediumBidId = await marketplace.totalBids();
      
      // Get collection bids (should be ordered highest to lowest)
      const [bidIds, prices, bidders] = await marketplace.getAvailableCollectionBids(
        await nft721.getAddress(),
        10
      );
      
      // Check order (highest first)
      expect(bidIds[0]).to.equal(highBidId);
      expect(bidIds[1]).to.equal(mediumBidId);
      expect(bidIds[2]).to.equal(lowBidId);
      
      // Verify prices are in descending order
      for (let i = 0; i < prices.length - 1; i++) {
        expect(prices[i]).to.be.greaterThanOrEqual(prices[i + 1]);
      }
    });
    
    it("should update bid sort order when price increases", async function () {
      // Create bids with different prices
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.2") }
      );
      const lowBidId = await marketplace.totalBids();
      
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.5") }
      );
      const highBidId = await marketplace.totalBids();
      
      // Verify initial highest bid
      expect(await marketplace.collectionHighestBidId(await nft721.getAddress())).to.equal(highBidId);
      
      // Increase the low bid to be higher than the "high" bid
      await marketplace.connect(buyer).increaseBidPrice(lowBidId, { value: ethers.parseEther("0.4") });
      
      // Verify the order has changed
      expect(await marketplace.collectionHighestBidId(await nft721.getAddress())).to.equal(lowBidId);
      
      // Check next pointer
      const nextAfterNewHighest = await marketplace.nextHighestCollectionBid(
        await nft721.getAddress(),
        lowBidId
      );
      expect(nextAfterNewHighest).to.equal(highBidId);
    });
    
    it("should prevent fulfilling a bid for a token the seller doesn't own", async function () {
      // Create a bid
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.5") }
      );
      
      const bidId = await marketplace.totalBids();
      
      // Try to fulfill with a token the seller doesn't own (it belongs to the buyer)
      await nft721.connect(seller).transferFrom(seller.address, unauthorizedUser.address, 4);
      
      await expect(
        marketplace.connect(seller).fulfillBid(bidId, 4)
      ).to.be.revertedWithCustomError(marketplace, "NotTokenOwner");
    });
    
    it("should get all of a user's bids for a collection", async function () {
      // Create multiple bids for the same user and collection
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.2") }
      );
      const bidId1 = await marketplace.totalBids();
      
      await marketplace.connect(buyer).createBid(
        await nft721.getAddress(),
        { value: ethers.parseEther("0.3") }
      );
      const bidId2 = await marketplace.totalBids();
      
      // Create a bid for a different collection
      await marketplace.connect(buyer).createBid(
        await nft1155.getAddress(),
        { value: ethers.parseEther("0.4") }
      );
      
      // Get user's bids for ERC721 collection
      const userBids = await marketplace.getUserBidsForCollection(buyer.address, await nft721.getAddress());
      
      // Verify we got the right bids
      expect(userBids.length).to.equal(2);
      expect(userBids).to.include(bidId1);
      expect(userBids).to.include(bidId2);
    });
  });
});