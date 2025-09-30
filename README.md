
# Universal Swapper

Universal Swapper is a smart contract and script toolkit for performing gassless swaps on Ethereum and compatible chains using Uniswap's Universal Router and Permit2. It enables gas-efficient, permissioned swaps with batch permit support, fee handling, and flexible architecture for backend or user-driven execution.

## Features
- **Universal Router Integration**: Swap any ERC20 tokens using Uniswap's Universal Router.
- **Permit2 Support**: Gasless token approvals and batch permit transfers.
- **Fee Handling**: Pay a portion of swapped tokens as a fee to a recipient.
- **Backend or User Execution**: Supports both backend and user-initiated swaps.
- **TypeScript Scripts**: Easily interact with contracts using provided scripts.

## Architecture
- **Solidity Contracts**: Main contract is [`src/UniversalSwapper.sol`](src/UniversalSwapper.sol), deployed via [`script/DeployUniversalSwapper.s.sol`](script/DeployUniversalSwapper.s.sol).
- **Node Scripts**: TypeScript scripts in [`node-scripts/src/`](node-scripts/src/) for swap execution, gas fee calculation, and balance checks.


## Requirements
- [Foundry](https://book.getfoundry.sh/) (for Solidity development)
- Node.js & npm (or pnpm)


## Getting Started
1. **Install contract dependencies**
	```bash
	forge soldeer install
	```
2. **Install Node.js dependencies**
	```bash
	cd node-scripts && npm install
	```
3. **Configure environment**
	- Copy `.env.example` to `.env` and add your private keys and RPC URL.
	- Copy `node-scripts/src/constants.example.ts` to `constants.ts` and set your addresses and keys.
4. **Start Anvil (local node)**
	```bash
	anvil --fork-url https://ethereum-rpc.publicnode.com 
	```
5. **Deploy UniversalSwapper contract**
	```bash
	source .env && forge script script/DeployUniversalSwapper.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
	```
6. **Run a swap (USDC to WETH example)**
	```bash
	tsx node-scripts/src/universal-swap.ts
	# or
	ts-node node-scripts/src/universal-swap.ts
	```

## Notes
- Ensure your account has sufficient funds before swapping.
- Addresses are set for Ethereum mainnet; forked chains should fork mainnet.
- For custom swaps, modify the parameters in `node-scripts/src/universal-swap.ts`.

## File Overview
- `src/UniversalSwapper.sol`: Main contract logic
- `script/DeployUniversalSwapper.s.sol`: Deployment script
- `node-scripts/src/universal-swap.ts`: Swap execution script
- `node-scripts/src/gasFeeCalculator.ts`: Gas fee calculation
- `node-scripts/types/`: Typechain contract types

## License
MIT