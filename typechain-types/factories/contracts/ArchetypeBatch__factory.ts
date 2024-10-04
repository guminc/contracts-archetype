/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  Contract,
  ContractFactory,
  ContractTransactionResponse,
  Interface,
} from "ethers";
import type { Signer, ContractDeployTransaction, ContractRunner } from "ethers";
import type { NonPayableOverrides } from "../../common";
import type {
  ArchetypeBatch,
  ArchetypeBatchInterface,
} from "../../contracts/ArchetypeBatch";

const _abi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "targets",
        type: "address[]",
      },
      {
        internalType: "uint256[]",
        name: "values",
        type: "uint256[]",
      },
      {
        internalType: "bytes[]",
        name: "datas",
        type: "bytes[]",
      },
    ],
    name: "executeBatch",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address",
      },
      {
        internalType: "uint256[]",
        name: "ids",
        type: "uint256[]",
      },
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
    ],
    name: "rescueERC1155",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
    ],
    name: "rescueERC20",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address",
      },
      {
        internalType: "uint256[]",
        name: "ids",
        type: "uint256[]",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
    ],
    name: "rescueERC721",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
    ],
    name: "rescueETH",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const _bytecode =
  "0x608060405234801561001057600080fd5b5061001a3361001f565b61006f565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b610ae28061007e6000396000f3fe60806040526004361061007b5760003560e01c8063715018a61161004e578063715018a6146100f55780638da5cb5b1461010a578063b7ce33a214610136578063f2fde38b1461015657600080fd5b806304824e701461008057806326e2dca2146100a257806347e1da2a146100c25780635d799f87146100d5575b600080fd5b34801561008c57600080fd5b506100a061009b36600461075c565b610176565b005b3480156100ae57600080fd5b506100a06100bd3660046107ca565b6101d2565b6100a06100d036600461082f565b610291565b3480156100e157600080fd5b506100a06100f03660046108c9565b610417565b34801561010157600080fd5b506100a0610522565b34801561011657600080fd5b50600054604080516001600160a01b039092168252519081900360200190f35b34801561014257600080fd5b506100a06101513660046108fc565b610536565b34801561016257600080fd5b506100a061017136600461075c565b61061d565b61017e610696565b6040516001600160a01b038216904790600081818185875af1925050503d80600081146101c7576040519150601f19603f3d011682016040523d82523d6000602084013e6101cc565b606091505b50505050565b6101da610696565b60005b8281101561028a57846001600160a01b03166323b872dd30848787868181106102085761020861098c565b6040516001600160e01b031960e088901b1681526001600160a01b03958616600482015294909316602485015250602090910201356044820152606401600060405180830381600087803b15801561025f57600080fd5b505af1158015610273573d6000803e3d6000fd5b505050508080610282906109a2565b9150506101dd565b5050505050565b848314801561029f57508481145b61030c5760405162461bcd60e51b815260206004820152603360248201527f41726368657479706542617463683a20546865206172726179206c656e6774686044820152721cc81b5d5cdd081899481a59195b9d1a58d85b606a1b60648201526084015b60405180910390fd5b60005b8581101561040e5760008088888481811061032c5761032c61098c565b9050602002016020810190610341919061075c565b6001600160a01b031687878581811061035c5761035c61098c565b905060200201358686868181106103755761037561098c565b905060200281019061038791906109c9565b604051610395929190610a10565b60006040518083038185875af1925050503d80600081146103d2576040519150601f19603f3d011682016040523d82523d6000602084013e6103d7565b606091505b5091509150816103fb578060405162461bcd60e51b81526004016103039190610a44565b505080610407906109a2565b905061030f565b50505050505050565b61041f610696565b6040516370a0823160e01b81523060048201526001600160a01b0383169063a9059cbb90839083906370a0823190602401602060405180830381865afa15801561046d573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906104919190610a77565b6040516001600160a01b03909216602483015260448201526064016040516020818303038152906040529060e01b6020820180516001600160e01b0383818316178352505050506040516104e59190610a90565b6000604051808303816000865af19150503d806000811461028a576040519150601f19603f3d011682016040523d82523d6000602084013e61028a565b61052a610696565b61053460006106f0565b565b61053e610696565b60005b8481101561040e57866001600160a01b031663f242432a308489898681811061056c5761056c61098c565b905060200201358888878181106105855761058561098c565b6040516001600160e01b031960e089901b1681526001600160a01b03968716600482015295909416602486015250604484019190915260209091020135606482015260a06084820152600060a482015260c401600060405180830381600087803b1580156105f257600080fd5b505af1158015610606573d6000803e3d6000fd5b505050508080610615906109a2565b915050610541565b610625610696565b6001600160a01b03811661068a5760405162461bcd60e51b815260206004820152602660248201527f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160448201526564647265737360d01b6064820152608401610303565b610693816106f0565b50565b6000546001600160a01b031633146105345760405162461bcd60e51b815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e65726044820152606401610303565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b80356001600160a01b038116811461075757600080fd5b919050565b60006020828403121561076e57600080fd5b61077782610740565b9392505050565b60008083601f84011261079057600080fd5b50813567ffffffffffffffff8111156107a857600080fd5b6020830191508360208260051b85010111156107c357600080fd5b9250929050565b600080600080606085870312156107e057600080fd5b6107e985610740565b9350602085013567ffffffffffffffff81111561080557600080fd5b6108118782880161077e565b9094509250610824905060408601610740565b905092959194509250565b6000806000806000806060878903121561084857600080fd5b863567ffffffffffffffff8082111561086057600080fd5b61086c8a838b0161077e565b9098509650602089013591508082111561088557600080fd5b6108918a838b0161077e565b909650945060408901359150808211156108aa57600080fd5b506108b789828a0161077e565b979a9699509497509295939492505050565b600080604083850312156108dc57600080fd5b6108e583610740565b91506108f360208401610740565b90509250929050565b6000806000806000806080878903121561091557600080fd5b61091e87610740565b9550602087013567ffffffffffffffff8082111561093b57600080fd5b6109478a838b0161077e565b9097509550604089013591508082111561096057600080fd5b5061096d89828a0161077e565b9094509250610980905060608801610740565b90509295509295509295565b634e487b7160e01b600052603260045260246000fd5b6000600182016109c257634e487b7160e01b600052601160045260246000fd5b5060010190565b6000808335601e198436030181126109e057600080fd5b83018035915067ffffffffffffffff8211156109fb57600080fd5b6020019150368190038213156107c357600080fd5b8183823760009101908152919050565b60005b83811015610a3b578181015183820152602001610a23565b50506000910152565b6020815260008251806020840152610a63816040850160208701610a20565b601f01601f19169190910160400192915050565b600060208284031215610a8957600080fd5b5051919050565b60008251610aa2818460208701610a20565b919091019291505056fea26469706673582212201d0f1abd3a06b10c647215333505dacb4a7e44cba9fcd63c7921e6d9f11bf0d464736f6c63430008140033";

type ArchetypeBatchConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: ArchetypeBatchConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class ArchetypeBatch__factory extends ContractFactory {
  constructor(...args: ArchetypeBatchConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override getDeployTransaction(
    overrides?: NonPayableOverrides & { from?: string }
  ): Promise<ContractDeployTransaction> {
    return super.getDeployTransaction(overrides || {});
  }
  override deploy(overrides?: NonPayableOverrides & { from?: string }) {
    return super.deploy(overrides || {}) as Promise<
      ArchetypeBatch & {
        deploymentTransaction(): ContractTransactionResponse;
      }
    >;
  }
  override connect(runner: ContractRunner | null): ArchetypeBatch__factory {
    return super.connect(runner) as ArchetypeBatch__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): ArchetypeBatchInterface {
    return new Interface(_abi) as ArchetypeBatchInterface;
  }
  static connect(
    address: string,
    runner?: ContractRunner | null
  ): ArchetypeBatch {
    return new Contract(address, _abi, runner) as unknown as ArchetypeBatch;
  }
}
