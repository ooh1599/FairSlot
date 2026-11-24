// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FairSlot} from "../FairSlot.sol";
import {MockD20Coordinator} from "./mocks/MockD20Coordinator.sol";

/// @dev Contract that cannot receive native tokens (used to prove change-transfer failure reverts).
contract NoReceiveOrganizer {
    function commit(FairSlot fs, bytes32 pid, bytes32 mh) external returns (bytes32) {
        return fs.commitEvent(pid, mh, "ipfs://x", 10, 1, 0, 1, 0, address(this));
    }

    function request(FairSlot fs, bytes32 id) external payable {
        fs.requestDraw{value: msg.value}(id);
    }
}

contract FairSlotTest is Test {
    // Golden-vector fixtures: keep in sync with shared/vectors.ts (docs/golden-vectors.json).
    address constant VECTOR_CONTRACT = 0x000000000000000000000000000000000000fA15;
    address constant ORGANIZER = 0x00000000000000000000000000000000000ABc01;
    bytes32 constant PUBLIC_EVENT_ID = keccak256("fs_0123456789abcdefghjk");
    bytes32 constant MANIFEST_HASH = 0x1111111111111111111111111111111111111111111111111111111111111111;
    bytes32 constant WORD = 0x9f2b6c1d77a3e5408b0c4d9e1a6f3b2c85d7e0a14c9b3f6e2d8a5c7b1e4f9a03;
    bytes32 constant VECTOR_EVENT_ID = 0xdfab65b79838d56a58000a259d743330374932dc6ad18f0cb325989639fc5a06;

    MockD20Coordinator coordinator;
    FairSlot fs;
    address stranger = address(0xBEEF);

    function setUp() public {
        vm.chainId(5042);
        vm.warp(1_800_000_000);
        coordinator = new MockD20Coordinator();
        deployCodeTo("FairSlot.sol:FairSlot", abi.encode(address(coordinator)), VECTOR_CONTRACT);
        fs = FairSlot(VECTOR_CONTRACT);
        vm.deal(ORGANIZER, 100 ether);
    }

    // ------------------------------------------------------------------ helpers

    function _commit(uint16 n, uint8 w, uint8 r) internal returns (bytes32 id) {
        vm.prank(ORGANIZER);
        id = fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "https://example.org/m.json", n, w, r, 1, 0, ORGANIZER);
    }

    function _request(bytes32 id) internal returns (uint256 requestId) {
        vm.prank(ORGANIZER);
        requestId = fs.requestDraw{value: 0.02 ether}(id);
    }

    function _run(uint16 n, uint8 w, uint8 r, uint256 firstRequestId) internal returns (bytes32 id) {
        coordinator.setNextRequestId(firstRequestId);
        id = _commit(n, w, r);
        uint256 reqId = _request(id);
        assertTrue(coordinator.fulfill(reqId, WORD));
    }

    function _finalizeAll(bytes32 id, uint8 batch) internal {
        while (true) {
            FairSlot.EventData memory e = fs.getEvent(id);
            if (e.state == FairSlot.State.FINALIZED) break;
            fs.finalize(id, batch);
        }
    }

    function _assertEq(uint32[] memory got, uint32[] memory want) internal pure {
        require(got.length == want.length, "length");
        for (uint256 i; i < got.length; ++i) {
            require(got[i] == want[i], "winner mismatch");
        }
    }

    // ------------------------------------------------------------------ golden vectors (match TypeScript)

    function test_eventIdMatchesTypeScript() public view {
        assertEq(fs.eventIdFor(ORGANIZER, PUBLIC_EVENT_ID), VECTOR_EVENT_ID);
    }

    function test_golden_small() public {
        bytes32 id = _run(100, 5, 3, 7);
        assertEq(fs.drawBase(5042, VECTOR_CONTRACT, id, MANIFEST_HASH, 7, WORD, 1),
            0x5fc904b9a6adf40aed6e666ea88081ca96f1b6c789bfd5167ed0a08caa417415);
        _finalizeAll(id, 25);
        uint32[] memory want = new uint32[](8);
        want[0] = 22; want[1] = 56; want[2] = 2; want[3] = 98; want[4] = 53; want[5] = 40; want[6] = 28; want[7] = 27;
        _assertEq(fs.getWinners(id), want);
    }

    function test_golden_fullPermutation() public {
        bytes32 id = _run(10, 7, 3, 8);
        _finalizeAll(id, 25);
        uint32[] memory want = new uint32[](10);
        want[0] = 1; want[1] = 6; want[2] = 9; want[3] = 5; want[4] = 2;
        want[5] = 7; want[6] = 8; want[7] = 0; want[8] = 4; want[9] = 3;
        _assertEq(fs.getWinners(id), want);
    }

    function test_golden_maxPicksOnTenThousand() public {
        bytes32 id = _run(10_000, 30, 20, 9);
        _finalizeAll(id, 25);
        uint32[50] memory w = [
            uint32(1642), 2907, 4502, 6672, 4089, 3111, 5234, 9275, 6410, 5441, 1735, 6773, 3469, 9008, 5590, 8021,
            4539, 8639, 6104, 5886, 4857, 1232, 9142, 1449, 947, 7255, 7414, 5922, 2358, 9425, 458, 4768, 3547,
            5385, 7719, 3691, 9941, 9900, 6474, 9933, 1110, 3849, 1437, 658, 3568, 5017, 4974, 4770, 2601, 5963
        ];
        uint32[] memory want = new uint32[](50);
        for (uint256 i; i < 50; ++i) want[i] = w[i];
        _assertEq(fs.getWinners(id), want);
    }

    function test_golden_singleEntry() public {
        bytes32 id = _run(1, 1, 0, 10);
        fs.finalize(id, 1);
        uint32[] memory want = new uint32[](1);
        want[0] = 0;
        _assertEq(fs.getWinners(id), want);
    }

    // ------------------------------------------------------------------ batch independence + properties

    function test_batchSizeDoesNotChangeResult() public {
        uint256[4] memory sizes = [uint256(1), 3, 7, 25];
        uint32[] memory firstResult;
        uint256 snap = vm.snapshotState();
        for (uint256 s; s < sizes.length; ++s) {
            vm.revertToState(snap); // fresh state each round
            snap = vm.snapshotState();
            bytes32 id = _run(10_000, 30, 20, 9);
            _finalizeAll(id, uint8(sizes[s]));
            if (s == 0) firstResult = fs.getWinners(id);
            else _assertEq(fs.getWinners(id), firstResult);
        }
    }

    function testFuzz_winnersDistinctAndInRange(bytes32 word, uint16 nRaw, uint8 wRaw, uint8 rRaw) public {
        uint16 n = uint16(bound(nRaw, 1, 10_000));
        uint8 w = uint8(bound(wRaw, 1, n < 50 ? n : 50));
        uint8 rMax = uint8((n < 50 ? n : 50) - w);
        uint8 r = rMax == 0 ? 0 : uint8(bound(rRaw, 0, rMax));
        coordinator.setNextRequestId(100);
        bytes32 id = _commit(n, w, r);
        uint256 reqId = _request(id);
        coordinator.fulfill(reqId, word);
        _finalizeAll(id, 25);
        uint32[] memory got = fs.getWinners(id);
        assertEq(got.length, uint256(w) + r);
        for (uint256 i; i < got.length; ++i) {
            assertLt(got[i], n);
            for (uint256 j = i + 1; j < got.length; ++j) assertTrue(got[i] != got[j]);
        }
    }

    function test_uniformAtIsInRangeAndStable() public view {
        bytes32 base = keccak256("x");
        for (uint256 range = 1; range < 200; ++range) {
            uint256 v = fs.uniformAt(base, 3, range);
            assertLt(v, range);
            assertEq(v, fs.uniformAt(base, 3, range));
        }
    }

    // ------------------------------------------------------------------ commit / cancel

    function test_commitStoresImmutableData() public {
        bytes32 id = _commit(100, 5, 3);
        FairSlot.EventData memory e = fs.getEvent(id);
        assertEq(e.organizer, ORGANIZER);
        assertEq(uint8(e.state), uint8(FairSlot.State.COMMITTED));
        assertEq(e.manifestHash, MANIFEST_HASH);
        assertEq(e.participantCount, 100);
        assertEq(e.winnerCount, 5);
        assertEq(e.reserveCount, 3);
        assertEq(e.refundRecipient, ORGANIZER);
        assertEq(fs.manifestURI(id), "https://example.org/m.json");
    }

    function test_commitRejectsBadParameters() public {
        vm.startPrank(ORGANIZER);
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 0, 1, 0, 1, 0, ORGANIZER); // no participants
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 10_001, 1, 0, 1, 0, ORGANIZER); // too many
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 100, 0, 0, 1, 0, ORGANIZER); // no winners
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 100, 30, 21, 1, 0, ORGANIZER); // > 50 picks
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 5, 3, 3, 1, 0, ORGANIZER); // picks > participants
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 100, 1, 0, 2, 0, ORGANIZER); // unknown algorithm
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, bytes32(0), "u", 100, 1, 0, 1, 0, ORGANIZER); // empty manifest hash
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 100, 1, 0, 1, 0, address(0)); // no refund recipient
        vm.expectRevert(FairSlot.InvalidParameters.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 100, 1, 0, 1, uint64(block.timestamp + 366 days), ORGANIZER);
        vm.expectRevert(FairSlot.ManifestUriTooLong.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "", 100, 1, 0, 1, 0, ORGANIZER);
        vm.stopPrank();
    }

    function test_commitTwiceReverts() public {
        _commit(10, 1, 0);
        vm.prank(ORGANIZER);
        vm.expectRevert(FairSlot.EventAlreadyExists.selector);
        fs.commitEvent(PUBLIC_EVENT_ID, bytes32(uint256(2)), "u", 10, 1, 0, 1, 0, ORGANIZER);
    }

    function test_otherOrganizerCannotSquatEventId() public {
        _commit(10, 1, 0);
        vm.prank(stranger);
        bytes32 other = fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 10, 1, 0, 1, 0, stranger);
        assertTrue(other != fs.eventIdFor(ORGANIZER, PUBLIC_EVENT_ID));
    }

    function test_cancelOnlyOrganizerBeforeRequest() public {
        bytes32 id = _commit(10, 1, 0);
        vm.prank(stranger);
        vm.expectRevert(FairSlot.NotOrganizer.selector);
        fs.cancelEvent(id);
        vm.prank(ORGANIZER);
        fs.cancelEvent(id);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.CANCELLED));
        vm.prank(ORGANIZER);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.WrongState.selector, FairSlot.State.CANCELLED));
        fs.requestDraw{value: 0.02 ether}(id);
    }

    function test_cannotCancelAfterRequest() public {
        bytes32 id = _commit(10, 1, 0);
        _request(id);
        vm.prank(ORGANIZER);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.WrongState.selector, FairSlot.State.RANDOMNESS_REQUESTED));
        fs.cancelEvent(id);
    }

    // ------------------------------------------------------------------ request

    function test_requestOnlyOrganizer() public {
        bytes32 id = _commit(10, 1, 0);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(FairSlot.NotOrganizer.selector);
        fs.requestDraw{value: 0.02 ether}(id);
    }

    function test_requestRespectsDrawNotBefore() public {
        vm.prank(ORGANIZER);
        bytes32 id = fs.commitEvent(PUBLIC_EVENT_ID, MANIFEST_HASH, "u", 10, 1, 0, 1, uint64(block.timestamp + 1 days), ORGANIZER);
        vm.prank(ORGANIZER);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.DrawNotOpenYet.selector, uint64(block.timestamp + 1 days)));
        fs.requestDraw{value: 0.02 ether}(id);
        vm.warp(block.timestamp + 1 days);
        _request(id);
    }

    function test_requestRejectsLowFeeAndReturnsChange() public {
        bytes32 id = _commit(10, 1, 0);
        vm.prank(ORGANIZER);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.InsufficientFee.selector, 0.02 ether, 0.01 ether));
        fs.requestDraw{value: 0.01 ether}(id);

        uint256 before = ORGANIZER.balance;
        vm.prank(ORGANIZER);
        fs.requestDraw{value: 0.05 ether}(id);
        assertEq(before - ORGANIZER.balance, 0.02 ether); // only the exact fee is spent
        assertEq(address(fs).balance, 0); // contract never holds funds
        assertEq(address(coordinator).balance, 0.02 ether);
    }

    function test_secondRequestReverts() public {
        bytes32 id = _commit(10, 1, 0);
        _request(id);
        vm.prank(ORGANIZER);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.WrongState.selector, FairSlot.State.RANDOMNESS_REQUESTED));
        fs.requestDraw{value: 0.02 ether}(id);
    }

    function test_changeTransferFailureReverts() public {
        NoReceiveOrganizer org = new NoReceiveOrganizer();
        bytes32 id = org.commit(fs, PUBLIC_EVENT_ID, MANIFEST_HASH);
        vm.deal(address(this), 1 ether);
        vm.expectRevert(FairSlot.ChangeTransferFailed.selector);
        org.request{value: 0.05 ether}(fs, id);
        // exact fee works
        org.request{value: 0.02 ether}(fs, id);
    }

    // ------------------------------------------------------------------ callback

    function test_callbackOnlyCoordinatorAndStoresWord() public {
        bytes32 id = _commit(10, 1, 0);
        uint256 reqId = _request(id);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OnlyCoordinator()"));
        fs.rawFulfillRandomness(reqId, WORD);

        uint256 gasBefore = gasleft();
        assertTrue(coordinator.fulfill(reqId, WORD));
        uint256 used = gasBefore - gasleft();
        emit log_named_uint("callback path gas (incl. mock)", used);
        assertLt(used, fs.CALLBACK_GAS());

        FairSlot.EventData memory e = fs.getEvent(id);
        assertEq(uint8(e.state), uint8(FairSlot.State.RANDOMNESS_RECEIVED));
        assertEq(e.randomWord, WORD);
    }

    function test_callbackUnknownRequestReverts() public {
        vm.prank(address(coordinator));
        vm.expectRevert(FairSlot.UnknownRequest.selector);
        fs.rawFulfillRandomness(999, WORD);
    }

    function test_callbackCannotOverwriteWord() public {
        bytes32 id = _commit(10, 1, 0);
        uint256 reqId = _request(id);
        coordinator.fulfill(reqId, WORD);
        vm.prank(address(coordinator));
        vm.expectRevert(FairSlot.RandomnessAlreadyAccepted.selector);
        fs.rawFulfillRandomness(reqId, bytes32(uint256(1234)));
        assertEq(fs.getEvent(id).randomWord, WORD);
    }

    // ------------------------------------------------------------------ finalize guards

    function test_finalizeBeforeRandomnessReverts() public {
        bytes32 id = _commit(10, 1, 0);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.WrongState.selector, FairSlot.State.COMMITTED));
        fs.finalize(id, 1);
        _request(id);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.WrongState.selector, FairSlot.State.RANDOMNESS_REQUESTED));
        fs.finalize(id, 1);
    }

    function test_finalizeBatchBounds() public {
        bytes32 id = _run(100, 5, 0, 1);
        vm.expectRevert(FairSlot.InvalidBatchSize.selector);
        fs.finalize(id, 0);
        vm.expectRevert(FairSlot.InvalidBatchSize.selector);
        fs.finalize(id, 26);
    }

    function test_finalizeProgressStatesAndPermissionless() public {
        bytes32 id = _run(100, 5, 3, 1);
        vm.prank(stranger);
        fs.finalize(id, 3);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.FINALIZING));
        assertEq(fs.getWinners(id).length, 3);
        vm.prank(stranger);
        fs.finalize(id, 25);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.FINALIZED));
        vm.expectRevert(abi.encodeWithSelector(FairSlot.WrongState.selector, FairSlot.State.FINALIZED));
        fs.finalize(id, 1);
    }

    function test_finalizeGasForMaxBatchIsBounded() public {
        bytes32 id = _run(10_000, 30, 20, 1);
        uint256 g = gasleft();
        fs.finalize(id, 25);
        uint256 used = g - gasleft();
        emit log_named_uint("finalize(25) gas, n=10000", used);
        assertLt(used, 3_000_000);
    }

    // ------------------------------------------------------------------ failure paths

    function test_markFailedBeforeDeadlineReverts() public {
        bytes32 id = _commit(10, 1, 0);
        _request(id);
        vm.expectRevert(FairSlot.RequestStillPending.selector);
        fs.markFailed(id);
    }

    function test_markFailedAfterDeadlineWithoutProof() public {
        bytes32 id = _commit(10, 1, 0);
        _request(id);
        vm.warp(block.timestamp + 61);
        fs.markFailed(id);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.FAILED));
        vm.expectRevert(abi.encodeWithSelector(FairSlot.WrongState.selector, FairSlot.State.FAILED));
        fs.finalize(id, 1);
    }

    function test_refundMarksFailedViaHook() public {
        bytes32 id = _commit(10, 1, 0);
        uint256 reqId = _request(id);
        vm.deal(address(coordinator), 1 ether);
        vm.warp(block.timestamp + 61);
        coordinator.refundRequest(reqId);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.FAILED));
    }

    function test_acceptedProofWithFailedCallbackIsNeverFailedAndRetriesSameWord() public {
        bytes32 id = _commit(10, 1, 0);
        uint256 reqId = _request(id);
        coordinator.setForcedFirstDeliveryGas(5_000); // callback runs out of gas, proof is still accepted
        assertFalse(coordinator.fulfill(reqId, WORD));
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.RANDOMNESS_REQUESTED));

        // before and after the 60 second deadline the event must not be failable: a proof was accepted
        vm.expectRevert(FairSlot.RequestStillPending.selector);
        fs.markFailed(id);
        vm.warp(block.timestamp + 10 days);
        vm.expectRevert(FairSlot.RequestStillPending.selector);
        fs.markFailed(id);

        // the same word is redelivered; no new randomness is ever requested
        coordinator.retryCallback(reqId, fs.CALLBACK_GAS());
        FairSlot.EventData memory e = fs.getEvent(id);
        assertEq(uint8(e.state), uint8(FairSlot.State.RANDOMNESS_RECEIVED));
        assertEq(e.randomWord, WORD);
        assertEq(e.requestId, reqId);
    }

    function test_lateFulfilledAfterFailedIsRejectedByCoordinatorAndHook() public {
        bytes32 id = _commit(10, 1, 0);
        uint256 reqId = _request(id);
        vm.warp(block.timestamp + 61);
        fs.markFailed(id);
        vm.expectRevert(bytes("RequestExpired"));
        coordinator.fulfill(reqId, WORD);
        // even a forged late callback cannot revive the event
        vm.prank(address(coordinator));
        vm.expectRevert(FairSlot.RandomnessAlreadyAccepted.selector);
        fs.rawFulfillRandomness(reqId, WORD);
    }
}

