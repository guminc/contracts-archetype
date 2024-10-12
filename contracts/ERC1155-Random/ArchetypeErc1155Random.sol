// SPDX-License-Identifier: MIT
// Archetype v0.8.0 - ERC1155-Random
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

import "./ArchetypeLogicErc1155Random.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "solady/src/utils/LibString.sol";

contract ArchetypeErc1155Random is Initializable, ERC1155Upgradeable, OwnableUpgradeable, ERC2981Upgradeable {
  //
  // EVENTS
  //
  event Invited(bytes32 indexed key, bytes32 indexed cid);
  event Referral(address indexed affiliate, address token, uint128 wad, uint256 numMints);
  event Withdrawal(address indexed src, address token, uint128 wad);
  event RequestRandomness(uint256 indexed seedHash);
  event FulfillRandomness(uint256 indexed seedHash, uint256 seed, uint256 combinedSeed);

  //
  // VARIABLES
  //
  mapping(bytes32 => AdvancedInvite) public invites;
  mapping(address => mapping(bytes32 => uint256)) private _minted;
  mapping(bytes32 => uint256) private _listSupply;
  mapping(address => uint128) private _ownerBalance;
  mapping(address => mapping(address => uint128)) private _affiliateBalance;

  uint256 public totalSupply;

  Config public config;
  PayoutConfig public payoutConfig;
  Options public options;

  string public name;
  string public symbol;

  mapping(uint256 => MintInfo) public seedHashMintInfo;
  bytes32 private constant FULFILLED_KEY = bytes32("fulfilled");

  //
  // METHODS
  //
  function initialize(
    string memory _name,
    string memory _symbol,
    Config calldata config_,
    PayoutConfig calldata payoutConfig_,
    address _receiver
  ) external initializer {
    name = _name;
    symbol = _symbol;
    __ERC1155_init("");

    // check max bps not reached and min platform fee.
    if (
      config_.affiliateFee > MAXBPS ||
      config_.discounts.affiliateDiscount > MAXBPS ||
      config_.affiliateSigner == address(0) ||
      config_.fulfillmentSigner == address(0) ||
      config_.maxBatchSize == 0
    ) {
      revert InvalidConfig();
    }
    // ensure mint tiers are correctly ordered from highest to lowest.
    for (uint256 i = 1; i < config_.discounts.mintTiers.length; i++) {
      if (
        config_.discounts.mintTiers[i].mintDiscount > MAXBPS ||
        config_.discounts.mintTiers[i].numMints > config_.discounts.mintTiers[i - 1].numMints
      ) {
        revert InvalidConfig();
      }
    }
    config = config_;
    __Ownable_init();

    uint256 totalShares = payoutConfig_.ownerBps +
      payoutConfig_.platformBps +
      payoutConfig_.partnerBps +
      payoutConfig_.superAffiliateBps;

    if (payoutConfig_.platformBps < 250 || totalShares != 10000) {
      revert InvalidSplitShares();
    }
    payoutConfig = payoutConfig_;
    setDefaultRoyalty(_receiver, config.defaultRoyalty);
  }

  //
  // PUBLIC
  //

  function mint(
    Auth calldata auth,
    uint256 quantity,
    address affiliate,
    bytes calldata signature,
    uint256 seedHash
  ) external payable {
    mintTo(auth, quantity, _msgSender(), affiliate, signature, seedHash);
  }

  function mintTo(
    Auth calldata auth,
    uint256 quantity,
    address to,
    address affiliate,
    bytes calldata signature,
    uint256 seedHash
  ) public payable {
    {
      if (to == address(0)) {
        revert MintToZeroAddress();
      }

      MintInfo memory mintInfo = seedHashMintInfo[seedHash];
      if (mintInfo.quantity != 0 || mintInfo.key == FULFILLED_KEY) {
        revert SeedHashAlreadyExists();
      }
    }

    AdvancedInvite storage i = invites[auth.key];

    if (i.unitSize > 1) {
      quantity = quantity * i.unitSize;
    }

    ValidationArgs memory args = ValidationArgs({
      owner: owner(),
      affiliate: affiliate,
      quantity: quantity,
      curSupply: totalSupply,
      listSupply: _listSupply[auth.key]
    });

    uint128 cost = uint128(
      ArchetypeLogicErc1155Random.computePrice(
        i,
        config.discounts,
        args.quantity,
        args.listSupply,
        args.affiliate != address(0)
      )
    );

    ArchetypeLogicErc1155Random.validateMint(i, config, auth, _minted, _listSupply, signature, args, cost);

    seedHashMintInfo[seedHash] = MintInfo({
      key: auth.key,
      to: to,
      quantity: quantity,
      blockNumber: block.number
    });
    emit RequestRandomness(seedHash);

    totalSupply += quantity;
    if (i.limit < i.maxSupply) {
      _minted[_msgSender()][auth.key] += quantity;
    }
    if (i.maxSupply < 2**32 - 1) {
      _listSupply[auth.key] += quantity;
    }

    ArchetypeLogicErc1155Random.updateBalances(
      i,
      config,
      _ownerBalance,
      _affiliateBalance,
      affiliate,
      quantity,
      cost
    );

    if (msg.value > cost) {
      _refund(_msgSender(), msg.value - cost);
    }
  }

  function uri(uint256 tokenId) public view override returns (string memory) {
    return
      bytes(config.baseUri).length != 0
        ? string(abi.encodePacked(config.baseUri, LibString.toString(tokenId)))
        : "";
  }

  function withdraw() external {
    address[] memory tokens = new address[](1);
    tokens[0] = address(0);
    withdrawTokens(tokens);
  }

  function withdrawTokens(address[] memory tokens) public {
    ArchetypeLogicErc1155Random.withdrawTokens(payoutConfig, _ownerBalance, owner(), tokens);
  }

  function withdrawAffiliate() external {
    address[] memory tokens = new address[](1);
    tokens[0] = address(0);
    withdrawTokensAffiliate(tokens);
  }

  function withdrawTokensAffiliate(address[] memory tokens) public {
    ArchetypeLogicErc1155Random.withdrawTokensAffiliate(_affiliateBalance, tokens);
  }

  function ownerBalance() external view returns (uint128) {
    return _ownerBalance[address(0)];
  }

  function ownerBalanceToken(address token) external view returns (uint128) {
    return _ownerBalance[token];
  }

  function affiliateBalance(address affiliate) external view returns (uint128) {
    return _affiliateBalance[affiliate][address(0)];
  }

  function affiliateBalanceToken(address affiliate, address token) external view returns (uint128) {
    return _affiliateBalance[affiliate][token];
  }

  function minted(address minter, bytes32 key) external view returns (uint256) {
    return _minted[minter][key];
  }

  function listSupply(bytes32 key) external view returns (uint256) {
    return _listSupply[key];
  }

  function platform() external pure returns (address) {
    return PLATFORM;
  }

  function tokenPool() external view returns (uint16[] memory) {
    return config.tokenPool;
  }

  function computePrice(
    bytes32 key,
    uint256 quantity,
    bool affiliateUsed
  ) external view returns (uint256) {
    AdvancedInvite storage i = invites[key];
    uint256 listSupply_ = _listSupply[key];
    return ArchetypeLogicErc1155Random.computePrice(i, config.discounts, quantity, listSupply_, affiliateUsed);
  }

  //
  // OWNER ONLY
  //

  function airdropTo(
    address[] calldata toList,
    uint256[] calldata quantityList,
    uint256[] calldata tokenIdList
  ) external _onlyOwner {
    if (options.airdropLocked) {
      revert LockedForever();
    }

    if (quantityList.length != toList.length || quantityList.length != tokenIdList.length) {
      revert InvalidConfig();
    }

    uint256 quantity = 0;
    for (uint256 i = 0; i < toList.length; i++) {
      bytes memory _data;
      _mint(toList[i], tokenIdList[i], quantityList[i], _data);
      quantity += quantityList[i];
    }

    if ((totalSupply + quantity) > config.maxSupply) {
      revert MaxSupplyExceeded();
    }
    totalSupply += quantity;
  }

  /// @notice the password is "forever"
  function lockAirdrop(string memory password) external _onlyOwner {
    _checkPassword(password);
    options.airdropLocked = true;
  }

  function setBaseURI(string memory baseUri) external _onlyOwner {
    if (options.uriLocked) {
      revert LockedForever();
    }

    config.baseUri = baseUri;
  }

  /// @notice the password is "forever"
  function lockURI(string memory password) external _onlyOwner {
    _checkPassword(password);
    options.uriLocked = true;
  }

  /// @notice the password is "forever"
  // token pool will be appended. Be careful changing.
  function appendTokenPool(uint16[] memory newTokens, string memory password) public _onlyOwner {
    _checkPassword(password);
    if (options.tokenPoolLocked) {
      revert LockedForever();
    }

    for (uint256 i = 0; i < newTokens.length; i++) {
      config.tokenPool.push(newTokens[i]);
    }
  }

  /// @notice the password is "forever"
  // token pool will be completely replaced. Be careful changing.
  function replaceTokenPool(uint16[] memory newTokens, string memory password) external _onlyOwner {
    _checkPassword(password);
    if (options.tokenPoolLocked) {
      revert LockedForever();
    }

    config.tokenPool = newTokens;
  }

  /// @notice the password is "forever"
  function lockTokenPool(string memory password) external _onlyOwner {
    _checkPassword(password);
    options.tokenPoolLocked = true;
  }

  /// @notice the password is "forever"
  // max supply cannot subceed total supply. Be careful changing.
  function setMaxSupply(uint32 maxSupply, string memory password) external _onlyOwner {
    _checkPassword(password);
    if (options.maxSupplyLocked) {
      revert LockedForever();
    }

    if (maxSupply < totalSupply) {
      revert MaxSupplyExceeded();
    }

    config.maxSupply = maxSupply;
  }

  /// @notice the password is "forever"
  function lockMaxSupply(string memory password) external _onlyOwner {
    _checkPassword(password);
    options.maxSupplyLocked = true;
  }

  function setAffiliateFee(uint16 affiliateFee) external _onlyOwner {
    if (options.affiliateFeeLocked) {
      revert LockedForever();
    }
    if (affiliateFee > MAXBPS) {
      revert InvalidConfig();
    }

    config.affiliateFee = affiliateFee;
  }

  /// @notice the password is "forever"
  function lockAffiliateFee(string memory password) external _onlyOwner {
    _checkPassword(password);
    options.affiliateFeeLocked = true;
  }

  function setDiscounts(Discount calldata discounts) external _onlyOwner {
    if (options.discountsLocked) {
      revert LockedForever();
    }

    if (discounts.affiliateDiscount > MAXBPS) {
      revert InvalidConfig();
    }

    // ensure mint tiers are correctly ordered from highest to lowest.
    for (uint256 i = 1; i < discounts.mintTiers.length; i++) {
      if (
        discounts.mintTiers[i].mintDiscount > MAXBPS ||
        discounts.mintTiers[i].numMints > discounts.mintTiers[i - 1].numMints
      ) {
        revert InvalidConfig();
      }
    }

    config.discounts = discounts;
  }

  /// @notice the password is "forever"
  function lockDiscounts(string memory password) external _onlyOwner {
    _checkPassword(password);
    options.discountsLocked = true;
  }

  function setOwnerAltPayout(address ownerAltPayout) external _onlyOwner {
    if (options.ownerAltPayoutLocked) {
      revert LockedForever();
    }

    payoutConfig.ownerAltPayout = ownerAltPayout;
  }

  function lockOwnerAltPayout() external _onlyOwner {
    options.ownerAltPayoutLocked = true;
  }

  function setMaxBatchSize(uint16 maxBatchSize) external _onlyOwner {
    config.maxBatchSize = maxBatchSize;
  }

  function setInvite(
    bytes32 _key,
    bytes32 _cid,
    Invite calldata _invite
  ) external _onlyOwner {
    setAdvancedInvite(_key, _cid, AdvancedInvite({
      price: _invite.price,
      reservePrice: _invite.price,
      delta: 0,
      start: _invite.start,
      end: _invite.end,
      limit: _invite.limit,
      maxSupply: _invite.maxSupply,
      interval: 0,
      unitSize: _invite.unitSize,
      tokenAddress: _invite.tokenAddress,
      tokenIdsExcluded: _invite.tokenIdsExcluded
    }));
  }

  function setAdvancedInvite(
    bytes32 _key,
    bytes32 _cid,
    AdvancedInvite memory _AdvancedInvite
  ) public _onlyOwner {
    // approve token for withdrawals if erc20 list
    if (_AdvancedInvite.tokenAddress != address(0)) {
      bool success = IERC20(_AdvancedInvite.tokenAddress).approve(PAYOUTS, 2**256 - 1);
      if (!success) {
        revert NotApprovedToTransfer();
      }
    }
    if (_AdvancedInvite.start < block.timestamp) {
      _AdvancedInvite.start = uint32(block.timestamp);
    }
    invites[_key] = _AdvancedInvite;
    emit Invited(_key, _cid);
  }

  function setFulfillmentSigner(address _fulfillmentSigner) external onlyOwner {
    if (_fulfillmentSigner == address(0)) {
      revert InvalidConfig();
    }
    config.fulfillmentSigner = _fulfillmentSigner;
  }

  //
  // FULFILL MINT
  //

  function fulfillRandomMint(uint256 seed, bytes memory signature) external {
    uint256 seedHash = uint256(keccak256(abi.encodePacked(seed)));

    ArchetypeLogicErc1155Random.validateFulfillment(seed, signature, config.fulfillmentSigner);

    MintInfo memory mintInfo = seedHashMintInfo[seedHash];
    if (mintInfo.quantity == 0) {
      revert InvalidSeed();
    }

    uint256 combinedSeed = uint256(keccak256(abi.encodePacked(seed, mintInfo.blockNumber)));

    uint16[] memory tokenIds;
    tokenIds = ArchetypeLogicErc1155Random.getRandomTokenIds(
      config.tokenPool,
      invites[mintInfo.key].tokenIdsExcluded,
      mintInfo.quantity,
      combinedSeed
    );

    for (uint256 j = 0; j < tokenIds.length; j++) {
      bytes memory _data;
      _mint(mintInfo.to, tokenIds[j], 1, _data);
    }

    emit FulfillRandomness(seedHash, seed, combinedSeed);
    seedHashMintInfo[seedHash].quantity = 0;
    seedHashMintInfo[seedHash].key = FULFILLED_KEY;
  }

  //
  // INTERNAL
  //
  function _startTokenId() internal view virtual returns (uint256) {
    return 1;
  }

  function _msgSender() internal view override returns (address) {
    return msg.sender == BATCH ? tx.origin : msg.sender;
  }

  function _checkPassword(string memory password) internal pure {
    if (keccak256(abi.encodePacked(password)) != keccak256(abi.encodePacked("forever"))) {
      revert WrongPassword();
    }
  }

  function _isOwner() internal view {
    if (_msgSender() != owner()) {
      revert NotOwner();
    }
  }

  modifier _onlyPlatform() {
    if (_msgSender() != PLATFORM) {
      revert NotPlatform();
    }
    _;
  }

  modifier _onlyOwner() {
    _isOwner();
    _;
  }

  function _refund(address to, uint256 refund) internal {
    (bool success, ) = payable(to).call{ value: refund }("");
    if (!success) {
      revert TransferFailed();
    }
  }

  //ERC2981 ROYALTY
  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(ERC1155Upgradeable, ERC2981Upgradeable)
    returns (bool)
  {
    // Supports the following `interfaceId`s:
    // - IERC165: 0x01ffc9a7
    // - IERC721: 0x80ac58cd
    // - IERC721Metadata: 0x5b5e139f
    // - IERC2981: 0x2a55205a
    return
      ERC1155Upgradeable.supportsInterface(interfaceId) ||
      ERC2981Upgradeable.supportsInterface(interfaceId);
  }

  function setDefaultRoyalty(address receiver, uint16 feeNumerator) public _onlyOwner {
    config.defaultRoyalty = feeNumerator;
    _setDefaultRoyalty(receiver, feeNumerator);
  }
}
