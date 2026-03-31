// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title TxSimulator
 * @notice Never deployed on-chain. Runtime bytecode is used via eth_call state
 *         overrides to simulate a transaction and report balance changes.
 *
 *         The bytecode is injected at the user's address so that:
 *         - address(this) == user, giving real token balances via balanceOf
 *         - msg.sender seen by the target contract is the user's address
 */
contract TxSimulator {
    /**
     * @notice Simulate a transaction and return balance deltas.
     * @param to         Target contract address
     * @param value      ETH value to send
     * @param data       Calldata for the target
     * @param candidates Addresses to check balanceOf (from eth_createAccessList)
     * @return success   Whether the inner call succeeded
     * @return ethDelta  Net ETH change (negative = sent, positive = received)
     * @return tokens    Addresses with non-zero balance changes
     * @return deltas    Corresponding signed balance deltas
     */
    function simulate(
        address to,
        uint256 value,
        bytes calldata data,
        address[] calldata candidates
    )
        external
        returns (
            bool success,
            int256 ethDelta,
            address[] memory tokens,
            int256[] memory deltas
        )
    {
        uint256 ethBefore = address(this).balance;

        // Snapshot token balances before
        uint256 len = candidates.length;
        uint256[] memory before = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            before[i] = _tryBalanceOf(candidates[i]);
        }

        // Execute the real call
        (success, ) = to.call{value: value}(data);

        // Compute ETH delta
        ethDelta = int256(address(this).balance) - int256(ethBefore);

        // Compute token deltas — only keep non-zero
        uint256 count;
        int256[] memory rawDeltas = new int256[](len);
        for (uint256 i; i < len; ++i) {
            uint256 balAfter = _tryBalanceOf(candidates[i]);
            rawDeltas[i] = int256(balAfter) - int256(before[i]);
            if (rawDeltas[i] != 0) ++count;
        }

        tokens = new address[](count);
        deltas = new int256[](count);
        uint256 j;
        for (uint256 i; i < len; ++i) {
            if (rawDeltas[i] != 0) {
                tokens[j] = candidates[i];
                deltas[j] = rawDeltas[i];
                ++j;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Batch simulation — executes multiple calls sequentially so that
    // state changes (e.g. approvals) persist across calls.
    // -----------------------------------------------------------------------

    struct BatchCall {
        address to;
        uint256 value;
        bytes data;
    }

    /**
     * @notice Simulate a batch of calls and return cumulative balance deltas.
     * @param calls      Array of calls to execute sequentially
     * @param candidates Addresses to check balanceOf (merged from all access lists)
     * @return allSuccess Whether every inner call succeeded
     * @return ethDelta   Cumulative net ETH change
     * @return tokens     Addresses with non-zero balance changes
     * @return deltas     Corresponding signed balance deltas
     */
    function simulateBatch(
        BatchCall[] calldata calls,
        address[] calldata candidates
    )
        external
        returns (
            bool allSuccess,
            int256 ethDelta,
            address[] memory tokens,
            int256[] memory deltas
        )
    {
        uint256 ethBefore = address(this).balance;

        // Snapshot token balances before ALL calls
        uint256 len = candidates.length;
        uint256[] memory before = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            before[i] = _tryBalanceOf(candidates[i]);
        }

        // Execute all calls sequentially (state persists between calls)
        allSuccess = true;
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, ) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) allSuccess = false;
        }

        // Compute cumulative deltas (same pattern as simulate())
        ethDelta = int256(address(this).balance) - int256(ethBefore);

        uint256 count;
        int256[] memory rawDeltas = new int256[](len);
        for (uint256 i; i < len; ++i) {
            uint256 balAfter = _tryBalanceOf(candidates[i]);
            rawDeltas[i] = int256(balAfter) - int256(before[i]);
            if (rawDeltas[i] != 0) ++count;
        }

        tokens = new address[](count);
        deltas = new int256[](count);
        uint256 j;
        for (uint256 i; i < len; ++i) {
            if (rawDeltas[i] != 0) {
                tokens[j] = candidates[i];
                deltas[j] = rawDeltas[i];
                ++j;
            }
        }
    }

    /// @dev Try balanceOf(address(this)); returns 0 on revert or bad data.
    function _tryBalanceOf(address token) internal view returns (uint256) {
        // selector: balanceOf(address) = 0x70a08231
        (bool ok, bytes memory ret) = token.staticcall(
            abi.encodeWithSelector(0x70a08231, address(this))
        );
        if (ok && ret.length >= 32) {
            return abi.decode(ret, (uint256));
        }
        return 0;
    }

    // -----------------------------------------------------------------------
    // ERC-1271 support — makes Permit2 use ECDSA verification for our address
    // -----------------------------------------------------------------------

    /// @dev ERC-1271: Permit2 calls this when address(this) has code.
    ///      We perform the same ecrecover that Permit2 would do for an EOA,
    ///      so signatures created by the real EOA owner still verify correctly.
    function isValidSignature(
        bytes32 hash,
        bytes calldata signature
    ) external pure returns (bytes4) {
        if (signature.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(signature.offset)
                s := calldataload(add(signature.offset, 0x20))
                v := byte(0, calldataload(add(signature.offset, 0x40)))
            }
            if (ecrecover(hash, v, r, s) != address(0)) {
                return 0x1626ba7e; // ERC-1271 magic value
            }
        }
        return 0xffffffff;
    }

    /// @dev Accept ETH (e.g. from swaps returning native currency).
    receive() external payable {}
}