/// @dev Organizer that is a contract and tries to act again while receiving its change.
contract ReenteringOrganizer {
    FairSlot public immutable fs;
    bytes32 public id;
    bool public attemptCancel;

    constructor(FairSlot f) {
        fs = f;
    }

    function commit() external {
        id = fs.commitEvent(bytes32(uint256(77)), bytes32(uint256(1)), "https://example.org/m.json", 10, 1, 0, 1, 0, address(this));
    }

    function go(bool cancel) external payable {
        attemptCancel = cancel;
        fs.requestDraw{value: msg.value}(id);
    }

    receive() external payable {
        if (attemptCancel) fs.cancelEvent(id);
        else fs.requestDraw(id);
    }
}

contract FairSlotAdversarialTest is Test {
    FairSlot fs;
    MockD20Coordinator coordinator;

    function setUp() public {
        coordinator = new MockD20Coordinator();
        fs = new FairSlot(address(coordinator));
    }

    function test_changeCallbackCannotCancelOrRequestAgain() public {
        ReenteringOrganizer org = new ReenteringOrganizer(fs);
        org.commit();
        vm.deal(address(org), 1 ether);
        bytes32 id = org.id();
        // cancelling from inside the change transfer would dodge a result that was just requested: it must not work
        vm.expectRevert(FairSlot.ChangeTransferFailed.selector);
        org.go{value: 0.05 ether}(true);
        vm.expectRevert(FairSlot.ChangeTransferFailed.selector);
        org.go{value: 0.05 ether}(false);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.COMMITTED));
        assertEq(fs.getEvent(id).requestId, 0);
        assertEq(address(fs).balance, 0);
    }

    function testFuzz_requestDrawSpendsExactlyTheFee(uint96 extraRaw) public {
        uint256 extra = bound(extraRaw, 0, 500 ether);
        address organizer = address(0xABC123);
        vm.deal(organizer, 1000 ether);
        vm.prank(organizer);
        bytes32 id = fs.commitEvent(bytes32(uint256(5)), bytes32(uint256(6)), "https://example.org/m.json", 10, 1, 0, 1, 0, organizer);
        uint256 fee = coordinator.fee();
        uint256 before = organizer.balance;
        vm.prank(organizer);
        fs.requestDraw{value: fee + extra}(id);
        assertEq(before - organizer.balance, fee);
        assertEq(address(fs).balance, 0);
    }

    function testFuzz_onlyCoordinatorCanDeliver(address caller, bytes32 word) public {
        vm.assume(caller != address(coordinator));
        vm.prank(caller);
        vm.expectRevert();
        fs.rawFulfillRandomness(1, word);
        vm.prank(caller);
        vm.expectRevert();
        fs.onRefund(1);
    }
}
