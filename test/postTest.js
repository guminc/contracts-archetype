let fs = require("fs");
let path = require("path");

const erc721aContractPath = path.resolve(
  __dirname,
  "../contracts/ERC721a/ArchetypeLogicErc721a.sol"
);
const erc721aBackupFilePath = path.resolve(
  __dirname,
  "../contracts/ERC721a/ArchetypeLogicErc721a.sol.bak"
);
fs.writeFileSync(erc721aContractPath, fs.readFileSync(erc721aBackupFilePath, "utf8"));
fs.unlinkSync(erc721aBackupFilePath);

const erc1155RandomContractPath = path.resolve(
  __dirname,
  "../contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol"
);
const erc1155RandomBackupFilePath = path.resolve(
  __dirname,
  "../contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol.bak"
);
fs.writeFileSync(erc1155RandomContractPath, fs.readFileSync(
  erc1155RandomBackupFilePath,
  "utf8"
));
fs.unlinkSync(erc1155RandomBackupFilePath);

const erc1155ContractPath = path.resolve(
  __dirname,
  "../contracts/ERC1155/ArchetypeLogicErc1155.sol"
);
const erc1155BackupFilePath = path.resolve(
  __dirname,
  "../contracts/ERC1155/ArchetypeLogicErc1155.sol.bak"
);
fs.writeFileSync(erc1155ContractPath, fs.readFileSync(
  erc1155BackupFilePath,
  "utf8"
));
fs.unlinkSync(erc1155BackupFilePath);

const brg404ContractPath = path.resolve(
  __dirname,
  "../contracts/BURGERS404/ArchetypeLogicBurgers404.sol"
);
const brg404BackupFilePath = path.resolve(
  __dirname,
  "../contracts/BURGERS404/ArchetypeLogicBurgers404.sol.bak"
);
fs.writeFileSync(brg404ContractPath, fs.readFileSync(brg404BackupFilePath, "utf8"));
fs.unlinkSync(brg404BackupFilePath);
