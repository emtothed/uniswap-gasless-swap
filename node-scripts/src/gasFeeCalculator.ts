import { ethers } from "ethers";
import * as Constants from "./constants";
import { abi as universalSwapperAbi } from "../../out/UniversalSwapper.sol/UniversalSwapper.json";
import { receipts as deploymentReceipts } from "../../broadcast/DeployUniversalSwapper.s.sol/1/run-latest.json";
import { getSignatureForBatchPermitTransfer } from "./batchPermitTransferFrom";
import {
    UniversalRouter__factory,
    ERC20__factory,
    WETH__factory,
    Permit2__factory,
} from "../types";
import {
    SignatureTransfer,
    PermitBatchTransferFrom,
    TokenPermissions,
} from "@uniswap/permit2-sdk";
import { checkNonce } from "./batchPermitTransferFrom";
import axios from "axios";

type Token = {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
};

async function getGasEstimate(
    tx: ethers.providers.TransactionRequest,
    RPC_URL?: string
) {
    console.log(
        "\n=========================== Getting gas estimate ==========================="
    );
    const provider = new ethers.providers.JsonRpcProvider(
        RPC_URL || Constants.RPC_URL
    );
    const feeData = await provider.getFeeData();
    const gasEstimate = await provider.estimateGas(tx);
    const gasFeeInWei = gasEstimate.mul(
        ethers.BigNumber.from(feeData.gasPrice)
    );

    console.log("Gas price in wei: ", feeData.gasPrice?.toString());
    console.log("GasUsed estimate: ", gasEstimate.toString());
    const gasFeeInETH = ethers.utils.formatEther(gasFeeInWei);
    console.log("Gas fee in ETH estimate: ", gasFeeInETH);
    return gasFeeInWei;
}

async function getTokenPriceToETH(
    token: Token,
    chainId: string,
    qoutingMethod: "graph" | "onchain"
) {
    console.log(
        "\n=========================== Getting token price ============================"
    );

    if (qoutingMethod === "onchain") {
        const price = await axios.post(
            "http://192.168.1.7:4000/api/uniswap/weth-price",
            {
                tokens: [
                    {
                        chainId: Number(chainId),
                        decimals: token.decimals,
                        symbol: token.symbol,
                        name: token.name,
                        address: token.address,
                        amountIn: "1",
                    },
                ],
            }
        );
        console.log("Price response:", price.data[0].amountOut);
        const tokenEthPrice = ethers.utils.parseEther(price.data[0].amountOut);
        return tokenEthPrice;
    } else if (qoutingMethod === "graph") {
        const price = await axios.post(
            "http://192.168.1.9:4000/api/uniswap_Graph/multiple-weth",
            {
                tokens: [
                    {
                        chainId: Number(chainId),
                        decimals: token.decimals,
                        symbol: token.symbol,
                        name: token.name,
                        address: token.address,
                        amountIn: "1",
                    },
                ],
            }
        );

        console.log("Price response:", price.data.quotes[0].quote);
        const tokenEthPrice = ethers.utils.parseEther(
            price.data.quotes[0].quote
        );
        return tokenEthPrice;
    } else {
        throw new Error("Unsupported qouting method.");
    }
}

