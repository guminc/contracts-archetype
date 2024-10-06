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
const erc721aBackupFile = fs.readFileSync(erc721aBackupFilePath, "utf8");
fs.writeFileSync(erc721aContractPath, erc721aBackupFile);
fs.unlinkSync(erc721aBackupFilePath);

const erc1155RandomContractPath = path.resolve(
  __dirname,
  "../contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol"
);
const erc1155RandomBackupFilePath = path.resolve(
  __dirname,
  "../contracts/ERC1155-Random/ArchetypeLogicErc1155Random.sol.bak"
);
const erc1155RandomBackupFile = fs.readFileSync(
  erc1155RandomBackupFilePath,
  "utf8"
);
fs.writeFileSync(erc1155RandomContractPath, erc1155RandomBackupFile);
fs.unlinkSync(erc1155RandomBackupFilePath);

const brg404ContractPath = path.resolve(
  __dirname,
  "../contracts/BRG404/ArchetypeLogicBrg404.sol"
);
const brg404BackupFilePath = path.resolve(
  __dirname,
  "../contracts/BRG404/ArchetypeLogicBrg404.sol.bak"
);
const brg404BackupFile = fs.readFileSync(brg404BackupFilePath, "utf8");
fs.writeFileSync(brg404ContractPath, brg404BackupFile);
fs.unlinkSync(brg404BackupFilePath);
