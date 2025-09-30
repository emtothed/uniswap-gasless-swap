import {
    UniversalRouter__factory,
    ERC20__factory,
    WETH__factory,
    Permit2__factory,
} from "../../types";
import { ethers } from "ethers";
import * as Constants from "../constants";
import { getBalance } from "../get-balance";
import { getSignatureForPermitTransfer } from "./permitTransferFrom";
import { getSignatureForBatchPermitTransfer } from "../batchPermitTransferFrom";
import { abi as universalSwapperAbi } from "../../../out/UniversalSwapper.sol/UniversalSwapper.json";
import { receipts as deploymentReceipts } from "../../../broadcast/DeployUniversalSwapper.s.sol/1/run-latest.json";
import { calculateGasFeeInToken } from "../gasFeeCalculator";

async function swapUsdcWithSeperatePermit() {
    let tx, receipt;
    const provider = new ethers.providers.JsonRpcProvider(Constants.RPC_URL);
    const server = new ethers.Wallet(Constants.PRIVATE_KEY, provider);
    const signer = new ethers.Wallet(Constants.ALICE_KEY, provider);
    const usdc = ERC20__factory.connect(Constants.USDC_ADDRESS, signer);
    const universalSwapperAddress = deploymentReceipts[0].contractAddress;
    const universalSwapper = new ethers.Contract(
        universalSwapperAddress,
        universalSwapperAbi,
        server
    );

    // Test user approves USDC with Permit2
    const swapParams = {
        tokenOut: Constants.WETH_ADDRESS,
        amountOutMin: Constants.MINIMUM_OUT,
        swapperAddress: signer.address,
    };

    const allowance = await usdc.allowance(
        signer.address,
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
    // Get Permit2 permit signature from Alice
    // 1) Build signature (signed by Alice)
    const { permit, signature } = await getSignatureForPermitTransfer(
        Constants.USDC_ADDRESS,
        universalSwapperAddress,
        Constants.USDC_AMOUNT_IN.toString()
    );

    const transferDetails = {
        to: universalSwapperAddress, // or any address you want to send the tokens to
        requestedAmount: Constants.USDC_AMOUNT_IN.toString(),
    };

    const permit2Params = {
        permit,
        transferDetails,
        signature,
    };

    // Universal Router call setup + execution
    const abiCoder = ethers.utils.defaultAbiCoder;

    /// Transfer USDC from test user to the router
    // const permit2TransferFromPayload = abiCoder.encode(
    //     ["address", "address", "uint160"],
    //     [
    //         Constants.USDC_ADDRESS,
    //         Constants.UNIVERSAL_ROUTER_ADDRESS,
    //         Constants.USDC_AMOUNT_IN,
    //     ]
    // );

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
            signer.address,
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

    console.log("Sending swap tx...");
    tx = await universalSwapper.execute(
        swapParams,
        permit2Params,
        universalParams
    );
    console.log("Swap tx: ", tx.hash);
    receipt = await tx.wait();
    console.log(" tx status:", receipt.status === 1 ? "Success" : "Failure");
}