async function populateTransaction() {
    let tx, receipt;
    const provider = new ethers.providers.JsonRpcProvider(Constants.RPC_URL);
    const server = new ethers.Wallet(Constants.PRIVATE_KEY, provider);
    const usdc = ERC20__factory.connect(Constants.USDC_ADDRESS, server);
    const universalSwapperAddress = deploymentReceipts[0].contractAddress;
    const universalSwapper = new ethers.Contract(
        universalSwapperAddress,
        universalSwapperAbi,
        server
    );

    //============================ SWAP PARAMS PREPARE =====================================

    // Test user approves USDC with Permit2
    const swapParams = {
        tokenOut: Constants.WETH_ADDRESS,
        amountOutMin: Constants.MINIMUM_OUT,
        swapperAddress: server.address,
    };

    const allowance = await usdc.allowance(
        server.address,
        Constants.PERMIT2_ADDRESS
    );

    if (allowance.lt(ethers.BigNumber.from(Constants.USDC_AMOUNT_IN))) {
        tx = await usdc.approve(
            Constants.PERMIT2_ADDRESS,
            ethers.constants.MaxUint256
        );
        console.log("USDC approve: ", tx.hash);
        receipt = await tx.wait();
        console.log(
            " tx status:",
            receipt.status === 1 ? "Success" : "Failure"
        );
    }

    //============================ PERMIT2 PARAMS PREPARE =====================================
    // Get Permit2 permit signature
    const chainId = (await provider.getNetwork()).chainId;

    let nonce = "";
    let isNonceFree = false;
    let nonceAttempts = 0;
    while (!isNonceFree) {
        nonce = ethers.BigNumber.from(
            ethers.utils.keccak256(
                ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "address"],
                    [Math.floor(Date.now() / 1000), server.address]
                )
            )
        ).toString();

        const { isFree } = await checkNonce(server.address, nonce);
        isNonceFree = isFree;
        nonceAttempts++;
        if (nonceAttempts > 50) {
            throw new Error("Could not find a free nonce after 100 attempts");
        }
    }

    // The permit structure for SignatureTransfer.getPermitData can include spender as well
    const gasFee = "100000";

    const permit: PermitBatchTransferFrom = {
        permitted: [
            {
                token: Constants.USDC_ADDRESS,
                amount: gasFee,
            },
            {
                token: Constants.USDC_ADDRESS,
                amount: Constants.USDC_AMOUNT_IN.toString(),
            },
        ] as TokenPermissions[],
        nonce: nonce,
        deadline: Math.floor(Date.now() / 1000) + 60 * 30, // 30 min,
        spender: universalSwapperAddress,
    };

    // Build EIP-712 data for signing (using the SDK)
    const { domain, types, values } = SignatureTransfer.getPermitData(
        permit,
        Constants.PERMIT2_ADDRESS,
        chainId
    );

    const signature = await server._signTypedData(domain, types, values);

    const transferDetails = [
        {
            to: Constants.GAS_FEE_RECIPIENT, // or any address you want to send the tokens to
            requestedAmount: gasFee,
        },
        {
            to: universalSwapperAddress, // or any address you want to send the tokens to
            requestedAmount: Constants.USDC_AMOUNT_IN.toString(),
        },
    ];

    const permit2Params = {
        permit,
        transferDetails,
        signature,
    };

    //============================ UNIVERSAL PARAMS PREPARE =====================================

    // Universal Router call setup + execution
    const abiCoder = ethers.utils.defaultAbiCoder;

    /// Pay a percentage of the current router balance to fee recipient
    const payPortionPayload = abiCoder.encode(
        ["address", "address", "uint256"],
        [
            Constants.USDC_ADDRESS,
            Constants.SWAP_FEE_RECIPIENT,
            Constants.FEE_BIPS,
        ]
    );

    /// Swap USDC for WETH
    const swapExactInputPayload = abiCoder.encode(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [
            server.address,
            Constants.CONTRACT_BALANCE_SPECIAL_VALUE,
            Constants.MINIMUM_OUT,
            ethers.utils.solidityPack(
                ["address", "uint24", "address"],
                [
                    Constants.USDC_ADDRESS,
                    Constants.UNIV3_WETH_USDC_POOL_FEE,
                    Constants.WETH_ADDRESS,
                ]
            ),
            false,
        ]
    );

    const commands = ethers.utils.arrayify(
        Uint8Array.from([
            Constants.PAY_PORTION_COMMAND,
            Constants.SWAP_EXACT_INPUT_COMMAND,
        ])
    );

    const inputs = [payPortionPayload, swapExactInputPayload];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 30;
    const universalParams = { commands, inputs, deadline };

    //============================ SENDING SWAP TRANSACTION =====================================

    tx = await universalSwapper.populateTransaction.execute(
        swapParams,
        permit2Params,
        universalParams
    );
    return tx;
}

export async function calculateGasFeeInToken(token: Token, RPC_URL?: string) {
    // Populating the sample transaction for estimation
    const tx = await populateTransaction();

    // Get gas estimate in Wei
    const gasEstimateInWei = await getGasEstimate(tx, RPC_URL);

    // Get token price to ETH
    const tokenEthPriceInWei = ethers.BigNumber.from(
        await getTokenPriceToETH(token, "1", "onchain")
    );

    // Calculate gas estimate in Token
    const gasEstimateInToken = gasEstimateInWei
        .mul(ethers.utils.parseUnits("1", token.decimals))
        .div(tokenEthPriceInWei);

    console.log("Gas fee in token: ", gasEstimateInToken.toString());
    console.log(
        "Gas fee in token formmated: ",
        Number(ethers.utils.formatUnits(gasEstimateInToken, token.decimals)),
        token.symbol
    );

    return {
        token: token,
        price: tokenEthPriceInWei,
        gasFeeInToken: gasEstimateInToken,
    };
}

async function testDifferentRpcs() {
    let tx = await populateTransaction();

    console.log(
        "================== ANVIL CALCULATE GAS LOGS========================="
    );

    let gasEstimate = await getGasEstimate(tx);
    // console.log("Gas estimate: ", gasEstimate.toString());

    console.log(
        "================== PublicNode CALCULATE GAS LOGS========================="
    );

    gasEstimate = await getGasEstimate(tx, Constants.PUBLICNODE_RPC_URL);
    // console.log("Gas estimate: ", gasEstimate.toString());

    console.log(
        "================== Alchemy CALCULATE GAS LOGS========================="
    );

    gasEstimate = await getGasEstimate(tx, Constants.ALCHEMY_RPC_URL);
    // console.log("Gas estimate: ", gasEstimate.toString());

    console.log(
        "================== infura CALCULATE GAS LOGS========================="
    );

    gasEstimate = await getGasEstimate(tx, Constants.INFURA_RPC_URL);
    // console.log("Gas estimate: ", gasEstimate.toString());

    console.log(
        "================================================================"
    );
}

async function test() {
    const provider = new ethers.providers.JsonRpcProvider(Constants.RPC_URL);
    const token = ERC20__factory.connect(Constants.USDC_ADDRESS, provider);
    const decimals = await token.decimals();
    const symbol = await token.symbol();
    const name = await token.name();

    const gasFeeInToken = await calculateGasFeeInToken({
        address: Constants.USDC_ADDRESS,
        decimals,
        symbol,
        name,
    });
    console.log("Gas fee in token: ", gasFeeInToken.gasFeeInToken.toString());
    console.log(
        "Gas fee in token formatted: ",
        ethers.utils.formatUnits(gasFeeInToken.gasFeeInToken, 6)
    );
}

// testDifferentRpcs();
// test();
