export const RPC_URL = "http://localhost:8545";

export const PRIVATE_KEY = "0xYOUR_PK";
export const ALICE_KEY = "0xYOUR_PK";

export const ALICE_ADDRESS = "0xYOUR_ADDRESS";
export const SERVER_ADDRESS = "0xYOUR_ADDRESS";

export const PUBLICNODE_RPC_URL = "https://ethereum-rpc.publicnode.com";
export const ALCHEMY_RPC_URL =
    "https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY";
export const INFURA_RPC_URL = "https://mainnet.infura.io/v3/YOUR_API_KEY";

export const FEE_BIPS = BigInt(25); // 0.25%
export const SWAP_FEE_RECIPIENT = "0xYOUR_ADDRESS";
export const GAS_FEE_RECIPIENT = "0xYOUR_ADDRESS";

// Addresses we'll need
export const UNIVERSAL_ROUTER_ADDRESS =
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af"; // Universal Router v2
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC
export const tokens = {
    USDC: USDC_ADDRESS,
    WETH: WETH_ADDRESS,
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    TETHER: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    FLUID: "0x6f40d4a6237c257fff2db00fa0510deeecd303eb",
};

// We'll need to the pool fee for our path. This is 0.05%.
export const UNIV3_WETH_USDC_POOL_FEE = BigInt(500);

export const USDC_AMOUNT_IN = BigInt(100e6);
export const WETH_AMOUNT_IN = BigInt(1e18);

// See https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol
export const PERMIT2_PERMIT_COMMAND = 0x0a;
export const SWAP_EXACT_INPUT_COMMAND = 0x00;
export const PERMIT2_TRANSFER_FROM_COMMAND = 0x02;
export const SWEEP_COMMAND = 0x04;
export const PAY_PORTION_COMMAND = 0x06;

// This is a special value that tells the router to use the contract's total balance
// of a given token.
// https://github.com/Uniswap/universal-router/blob/1cde151b29f101cb06c0db4a2afededa864307b3/contracts/libraries/Constants.sol#L9-L11
export const CONTRACT_BALANCE_SPECIAL_VALUE =
    BigInt(0x8000000000000000000000000000000000000000000000000000000000000000);

// For a real use case this should be an accurate minimum
// You can get this from Uniswap's quoter, a TWAP, another oracle, etc.
export const MINIMUM_OUT = 0;

// Assume we're using a forked network (e.g. anvil --fork-url ... )
