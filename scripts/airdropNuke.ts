import { ethers, run } from "hardhat";
import { NUKE } from "../typechain-types";
import { BaseContract } from "ethers";
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

function asContractType<T extends BaseContract>(contract: any): T {
  return contract as T;
}

async function processCSV(filePath: string): Promise<[string[], bigint[]]> {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsedData = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true
  });

  const addresses: string[] = [];
  const quantities: bigint[] = [];

  for (const row of parsedData.data) {
    const address = row.owner_of;
    const count = BigInt(row.count);
    const quantity = count * BigInt(100) * BigInt(10)**BigInt(18);
    addresses.push(address);
    quantities.push(quantity);
  }

  return [addresses, quantities];
}

function splitIntoChunks<T>(array: T[], numChunks: number): T[][] {
  const chunks: T[][] = [];
  const chunkSize = Math.ceil(array.length / numChunks);
  
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  
  return chunks;
}

async function executeNukeTransaction(
  nuke: NUKE, 
  addresses: string[], 
  quantities: bigint[], 
  batchNumber: number
) {
  console.log(`\nExecuting batch ${batchNumber + 1}:`);
  console.log("Addresses:", addresses);
  console.log("Quantities:", quantities.map(q => q.toString()));

  const tx = await nuke.nuke(addresses, quantities);
  console.log(`Batch ${batchNumber + 1} transaction hash:`, tx.hash);
  
  const receipt = await tx.wait();
  console.log(`Batch ${batchNumber + 1} confirmed in block:`, receipt.blockNumber);
}

async function main() {
  try {
    const NUM_BATCHES = 1; // Can be changed to any number
    const DELAY_BETWEEN_BATCHES = 1000; // 1 seconds

    const csvPath = path.join(__dirname, './pixelady_owners.csv');
    const [addresses, quantities] = await processCSV(csvPath);

    // Split into batches
    const addressBatches = splitIntoChunks(addresses, NUM_BATCHES);
    const quantityBatches = splitIntoChunks(quantities, NUM_BATCHES);

    const NUKE = await ethers.getContractFactory("NUKE");
    const nuke = asContractType<NUKE>(
      NUKE.attach("0xcD4984FDfff87618D78922E4Bd266056C64Fe504")
    );

    console.log("Contract NUKE is:", await nuke.getAddress());
    console.log(`Splitting into ${NUM_BATCHES} batches...`);

    // Execute batches sequentially
    for (let i = 0; i < NUM_BATCHES; i++) {
      if (addressBatches[i].length > 0) {
        if (i > 0) {
          console.log(`\nWaiting ${DELAY_BETWEEN_BATCHES/1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
        
        await executeNukeTransaction(nuke, addressBatches[i], quantityBatches[i], i);
      }
    }

    console.log("\nAll batches completed successfully!");

  } catch (error) {
    console.error("\nError occurred:", error);
    process.exit(1); // Ensure script stops on error
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });