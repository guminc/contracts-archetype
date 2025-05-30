// SPDX-License-Identifier: MIT
// ArchetypeLogic v0.8.0 - ERC1155-random
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

import "../ArchetypePayouts.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "solady/src/utils/MerkleProofLib.sol";
import "solady/src/utils/ECDSA.sol";

error InvalidConfig();
error MintNotYetStarted();
error MintEnded();
error WalletUnauthorizedToMint();
error InsufficientEthSent();
error ExcessiveEthSent();
error Erc20BalanceTooLow();
error MaxSupplyExceeded();
error ListMaxSupplyExceeded();
error TokenPoolEmpty();
error NumberOfMintsExceeded();
error MintingPaused();
error InvalidReferral();
error InvalidSignature();
error MaxBatchSizeExceeded();
error NotTokenOwner();
error NotPlatform();
error NotOwner();
error NotShareholder();
error NotApprovedToTransfer();
error InvalidAmountOfTokens();
error WrongPassword();
error LockedForever();
error URIQueryForNonexistentToken();
error InvalidTokenId();
error MintToZeroAddress();
error InvalidSeed();
error SeedHashAlreadyExists();
error NotListed();
error TokenAlreadyRevealed();
error PriceTooLow();

//
// STRUCTS
//
struct Auth {
  bytes32 key;
  bytes32[] proof;
}

struct Config {
  string baseUri;
  address affiliateSigner;
  address fulfillmentSigner;
  uint32 maxSupply;
  uint16 maxBatchSize;
  uint16 affiliateFee; //BPS
  uint16 affiliateDiscount; //BPS
  uint16 defaultRoyalty; //BPS
  uint16[] tokenPool; // flattened list of all mintable tokens
}

struct PayoutConfig {
  uint16 ownerBps;
  uint16 platformBps;
  uint16 partnerBps;
  uint16 superAffiliateBps;
  address partner;
  address superAffiliate;
  address ownerAltPayout;
}

struct Options {
  bool uriLocked;
  bool maxSupplyLocked;
  bool tokenPoolLocked;
  bool affiliateFeeLocked;
  bool ownerAltPayoutLocked;
  bool airdropLocked;
}

struct AdvancedInvite {
  uint128 price;
  uint128 reservePrice;
  uint128 delta;
  uint32 start;
  uint32 end;
  uint32 limit;
  uint32 maxSupply;
  uint32 interval;
  uint32 unitSize; // mint 1 get x
  address tokenAddress;
  uint16[] tokenIdsExcluded; // token ids excluded from this list
}

struct Invite {
  uint128 price;
  uint32 start;
  uint32 end;
  uint32 limit;
  uint32 maxSupply;
  uint32 unitSize; // mint 1 get x
  address tokenAddress;
  uint16[] tokenIdsExcluded; // token ids excluded from this list
}

struct ValidationArgs {
  address owner;
  address affiliate;
  uint256 quantity;
  uint256 curSupply;
  uint256 listSupply;
}

struct MintInfo {
  bytes32 key;
  address to;
  uint256 quantity;
  uint256 blockNumber;
}

// UPDATE CONSTANTS BEFORE DEPLOY
address constant PLATFORM = 0x8952caF7E5bf1fe63ebe94148ca802F3eF127C98;
address constant BATCH = 0xEa49e7bE310716dA66725c84a5127d2F6A202eAf;
address constant PAYOUTS = 0xaAfdfA4a935d8511bF285af11A0544ce7e4a1199;
uint16 constant MAXBPS = 5000; // max fee or discount is 50%
uint32 constant UINT32_MAX = 2**32 - 1;

