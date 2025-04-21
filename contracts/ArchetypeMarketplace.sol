// SPDX-License-Identifier: MIT
// ArchetypeMarketplace v0.1.0
//
//        d8888                 888               888
//       d88888                 888               888
//      d88P888                 888               888
//     d88P 888 888d888 .d8888b 88888b.   .d88b.  888888 888  888 88888b.   .d88b.
//    d88P  888 888P"  d88P"    888 "88b d8P  Y8b 888    888  888 888 "88b d8P  Y8b
//   d88P   888 888    888      888  888 88888888 888    888  888 888  888 88888888
//  d8888888888 888    Y88b.    888  888 Y8b.     Y88b.  Y88b 888 888 d88P Y8b.
// d88P     888 888     "Y8888P 888  888  "Y8888   "Y888  "Y88888 88888P"   "Y8888
//                                                            888 888
//                                                       Y8b d88P 888
//                                                        "Y88P"  888

pragma solidity ^0.8.20;

import "./ArchetypePayouts.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

//
// ERRORS
//
error PriceTooLow();
error InvalidListing();
error UnsupportedToken();
error InsufficientPayment();
error InsufficientBalance();
error NotTokenOwner();
error NotAuthorized();
error NotListed();
error NoActiveListings();
error ZeroAddress();
error FeeTooHigh();
error NotApproved();
error OwnershipChanged();
error NotPlatform();
error BidTooLow();
error InvalidBid();
error BidNotActive();
error NoBidsFound();
error BidTokenNotSet();
error ERC20TransferFailed();

