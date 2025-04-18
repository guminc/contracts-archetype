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
        TokenType tokenType;
        uint256 tokenId;
        address seller;
        uint256 price;
        uint256 listingId;
        bool active;
    }

    //
    // VARIABLES
    //
    uint256 public feePercentage = 250; // 2.5% (in basis points);
    
    uint256 public totalListings;
    mapping(uint256 => Listing) public listings;
    
    // Track active listings per seller and token
    // Format: seller => tokenAddress => tokenId => listingId
    mapping(address => mapping(address => mapping(uint256 => uint256))) public sellerListings;

    // Collection-specific price tracking
    mapping(address => uint256) public collectionLowestPriceListingId;
    mapping(address => mapping(uint256 => uint256)) public nextLowestCollectionListing;

    //
    // EVENTS
    //
    event ListingCreated(uint256 indexed listingId, address indexed tokenAddress, uint256 indexed tokenId, address seller, uint256 price, TokenType tokenType);
    event ListingUpdated(uint256 indexed listingId, uint256 newPrice);
    event ListingCanceled(uint256 indexed listingId);
    event TokenSold(uint256 indexed listingId, address indexed tokenAddress, uint256 indexed tokenId, address seller, address buyer, uint256 price);
    event FeeUpdated(uint256 newFeePercentage);

    constructor() {}

    //
    // PUBLIC
    //
    function listItem(address tokenAddress, uint256 tokenId, uint256 price) external {
        if (price == 0) revert PriceTooLow();

        // Check if seller already has an active listing for this token
        uint256 existingListingId = sellerListings[_msgSender()][tokenAddress][tokenId];
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
        
        uint256 listingId = totalListings + 1;
        listings[listingId] = Listing({
            tokenAddress: tokenAddress,
            tokenType: tokenType,
            tokenId: tokenId,
            seller: _msgSender(),
            price: price,
            listingId: listingId,
            active: true
        });

        sellerListings[_msgSender()][tokenAddress][tokenId] = listingId;
        
        _insertIntoCollectionPriceList(listingId, tokenAddress);
        
        totalListings++;
        
        emit ListingCreated(listingId, tokenAddress, tokenId, _msgSender(), price, tokenType);
    }
    
    function updateListingPrice(uint256 listingId, uint256 newPrice) public {
        if (newPrice == 0) revert PriceTooLow();
        
        Listing storage listing = listings[listingId];
        if (!listing.active) revert InvalidListing();
        if (listing.seller != _msgSender()) revert NotAuthorized();
        
        if (!_verifyOwnership(listing)) revert OwnershipChanged();
        
        _removeFromCollectionPriceList(listingId, listing.tokenAddress);
        
        listing.price = newPrice;
        
        _insertIntoCollectionPriceList(listingId, listing.tokenAddress);
        
        emit ListingUpdated(listingId, newPrice);
    }
    
    function cancelListing(uint256 listingId) external {
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
    
    function buyItem(uint256 listingId) external payable {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert InvalidListing();
        if (msg.value < listing.price) revert InsufficientPayment();
        
        if (!_verifyOwnership(listing)) revert OwnershipChanged();
        
        _processPurchase(listingId, listing);
    }
    
    function buyLowestPricedCollectionItem(address tokenAddress) external payable {
        uint256 lowestCollectionListingId = collectionLowestPriceListingId[tokenAddress];
        if (lowestCollectionListingId == 0) revert NoActiveListings();
        
        uint256 currentListingId = _findFirstActiveAndValidListing(
            lowestCollectionListingId, 
            nextLowestCollectionListing[tokenAddress]
        );
        
        Listing storage listing = listings[currentListingId];
        if (msg.value < listing.price) revert InsufficientPayment();
        
        _processPurchase(currentListingId, listing);
    }
    
    function getAvailableCollectionListings(address tokenAddress, uint256 count) external view returns (
        uint256[] memory listingIds,
        uint256[] memory prices,
        uint256[] memory tokenIds,
        address[] memory sellers
    ) {
        return _getAvailableListingsFromLinkedList(
            count, 
            collectionLowestPriceListingId[tokenAddress], 
            nextLowestCollectionListing[tokenAddress]
        );
    }
    
    function getListingDetails(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
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
    
    function _processPurchase(uint256 listingId, Listing storage listing) internal {
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
    
    function _findFirstActiveAndValidListing(
        uint256 startListingId, 
        mapping(uint256 => uint256) storage nextListingMapping
    ) internal view returns (uint256) {
        uint256 currentListingId = startListingId;
        
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
        uint256 lowestListingId,
        mapping(uint256 => uint256) storage nextMapping
    ) internal view returns (
        uint256[] memory listingIds,
        uint256[] memory prices,
        uint256[] memory tokenIds,
        address[] memory sellers
    ) {
        listingIds = new uint256[](count);
        prices = new uint256[](count);
        tokenIds = new uint256[](count);
        sellers = new address[](count);
        
        uint256 foundCount = 0;
        uint256 currentListingId = lowestListingId;
        
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
            uint256[] memory resizedListingIds = new uint256[](foundCount);
            uint256[] memory resizedPrices = new uint256[](foundCount);
            uint256[] memory resizedTokenIds = new uint256[](foundCount);
            address[] memory resizedSellers = new address[](foundCount);
            
            for (uint256 i = 0; i < foundCount; i++) {
                resizedListingIds[i] = listingIds[i];
                resizedPrices[i] = prices[i];
                resizedTokenIds[i] = tokenIds[i];
                resizedSellers[i] = sellers[i];
            }
            
            return (resizedListingIds, resizedPrices, resizedTokenIds, resizedSellers);
        }
        
        return (listingIds, prices, tokenIds, sellers);
    }

    function _insertIntoCollectionPriceList(uint256 listingId, address tokenAddress) internal {
        uint256 price = listings[listingId].price;
        uint256 lowestCollectionListingId = collectionLowestPriceListingId[tokenAddress];
        
        if (lowestCollectionListingId == 0 || 
            price < listings[lowestCollectionListingId].price) {
            nextLowestCollectionListing[tokenAddress][listingId] = lowestCollectionListingId;
            collectionLowestPriceListingId[tokenAddress] = listingId;
        } else {
            uint256 current = lowestCollectionListingId;
            uint256 next = nextLowestCollectionListing[tokenAddress][current];
            
            while (next != 0 && listings[next].price <= price) {
                current = next;
                next = nextLowestCollectionListing[tokenAddress][current];
            }
            
            nextLowestCollectionListing[tokenAddress][listingId] = next;
            nextLowestCollectionListing[tokenAddress][current] = listingId;
        }
    }
    
    function _removeFromCollectionPriceList(uint256 listingId, address tokenAddress) internal {
        if (listingId == collectionLowestPriceListingId[tokenAddress]) {
            collectionLowestPriceListingId[tokenAddress] = nextLowestCollectionListing[tokenAddress][listingId];
        } else {
            uint256 current = collectionLowestPriceListingId[tokenAddress];
            
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