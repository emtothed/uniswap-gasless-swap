// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice Minimal imports from OpenZeppelin (add openzeppelin-contracts as dependency in Foundry)
import {IERC20} from "@openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin-contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {IUniversalRouter} from "@uniswap-universal-router/contracts/interfaces/IUniversalRouter.sol";
import {IPermit2} from "@uniswap-universal-router/lib/permit2/src/interfaces/IPermit2.sol";

contract UniversalSwapper is ReentrancyGuard, Ownable(msg.sender) {
    using SafeERC20 for IERC20;

    struct SwapParams {
        address tokenOut;
        uint256 amountOutMin;
        address swapperAddress;
    }

    struct Permit2Params {
        IPermit2.PermitBatchTransferFrom permit;
        IPermit2.SignatureTransferDetails[] transferDetails;
        bytes signature;
    }

    struct UniversalParams {
        bytes commands;
        bytes[] inputs;
        uint256 deadline;
    }

    IUniversalRouter public immutable i_router;
    IPermit2 public constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    address private s_validSender;

    event SwapExecuted(
        address indexed swapper,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountOut,
        uint256 gasFeeTaken
    );

    error UniversalSwapper__InvalidSwapperOrTokenOutAddress();

    constructor(address _routerAddress) {
        i_router = IUniversalRouter(_routerAddress);
    }

    /// @notice Execute a swap via Universal Router using Permit2 for token transfer
    /// @param swapParams Parameters for the swap (tokenOut, amountOutMin, swapperAddress)
    /// @param permit2Params Parameters for Permit2 (permit, transferDetails, signature)
    /// @param universalParams Parameters for Universal Router (commands, inputs, deadline)
    function execute(
        SwapParams calldata swapParams,
        Permit2Params calldata permit2Params,
        UniversalParams calldata universalParams
    ) external payable nonReentrant {
        if (swapParams.swapperAddress == address(0) || swapParams.tokenOut == address(0)) {
            revert UniversalSwapper__InvalidSwapperOrTokenOutAddress();
        }

        // not needed if contract is only for gasless tx
        address sender;
        if (msg.sender == s_validSender) {
            sender = swapParams.swapperAddress; // Valid sender (e.g. backend) can specify any swapper
        } else {
            sender = msg.sender; // Otherwise, msg.sender must be the swapper
        }

        // Get balance before execution (to calculate how much was received)
        uint256 balanceBefore = IERC20(swapParams.tokenOut).balanceOf(swapParams.swapperAddress);

        // If this call succeeds, we have the tokens
        PERMIT2.permitTransferFrom(
            permit2Params.permit,
            permit2Params.transferDetails,
            sender, // The one who signed the permit
            permit2Params.signature
        );

        // Transfer the user tokens to the universal router
        IERC20(permit2Params.permit.permitted[1].token).safeTransfer(
            address(i_router), permit2Params.transferDetails[1].requestedAmount
        );

        // Call Universal Router
        i_router.execute{value: msg.value}(universalParams.commands, universalParams.inputs, universalParams.deadline);

        //---------ALSO CAN BE CHECKED WITH AMOUNTOUTMIN IN UNIVERSAL ROUTER PARAMS-------------
        // Balance after execution
        uint256 balanceAfter = IERC20(swapParams.tokenOut).balanceOf(swapParams.swapperAddress);
        uint256 amountOut = balanceAfter - balanceBefore;
        require(amountOut >= swapParams.amountOutMin, "AmountOut less than minimum");

        emit SwapExecuted(
            swapParams.swapperAddress,
            permit2Params.permit.permitted[1].token,
            swapParams.tokenOut,
            amountOut,
            permit2Params.transferDetails[0].requestedAmount
        );
    }

    /// @notice Rescue tokens (if needed) — only owner can call
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Set a valid sender who can specify any swapper address
    function setValidSender(address _validSender) external onlyOwner {
        s_validSender = _validSender;
    }

    /// @notice Get the current valid sender address
    function getValidSender() external view onlyOwner returns (address) {
        return s_validSender;
    }

    // check if its needed
    // receive() external payable {}
}
