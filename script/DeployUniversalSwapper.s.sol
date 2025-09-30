// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/src/Script.sol";
import "../src/UniversalSwapper.sol";

contract DeployUniversalSwapper is Script {
    address SepoliaContract = address(0);

    function run() external returns (UniversalSwapper) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        UniversalSwapper swapper;

        address router;
        if (block.chainid == 1) {
            // Ethereum Mainnet
            router = 0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af;
        } else if (block.chainid == 11155111) {
            // Sepolia
            router = 0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b;
        } else {
            revert("Unsupported chain");
        }

        if (block.chainid == 11155111) {
            if (SepoliaContract == address(0)) {
                revert("Set SepoliaContract address for existing deployment");
            }
            swapper = UniversalSwapper(payable(SepoliaContract));
            console.log("Using existing contract on Sepolia:", address(swapper));
            return swapper;
        } else {
            vm.startBroadcast(deployerPrivateKey);
            swapper = new UniversalSwapper(router);
            vm.stopBroadcast();
            console.log("Deployed UniversalSwapper at:", address(swapper));
            console.log("On chainId:", block.chainid);
            return swapper;
        }
    }
}
