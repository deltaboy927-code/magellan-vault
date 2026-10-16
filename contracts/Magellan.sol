// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {SafeERC20, IERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract Magellan is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidDuration();
    error LockActive();
    error InsufficientBalance();
    error UnsupportedNetwork();
    error InvalidToken();
    error UnsupportedTokenBehavior();

    uint256 public constant BNB_MAINNET_CHAIN_ID = 56;
    uint256 public constant MAX_LOCK_DURATION = 5 * 365 days;

    IERC20 public immutable usdt;
    uint256 public lockUntil;
    uint256 public lockDuration;

    event Deposited(address indexed owner, uint256 amount, uint256 totalBalance);
    event Locked(uint256 duration, uint256 unlockTimestamp);
    event Withdrawn(address indexed recipient, uint256 amount, uint256 remainingBalance);

    constructor(address usdtToken, address initialOwner) Ownable(initialOwner) {
        if (block.chainid != BNB_MAINNET_CHAIN_ID) revert UnsupportedNetwork();
        if (usdtToken == address(0)) revert ZeroAddress();
        if (usdtToken.code.length == 0) revert InvalidToken();
        usdt = IERC20(usdtToken);
    }

    /// @notice Only the owner can fund this personal vault; deposits remain allowed during a lock.
    function deposit(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 vaultBalanceBefore = usdt.balanceOf(address(this));
        uint256 ownerBalanceBefore = usdt.balanceOf(owner());
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        if (
            usdt.balanceOf(address(this)) - vaultBalanceBefore != amount ||
            ownerBalanceBefore - usdt.balanceOf(owner()) != amount
        ) revert UnsupportedTokenBehavior();

        emit Deposited(msg.sender, amount, usdt.balanceOf(address(this)));
    }

    /// @notice Start a lock period. The lock begins only when this function is called explicitly.
    function lock(uint256 duration) external onlyOwner nonReentrant {
        if (duration == 0 || duration > MAX_LOCK_DURATION) revert InvalidDuration();
        if (lockUntil > block.timestamp) revert LockActive();

        lockDuration = duration;
        lockUntil = block.timestamp + duration;

        emit Locked(duration, lockUntil);
    }

    /// @notice Withdraw funds only when the lock is no longer active.
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (lockUntil > block.timestamp) revert LockActive();

        uint256 availableBalance = usdt.balanceOf(address(this));
        if (amount > availableBalance) revert InsufficientBalance();
        uint256 ownerBalanceBefore = usdt.balanceOf(owner());

        usdt.safeTransfer(owner(), amount);
        if (usdt.balanceOf(owner()) - ownerBalanceBefore != amount) {
            revert UnsupportedTokenBehavior();
        }

        emit Withdrawn(owner(), amount, usdt.balanceOf(address(this)));
    }

    /// @notice Returns the total amount currently held in the vault.
    function getBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    /// @notice Returns the timestamp when the current lock expires.
    function getUnlockTime() external view returns (uint256) {
        return lockUntil;
    }

    /// @notice Returns true if the vault is still under an active lock.
    function isLockActive() external view returns (bool) {
        return lockUntil > block.timestamp;
    }

    /// @notice Returns the remaining time before the lock expires, or 0 if already unlocked.
    function getTimeRemaining() external view returns (uint256) {
        if (lockUntil <= block.timestamp) return 0;
        return lockUntil - block.timestamp;
    }
}
