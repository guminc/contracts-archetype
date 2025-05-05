const fs = require("fs");
const path = require("path");

async function replaceConstants(filePath) {
  let data = fs.readFileSync(filePath, "utf8");

  // Replace mainnet constants with test values
  data = data.replace(
    "0x8952caF7E5bf1fe63ebe94148ca802F3eF127C98",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
  );
  data = data.replace(
    "0xEa49e7bE310716dA66725c84a5127d2F6A202eAf",
    "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  );
  data = data.replace(
    "0xaAfdfA4a935d8511bF285af11A0544ce7e4a1199",
    "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
  );

  // Write the updated data to the contract file
  fs.writeFileSync(filePath, data, "utf8");
}

const erc721aContractPath = path.resolve(
  __dirname,
  "../contracts/ERC721a/ArchetypeLogicErc721a.sol"
);
const originalErc721aFile = fs.readFileSync(erc721aContractPath, "utf8");
fs.writeFileSync(
  "./contracts/ERC721a/ArchetypeLogicErc721a.sol.bak",
  originalErc721aFile
);
replaceConstants(erc721aContractPath);

const erc1155RandomContractPath = path.resolve(
  __dirname,
  "../contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol"
);
const originalErc1155RandomFile = fs.readFileSync(erc1155RandomContractPath, "utf8");
fs.writeFileSync(
  "./contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol.bak",
  originalErc1155RandomFile
);
replaceConstants(erc1155RandomContractPath);

const erc1155ContractPath = path.resolve(
  __dirname,
  "../contracts/ERC1155/ArchetypeLogicErc1155.sol"
);
const originalErc1155File = fs.readFileSync(erc1155ContractPath, "utf8");
fs.writeFileSync(
  "./contracts/ERC1155/ArchetypeLogicErc1155.sol.bak",
  originalErc1155File
);
replaceConstants(erc1155ContractPath);

const brg404RandomContractPath = path.resolve(
  __dirname,
  "../contracts/BURGERS404/ArchetypeLogicBurgers404.sol"
);
const originalBurgers404File = fs.readFileSync(
  brg404RandomContractPath,
  "utf8"
);
fs.writeFileSync(
  "./contracts/BURGERS404/ArchetypeLogicBurgers404.sol.bak",
  originalBurgers404File
);
replaceConstants(brg404RandomContractPath);


const marketplaceContractPath = path.resolve(
  __dirname,
  "../contracts/ArchetypeMarketplace.sol"
);
const originalMarketplaceFile = fs.readFileSync(
  marketplaceContractPath,
  "utf8"
);
fs.writeFileSync(
  "./contracts/ArchetypeMarketplace.sol.bak",
  originalMarketplaceFile
);
replaceConstants(marketplaceContractPath);