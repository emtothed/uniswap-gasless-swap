import { ethers } from "ethers";
import {
    UniversalRouter__factory,
    ERC20__factory,
    WETH__factory,
    Permit2__factory,
} from "../types";
import * as Constants from "./constants";

type Token = {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
};
export async function getBalance(
    name: string,
    address: string,
    tokenIn: Token,
    tokenOut: Token
) {
    const provider = new ethers.providers.JsonRpcProvider(Constants.RPC_URL);
    const tokenInContract = ERC20__factory.connect(tokenIn.address, provider);
    const tokenOutContract = ERC20__factory.connect(tokenOut.address, provider);

    console.log(`\n=================== ${name}'s Balances ===================`);

    const ethBalance = await provider.getBalance(address);
    console.log("ETH Balance:  ", ethers.utils.formatEther(ethBalance));

    const tokenInBalance = await tokenInContract.balanceOf(address);
    console.log(
        `${tokenIn.symbol} Balance: `,
        ethers.utils.formatUnits(tokenInBalance, tokenIn.decimals)
    );

    const tokenOutBalance = await tokenOutContract.balanceOf(address);
    console.log(
        `${tokenOut.symbol} Balance: `,
        ethers.utils.formatUnits(tokenOutBalance, tokenOut.decimals)
    );

    console.log(`========================================================`);
}
