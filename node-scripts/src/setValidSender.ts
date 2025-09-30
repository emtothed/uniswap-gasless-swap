import { ethers } from "ethers";
import * as constants from "./constants";
import { abi as universalSwapperAbi } from "../../out/UniversalSwapper.sol/UniversalSwapper.json";
import { receipts as deploymentReceipts } from "../../broadcast/DeployUniversalSwapper.s.sol/1/run-latest.json";

export async function setValidSender(validSenderAddress: string) {
    const universalSwapperAddress = deploymentReceipts[0].contractAddress;
    const provider = new ethers.providers.JsonRpcProvider(constants.RPC_URL);
    const server = new ethers.Wallet(constants.PRIVATE_KEY, provider);

    const universalSwapper = new ethers.Contract(
        universalSwapperAddress,
        universalSwapperAbi,
        server
    );

    console.log("Sending setValidSender tx...");
    let tx = await universalSwapper.setValidSender(validSenderAddress);
    console.log("setValidSender tx: ", tx.hash);
    let receipt = await tx.wait();
    console.log(" tx status:", receipt.status === 1 ? "Success" : "Failure");
}

export async function getValidSender() {
    const universalSwapperAddress = deploymentReceipts[0].contractAddress;
    const provider = new ethers.providers.JsonRpcProvider(constants.RPC_URL);
    const server = new ethers.Wallet(constants.PRIVATE_KEY, provider);

    const universalSwapper = new ethers.Contract(
        universalSwapperAddress,
        universalSwapperAbi,
        server
    );

    console.log("Getting validSender...");
    return await universalSwapper.getValidSender();
}

async function test() {
    let validSender = await getValidSender();
    console.log({ validSender });

    await setValidSender(constants.SERVER_ADDRESS);

    validSender = await getValidSender();
    console.log({ validSender });
}

// test();
