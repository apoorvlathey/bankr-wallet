// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TxSimulator} from "../src/utils/TxSimulator.sol";

contract GasBurningBalanceProbeTarget {
    fallback() external payable {
        if (msg.sig == 0x70a08231) {
            while (true) {}
        }
    }
}

contract HeavyMetadataNft {
    function safeMint(address to, uint256 tokenId) external {
        (bool ok, bytes memory ret) = to.call(
            abi.encodeWithSelector(
                0x150b7a02,
                msg.sender,
                address(0),
                tokenId,
                ""
            )
        );
        require(ok && abi.decode(ret, (bytes4)) == 0x150b7a02, "unsafe receiver");
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        uint256 acc = tokenId ^ block.number;
        for (uint256 i; i < 3_000; ++i) {
            acc = uint256(keccak256(abi.encodePacked(acc, i)));
        }
        return acc == 0 ? "" : "data:application/json,{\"name\":\"Heavy Metadata\"}";
    }
}

contract HeavyMetadataMintTarget {
    function mint(address nft, uint256 tokenId) external {
        HeavyMetadataNft(nft).safeMint(msg.sender, tokenId);
    }
}

contract TxSimulatorTest is Test {
    function testNativeDeltaSurvivesGasBurningBalanceProbe() public {
        TxSimulator simulator = new TxSimulator();
        GasBurningBalanceProbeTarget target = new GasBurningBalanceProbeTarget();
        vm.deal(address(simulator), 1 ether);

        address[] memory candidates = new address[](1);
        candidates[0] = address(target);

        (
            bool success,
            int256 ethDelta,
            address[] memory tokens,
            int256[] memory deltas,
            TxSimulator.NftReceived[] memory nfts
        ) = simulator.simulate(address(target), 0.001 ether, hex"1234", candidates);

        assertTrue(success);
        assertEq(ethDelta, -int256(0.001 ether));
        assertEq(tokens.length, 0);
        assertEq(deltas.length, 0);
        assertEq(nfts.length, 0);
    }

    function testCapturesHeavyOnchainNftMetadata() public {
        TxSimulator simulator = new TxSimulator();
        HeavyMetadataNft nft = new HeavyMetadataNft();
        HeavyMetadataMintTarget target = new HeavyMetadataMintTarget();

        address[] memory candidates = new address[](1);
        candidates[0] = address(nft);

        bytes memory data = abi.encodeWithSelector(
            HeavyMetadataMintTarget.mint.selector,
            address(nft),
            1
        );

        (
            bool success,
            ,
            ,
            ,
            TxSimulator.NftReceived[] memory nfts
        ) = simulator.simulate(address(target), 0, data, candidates);

        assertTrue(success);
        assertEq(nfts.length, 1);
        assertGt(nfts[0].tokenUriRaw.length, 0);
    }
}