library ArchetypeLogicErc1155Random {
  //
  // EVENTS
  //
  event Invited(bytes32 indexed key, bytes32 indexed cid);
  event Referral(address indexed affiliate, address token, uint128 wad, uint256 numMints);
  event Withdrawal(address indexed src, address token, uint128 wad);
  event RequestRandomness(uint256 indexed seedHash);
  event FulfillRandomness(uint256 indexed seedHash, uint256 seed, uint256 combinedSeed);

  // calculate price based on affiliate usage and mint discounts
  function computePrice(
    AdvancedInvite storage invite,
    uint16 affiliateDiscount,
    uint256 numTokens,
    uint256 listSupply,
    bool affiliateUsed
  ) public view returns (uint256) {
    uint256 price = invite.price;
    uint256 cost;
    if (invite.interval > 0 && invite.delta > 0) {
      // Apply dutch pricing
      uint256 diff = (((block.timestamp - invite.start) / invite.interval) * invite.delta);
      if (price > invite.reservePrice) {
        if (diff > price - invite.reservePrice) {
          price = invite.reservePrice;
        } else {
          price = price - diff;
        }
      } else if (price < invite.reservePrice) {
        if (diff > invite.reservePrice - price) {
          price = invite.reservePrice;
        } else {
          price = price + diff;
        }
      }
      cost = price * numTokens;
    } else if (invite.interval == 0 && invite.delta > 0) {
      // Apply linear curve
      uint256 lastPrice = price + invite.delta * listSupply;
      cost = lastPrice * numTokens + (invite.delta * numTokens * (numTokens - 1)) / 2;
    } else {
      cost = price * numTokens;
    }

    if (affiliateUsed) {
      cost = cost - ((cost * affiliateDiscount) / 10000);
    }

    return cost;
  }

  function validateMint(
    AdvancedInvite storage i,
    Config storage config,
    Auth calldata auth,
    mapping(address => mapping(bytes32 => uint256)) storage minted,
    bytes calldata signature,
    ValidationArgs memory args,
    uint256 cost
  ) public view {
    address msgSender = _msgSender();
    if (args.affiliate != address(0)) {
      if (
        args.affiliate == PLATFORM || args.affiliate == args.owner || args.affiliate == msgSender
      ) {
        revert InvalidReferral();
      }
      validateAffiliate(args.affiliate, signature, config.affiliateSigner);
    }

    if (i.limit == 0) {
      revert MintingPaused();
    }

    if (!verify(auth, i.tokenAddress, msgSender)) {
      revert WalletUnauthorizedToMint();
    }

    if (block.timestamp < i.start) {
      revert MintNotYetStarted();
    }

    if (i.end > i.start && block.timestamp > i.end) {
      revert MintEnded();
    }

    {
      uint256 totalAfterMint;
      if (i.limit < i.maxSupply) {
        totalAfterMint = minted[msgSender][auth.key] + args.quantity;

        if (totalAfterMint > i.limit) {
          revert NumberOfMintsExceeded();
        }
      }

      if (i.maxSupply < UINT32_MAX) {
        totalAfterMint = args.listSupply + args.quantity;
        if (totalAfterMint > i.maxSupply) {
          revert ListMaxSupplyExceeded();
        }
      }
    }

    if (args.quantity > config.maxBatchSize) {
      revert MaxBatchSizeExceeded();
    }

    if ((args.curSupply + args.quantity) > config.maxSupply) {
      revert MaxSupplyExceeded();
    }

    if (args.quantity > config.tokenPool.length) {
      revert TokenPoolEmpty();
    }

    if (i.tokenAddress != address(0)) {
      IERC20 erc20Token = IERC20(i.tokenAddress);
      if (erc20Token.allowance(msgSender, address(this)) < cost) {
        revert NotApprovedToTransfer();
      }

      if (erc20Token.balanceOf(msgSender) < cost) {
        revert Erc20BalanceTooLow();
      }

      if (msg.value != 0) {
        revert ExcessiveEthSent();
      }
    } else {
      if (msg.value < cost) {
        revert InsufficientEthSent();
      }
    }
  }

  function updateBalances(
    AdvancedInvite storage i,
    Config storage config,
    mapping(address => uint128) storage _ownerBalance,
    mapping(address => mapping(address => uint128)) storage _affiliateBalance,
    address affiliate,
    uint256 quantity,
    uint128 value
  ) public {
    address tokenAddress = i.tokenAddress;

    uint128 affiliateWad;
    if (affiliate != address(0)) {
      affiliateWad = (value * config.affiliateFee) / 10000;
      _affiliateBalance[affiliate][tokenAddress] += affiliateWad;
      emit Referral(affiliate, tokenAddress, affiliateWad, quantity);
    }

    uint128 balance = _ownerBalance[tokenAddress];
    uint128 ownerWad = value - affiliateWad;
    _ownerBalance[tokenAddress] = balance + ownerWad;

    if (tokenAddress != address(0)) {
      IERC20 erc20Token = IERC20(tokenAddress);
      bool success = erc20Token.transferFrom(_msgSender(), address(this), value);
      if (!success) {
        revert TransferFailed();
      }
    }
  }

  function withdrawTokensAffiliate(
    mapping(address => mapping(address => uint128)) storage _affiliateBalance,
    address[] calldata tokens
  ) public {
    address msgSender = _msgSender();

    for (uint256 i; i < tokens.length; i++) {
      address tokenAddress = tokens[i];
      uint128 wad = _affiliateBalance[msgSender][tokenAddress];
      _affiliateBalance[msgSender][tokenAddress] = 0;

      if (wad == 0) {
        revert BalanceEmpty();
      }

      if (tokenAddress == address(0)) {
        bool success = false;
        (success, ) = msgSender.call{ value: wad }("");
        if (!success) {
          revert TransferFailed();
        }
      } else {
        IERC20 erc20Token = IERC20(tokenAddress);
        bool success = erc20Token.transfer(msgSender, wad);
        if (!success) {
          revert TransferFailed();
        }
      }

      emit Withdrawal(msgSender, tokenAddress, wad);
    }
  }

  function withdrawTokens(
    PayoutConfig storage payoutConfig,
    mapping(address => uint128) storage _ownerBalance,
    address owner,
    address[] calldata tokens
  ) public {
    address msgSender = _msgSender();
    for (uint256 i; i < tokens.length; i++) {
      address tokenAddress = tokens[i];
      uint128 wad;

      if (
        msgSender == owner ||
        msgSender == PLATFORM ||
        msgSender == payoutConfig.partner ||
        msgSender == payoutConfig.superAffiliate ||
        msgSender == payoutConfig.ownerAltPayout
      ) {
        wad = _ownerBalance[tokenAddress];
        _ownerBalance[tokenAddress] = 0;
      } else {
        revert NotShareholder();
      }

      if (wad == 0) {
        revert BalanceEmpty();
      }

      if (payoutConfig.ownerAltPayout == address(0)) {
        address[] memory recipients = new address[](4);
        recipients[0] = owner;
        recipients[1] = PLATFORM;
        recipients[2] = payoutConfig.partner;
        recipients[3] = payoutConfig.superAffiliate;

        uint16[] memory splits = new uint16[](4);
        splits[0] = payoutConfig.ownerBps;
        splits[1] = payoutConfig.platformBps;
        splits[2] = payoutConfig.partnerBps;
        splits[3] = payoutConfig.superAffiliateBps;

        if (tokenAddress == address(0)) {
          ArchetypePayouts(PAYOUTS).updateBalances{ value: wad }(
            wad,
            tokenAddress,
            recipients,
            splits
          );
        } else {
          ArchetypePayouts(PAYOUTS).updateBalances(wad, tokenAddress, recipients, splits);
        }
      } else {
        uint256 ownerShare = (uint256(wad) * payoutConfig.ownerBps) / 10000;
        uint256 remainingShare = wad - ownerShare;

        if (tokenAddress == address(0)) {
          (bool success, ) = payable(payoutConfig.ownerAltPayout).call{ value: ownerShare }("");
          if (!success) revert TransferFailed();
        } else {
          IERC20(tokenAddress).transfer(payoutConfig.ownerAltPayout, ownerShare);
        }

        address[] memory recipients = new address[](3);
        recipients[0] = PLATFORM;
        recipients[1] = payoutConfig.partner;
        recipients[2] = payoutConfig.superAffiliate;

        uint16[] memory splits = new uint16[](3);
        uint16 remainingBps = 10000 - payoutConfig.ownerBps;
        splits[1] = uint16((uint256(payoutConfig.partnerBps) * 10000) / remainingBps);
        splits[2] = uint16((uint256(payoutConfig.superAffiliateBps) * 10000) / remainingBps);
        splits[0] = 10000 - splits[1] - splits[2];

        if (tokenAddress == address(0)) {
          ArchetypePayouts(PAYOUTS).updateBalances{ value: remainingShare }(
            remainingShare,
            tokenAddress,
            recipients,
            splits
          );
        } else {
          ArchetypePayouts(PAYOUTS).updateBalances(
            remainingShare,
            tokenAddress,
            recipients,
            splits
          );
        }
      }
      emit Withdrawal(msgSender, tokenAddress, wad);
    }
  }

  function removeFromPriceList(
    uint256 seedHash,
    mapping(uint256 => uint256) storage nextLowestHash,
    mapping(uint256 => uint256) storage seedHashPrice,
    uint256 lowestPriceHash
  ) public returns (uint256) {
    uint256 newLowestPriceHash = lowestPriceHash;
    if (seedHash == lowestPriceHash) {
        // It was the lowest price, update to next lowest
        newLowestPriceHash =  nextLowestHash[seedHash];
    } else {
        // Find previous hash that points to this one
        uint256 current = lowestPriceHash;
        
        while (current != 0 && nextLowestHash[current] != seedHash) {
            current = nextLowestHash[current];
        }
        
        if (current != 0) {
            // Update the link to skip over the hash being removed
            nextLowestHash[current] = nextLowestHash[seedHash];
        }
    }
    
    // Clear this hashed pointers
    nextLowestHash[seedHash] = 0;
    seedHashPrice[seedHash] = 0;

    return newLowestPriceHash;
  }

  function insertIntoPriceList(
    uint256 seedHash,
    uint256 price,
    mapping(uint256 => uint256) storage nextLowestHash,
    mapping(uint256 => uint256) storage seedHashPrice,
    uint256 lowestPriceHash
  ) public returns (uint256) {
    seedHashPrice[seedHash] = price;
    uint256 newLowestPriceHash = lowestPriceHash;

    uint256 lowestPrice = seedHashPrice[lowestPriceHash];
    if (lowestPrice == 0 || price < lowestPrice) {
        // New hash is the lowest price
        nextLowestHash[seedHash] = lowestPriceHash;
        newLowestPriceHash = seedHash;
    } else {
        // Find correct position to insert
        uint256 current = lowestPriceHash;
        uint256 next = nextLowestHash[current];
        
        while (next != 0 && seedHashPrice[next] <= price) {
            current = next;
            next = nextLowestHash[current];
        }
        
        // Insert between current and next
        nextLowestHash[seedHash] = next;
        nextLowestHash[current] = seedHash;
    }

    return newLowestPriceHash;
  }

  function findLowestPricedToken(
    mapping(uint256 => uint256) storage nextLowestHash,
    mapping(uint256 => uint256) storage seedHashPrice,
    mapping(uint256 => address) storage seedHashOwner,
    mapping(uint256 => MintInfo) storage seedHashMintInfo,
    uint256 lowestPriceHash
  ) public view returns (uint256, address, uint256) {
    // Start with the lowest price hash
    uint256 seedHash = lowestPriceHash;
    
    // Loop through the list until we find a valid token
    while (seedHash != 0) {
        // Check if this token is valid (exists and is for sale)
        if (seedHashPrice[seedHash] > 0 && seedHashOwner[seedHash] != address(0)) {
            // Check if it hasn't been revealed yet
            MintInfo memory mintInfo = seedHashMintInfo[seedHash];
            if (mintInfo.quantity != 0 && mintInfo.key != bytes32("fulfilled")) {
                // Found a valid token
                return (seedHash, seedHashOwner[seedHash], seedHashPrice[seedHash]);
            }
        }
        
        // Move to the next token in the list
        seedHash = nextLowestHash[seedHash];
    }
    
    // If we've gone through the entire list without finding a valid token
    revert NotListed();
  }

  function processPurchase(
    uint256 seedHash,
    address seller,
    uint256 price,
    PayoutConfig storage payoutConfig,
    mapping(uint256 => uint256) storage nextLowestHash,
    mapping(uint256 => uint256) storage seedHashPrice,
    mapping(uint256 => address) storage seedHashOwner,
    uint256 lowestPriceHash
  ) public returns (uint256) {
    // Update token state
    seedHashPrice[seedHash] = 0;
    seedHashOwner[seedHash] = _msgSender();
    
    // Update the lowest price hash if needed
    uint256 newLowestPriceHash = lowestPriceHash;
    if (seedHash == lowestPriceHash) {
        // If we're buying the lowest priced token, the new lowest is the next one
        newLowestPriceHash = nextLowestHash[seedHash];
    }
    
    // Handle payments
    uint256 platformFee = (price * payoutConfig.platformBps) / 10000;
    uint256 sellerAmount = price - platformFee;
    
    // Pay platform fee
    _payPlatform(platformFee);
    
    // Pay seller
    (bool success, ) = payable(seller).call{value: sellerAmount}("");
    if (!success) {
        revert TransferFailed();
    }
    
    return newLowestPriceHash;
  }

  function getAvailableUnrevealedTokens(
    uint256 count,
    mapping(uint256 => uint256) storage nextLowestHash,
    mapping(uint256 => uint256) storage seedHashPrice,
    mapping(uint256 => address) storage seedHashOwner,
    mapping(uint256 => MintInfo) storage seedHashMintInfo,
    uint256 lowestPriceHash
  ) public view returns (uint256[] memory tokenHashes, uint256[] memory prices, address[] memory sellers) {
    // Initialize arrays to store results with maximum size of count
    tokenHashes = new uint256[](count);
    prices = new uint256[](count);
    sellers = new address[](count);
    
    uint256 foundCount = 0;
    uint256 currentHash = lowestPriceHash;
    
    // Traverse the linked list to find valid tokens
    while (currentHash != 0 && foundCount < count) {
        // Check if this token is valid (exists, is for sale, and not revealed)
        if (seedHashPrice[currentHash] > 0 && seedHashOwner[currentHash] != address(0)) {
            MintInfo memory mintInfo = seedHashMintInfo[currentHash];
            if (mintInfo.quantity != 0 && mintInfo.key != bytes32("fulfilled")) {
                // Found a valid token
                tokenHashes[foundCount] = currentHash;
                prices[foundCount] = seedHashPrice[currentHash];
                sellers[foundCount] = seedHashOwner[currentHash];
                foundCount++;
            }
        }
        
        // Move to the next token in the list
        currentHash = nextLowestHash[currentHash];
    }
    
    // If we found fewer tokens than requested, resize the arrays
    if (foundCount < count) {
        // Create new arrays of the correct size
        uint256[] memory resizedTokenHashes = new uint256[](foundCount);
        uint256[] memory resizedPrices = new uint256[](foundCount);
        address[] memory resizedSellers = new address[](foundCount);
        
        // Copy data to the resized arrays
        for (uint256 i = 0; i < foundCount; i++) {
            resizedTokenHashes[i] = tokenHashes[i];
            resizedPrices[i] = prices[i];
            resizedSellers[i] = sellers[i];
        }
        
        // Return the resized arrays
        return (resizedTokenHashes, resizedPrices, resizedSellers);
    }
    
    return (tokenHashes, prices, sellers);
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

  function validateAffiliate(
    address affiliate,
    bytes calldata signature,
    address affiliateSigner
  ) public view {
    bytes32 signedMessagehash = ECDSA.toEthSignedMessageHash(
      keccak256(abi.encodePacked(affiliate))
    );
    address signer = ECDSA.recover(signedMessagehash, signature);

    if (signer != affiliateSigner) {
      revert InvalidSignature();
    }
  }

  function validateFulfillment(
    uint256 seed,
    bytes calldata signature,
    address fulfillmentSigner
  ) public view {
    bytes32 signedMessageHash = ECDSA.toEthSignedMessageHash(keccak256(abi.encodePacked(seed)));
    address signer = ECDSA.recover(signedMessageHash, signature);

    if (signer != fulfillmentSigner) {
      revert InvalidSignature();
    }
  }

  function verify(
    Auth calldata auth,
    address tokenAddress,
    address account
  ) public pure returns (bool) {
    // keys 0-255 and tokenAddress are public
    if (uint256(auth.key) <= 0xff || auth.key == keccak256(abi.encodePacked(tokenAddress))) {
      return true;
    }

    return MerkleProofLib.verify(auth.proof, auth.key, keccak256(abi.encodePacked(account)));
  }

  function getRandomTokenIds(
    uint16[] storage tokenPool,
    uint16[] memory tokenIdsExcluded,
    uint256 quantity,
    uint256 seed
  ) public returns (uint16[] memory) {
    uint16[] memory tokenIds = new uint16[](quantity);

    uint256 retries = 0;
    uint256 MAX_RETRIES = 10;

    uint256 i = 0;
    while (i < quantity) {
      if (tokenPool.length == 0) {
        revert MaxSupplyExceeded();
      }

      uint256 rand = uint256(keccak256(abi.encode(seed, i)));
      uint256 randIdx = rand % tokenPool.length;
      uint16 selectedToken = tokenPool[randIdx];

      if (
        retries < MAX_RETRIES &&
        tokenIdsExcluded.length > 0 &&
        isExcluded(selectedToken, tokenIdsExcluded)
      ) {
        // If the token is excluded, retry for this position in tokenIds array
        // If after 10 retries it still hasn't found a non-excluded token, use whatever token is selected even if it's excluded.
        seed = rand; // Update the seed for the next iteration
        retries++;
        continue;
      }

      tokenIds[i] = selectedToken;

      // remove token from pool
      tokenPool[randIdx] = tokenPool[tokenPool.length - 1];
      tokenPool.pop();

      retries = 0;
      i++;
    }

    return tokenIds;
  }

  function isExcluded(uint16 tokenId, uint16[] memory excludedList) internal pure returns (bool) {
    for (uint256 i = 0; i < excludedList.length; i++) {
      if (tokenId == excludedList[i]) {
        return true;
      }
    }
    return false;
  }

  function _msgSender() internal view returns (address) {
    return msg.sender == BATCH ? tx.origin : msg.sender;
  }
}