contract ArchetypeMarketplace {
    using ERC165Checker for address;

    //
    // CONSTANTS
    //
    bytes4 private constant ERC721_INTERFACE_ID = 0x80ac58cd;
    bytes4 private constant ERC1155_INTERFACE_ID = 0xd9b67a26;

    address constant PLATFORM = 0x8952caF7E5bf1fe63ebe94148ca802F3eF127C98;
    address constant BATCH = 0xEa49e7bE310716dA66725c84a5127d2F6A202eAf;
    address constant PAYOUTS = 0xaAfdfA4a935d8511bF285af11A0544ce7e4a1199;

    //
    // STRUCTS
    //
    enum TokenType { ERC721, ERC1155 }

    struct Listing {
        address tokenAddress;
        address seller;
        uint256 tokenId;
        uint128 price;
        uint64 listingId;
        bool active;
        TokenType tokenType;
    }

    struct Bid {
        address tokenAddress;
        address bidder;
        uint128 price;
        uint64 bidId;
        bool active;
        TokenType tokenType;
    }

    //
    // VARIABLES
    //
    uint256 public feePercentage = 250; // 2.5% (in basis points);
    
    uint64 public totalListings;
    mapping(uint256 => Listing) public listings;
    
    uint64 public totalBids;
    mapping(uint256 => Bid) public bids;

    // ERC20 token address for bids (e.g., WETH, wPOL, wDMT)
    address public bidToken;
    
    // Track active listings per seller and token
    // Format: seller => tokenAddress => tokenId => listingId
    mapping(address => mapping(address => mapping(uint256 => uint64))) public sellerListings;
    
    // Track active bids per bidder and collection
    // Format: bidder => tokenAddress => bidId[]
    mapping(address => mapping(address => uint64[])) public bidderCollectionBids;

    // Collection-specific price tracking for listings (lowest first)
    mapping(address => uint64) public collectionLowestPriceListingId;
    mapping(address => mapping(uint64 => uint64)) public nextLowestCollectionListing;
    
    // Collection-specific price tracking for bids (highest first)
    mapping(address => uint64) public collectionHighestBidId;
    mapping(address => mapping(uint64 => uint64)) public nextHighestCollectionBid;

    //
    // EVENTS
    //
    event ListingCreated(uint64 indexed listingId, address indexed tokenAddress, uint256 indexed tokenId, address seller, uint256 price);
    event ListingUpdated(uint64 indexed listingId, uint256 newPrice);
    event ListingCanceled(uint64 indexed listingId);
    event TokenSold(uint64 indexed listingId, address indexed tokenAddress, uint256 indexed tokenId, address seller, address buyer, uint256 price);
    event FeeUpdated(uint256 newFeePercentage);
    event BidCreated(uint64 indexed bidId, address indexed tokenAddress, address bidder, uint256 price);
    event BidUpdated(uint64 indexed bidId, uint256 newPrice);
    event BidCanceled(uint64 indexed bidId);
    event BidFulfilled(uint64 indexed bidId, address indexed tokenAddress, uint256 indexed tokenId, address seller, address buyer, uint256 price);

    constructor(address _bidToken) {
        bidToken = _bidToken;
    }

    //
    // LISTING
    //
    function listItem(address tokenAddress, uint256 tokenId, uint256 price) external {
        if (price == 0) revert PriceTooLow();

        // Check if seller already has an active listing for this token
        uint64 existingListingId = sellerListings[_msgSender()][tokenAddress][tokenId];
        if (listings[existingListingId].active) {
            // Update the existing listing price
            updateListingPrice(existingListingId, price);
            return;
        }
        
        
        TokenType tokenType;
        if (tokenAddress.supportsInterface(ERC721_INTERFACE_ID)) {
            tokenType = TokenType.ERC721;
            
            if (IERC721(tokenAddress).ownerOf(tokenId) != _msgSender()) revert NotTokenOwner();
            
            if (IERC721(tokenAddress).getApproved(tokenId) != address(this) && 
                !IERC721(tokenAddress).isApprovedForAll(_msgSender(), address(this))) revert NotApproved();
                
        } else if (tokenAddress.supportsInterface(ERC1155_INTERFACE_ID)) {
            tokenType = TokenType.ERC1155;
            
            if (IERC1155(tokenAddress).balanceOf(_msgSender(), tokenId) < 1) revert InsufficientBalance();
            
            if (!IERC1155(tokenAddress).isApprovedForAll(_msgSender(), address(this))) revert NotApproved();
            
        } else {
            revert UnsupportedToken();
        }
        
        uint64 listingId = totalListings + 1;
        listings[listingId] = Listing({
            tokenAddress: tokenAddress,
            tokenType: tokenType,
            tokenId: tokenId,
            seller: _msgSender(),
            price: uint128(price),
            listingId: listingId,
            active: true
        });

        sellerListings[_msgSender()][tokenAddress][tokenId] = listingId;
        
        _insertIntoCollectionPriceList(listingId, tokenAddress);
        
        totalListings++;
        
        emit ListingCreated(listingId, tokenAddress, tokenId, _msgSender(), price);
    }
    
    function updateListingPrice(uint64 listingId, uint256 newPrice) public {
        if (newPrice == 0) revert PriceTooLow();
        
        Listing storage listing = listings[listingId];
        if (!listing.active) revert InvalidListing();
        if (listing.seller != _msgSender()) revert NotAuthorized();
        
        if (!_verifyOwnership(listing)) revert OwnershipChanged();
        
        _removeFromCollectionPriceList(listingId, listing.tokenAddress);
        
        listing.price = uint128(newPrice);
        
        _insertIntoCollectionPriceList(listingId, listing.tokenAddress);
        
        emit ListingUpdated(listingId, newPrice);
    }
    
    function cancelListing(uint64 listingId) external {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert InvalidListing();
        if (listing.seller != _msgSender()) revert NotAuthorized();
        
        _removeFromCollectionPriceList(listingId, listing.tokenAddress);

        // Clear seller's token listing reference
        if (sellerListings[listing.seller][listing.tokenAddress][listing.tokenId] == listingId) {
            sellerListings[listing.seller][listing.tokenAddress][listing.tokenId] = 0;
        }
        
        listing.active = false;
        
        emit ListingCanceled(listingId);
    }
    
    function buyItem(uint64 listingId) external payable {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert InvalidListing();
        if (msg.value < listing.price) revert InsufficientPayment();
        
        if (!_verifyOwnership(listing)) revert OwnershipChanged();
        
        _processPurchase(listingId, listing);
    }
    
    function buyLowestPricedCollectionItem(address tokenAddress) external payable {
        uint64 lowestCollectionListingId = collectionLowestPriceListingId[tokenAddress];
        if (lowestCollectionListingId == 0) revert NoActiveListings();
        
        uint64 currentListingId = _findFirstActiveAndValidListing(
            lowestCollectionListingId, 
            nextLowestCollectionListing[tokenAddress]
        );
        
        Listing storage listing = listings[currentListingId];
        if (msg.value < listing.price) revert InsufficientPayment();
        
        _processPurchase(currentListingId, listing);
    }
    
    function getAvailableCollectionListings(address tokenAddress, uint256 count) external view returns (
        uint64[] memory listingIds,
        uint128[] memory prices,
        uint256[] memory tokenIds,
        address[] memory sellers
    ) {
        return _getAvailableListingsFromLinkedList(
            count, 
            collectionLowestPriceListingId[tokenAddress], 
            nextLowestCollectionListing[tokenAddress]
        );
    }
    
    function getListingDetails(uint64 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    //
    // BIDDING
    //
    function createBid(address tokenAddress, uint256 amount) external {
        if (amount == 0) revert BidTooLow();
        if (bidToken == address(0)) revert BidTokenNotSet();
        
        // Verify token type
        TokenType tokenType;
        if (tokenAddress.supportsInterface(ERC721_INTERFACE_ID)) {
            tokenType = TokenType.ERC721;
        } else if (tokenAddress.supportsInterface(ERC1155_INTERFACE_ID)) {
            tokenType = TokenType.ERC1155;
        } else {
            revert UnsupportedToken();
        }
        
        // Check bidder balance and allowance
        if (IERC20(bidToken).balanceOf(_msgSender()) < amount) revert InsufficientBalance();
        if (IERC20(bidToken).allowance(_msgSender(), address(this)) < amount) revert NotApproved();
        
        // Create bid
        uint64 bidId = totalBids + 1;
        bids[bidId] = Bid({
            bidder: _msgSender(),
            tokenAddress: tokenAddress,
            price: uint128(amount),
            bidId: bidId,
            active: true,
            tokenType: tokenType
        });
        
        // Track bids by bidder and collection
        bidderCollectionBids[_msgSender()][tokenAddress].push(bidId);
        
        // Insert into price-ordered collection bid list
        _insertIntoCollectionBidList(bidId, tokenAddress);
        
        totalBids++;
        
        emit BidCreated(bidId, tokenAddress, _msgSender(), amount);
    }
    
    function updateBidPrice(uint64 bidId, uint256 price) external {
        if (price == 0) revert BidTooLow();
        
        Bid storage bid = bids[bidId];
        if (!bid.active) revert InvalidBid();
        if (bid.bidder != _msgSender()) revert NotAuthorized();
        
        uint256 newPrice = price;
        
        // Check bidder balance and allowance
        if (IERC20(bidToken).balanceOf(_msgSender()) < newPrice) revert InsufficientBalance();
        if (IERC20(bidToken).allowance(_msgSender(), address(this)) < newPrice) revert NotApproved();
        
        _removeFromCollectionBidList(bidId, bid.tokenAddress);
        
        bid.price = uint128(newPrice);
        
        _insertIntoCollectionBidList(bidId, bid.tokenAddress);
        
        emit BidUpdated(bidId, newPrice);
    }
    
    function cancelBid(uint64 bidId) external {
        Bid storage bid = bids[bidId];
        if (!bid.active) revert InvalidBid();
        if (bid.bidder != _msgSender()) revert NotAuthorized();
        
        _removeFromCollectionBidList(bidId, bid.tokenAddress);
        bid.active = false;
        
        
        emit BidCanceled(bidId);
    }
    
    function fulfillBid(uint64 bidId, uint256 tokenId) external {
        Bid storage bid = bids[bidId];
        if (!bid.active) revert BidNotActive();
        
        // Verify token ownership and approval
        if (bid.tokenType == TokenType.ERC721) {
            if (IERC721(bid.tokenAddress).ownerOf(tokenId) != _msgSender()) revert NotTokenOwner();
            if (IERC721(bid.tokenAddress).getApproved(tokenId) != address(this) && 
                !IERC721(bid.tokenAddress).isApprovedForAll(_msgSender(), address(this))) revert NotApproved();
        } else if (bid.tokenType == TokenType.ERC1155) {
            if (IERC1155(bid.tokenAddress).balanceOf(_msgSender(), tokenId) < 1) revert InsufficientBalance();
            if (!IERC1155(bid.tokenAddress).isApprovedForAll(_msgSender(), address(this))) revert NotApproved();
        }
        
        // Check if bidder still has sufficient balance and allowance
        if (IERC20(bidToken).balanceOf(bid.bidder) < bid.price) revert InsufficientBalance();
        if (IERC20(bidToken).allowance(bid.bidder, address(this)) < bid.price) revert NotApproved();
        
        // Process the bid fulfillment
        _processFulfillBid(bidId, tokenId, bid);
    }
    
    function getAvailableCollectionBids(address tokenAddress, uint256 count) external view returns (
        uint64[] memory bidIds,
        uint128[] memory prices,
        address[] memory bidders
    ) {
        return _getAvailableBidsFromLinkedList(
            count,
            collectionHighestBidId[tokenAddress],
            nextHighestCollectionBid[tokenAddress]
        );
    }
    
    function getUserBidsForCollection(address user, address tokenAddress) external view returns (uint64[] memory) {
        return bidderCollectionBids[user][tokenAddress];
    }
    
    function getBidDetails(uint64 bidId) external view returns (Bid memory) {
        return bids[bidId];
    }

    //
    // PLATFORM ADMIN
    //
    function setFeePercentage(uint256 _feePercentage) external _onlyPlatform {
        if (_feePercentage > 1000) revert FeeTooHigh(); // Max 10%
        feePercentage = _feePercentage;
        emit FeeUpdated(_feePercentage);
    }

    //
    // INTERNAL
    //
    function _verifyOwnership(Listing storage listing) internal view returns (bool) {
        if (listing.tokenType == TokenType.ERC721) {
            try IERC721(listing.tokenAddress).ownerOf(listing.tokenId) returns (address owner) {
                return owner == listing.seller;
            } catch {
                return false;
            }
        } else if (listing.tokenType == TokenType.ERC1155) {
            try IERC1155(listing.tokenAddress).balanceOf(listing.seller, listing.tokenId) returns (uint256 balance) {
                return balance > 0;
            } catch {
                return false;
            }
        }
        
        return false;
    }
    
    function _verifyApproval(Listing storage listing) internal view returns (bool) {
        if (listing.tokenType == TokenType.ERC721) {
            try IERC721(listing.tokenAddress).getApproved(listing.tokenId) returns (address approved) {
                if (approved == address(this)) {
                    return true;
                }
            } catch {
                return false;
            }
            
            try IERC721(listing.tokenAddress).isApprovedForAll(listing.seller, address(this)) returns (bool isApproved) {
                return isApproved;
            } catch {
                return false;
            }
        } else if (listing.tokenType == TokenType.ERC1155) {
            try IERC1155(listing.tokenAddress).isApprovedForAll(listing.seller, address(this)) returns (bool isApproved) {
                return isApproved;
            } catch {
                return false;
            }
        }
        
        return false;
    }
    
    function _processPurchase(uint64 listingId, Listing storage listing) internal {
        if (!_verifyApproval(listing)) revert NotApproved();
        
        _removeFromCollectionPriceList(listingId, listing.tokenAddress);
        
        uint256 fee = (listing.price * feePercentage) / 10000;
        uint256 sellerAmount = listing.price - fee;
        
        // Clear seller's token listing reference
        if (sellerListings[listing.seller][listing.tokenAddress][listing.tokenId] == listingId) {
            sellerListings[listing.seller][listing.tokenAddress][listing.tokenId] = 0;
        }

        listing.active = false;
        
        if (listing.tokenType == TokenType.ERC721) {
            IERC721(listing.tokenAddress).safeTransferFrom(listing.seller, _msgSender(), listing.tokenId);
        } else if (listing.tokenType == TokenType.ERC1155) {
            IERC1155(listing.tokenAddress).safeTransferFrom(listing.seller, _msgSender(), listing.tokenId, 1, "");
        }

        _payPlatform(fee);
        
        (bool sellerTransferSuccess, ) = payable(listing.seller).call{value: sellerAmount}("");
        if (!sellerTransferSuccess) revert TransferFailed();        
        
        if (msg.value > listing.price) {
            _refund(_msgSender(), msg.value - listing.price);
        }
        
        emit TokenSold(
            listingId, 
            listing.tokenAddress, 
            listing.tokenId, 
            listing.seller, 
            _msgSender(), 
            listing.price
        );
    }
    
    function _processFulfillBid(uint64 bidId, uint256 tokenId, Bid storage bid) internal {
        _removeFromCollectionBidList(bidId, bid.tokenAddress);
        
        uint256 fee = (bid.price * feePercentage) / 10000;
        uint256 sellerAmount = bid.price - fee;
        
        bid.active = false;
        
        // Transfer NFT to bidder
        if (bid.tokenType == TokenType.ERC721) {
            IERC721(bid.tokenAddress).safeTransferFrom(_msgSender(), bid.bidder, tokenId);
        } else if (bid.tokenType == TokenType.ERC1155) {
            IERC1155(bid.tokenAddress).safeTransferFrom(_msgSender(), bid.bidder, tokenId, 1, "");
        }
        
        // Pay platform fee directly to PLATFORM address
        bool platformTransferSuccess = IERC20(bidToken).transferFrom(bid.bidder, PLATFORM, fee);
        if (!platformTransferSuccess) revert ERC20TransferFailed();
        
        // Pay seller directly from bidder to seller
        bool sellerTransferSuccess = IERC20(bidToken).transferFrom(bid.bidder, _msgSender(), sellerAmount);
        if (!sellerTransferSuccess) revert ERC20TransferFailed();
        
        emit BidFulfilled(bidId, bid.tokenAddress, tokenId, _msgSender(), bid.bidder, bid.price);
    }

    function _findFirstActiveAndValidListing(
        uint64 startListingId, 
        mapping(uint64 => uint64) storage nextListingMapping
    ) internal view returns (uint64) {
        uint64 currentListingId = startListingId;
        
        while (currentListingId != 0) {
            Listing storage listing = listings[currentListingId];
            if (listing.active && _verifyOwnership(listing) && _verifyApproval(listing)) {
                return currentListingId;
            }
            
            currentListingId = nextListingMapping[currentListingId];
        }
        
        revert NoActiveListings();
    }
    
    function _getAvailableListingsFromLinkedList(
        uint256 count,
        uint64 lowestListingId,
        mapping(uint64 => uint64) storage nextMapping
    ) internal view returns (
        uint64[] memory listingIds,
        uint128[] memory prices,
        uint256[] memory tokenIds,
        address[] memory sellers
    ) {
        listingIds = new uint64[](count);
        prices = new uint128[](count);
        tokenIds = new uint256[](count);
        sellers = new address[](count);
        
        uint256 foundCount = 0;
        uint64 currentListingId = lowestListingId;
        
        while (currentListingId != 0 && foundCount < count) {
            Listing storage listing = listings[currentListingId];
            if (listing.active && _verifyOwnership(listing) && _verifyApproval(listing)) {
                listingIds[foundCount] = currentListingId;
                prices[foundCount] = listing.price;
                tokenIds[foundCount] = listing.tokenId;
                sellers[foundCount] = listing.seller;
                foundCount++;
            }
            
            currentListingId = nextMapping[currentListingId];
        }
        
        if (foundCount < count) {
            assembly {
                mstore(listingIds, foundCount)
                mstore(prices, foundCount)
                mstore(tokenIds, foundCount)
                mstore(sellers, foundCount)
            }
        }
        
        return (listingIds, prices, tokenIds, sellers);
    }

    function _insertIntoCollectionPriceList(uint64 listingId, address tokenAddress) internal {
        uint128 price = listings[listingId].price;
        uint64 lowestCollectionListingId = collectionLowestPriceListingId[tokenAddress];
        
        if (lowestCollectionListingId == 0 || 
            price < listings[lowestCollectionListingId].price) {
            nextLowestCollectionListing[tokenAddress][listingId] = lowestCollectionListingId;
            collectionLowestPriceListingId[tokenAddress] = listingId;
        } else {
            uint64 current = lowestCollectionListingId;
            uint64 next = nextLowestCollectionListing[tokenAddress][current];
            
            while (next != 0 && listings[next].price <= price) {
                current = next;
                next = nextLowestCollectionListing[tokenAddress][current];
            }
            
            nextLowestCollectionListing[tokenAddress][listingId] = next;
            nextLowestCollectionListing[tokenAddress][current] = listingId;
        }
    }
    
    function _removeFromCollectionPriceList(uint64 listingId, address tokenAddress) internal {
        if (listingId == collectionLowestPriceListingId[tokenAddress]) {
            collectionLowestPriceListingId[tokenAddress] = nextLowestCollectionListing[tokenAddress][listingId];
        } else {
            uint64 current = collectionLowestPriceListingId[tokenAddress];
            
            while (current != 0 && nextLowestCollectionListing[tokenAddress][current] != listingId) {
                current = nextLowestCollectionListing[tokenAddress][current];
            }

            if (current != 0) {
                // Update the link to skip over the hash being removed
                nextLowestCollectionListing[tokenAddress][current] = nextLowestCollectionListing[tokenAddress][listingId];
            }
        }
        
        nextLowestCollectionListing[tokenAddress][listingId] = 0;
    }
    
    function _insertIntoCollectionBidList(uint64 bidId, address tokenAddress) internal {
        uint128 price = bids[bidId].price;
        uint64 highestBidId = collectionHighestBidId[tokenAddress];
        
        if (highestBidId == 0 || 
            price > bids[highestBidId].price) {
            nextHighestCollectionBid[tokenAddress][bidId] = highestBidId;
            collectionHighestBidId[tokenAddress] = bidId;
        } else {
            uint64 current = highestBidId;
            uint64 next = nextHighestCollectionBid[tokenAddress][current];
            
            while (next != 0 && bids[next].price >= price) {
                current = next;
                next = nextHighestCollectionBid[tokenAddress][current];
            }
            
            nextHighestCollectionBid[tokenAddress][bidId] = next;
            nextHighestCollectionBid[tokenAddress][current] = bidId;
        }
    }
    
    function _removeFromCollectionBidList(uint64 bidId, address tokenAddress) internal {
        if (bidId == collectionHighestBidId[tokenAddress]) {
            collectionHighestBidId[tokenAddress] = nextHighestCollectionBid[tokenAddress][bidId];
        } else {
            uint64 current = collectionHighestBidId[tokenAddress];
            
            while (current != 0 && nextHighestCollectionBid[tokenAddress][current] != bidId) {
                current = nextHighestCollectionBid[tokenAddress][current];
            }

            if (current != 0) {
                // Update the link to skip over the bid being removed
                nextHighestCollectionBid[tokenAddress][current] = nextHighestCollectionBid[tokenAddress][bidId];
            }
        }
        
        nextHighestCollectionBid[tokenAddress][bidId] = 0;
    }
    
    function _getAvailableBidsFromLinkedList(
        uint256 count,
        uint64 highestBidId,
        mapping(uint64 => uint64) storage nextMapping
    ) internal view returns (
        uint64[] memory bidIds,
        uint128[] memory prices,
        address[] memory bidders
    ) {
        bidIds = new uint64[](count);
        prices = new uint128[](count);
        bidders = new address[](count);
        
        uint256 foundCount = 0;
        uint64 currentBidId = highestBidId;
        
        while (currentBidId != 0 && foundCount < count) {
            Bid storage bid = bids[currentBidId];
            if (bid.active) {
                // Check if bidder still has sufficient balance and allowance
                bool hasBalance = IERC20(bidToken).balanceOf(bid.bidder) >= bid.price;
                bool hasAllowance = IERC20(bidToken).allowance(bid.bidder, address(this)) >= bid.price; 
                if (hasBalance && hasAllowance) {
                    bidIds[foundCount] = currentBidId;
                    prices[foundCount] = bid.price;
                    bidders[foundCount] = bid.bidder;
                    foundCount++;
                }
            }
            
            currentBidId = nextMapping[currentBidId];
        }
        
        if (foundCount < count) {
            assembly {
                mstore(bidIds, foundCount)
                mstore(prices, foundCount)
                mstore(bidders, foundCount)
            }
        }
        
        return (bidIds, prices, bidders);
    }

    function _payPlatform(uint256 fee) internal {
        address[] memory recipients = new address[](1);
        recipients[0] = PLATFORM;
        uint16[] memory splits = new uint16[](1);
        splits[0] = 10000;
        ArchetypePayouts(PAYOUTS).updateBalances{value: fee}(
            fee,
            address(0), // native token
            recipients,
            splits
        );
    }

    function _msgSender() internal view returns (address) {
        return msg.sender == BATCH ? tx.origin : msg.sender;
    }

    function _refund(address to, uint256 refund) internal {
        (bool success, ) = payable(to).call{ value: refund }("");
        if (!success) {
            revert TransferFailed();
        }
    }

    modifier _onlyPlatform() {
        if (_msgSender() != PLATFORM) {
        revert NotPlatform();
        }
        _;
    }
}