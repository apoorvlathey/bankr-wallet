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
 *         - ERC-721/ERC-1155 receiver callbacks (onERC721Received,
 *           onERC1155Received, onERC1155BatchReceived) are routed here so we
 *           can capture which NFT token IDs (and ERC-1155 amounts) the user
 *           receives during the simulated call.
 */
contract TxSimulator {
    // -----------------------------------------------------------------------
    // NFT receiver capture
    // -----------------------------------------------------------------------

    struct NftReceived {
        address token;     // NFT contract that minted/transferred the token
        uint256 tokenId;   // ERC-721 tokenId or ERC-1155 id
        uint256 amount;    // Always 1 for ERC-721; variable for ERC-1155
        uint8 standard;    // 1 = ERC-721, 2 = ERC-1155
        bytes tokenUriRaw; // Raw return bytes from tokenURI(id) / uri(id) — decoded in TS.
                            // Captured AFTER the inner call so state-dependent SVG
                            // metadata (Uniswap V3/V4 positions etc.) reflects the
                            // post-tx state, not the pre-tx state.
    }

    /// @dev Cap on per-collection enumeration so a runaway ERC-20 with a
    ///      colossal balance delta can't make us iterate forever in the
    ///      Enumerable fallback below.
    uint256 private constant MAX_ENUMERATE_PER_COLLECTION = 50;
    /// @dev Gas cap for best-effort static probes against unknown candidate
    ///      contracts. A hostile fallback must not be able to burn the entire
    ///      simulation just because we tried balanceOf()/nextTokenId()/ownerOf().
    uint256 private constant PROBE_GAS_LIMIT = 100_000;
    /// @dev Onchain NFT metadata can be much heavier than balance/owner probes
    ///      (notably fully onchain SVG renderers), but it is still optional
    ///      display data and must stay bounded.
    uint256 private constant METADATA_GAS_LIMIT = 5_000_000;
    /// @dev Keep enough gas after metadata attempts to ABI-encode and return
    ///      the simulation result even if a metadata call consumes its budget.
    uint256 private constant METADATA_RETURN_GAS_RESERVE = 500_000;

    /// @dev Bundles the pre-call snapshots so simulate*/simulateBatch can
    ///      keep them in a single stack slot instead of two parallel arrays.
    struct PreSnapshot {
        uint256[] balances;     // _tryBalanceOf(candidate) before the inner call
        uint256[] nextTokenIds; // _tryNextTokenId(candidate) before the inner call
    }

    // tokenURI(uint256) selector (ERC-721 Metadata)
    bytes4 private constant TOKEN_URI_SELECTOR = 0xc87b56dd;
    // uri(uint256) selector (ERC-1155 Metadata)
    bytes4 private constant URI_SELECTOR = 0x0e89341c;
    // tokenOfOwnerByIndex(address,uint256) selector (ERC-721 Enumerable)
    bytes4 private constant TOKEN_OF_OWNER_BY_INDEX_SELECTOR = 0x2f745c59;
    // nextTokenId() selector (Uniswap V4 IPositionManager + many counter-based ERC-721s)
    bytes4 private constant NEXT_TOKEN_ID_SELECTOR = bytes4(keccak256("nextTokenId()"));
    // ownerOf(uint256) selector (ERC-721)
    bytes4 private constant OWNER_OF_SELECTOR = 0x6352211e;
    // Sentinel meaning "this candidate doesn't expose nextTokenId()".
    uint256 private constant NO_NEXT_TOKEN_ID = type(uint256).max;

    /// @dev Slot 0. Storage at the user's EOA address starts empty for every
    ///      eth_call invocation, so this dynamic array always begins at
    ///      length = 0 and accumulates NFT receipts during the simulated call.
    NftReceived[] private receivedNfts;

    /**
     * @notice Simulate a transaction and return balance deltas + received NFTs.
     * @param to         Target contract address
     * @param value      ETH value to send
     * @param data       Calldata for the target
     * @param candidates Addresses to check balanceOf (from eth_createAccessList)
     * @return success      Whether the inner call succeeded
     * @return ethDelta     Net ETH change (negative = sent, positive = received)
     * @return tokens       Addresses with non-zero balance changes
     * @return deltas       Corresponding signed balance deltas
     * @return nftsReceived NFTs the user received via safe transfer callbacks
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
            int256[] memory deltas,
            NftReceived[] memory nftsReceived
        )
    {
        uint256 ethBefore = address(this).balance;

        // Snapshot token balances + nextTokenId() before the inner call.
        // nextTokenId() catches counter-based ERC-721s (Uniswap V4
        // PositionManager etc.) that don't fire the receiver hook AND
        // don't implement ERC-721 Enumerable.
        PreSnapshot memory snap = _snapshotBefore(candidates);

        // Execute the real call. ERC-721/1155 safe transfers will trigger
        // onERC721Received / onERC1155Received on this address, populating
        // `receivedNfts` via _pushReceived().
        (success, ) = to.call{value: value}(data);

        // Compute ETH delta
        ethDelta = int256(address(this).balance) - int256(ethBefore);

        // Compute token deltas — only keep non-zero
        int256[] memory rawDeltas;
        uint256[] memory after_;
        (tokens, deltas, rawDeltas, after_) = _computeDeltas(candidates, snap.balances);

        // Post-call NFT enrichment: Enumerable fallback, nextTokenId()
        // fallback, then capture tokenURI/uri for every received entry in
        // post-call state. Extracted into a helper to keep simulate()'s
        // stack frame under the EVM/Yul 16-slot limit.
        _postProcessNfts(candidates, snap.balances, after_, snap.nextTokenIds, rawDeltas);

        nftsReceived = _readAllReceived();
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
     * @return allSuccess   Whether every inner call succeeded
     * @return ethDelta     Cumulative net ETH change
     * @return tokens       Addresses with non-zero balance changes
     * @return deltas       Corresponding signed balance deltas
     * @return nftsReceived NFTs received across all calls
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
            int256[] memory deltas,
            NftReceived[] memory nftsReceived
        )
    {
        uint256 ethBefore = address(this).balance;

        // Snapshot token balances + nextTokenId() before ALL calls.
        PreSnapshot memory snap = _snapshotBefore(candidates);

        // Execute all calls sequentially (state persists between calls).
        // Receiver callbacks fire for any safe NFT transfers/mints during
        // any call in the sequence and accumulate into receivedNfts.
        allSuccess = _executeCalls(calls);

        // Compute cumulative deltas (same pattern as simulate())
        ethDelta = int256(address(this).balance) - int256(ethBefore);

        int256[] memory rawDeltas;
        uint256[] memory after_;
        (tokens, deltas, rawDeltas, after_) = _computeDeltas(candidates, snap.balances);

        // Same post-call NFT enrichment as simulate() — see comments there.
        _postProcessNfts(candidates, snap.balances, after_, snap.nextTokenIds, rawDeltas);

        nftsReceived = _readAllReceived();
    }

    // -----------------------------------------------------------------------
    // Batch gas measurement — executes calls sequentially (state persists),
    // measures gas per call via gasleft(), and adds intrinsic + calldata
    // cost so the returned values can be used directly as tx gas limits
    // (matching the semantics of eth_estimateGas / eth_simulateV1.gasUsed).
    //
    // Used by batchGasEstimation.ts as the universal fallback when a chain
    // doesn't support eth_simulateV1: dependent calls like swap-after-approve
    // estimate correctly because the prior call's state changes are visible.
    // -----------------------------------------------------------------------
    function simulateBatchGas(BatchCall[] calldata calls)
        external
        returns (bool allSuccess, uint256[] memory gasUsedPerCall)
    {
        gasUsedPerCall = new uint256[](calls.length);
        allSuccess = true;
        for (uint256 i; i < calls.length; ++i) {
            uint256 gasBefore = gasleft();
            (bool ok, ) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            uint256 execGas = gasBefore - gasleft();
            // 21000 intrinsic + calldata gas (4 per zero byte, 16 per non-zero)
            // so callers can use the returned value directly as a tx gas limit
            // after applying their own buffer.
            gasUsedPerCall[i] = execGas + 21000 + _calldataGas(calls[i].data);
            if (!ok) allSuccess = false;
        }
    }

    /// @dev Counts calldata gas: 4 per zero byte, 16 per non-zero byte (post-Istanbul).
    function _calldataGas(bytes memory data) internal pure returns (uint256 gas) {
        uint256 len = data.length;
        for (uint256 i; i < len; ++i) {
            if (data[i] == bytes1(0)) {
                gas += 4;
            } else {
                gas += 16;
            }
        }
    }

    /// @dev Try balanceOf(address(this)); returns 0 on revert or bad data.
    function _tryBalanceOf(address token) internal view returns (uint256) {
        // selector: balanceOf(address) = 0x70a08231
        (bool ok, bytes memory ret) = token.staticcall{gas: PROBE_GAS_LIMIT}(
            abi.encodeWithSelector(0x70a08231, address(this))
        );
        if (ok && ret.length >= 32) {
            return abi.decode(ret, (uint256));
        }
        return 0;
    }

    // -----------------------------------------------------------------------
    // ERC-721 / ERC-1155 receiver hooks — capture NFTs the user receives
    // during a simulated safe transfer or _safeMint. msg.sender during the
    // callback is the NFT contract itself.
    // -----------------------------------------------------------------------

    /// @notice ERC-721 safe-transfer receiver hook.
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 tokenId,
        bytes calldata /* data */
    ) external returns (bytes4) {
        _pushReceived(msg.sender, tokenId, 1, 1);
        return 0x150b7a02;
    }

    /// @notice ERC-1155 safe-transfer receiver hook (single).
    function onERC1155Received(
        address /* operator */,
        address /* from */,
        uint256 id,
        uint256 value,
        bytes calldata /* data */
    ) external returns (bytes4) {
        _pushReceived(msg.sender, id, value, 2);
        return 0xf23a6e61;
    }

    /// @notice ERC-1155 safe-transfer receiver hook (batch).
    function onERC1155BatchReceived(
        address /* operator */,
        address /* from */,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata /* data */
    ) external returns (bytes4) {
        uint256 len = ids.length;
        for (uint256 i; i < len; ++i) {
            _pushReceived(msg.sender, ids[i], values[i], 2);
        }
        return 0xbc197c81;
    }

    /// @dev Append an NFT receipt. tokenUriRaw is filled in later by
    ///      _captureTokenUris() once the inner call has returned and any
    ///      state-dependent metadata generators see the final state.
    function _pushReceived(
        address token,
        uint256 tokenId,
        uint256 amount,
        uint8 standard
    ) internal {
        NftReceived storage entry = receivedNfts.push();
        entry.token = token;
        entry.tokenId = tokenId;
        entry.amount = amount;
        entry.standard = standard;
        // entry.tokenUriRaw left empty; populated post-call.
    }

    /// @dev Read accumulated NFT receipts to return from simulate*.
    function _readAllReceived() internal view returns (NftReceived[] memory list) {
        uint256 len = receivedNfts.length;
        list = new NftReceived[](len);
        for (uint256 i; i < len; ++i) {
            list[i] = receivedNfts[i];
        }
    }

    /// @dev Snapshot balances + nextTokenId() for every candidate. Returned
    ///      as a struct so callers occupy a single stack slot instead of
    ///      two parallel arrays — needed to keep simulate*/simulateBatch
    ///      under the legacy Yul stack limit.
    function _snapshotBefore(address[] calldata candidates)
        internal
        view
        returns (PreSnapshot memory snap)
    {
        uint256 len = candidates.length;
        snap.balances = new uint256[](len);
        snap.nextTokenIds = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            snap.balances[i] = _tryBalanceOf(candidates[i]);
            snap.nextTokenIds[i] = _tryNextTokenId(candidates[i]);
        }
    }

    /// @dev Compute the post-call balance deltas for every candidate, returning
    ///      the compact tokens/deltas arrays exposed by simulate*, plus the
    ///      raw delta and post-call balance arrays which the NFT post-process
    ///      step still needs.
    function _computeDeltas(
        address[] calldata candidates,
        uint256[] memory before_
    )
        internal
        view
        returns (
            address[] memory tokens,
            int256[] memory deltas,
            int256[] memory rawDeltas,
            uint256[] memory after_
        )
    {
        uint256 len = candidates.length;
        rawDeltas = new int256[](len);
        after_ = new uint256[](len);
        uint256 count;
        for (uint256 i; i < len; ++i) {
            after_[i] = _tryBalanceOf(candidates[i]);
            rawDeltas[i] = int256(after_[i]) - int256(before_[i]);
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

    /// @dev Execute every call in `calls` sequentially. Returns false if any
    ///      sub-call reverted. Receiver callbacks for ERC-721/1155 transfers
    ///      fire on this address mid-loop and accumulate into receivedNfts.
    function _executeCalls(BatchCall[] calldata calls) internal returns (bool allSuccess) {
        allSuccess = true;
        uint256 n = calls.length;
        for (uint256 i; i < n; ++i) {
            (bool ok, ) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) allSuccess = false;
        }
    }

    /// @dev Post-call NFT enrichment: runs Enumerable + nextTokenId() fallbacks
    ///      and then captures tokenURI / uri for every entry. Extracted from
    ///      simulate() / simulateBatch() to keep their stack frames small
    ///      enough for the legacy (non viaIR) Yul code generator.
    function _postProcessNfts(
        address[] calldata candidates,
        uint256[] memory before_,
        uint256[] memory after_,
        uint256[] memory nextBefore,
        int256[] memory rawDeltas
    ) internal {
        _enumerateNewErc721Tokens(candidates, before_, after_, rawDeltas);
        _enumerateViaNextTokenId(candidates, nextBefore, rawDeltas);
        _captureTokenUris();
    }

    /**
     * @dev For each candidate with a positive ERC-721 balance delta, walk
     *      ERC-721 Enumerable's `tokenOfOwnerByIndex(this, idx)` for the
     *      newly-added indices and push any tokenIds that weren't already
     *      captured by the receiver hook. This recovers the tokenIds for
     *      contracts that use plain `_mint` instead of `_safeMint`.
     *
     *      Bounded to MAX_ENUMERATE_PER_COLLECTION iterations per token, and
     *      breaks immediately if the contract doesn't implement Enumerable
     *      (the staticcall just reverts), so non-NFT contracts are skipped
     *      after one wasted call.
     */
    function _enumerateNewErc721Tokens(
        address[] calldata candidates,
        uint256[] memory before_,
        uint256[] memory after_,
        int256[] memory rawDeltas
    ) internal {
        uint256 len = candidates.length;
        for (uint256 i; i < len; ++i) {
            if (rawDeltas[i] <= 0) continue;
            uint256 newCount = uint256(rawDeltas[i]);
            // Skip suspiciously large deltas — these aren't NFTs.
            if (newCount > MAX_ENUMERATE_PER_COLLECTION) continue;

            address token = candidates[i];
            // Standard ERC-721 Enumerable appends new tokens to the owner's
            // list, so the new tokenIds live at indices [before, after).
            for (uint256 idx = before_[i]; idx < after_[i]; ++idx) {
                (bool ok, bytes memory ret) = token.staticcall{gas: PROBE_GAS_LIMIT}(
                    abi.encodeWithSelector(
                        TOKEN_OF_OWNER_BY_INDEX_SELECTOR,
                        address(this),
                        idx
                    )
                );
                if (!ok || ret.length < 32) break; // not enumerable

                uint256 tokenId = abi.decode(ret, (uint256));
                if (_alreadyCaptured(token, tokenId)) continue;
                _pushReceived(token, tokenId, 1, 1);
            }
        }
    }

    /// @dev Avoid pushing the same (token, tokenId) twice when the receiver
    ///      hook ALSO captured it (e.g. _safeMint contracts that are also
    ///      Enumerable). O(n) but n is tiny in practice.
    function _alreadyCaptured(address token, uint256 tokenId) internal view returns (bool) {
        uint256 len = receivedNfts.length;
        for (uint256 i; i < len; ++i) {
            if (
                receivedNfts[i].token == token &&
                receivedNfts[i].tokenId == tokenId
            ) {
                return true;
            }
        }
        return false;
    }

    /// @dev staticcall nextTokenId(); returns NO_NEXT_TOKEN_ID if the contract
    ///      doesn't expose it (call reverts) or returns malformed data.
    function _tryNextTokenId(address token) internal view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall{gas: PROBE_GAS_LIMIT}(
            abi.encodeWithSelector(NEXT_TOKEN_ID_SELECTOR)
        );
        if (!ok || ret.length < 32) return NO_NEXT_TOKEN_ID;
        return abi.decode(ret, (uint256));
    }

    /// @dev staticcall ownerOf(uint256); returns address(0) on revert / bad data.
    function _tryOwnerOf(address token, uint256 tokenId) internal view returns (address) {
        (bool ok, bytes memory ret) = token.staticcall{gas: PROBE_GAS_LIMIT}(
            abi.encodeWithSelector(OWNER_OF_SELECTOR, tokenId)
        );
        if (!ok || ret.length < 32) return address(0);
        return abi.decode(ret, (address));
    }

    /**
     * @dev nextTokenId() fallback for counter-based ERC-721 contracts that
     *      don't fire the receiver hook AND don't implement ERC-721
     *      Enumerable. Uniswap V4 PositionManager is the canonical example.
     *
     *      For each candidate with a positive balance delta whose
     *      `nextTokenId()` advanced during the inner call, walks the new
     *      range `[nextBefore, nextAfter)` and pushes any tokenId currently
     *      owned by `address(this)` (the user) that wasn't already captured.
     *
     *      Bounded to MAX_ENUMERATE_PER_COLLECTION iterations per token to
     *      avoid pathological loops if a contract returns garbage.
     */
    function _enumerateViaNextTokenId(
        address[] calldata candidates,
        uint256[] memory nextBefore,
        int256[] memory rawDeltas
    ) internal {
        uint256 len = candidates.length;
        for (uint256 i; i < len; ++i) {
            if (rawDeltas[i] <= 0) continue;
            if (nextBefore[i] == NO_NEXT_TOKEN_ID) continue;

            address token = candidates[i];
            uint256 nextAfter = _tryNextTokenId(token);
            if (nextAfter == NO_NEXT_TOKEN_ID || nextAfter <= nextBefore[i]) continue;

            uint256 cap = nextBefore[i] + MAX_ENUMERATE_PER_COLLECTION;
            uint256 end = nextAfter < cap ? nextAfter : cap;
            for (uint256 id = nextBefore[i]; id < end; ++id) {
                address owner = _tryOwnerOf(token, id);
                if (owner != address(this)) continue;
                if (_alreadyCaptured(token, id)) continue;
                _pushReceived(token, id, 1, 1);
            }
        }
    }

    /**
     * @dev Walk receivedNfts and populate tokenUriRaw for each entry by
     *      staticcalling tokenURI(id) (ERC-721) or uri(id) (ERC-1155).
     *      Stores the raw return bytes — TS decodes the ABI-encoded string.
     *      Failures leave tokenUriRaw empty (the UI shows the placeholder).
     *
     *      Called AFTER the inner call so on-chain metadata generators see
     *      the post-tx state. This is critical for Uniswap V3/V4 positions
     *      whose SVGs render the current pool tick + price range.
     */
    function _captureTokenUris() internal {
        uint256 len = receivedNfts.length;
        for (uint256 i; i < len; ++i) {
            NftReceived storage entry = receivedNfts[i];
            bytes4 sel = entry.standard == 1 ? TOKEN_URI_SELECTOR : URI_SELECTOR;
            uint256 gasBudget = _metadataGasBudget();
            if (gasBudget == 0) break;
            (bool ok, bytes memory ret) = entry.token.staticcall{gas: gasBudget}(
                abi.encodeWithSelector(sel, entry.tokenId)
            );
            if (ok && ret.length > 0) {
                entry.tokenUriRaw = ret;
            }
        }
    }

    function _metadataGasBudget() internal view returns (uint256) {
        uint256 available = gasleft();
        if (available <= METADATA_RETURN_GAS_RESERVE) return 0;
        uint256 budget = available - METADATA_RETURN_GAS_RESERVE;
        return budget < METADATA_GAS_LIMIT ? budget : METADATA_GAS_LIMIT;
    }

    // -----------------------------------------------------------------------
    // ERC-165 — advertise receiver interface support so contracts that
    // pre-check supportsInterface() before calling safeTransferFrom proceed.
    // -----------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x150b7a02 || // ERC-721 receiver
            interfaceId == 0x4e2312e0;   // ERC-1155 receiver
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
