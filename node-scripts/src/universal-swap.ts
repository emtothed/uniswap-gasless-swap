import {
    UniversalRouter__factory,
    ERC20__factory,
    WETH__factory,
    Permit2__factory,
} from "../types";
import { ethers } from "ethers";
import * as Constants from "./constants";
import { getBalance } from "./get-balance";
import { getSignatureForBatchPermitTransfer } from "./batchPermitTransferFrom";
import { abi as universalSwapperAbi } from "../../out/UniversalSwapper.sol/UniversalSwapper.json";
import { receipts as deploymentReceipts } from "../../broadcast/DeployUniversalSwapper.s.sol/1/run-latest.json";
import { calculateGasFeeInToken } from "./gasFeeCalculator";

type Token = {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
};

export async function swapTokenWithSeperateBatchPermit(
    signer: ethers.Wallet,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    amountOutMin: string
) {
    let tx, receipt;
    const provider = new ethers.providers.JsonRpcProvider(Constants.RPC_URL);
    const server = new ethers.Wallet(Constants.PRIVATE_KEY, provider);
    const tokenInContract = ERC20__factory.connect(tokenIn.address, signer);
    const universalSwapperAddress = deploymentReceipts[0].contractAddress;
    const universalSwapper = new ethers.Contract(
        universalSwapperAddress,
        universalSwapperAbi,
        server
    );

    //============================ SWAP PARAMS PREPARE =====================================

    // Test user approves tokenIn with Permit2
    const swapParams = {
        tokenOut: tokenOut.address,
        amountOutMin: amountOutMin, // check : it was bigint
        swapperAddress: signer.address,
    };

    //========================== CHECKING PERMIT2 ALLOWANCE =================================

    const allowance = await tokenInContract.allowance(
        signer.address,
        Constants.PERMIT2_ADDRESS
    );

    if (allowance.lt(ethers.BigNumber.from(amountIn))) {
        tx = await tokenInContract.approve(
            Constants.PERMIT2_ADDRESS,
            ethers.constants.MaxUint256
        );
        console.log(`${tokenIn.symbol} approve to Permit2: `, tx.hash);
        receipt = await tx.wait();
        console.log(
            " tx status:",
            receipt.status === 1 ? "Success" : "Failure"
        );
    }
    //========================== GETTING GAS FEE IN TOKEN ===================================

    const gasFee = await calculateGasFeeInToken({
        address: tokenIn.address,
        decimals: tokenIn.decimals,
        symbol: tokenIn.symbol,
        name: tokenIn.name,
    });

    if (ethers.BigNumber.from(amountIn).sub(gasFee.gasFeeInToken).lte(0)) {
        throw new Error("AmountIn Less Than Required Gas Fee.");
    }

    const swapAmountIn = ethers.BigNumber.from(amountIn)
        .sub(gasFee.gasFeeInToken)
        .toString();

    //=========================== PERMIT2 PARAMS PREPARE ===================================
    // Get Permit2 permit signature from Alice
    const { permit, signature } = await getSignatureForBatchPermitTransfer(
        signer,
        tokenIn.address,
        universalSwapperAddress,
        gasFee.gasFeeInToken.toString(),
        swapAmountIn
    );

    const transferDetails = [
        {
            to: Constants.GAS_FEE_RECIPIENT, // or any address you want to send the tokens to
            requestedAmount: gasFee.gasFeeInToken.toString(),
        },
        {
            to: universalSwapperAddress, // or any address you want to send the tokens to
            requestedAmount: swapAmountIn,
        },
    ];

    const permit2Params = {
        permit,
        transferDetails,
        signature,
    };

    //============================= UNIVERSAL PARAMS PREPARE =================================

    // Universal Router call setup + execution
    const abiCoder = ethers.utils.defaultAbiCoder;

    /// Pay a percentage of the current router balance to fee recipient
    const payPortionPayload = abiCoder.encode(
        ["address", "address", "uint256"],
        [tokenIn.address, Constants.SWAP_FEE_RECIPIENT, Constants.FEE_BIPS]
    );

    /// Swap tokenIn for tokenOut
    const swapExactInputPayload = abiCoder.encode(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [
            signer.address,
            Constants.CONTRACT_BALANCE_SPECIAL_VALUE,
            amountOutMin,
            ethers.utils.solidityPack(
                ["address", "uint24", "address"],
                [
                    tokenIn.address,
                    Constants.UNIV3_WETH_USDC_POOL_FEE,
                    tokenOut.address,
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

    //============================ SENDING SWAP TRANSACTION ==================================

    console.log(
        "\n=========================== Sending swap tx ================================"
    );
    tx = await universalSwapper.execute(
        swapParams,
        permit2Params,
        universalParams
    );
    console.log("Swap tx: ", tx.hash);
    receipt = await tx.wait();
    console.log(" tx status:", receipt.status === 1 ? "Success" : "Failure");

    console.log(
        "\n============================ GAS USAGE DETAILS =============================="
    );

    console.log(
        "Actual Effective gas price: ",
        receipt.effectiveGasPrice.toString()
    );
    console.log("Actual Gas used: ", receipt.gasUsed.toString());

    const actualGasInWei = ethers.BigNumber.from(receipt.effectiveGasPrice).mul(
        ethers.BigNumber.from(receipt.gasUsed)
    );

    console.log(
        "Actual Gas in ETH: ",
        ethers.utils.formatEther(actualGasInWei)
    );

    const actualGasFeeInToken = actualGasInWei
        .mul(ethers.utils.parseEther("1"))
        .div(gasFee.price);

    console.log(
        "Actual Gas Fee In Token: ",
        Number(ethers.utils.formatEther(actualGasFeeInToken)),
        gasFee.token.symbol
    );

    // console.log("===============================================");
}

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(Constants.RPC_URL);
    const signer = new ethers.Wallet(Constants.ALICE_KEY, provider);
    const universalSwapperAddress = deploymentReceipts[0].contractAddress;

    const tokenInContract = ERC20__factory.connect(
        Constants.tokens.USDC,
        provider
    );
    const tokenOutContract = ERC20__factory.connect(
        Constants.tokens.LINK,
        provider
    );

    let tokenIn: Token = {
        address: tokenInContract.address,
        decimals: await tokenInContract.decimals(),
        symbol: await tokenInContract.symbol(),
        name: await tokenInContract.name(),
    };
    let tokenOut: Token = {
        address: tokenOutContract.address,
        decimals: await tokenOutContract.decimals(),
        symbol: await tokenOutContract.symbol(),
        name: await tokenOutContract.name(),
    };

    let amountIn;
    if (tokenIn.address === Constants.USDC_ADDRESS) {
        amountIn = ethers.utils.parseUnits("100", tokenIn.decimals).toString();
    } else {
        amountIn = (await tokenInContract.balanceOf(signer.address)).toString();
    }

    const getAllBalances = async () => {
        console.log("\n\n\n");
        await getBalance("Alice", Constants.ALICE_ADDRESS, tokenIn, tokenOut);
        await getBalance("server", Constants.SERVER_ADDRESS, tokenIn, tokenOut);
        await getBalance(
            "fee rec",
            Constants.SWAP_FEE_RECIPIENT,
            tokenIn,
            tokenOut
        );
        console.log("\n\n\n");
    };

    // Getting balances before swap
    await getAllBalances();

    // Starting the swap process
    await swapTokenWithSeperateBatchPermit(
        signer,
        tokenIn,
        tokenOut,
        amountIn,
        ethers.BigNumber.from("0").toString()
    );

    // Getting balances after swap
    await getAllBalances();
}

main();
