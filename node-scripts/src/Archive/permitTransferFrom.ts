import { ethers } from "ethers";
import {
    SignatureTransfer,
    PermitTransferFrom,
    TokenPermissions,
} from "@uniswap/permit2-sdk";
import { Permit2__factory } from "../types/factories/Permit2__factory";
import { ERC20__factory } from "../types/factories/ERC20__factory";
import * as constants from "./constants";
import { getBalance } from "./get-balance";

export async function getSignatureForPermitTransfer(
    token: string,
    spender: string, // the address that will submit (spender) — usually your contract or the universal router
    amountInSmallestUnit: string // use string for safety
) {
    const provider = new ethers.providers.JsonRpcProvider(constants.RPC_URL);
    const alice = new ethers.Wallet(constants.ALICE_KEY, provider);
    const chainId = (await provider.getNetwork()).chainId;

    let nonce = "";
    let isNonceFree = false;
    let nonceAttempts = 0;
    while (!isNonceFree) {
        nonce = ethers.BigNumber.from(
            ethers.utils.keccak256(
                ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "address"],
                    [Math.floor(Date.now() / 1000), alice.address]
                )
            )
        ).toString();

        const { isFree } = await checkNonce(alice.address, nonce);
        isNonceFree = isFree;
        nonceAttempts++;
        if (nonceAttempts > 50) {
            throw new Error("Could not find a free nonce after 100 attempts");
        }
    }

    // read current allowance data for alice -> spender for token
    const deadline = Math.floor(Date.now() / 1000) + 60 * 30; // 30 min

    // The permit structure for SignatureTransfer.getPermitData can include spender as well
    const permit: PermitTransferFrom = {
        permitted: {
            token: token,
            amount: amountInSmallestUnit.toString(),
        } as TokenPermissions,
        nonce: nonce,
        deadline: deadline,
        spender: spender,
    };

    // Build EIP-712 data for signing (using the SDK)
    const { domain, types, values } = SignatureTransfer.getPermitData(
        permit,
        constants.PERMIT2_ADDRESS,
        chainId
    );

    const signature = await alice._signTypedData(domain, types, values);

    return { permit, signature };
}

async function checkNonce(
    owner: string,
    nonceInString: string
): Promise<{
    isFree: boolean;
    wordPos: ethers.BigNumber;
    bitPos: number;
    bitmap: ethers.BigNumber;
}> {
    const provider = new ethers.providers.JsonRpcProvider(constants.RPC_URL);
    const permit2Contract = Permit2__factory.connect(
        constants.PERMIT2_ADDRESS,
        provider
    );

    const nonce = ethers.BigNumber.from(nonceInString);

    // wordPos = nonce >> 8
    const wordPos = nonce.shr(8);
    // bitPos = last 8 bits
    const bitPos = nonce.and(0xff).toNumber();

    const bitmap: ethers.BigNumber = await permit2Contract.nonceBitmap(
        owner,
        wordPos
    );
    const bit = bitmap.shr(bitPos).and(1);
    return { isFree: bit.eq(0), wordPos, bitPos, bitmap };
}

export async function submitPermitTransferFrom(
    token: string,
    amountInSmallestUnit: string
) {
    const provider = new ethers.providers.JsonRpcProvider(constants.RPC_URL);
    const server = new ethers.Wallet(constants.PRIVATE_KEY, provider); // the account that sends the transaction (relayer/server)
    const alice = new ethers.Wallet(constants.ALICE_KEY, provider); // owner / message signer
    const usdc = ERC20__factory.connect(constants.USDC_ADDRESS, alice);

    // Test user approves USDC with Permit2
    let tx = await usdc.approve(
        constants.PERMIT2_ADDRESS,
        ethers.constants.MaxUint256
    );
    console.log("USDC approve: ", tx.hash);
    let receipt = await tx.wait();
    console.log(" tx status:", receipt.status === 1 ? "Success" : "Failure");

    // 1) Build signature (signed by Alice)
    const { permit, signature } = await getSignatureForPermitTransfer(
        token,
        server.address,
        amountInSmallestUnit
    );

    // 2) Connect to Permit2 contract with the account that will send transactions
    const permit2 = Permit2__factory.connect(constants.PERMIT2_ADDRESS, server);

    // Build SignatureTransferDetails
    const transferDetails = {
        to: server.address, // or any address you want to send the tokens to
        requestedAmount: amountInSmallestUnit.toString(),
    };

    console.log("Submitting permitTransferFrom to Permit2...");
    // Call the contract method; TypeChain should have typed this method
    tx = await permit2[
        "permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)"
    ](
        // Note: some versions may require type adjustments (e.g., BigNumber)
        permit,
        transferDetails,
        alice.address,
        signature
    );

    console.log("tx hash:", tx.hash);
    receipt = await tx.wait();
    console.log("tx status:", receipt.status);
    return { txHash: tx.hash, receipt };
}

// Example usage
// (async () => {
//     await getBalance("server", "0x1e2d15A585Ea0098d222c0b169d6079E671D82b0");
//     await getBalance("Alice", "0x910F4a7143Ef72766dDe042FE067218c1dE74b2d");
//     await submitPermitTransferFrom(
//         constants.USDC_ADDRESS,
//         constants.USDC_AMOUNT_IN.toString()
//     );
//     await getBalance("server", "0x1e2d15A585Ea0098d222c0b169d6079E671D82b0");
//     await getBalance("Alice", "0x910F4a7143Ef72766dDe042FE067218c1dE74b2d");
// })();
